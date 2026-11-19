// InkBench — Suíte leve de medição de desempenho (CPU/Wasm, memória SAB e frame loop)
const NATIVE_REFERENCE = {
  // Referência base calibrada para comparação de razão (>= 70% da referência nativa)
  arithmeticOpsPerSec: 120_000_000,
  memThroughputMBps: 2_500,
  targetFps: 60,
};

export async function runInkBench({ iterations = 4_000_000, sampleFrames = 30 } = {}) {
  const t0 = performance.now();
  let acc = 0x12345678;
  for (let i = 0; i < iterations; i++) {
    acc = (Math.imul(acc ^ i, 2654435761) + 0x9e3779b9) | 0;
  }
  const cpuMs = Math.max(0.01, performance.now() - t0);
  const opsPerSec = Math.round((iterations / cpuMs) * 1000);
  const cpuRatio = Math.min(1, opsPerSec / NATIVE_REFERENCE.arithmeticOpsPerSec);

  const sab = window.inkOS?.memory?.buffer || new SharedArrayBuffer(1024 * 1024);
  const view = new Int32Array(sab, 0, Math.min(262144, Math.floor(sab.byteLength / 4)));
  const t1 = performance.now();
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < view.length; i++) {
      Atomics.store(view, i, (i + pass) | 0);
    }
  }
  const memMs = Math.max(0.01, performance.now() - t1);
  const totalBytes = view.byteLength * 8;
  const memMBps = Math.round((totalBytes / 1048576) / (memMs / 1000));
  const memRatio = Math.min(1, memMBps / NATIVE_REFERENCE.memThroughputMBps);

  const avgFps = await new Promise((resolve) => {
    let count = 0;
    let start = 0;
    const step = (now) => {
      if (!start) start = now;
      count++;
      if (count >= sampleFrames) {
        const elapsed = Math.max(1, now - start);
        resolve(Math.min(120, Math.round((count * 1000) / elapsed)));
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const fpsRatio = Math.min(1, avgFps / NATIVE_REFERENCE.targetFps);

  const scorePct = Math.round(((cpuRatio * 0.45) + (memRatio * 0.35) + (fpsRatio * 0.2)) * 100);

  return {
    timestamp: new Date().toISOString(),
    crossOriginIsolated: Boolean(window.crossOriginIsolated),
    accumulator: acc,
    cpu: { ms: Number(cpuMs.toFixed(2)), opsPerSec, ratioPct: Math.round(cpuRatio * 100) },
    memory: { ms: Number(memMs.toFixed(2)), throughputMBps: memMBps, ratioPct: Math.round(memRatio * 100) },
    frameLoop: { frames: sampleFrames, avgFps, ratioPct: Math.round(fpsRatio * 100) },
    scorePct,
    meetsTarget70: scorePct >= 70,
  };
}
