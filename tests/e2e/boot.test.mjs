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

  test(`${name}: .inkos freeze / wake through Shell`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    const { ctx, page, errors } = await bootPage(b);
    await dockClick(page, "Terminal");
    const sh = page.locator("#sh-in");
    await sh.waitFor();
    const run = async (cmd, wait = 200) => { await sh.fill(cmd); await sh.press("Enter"); await page.waitForTimeout(wait); };
    await run("write /Home/keep.txt segredo-123");
    await run("freeze pw-e2e-correta", 2500);
    await run("rm /Home/keep.txt");
    await run("wake senha-errada", 2500);
    let out = await page.locator("#sh-out").innerText();
    assert.match(out, /senha incorreta ou arquivo corrompido/);
    await page.waitForTimeout(1200); // UX backoff after a failure
    await run("wake pw-e2e-correta", 3000);
    await run("cat /Home/keep.txt");
    out = await page.locator("#sh-out").innerText();
    assert.match(out, /Sessão despertada/);
    assert.ok(out.trim().endsWith("segredo-123"), out.slice(-200));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${name}: OPFS swap integrity under forced eviction`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    const { ctx, page, errors } = await bootPage(b);
    const r = await page.evaluate(async () => {
      const k = window.inkOS;
      if (k.diag.swap !== "opfs") return { skipped: k.diag.swapReason };
      const { Swap } = await import("./js/swap.js");
      const sw = new Swap({ memory: k.memory, control: k.control, pager: new k.InkPager(8, 256) });
      const PAGES = 64;
      const sum = (off) => { const v = new Uint8Array(k.memory.buffer, off, 65536); let s = 0; for (let i = 0; i < v.length; i += 97) s = (s * 31 + v[i]) >>> 0; return s; };
      const want = [];
      for (let p = 0; p < PAGES; p++) {
        const off = await sw.access(p);
        const v = new Uint8Array(k.memory.buffer, off, 65536);
        for (let i = 0; i < v.length; i += 97) v[i] = (p * 13 + i) & 255;
        want[p] = sum(off);
      }
      let bad = 0;
      for (let round = 0; round < 3; round++) for (let p = PAGES - 1; p >= 0; p--) if (sum(await sw.access(p)) !== want[p]) bad++;
      let x = 7;
      for (let i = 0; i < 2000; i++) { x = (x * 1103515245 + 12345) >>> 0; const p = x % PAGES; if (sum(await sw.access(p)) !== want[p]) bad++; }
      const st = sw.stats();
      const maxBytes = k.memory.buffer.byteLength;
      await sw.wipe();
      return { bad, st, maxBytes, after: sw.stats() };
    });
    if (r.skipped) return t.skip(r.skipped);
    assert.equal(r.bad, 0, "checksum mismatch after eviction");
    assert.ok(r.st.resident <= 8 && r.st.swapped > 0, JSON.stringify(r.st));
    assert.equal(r.after.swapFileBytes, 0);
    assert.ok(r.maxBytes <= 32 * 1024 * 1024, `pool grew to ${r.maxBytes}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${name}: InkBench device page runs and exports JSON`, { timeout: 120_000 }, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(new URL("bench/device.html", baseURL).href);
    await page.click("#run");
    await page.waitForFunction(() => !document.querySelector("#json").hidden, null, { timeout: 110_000 });
    const r = JSON.parse(await page.locator("#json").innerText());
    assert.equal(r.schema, "inkbench/1");
    for (const k of ["cpu.int", "cpu.float", "cpu.sha256", "cpu.matmul", "mem.copy", "mem.alloc"]) assert.ok(r.kernels[k] > 0, k);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`${name}: Hub registry by reference, app iframe follows theme`, { timeout: 90_000 }, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    const { ctx, page, errors } = await bootPage(b, { theme: "latte" });
    await page.click("#top-apps-btn");
    await page.waitForSelector("#app-grid .app-tile[data-app-id='foto']", { timeout: 20000 });
    const kinds = await page.$$eval("#app-grid .app-tile small", (els) => els.map((e) => e.textContent));
    const hub = kinds.filter((k) => k.startsWith("Hub")).length;
    assert.ok(hub >= 25, `hub apps in launcher: ${hub}`);
    if (!kinds.includes("Hub")) return t.skip("Hub offline: snapshot used");
    assert.equal(await page.locator(".window iframe").count(), 0, "no iframe before opening (lazy)");
    await page.click("#app-grid .app-tile[data-app-id='foto']");
    const fr = page.locator('.window[data-win-id="hub-foto"] iframe');
    await fr.waitFor();
    assert.equal(await fr.getAttribute("data-hub-origin"), "https://hub.inkdos.workers.dev");
    const frame = await (await fr.elementHandle()).contentFrame();
    await frame.waitForLoadState("load");
    await frame.waitForFunction(() => document.documentElement.dataset.theme === "light", null, { timeout: 15000 });
    await page.click("#theme-toggle");
    await frame.waitForFunction(() => document.documentElement.dataset.theme === "dark", null, { timeout: 15000 });
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
      const topOverflow = await page.$eval(".topbar", (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
      assert.equal(topOverflow, false, `${dev}: topbar overflows`);
      // modifier bar: arrow key reaches the focused shell input; Ctrl sticky / lock
      await page.tap("#dock .dock-item >> nth=3");
      const sh = page.locator("#sh-in");
      await sh.waitFor();
      await sh.fill("pwd");
      await sh.press("Enter");
      await page.tap("#keys-toggle");
      await page.tap('#modifier-bar button[data-key="ArrowUp"]');
      assert.equal(await sh.inputValue(), "pwd", `${dev}: ArrowUp from modifier bar`);
      const ctrl = page.locator('#modifier-bar button[data-key="Control"]');
      await ctrl.tap();
      assert.match(await ctrl.getAttribute("class") || "", /mod-on/);
      await ctrl.tap();
      await ctrl.tap();
      await page.waitForTimeout(50);
      await page.screenshot({ path: `${SHOTS}/${name}-${dev.replace(/\s+/g, "-")}.png` });
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });
}

// Long press through real touch events (CDP), as a phone would send them.
async function longPress(page, x, y, ms = 750) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function twoFingerTap(page, x, y) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  await page.waitForTimeout(80);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

for (const name of wanted) {
  test(`${name}: context menu by right click, long press and two-finger tap`, async (t) => {
    const b = browsers[name];
    if (!b) return t.skip();
    // Mouse: right click on a window title bar.
    {
      const { ctx, page, errors } = await bootPage(b);
      await dockClick(page, "Finder");
      const win = page.locator('.window[data-win-id="native-finder"]');
      await win.waitFor();
      await win.locator(".window-title").click({ button: "right", position: { x: 200, y: 10 } });
      await page.locator(".ctx-menu").waitFor();
      await page.locator(".ctx-item", { hasText: "Minimizar" }).click();
      await page.waitForFunction(() => document.querySelector('.window[data-win-id="native-finder"]').style.display === "none");
      // The next normal click still works (nothing swallowed).
      await dockClick(page, "Terminal");
      await page.locator("#sh-in").waitFor();
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    if (name !== "chromium") return; // CDP touch input is Chromium only
    for (const dev of ["iPhone 15 Pro Max", "iPad Pro 11"]) {
      const opts = { ...pw.devices[dev] };
      delete opts.defaultBrowserType;
      const ctx = await b.newContext(opts);
      const { page, errors } = await bootPage(b, { context: ctx });
      // Long press on the empty desktop opens the desktop menu; tap opens Finder.
      const desk = await page.locator("#desktop").boundingBox();
      await longPress(page, desk.x + desk.width / 2, desk.y + desk.height / 2);
      await page.locator(".ctx-menu").waitFor({ timeout: 3000 });
      assert.equal(await page.locator(".ctx-menu").count(), 1, `${dev}: one menu only`);
      await page.waitForTimeout(400);
      await page.locator(".ctx-item", { hasText: "Finder" }).tap();
      const win = page.locator('.window[data-win-id="native-finder"]');
      await win.waitFor();
      // New folder via the Finder background menu (two-finger tap).
      const list = await win.locator("#f-list").boundingBox();
      await twoFingerTap(page, list.x + 20, list.y + list.height - 30);
      await page.locator(".ctx-item", { hasText: "Nova pasta" }).waitFor({ timeout: 3000 });
      await page.waitForTimeout(400);
      await page.locator(".ctx-item", { hasText: "Nova pasta" }).tap();
      const card = win.locator("#f-list > button", { hasText: "e2e-item" }).first();
      await card.waitFor();
      // Long press on the item: menu for that item, rename works.
      const cb = await card.boundingBox();
      await longPress(page, cb.x + cb.width / 2, cb.y + cb.height / 2);
      await page.locator(".ctx-item", { hasText: "Renomear" }).waitFor({ timeout: 3000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/${name}-ctxmenu-${dev.replace(/\s+/g, "-")}.png` });
      await page.locator(".ctx-item", { hasText: "Excluir" }).tap();
      await page.waitForFunction(() => ![...document.querySelectorAll("#f-list > button")].some((b) => b.textContent.includes("e2e-item")));
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  });
}
