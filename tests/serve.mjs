// Static server for dist/ that mimics Cloudflare Pages: applies _headers rules
// and falls back to index.html for unknown paths (so MIME mistakes show up).
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".mjs": "application/javascript",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function parseHeaders(root) {
  const p = join(root, "_headers");
  if (!existsSync(p)) return [];
  const rules = [];
  let cur = null;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), headers: [] }; rules.push(cur); continue; }
    const i = line.indexOf(":");
    if (cur && i > 0) cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return rules;
}
const match = (pattern, path) =>
  new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(path);

export function serve(root, port = 0) {
  const rules = parseHeaders(root);
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let path = decodeURIComponent(url.pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(normalize(root))) { res.writeHead(403); return res.end(); }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) file = join(root, "index.html");
    for (const r of rules) if (match(r.pattern, path)) for (const [k, v] of r.headers) res.setHeader(k, v);
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await serve(process.argv[2] || "dist", Number(process.argv[3] || 8787));
  console.log(`serving on http://127.0.0.1:${s.address().port}`);
}
