# InkOS workspace map (preliminary)

> Source: GitHub repository metadata and root-directory listings, 2026-11-18. This is not a local clone or `tree -L 3` output; this session has no shell/clone tool. Confirm manifests, entrypoints, and nested structure locally before treating dependencies as mapped.

## Repositories

| Repository | Default branch | Language / role | Root evidence |
|---|---|---|---|
| [InkDOSHub/InkOS](https://github.com/InkDOSHub/InkOS) | `main` | Destination; empty at inspection (size 0) | No root entries returned |
| [InkDOSHub/inkdoshub.github.io](https://github.com/InkDOSHub/inkdoshub.github.io) | `main` | JavaScript web hub | `index.html`, `worker.js`, `sw-portal.js`, `apps/`, `InkOS/`, `terminal/`, `tools/`; no root `package.json` listed |
| [InkDOSHub/InkSoC](https://github.com/InkDOSHub/InkSoC) | `main` | Rust (metadata); browser OS/emulator | `index.html`, `worker.js`, `sharedmem.js`, `swapio.js`, `src/`, `tools/`, `vendor/`, prebuilt `.wasm`; no root `Cargo.toml` listed |
| [InkDOSHub/InkShell](https://github.com/InkDOSHub/InkShell) | `main` | Rust (metadata); browser Linux terminal | `index.html`, `app.js`, `worker.js`, `engine-src/`, `alpine/`, `tests/`, `tools/`, `vendor/`, prebuilt `engine.wasm`; no root `Cargo.toml` listed |
| [InkDOSHub/InkBench](https://github.com/InkDOSHub/InkBench) | `main` | JavaScript benchmark | `index.html`, `app.js`, `bench.js`, `bench-v9.js`, `native/`, `motionmark/`; no root `package.json` listed |
| [InkDOSHub/InkCam](https://github.com/InkDOSHub/InkCam) | `main` | JavaScript camera/webcam app | `index.html`, `app.js`, `lib/`, `windows/`; no root `package.json` listed |
| [InkDOSHub/InkMind](https://github.com/InkDOSHub/InkMind) | `main` | JavaScript local AI app | `index.html`, `app.js`, `download-worker.js`, `extract.js`, `wllama/`; no root `package.json` listed |
| [InkDOSHub/InkArcade](https://github.com/InkDOSHub/InkArcade) | `main` | JavaScript retro games app | `index.html`, `app.js`, `ejs/`; no root `package.json` listed |

## Dependency and syscall inspection

- Manifests: no root `Cargo.toml` or `package.json` appeared in the inspected root listings. Nested manifests not yet enumerated.
- Rust entrypoints: `InkSoC/src/` exists; `InkShell/` exposes `engine-src/`. Exact `src/lib.rs` / `src/main.rs` paths and contents were not fetched; syscall/dependency details remain unverified.
- HTML entrypoints: `index.html` exists in all seven non-destination repositories; contents not read.
- Next local pass: clone all eight repositories; run `tree -L 3 -I 'node_modules|target|.git'` in each; inspect only manifests and `src/lib.rs`, `src/main.rs`, `index.html`; update this map with verified dependency and syscall edges.

## Workspace commands (local machine)

```sh
mkdir -p inkos-workspace && cd inkos-workspace
for repo in InkOS inkdoshub.github.io InkSoC InkShell InkBench InkCam InkMind InkArcade; do
  git clone "https://github.com/InkDOSHub/$repo.git" "$repo"
done
for repo in InkOS inkdoshub.github.io InkSoC InkShell InkBench InkCam InkMind InkArcade; do
  printf '\n### %s\n' "$repo"
  (cd "$repo" && tree -L 3 -I 'node_modules|target|.git')
done
```
