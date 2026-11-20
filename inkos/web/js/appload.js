// App loader: native InkOS apps + InkDOS Hub apps by reference.
// The Hub registry is read from the Hub (configurable URL). The service worker
// caches it stale-while-revalidate; ./apps/registry.json is the offline snapshot.
// Hub apps open lazily in cross-origin iframes; nothing from the Hub is copied here.
import { themeMessage, fileMessage, send, listen, DEFAULT_HUB_ORIGINS } from "./protocol.js";

export const DEFAULT_REGISTRY_URL = "https://hub.inkdos.workers.dev/InkOS/apps/registry.json";
export const MAX_HUB_INSTANCES = 4;
// Hub entries InkOS already has as its own apps (Terminal, CMD/EXE) or that are InkOS itself.
const HIDDEN_HUB_APPS = new Set(["inkos", "wine", "inksoc", "terminal", "alpine"]);

let wmInstance = null;
let defaultDesktop = null;
const nativeApps = new Map();
// InkOS apps whose engine is a Hub page: the window is InkOS's, the page inside has no
// chrome of its own (InkSoC: Windows programs; InkShell: Alpine Linux).
const frameApps = new Map();
let frameSeq = 0;
let registryPromise = null;
const hubOpenOrder = []; // window ids, oldest first

export function registryUrl() {
  try {
    const q = new URLSearchParams(location.search).get("hub");
    if (q) return new URL(q, location.href).href;
    const saved = localStorage.getItem("inkos-hub-registry");
    if (saved) return new URL(saved).href;
  } catch (_) {}
  return DEFAULT_REGISTRY_URL;
}

export function hubOrigins() {
  const set = new Set(DEFAULT_HUB_ORIGINS);
  try { set.add(new URL(registryUrl()).origin); } catch (_) {}
  return [...set];
}

export function bindWindowManager(wm) {
  wmInstance = wm;
}

export function registerNativeApp(id, config) {
  nativeApps.set(id, { id, ...config });
}

// path: relative to the Hub base (the registry's host). multi: each file opens its own window.
export function registerFrameApp(id, config) {
  frameApps.set(id, { id, ...config });
}

export function isFrameApp(id) {
  return frameApps.has(id);
}

function hubBase() {
  return new URL("/", registryUrl()).href;
}

function normalize(data, sourceUrl) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.apps) ? data.apps : [];
  const base = data?.base || new URL("/", sourceUrl).href;
  return list
    .filter((a) => a && typeof a.id === "string" && typeof a.href === "string")
    .map((a) => {
      const url = new URL(a.href, base);
      return { ...a, url: url.href, origin: url.origin, icon: a.icon ? new URL(a.icon, base).href : null };
    })
    .filter((a) => a.url.startsWith("https://") || a.origin === location.origin);
}

