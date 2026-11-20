// Host proxy: wasm vs native on the SAME computer. Not a device measurement.
// Usage: node bench/host.mjs > reports/evidence/bench-host.json
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus, platform, arch } from "node:os";
import { fileURLToPath } from "node:url";
import { runWasm } from "../inkos/web/bench/kernels.mjs";

const dir = fileURLToPath(new URL("./kernels/", import.meta.url));
execFileSync("cargo", ["build", "-q", "--release"], { cwd: dir, stdio: "inherit" });
execFileSync("cargo", ["build", "-q", "--release", "--lib", "--target", "wasm32-unknown-unknown"], { cwd: dir, stdio: "inherit" });
const native = JSON.parse(execFileSync(`${dir}target/release/inkbench-native`).toString());
const wasm = await runWasm(readFileSync(`${dir}target/wasm32-unknown-unknown/release/inkbench_kernels.wasm`));
const kernels = {};
for (const k of Object.keys(native)) kernels[k] = { native_ms: native[k], wasm_ms: wasm[k], ratio: +(native[k] / wasm[k]).toFixed(3) };
const ratios = Object.values(kernels).map((r) => r.ratio);
const geomean = Math.exp(ratios.reduce((a, r) => a + Math.log(r), 0) / ratios.length);
console.log(JSON.stringify({
  schema: "inkbench/1", mode: "host", label: "PROXY: wasm (Node/V8) vs native on the same host, not an iOS device result",
  host: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
  date: new Date().toISOString(), kernels, geomean_ratio: +geomean.toFixed(3),
}, null, 1));
