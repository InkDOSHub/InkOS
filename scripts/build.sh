#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v rustup >/dev/null 2>&1; then
  command -v curl >/dev/null 2>&1 || { echo "curl is required to install rustup" >&2; exit 1; }
  installer=$(mktemp "${TMPDIR:-/tmp}/rustup-init.XXXXXX")
  trap 'rm -f "$installer"' EXIT
  curl -fsSL --proto '=https' --tlsv1.2 https://rustup.rs -o "$installer"
  chmod +x "$installer"
  "$installer" -y --default-toolchain none
  rm -f "$installer"
  trap - EXIT
fi

if [[ -f "$HOME/.cargo/env" ]]; then
  . "$HOME/.cargo/env"
fi
export PATH="$HOME/.cargo/bin:$PATH"
command -v rustup >/dev/null 2>&1 || { echo "rustup installation failed" >&2; exit 1; }

TOOLCHAIN=$(sed -n 's/^[[:space:]]*channel[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' rust-toolchain.toml | tr -d '\r\n')
[[ -n "$TOOLCHAIN" ]] || { echo "rust-toolchain.toml has no channel" >&2; exit 1; }
rustup toolchain install "$TOOLCHAIN" --component rust-src --target wasm32-unknown-unknown
rustup component add rust-src --toolchain "$TOOLCHAIN"
rustup target add wasm32-unknown-unknown --toolchain "$TOOLCHAIN"

if ! command -v wasm-pack >/dev/null 2>&1; then
  cargo "+$TOOLCHAIN" install wasm-pack --locked
fi
command -v wasm-pack >/dev/null 2>&1 || { echo "wasm-pack installation failed" >&2; exit 1; }

export RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }-C target-feature=+atomics,+bulk-memory,+mutable-globals"
rm -rf dist
mkdir -p dist/pkg
wasm-pack build inkos --target web --release --out-dir ../dist/pkg

WASM=dist/pkg/inkos_bg.wasm
if command -v wasm-opt >/dev/null 2>&1 && [[ -f "$WASM" ]]; then
  wasm-opt -O3 --enable-threads --enable-bulk-memory "$WASM" -o "${WASM}.opt"
  mv "${WASM}.opt" "$WASM"
else
  echo "wasm-opt unavailable; using wasm-pack output without optimization" >&2
fi

cp -a inkos/web/. dist/
[[ -f dist/_headers ]] || { echo "dist/_headers missing" >&2; exit 1; }
grep -q '^  Cross-Origin-Opener-Policy: same-origin$' dist/_headers
grep -q '^  Cross-Origin-Embedder-Policy: require-corp$' dist/_headers
printf 'Built dist/ (%s files)\n' "$(find dist -type f | wc -l | tr -d ' ')"
