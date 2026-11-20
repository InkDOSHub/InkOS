// Encrypted sessions (.inkos v1) for InkOS. Format and crypto: js/inkos-format.js,
// spec: docs/INKOS-FORMAT.md. The password is never stored or logged.
import { encryptStream, decryptBlob, verifyBlob, sessionPayload, readSessionPayload, MIN_ITERATIONS, calibrateIterations } from "./inkos-format.js";

const SESSION_VFS_PATH = "/Home/session-snapshot.inkos";
const ITER_KEY = "inkos-pbkdf2-iterations";

// Local backoff between failed attempts (UX only, not a security boundary).
let failures = 0;
let lockedUntil = 0;
function checkBackoff() {
  const wait = lockedUntil - Date.now();
  if (wait > 0) throw new Error(`Aguarde ${Math.ceil(wait / 1000)} s antes de tentar novamente.`);
}
function noteResult(ok) {
  if (ok) { failures = 0; lockedUntil = 0; return; }
  failures++;
  lockedUntil = Date.now() + Math.min(30_000, 500 * 2 ** Math.min(failures, 6));
}

async function iterations() {
  try {
    const saved = Number(localStorage.getItem(ITER_KEY));
    if (saved >= MIN_ITERATIONS) return saved;
  } catch (_) {}
  const n = await calibrateIterations(500);
  try { localStorage.setItem(ITER_KEY, String(n)); } catch (_) {}
  return n;
}

async function buildManifest(vfs) {
  if (!vfs || typeof vfs._idbAll !== "function") throw new Error("Instância do VFS incompatível para snapshot.");
  const all = await vfs._idbAll();
  const entries = [];
  for (const item of all) {
    if (!item?.path || item.path === SESSION_VFS_PATH) continue;
    if (item.type === "dir") entries.push({ path: item.path, type: "dir" });
    else if (item.type === "file") {
      const bytes = await vfs.readBytes(item.path);
      entries.push({ path: item.path, type: "file", size: bytes?.byteLength || 0, mime: item.mime || "application/octet-stream", updatedAt: item.updatedAt || 0 });
    }
  }
  return {
    v: 1,
    createdAt: new Date().toISOString(),
    // RAM snapshot: the kernel keeps no guest RAM yet; UI state only.
    ram: { theme: document.documentElement.dataset.theme || "mocha" },
    entries,
  };
}

async function sealedBlob(vfs, password) {
  if (!password) throw new Error("Senha obrigatória para criptografar a sessão.");
  const manifest = await buildManifest(vfs);
  const pieces = [];
  const src = sessionPayload(manifest, async (p) => (await vfs.readBytes(p)) || new Uint8Array(0));
  for await (const piece of encryptStream(src, password, { iterations: await iterations() })) pieces.push(piece);
  return { blob: new Blob(pieces, { type: "application/x-inkos-session" }), manifest };
}

// Verifies the whole file first, then applies. Any failure before apply leaves state untouched.
async function openAndApply(vfs, blob, password) {
  checkBackoff();
  try {
    await verifyBlob(blob, password);
  } catch (e) {
    noteResult(false);
    throw e;
  }
  noteResult(true);
  return readSessionPayload(decryptBlob(blob, password), {
    onManifest: async (m) => {
      for (const e of m.entries) if (e.type === "dir") await vfs.mkdir(e.path);
      if (m.ram?.theme === "mocha" || m.ram?.theme === "latte") document.documentElement.dataset.theme = m.ram.theme;
    },
    onFile: (e, bytes) => vfs.writeBytes(e.path, bytes, e.mime || "application/octet-stream"),
  });
}

export async function encryptSessionBytes(vfs, password) {
  const { blob } = await sealedBlob(vfs, password);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function decryptAndRestoreSession(vfs, packedBytes, password) {
  if (!password) throw new Error("Senha obrigatória para descriptografar a sessão.");
  return openAndApply(vfs, new Blob([packedBytes]), password);
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

// Safari has no showSaveFilePicker: export through a[download] with a Blob.
export async function exportSessionFile(vfs, password, fileName = "sessao-inkos.inkos") {
  const { blob } = await sealedBlob(vfs, password);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".inkos") ? fileName : `${fileName}.inkos`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { fileName: a.download, bytes: blob.size };
}

// File is read with Blob.slice inside decryptBlob; never loaded whole.
export async function importSessionFile(vfs, file, password) {
  if (!file) throw new Error("Nenhum ficheiro .inkos selecionado.");
  if (!password) throw new Error("Senha obrigatória para descriptografar a sessão.");
  return openAndApply(vfs, file, password);
}
