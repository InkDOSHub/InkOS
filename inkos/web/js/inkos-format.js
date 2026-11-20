// .inkos v1: chunked, authenticated session container (spec: docs/INKOS-FORMAT.md).
// Web Crypto only: PBKDF2-HMAC-SHA-256 -> AES-GCM-256 (non-extractable key).
// Works in browsers, workers and Node >= 20 (globalThis.crypto + Blob).

export const MAGIC = new Uint8Array([0x49, 0x4e, 0x4b, 0x4f, 0x53, 0x00, 0x0d, 0x0a]); // "INKOS\0\r\n"
export const FORMAT_VERSION = 1;
export const KDF_PBKDF2_SHA256 = 1;
export const MIN_ITERATIONS = 600_000;
export const DEFAULT_CHUNK_SIZE = 1 << 20; // 1 MiB
export const HEADER_SIZE = 48;
const TAG_BYTES = 16;
const MAX_CHUNKS = 0xffffffff;

// One message for every failure after the header parses: wrong password and
// corruption must be indistinguishable.
export class InkosOpenError extends Error {
  constructor() {
    super("Não foi possível abrir a sessão: senha incorreta ou arquivo corrompido.");
    this.name = "InkosOpenError";
  }
}

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("Web Crypto (crypto.subtle) indisponível neste contexto.");
  return s;
};

export function encodeHeader({ iterations, salt, chunkSize, ivPrefix }) {
  const h = new Uint8Array(HEADER_SIZE);
  const dv = new DataView(h.buffer);
  h.set(MAGIC, 0);
  dv.setUint16(8, FORMAT_VERSION);
  h[10] = KDF_PBKDF2_SHA256;
  h[11] = 0;
  dv.setUint32(12, iterations);
  h.set(salt, 16); // 16 B
  dv.setUint32(32, chunkSize);
  h.set(ivPrefix, 36); // 8 B
  dv.setUint32(44, 0); // flags (reserved)
  return h;
}

export function decodeHeader(h) {
  if (h.byteLength < HEADER_SIZE) throw new Error("Arquivo .inkos truncado (cabeçalho).");
  for (let i = 0; i < MAGIC.length; i++) if (h[i] !== MAGIC[i]) throw new Error("Não é um arquivo .inkos.");
  const dv = new DataView(h.buffer, h.byteOffset, HEADER_SIZE);
  const version = dv.getUint16(8);
  if (version !== FORMAT_VERSION) throw new Error(`Versão .inkos ${version} não suportada (esperado ${FORMAT_VERSION}).`);
  if (h[10] !== KDF_PBKDF2_SHA256) throw new Error(`KDF ${h[10]} não suportado.`);
  const iterations = dv.getUint32(12);
  const chunkSize = dv.getUint32(32);
  if (iterations < MIN_ITERATIONS) throw new Error("Iterações PBKDF2 abaixo do mínimo.");
  if (chunkSize < 4096 || chunkSize > 16 << 20) throw new Error("Tamanho de chunk inválido.");
  return {
    version,
    iterations,
    salt: h.slice(16, 32),
    chunkSize,
    ivPrefix: h.slice(36, 44),
    flags: dv.getUint32(44),
  };
}

export async function deriveKey(password, salt, iterations) {
  const pw = new TextEncoder().encode(String(password));
  const base = await subtle().importKey("raw", pw, "PBKDF2", false, ["deriveKey"]);
  pw.fill(0);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Pick iterations so one derivation takes ~targetMs on this device (never below MIN_ITERATIONS).
export async function calibrateIterations(targetMs = 500) {
  const probe = 100_000;
  const t0 = performance.now();
  await deriveKey("calibrate", new Uint8Array(16), probe);
  const ms = Math.max(1, performance.now() - t0);
  const n = Math.round((probe * targetMs) / ms / 10_000) * 10_000;
  return Math.max(MIN_ITERATIONS, Math.min(n, 10_000_000));
}

function ivFor(prefix, index) {
  const iv = new Uint8Array(12);
  iv.set(prefix, 0);
  new DataView(iv.buffer).setUint32(8, index);
  return iv;
}

function aadFor(headerHash, index, final) {
  const aad = new Uint8Array(32 + 4 + 1);
  aad.set(headerHash, 0);
  new DataView(aad.buffer).setUint32(32, index);
  aad[36] = final ? 1 : 0;
  return aad;
}

// Re-chunks an async iterable of byte arrays into exact chunkSize pieces.
async function* rechunk(source, size) {
  let buf = new Uint8Array(size);
  let fill = 0;
  for await (const part of source) {
    let p = part instanceof Uint8Array ? part : new Uint8Array(part);
    while (p.byteLength) {
      const n = Math.min(size - fill, p.byteLength);
      buf.set(p.subarray(0, n), fill);
      fill += n;
      p = p.subarray(n);
      if (fill === size) {
        yield buf;
        buf = new Uint8Array(size);
        fill = 0;
      }
    }
  }
  yield buf.subarray(0, fill); // may be empty; the caller marks the last one final
}

// Encrypts a plaintext stream. Yields the header, then records:
// [u32 ciphertext length][ciphertext+tag]. Returns pieces suitable for new Blob(pieces).
export async function* encryptStream(source, password, { iterations = MIN_ITERATIONS, chunkSize = DEFAULT_CHUNK_SIZE } = {}) {
  if (!password) throw new Error("Senha obrigatória.");
  if (iterations < MIN_ITERATIONS) throw new Error(`Iterações mínimas: ${MIN_ITERATIONS}.`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ivPrefix = crypto.getRandomValues(new Uint8Array(8));
  const header = encodeHeader({ iterations, salt, chunkSize, ivPrefix });
  const headerHash = new Uint8Array(await subtle().digest("SHA-256", header));
  const key = await deriveKey(password, salt, iterations);
  yield header;

  let index = 0;
  let pending = null;
  for await (const chunk of rechunk(source, chunkSize)) {
    if (pending) {
      yield await sealRecord(key, ivPrefix, headerHash, index++, pending, false);
    }
    pending = chunk;
    if (index >= MAX_CHUNKS) throw new Error("Sessão grande demais para um único arquivo.");
  }
  yield await sealRecord(key, ivPrefix, headerHash, index, pending || new Uint8Array(0), true);
}

async function sealRecord(key, ivPrefix, headerHash, index, plain, final) {
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: ivFor(ivPrefix, index), additionalData: aadFor(headerHash, index, final) }, key, plain)
  );
  const rec = new Uint8Array(4 + ct.byteLength);
  new DataView(rec.buffer).setUint32(0, ct.byteLength);
  rec.set(ct, 4);
  return rec;
}

