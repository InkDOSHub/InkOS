#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v rustup >/dev/null 2>&1; then
  command -v curl >/dev/null 2>&1 || { echo "curl is required to install rustup" >&2; exit 1; }
  curl --proto '=https' --tlsv1.2 -sSf https://rustup.rs | sh -s -- -y
fi

[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
export PATH="$HOME/.cargo/bin:$PATH"
command -v rustup >/dev/null 2>&1 || { echo "rustup installation failed" >&2; exit 1; }

# Running rustup from the repository honors rust-toolchain.toml and installs its pinned channel.
TOOLCHAIN="$(rustup show active-toolchain | awk '{print $1}')"
rustup component add rust-src --toolchain "$TOOLCHAIN"
rustup target add wasm32-unknown-unknown --toolchain "$TOOLCHAIN"

if ! command -v wasm-pack >/dev/null 2>&1; then
  cargo install wasm-pack --locked
  export PATH="$HOME/.cargo/bin:$PATH"
fi
command -v wasm-pack >/dev/null 2>&1 || { echo "wasm-pack installation failed" >&2; exit 1; }

export RUSTFLAGS="${RUSTFLAGS:+$RUSTFLAGS }-C target-feature=+atomics,+bulk-memory,+mutable-globals"
wasm-pack build inkos --target web --release

WASM="inkos/pkg/inkos_bg.wasm"
if command -v wasm-opt >/dev/null 2>&1 && [[ -f "$WASM" ]]; then
  wasm-opt -O3 --enable-threads --enable-bulk-memory "$WASM" -o "${WASM}.opt"
  mv "${WASM}.opt" "$WASM"
else
  echo "wasm-opt unavailable; using wasm-pack output without optimization" >&2
fi

rm -rf dist
mkdir -p dist/pkg
cp -a inkos/web/. dist/
cp -a inkos/pkg/. dist/pkg/
[[ -f dist/_headers ]] || { echo "dist/_headers missing" >&2; exit 1; }
grep -q '^  Cross-Origin-Opener-Policy: same-origin$' dist/_headers
grep -q '^  Cross-Origin-Embedder-Policy: require-corp$' dist/_headers
printf 'Built dist/ (%s files)\n' "$(find dist -type f | wc -l | tr -d ' ')"
