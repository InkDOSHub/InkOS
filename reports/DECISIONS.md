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
