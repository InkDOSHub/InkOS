// File tools for the InkOS VFS, reimplemented from the observed behaviour of the
// Hub's inkmenu.py jobs (search, rename, sync). No code was copied.
// Every job that changes files supports a preview that changes nothing.

const MB = 1024 * 1024;
const DAY = 86_400_000;

async function walk(vfs, dir, out = []) {
  for (const item of await vfs.list(dir)) {
    out.push(item);
    if (item.type === "dir") await walk(vfs, item.path, out);
  }
  return out;
}

// search: files under `dir` bigger than minMB, changed in the last `days`, with extension `ext`.
export async function search(vfs, dir, { minMB = 0, days = 0, ext = "", now = Date.now() } = {}) {
  const want = String(ext).toLowerCase().replace(/^\./, "");
  const hits = [];
  for (const it of await walk(vfs, dir)) {
    if (it.type !== "file") continue;
    const size = it.size ?? (await vfs.readBytes(it.path))?.byteLength ?? 0;
    if (minMB && size < minMB * MB) continue;
    if (days && now - (it.updatedAt || 0) > days * DAY) continue;
    if (want && !it.name.toLowerCase().endsWith(`.${want}`)) continue;
    hits.push({ path: it.path, size });
  }
  return hits;
}

// rename: files directly in `dir` (not subfolders). Replace `find` with `to`;
// with no `find`, `to` becomes the base name. Optional 001, 002… numbering.
export async function renamePlan(vfs, dir, { find = "", to = "", number = false } = {}) {
  const files = (await vfs.list(dir)).filter((i) => i.type === "file");
  const taken = new Set((await vfs.list(dir)).map((i) => i.name));
  const plan = [];
  files.forEach((f, idx) => {
    const dot = f.name.lastIndexOf(".");
    const stem = dot > 0 ? f.name.slice(0, dot) : f.name;
    const extn = dot > 0 ? f.name.slice(dot) : "";
    let next = find ? stem.split(find).join(to) : to || stem;
    if (number) next = `${next}${next ? " " : ""}${String(idx + 1).padStart(3, "0")}`;
    next = (next + extn).replace(/[\/\\]/g, "");
    if (!next || next === f.name) return;
    let candidate = next;
    for (let n = 2; taken.has(candidate); n++) candidate = `${next.slice(0, next.length - extn.length)} (${n})${extn}`;
    taken.delete(f.name);
    taken.add(candidate);
    plan.push({ from: f.path, to: candidate });
  });
  return plan;
}

export async function rename(vfs, dir, opts = {}, { preview = false } = {}) {
  const plan = await renamePlan(vfs, dir, opts);
  if (!preview) for (const p of plan) await vfs.rename(p.from, p.to);
  return plan;
}

// sync: copy new or changed files from `from` into `to`. Never deletes.
export async function sync(vfs, from, to, { preview = false } = {}) {
  const src = from.replace(/\/+$/, "");
  const dst = to.replace(/\/+$/, "");
  if (dst === src || dst.startsWith(src + "/")) throw new Error("O destino não pode ficar dentro da origem.");
  const actions = [];
  for (const it of await walk(vfs, src)) {
    const target = dst + it.path.slice(src.length);
    if (it.type === "dir") {
      if (!preview) await vfs.mkdir(target, { silent: true });
      continue;
    }
    const a = await vfs.readBytes(it.path);
    const b = await vfs.readBytes(target);
    const same = b && a && a.byteLength === b.byteLength && a.every((x, i) => x === b[i]);
    if (same) continue;
    actions.push({ copy: it.path, to: target, replace: Boolean(b) });
    if (!preview) await vfs.writeBytes(target, a, it.mime, { silent: true });
  }
  return actions;
}
