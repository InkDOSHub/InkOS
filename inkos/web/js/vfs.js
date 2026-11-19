// Sistema de Arquivos Virtual (VFS) do InkOS: OPFS com fallback para IndexedDB
const DB_NAME = "inkos-vfs-db";
const DB_VERSION = 1;
const STORE = "entries";
const CHANNEL_NAME = "inkos-vfs";

const DEFAULT_DIRS = ["/", "/Home", "/Documents", "/Downloads", "/Programs"];

function normalizePath(p) {
  if (!p) return "/";
  let s = String(p).trim().replace(/\\/g, "/");
  if (!s.startsWith("/")) s = "/" + s;
  const parts = s.split("/").filter(Boolean);
  const stack = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part !== ".") stack.push(part);
  }
  return "/" + stack.join("/");
}

function parentOf(path) {
  const n = normalizePath(path);
  if (n === "/") return "/";
  const idx = n.lastIndexOf("/");
  return idx <= 0 ? "/" : n.slice(0, idx);
}

function baseNameOf(path) {
  const n = normalizePath(path);
  if (n === "/") return "/";
  return n.slice(n.lastIndexOf("/") + 1);
}

function guessMime(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".log") || lower.endsWith(".sh") || lower.endsWith(".bat")) {
    return "text/plain;charset=utf-8";
  }
  if (lower.endsWith(".md")) return "text/markdown;charset=utf-8";
  if (lower.endsWith(".json")) return "application/json;charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html;charset=utf-8";
  if (lower.endsWith(".css")) return "text/css;charset=utf-8";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript;charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".exe")) return "application/x-msdownload";
  return "application/octet-stream";
}

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "path" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class VirtualFileSystem {
  constructor() {
    this.mode = "idb";
    this.opfsRoot = null;
    this.bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    this.listeners = new Set();
    if (this.bc) {
      this.bc.onmessage = () => this._emitLocal();
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emitLocal() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (_) {}
    }
  }

  _notifyChange() {
    this._emitLocal();
    try {
      this.bc?.postMessage({ type: "vfs-change", at: Date.now() });
    } catch (_) {}
  }

  async _idbPut(record) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async _idbGet(path) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(normalizePath(path));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async _idbDelete(path) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(normalizePath(path));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async _idbAll() {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async _syncOpfsFile(path, bytes) {
    if (!this.opfsRoot) return;
    try {
      const parts = normalizePath(path).split("/").filter(Boolean);
      if (!parts.length) return;
      let dir = this.opfsRoot;
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true });
      }
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const writable = await fh.createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch (_) {}
  }

  async _syncOpfsDir(path) {
    if (!this.opfsRoot) return;
    try {
      const parts = normalizePath(path).split("/").filter(Boolean);
      let dir = this.opfsRoot;
      for (const p of parts) {
        dir = await dir.getDirectoryHandle(p, { create: true });
      }
    } catch (_) {}
  }

  async _removeOpfsEntry(path) {
    if (!this.opfsRoot) return;
    try {
      const parts = normalizePath(path).split("/").filter(Boolean);
      if (!parts.length) return;
      let dir = this.opfsRoot;
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i]);
      }
      await dir.removeEntry(parts[parts.length - 1], { recursive: true });
    } catch (_) {}
  }

  async init() {
    if (typeof navigator !== "undefined" && navigator.storage?.getDirectory) {
      try {
        this.opfsRoot = await navigator.storage.getDirectory();
        this.mode = "opfs";
      } catch (_) {
        this.opfsRoot = null;
        this.mode = "idb";
      }
    }
    for (const d of DEFAULT_DIRS) {
      await this.mkdir(d, { silent: true });
    }
    const readme = await this._idbGet("/Home/bem-vindo.txt");
    if (!readme) {
      await this.writeText(
        "/Home/bem-vindo.txt",
        "InkOS VFS pronto.\nUse /Home, /Documents, /Downloads ou /Programs.\n",
        { silent: true }
      );
    }
    return this.mode;
  }

  async mkdir(dirPath, { silent = false } = {}) {
    const n = normalizePath(dirPath);
    if (n === "/") {
      await this._idbPut({
        path: "/",
        name: "/",
        parent: "/",
        type: "dir",
        size: 0,
        mime: "inode/directory",
        updatedAt: Date.now(),
      });
      return;
    }
    const parent = parentOf(n);
    if (parent !== "/") {
      await this.mkdir(parent, { silent: true });
    }
    await this._idbPut({
      path: n,
      name: baseNameOf(n),
      parent,
      type: "dir",
      size: 0,
      mime: "inode/directory",
      updatedAt: Date.now(),
    });
    await this._syncOpfsDir(n);
    if (!silent) this._notifyChange();
  }

  async writeBytes(filePath, bytes, mime, { silent = false } = {}) {
    const n = normalizePath(filePath);
    if (n === "/") throw new Error("Caminho inválido para arquivo: /");
    const u8 = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes || []);
    const parent = parentOf(n);
    await this.mkdir(parent, { silent: true });
    const resolvedMime = mime || guessMime(baseNameOf(n));
    await this._idbPut({
      path: n,
      name: baseNameOf(n),
      parent,
      type: "file",
      size: u8.byteLength,
      mime: resolvedMime,
      data: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength),
      updatedAt: Date.now(),
    });
    await this._syncOpfsFile(n, u8);
    if (!silent) this._notifyChange();
  }

  async writeText(filePath, text, opts = {}) {
    const enc = new TextEncoder().encode(String(text ?? ""));
    const mime = opts.mime || guessMime(baseNameOf(filePath));
    await this.writeBytes(filePath, enc, mime, opts);
  }

  async readBytes(filePath) {
    const rec = await this._idbGet(filePath);
    if (!rec || rec.type !== "file" || !rec.data) return null;
    return new Uint8Array(rec.data);
  }

  async readText(filePath) {
    const bytes = await this.readBytes(filePath);
    if (!bytes) return null;
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  async list(dirPath = "/") {
    const n = normalizePath(dirPath);
    const all = await this._idbAll();
    const children = all.filter((item) => item.path !== "/" && item.parent === n);
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });
    return children.map(({ data, ...meta }) => meta);
  }

  async remove(targetPath) {
    const n = normalizePath(targetPath);
    if (n === "/" || DEFAULT_DIRS.includes(n)) {
      throw new Error(`Diretório base protegido: ${n}`);
    }
    const all = await this._idbAll();
    const prefix = n + "/";
    for (const item of all) {
      if (item.path === n || item.path.startsWith(prefix)) {
        await this._idbDelete(item.path);
      }
    }
    await this._removeOpfsEntry(n);
    this._notifyChange();
  }

  async rename(oldPath, newName) {
    const src = normalizePath(oldPath);
    const cleanName = String(newName || "").trim().replace(/\//g, "");
    if (!cleanName || src === "/") return;
    const dst = normalizePath(`${parentOf(src)}/${cleanName}`);
    if (src === dst) return;

    const all = await this._idbAll();
    const prefix = src + "/";
    const matching = all.filter((item) => item.path === src || item.path.startsWith(prefix));

    for (const item of matching) {
      const nextPath = item.path === src ? dst : dst + item.path.slice(src.length);
      const nextParent = parentOf(nextPath);
      const nextName = baseNameOf(nextPath);
      await this._idbPut({
        ...item,
        path: nextPath,
        parent: nextParent,
        name: nextName,
        updatedAt: Date.now(),
      });
      if (item.type === "file" && item.data) {
        await this._syncOpfsFile(nextPath, new Uint8Array(item.data));
      } else if (item.type === "dir") {
        await this._syncOpfsDir(nextPath);
      }
      await this._idbDelete(item.path);
    }
    await this._removeOpfsEntry(src);
    this._notifyChange();
  }

  async toBlob(filePath) {
    const rec = await this._idbGet(filePath);
    if (!rec || rec.type !== "file") return null;
    const u8 = rec.data ? new Uint8Array(rec.data) : new Uint8Array(0);
    return new Blob([u8], { type: rec.mime || guessMime(rec.name) });
  }

  async toObjectUrl(filePath) {
    const blob = await this.toBlob(filePath);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  async download(filePath) {
    const rec = await this._idbGet(filePath);
    if (!rec || rec.type !== "file") return;
    const url = await this.toObjectUrl(filePath);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = rec.name || "arquivo";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async serveToHubApp(filePath, appId, openAppFn) {
    const rec = await this._idbGet(filePath);
    if (!rec || rec.type !== "file") return;
    const bytes = rec.data ? new Uint8Array(rec.data) : new Uint8Array(0);
    const mime = rec.mime || guessMime(rec.name);
    if (typeof openAppFn === "function") {
      await openAppFn(appId);
    }
    const payload = {
      type: "inkos-vfs-file",
      appId,
      path: rec.path,
      name: rec.name,
      mime,
      bytes,
    };
    setTimeout(() => {
      const frames = document.querySelectorAll("iframe");
      for (const fr of frames) {
        try {
          fr.contentWindow?.postMessage(payload, "*");
        } catch (_) {}
      }
    }, 250);
  }
}

export const vfs = new VirtualFileSystem();
