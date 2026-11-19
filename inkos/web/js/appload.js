// Carregador de apps do InkOS (Hub via iframe/aba + apps nativos no WM com resize)
const ALLOW =
  "cross-origin-isolated; fullscreen; autoplay; camera; microphone; clipboard-read; clipboard-write; display-capture; gamepad; web-share";
const MAX_LIVE = 3;

let reg = null;
let wmRef = null;
const nativeApps = new Map(); // id -> { title, icon, width, height, mount(container, ctx) }
const liveFrames = new Map(); // id -> { winEl, iframe, last }

export function bindWindowManager(wm) {
  wmRef = wm;
}

export function registerNativeApp(id, spec) {
  nativeApps.set(id, spec);
}

async function loadRegistry() {
  if (reg) return reg;
  const res = await fetch("./apps/registry.json");
  reg = await res.json();
  return reg;
}

function urlOf(r, p) {
  if (/^https?:\/\//i.test(p)) return p;
  return new URL(p, r.base).href;
}

function themeOf() {
  const t = document.documentElement.dataset.theme;
  return t === "latte" || t === "light" ? "light" : "dark";
}

function tellIframeTheme(iframe) {
  try {
    const baseOrigin = reg?.base ? new URL(reg.base).origin : "*";
    iframe?.contentWindow?.postMessage({ type: "ink-tema", theme: themeOf() }, baseOrigin);
  } catch (_) {}
}

export function syncTheme() {
  for (const entry of liveFrames.values()) {
    tellIframeTheme(entry.iframe);
  }
}

export async function listApps() {
  const r = await loadRegistry();
  return r.apps || [];
}

function evictHubFrames() {
  while (liveFrames.size >= MAX_LIVE) {
    const oldest = [...liveFrames.entries()].sort((a, b) => a[1].last - b[1].last)[0];
    if (!oldest) break;
    const [oldId] = oldest;
    if (wmRef) {
      wmRef.close(`hub-${oldId}`);
    } else {
      closeApp(oldId);
    }
  }
}

export function closeApp(id) {
  const entry = liveFrames.get(id);
  if (entry) {
    try { entry.iframe.src = "about:blank"; } catch (_) {}
    liveFrames.delete(id);
  }
  wmRef?.close(`hub-${id}`);
  wmRef?.close(`native-${id}`);
}

export async function openApp(id, host = document.querySelector("#desktop") || document.body, extraCtx = {}) {
  // 1) App nativo do InkOS (Finder, Browser, CMD/EXE, etc.)
  if (nativeApps.has(id)) {
    const spec = nativeApps.get(id);
    const winId = `native-${id}`;
    if (!wmRef) throw new Error("WindowManager não vinculado ao appload");
    if (wmRef.windows.has(winId)) {
      wmRef.focus(winId);
      return wmRef.windows.get(winId).el;
    }
    const container = document.createElement("div");
    container.style.cssText = "flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto;";
    const cleanup = await spec.mount(container, {
      openApp: (targetId, ctx) => openApp(targetId, host, ctx),
      closeApp: () => wmRef.close(winId),
      ...extraCtx,
    });
    return wmRef.createWindow({
      id: winId,
      title: spec.title || id,
      icon: spec.icon || "◰",
      width: spec.width || 820,
      height: spec.height || 540,
      bodyEl: container,
      onClose: () => {
        if (typeof cleanup === "function") cleanup();
      },
    });
  }

  // 2) App do InkDOS Hub via registry.json
  const r = await loadRegistry();
  const app = (r.apps || []).find((x) => x.id === id);
  if (!app) throw new Error("app desconhecido: " + id);

  const url = urlOf(r, app.href);
  if (app.tab) {
    return window.open(url, "inkdoshub-" + id) ?? (location.href = url);
  }

  const winId = `hub-${id}`;
  if (liveFrames.has(id) && wmRef?.windows.has(winId)) {
    liveFrames.get(id).last = performance.now();
    wmRef.focus(winId);
    return liveFrames.get(id).winEl;
  }

  evictHubFrames();

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.allow = ALLOW;
  iframe.loading = "lazy";
  iframe.style.cssText = "flex:1;width:100%;height:100%;border:0;background:var(--bg);";
  iframe.addEventListener("load", () => tellIframeTheme(iframe));

  const winEl = wmRef
    ? wmRef.createWindow({
        id: winId,
        title: app.name,
        icon: "◰",
        width: 860,
        height: 580,
        bodyEl: iframe,
        onClose: () => {
          try { iframe.src = "about:blank"; } catch (_) {}
          liveFrames.delete(id);
        },
      })
    : (() => {
        const d = document.createElement("div");
        d.style.cssText = "position:absolute;inset:24px;display:flex;flex-direction:column;background:var(--panel-solid);border:1px solid var(--border);border-radius:12px;overflow:hidden;z-index:50;";
        d.append(iframe);
        host.append(d);
        return d;
      })();

  liveFrames.set(id, { winEl, iframe, last: performance.now() });
  return winEl;
}

export async function mountLauncher(root, host = document.querySelector("#desktop") || document.body, { filterText = "" } = {}) {
  const r = await loadRegistry();
  const q = filterText.trim().toLowerCase();
  const items = (r.apps || []).filter((a) => !q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q));

  root.innerHTML = "";
  root.style.cssText =
    "display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:12px;padding:8px;overflow:auto;flex:1;";

  for (const a of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.style.cssText =
      "appearance:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border-radius:12px;border:1px solid transparent;background:var(--surface);color:var(--text);font-size:11.5px;text-align:center;";
    b.onmouseenter = () => (b.style.borderColor = "var(--border-strong)");
    b.onmouseleave = () => (b.style.borderColor = "transparent");

    const img = document.createElement("img");
    img.width = 40;
    img.height = 40;
    img.alt = "";
    img.loading = "lazy";
    img.src = urlOf(r, a.icon);
    img.style.cssText = "object-fit:contain;border-radius:8px;";

    const lbl = document.createElement("span");
    lbl.textContent = a.name;
    lbl.style.cssText = "line-height:1.2;word-break:break-word;";

    b.append(img, lbl);
    b.onclick = () => openApp(a.id, host).catch(console.error);
    root.append(b);
  }
}
