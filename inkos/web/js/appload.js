// Lazy-loader de apps Wasm. Registro: apps/registry.json
const MAX_LIVE = 3;
const live = new Map();
let registry, chain = Promise.resolve();

const getRegistry = async () => registry ??= await (await fetch("apps/registry.json")).json();

async function instantiate(id, imports) {
  const url = `apps/${id}/app.wasm`;
  try { return (await WebAssembly.instantiateStreaming(fetch(url), imports)).instance; }
  catch {
    const buf = await (await fetch(url)).arrayBuffer();
    return (await WebAssembly.instantiate(buf, imports)).instance;
  }
}

function evict() {
  while (live.size >= MAX_LIVE) {
    const [id, a] = [...live].sort((x, y) => x[1].last - y[1].last)[0];
    a.unmount?.(); a.el?.remove(); live.delete(id);
  }
}

export const openApp = (id, host, kernel) => chain = chain.then(async () => {
  const hit = live.get(id);
  if (hit) { hit.last = performance.now(); return hit; }
  const meta = (await getRegistry()).apps.find((a) => a.id === id);
  if (!meta) throw new Error("app desconhecido: " + id);
  evict();
  const el = Object.assign(document.createElement("div"), { className: "app-root" });
  host.append(el);
  const inst = await instantiate(id, { env: { memory: kernel?.memory }, ink: kernel?.syscalls ?? {} });
  const ui = meta.ui ? await import(`../apps/${id}/${meta.ui}`) : null;
  const app = { id, inst, el, last: performance.now(), unmount: ui?.mount?.(el, inst, kernel) };
  live.set(id, app);
  return app;
}).catch((e) => { console.error("[appload]", e); throw e; });

export const closeApp = (id) => { const a = live.get(id); if (a) { a.unmount?.(); a.el.remove(); live.delete(id); } };
