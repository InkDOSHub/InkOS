# BLOCKED

B1 tag push. `git push origin refs/tags/pre-autopilot-2026-11-20` → HTTP 403 (proxy da sessão só libera branches). humano: `git tag pre-autopilot-2026-11-20 842113e && git push origin pre-autopilot-2026-11-20`.
B2 WebKit. Playwright WebKit não instalado (/opt/pw-browsers só chromium); regra do ambiente proíbe `playwright install`. E2E só Chromium. humano: `npx playwright install webkit && npm run test:e2e` ou rodar DEVICE-CHECKLIST no Safari.
B3 deploy produção. Pages ligado ao git: preview do branch deployado e verificado (12/12, evidence/e1-7-preview.txt). produção = merge em main; sem merge nesta sessão (D2). sem wrangler/token → rollback manual via dashboard Pages se preciso. humano: revisar PR e dar merge; prod rebuilda sozinho.
