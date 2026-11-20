// Rewrites dist/sw.js: VERSION = short sha256 of all shipped files,
// PRECACHE = every file in dist/ except headers/redirects and the SW itself.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const dist = process.argv[2] || "dist";
const skip = new Set(["sw.js", "_headers", "_redirects"]);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p).split(sep).join("/"));
  }
})(dist);

const shipped = files.filter((f) => !skip.has(f));
const hash = createHash("sha256");
for (const f of shipped) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest("hex").slice(0, 12);
const precache = ["./", ...shipped.map((f) => `./${f}`)];

const swPath = join(dist, "sw.js");
let sw = readFileSync(swPath, "utf8");
sw = sw.replace(/^const VERSION = .*;$/m, `const VERSION = ${JSON.stringify(version)};`);
sw = sw.replace(/^const PRECACHE = .*;$/m, `const PRECACHE = ${JSON.stringify(precache)};`);
if (!sw.includes(version)) throw new Error("gen-sw: VERSION placeholder not found");
writeFileSync(swPath, sw);
console.log(`gen-sw: version ${version}, ${precache.length} precache entries`);
