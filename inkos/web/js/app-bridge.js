const CHANNEL = "inkos-app-events-v1";
const SAFE_NAME = /^[^\\/\\0]+$/;

export class AppBridge {
  constructor({ root = null } = {}) {
    this.rootPromise = root ? Promise.resolve(root) : navigator.storage.getDirectory();
    this.channel = new BroadcastChannel(CHANNEL); this.suspended = false; this.ports = new Set();
    this.channel.onmessage = ({ data }) => {
      if (data?.type === "suspend") { this.suspended = true; this.broadcast({ type: "inkos:suspend" }); }
      if (data?.type === "wake") { this.suspended = false; this.broadcast({ type: "inkos:wake" }); }
      if (data?.type === "theme") this.broadcast({ type: "inkos:theme", theme: data.theme });
    };
  }
  broadcast(message) { for (const port of this.ports) port.postMessage(message); }
  connect(frame, app) {
    const channel = new MessageChannel(); const port = channel.port1; this.ports.add(port);
    port.onmessage = async ({ data }) => {
      if (this.suspended && data?.type !== "inkos:dispose") { port.postMessage({ requestId: data.requestId, error: "session suspended" }); return; }
      try {
        if (data?.type === "inkos:ready") port.postMessage({ type: "inkos:theme", theme: this.theme(), app });
        else if (data?.type === "opfs:list") port.postMessage({ requestId: data.requestId, result: await this.list(data.path ?? "") });
        else if (data?.type === "opfs:read") port.postMessage({ requestId: data.requestId, result: await this.read(data.path) });
        else if (data?.type === "opfs:write") port.postMessage({ requestId: data.requestId, result: await this.write(data.path, data.bytes) });
        else if (data?.type === "inkos:dispose") { this.ports.delete(port); port.close(); }
      } catch (error) { port.postMessage({ requestId: data?.requestId, error: String(error.message ?? error) }); }
    };
    port.start();
    frame.addEventListener("load", () => frame.contentWindow.postMessage({ type: "inkos:connect" }, "*", [channel.port2]), { once: true });
    return port;
  }
  theme() {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(["base", "mantle", "crust", "text", "surface0", "surface1", "blue", "mauve", "green", "red"].map(name => [name, style.getPropertyValue(`--${name}`).trim()]));
  }
  async file(path) {
    const parts = String(path ?? "").split("/").filter(Boolean);
    if (!parts.length || parts.some(part => part === "." || part === ".." || !SAFE_NAME.test(part))) throw new Error("invalid OPFS path");
    let dir = await this.rootPromise;
    for (const name of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(name, { create: true });
    return { dir, name: parts.at(-1) };
  }
  async list(path = "") {
    let dir = await this.rootPromise;
    for (const name of String(path).split("/").filter(Boolean)) { if (name === "." || name === "..") throw new Error("invalid OPFS path"); dir = await dir.getDirectoryHandle(name); }
    const entries = []; for await (const [name, handle] of dir.entries()) entries.push({ name, kind: handle.kind }); return entries;
  }
  async read(path) { const { dir, name } = await this.file(path); const file = await (await dir.getFileHandle(name)).getFile(); return await file.arrayBuffer(); }
  async write(path, bytes) { const { dir, name } = await this.file(path); const handle = await dir.getFileHandle(name, { create: true }); const writable = await handle.createWritable(); await writable.write(bytes); await writable.close(); return true; }
  suspend() { this.channel.postMessage({ type: "suspend" }); }
  wake() { this.channel.postMessage({ type: "wake" }); }
  setTheme(theme) { this.channel.postMessage({ type: "theme", theme }); }
  close() { this.broadcast({ type: "inkos:dispose" }); this.channel.close(); }
}
