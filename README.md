# InkOS

Browser desktop and WebAssembly runtime prototype for iPhone, iPad, and desktop.

## Architecture

- `inkos/src`: Rust/Wasm core, built for `wasm32-unknown-unknown`.
- `inkos/web`: Catppuccin Mocha/Latte PWA shell, lazy app wrappers, OPFS bridge, and service worker.
- `inkos/web/apps`: app entrypoint wrappers; app assets are loaded only when launched.
- Shared-memory features require a secure context and cross-origin isolation (`COOP: same-origin`, `COEP: require-corp`). Host support varies.

## Build and deploy

Requirements: Rust stable, `wasm32-unknown-unknown`, `wasm-pack`; Binaryen `wasm-opt` is optional.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
bash scripts/build.sh
```

The build creates `dist/` from `inkos/web/`, adds generated Wasm bindings under `dist/pkg/`, and runs `wasm-opt -O3` when installed. Publish `dist/` as a static site on a host that honors `_headers`; configure the host's COOP/COEP response headers if it does not. GitHub Pages requires Pages to be configured for Actions by the repository owner.

## iOS controls

- One finger: pointer; two fingers: scroll.
- Modifier strip: Esc, Tab, Ctrl, Opt, Cmd, and arrows.
- Use the Fullscreen control where supported; display and keyboard APIs are browser-dependent.
- Switch Mocha/Latte with the theme control.

## Benchmarks

Import `runInkOSBench` from `./js/bench.js`. It measures a small WebAssembly integer-loop workload, OPFS I/O in 64 KiB blocks, and animation-frame cadence while transforming Catppuccin-colored window layers. Pass `nativeBaselineOpsPerSecond` from a same-device, same-workload native run to calculate the Wasm/native ratio. The >=70% A16/A19 Pro target is not claimed without that reference measurement; iOS heap and physical-memory reporting are not uniformly exposed to web pages.
