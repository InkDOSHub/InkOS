const ITERATIONS = 600_000;

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function concat(...parts) {
  const length = parts.reduce((n, part) => n + part.byteLength, 0);
  const out = new Uint8Array(length);
  let pos = 0;
  for (const part of parts) { out.set(new Uint8Array(part), pos); pos += part.byteLength; }
  return out;
}

export async function suspend({ password, memory, opfsRoot, exportFile = false }) {
  if (!password) throw new Error("password required");
  const ram = new Uint8Array(memory.buffer.slice(0));
  const diskFile = await opfsRoot.getFileHandle("disk.img");
  const disk = new Uint8Array(await (await diskFile.getFile()).arrayBuffer());
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = concat(ram, disk);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const header = new TextEncoder().encode(JSON.stringify({ format: "inkos", version: 1, ramBytes: ram.byteLength, iterations: ITERATIONS, saltBytes: 16, ivBytes: 12 }));
  const blob = new Blob([Uint32Array.of(header.byteLength), header, salt, iv, new Uint8Array(encrypted)], { type: "application/octet-stream" });
  if (!exportFile) return blob;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = "session.inkos"; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return blob;
}

export async function wake(password, file, { memory, opfsRoot }) {
  if (!password) throw new Error("password required");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.slice(4, 4 + headerLength)));
  let pos = 4 + headerLength;
  if (header.format !== "inkos") throw new Error("invalid .inkos file");
  const salt = bytes.slice(pos, pos + header.saltBytes); pos += header.saltBytes;
  const iv = bytes.slice(pos, pos + header.ivBytes); pos += header.ivBytes;
  const key = await deriveKey(password, salt);
  let plaintext;
  try { plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, bytes.slice(pos))); }
  catch (_) { throw new Error("invalid password or corrupted session"); }
  if (plaintext.byteLength < header.ramBytes) throw new Error("corrupted session");
  new Uint8Array(memory.buffer).set(plaintext.slice(0, header.ramBytes));
  const disk = plaintext.slice(header.ramBytes);
  const diskHandle = await opfsRoot.getFileHandle("disk.img", { create: true });
  const sync = await diskHandle.createSyncAccessHandle();
  sync.truncate(0); sync.write(disk); sync.close();
  return header;
}