async function fetchJson(url) {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function loadHubRegistry({ refresh = false } = {}) {
  if (refresh) registryPromise = null;
  registryPromise ??= (async () => {
    const remote = registryUrl();
    try {
      const apps = normalize(await fetchJson(remote), remote);
      if (apps.length) return { apps, source: "hub", url: remote };
    } catch (err) {
      console.warn("[InkOS appload] Hub registry unavailable, using snapshot:", err.message);
    }
    const snap = new URL("./apps/registry.json", location.href).href;
    try {
      return { apps: normalize(await fetchJson(snap), DEFAULT_REGISTRY_URL), source: "snapshot", url: snap };
    } catch (err) {
      console.warn("[InkOS appload] registry snapshot unavailable:", err.message);
      return { apps: [], source: "none", url: null };
    }
  })();
  return registryPromise;
}

function currentFlavor() {
  return document.documentElement.dataset.theme === "latte" ? "latte" : "mocha";
}

export function syncTheme() {
  const msg = themeMessage(currentFlavor(), getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  for (const fr of document.querySelectorAll("iframe[data-hub-origin]")) {
    try {
      send(fr.contentWindow, fr.dataset.hubOrigin, msg);
    } catch (_) {}
  }
}

// Sends a VFS file to an open Hub app (inkos-vfs-file). Returns false if not open.
export function sendFileToApp(appId, { name, mime, bytes }) {
  const fr = document.querySelector(`.window[data-win-id="hub-${CSS.escape(appId)}"] iframe[data-hub-origin]`);
  if (!fr) return false;
  send(fr.contentWindow, fr.dataset.hubOrigin, fileMessage(name, mime, bytes));
  return true;
}

// A file waits until the app says inkos-ready (its listener is in place), or
// a fallback delay for apps that never say it.
const pendingFiles = new WeakMap();
function flushPendingFile(fr) {
  const file = pendingFiles.get(fr);
  if (!file) return;
  pendingFiles.delete(fr);
  try {
    send(fr.contentWindow, fr.dataset.hubOrigin, fileMessage(file.name, file.mime, file.bytes));
  } catch (e) {
    console.warn("[InkOS appload] file send failed:", e.message);
  }
}

let stopListening = null;
function ensureListener() {
  stopListening ??= listen(window, hubOrigins(), (msg, ev) => {
    const fr = [...document.querySelectorAll("iframe[data-hub-origin]")].find((f) => f.contentWindow === ev.source);
    if (!fr) return;
    if (msg.type === "inkos-ready") {
      syncTheme();
      flushPendingFile(fr);
    } else if (msg.type === "inkos-title") {
      const winId = fr.closest(".window")?.dataset.winId;
      if (winId) wmInstance?.setTitle(winId, msg.title);
    }
  });
}

function trackHubWindow(winId) {
  const i = hubOpenOrder.indexOf(winId);
  if (i >= 0) hubOpenOrder.splice(i, 1);
  hubOpenOrder.push(winId);
  while (hubOpenOrder.length > MAX_HUB_INSTANCES) {
    const oldest = hubOpenOrder.shift();
    wmInstance?.close(oldest);
  }
}

export async function openApp(appId, desktopEl, ctx = {}) {
  const desk = desktopEl || defaultDesktop || document.querySelector("#desktop");
  if (desk) defaultDesktop = desk;
  if (!wmInstance || !desk) return;

  const native = nativeApps.get(appId);
  if (native) {
    return wmInstance.createWindow({
      id: `native-${native.id}`,
      title: native.title || native.id,
      width: native.width || 780,
      height: native.height || 520,
      renderContent: (bodyEl) => native.mount?.(bodyEl, ctx),
    });
  }

  const frame = frameApps.get(appId);
  if (frame) {
    const url = new URL(frame.path, hubBase());
    if (ctx.file) url.searchParams.set("file", "1");
    // The first window is the app's own; a file for a multi-window app (a second program)
    // gets a window of its own, and a file for the others goes to the open window.
    const base = `frame-${appId}`;
    const winId = frame.multi && ctx.file && wmInstance.windows.has(base) ? `${base}-${++frameSeq}` : base;
    if (wmInstance.windows.has(winId) && ctx.file) {
      const fr = document.querySelector(`.window[data-win-id="${CSS.escape(winId)}"] iframe[data-hub-origin]`);
      if (fr) send(fr.contentWindow, fr.dataset.hubOrigin, fileMessage(ctx.file.name, ctx.file.mime, ctx.file.bytes));
    }
    return openFrameWindow(winId, { url: url.href, origin: url.origin, title: frame.title, width: frame.width, height: frame.height }, ctx);
  }

  const { apps } = await loadHubRegistry();
  const entry = apps.find((a) => a.id === appId);
  if (!entry) throw new Error(`App "${appId}" não está no registry do Hub.`);
  const winId = `hub-${appId}`;
  const existed = wmInstance.windows.has(winId);
  const body = openFrameWindow(winId, { url: entry.url, origin: entry.origin, title: entry.name || appId, width: entry.width, height: entry.height, tab: entry.tab }, ctx);
  if (existed && ctx.file) sendFileToApp(appId, ctx.file);
  return body;
}

// A window holding a Hub page (cross-origin iframe). A file in ctx waits for the page's inkos-ready.
function openFrameWindow(winId, { url, origin, title, width, height, tab }, ctx = {}) {
  ensureListener();
  const existed = wmInstance.windows.has(winId);
  const body = wmInstance.createWindow({
    id: winId,
    title,
    width: width || 900,
    height: height || 600,
    onClose: () => {
      const i = hubOpenOrder.indexOf(winId);
      if (i >= 0) hubOpenOrder.splice(i, 1);
    },
    renderContent: (bodyEl) => {
      const fr = document.createElement("iframe");
      fr.src = url;
      fr.dataset.hubOrigin = origin;
      fr.title = title;
      fr.loading = "lazy";
      fr.referrerPolicy = "no-referrer";
      // Cross-origin frame: allow-same-origin keeps the Hub app's own origin (its
      // storage), not ours. Permissions only for what Hub apps use.
      fr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads");
      fr.setAttribute("allow", "cross-origin-isolated; camera; microphone; clipboard-read; clipboard-write; fullscreen; autoplay; gamepad");
      fr.style.cssText = "width:100%;height:100%;border:0;background:var(--panel-solid);";
      if (ctx.file) pendingFiles.set(fr, ctx.file);
      fr.addEventListener("load", () => {
        syncTheme();
        if (pendingFiles.has(fr)) setTimeout(() => flushPendingFile(fr), 4000);
      });
      bodyEl.append(fr);
      if (tab) {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "hub-open-tab";
        a.textContent = "Abrir em aba";
        bodyEl.append(a);
      }
    },
  });
  if (!existed) trackHubWindow(winId);
  return body;
}

export function closeApp(appId) {
  if (!wmInstance) return;
  for (const id of [`native-${appId}`, `hub-${appId}`, `frame-${appId}`]) if (wmInstance.windows.has(id)) wmInstance.close(id);
}

export async function mountLauncher(gridEl, desktopEl, { filterText = "" } = {}) {
  if (desktopEl) defaultDesktop = desktopEl;
  const q = String(filterText || "").trim().toLowerCase();
  const { apps, source } = await loadHubRegistry();

  const items = [
    ...[...nativeApps.values(), ...frameApps.values()].map((n) => ({ id: n.id, name: n.label || n.title || n.id, kind: "Nativo", icon: null })),
    ...apps.filter((a) => !nativeApps.has(a.id) && !HIDDEN_HUB_APPS.has(a.id)).map((a) => ({ id: a.id, name: a.name || a.id, kind: source === "hub" ? "Hub" : "Hub (offline)", icon: a.icon })),
  ];
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q)) : items;

  gridEl.innerHTML = "";
  if (!filtered.length) {
    gridEl.innerHTML = `<div style="padding:16px;font-size:12.5px;color:var(--muted);">Nenhum aplicativo encontrado.</div>`;
    return;
  }
  for (const item of filtered) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-tile";
    btn.dataset.appId = item.id;
    const icon = document.createElement(item.icon ? "img" : "span");
    if (item.icon) {
      icon.src = item.icon;
      icon.alt = "";
      icon.width = icon.height = 28;
      // no-cors load: the Hub sends CORP cross-origin (enough under COEP require-corp), not CORS.
    } else {
      icon.innerHTML = `<svg width="24" height="24" aria-hidden="true"><use href="./icons.svg#i-window"></use></svg>`;
    }
    const name = document.createElement("span");
    name.textContent = item.name;
    const kind = document.createElement("small");
    kind.style.cssText = "font-size:10px;color:var(--muted);";
    kind.textContent = item.kind;
    btn.append(icon, name, kind);
    btn.onclick = () => openApp(item.id, defaultDesktop).catch((e) => console.error(e));
    gridEl.append(btn);
  }
}
