# DECISIONS

D1 tag rollback. push de tag → 403 do proxy. escolha: tag só local + SHA 842113e registrado. reverter: `git reset --hard 842113e` / redeploy desse commit.
D2 branch. usar `autopilot/2026-11-20` (pedido operador). PR p/ main, sem merge automático nesta sessão: produção Cloudflare liga em main e WebKit/Safari não testável aqui. reverter: fechar PR.
D3 perfil mt. wasm segue single-thread (stable 1.100, sem build-std/atomics). "mt" = pool WebAssembly.Memory shared + swap worker, escolhido por probe. build wasm atomics real = nightly+build-std → adiado (PARCIAL). reverter: n/a.
D4 toolchain. rust-toolchain.toml `stable` → `1.100.0` (determinístico).
D5 index.html. restaurado de 248d0b6 em vez de consertar a versão arch-cachy (API casa c/ appload/wm atuais, tema catppuccin pedido). reverter: `git checkout 842113e -- inkos/web/index.html`.
D6 SW network-first. evita glue novo + wasm velho. offline cai no cache. respostas cacheadas mantêm COOP/COEP.
D7 E2E sem @playwright/test: `node --test` + lib `playwright` (já instalada; não reinstalar browsers). WebKit pulado se ausente.
D8 graphify: ver E0.3.
D9 código morto removido (sem referências, verificado por grep): js/app-bridge.js (postMessage '*'), app-shell.js, app-template.js, apps.js, inkos.js, terminal.js, benchmark.js, bench.js, usr/apps/hub-runtime.js, theme/apps.css, boot/kernel-bridge.js. stubs inkos/web/apps/<id>/index.html (25 placeholders 'InkOS App') removidos: duplicavam apps do Hub; agora abre o app real do Hub por referência. reverter: git checkout 842113e -- <path>.
D10 registry. fonte = https://hub.inkdos.workers.dev/InkOS/apps/registry.json (CORS *, CORP cross-origin, COEP require-corp no Hub → iframe cross-origin ok). snapshot offline em inkos/web/apps/registry.json (scripts/sync-registry-snapshot.sh). URL configurável: ?hub= ou localStorage inkos-hub-registry.
D11 tema. tema.js do Hub só aceita theme light|dark; InkOS mandava latte|mocha (nunca funcionou). protocolo v1 manda theme light|dark + flavor latte|mocha (compatível c/ tema.js atual).
D12 E5.1 inkmenu.py achado em inkdoshub.github.io/apps/seguranca/native/inkmenu.py (MIT, mesmo autor). mesmo assim reimpl. clean-room do comportamento observado (search/rename/sync) em js/tools.js; comandos shell `search`, `rename`, `sync`, todos c/ --preview. sync nunca apaga; recusa destino dentro da origem.
D13 workflows deploy.yml/make-zip.yml (era Gemini) fazem commit+push direto em main a partir de zip/dumps .txt → podem sobrescrever código. não alterados (mudar CI de deploy = fora do escopo conservador). recomendação no FINAL: remover passo "commit back to main" e make-zip.yml após revisão.
D14 hub PR: tema.js aceita só parent + origens allowlist (self, inkos-5k7.pages.dev, *.inkos-5k7.pages.dev). PR #78, sem merge.
D15 rodada 2 (pedidos Paulo 2026-11-20 manhã). arquivo p/ app Hub: InkOS segura arquivo até inkos-ready (fallback 4 s). Hub: assets/inkos-bridge.js (tema + inkos-vfs-file → InkDOSFileLaunch.routeFile ou input[type=file]). suite inkdos/* inclui bridge (CSP script-src 'self' ok).
D16 .exe/.msi/.lnk no Finder e `install`/`run` no CMD → app Hub "wine" (InkSoC) c/ arquivo; InkSoC copia p/ C:\InkSoC\Downloads e roda (openPath). Linux completo = app Hub "terminal" (InkShell): Dock "Linux" + comando `linux [arq]`.
D17 Browser: iframe credentialless (Chromium). Safari sem credentialless + COEP require-corp → site externo não carrega em iframe; mostra cartão "Abrir em nova aba". sites c/ X-Frame-Options nunca carregam em iframe.
D18 barra superior: menu "InkOS" à esquerda (workspaces, teclas, tema, tela cheia, sobre, ajustes); botões Applications/WS/Keys/Tema saíram (Apps fica na Dock). nome visível "InkOS Desktop" (sem COSMIC); id interno do wallpaper "cosmic-dusk" mantido p/ prefs salvas.
D19 tela externa iOS: só espelhamento (sem Presentation API/Window Management); fullscreen API no iPhone só vídeo. manifest display fullscreen + apple-touch-icon p/ PWA sem barra do Safari.
