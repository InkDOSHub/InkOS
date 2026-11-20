# InkOS ecosystem

How InkOS relates to the other InkDOS repositories. Updated 2026-11-20.

## Pieces

| Repository | Role | How InkOS uses it |
|---|---|---|
| **InkOS** (this repo) | Web desktop: Rust/Wasm kernel, window manager, VFS, native apps | — |
| **inkdoshub.github.io** (InkDOS Hub) | Hosts the app suite and the app registry | InkOS reads `https://hub.inkdos.workers.dev/InkOS/apps/registry.json` and opens each app in a cross-origin iframe |
| **InkSoC** | Browser OS/emulator (Wine app) | Listed in the Hub registry, opened by reference |
| **InkShell** | Linux terminal in the browser | Listed in the Hub registry ("terminal"), opened by reference |
| **InkBench** | Benchmarks | InkOS ships its own small kernels (`bench/kernels`) for the wasm vs native check; the full InkBench runs from the Hub |
| **InkCam, InkMind, InkArcade** | Camera, local AI, retro games | Opened by reference through the Hub |
| **inkdoshub-wasm-build** | Wasm build helpers | Not used at runtime |

## Rules

- **By reference only.** Nothing from the Hub is copied into InkOS, and InkOS is not copied into the Hub. The offline snapshot `inkos/web/apps/registry.json` holds only the registry (names, links), refreshed with `scripts/sync-registry-snapshot.sh`.
- **One protocol.** InkOS and Hub apps talk through postMessage protocol v1 (`docs/PROTOCOL.md`): `ink-tema` (theme), `inkos-vfs-file` (send a file from the Finder) and `inkos-ready`. Every message names an explicit target origin, and both sides check the sender's origin.
- **Isolation.** InkOS runs with COOP `same-origin` and COEP `require-corp`. The Hub serves `Cross-Origin-Resource-Policy: cross-origin` and COEP, so its apps load inside InkOS while InkOS stays cross-origin isolated.
- **Hub/Desktop mode.** The Hub still has its own InkOS app. A future Hub/Desktop toggle will replace it (see `docs/adr/ADR-modo-hub-desktop.md`); it has not been removed.

## Data flow

```text
Hub registry.json ──fetch (CORS)──▶ InkOS launcher ──iframe──▶ Hub app
                                       │                         ▲
                                       ├── ink-tema ─────────────┤
                                       └── inkos-vfs-file ───────┘
Hub app ── inkos-ready ──▶ InkOS (sends the theme again)
```
