//! Native runner: prints JSON timings for the same kernels and parameters as bench/host.mjs.
use inkbench_kernels::*;
use std::time::Instant;

fn time<T>(f: impl Fn() -> T) -> f64 {
    let _ = std::hint::black_box(f()); // warm-up
    let mut best = f64::MAX;
    for _ in 0..3 {
        let t = Instant::now();
        std::hint::black_box(f());
        best = best.min(t.elapsed().as_secs_f64() * 1000.0);
    }
    best
}

fn main() {
    let rows = [
        ("cpu.int", time(|| int_ops(50_000_000))),
        ("cpu.float", time(|| float_ops(20_000_000))),
        ("cpu.sha256", time(|| sha256_mib(32))),
        ("cpu.matmul", time(|| matmul(256))),
        ("mem.copy", time(|| mem_copy(64, 8))),
        ("mem.alloc", time(|| alloc(200_000))),
    ];
    let body: Vec<String> = rows.iter().map(|(k, ms)| format!("\"{k}\":{ms:.3}")).collect();
    println!("{{{}}}", body.join(","));
}
