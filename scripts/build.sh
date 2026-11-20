#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v rustup >/dev/null 2>&1; then
  command -v curl >/dev/null 2>&1 || { echo "curl is required to install rustup" >&2; exit 1; }
  installer=$(mktemp "${TMPDIR:-/tmp}/rustup-init.XXXXXX")
  trap 'rm -f "$installer"' EXIT
  curl -fsSL --proto '=https' --tlsv1.2 https://sh.rustup.rs -o "$installer"
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
  case "$(uname -s):$(uname -m)" in
    Linux:x86_64) ;;
    *) echo "Prebuilt wasm-pack installer supports Linux x86_64 only" >&2; exit 1 ;;
  esac
  WASM_PACK_VERSION=0.15.1
  tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/wasm-pack.XXXXXX")
  trap 'rm -rf "$tmpdir"' EXIT
  archive="wasm-pack-v${WASM_PACK_VERSION}-x86_64-unknown-linux-musl.tar.gz"
  curl -fsSL "https://github.com/wasm-bindgen/wasm-pack/releases/download/v${WASM_PACK_VERSION}/${archive}" -o "$tmpdir/$archive"
  tar -xzf "$tmpdir/$archive" -C "$tmpdir"
  install -m 0755 "$tmpdir/wasm-pack-v${WASM_PACK_VERSION}-x86_64-unknown-linux-musl/wasm-pack" "$HOME/.cargo/bin/wasm-pack"
  rm -rf "$tmpdir"
  trap - EXIT
fi
command -v wasm-pack >/dev/null 2>&1 || { echo "wasm-pack installation failed" >&2; exit 1; }

rm -rf dist
mkdir -p dist/pkg
wasm-pack build inkos --target web --release --out-dir ../dist/pkg

WASM=dist/pkg/inkos_bg.wasm

# wasm-opt is optional. Never use --all-features here: binaryen then re-encodes
# the module with post-MVP encodings (compact-imports, ...) that Safari, Chrome
# and Node reject ("can't get 0th Import's kind" / "Invalid import kind 127").
# Enable only the features rustc emits for wasm32-unknown-unknown by default.
WASM_OPT_FEATURES=(--enable-bulk-memory --enable-mutable-globals --enable-sign-ext
  --enable-nontrapping-float-to-int --enable-multivalue --enable-reference-types)
BINARYEN_NPM_VERSION=132.0.0
if [[ "${INKOS_WASM_OPT:-1}" == "1" ]] && ! command -v wasm-opt >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  optdir=$(mktemp -d "${TMPDIR:-/tmp}/binaryen.XXXXXX")
  if npm install --prefix "$optdir" --no-audit --no-fund --silent "binaryen@${BINARYEN_NPM_VERSION}" >/dev/null 2>&1; then
    export PATH="$optdir/node_modules/.bin:$PATH"
  else
    echo "binaryen@${BINARYEN_NPM_VERSION} install failed; continuing without wasm-opt" >&2
  fi
fi
if [[ "${INKOS_WASM_OPT:-1}" == "1" ]] && command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -O3 "${WASM_OPT_FEATURES[@]}" --strip-debug --strip-target-features "$WASM" -o "${WASM}.opt"
  mv "${WASM}.opt" "$WASM"
  echo "wasm-opt ok ($(wc -c < "$WASM" | tr -d ' ') bytes)"
else
  echo "wasm-opt skipped (not installed or INKOS_WASM_OPT=0)"
fi

# Fail the build if any engine-level check rejects the module.
"$ROOT/scripts/verify-wasm.sh" "$WASM"

cp -a inkos/web/. dist/
[[ -f dist/_headers ]] || { echo "dist/_headers missing" >&2; exit 1; }
grep -q '^  Cross-Origin-Opener-Policy: same-origin$' dist/_headers
grep -q '^  Cross-Origin-Embedder-Policy: require-corp$' dist/_headers

# Cloudflare Pages recusa arquivos acima de 25 MiB: avisa antes do upload.
big=$(find dist -type f -size +25M)
if [[ -n "$big" ]]; then
  echo "WARNING: files over 25 MiB (Cloudflare Pages limit):" >&2
  echo "$big" >&2
fi

# Service worker: version = hash of dist content, precache = every shipped file.
node "$ROOT/scripts/gen-sw.mjs" dist

printf 'Built dist/ (%s files)\n' "$(find dist -type f | wc -l | tr -d ' ')"