async function readSlice(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

// Decrypts a Blob/File chunk by chunk (Blob.slice, never the whole file in memory).
// Throws InkosOpenError on any authentication/structure failure, including
// truncation (no final chunk) and trailing garbage.
export async function* decryptBlob(blob, password) {
  const header = await readSlice(blob, 0, HEADER_SIZE);
  const meta = decodeHeader(header);
  const headerHash = new Uint8Array(await subtle().digest("SHA-256", header));
  const key = await deriveKey(password, meta.salt, meta.iterations);
  let pos = HEADER_SIZE;
  let index = 0;
  const maxCt = meta.chunkSize + TAG_BYTES;
  while (true) {
    if (pos + 4 > blob.size) throw new InkosOpenError();
    const len = new DataView((await readSlice(blob, pos, pos + 4)).buffer).getUint32(0);
    if (len < TAG_BYTES || len > maxCt || pos + 4 + len > blob.size) throw new InkosOpenError();
    const ct = await readSlice(blob, pos + 4, pos + 4 + len);
    pos += 4 + len;
    const final = pos === blob.size;
    let plain;
    try {
      plain = new Uint8Array(
        await subtle().decrypt({ name: "AES-GCM", iv: ivFor(meta.ivPrefix, index), additionalData: aadFor(headerHash, index, final) }, key, ct)
      );
    } catch {
      throw new InkosOpenError();
    }
    if (!final && plain.byteLength !== meta.chunkSize) throw new InkosOpenError();
    yield plain;
    if (final) return;
    index++;
  }
}

// Full authentication pass without keeping plaintext. Use before applying state.
export async function verifyBlob(blob, password) {
  let bytes = 0;
  for await (const p of decryptBlob(blob, password)) bytes += p.byteLength;
  return bytes;
}

// ---- Session payload: [u32 manifest length][manifest JSON][file bytes...] ----

export async function* sessionPayload(manifest, readFile) {
  const files = manifest.entries.filter((e) => e.type === "file");
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, json.byteLength);
  yield len;
  yield json;
  for (const f of files) {
    const bytes = await readFile(f.path);
    if (!bytes || bytes.byteLength !== f.size) throw new Error(`Arquivo mudou durante o congelamento: ${f.path}`);
    yield bytes;
  }
}

// Reads a session payload from decrypted chunks. Calls onManifest(manifest) once
// and onFile(entry, bytes) for each file, in manifest order.
export async function readSessionPayload(chunks, { onManifest, onFile }) {
  // Byte queue: take(n) copies exactly n bytes once (no quadratic re-buffering).
  const q = [];
  let qBytes = 0;
  const take = (n) => {
    const out = new Uint8Array(n);
    let off = 0;
    while (off < n) {
      const head = q[0];
      const k = Math.min(head.byteLength, n - off);
      out.set(head.subarray(0, k), off);
      off += k;
      if (k === head.byteLength) q.shift();
      else q[0] = head.subarray(k);
    }
    qBytes -= n;
    return out;
  };
  let manifest = null;
  let mlen = -1;
  let files = [];
  let fi = 0;
  for await (const p of chunks) {
    if (p.byteLength) {
      q.push(p);
      qBytes += p.byteLength;
    }
    while (true) {
      if (!manifest) {
        if (mlen < 0) {
          if (qBytes < 4) break;
          mlen = new DataView(take(4).buffer).getUint32(0);
        }
        if (qBytes < mlen) break;
        manifest = JSON.parse(new TextDecoder().decode(take(mlen)));
        files = manifest.entries.filter((e) => e.type === "file");
        await onManifest?.(manifest);
        continue;
      }
      if (fi >= files.length || qBytes < files[fi].size) break;
      await onFile?.(files[fi], take(files[fi].size));
      fi++;
    }
  }
  if (!manifest || fi !== files.length || qBytes !== 0) throw new InkosOpenError();
  return manifest;
}
