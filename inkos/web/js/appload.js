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
    if (msg.type === "inksoc-programs") {
      setWindowsPrograms(msg.programs);
      if (fr.dataset.listOnly) fr.remove();
      return;
    }
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
    if (ctx.run) url.searchParams.set("run", ctx.run);
    // The first window is the app's own; a file or an installed program for a multi-window
    // app gets a window of its own, and a file for the others goes to the open window.
    const base = `frame-${appId}`;
    const own = ctx.file || ctx.run;
    const winId = frame.multi && own && (ctx.run || wmInstance.windows.has(base)) ? `${base}-${++frameSeq}` : base;
    if (wmInstance.windows.has(winId) && ctx.file) {
      const fr = document.querySelector(`.window[data-win-id="${CSS.escape(winId)}"] iframe[data-hub-origin]`);
      if (fr) send(fr.contentWindow, fr.dataset.hubOrigin, fileMessage(ctx.file.name, ctx.file.mime, ctx.file.bytes));
    }
    return openFrameWindow(winId, { url: url.href, origin: url.origin, title: ctx.title || frame.title, width: frame.width, height: frame.height }, ctx);
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

/* ---------- Windows programs installed on the InkSoC drive C: ----------
   The engine page sends the list (inksoc-programs) whenever it loads or a program ends;
   Apps asks for it with a hidden engine frame (?list=1). Kept in localStorage so Apps shows
   the programs at once. */
const WIN_KEY = "inkos-win-programs";
let winPrograms = [];
try { winPrograms = JSON.parse(localStorage.getItem(WIN_KEY)) || []; } catch (_) {}
const programListeners = new Set();
function setWindowsPrograms(list) {
  winPrograms = list.map((p) => ({ name: p.name, path: p.path }));
  try { localStorage.setItem(WIN_KEY, JSON.stringify(winPrograms)); } catch (_) {}
  for (const fn of programListeners) fn(winPrograms);
}
export function windowsPrograms() {
  return winPrograms.slice();
}
let lastRefresh = 0;
export function refreshWindowsPrograms() {
  const engine = frameApps.get("cmdexe");
  if (!engine || Date.now() - lastRefresh < 5000) return;
  lastRefresh = Date.now();
  ensureListener();
  const url = new URL(engine.path, hubBase());
  url.searchParams.set("list", "1");
  const fr = document.createElement("iframe");
  fr.src = url.href;
  fr.dataset.hubOrigin = url.origin;
  fr.dataset.listOnly = "1";
  fr.title = "InkSoC programs";
  fr.setAttribute("sandbox", "allow-scripts allow-same-origin");
  fr.setAttribute("aria-hidden", "true");
  fr.tabIndex = -1;
  fr.style.cssText = "position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none;";
  document.body.append(fr);
  setTimeout(() => fr.remove(), 20000);
}
export function openWindowsProgram(path, name, desktopEl) {
  return openApp("cmdexe", desktopEl, { run: path, title: name });
}

// Apps, like Launchpad / the Start menu: big icons with the name below, in sections
// (InkOS, Windows programs, InkDOS Hub), and a search over all of them.
export async function mountLauncher(gridEl, desktopEl, { filterText = "" } = {}) {
  if (desktopEl) defaultDesktop = desktopEl;
  const q = String(filterText || "").trim().toLowerCase();
  const match = (name, id = "") => !q || name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
  const render = async () => {
    const { apps, source } = await loadHubRegistry();
    const sections = [
      {
        title: "InkOS",
        items: [...nativeApps.values(), ...frameApps.values()]
          .map((n) => ({ id: n.id, name: n.label || n.title || n.id, iconId: n.iconId || "i-window", open: () => openApp(n.id, defaultDesktop) })),
      },
      {
        title: "Programas Windows",
        empty: "Nenhum ainda. Abra um instalador .exe pelo Finder; o programa aparece aqui.",
        items: winPrograms.map((p) => ({ id: p.path, name: p.name, iconId: "i-exe", hint: p.path, open: () => openWindowsProgram(p.path, p.name, defaultDesktop) })),
      },
      {
        title: source === "hub" ? "InkDOS Hub" : "InkDOS Hub (offline)",
        items: apps.filter((a) => !nativeApps.has(a.id) && !frameApps.has(a.id) && !HIDDEN_HUB_APPS.has(a.id))
          .map((a) => ({ id: a.id, name: a.name || a.id, icon: a.icon, open: () => openApp(a.id, defaultDesktop) })),
      },
    ];
    gridEl.replaceChildren();
    let shown = 0;
    for (const sec of sections) {
      const items = sec.items.filter((i) => match(i.name, i.id));
      if (!items.length && (q || !sec.empty)) continue;
      const h = document.createElement("h3");
      h.className = "app-section";
      h.textContent = sec.title;
      const grid = document.createElement("div");
      grid.className = "app-tiles";
      if (!items.length) {
        const p = document.createElement("p");
        p.className = "app-empty";
        p.textContent = sec.empty;
        grid.append(p);
      }
      for (const item of items) {
        shown++;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "app-tile";
        btn.dataset.appId = item.id;
        if (item.hint) btn.title = item.hint;
        const icon = document.createElement("span");
        icon.className = "app-icon";
        if (item.icon) {
          const img = document.createElement("img");
          img.src = item.icon;
          img.alt = "";
          img.loading = "lazy";
          // no-cors load: the Hub sends CORP cross-origin (enough under COEP require-corp), not CORS.
          icon.append(img);
        } else {
          icon.innerHTML = `<svg width="30" height="30" aria-hidden="true"><use href="./icons.svg#${item.iconId}"></use></svg>`;
        }
        const name = document.createElement("span");
        name.className = "app-name";
        name.textContent = item.name;
        btn.append(icon, name);
        btn.onclick = () => Promise.resolve(item.open()).catch((e) => console.error(e));
        grid.append(btn);
      }
      gridEl.append(h, grid);
    }
    if (!shown && q) {
      const p = document.createElement("p");
      p.className = "app-empty";
      p.textContent = "Nenhum aplicativo encontrado.";
      gridEl.append(p);
    }
  };
  await render();
  // a list that arrives while Apps is open shows at once
  programListeners.clear();
  programListeners.add(() => { if (gridEl.isConnected && !gridEl.closest("[hidden]")) render().catch(console.error); });
  refreshWindowsPrograms();
}
