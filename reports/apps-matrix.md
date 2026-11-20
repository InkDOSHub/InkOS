# apps-matrix

ger: tests/e2e/apps-matrix.mjs. browser: Chromium headless (WebKit: BLOQUEADO B2). registry: 25 apps, fonte hub (https://hub.inkdos.workers.dev/InkOS/apps/registry.json). InkOS: dist/ local c/ headers prod.

crit: 1 carrega iframe sob COOP/COEP · 2 lazy (0 iframes antes de abrir) · 3 tema ink-tema (Mocha→dark, Latte→light) · 4 inkos-vfs-file · 5 heap JS da aba após abrir · 6 erros console · 7 offline · 8 sandbox · 9 screenshots · 10 licença.

| app | 1 load | crossOriginIsolated no app | 2 lazy | 3 tema | 4 vfs-file | 5 heap MiB | 6 erros | 7 offline | 8 sandbox | 9 shots | 10 licença |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PDF (`pdf`) | ok | true | ok | não (light) | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 4 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Edit PDF (`editar-pdf`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Security (`seguranca`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Documents · ArtCraft (`wordcraft`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 5 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Spreadsheets · ArtCraft (`gridcraft`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 5 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Presentations · ArtCraft (`deckcraft`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 4 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Documents · InkDOS (`documentos`) | ok | true | ok | não (light) | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 4 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Spreadsheets · InkDOS (`planilhas`) | ok | true | ok | não (light) | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 4 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Presentations · InkDOS (`apresentacoes`) | ok | true | ok | não (light) | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 4 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Plain text (`texto`) | ok | true | ok | não (light) | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| EPUB reader (`epub`) | ok | true | ok | não (light) | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Photos (`foto`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Video (`video`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Music (`musica`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Recorder (`gravador`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Webcam (`webcam`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Transfer (`transferir`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Whiteboard (`quadro`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 7 | 460 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Code (`codigo`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 47 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Linux terminal (`terminal`) | ok | true | ok | não (sem data-theme) | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 4 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Zip (`zip`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| AI Chat (`ia`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| InkSoC (`wine`) | ok | true | ok | não (sem data-theme) | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Games (`jogos`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |
| Wasm Build (`wasm`) | ok | true | ok | ok | PARCIAL: Hub não escuta (PR Hub adiciona evento) | 3 | 0 | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git) | ver Hub LICENCAS.md |

## erros de console (amostra)

- `quadro`: [mocha] Loading the font 'https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/Cascadia/CascadiaCode-Regular.woff2' violates the following Content Security Poli ; [mocha] Loading the font 'https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/ComicShanns/ComicShanns-Regular-279a7b317d12eb88de06167bd672b4b4.woff2' violates  ; [mocha] Loading the font 'https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/ComicShanns/ComicShanns-Regular-fcb0fc02dcbee4c9846b3e2508668039.woff2' violates 
