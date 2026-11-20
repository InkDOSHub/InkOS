# REGRESSIONS

git history = 50 commits, todos 2026-11-19. primeiro commit (fdc4674) já tinha `wasm-opt --all-features` em scripts/build.sh. → nenhum commit "bom" de wasm no histórico. bisect inútil p/ erro de parse; causa achada por inspeção de bytes (evidence/e1-1.txt, e1-2.txt).

## achados (verificados por execução)
| # | commit | sintoma | ação |
|---|---|---|---|
| R1 | fdc4674 (build.sh) | `wasm-opt -O3 --all-features` → binaryen 132 grava import section em encoding compact-imports (0x7f). Safari "can't get 0th Import's kind", V8 "Invalid import kind 127". | corrigido: features explícitas + `--strip-target-features`; wasm-opt interno do wasm-pack desligado; verify-wasm.sh falha build |
| R2 | c08c8d7 (bot unpack do bundle Gemini) + a7c900d, 35b9f32 | index.html troca p/ tema "arch-cachy" + caminhos `./sys/*`, `./usr/share/*`, `./usr/bin/*` inexistentes → CSS/JS 404 servidos como HTML (fallback SPA) → erros MIME no console; `appload.registerSystemBin` não existe → apps nativos nunca registrados | revertido index.html p/ 248d0b6 (último coerente c/ appload/wm/catppuccin), boot movido p/ js/kernel.js |
| R3 | c08c8d7 / 47b2924 (sw.js) | ASSETS c/ caminhos inexistentes → `cache.addAll` rejeita → SW nunca instala → sem offline | sw.js reescrito; precache gerado do dist/ (gen-sw.mjs) |
| R4 | ff6d843 (wm.js Gemini) | classes `win`, `win-titlebar`, `win-btn`, `resize-handle n` ≠ CSS (`window`, `window-title`, `mac-light`, `resize-n`) → janelas sem moldura, handles sem posição | classes alinhadas ao CSS |
| R5 | 115e0ca CSS | handles de resize fora da borda c/ `overflow:hidden` → área clicável ~1px | handles dentro da caixa |
| R6 | 1c54bbc kernel-bridge.js | aloca SAB fixo 128–256 MiB no boot | removido; js/kernel.js: pool 16 MiB growable, teto 512 MiB |
| R7 | 43e8dd5/cda7d81/26e950c/842113e | Cargo.toml raiz criado/apagado, `cargo/config.toml` (manifest no lugar errado) | cargo/config.toml removido |
| R8 | 297537a | removeu +atomics de RUSTFLAGS (correto p/ stable) mas RUSTFLAGS env anulava .cargo/config | export removido; config.toml é a fonte |

## mantidos (verificados por E2E)
vfs.js, appload.js, finder/browser/shell/cmd-exe/monitor/settings.js: funcionam no E2E Chromium.
