# BLOCKED

B1 tag push. `git push origin refs/tags/pre-autopilot-2026-11-20` → HTTP 403 (proxy da sessão só libera branches). humano: `git tag pre-autopilot-2026-11-20 842113e && git push origin pre-autopilot-2026-11-20`.
B2 WebKit. Playwright WebKit não instalado (/opt/pw-browsers só chromium); regra do ambiente proíbe `playwright install`. E2E só Chromium. humano: `npx playwright install webkit && npm run test:e2e` ou rodar DEVICE-CHECKLIST no Safari.
B3 deploy Cloudflare. sem wrangler/CLOUDFLARE_API_TOKEN. BLOQUEADO-DEPLOY. dist/ gerado por `scripts/build.sh`. humano: merge do PR (se Pages ligado ao git) ou `wrangler pages deploy dist --project-name inkos-5k7 --branch autopilot-2026-11-20` (preview) e depois produção.
