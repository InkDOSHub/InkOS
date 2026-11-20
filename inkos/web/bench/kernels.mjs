// Shared kernel list for host (Node) and device (browser) runs. Same params as kernels/src/main.rs.
export const KERNELS = [
  ["cpu.int", "k_int", [50_000_000]],
  ["cpu.float", "k_float", [20_000_000]],
  ["cpu.sha256", "k_sha256", [32]],
  ["cpu.matmul", "k_matmul", [256]],
  ["mem.copy", "k_memcopy", [64, 8]],
  ["mem.alloc", "k_alloc", [200_000]],
];

export async function runWasm(bytes, now = () => performance.now()) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const out = {};
  for (const [name, fn, args] of KERNELS) {
    const f = instance.exports[fn];
    f(...args); // warm-up
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t = now();
      f(...args);
      best = Math.min(best, now() - t);
    }
    out[name] = +best.toFixed(3);
  }
  return out;
}
