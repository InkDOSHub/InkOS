# DEVICE-CHECKLIST (PENDENTE-DISPOSITIVO)

url: https://autopilot-2026-11-20.inkos-5k7.pages.dev/ (preview) → depois https://inkos-5k7.pages.dev (pós-merge).
marcar ✓/✗ + modelo/versão iOS/Safari. ✗ → print + console (Safari > Desenvolver).

## Safari macOS + iPhone + iPad
- [ ] boot sem "can't get 0th Import's kind"; selo topo = "SAB • mt" (ou "Compat • st" se sem isolamento)
- [ ] Monitor: perfil, pool 16 MiB, swap "ativo" (OPFS) ou motivo
- [ ] janela: abrir, arrastar, redimensionar 8 lados, min/max/fechar
- [ ] workspaces: trocar, mover janela
- [ ] Finder: criar pasta, importar arquivo, renomear, apagar
- [ ] Terminal: `ls`, `search / --ext txt`, `rename <dir> a b --preview`, `sync /a /b --preview`
- [ ] Congelar → baixar .inkos → recarregar → Acordar c/ senha certa ok; senha errada recusa sem mudar nada
- [ ] tema Mocha/Latte troca desktop + apps do Hub que usam tema.js
- [ ] offline: abrir 1x online, modo avião, recarregar → desktop sobe
- [ ] Launcher: abrir 3 apps do Hub (pdf, quadro, terminal); 5º app fecha o mais antigo (teto 4)

## só toque (iPhone/iPad)
- [ ] tap = clique; 2 dedos rolam dentro da janela
- [ ] toque 2 dedos e toque longo = menu de contexto
- [ ] barra de teclas: Ctrl 1 toque = próxima tecla; 2 toques = trava; Tab/Esc/setas chegam no campo
- [ ] teclado na tela não cobre o campo nem a barra
- [ ] botões ≥ 44 px, topo não corta; girar tela reajusta janelas
- [ ] iPad c/ teclado físico + trackpad: clique direito, atalhos

## InkBench (veredito wasm vs nativo)
- [ ] abrir /bench/device.html no dispositivo, rodar, salvar JSON
- [ ] medir nativo no mesmo dispositivo (reference.json) e rodar `node bench/compare.mjs bench/results/<device>.json bench/reference.json`

## resultado 2026-11-20 (Paulo, iPhone Safari, preview a16a7cc)
- ✓ boot, janelas, botões de sinal, Ajustes, Finder, navegador, tema, Keys, menu de contexto (toque longo)
- ✗→✓ toques dentro de janela perdiam o click no WebKit iOS (redesenho da Dock no pointerdown). corrigido a16a7cc, confirmado no aparelho
- ○ atalhos de teclado físico (sem teclado no iPhone) · Ctrl na barra de teclas · InkBench JSON (link: /bench/device.html)
