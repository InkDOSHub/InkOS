# Third-party licenses

What ships in the InkOS bundle (`dist/`), checked on 2026-11-20 with
`cargo tree --target wasm32-unknown-unknown -e normal -f '{p} {l}'`.

## In the bundle

InkOS's own code (Rust kernel, JavaScript desktop, theme, icons) is MIT, see `LICENSE`.

The Wasm kernel (`pkg/inkos_bg.wasm`) and its generated glue (`pkg/inkos.js`) contain code from these crates:

| Crate | Version | License |
|---|---|---|
| wasm-bindgen (+ macro, macro-support, shared) | 0.2.130 | MIT OR Apache-2.0 |
| js-sys | 0.3.107 | MIT OR Apache-2.0 |
| web-sys | 0.3.107 | MIT OR Apache-2.0 |
| wasm-encoder | 0.221.3 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| leb128 | 0.2.7 | MIT OR Apache-2.0 |
| futures-core, futures-task, futures-util | 0.3.34 | MIT OR Apache-2.0 |
| pin-project-lite | 0.2.18 | Apache-2.0 OR MIT |
| slab | 0.4.12 | MIT |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 |
| bumpalo (build time) | 3.20.4 | MIT OR Apache-2.0 |
| proc-macro2, quote, syn, unicode-ident (build time only, not in the binary) | — | MIT OR Apache-2.0 (unicode-ident also Unicode-3.0) |

The InkBench kernels (`bench/inkbench_kernels.wasm`) have no dependencies (MIT).

There are no npm packages in the bundle. Playwright is a development dependency for tests only (Apache-2.0).

No GPL, AGPL, LGPL or MPL code is in the bundle.

## Not in the bundle

InkDOS Hub apps open by reference in cross-origin iframes from the Hub. They are not copied into InkOS, and each keeps its own license (see the Hub's `LICENCAS.md`). Some of them (for example the emulators in InkSoC, InkShell and InkArcade) include GPL components; those stay separate artifacts served by the Hub.

The `search`, `rename` and `sync` shell commands are a clean-room reimplementation of the behaviour of the Hub's `inkmenu.py` jobs. No code was copied.
