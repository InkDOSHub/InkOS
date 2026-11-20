# PROGRESS (fonte da verdade)

branch: autopilot/2026-11-20. base 842113e (main). tag local `pre-autopilot-2026-11-20` = 842113e (push 403, B1). PR: InkDOSHub/InkOS#1 (sem merge, D2).

| ID | estado | commit | evid |
|---|---|---|---|
| E0.1 progress+tag+branch | PARCIAL | - | tags locais; push 403 → B1 |
| E0.2 inventário | FEITO | - | evidence/e0-2.txt |
| E0.3 graphify | FEITO | cff7360 | docs/graph/SUMMARY.md |
| E0.4 audit prod/proto | FEITO | - | evidence/e1-1.txt |
| E0.5 regressão | FEITO | - | REGRESSIONS.md (bisect inútil: wasm-opt ruim desde 1º commit) |
| E0.6 licenças | FEITO | b8b23a7 | THIRD_PARTY_LICENSES.md, evidence/e5-5-scan.txt |
| E1.1 reproduzir | FEITO (Chromium); WebKit BLOQUEADO B2 | - | evidence/e1-1.txt |
| E1.2 causa raiz | FEITO | - | evidence/e1-2.txt |
| E1.3 fix + perfis st/mt | FEITO (Chromium) | fc70563 | evidence/e1-6.txt |
| E1.4 higiene build | FEITO | fc70563 | evidence/e1-6.txt |
| E1.5 boot sem alocação gigante | FEITO | fc70563 | evidence/e1-5.txt |
| E1.6 E2E | PARCIAL: Chromium 12/12; WebKit BLOQUEADO B2 | 4b8244a | evidence/e5-5-e2e.txt |
| E1.7 deploy | PARCIAL: preview verde 12/12; prod = merge PR (D2) | 4b8244a | evidence/e1-7-preview.txt |
| E2.1 swap OPFS | FEITO (Chromium); dispositivo PENDENTE-DISPOSITIVO | c203551 | evidence/e2-1-rust.txt, e5-5-e2e.txt |
| E2.2 .inkos v1 | FEITO | a8dc1e5 | evidence/e2-2.txt, unit.txt |
| E2.3 UX mobile | PARCIAL: iPhone Safari confirmado (toque, janelas, menu); falta teclado físico e Ctrl | a16a7cc | evidence/e2-3.txt |
| E3.1 tag+graph satélites | PARCIAL: graph+PR ok; tags só locais (B1) | - | PRs InkSoC#17 InkShell#1 InkBench#1 InkMind#1 InkArcade#1 InkCam#1 wasm-build#1 Hub#78 |
| E3.2 escopo mínimo satélites | FEITO (via PR) | - | idem |
| E3.3 InkShell rootfs plan | FEITO (via PR) | - | InkShell#1 docs/ROOTFS-PLAN.md |
| E3.4 ECOSYSTEM.md | FEITO | b8b23a7 | docs/ECOSYSTEM.md |
| E4.1 descoberta registry | FEITO | cff7360 | DECISIONS D10 |
| E4.2/4.2a por referência + isolamento | FEITO (Chromium) | cff7360 | e5-5-e2e.txt (Hub registry+iframe) |
| E4.3 postMessage v1 | PARCIAL: InkOS feito; Hub lado em PR #78 | cff7360 | unit.txt, docs/PROTOCOL.md |
| E4.4 matriz apps | PARCIAL: 25/25 carregam; tema falha em 8; vfs-file depende Hub#78 | cff7360 | apps-matrix.md |
| E4.5 InkBench | PARCIAL: host geomean 0.841; veredito PENDENTE-DISPOSITIVO | cff7360 | evidence/bench-host.json |
| E4.6 modo Hub/Desktop (seam) | FEITO | cff7360 | docs/adr/ADR-modo-hub-desktop.md |
| E4.7 publicação | PARCIAL: SW gerado + preview verde; prod = merge | 4b8244a | e5-2.txt, e1-7-preview.txt |
| E5.1 inkmenu.py | FEITO (clean-room) | 1479877 | unit.txt (tools), D12 |
| E5.2 SW | FEITO | b8b23a7 | e5-2.txt |
| E5.3 empacotamento | PARCIAL: dist 396K ok; slim-zip/manifesto-offline são do Hub, não rodados | b8b23a7 | e5-2.txt |
| E5.4 README | FEITO | - | README.md |
| E5.5 suíte+scans | FEITO | 4b8244a | e5-5-e2e.txt, e5-5-scan.txt, unit.txt |
