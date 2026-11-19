// Carregador de aplicativos nativos do InkOS e apps do InkDOS Hub (registry.json)
let wmInstance = null;
let defaultDesktop = null;
const nativeApps = new Map();
let hubRegistryCache = null;

export function bindWindowManager(wm) {
  wmInstance = wm;
}

export function registerNativeApp(id, config) {
  nativeApps.set(id, { id, ...config });
}

export async function loadHubRegistry() {
  if (hubRegistryCache) return hubRegistryCache;
  try {
    const res = await fetch("./apps/registry.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.apps) ? data.apps : [];
    hubRegistryCache = list;
    return list;
  } catch (err) {
    console.warn("[InkOS appload] registry.json indisponível:", err);
    return [];
  }
}

export function syncTheme() {
  const theme = document.documentElement.dataset.theme === "latte" ? "latte" : "mocha";
  const frames = document.querySelectorAll("iframe");
  for (const fr of frames) {
    try {
      fr.contentWindow?.postMessage({ type: "ink-tema", theme }, "*");
    } catch (_) {}
  }
}

export async function openApp(appId, desktopEl, ctx = {}) {
  const desk = desktopEl || defaultDesktop || document.querySelector("#desktop");
  if (desk) defaultDesktop = desk;
  if (!wmInstance || !desk) return;

  const native = nativeApps.get(appId);
  if (native) {
    const winId = `native-${native.id}`;
    return wmInstance.createWindow({
      id: winId,
      title: native.title || native.id,
      width: native.width || 780,
      height: native.height || 520,
      renderContent: (bodyEl) => native.mount?.(bodyEl, ctx),
    });
  }

  const registry = await loadHubRegistry();
  const entry = registry.find((a) => a && (a.id === appId || a.slug === appId));
  const winId = `hub-${appId}`;
  const url = entry?.url || entry?.entry || `./apps/${appId}/index.html`;
  const title = entry?.name || entry?.title || `Hub — ${appId}`;

  return wmInstance.createWindow({
    id: winId,
    title,
    width: entry?.width || 860,
    height: entry?.height || 560,
    renderContent: (bodyEl) => {
      bodyEl.innerHTML = `<iframe src="${url}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals" style="width:100%;height:100%;border:0;background:var(--panel-solid);"></iframe>`;
      const iframe = bodyEl.querySelector("iframe");
      iframe?.addEventListener("load", () => syncTheme(), { once: true });
    },
  });
}

export function closeApp(appId) {
  if (!wmInstance) return;
  if (wmInstance.windows.has(`native-${appId}`)) {
    wmInstance.close(`native-${appId}`);
  }
  if (wmInstance.windows.has(`hub-${appId}`)) {
    wmInstance.close(`hub-${appId}`);
  }
}

export async function mountLauncher(gridEl, desktopEl, { filterText = "" } = {}) {
  if (desktopEl) defaultDesktop = desktopEl;
  const q = String(filterText || "").trim().toLowerCase();
  const registry = await loadHubRegistry();

  const allItems = [
    ...Array.from(nativeApps.values()).map((n) => ({
      id: n.id,
      name: n.title || n.id,
      kind: "Nativo",
    })),
    ...registry
      .filter((a) => a && a.id && !nativeApps.has(a.id))
      .map((a) => ({
        id: a.id,
        name: a.name || a.title || a.id,
        kind: "Hub",
      })),
  ];

  const filtered = q
    ? allItems.filter((item) => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))
    : allItems;

  gridEl.innerHTML = "";
  if (!filtered.length) {
    gridEl.innerHTML = `<div style="padding:16px;font-size:12.5px;color:var(--muted);">Nenhum aplicativo encontrado.</div>`;
    return;
  }

  for (const item of filtered) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-tile";
    btn.innerHTML = `
      <svg width="24" height="24" aria-hidden="true"><use href="./icons.svg#i-window"></use></svg>
      <span>${item.name}</span>
      <small style="font-size:10px;color:var(--muted);">${item.kind}</small>
    `;
    btn.onclick = () => {
      openApp(item.id, defaultDesktop).catch(console.error);
    };
    gridEl.append(btn);
  }
}
