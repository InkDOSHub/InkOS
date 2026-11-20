# Memory budget

Target: iPhone 17 Pro Max and iPad 11" (A16), Safari, about 1.2 GB per tab
before the OS kills it. Budget everything below 900 MB to leave headroom.

| Area | Boot | Default ceiling | Notes |
|---|---|---|---|
| Kernel Wasm module | ~85 KB | n/a | `pkg/inkos_bg.wasm` |
| Kernel linear memory | ~1–2 MiB | grows on demand | Rust heap of `inkos` |
| Page pool (`WebAssembly.Memory`) | 16 MiB | 512 MiB | 1 GiB only with `?mem=1g` (pending device test) |
| Resident swappable frames | 0 | 128 MiB | CLOCK evicts beyond this to OPFS |
| JS heap (desktop, WM, apps) | ~2–3 MiB | ~100 MiB | measured 1.5 MiB used at boot (Chromium) |
| Canvas / WebGL | ~ viewport × DPR² × 4 B | 64 MiB | framebuffer canvas is capped at DPR 2 |
| Hub app iframes | 0 | 4 live instances × ~60 MiB | `appload.js` limit; older instances are closed |
| `.inkos` freeze | 1 MiB working chunk | + size of the ciphertext Blob | Blob may be disk-backed by Safari |

Measured at boot (Chromium, local dist, `reports/evidence/e1-5.txt`):
JS heap 1.5 MiB used, pool 16 MiB, boot 38 ms. Before this change the boot
allocated a fixed 128–256 MiB SharedArrayBuffer.

WebKit numbers and on-device numbers are PENDENTE-DISPOSITIVO.
