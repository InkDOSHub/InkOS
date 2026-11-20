// InkOS <-> app postMessage protocol v1 (docs/PROTOCOL.md).
// Envelope: { v: 1, type, ...payload }. Known types only; everything else is dropped.

export const PROTOCOL_VERSION = 1;
export const DEFAULT_HUB_ORIGINS = ["https://hub.inkdos.workers.dev", "https://inkdoshub.github.io"];

const SCHEMAS = {
  "ink-tema": (m) =>
    (m.theme === "light" || m.theme === "dark") &&
    (m.flavor === undefined || m.flavor === "latte" || m.flavor === "mocha") &&
    (m.accent === undefined || (typeof m.accent === "string" && /^#[0-9a-fA-F]{3,8}$/.test(m.accent))),
  "inkos-vfs-file": (m) =>
    typeof m.name === "string" && m.name.length > 0 && m.name.length <= 255 && !/[\/\\]/.test(m.name) &&
    typeof m.mime === "string" && m.mime.length <= 255 &&
    m.data instanceof ArrayBuffer,
  "inkos-ready": (m) => m.app === undefined || (typeof m.app === "string" && m.app.length <= 64),
  // An app names what it shows (the InkSoC engine: the program in front); InkOS puts it in the title bar.
  "inkos-title": (m) => typeof m.title === "string" && m.title.length > 0 && m.title.length <= 128,
};

export function validate(msg) {
  if (!msg || typeof msg !== "object" || msg.v !== PROTOCOL_VERSION) return null;
  const check = SCHEMAS[msg.type];
  return check && check(msg) ? msg : null;
}

export function themeMessage(flavor, accent) {
  const m = { v: PROTOCOL_VERSION, type: "ink-tema", theme: flavor === "latte" ? "light" : "dark", flavor };
  if (accent && /^#[0-9a-fA-F]{3,8}$/.test(accent)) m.accent = accent;
  return m;
}

export function fileMessage(name, mime, bytes) {
  const data = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { v: PROTOCOL_VERSION, type: "inkos-vfs-file", name: String(name).split("/").pop(), mime: mime || "application/octet-stream", data };
}

// Sends to one frame with an explicit target origin. Never "*".
export function send(frameWindow, origin, msg) {
  if (!validate(msg)) throw new Error(`protocol: invalid message ${msg?.type}`);
  if (!origin || origin === "*" || origin === "null") throw new Error("protocol: explicit target origin required");
  const transfer = msg.type === "inkos-vfs-file" ? [msg.data] : [];
  frameWindow.postMessage(msg, origin, transfer);
}

// Listens for app messages from allowlisted origins only.
export function listen(target, allowedOrigins, handler) {
  const allowed = new Set(allowedOrigins);
  const fn = (event) => {
    if (!allowed.has(event.origin)) return;
    const msg = validate(event.data);
    if (msg) handler(msg, event);
  };
  target.addEventListener("message", fn);
  return () => target.removeEventListener("message", fn);
}
