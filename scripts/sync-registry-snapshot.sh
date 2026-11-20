#!/usr/bin/env bash
# Refreshes the offline registry snapshot from the Hub (the source of truth).
set -euo pipefail
URL="${1:-https://hub.inkdos.workers.dev/InkOS/apps/registry.json}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/inkos/web/apps/registry.json"
tmp=$(mktemp)
curl -fsSL "$URL" -o "$tmp"
node -e '
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!Array.isArray(d.apps) || !d.apps.length) throw new Error("registry has no apps");
const out = { $comment: "Offline snapshot of " + process.argv[2] + ". Source of truth is the Hub; refresh with scripts/sync-registry-snapshot.sh.", base: d.base || new URL("/", process.argv[2]).href, apps: d.apps };
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1) + "\n");
console.log(`snapshot: ${d.apps.length} apps`);
' "$tmp" "$URL" "$OUT"
rm -f "$tmp"
