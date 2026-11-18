const TARGET_RATIO = 0.70;
const BLOCK_BYTES = 64 * 1024;

function u32(value) {
  const out = [];
  do { let byte = value & 0x7f; value >>>= 7; if (value) byte |= 0x80; out.push(byte); } while (value);
  return out;
}
function section(id, payload) { return [id, ...u32(payload.length), ...payload]; }
function makeCpuModule() {
  const enc = new TextEncoder();
  const type = [1, 0x60, 1, 0x7f, 1, 0x7f];
  const funcs = [1, 0];
  const name = [...enc.encode("run")];
  const exp = [1, name.length, ...name, 0, 0];
  const instructions = [
    1, 1, 0x7f,             // one i32 local: accumulator
    0x41, 0, 0x21, 1,       // accumulator = 0
    0x02, 0x40,              // block (break target)
    0x03, 0x40,              // loop
    0x20, 0, 0x45, 0x0d, 1, // br_if 1 when remaining == 0
    0x20, 1, 0x20, 0, 0x6a, 0x21, 1, // accumulator += remaining
    0x20, 0, 0x41, 1, 0x6b, 0x21, 0, // remaining -= 1
    0x0c, 0, 0x0b, 0x0b,    // continue; end loop; end block
    0x20, 1, 0x0b,          // return accumulator
  ];
  const body = [...instructions];
  const code = [1, ...u32(body.length), ...body];
  return new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, ...section(1, type), ...section(3, funcs), ...section(7, exp), ...section(10, code)]);
}

export class InkOSBench {
  constructor({ nativeBaselineOpsPerSecond = null, onProgress = () => {} } = {}) {
    this.nativeBaselineOpsPerSecond = nativeBaselineOpsPerSecond;
    this.onProgress = onProgress;
  }
  async run({ cpuDurationMs = 500, ioBlocks = 16, fpsDurationMs = 2000, windows = 8 } = {}) {
    const cpu = await this.cpu(cpuDurationMs);
    const io = await this.opfs(ioBlocks);
    const compositor = await this.fps(fpsDurationMs, windows);
    const ratio = Number.isFinite(this.nativeBaselineOpsPerSecond) && this.nativeBaselineOpsPerSecond > 0
      ? cpu.opsPerSecond / this.nativeBaselineOpsPerSecond : null;
    const result = {
      cpu,
      opfs: io,
      compositor,
      memory: { jsHeapBytes: performance.memory?.usedJSHeapSize ?? null, note: "WebAssembly linear memory is not observable generically from the page." },
      nativeBaselineOpsPerSecond: this.nativeBaselineOpsPerSecond,
      wasmToNativeRatio: ratio,
      targetRatio: TARGET_RATIO,
      targetMet: ratio === null ? null : ratio >= TARGET_RATIO,
      referenceNote: "70% A16/A19 Pro parity requires a native benchmark measured on the same device with the same workload; this suite does not fabricate that baseline.",
    };
    this.onProgress(result);
    return result;
  }
  async cpu(durationMs) {
    const { instance } = await WebAssembly.instantiate(makeCpuModule());
    const run = instance.exports.run;
    const iterations = 200000;
    let completed = 0; let checksum = 0;
    const started = performance.now();
    while (performance.now() - started < durationMs) {
      checksum ^= run(iterations);
      completed += iterations;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const elapsedSeconds = (performance.now() - started) / 1000;
    return { runtime: "WebAssembly", workload: "i32 loop and accumulation", completedIterations: completed, opsPerSecond: completed / elapsedSeconds, elapsedSeconds, checksum };
  }
  async opfs(blocks) {
    if (!navigator.storage?.getDirectory) return { available: false, reason: "OPFS unavailable" };
    const root = await navigator.storage.getDirectory();
    const name = `.inkos-bench-${crypto.randomUUID()}`;
    try {
      const handle = await root.getFileHandle(name, { create: true });
      const data = crypto.getRandomValues(new Uint8Array(BLOCK_BYTES));
      const writeStart = performance.now();
      const writer = await handle.createWritable();
      for (let i = 0; i < blocks; i++) await writer.write({ type: "write", position: i * BLOCK_BYTES, data });
      await writer.close();
      const writeMs = performance.now() - writeStart;
      const file = await handle.getFile();
      const readStart = performance.now();
      for (let i = blocks - 1; i >= 0; i--) await file.slice(i * BLOCK_BYTES, (i + 1) * BLOCK_BYTES).arrayBuffer();
      const readMs = performance.now() - readStart;
      return { available: true, blockBytes: BLOCK_BYTES, blocks, writeMBps: blocks * BLOCK_BYTES / writeMs / 1000, reverseReadMBps: blocks * BLOCK_BYTES / readMs / 1000, mode: "OPFS FileSystemWritableFileStream / Blob reads" };
    } catch (error) {
      return { available: false, reason: String(error.message ?? error) };
    } finally {
      await root.removeEntry(name).catch(() => {});
    }
  }
  async fps(durationMs, windows) {
    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "-1", pointerEvents: "none", overflow: "hidden" });
    const colors = ["#1e1e2e", "#313244", "#45475a", "#cba6f7", "#89b4fa"];
    const cards = Array.from({ length: windows }, (_, i) => {
      const node = document.createElement("div");
      Object.assign(node.style, { position: "absolute", width: "80px", height: "60px", left: `${i * 13}px`, top: `${i * 9}px`, background: colors[i % colors.length], willChange: "transform" });
      layer.append(node); return node;
    });
    document.body.append(layer);
    let frames = 0; let previous = 0; const frameTimes = []; const end = performance.now() + durationMs;
    try {
      await new Promise(resolve => {
        const tick = time => {
          if (previous) frameTimes.push(time - previous);
          previous = time; frames++;
          cards.forEach((card, i) => { card.style.transform = `translate3d(${Math.sin(time / 300 + i) * 24}px,${Math.cos(time / 400 + i) * 18}px,0)`; });
          if (time < end) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      });
      const elapsed = frameTimes.reduce((a, b) => a + b, 0);
      const sorted = [...frameTimes].sort((a, b) => a - b);
      return { frames, windows, measuredFps: elapsed ? frameTimes.length * 1000 / elapsed : 0, p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? null, targetFps: 120, targetMet: elapsed > 0 && frameTimes.length * 1000 / elapsed >= 120 };
    } finally { layer.remove(); }
  }
}

export async function runInkOSBench(options) { return new InkOSBench(options).run(); }
