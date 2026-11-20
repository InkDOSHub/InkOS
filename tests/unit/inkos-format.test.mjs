import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptStream, decryptBlob, verifyBlob, sessionPayload, readSessionPayload,
  InkosOpenError, HEADER_SIZE, MIN_ITERATIONS, decodeHeader,
} from "../../inkos/web/js/inkos-format.js";

const CHUNK = 64 * 1024; // small chunks keep tests fast; format allows >= 4 KiB
async function* from(...parts) { for (const p of parts) yield p; }
async function seal(bytes, pw = "senha-forte", opts = {}) {
  const pieces = [];
  for await (const p of encryptStream(from(bytes), pw, { chunkSize: CHUNK, ...opts })) pieces.push(p);
  return pieces;
}
async function open(blob, pw = "senha-forte") {
  const out = [];
  for await (const p of decryptBlob(blob, pw)) out.push(p);
  return Buffer.concat(out);
}
const rand = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(b.subarray(i, Math.min(n, i + 65536))); return b; };

test("round-trip (multi-chunk, exact multiple, empty)", async () => {
  for (const n of [0, 1, CHUNK, CHUNK * 3, CHUNK * 3 + 17]) {
    const data = rand(n);
    const blob = new Blob(await seal(data));
    assert.deepEqual(new Uint8Array(await open(blob)), data, `n=${n}`);
  }
});

test("header: version, kdf, iterations >= 600k, unique IV prefix and salt", async () => {
  const a = new Uint8Array((await seal(rand(10)))[0]);
  const b = new Uint8Array((await seal(rand(10)))[0]);
  const ha = decodeHeader(a), hb = decodeHeader(b);
  assert.equal(ha.version, 1);
  assert.ok(ha.iterations >= MIN_ITERATIONS);
  assert.notDeepEqual(ha.salt, hb.salt);
  assert.notDeepEqual(ha.ivPrefix, hb.ivPrefix);
  await assert.rejects(seal(rand(1), "x", { iterations: 1000 }), /mínimas/);
});

test("wrong password is indistinguishable from corruption", async () => {
  const blob = new Blob(await seal(rand(CHUNK * 2)));
  await assert.rejects(open(blob, "errada"), InkosOpenError);
});

test("1-bit tamper anywhere after header fails", async () => {
  const bytes = new Uint8Array(await new Blob(await seal(rand(CHUNK * 2 + 5))).arrayBuffer());
  for (const pos of [HEADER_SIZE + 4, HEADER_SIZE + 100, bytes.length - 1]) {
    const t = bytes.slice(); t[pos] ^= 1;
    await assert.rejects(open(new Blob([t])), InkosOpenError, `pos ${pos}`);
  }
  const h = bytes.slice(); h[20] ^= 1; // salt bit -> different key
  await assert.rejects(open(new Blob([h])), InkosOpenError);
  const it = bytes.slice(); it[15] ^= 1; // iterations field is authenticated via AAD
  await assert.rejects(open(new Blob([it])));
});

test("truncation (drop final record) and trailing bytes fail", async () => {
  const pieces = await seal(rand(CHUNK * 3));
  await assert.rejects(open(new Blob(pieces.slice(0, -1))), InkosOpenError);
  await assert.rejects(open(new Blob([...pieces, new Uint8Array([0, 0, 0, 0])])), InkosOpenError);
  const bytes = new Uint8Array(await new Blob(pieces).arrayBuffer());
  await assert.rejects(open(new Blob([bytes.subarray(0, bytes.length - 3)])), InkosOpenError);
});

test("chunk reordering fails", async () => {
  const pieces = await seal(rand(CHUNK * 3));
  // pieces: [header, r0, r1, r2(final)]
  await assert.rejects(open(new Blob([pieces[0], pieces[2], pieces[1], pieces[3]])), InkosOpenError);
});

test("unsupported version is rejected clearly", async () => {
  const pieces = await seal(rand(10));
  const h = new Uint8Array(pieces[0]); h[9] = 2;
  await assert.rejects(open(new Blob([h, ...pieces.slice(1)])), /Versão .inkos 2/);
});

test("session payload round-trip (manifest + files)", async () => {
  const files = { "/Home/a.txt": new TextEncoder().encode("ola"), "/Home/big.bin": rand(CHUNK * 2 + 9), "/Home/empty": new Uint8Array(0) };
  const manifest = {
    v: 1, createdAt: "2026-11-20T00:00:00Z", ram: null,
    entries: [{ path: "/Home", type: "dir" }, ...Object.entries(files).map(([path, b]) => ({ path, type: "file", size: b.byteLength, mime: "application/octet-stream" }))],
  };
  const pieces = [];
  for await (const p of encryptStream(sessionPayload(manifest, async (p) => files[p]), "pw", { chunkSize: CHUNK })) pieces.push(p);
  const blob = new Blob(pieces);
  await verifyBlob(blob, "pw");
  const got = {};
  const m = await readSessionPayload(decryptBlob(blob, "pw"), { onFile: (e, b) => { got[e.path] = b; } });
  assert.equal(m.entries.length, 4);
  for (const [p, b] of Object.entries(files)) assert.deepEqual(got[p], b, p);
});

test(">200 MB round-trip with bounded memory", { timeout: 240_000 }, async () => {
  const SIZE = 210 * 1024 * 1024;
  const part = rand(1 << 20);
  async function* gen() { for (let i = 0; i < SIZE / part.length; i++) yield part; }
  global.gc?.();
  const base = process.memoryUsage();
  let peakJs = 0;
  const sample = () => { const m = process.memoryUsage(); peakJs = Math.max(peakJs, m.heapUsed + m.arrayBuffers - base.heapUsed - base.arrayBuffers); };
  const pieces = [];
  let ctBytes = 0;
  for await (const p of encryptStream(gen(), "pw")) { ctBytes += p.byteLength; pieces.push(p); sample(); }
  // In browsers the Blob can be disk-backed; here we count only working memory.
  const blob = new Blob(pieces);
  pieces.length = 0;
  global.gc?.();
  const encPeak = peakJs;
  const base2 = process.memoryUsage();
  let peakDec = 0;
  let n = 0, ok = true;
  for await (const p of decryptBlob(blob, "pw")) {
    const ref = part.subarray(0, p.byteLength);
    if (Buffer.compare(Buffer.from(p.buffer, p.byteOffset, p.byteLength), Buffer.from(ref)) !== 0) ok = false;
    n += p.byteLength;
    if (n % (16 << 20) === 0) { const m = process.memoryUsage(); peakDec = Math.max(peakDec, m.heapUsed + m.arrayBuffers - base2.heapUsed - base2.arrayBuffers); }
  }
  assert.equal(n, SIZE);
  assert.ok(ok, "plaintext mismatch");
  console.log(`# 210 MiB: ciphertext ${ctBytes} B; encrypt peak ${(encPeak / 2 ** 20).toFixed(1)} MiB (incl. ciphertext held for Blob); decrypt working set ${(peakDec / 2 ** 20).toFixed(1)} MiB over blob`);
  assert.ok(peakDec < 64 * 2 ** 20, "decrypt working set must stay chunk-bounded");
});
