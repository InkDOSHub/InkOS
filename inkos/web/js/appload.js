// Abre os apps do InkDOS Hub dentro do InkOS (janela + iframe), sem copiar os ~300 MB.
// Registro: apps/registry.json { base, apps:[{id,name,href,icon,tab?}] }.
const ALLOW = "cross-origin-isolated; fullscreen; autoplay; camera; microphone; clipboard-read; clipboard-write; display-capture; gamepad; web-share";
const MAX_LIVE = 3;
let reg, z = 10;
const live = new Map();
const load = async () => reg ??= await (await fetch("apps/registry.json")).json();
const urlOf = (r, p) => new URL(p, r.base).href;

// Tema: Mocha -> dark, Latte -> light. O Hub (assets/tema.js) escuta a mensagem "ink-tema".
const themeOf = () => (document.documentElement.dataset.theme === "latte" ? "light" : "dark");
const tell = (frame) => {
  try { frame.contentWindow?.postMessage({ type: "ink-tema", theme: themeOf() }, new URL(reg.base).origin); } catch (_) {}
};
export const syncTheme = () => live.forEach((a) => tell(a.win.querySelector("iframe")));

export const listApps = async () => (await load()).apps;

function evict() {
  while (live.size >= MAX_LIVE) {
    const [id] = [...live].sort((a, b) => a[1].last - b[1].last)[0];
    closeApp(id);
  }
}

export function closeApp(id) {
  const a = live.get(id); if (!a) return;
  a.win.querySelector("iframe").src = "about:blank";
  a.win.remove(); live.delete(id);
}

export async function openApp(id, host = document.body) {
  const r = await load(), app = r.apps.find((x) => x.id === id);
  if (!app) throw new Error("app desconhecido: " + id);
  const url = urlOf(r, app.href);
  if (app.tab) return window.open(url, "inkdoshub-" + id) ?? (location.href = url);
  const hit = live.get(id);
  if (hit) { hit.last = performance.now(); hit.win.style.zIndex = ++z; return hit.win; }
  evict();

  const win = document.createElement("div");
  const full = innerWidth < 700;
  win.style.cssText = `position:absolute;top:0;left:0;z-index:${++z};display:flex;flex-direction:column;overflow:hidden;
    width:${full ? "100%" : "min(92vw,900px)"};height:${full ? "100%" : "min(80vh,640px)"};
    background:var(--mantle,#11111b);border:1px solid var(--surface0,#313244);border-radius:${full ? 0 : 10}px;will-change:transform`;
  let x = full ? 0 : 24 + live.size * 24, y = full ? 0 : 24 + live.size * 24, dx, dy, drag = false;
  const move = () => (win.style.transform = `translate3d(${x}px,${y}px,0)`);
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface0,#313244);color:var(--text,#cdd6f4);touch-action:none;user-select:none;font:13px system-ui";
  bar.innerHTML = `<span style="flex:1"></span><button aria-label="Fechar" style="all:unset;cursor:pointer;padding:2px 8px">✕</button>`;
  bar.firstChild.textContent = app.name;
  bar.querySelector("button").onclick = () => closeApp(id);
  bar.onpointerdown = (e) => { if (e.target.closest("button")) return; drag = true; dx = e.clientX - x; dy = e.clientY - y; win.style.zIndex = ++z; bar.setPointerCapture(e.pointerId); };
  bar.onpointermove = (e) => { if (drag && !full) { x = e.clientX - dx; y = e.clientY - dy; move(); } };
  bar.onpointerup = () => (drag = false);

  const f = Object.assign(document.createElement("iframe"), { src: url, allow: ALLOW, loading: "lazy" });
  f.style.cssText = "flex:1;border:0;width:100%;background:#000";
  f.addEventListener("load", () => tell(f));
  win.append(bar, f); host.append(win); move();
  live.set(id, { win, last: performance.now() });
  return win;
}

// Grade de ícones: mountLauncher(document.getElementById("grid"), host)
export async function mountLauncher(root, host = document.body) {
  const r = await load();
  root.style.cssText += ";display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:12px;padding:12px";
  for (const a of r.apps) {
    const b = document.createElement("button");
    b.style.cssText = "all:unset;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--text,#cdd6f4);font:12px system-ui;text-align:center";
    b.innerHTML = `<img width="48" height="48" alt="" loading="lazy"><span></span>`;
    b.firstChild.src = urlOf(r, a.icon); b.lastChild.textContent = a.name;
    b.onclick = () => openApp(a.id, host).catch(console.error);
    root.append(b);
  }
}
