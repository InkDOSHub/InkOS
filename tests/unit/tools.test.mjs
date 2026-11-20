import { test } from "node:test";
import assert from "node:assert/strict";
import { search, rename, sync } from "../../inkos/web/js/tools.js";

function memVfs(files) {
  const m = new Map(); // path -> {type, data, updatedAt}
  const parent = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
  const add = (p, data, t = Date.now()) => {
    for (let d = parent(p); d !== "/" && !m.has(d); d = parent(d)) m.set(d, { type: "dir" });
    m.set(p, data === null ? { type: "dir" } : { type: "file", data, updatedAt: t });
  };
  for (const [p, v] of Object.entries(files)) add(p, v.data ?? v, v.t);
  return {
    m,
    async list(dir) {
      return [...m].filter(([p]) => parent(p) === dir).map(([p, v]) => ({ path: p, name: p.split("/").pop(), type: v.type, size: v.data?.byteLength, updatedAt: v.updatedAt }));
    },
    async readBytes(p) { return m.get(p)?.data ?? null; },
    async writeBytes(p, d) { add(p, d); },
    async mkdir(p) { if (!m.has(p)) add(p, null); },
    async rename(from, name) { const v = m.get(from); m.delete(from); m.set(parent(from) + "/" + name, v); },
  };
}
const b = (n) => new Uint8Array(n);

test("search by size, age and extension", async () => {
  const now = Date.now();
  const v = memVfs({ "/H/a.pdf": { data: b(2 << 20), t: now }, "/H/b.pdf": { data: b(10), t: now }, "/H/s/c.PDF": { data: b(3 << 20), t: now - 40 * 86400000 }, "/H/d.txt": b(5 << 20) });
  assert.deepEqual((await search(v, "/H", { minMB: 1, ext: "pdf" })).map((h) => h.path).sort(), ["/H/a.pdf", "/H/s/c.PDF"]);
  assert.deepEqual((await search(v, "/H", { minMB: 1, ext: "pdf", days: 30, now })).map((h) => h.path), ["/H/a.pdf"]);
});

test("rename: preview changes nothing; numbering; collisions get a suffix", async () => {
  const v = memVfs({ "/H/IMG_1.jpg": b(1), "/H/IMG_2.jpg": b(1), "/H/foto_1.jpg": b(1), "/H/sub/IMG_3.jpg": b(1) });
  const plan = await rename(v, "/H", { find: "IMG_", to: "foto_" }, { preview: true });
  assert.ok(v.m.has("/H/IMG_1.jpg"));
  assert.deepEqual(plan.map((p) => p.to).sort(), ["foto_1 (2).jpg", "foto_2.jpg"]);
  await rename(v, "/H", { to: "Viagem", number: true });
  assert.ok(v.m.has("/H/sub/IMG_3.jpg"), "subfolders untouched");
  assert.ok([...v.m.keys()].includes("/H/Viagem 001.jpg"));
});

test("sync copies new/changed, never deletes, refuses dest inside source", async () => {
  const v = memVfs({ "/A/x.txt": new Uint8Array([1]), "/A/d/y.txt": new Uint8Array([2]), "/B/x.txt": new Uint8Array([9]), "/B/keep.txt": b(1) });
  const pre = await sync(v, "/A", "/B", { preview: true });
  assert.equal(pre.length, 2);
  assert.equal((await v.readBytes("/B/x.txt"))[0], 9);
  await sync(v, "/A", "/B");
  assert.equal((await v.readBytes("/B/x.txt"))[0], 1);
  assert.equal((await v.readBytes("/B/d/y.txt"))[0], 2);
  assert.ok(v.m.has("/B/keep.txt"));
  assert.deepEqual(await sync(v, "/A", "/B"), []);
  await assert.rejects(sync(v, "/A", "/A/sub"));
});
