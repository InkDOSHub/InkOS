# FINAL autopilot 2026-11-20

## estado
32 IDs: FEITO 22 · PARCIAL 9 · PENDENTE-DISPOSITIVO 1 · BLOQUEADO 0 inteiro (B1/B2/B3 tornam itens PARCIAL). tabela completa: PROGRESS.md.
| bloco | resumo |
|---|---|
| E0 | inventário, graph, licenças ok. tags só locais (B1) |
| E1 | causa raiz achada+corrigida. Chromium 12/12 local e preview. WebKit B2 |
| E2 | .inkos v1 ok; swap OPFS ok Chromium; mobile = emulação, falta device |
| E3 | 7 PRs satélite + Hub#78. ECOSYSTEM.md |
| E4 | Hub por referência, protocolo v1, 25/25 apps carregam, bench host, seam modo |
| E5 | search/rename/sync, SW, README, scans limpos |

## Gemini quebrou (REGRESSIONS.md)
- index.html → caminhos ./sys ./usr inexistentes, 404 servido como HTML, apps nativos nunca registrados
- sw.js precache c/ caminhos falsos → SW nunca instala → sem offline
- wm.js classes ≠ CSS → janelas sem moldura; handles resize fora da caixa
- kernel-bridge.js SAB fixo 128–256 MiB no boot
- cargo/config.toml lixo; RUSTFLAGS env anulando .cargo/config
- workflows deploy.yml/make-zip.yml fazem push direto em main (não mexido, D13)

## causa raiz parse Wasm
`wasm-opt -O3 --all-features` (binaryen 132) grava import section em compact-imports (0x7f). Safari "can't get 0th Import's kind", V8 "Invalid import kind 127". existe desde 1º commit. fix: features explícitas + `--strip-target-features`, wasm-opt do wasm-pack off, verify-wasm.sh barra build ruim.

## links
- preview: https://autopilot-2026-11-20.inkos-5k7.pages.dev/ (12/12 E2E)
- prod (ainda quebrada até merge): https://inkos-5k7.pages.dev
- InkOS PR: https://github.com/InkDOSHub/InkOS/pull/1
- Hub PR: https://github.com/InkDOSHub/inkdoshub.github.io/pull/78
- satélites: InkSoC#17, InkShell#1, InkBench#1, InkMind#1, InkArcade#1, InkCam#1, vfydr2m9wk-ops/inkdoshub-wasm-build#1
- tags `pre-autopilot-2026-11-20`: locais em todos os repos tocados, push 403

## BLOCKED
B1 push de tag 403 (proxy) → humano cria tag. B2 WebKit ausente, instalação proibida → Safari manual. B3 prod só via merge (Pages git), sem token Cloudflare.

## PENDENTE-DISPOSITIVO
DEVICE-CHECKLIST.md: Safari mac/iPhone/iPad boot+perfil, janelas, Finder, shell tools, .inkos, tema, offline, gestos, barra de teclas, InkBench veredito.

## riscos / próximos
1. revisar+merge InkOS#1 → prod rebuilda; checar prod logo após
2. merge Hub#78 antes/junto (vfs-file + tema v1); depois rerun apps-matrix
3. remover push-em-main de deploy.yml e make-zip.yml (podem sobrescrever o merge)
4. tema não segue em 8 apps (suíte InkDOS c/ CSP hash, terminal, wine)
5. quadro: 460 erros console (CSP fonte excalidraw)
6. rodar DEVICE-CHECKLIST; WebKit no CI
7. toggle Hub/Desktop no Hub: só ADR; app InkOS no Hub mantido
