export class BenchmarkTelemetry {
  constructor({ onSample = () => {} } = {}) { this.onSample = onSample; this.samples = []; }
  record({ wasmScore, nativeScore, label = "" }) {
    if (!Number.isFinite(wasmScore) || !Number.isFinite(nativeScore) || nativeScore <= 0) throw new TypeError("positive finite scores required");
    const ratio = wasmScore / nativeScore; const sample = { wasmScore, nativeScore, ratio, label, at: new Date().toISOString(), targetMet: ratio >= 0.7 };
    this.samples.push(sample); this.onSample(sample); return sample;
  }
  summary() { return { count: this.samples.length, targetRatio: 0.7, targetMet: this.samples.length > 0 && this.samples.every(sample => sample.targetMet), samples: [...this.samples] }; }
}
