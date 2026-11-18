#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v wasm-pack >/dev/null 2>&1 || { echo "wasm-pack is required" >&2; exit 1; }

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
printf 'Built dist/ (%s files)\n' "$(find dist -type f | wc -l | tr -d ' ')"
