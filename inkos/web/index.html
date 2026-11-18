export class SessionManager {
  async deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async suspendAndExport(password, ramSnapshot) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);

    const root = await navigator.storage.getDirectory();
    const files = {};
    for await (const [name, handle] of root.entries()) {
      if (handle.kind === "file" && name !== "swap.bin") {
        const buf = await (await handle.getFile()).arrayBuffer();
        files[name] = Array.from(new Uint8Array(buf));
      }
    }

    const payload = new TextEncoder().encode(
      JSON.stringify({
        ts: Date.now(),
        ramSample: Array.from(ramSnapshot.slice(0, 16384)),
        files
      })
    );

    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload));
    const out = new Uint8Array(16 + 12 + cipher.length);
    out.set(salt, 0);
    out.set(iv, 16);
    out.set(cipher, 28);
    return new Blob([out], { type: "application/octet-stream" });
  }

  async wakeFromBlob(password, blob) {
    const raw = new Uint8Array(await blob.arrayBuffer());
    const salt = raw.slice(0, 16);
    const iv = raw.slice(16, 28);
    const cipher = raw.slice(28);
    const key = await this.deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    const state = JSON.parse(new TextDecoder().decode(plain));

    const root = await navigator.storage.getDirectory();
    for (const [name, bytes] of Object.entries(state.files || {})) {
      const fh = await root.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(new Uint8Array(bytes));
      await w.close();
    }
    return state;
  }
}
