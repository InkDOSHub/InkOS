// Gestão de sessão criptografada (.inkos) com PBKDF2 + AES-GCM 256-bit para o InkOS
const MAGIC = new Uint8Array([0x49, 0x4e, 0x4b, 0x31]); // "INK1"
const PBKDF2_ITERATIONS = 250000;
const SESSION_VFS_PATH = "/Home/session-snapshot.inkos";

function concatBytes(...chunks) {
  const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    const view = c instanceof Uint8Array ? c : new Uint8Array(c);
    out.set(view, offset);
    offset += view.byteLength;
  }
  return out;
}

async function deriveAesKey(password, salt, usages) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API (crypto.subtle) indisponível neste contexto.");
  }
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(password)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

async function collectVfsSnapshot(vfs, { maxFileBytes = 8 * 1024 * 1024 } = {}) {
  if (!vfs || typeof vfs._idbAll !== "function") {
    throw new Error("Instância do VFS incompatível para snapshot.");
  }
  const all = await vfs._idbAll();
  const entries = [];
  for (const item of all) {
    if (!item?.path || item.path === SESSION_VFS_PATH) continue;
    if (item.type === "dir") {
      entries.push({ path: item.path, name: item.name, type: "dir" });
      continue;
    }
    if (item.type === "file") {
      const bytes = await vfs.readBytes(item.path);
      if (!bytes || bytes.byteLength > maxFileBytes) continue;
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      entries.push({
        path: item.path,
        name: item.name,
        type: "file",
        mime: item.mime || "application/octet-stream",
        updatedAt: item.updatedAt || Date.now(),
        dataB64: btoa(binary),
      });
    }
  }
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    theme: document.documentElement.dataset.theme || "mocha",
    entries,
  };
}

async function restoreVfsSnapshot(vfs, snapshot) {
  if (!vfs || !snapshot || !Array.isArray(snapshot.entries)) {
    throw new Error("Snapshot de sessão inválido.");
  }
  for (const entry of snapshot.entries) {
    if (entry.type === "dir") {
      await vfs.mkdir(entry.path);
    } else if (entry.type === "file") {
      const binary = atob(entry.dataB64 || "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      await vfs.writeBytes(entry.path, bytes, entry.mime || "application/octet-stream");
    }
  }
  if (snapshot.theme === "mocha" || snapshot.theme === "latte") {
    document.documentElement.dataset.theme = snapshot.theme;
  }
}

export async function encryptSessionBytes(vfs, password, opts = {}) {
  if (!password) throw new Error("Senha obrigatória para criptografar a sessão.");
  const snapshot = await collectVfsSnapshot(vfs, opts);
  const plain = new TextEncoder().encode(JSON.stringify(snapshot));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, ["encrypt"]);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plain
  );
  return concatBytes(MAGIC, salt, iv, new Uint8Array(cipherBuf));
}

export async function decryptAndRestoreSession(vfs, packedBytes, password) {
  if (!password) throw new Error("Senha obrigatória para descriptografar a sessão.");
  const u8 = packedBytes instanceof Uint8Array ? packedBytes : new Uint8Array(packedBytes);
  const headerLen = MAGIC.length + 16 + 12;
  if (u8.byteLength <= headerLen) {
    throw new Error("Ficheiro .inkos inválido ou truncado.");
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (u8[i] !== MAGIC[i]) {
      throw new Error("Assinatura mágica .inkos inválida.");
    }
  }
  const salt = u8.slice(MAGIC.length, MAGIC.length + 16);
  const iv = u8.slice(MAGIC.length + 16, headerLen);
  const cipher = u8.slice(headerLen);
  const key = await deriveAesKey(password, salt, ["decrypt"]);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher
  );
  const jsonText = new TextDecoder().decode(plainBuf);
  const snapshot = JSON.parse(jsonText);
  await restoreVfsSnapshot(vfs, snapshot);
  return snapshot;
}

export async function freezeSessionToVfs(vfs, password, targetPath = SESSION_VFS_PATH) {
  const packed = await encryptSessionBytes(vfs, password);
  await vfs.writeBytes(targetPath, packed, "application/x-inkos-session");
  return { path: targetPath, bytes: packed.byteLength };
}

export async function wakeSessionFromVfs(vfs, password, sourcePath = SESSION_VFS_PATH) {
  const packed = await vfs.readBytes(sourcePath);
  if (!packed) throw new Error(`Sessão não encontrada em ${sourcePath}.`);
  return decryptAndRestoreSession(vfs, packed, password);
}

export async function exportSessionFile(vfs, password, fileName = "sessao-inkos.inkos") {
  const packed = await encryptSessionBytes(vfs, password);
  const blob = new Blob([packed], { type: "application/x-inkos-session" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".inkos") ? fileName : `${fileName}.inkos`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { fileName: a.download, bytes: packed.byteLength };
}

export async function importSessionFile(vfs, file, password) {
  if (!file) throw new Error("Nenhum ficheiro .inkos selecionado.");
  const buf = new Uint8Array(await file.arrayBuffer());
  return decryptAndRestoreSession(vfs, buf, password);
}
