// E2E suite for InkOS. Runs against dist/ (local server with production headers)
// or against INKOS_URL (preview / production).
// Browsers: INKOS_BROWSERS=chromium,webkit (default: whatever is installed).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { serve } from "../serve.mjs";

const require = createRequire(import.meta.url);
const pw = require("playwright");
const SHOTS = process.env.INKOS_SHOTS || "reports/evidence/screens";
mkdirSync(SHOTS, { recursive: true });

let server;
let baseURL = process.env.INKOS_URL;
const wanted = (process.env.INKOS_BROWSERS || "chromium,webkit").split(",");
const browsers = {};

before(async () => {
  if (!baseURL) {
    server = await serve(process.env.INKOS_DIST || "dist", 0);
    baseURL = `http://127.0.0.1:${server.address().port}/`;
  }
  for (const name of wanted) {
    try {
      browsers[name] = await pw[name].launch();
    } catch (e) {
      console.log(`# skip ${name}: ${e.message.split("\n")[0]}`);
    }
  }
  assert.ok(Object.keys(browsers).length > 0, "no browser available");
});

after(async () => {
  for (const b of Object.values(browsers)) await b.close();
  server?.close();
});

async function bootPage(browser, { theme, viewport = { width: 1280, height: 800 }, context } = {}) {
  const ctx = context || (await browser.newContext({ viewport }));
  if (theme) await ctx.addInitScript((t) => localStorage.setItem("inkos-prefs-v1", JSON.stringify({ theme: t })), theme);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept(d.defaultValue() || "e2e-item"));
  await page.goto(baseURL, { waitUntil: "load" });
  await page.waitForFunction(() => window.inkOS?.diag && !window.inkOS.diag.booting, null, { timeout: 15000 });
  return { ctx, page, errors };
}

const dockClick = (page, label) => page.locator("#dock .dock-item", { hasText: label }).first().click();

