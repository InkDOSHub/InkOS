// Verdict: device wasm result vs native reference measured on the SAME device.
// Usage: node bench/compare.mjs bench/results/<device>.json bench/reference.json
import { readFileSync } from "node:fs";
const [resPath, refPath = new URL("./reference.json", import.meta.url).pathname] = process.argv.slice(2);
const res = JSON.parse(readFileSync(resPath, "utf8"));
const ref = JSON.parse(readFileSync(refPath, "utf8"));
const devRef = ref.devices?.[res.device];
if (!devRef || !Object.keys(devRef.kernels || {}).length) {
  console.log(`PENDENTE-DISPOSITIVO: no native reference for "${res.device}" in ${refPath}`);
  process.exit(2);
}
let logSum = 0, n = 0;
for (const [k, ms] of Object.entries(res.kernels)) {
  const nat = devRef.kernels[k];
  if (!nat) continue;
  const r = nat / ms;
  console.log(`${k.padEnd(12)} native ${nat} ms  wasm ${ms} ms  ${(r * 100).toFixed(1)} %`);
  logSum += Math.log(r); n++;
}
const g = Math.exp(logSum / n);
console.log(`geomean ${(g * 100).toFixed(1)} % -> ${g >= 0.7 ? "PASS (>= 70 %)" : "FAIL (< 70 %)"}`);
process.exit(g >= 0.7 ? 0 : 1);
