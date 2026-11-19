export const PAGE_SIZE = 65536;

function detectFixedTotalPages() {
  const dm = typeof navigator !== "undefined" ? navigator.deviceMemory : undefined;
  // Perfil fixo conservador e previsível para evitar Jetsam no iPadOS:
  // <= 4 GiB -> 2048 páginas (128 MiB: 64 MiB RAM + 64 MiB Swap)
  // > 4 GiB  -> 4096 páginas (256 MiB: 128 MiB RAM + 128 MiB Swap)
  if (typeof dm === "number" && dm >= 8) {
    return 4096;
  }
  return 2048;
}

function initGpuCanvas(canvasId = "framebuffer") {
  const canvas = typeof document !== "undefined" ? document.getElementById(canvasId) : null;
  if (!canvas) return { mode: "none", canvas: null };

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor((rect.width || window.innerWidth || 1024) * dpr));
  canvas.height = Math.max(1, Math.floor((rect.height || window.innerHeight || 768) * dpr));

  const ctx2d = canvas.getContext("2d");
  if (ctx2d) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  }
  return { mode: "canvas2d", canvas, ctx2d };
}

export async function bootKernel(options = {}) {
  const diag = {
    isolated: Boolean(window.crossOriginIsolated),
    arch64: true,
    pageSize: PAGE_SIZE,
    totalPages: 0,
    activeRamPages: 0,
    swapPages: 0,
    wasmLoaded: false,
    wasiCompiled: false,
    workerReady: false,
    gpuMode: "none",
    lastError: null,
  };

  const totalPages = detectFixedTotalPages();
  const halfPages = Math.floor(totalPages / 2);
  diag.totalPages = totalPages;
  diag.activeRamPages = halfPages;
  diag.swapPages = halfPages;

  const gpu = initGpuCanvas(options.canvasId || "framebuffer");
  diag.gpuMode = gpu.mode;

  let mod = null;
  try {
    mod = await import("../pkg/inkos.js");
    if (typeof mod.default === "function") {
      await mod.default();
    }
    diag.wasmLoaded = true;
  } catch (e) {
    diag.lastError = `wasm init: ${e?.message || e}`;
    return { diag, gpu };
  }

  const poolBytes = totalPages * PAGE_SIZE;
  let poolBuffer = null;
  try {
    if (window.crossOriginIsolated && typeof SharedArrayBuffer === "function") {
      poolBuffer = new SharedArrayBuffer(poolBytes);
    } else {
      poolBuffer = new ArrayBuffer(poolBytes);
    }
  } catch (e) {
    diag.lastError = `pool alloc: ${e?.message || e}`;
    return { diag, gpu };
  }

  let soc = null;
  if (typeof mod.InkSoC === "function") {
    try {
      soc = new mod.InkSoC(totalPages);
      if (poolBuffer instanceof SharedArrayBuffer) {
        soc.bind_shared_memory?.(poolBuffer);
      }
    } catch (e) {
      diag.lastError = `InkSoC init: ${e?.message || e}`;
    }
  }

  if (soc && typeof soc.emit_wasi_module === "function") {
    try {
      const bytes = soc.emit_wasi_module();
      if (bytes) {
        await WebAssembly.compile(bytes);
        diag.wasiCompiled = true;
      }
    } catch (e) {
      diag.lastError = `wasi64 compile: ${e?.message || e}`;
    }
  }

  let worker = null;
  if (options.workerUrl && window.crossOriginIsolated && poolBuffer instanceof SharedArrayBuffer) {
    try {
      const control = new SharedArrayBuffer(4096);
      worker = new Worker(options.workerUrl, { type: "module" });
      worker.postMessage({
        type: "init",
        pageSize: PAGE_SIZE,
        totalPages,
        activeRamPages: halfPages,
        swapPages: halfPages,
        poolBuffer,
        control,
      });
      diag.workerReady = true;
      return { diag, soc, poolBuffer, control, worker, gpu };
    } catch (e) {
      diag.lastError = `swap worker: ${e?.message || e}`;
    }
  }

  return { diag, soc, poolBuffer, worker, gpu };
}
