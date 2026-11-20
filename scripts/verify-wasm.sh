#!/usr/bin/env bash
# Verifies a Wasm binary is loadable by real engines, not only by permissive tools.
# Usage: scripts/verify-wasm.sh path/to/module.wasm
set -euo pipefail
WASM="${1:?usage: verify-wasm.sh <file.wasm>}"
[[ -f "$WASM" ]] || { echo "verify-wasm: $WASM not found" >&2; exit 1; }

magic=$(od -An -tx1 -N8 "$WASM" | tr -d ' \n')
[[ "$magic" == "0061736d01000000" ]] || { echo "verify-wasm: bad magic/version: $magic" >&2; exit 1; }

# Engine check (V8). Rejects post-MVP encodings that Safari also rejects.
node --input-type=module -e '
import { readFileSync } from "node:fs";
const bytes = readFileSync(process.argv[1]);
if (!WebAssembly.validate(bytes)) {
  try { await WebAssembly.compile(bytes); } catch (e) { console.error("verify-wasm: engine rejected module:", e.message); }
  process.exit(1);
}
const mod = await WebAssembly.compile(bytes);
const imports = WebAssembly.Module.imports(mod);
const kinds = [...new Set(imports.map((i) => i.kind))].join(",");
const mem = imports.find((i) => i.kind === "memory");
console.log(`verify-wasm: ok (${bytes.length} bytes, ${imports.length} imports [${kinds}]${mem ? ", imported memory" : ""})`);
' "$WASM"

# Optional structural check with a conservative feature set.
if command -v wasm-tools >/dev/null 2>&1; then
  wasm-tools validate --features mvp,mutable-global,sign-extension,saturating-float-to-int,multi-value,reference-types,bulk-memory "$WASM"
  echo "verify-wasm: wasm-tools validate (conservative features) ok"
fi