for (const name of wanted) {
  test(`${name}: boot without errors, isolated, wasm loaded`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip(`${name} not installed`);
    const { ctx, page, errors } = await bootPage(b);
    const diag = await page.evaluate(() => window.inkOS.diag);
    assert.equal(await page.evaluate(() => crossOriginIsolated), true);
    assert.equal(diag.wasmLoaded, true, diag.lastError || "wasm not loaded");
    assert.equal(diag.wasiCompiled, true);
    assert.equal(diag.lastError, null);
    assert.ok(["mt", "st"].includes(diag.profile));
    assert.ok(diag.poolBytes <= 32 * 1024 * 1024, `initial pool ${diag.poolBytes} > 32 MiB`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${name}: icons, dock, native apps mount`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    const { ctx, page, errors } = await bootPage(b);
    const res = await page.request.get(new URL("icons.svg", baseURL).href);
    assert.equal(res.status(), 200);
    const svg = await res.text();
    for (const id of ["i-apps", "i-finder", "i-browser", "i-terminal", "i-cmd", "i-monitor", "i-settings", "i-window"]) {
      assert.ok(svg.includes(`id="${id}"`), `icon ${id} missing`);
    }
    assert.equal(await page.locator("#dock .dock-item").count(), 7);
    for (const [label, id] of [["Finder", "finder"], ["Browser", "browser"], ["Terminal", "shell"], ["CMD/EXE", "cmdexe"], ["Monitor", "monitor"], ["Ajustes", "settings"]]) {
      await dockClick(page, label);
      const win = page.locator(`.window[data-win-id="native-${id}"]`);
      await win.waitFor();
      await page.waitForTimeout(300);
      const text = await win.locator(".window-body").innerText();
      assert.ok(!text.includes("Módulo pendente"), `${id}: ${text.slice(0, 200)}`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${name}: window drag, 8-way resize, minimize, maximize, close`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    const { ctx, page, errors } = await bootPage(b);
    await dockClick(page, "Monitor");
    const win = page.locator('.window[data-win-id="native-monitor"]');
    await win.waitFor();
    const box0 = await win.boundingBox();
    const tb = await win.locator(".win-title-text").boundingBox();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb.x + tb.width / 2 - 60, tb.y + tb.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    const box1 = await win.boundingBox();
    assert.ok(Math.abs(box1.x - (box0.x - 60)) < 3 && Math.abs(box1.y - (box0.y + 40)) < 3, "drag did not move window");

    const expect = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
    for (const [dir, [sx, sy]] of Object.entries(expect)) {
      const before = await win.boundingBox();
      const h = await win.locator(`.resize-handle.resize-${dir}`).boundingBox();
      const cx = h.x + h.width / 2, cy = h.y + h.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + sx * 30, cy + sy * 30, { steps: 4 });
      await page.mouse.up();
      const afterBox = await win.boundingBox();
      if (sx) assert.ok(Math.abs(afterBox.width - before.width - 30) < 4, `${dir}: width ${before.width}->${afterBox.width}`);
      if (sy) assert.ok(Math.abs(afterBox.height - before.height - 30) < 4, `${dir}: height ${before.height}->${afterBox.height}`);
    }

    await win.locator(".mac-light.max").click();
    const maxBox = await win.boundingBox();
    const desk = await page.locator("#desktop").boundingBox();
    assert.ok(maxBox.width >= desk.width - 4, "maximize did not fill desktop");
    await win.locator(".mac-light.max").click();
    await win.locator(".mac-light.min").click();
    assert.equal(await win.isVisible(), false);
    await dockClick(page, "Monitor");
    assert.equal(await win.isVisible(), true);
    await win.locator(".mac-light.close").click();
    assert.equal(await page.locator('.window[data-win-id="native-monitor"]').count(), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${name}: workspaces isolate windows`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    const { ctx, page } = await bootPage(b);
    await dockClick(page, "Monitor");
    const win = page.locator('.window[data-win-id="native-monitor"]');
    await win.waitFor();
    await page.click("#ws-toggle");
    await page.click('.ws-card[data-ws="2"]');
    assert.equal(await win.isVisible(), false);
    await page.click('.ws-card[data-ws="1"]');
    assert.equal(await win.isVisible(), true);
    await ctx.close();
  });

  test(`${name}: shell, cmd, finder, browser vfs://`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    const { ctx, page, errors } = await bootPage(b);
    await dockClick(page, "Terminal");
    const sh = page.locator("#sh-in");
    await sh.waitFor();
    for (const cmd of ["mkdir /Home/e2e", "write /Home/e2e/a.txt ola-inkos", "cat /Home/e2e/a.txt", "ls /Home/e2e", "pwd", "diag"]) {
      await sh.fill(cmd);
      await sh.press("Enter");
      await page.waitForTimeout(150);
    }
    const out = await page.locator("#sh-out").innerText();
    assert.ok(out.includes("ola-inkos"), "cat did not print file content");
    assert.ok(out.includes("a.txt"), "ls did not list file");

    await dockClick(page, "CMD/EXE");
    const cmdIn = page.locator("#cmd-in");
    await cmdIn.waitFor();
    await cmdIn.fill("help");
    await cmdIn.press("Enter");
    await page.waitForTimeout(150);
    assert.ok((await page.locator("#cmd-out").innerText()).length > 40);

    // .EXE installer: MZ signature detection
    await page.setInputFiles("#exe-file", { name: "hello.exe", mimeType: "application/octet-stream", buffer: Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]) });
    await page.waitForTimeout(500);
    assert.match(await page.locator("#cmd-out").innerText(), /MZ: SIM/);

    await dockClick(page, "Browser");
    const url = page.locator("#br-url");
    await url.waitFor();
    await url.fill("vfs:///Home/e2e/a.txt");
    await url.press("Enter");
    await page.waitForTimeout(600);
    const stage = page.locator("#br-stage");
    const frame = stage.locator("iframe");
    const stageText = (await frame.count()) ? await frame.contentFrame().locator("body").innerText() : await stage.innerText();
    assert.ok(stageText.includes("ola-inkos"), `vfs:// view: ${stageText.slice(0, 120)}`);

    await dockClick(page, "Finder");
    await page.locator("#f-list").waitFor();
    await page.click("#f-new-dir"); // dialog auto-accepted with "e2e-item"
    await page.waitForTimeout(300);
    assert.ok((await page.locator("#f-list").innerText()).includes("e2e-item"), "finder mkdir");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${name}: themes Latte/Mocha + screenshots`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    for (const theme of ["mocha", "latte"]) {
      const { ctx, page, errors } = await bootPage(b, { theme });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      await dockClick(page, "Finder");
      await page.locator("#f-list").waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/${name}-${theme}.png` });
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });

  test(`${name}: offline reload keeps isolation (service worker)`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    const ctx = await b.newContext();
    const { page } = await bootPage(b, { context: ctx });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "load" }); // now controlled by SW
    await page.waitForFunction(() => navigator.serviceWorker.controller && window.inkOS?.diag && !window.inkOS.diag.booting);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.inkOS?.diag && !window.inkOS.diag.booting, null, { timeout: 15000 });
    const r = await page.evaluate(() => ({ coi: crossOriginIsolated, diag: window.inkOS.diag, sw: Boolean(navigator.serviceWorker.controller) }));
    assert.equal(r.sw, true, "offline reload not served by SW");
    assert.equal(r.coi, true);
    assert.equal(r.diag.wasmLoaded, true, r.diag.lastError || "");
    await ctx.close();
  });

  test(`${name}: mobile emulation (iPhone / iPad) layout`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    for (const dev of ["iPhone 15 Pro Max", "iPad Pro 11"]) {
      const d = pw.devices[dev];
      if (!d) continue;
      const opts = { ...d };
      if (name === "chromium") delete opts.defaultBrowserType;
      const ctx = await b.newContext(opts);
      const { page, errors } = await bootPage(b, { context: ctx });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `${dev}: horizontal overflow`);
      const small = await page.$$eval("#dock .dock-item", (els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
      assert.equal(small, 0, `${dev}: dock targets < 44px`);
      await page.screenshot({ path: `${SHOTS}/${name}-${dev.replace(/\s+/g, "-")}.png` });
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });
}
