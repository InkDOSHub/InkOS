// Opens every Hub registry app inside InkOS (dist/ with production headers, or
// INKOS_URL) and writes reports/apps-matrix.md + screenshots.
// Usage: node tests/e2e/apps-matrix.mjs
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { serve } from "../serve.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const SHOTS = "reports/evidence/screens/apps";
mkdirSync(SHOTS, { recursive: true });

let server;
let base = process.env.INKOS_URL;
if (!base) {
  server = await serve(process.env.INKOS_DIST || "dist", 0);
  base = `http://127.0.0.1:${server.address().port}/`;
}
const browser = await chromium.launch();
const rows = [];

async function boot(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((t) => localStorage.setItem("inkos-prefs-v1", JSON.stringify({ theme: t })), theme);
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "load" });
  await page.waitForFunction(() => window.inkOS?.diag && !window.inkOS.diag.booting);
  return { ctx, page };
}

const { ctx: c0, page: p0 } = await boot("mocha");
const registry = await p0.evaluate(async () => {
  const m = await import("./js/appload.js");
  const r = await m.loadHubRegistry();
  return { source: r.source, url: r.url, apps: r.apps.map((a) => ({ id: a.id, name: a.name, url: a.url, tab: !!a.tab })) };
});
await c0.close();
console.log(`registry: ${registry.apps.length} apps from ${registry.source}`);

for (const app of registry.apps) {
  const row = { ...app, load: "?", lazy: "?", theme: "?", errors: [], heapMiB: "?", coi: "?" };
  for (const theme of ["mocha", "latte"]) {
    const { ctx, page } = await boot(theme);
    const errs = [];
    page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)));
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
    const framesBefore = page.frames().length;
    row.lazy = framesBefore === 1 ? "ok" : `frames antes=${framesBefore}`;
    try {
      await page.evaluate((id) => window.inkOS.openApp(id), app.id);
      const iframe = page.locator(`.window[data-win-id="hub-${app.id}"] iframe`);
      await iframe.waitFor({ timeout: 10000 });
      const frame = await (await iframe.elementHandle()).contentFrame();
      await frame.waitForLoadState("load", { timeout: 30000 });
      await page.waitForTimeout(2500);
      const info = await frame.evaluate(() => ({
        theme: document.documentElement.dataset.theme || "",
        coi: self.crossOriginIsolated,
        title: document.title,
        bodyLen: document.body?.innerText?.length || 0,
      })).catch((e) => ({ err: e.message }));
      if (info.err) row.load = `falha: ${info.err.slice(0, 80)}`;
      else {
        row.load = info.bodyLen > 0 || info.title ? "ok" : "vazio";
        row.coi = String(info.coi);
        const want = theme === "latte" ? "light" : "dark";
        const ok = info.theme === want || info.theme === theme;
        row.theme = row.theme === "?" || row.theme === "ok" ? (ok ? "ok" : `não (${info.theme || "sem data-theme"})`) : row.theme;
      }
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Performance.enable");
      const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      row.heapMiB = (m.JSHeapUsedSize / 2 ** 20).toFixed(0);
      await page.screenshot({ path: `${SHOTS}/${app.id}-${theme}.png` });
    } catch (e) {
      row.load = `falha: ${e.message.split("\n")[0].slice(0, 80)}`;
    }
    row.errors.push(...errs.map((e) => `[${theme}] ${e}`));
    await ctx.close();
  }
  rows.push(row);
  console.log(app.id, row.load, row.theme, row.errors.length);
}
await browser.close();
server?.close();

const esc = (s) => String(s).replace(/\|/g, "\\|");
let md = `# apps-matrix\n\nger: tests/e2e/apps-matrix.mjs. browser: Chromium headless (WebKit: BLOQUEADO B2). registry: ${registry.apps.length} apps, fonte ${registry.source} (${registry.url}). InkOS: ${process.env.INKOS_URL || "dist/ local c/ headers prod"}.\n\n`;
md += `crit: 1 carrega iframe sob COOP/COEP · 2 lazy (0 iframes antes de abrir) · 3 tema ink-tema (Mocha→dark, Latte→light) · 4 inkos-vfs-file · 5 heap JS da aba após abrir · 6 erros console · 7 offline · 8 sandbox · 9 screenshots · 10 licença.\n\n`;
md += `| app | 1 load | crossOriginIsolated no app | 2 lazy | 3 tema | 4 vfs-file | 5 heap MiB | 6 erros | 7 offline | 8 sandbox | 9 shots | 10 licença |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) {
  md += `| ${esc(r.name)} (\`${r.id}\`) | ${esc(r.load)} | ${r.coi} | ${r.lazy} | ${esc(r.theme)} | PARCIAL: Hub não escuta (PR Hub adiciona evento) | ${r.heapMiB} | ${r.errors.length} | PENDENTE (SW do Hub) | padrão appload | gerado (fora do git, 16 MB) | ver Hub LICENCAS.md |\n`;
}
md += `\n## erros de console (amostra)\n\n`;
for (const r of rows) if (r.errors.length) md += `- \`${r.id}\`: ${esc(r.errors.slice(0, 3).join(" ; "))}\n`;
writeFileSync("reports/apps-matrix.md", md);
console.log("wrote reports/apps-matrix.md");
