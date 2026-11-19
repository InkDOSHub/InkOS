// Sistema de Arquivos Interno do InkOS (OPFS com fallback IndexedDB + Bridge com Hub)
const DB_NAME = "inkos-vfs-db";
const STORE = "files";
const ch = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("inkos-vfs") : null;

function normPath(p = "/") {
  const parts = String(p || "/")
    .replace(/\\/g, "/")
    .split("/")
    .filter((x) => x && x !== ".");
  const stack = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return "/" + stack.join("/");
}

function guessMime(name = "") {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map = {
    txt: "text/plain;charset=utf-8",
    md: "text/markdown;charset=utf-8",
    json: "application/json;charset=utf-8",
    js: "text/javascript;charset=utf-8",
    html: "text/html;charset=utf-8",
    css: "text/css;charset=utf-8",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    exe: "application/x-msdownload",
    zip: "application/zip",
  };
  return map[ext] || "application/octet-stream";
}

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
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

class InkVFS {
  constructor() {
    this.opfsRoot = null;
    this.mode = "idb";
    this.listeners = new Set();
    if (ch) {
      ch.onmessage = () => this._emit();
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) {
      try { fn(); } catch (_) {}
    }
    ch?.postMessage({ type: "vfs-changed" });
  }

  async init() {
    try {
      if (navigator.storage?.getDirectory) {
        this.opfsRoot = await navigator.storage.getDirectory();
        this.mode = "opfs";
      }
    } catch (_) {
      this.mode = "idb";
    }
    await this.mkdir("/Home");
    await this.mkdir("/Documents");
    await this.mkdir("/Downloads");
    await this.mkdir("/Programs");

    const welcome = "/Home/bem-vindo.txt";
    if (!(await this.exists(welcome))) {
      await this.writeText(
        welcome,
        "Bem-vindo ao InkOS!\n\nArquivos salvos aqui ficam na memória interna do navegador (OPFS / IndexedDB)\ne podem ser abertos no Finder, Terminal, CMD/.exe ou enviados aos apps do Hub.\n"
      );
    }
  }

  async _idbPut(entry) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async _idbGet(path) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(path);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async _idbDelete(path) {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(path);
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

  async mkdir(dirPath) {
    const p = normPath(dirPath);
    if (p === "/") return;
    if (this.mode === "opfs" && this.opfsRoot) {
      const parts = p.split("/").filter(Boolean);
      let cur = this.opfsRoot;
      for (const part of parts) {
        cur = await cur.getDirectoryHandle(part, { create: true });
      }
    }
    const existing = await this._idbGet(p);
    if (!existing) {
      await this._idbPut({ path: p, name: p.split("/").pop(), type: "dir", updatedAt: Date.now(), size: 0 });
      this._emit();
    }
  }

  async exists(path) {
    const p = normPath(path);
    return Boolean(await this._idbGet(p));
  }

  async writeBytes(path, bytes, mime) {
    const p = normPath(path);
    const parent = p.split("/").slice(0, -1).join("/") || "/";
    if (parent !== "/") await this.mkdir(parent);
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const name = p.split("/").pop();
    const typeMime = mime || guessMime(name);

    if (this.mode === "opfs" && this.opfsRoot) {
      try {
        const parts = p.split("/").filter(Boolean);
        let dir = this.opfsRoot;
        for (const seg of parts.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(seg, { create: true });
        }
        const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        if (typeof fh.createWritable === "function") {
          const w = await fh.createWritable();
          await w.write(u8);
          await w.close();
        }
      } catch (_) {}
    }

    await this._idbPut({
      path: p,
      name,
      type: "file",
      mime: typeMime,
      size: u8.byteLength,
      updatedAt: Date.now(),
      data: u8,
    });
    this._emit();
  }

  async writeText(path, text) {
    const enc = new TextEncoder();
    await this.writeBytes(path, enc.encode(String(text)), "text/plain;charset=utf-8");
  }

  async readBytes(path) {
    const p = normPath(path);
    const entry = await this._idbGet(p);
    if (!entry || entry.type !== "file") return null;
    if (entry.data instanceof Uint8Array) return entry.data;
    if (entry.data instanceof ArrayBuffer) return new Uint8Array(entry.data);
    return new Uint8Array(entry.data || []);
  }

  async readText(path) {
    const bytes = await this.readBytes(path);
    if (!bytes) return null;
    return new TextDecoder().decode(bytes);
  }

  async list(dirPath = "/") {
    const dir = normPath(dirPath);
    const all = await this._idbAll();
    const prefix = dir === "/" ? "/" : dir + "/";
    const items = [];

    for (const item of all) {
      if (item.path === dir || !item.path.startsWith(prefix)) continue;
      const rest = item.path.slice(prefix.length);
      if (!rest.includes("/")) {
        items.push({
          path: item.path,
          name: item.name || rest,
          type: item.type,
          size: item.size || 0,
          mime: item.mime || guessMime(item.name || rest),
          updatedAt: item.updatedAt || 0,
        });
      }
    }

    return items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async remove(path) {
    const p = normPath(path);
    const all = await this._idbAll();
    const targets = all.filter((x) => x.path === p || x.path.startsWith(p + "/"));
    for (const t of targets) {
      await this._idbDelete(t.path);
    }
    if (this.mode === "opfs" && this.opfsRoot) {
      try {
        const parts = p.split("/").filter(Boolean);
        let dir = this.opfsRoot;
        for (const seg of parts.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(seg);
        }
        await dir.removeEntry(parts[parts.length - 1], { recursive: true });
      } catch (_) {}
    }
    this._emit();
  }

  async rename(oldPath, newName) {
    const src = normPath(oldPath);
    const parent = src.split("/").slice(0, -1).join("/") || "/";
    const dst = normPath(`${parent}/${newName}`);
    if (src === dst) return;
    const entry = await this._idbGet(src);
    if (!entry) return;
    await this._idbPut({ ...entry, path: dst, name: newName, updatedAt: Date.now() });
    await this._idbDelete(src);
    this._emit();
  }

  async toBlob(path) {
    const p = normPath(path);
    const entry = await this._idbGet(p);
    if (!entry || entry.type !== "file") return null;
    const bytes = await this.readBytes(p);
    return new Blob([bytes], { type: entry.mime || guessMime(entry.name) });
  }

  async toObjectUrl(path) {
    const blob = await this.toBlob(path);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  }

  async download(path) {
    const p = normPath(path);
    const blob = await this.toBlob(p);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = p.split("/").pop() || "arquivo";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // Serve arquivo da memória interna para um app do Hub e envia via postMessage + Blob URL
  async serveToHubApp(path, appId, openAppFn) {
    const p = normPath(path);
    const blob = await this.toBlob(p);
    if (!blob) throw new Error("Arquivo não encontrado: " + p);
    const buf = await blob.arrayBuffer();
    const url = URL.createObjectURL(blob);
    const winEl = await openAppFn?.(appId);
    const iframe = winEl?.querySelector?.("iframe");
    const payload = {
      type: "inkos-vfs-file",
      path: p,
      name: p.split("/").pop(),
      mime: blob.type,
      blobUrl: url,
      buffer: buf,
    };
    window.__inkOSLastSharedFile = payload;
    if (iframe?.contentWindow) {
      setTimeout(() => {
        try { iframe.contentWindow.postMessage(payload, "*", [buf]); } catch (_) {}
      }, 350);
    }
    return payload;
  }
}

export const vfs = new InkVFS();
