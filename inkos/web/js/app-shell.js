const requests = new Map(); let sequence = 0; let bridge;
const workerRefs = new Set();
const NativeWorker = window.Worker;
window.Worker = class InkOSManagedWorker extends NativeWorker {
  constructor(...args) { super(...args); workerRefs.add(this); }
};

function request(type, payload = {}) {
  if (!bridge) return Promise.reject(new Error("InkOS bridge not connected"));
  const requestId = ++sequence;
  return new Promise((resolve, reject) => { requests.set(requestId, { resolve, reject }); bridge.postMessage({ type, requestId, ...payload }); });
}

window.addEventListener("message", (event) => {
  if (event.data?.type !== "inkos:connect" || !event.ports[0]) return;
  bridge = event.ports[0]; bridge.onmessage = ({ data }) => {
    if (data.requestId && requests.has(data.requestId)) {
      const pending = requests.get(data.requestId); requests.delete(data.requestId);
      data.error ? pending.reject(new Error(data.error)) : pending.resolve(data.result);
    }
    if (data.type === "inkos:theme") applyTheme(data.theme);
    if (data.type === "inkos:suspend") { document.documentElement.dataset.suspended = "true"; window.dispatchEvent(new Event("inkos:suspend")); }
    if (data.type === "inkos:wake") { delete document.documentElement.dataset.suspended; window.dispatchEvent(new Event("inkos:wake")); }
    if (data.type === "inkos:dispose") dispose();
  };
  bridge.start(); bridge.postMessage({ type: "inkos:ready" });
}, { once: false });
function applyTheme(theme) { for (const [name, value] of Object.entries(theme ?? {})) document.documentElement.style.setProperty(`--${name}`, value); }
function dispose() { for (const worker of workerRefs) worker.terminate(); workerRefs.clear(); bridge?.close(); }
window.addEventListener("pagehide", dispose, { once: true });
export const inkos = Object.freeze({ list: path => request("opfs:list", { path }), read: path => request("opfs:read", { path }), write: (path, bytes) => request("opfs:write", { path, bytes }), onSuspend: fn => addEventListener("inkos:suspend", fn), onWake: fn => addEventListener("inkos:wake", fn) });
