// InkOS kernel boot: loads the InkSoC Wasm module and picks a runtime profile.
//
// Profiles
//   "mt": crossOriginIsolated and a shared WebAssembly.Memory probe succeeds.
//         The memory pool is a growable shared WebAssembly.Memory and the swap
//         worker receives it.
//   "st": anything else. The pool is a growable non-shared WebAssembly.Memory,
//         no swap worker. The Monitor shows the reason.
//
// Memory budget (see docs/MEMORY-BUDGET.md): initial pool 16 MiB, grows on
// demand, default ceiling 512 MiB. A 1 GiB ceiling is only allowed behind
// ?mem=1g (pending device validation).

export const PAGE_SIZE = 65536;
export const INITIAL_POOL_PAGES = 256; // 16 MiB
export const DEFAULT_MAX_POOL_PAGES = 8192; // 512 MiB
export const FLAG_MAX_POOL_PAGES = 16384; // 1 GiB, flag only

export function maxPoolPages(search = globalThis.location?.search || "") {
  const params = new URLSearchParams(search);
  return params.get("mem") === "1g" ? FLAG_MAX_POOL_PAGES : DEFAULT_MAX_POOL_PAGES;
}

// Returns { ok, reason }. Never throws.
export function probeSharedMemory() {
  if (!globalThis.crossOriginIsolated) return { ok: false, reason: "crossOriginIsolated=false" };
  if (typeof SharedArrayBuffer !== "function") return { ok: false, reason: "SharedArrayBuffer indisponível" };
  try {
    const m = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
    if (!(m.buffer instanceof SharedArrayBuffer)) return { ok: false, reason: "memória compartilhada não é SAB" };
    // Atomics must work on the shared view.
    const v = new Int32Array(m.buffer);
    Atomics.store(v, 0, 7);
    if (Atomics.load(v, 0) !== 7) return { ok: false, reason: "Atomics falhou" };
    return { ok: true, reason: "" };
  } catch (e) {
    return { ok: false, reason: `probe: ${e?.message || e}` };
  }
}

export async function bootKernel({ pkgUrl = "../pkg/inkos.js", workerUrl = "./js/swap.worker.js" } = {}) {
  const diag = {
    isolated: Boolean(globalThis.crossOriginIsolated),
    profile: "st",
    profileReason: "",
    wasmLoaded: false,
    wasiCompiled: false,
    workerReady: false,
    poolBytes: 0,
    poolMaxBytes: 0,
    bootMs: 0,
    lastError: null,
  };
  const t0 = performance.now();
  const result = { diag, soc: null, memory: null, worker: null, control: null };

  const probe = probeSharedMemory();
  diag.profile = probe.ok ? "mt" : "st";
  diag.profileReason = probe.ok ? "" : probe.reason;

  let mod;
  try {
    mod = await import(new URL(pkgUrl, import.meta.url).href);
    await mod.default();
    diag.wasmLoaded = true;
  } catch (e) {
    diag.lastError = `wasm init: ${e?.message || e}`;
    console.error("[InkOS] wasm init failed:", e);
    diag.bootMs = Math.round(performance.now() - t0);
    return result;
  }

  const maximum = maxPoolPages();
  try {
    result.memory = new WebAssembly.Memory({ initial: INITIAL_POOL_PAGES, maximum, shared: diag.profile === "mt" });
  } catch (e) {
    diag.lastError = `pool alloc: ${e?.message || e}`;
    console.error("[InkOS] pool alloc failed:", e);
    diag.bootMs = Math.round(performance.now() - t0);
    return result;
  }
  diag.poolBytes = result.memory.buffer.byteLength;
  diag.poolMaxBytes = maximum * PAGE_SIZE;

  try {
    result.soc = new mod.InkSoC(INITIAL_POOL_PAGES);
    if (diag.profile === "mt") result.soc.bind_shared_memory(result.memory.buffer);
    const bytes = result.soc.emit_wasi_module();
    await WebAssembly.compile(bytes);
    diag.wasiCompiled = true;
  } catch (e) {
    diag.lastError = `InkSoC: ${e?.message || e}`;
    console.error("[InkOS] InkSoC init failed:", e);
  }

  if (diag.profile === "mt") {
    try {
      result.control = new SharedArrayBuffer(4096);
      result.worker = new Worker(new URL(workerUrl, globalThis.location.href), { type: "module" });
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        result.worker.addEventListener("message", (ev) => {
          if (ev.data?.type === "ready") {
            diag.workerReady = true;
            diag.swapAvailable = Boolean(ev.data.hasOpfsSync);
            clearTimeout(timer);
            resolve();
          }
        });
        result.worker.postMessage({ type: "init", pageSize: PAGE_SIZE, memory: result.memory, control: result.control });
      });
    } catch (e) {
      diag.lastError = `swap worker: ${e?.message || e}`;
      console.error("[InkOS] swap worker failed:", e);
    }
  }

  diag.bootMs = Math.round(performance.now() - t0);
  return result;
}
