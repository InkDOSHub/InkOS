import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, themeMessage, fileMessage, send, listen } from "../../inkos/web/js/protocol.js";

test("theme message maps flavors to the Hub's light/dark", () => {
  assert.deepEqual(themeMessage("latte"), { v: 1, type: "ink-tema", theme: "light", flavor: "latte" });
  assert.equal(themeMessage("mocha", "#e5a373").accent, "#e5a373");
  assert.equal(themeMessage("mocha", "red;}").accent, undefined);
});

test("validate rejects unknown types, wrong version, bad payloads", () => {
  assert.equal(validate({ v: 2, type: "ink-tema", theme: "dark" }), null);
  assert.equal(validate({ v: 1, type: "eval", code: "x" }), null);
  assert.equal(validate({ v: 1, type: "ink-tema", theme: "blue" }), null);
  assert.equal(validate({ v: 1, type: "inkos-vfs-file", name: "../x", mime: "a", data: new ArrayBuffer(1) }), null);
  assert.equal(validate({ v: 1, type: "inkos-vfs-file", name: "a.txt", mime: "text/plain", data: "str" }), null);
  assert.ok(validate(fileMessage("/Home/a.txt", "text/plain", new Uint8Array([1, 2]))));
  assert.equal(validate(null), null);
});

test("send refuses wildcard origin and transfers file buffers", () => {
  const calls = [];
  const win = { postMessage: (...a) => calls.push(a) };
  assert.throws(() => send(win, "*", themeMessage("latte")), /explicit target origin/);
  const m = fileMessage("a.bin", "", new Uint8Array([1, 2, 3]));
  send(win, "https://hub.inkdos.workers.dev", m);
  assert.equal(calls[0][1], "https://hub.inkdos.workers.dev");
  assert.equal(calls[0][2][0], m.data);
  assert.equal(m.name, "a.bin");
});

test("listen drops messages from non-allowlisted origins", () => {
  const t = new EventTarget();
  const got = [];
  const stop = listen(t, ["https://hub.inkdos.workers.dev"], (m) => got.push(m.type));
  const ev = (origin, data) => Object.assign(new Event("message"), { origin, data });
  t.dispatchEvent(ev("https://evil.example", { v: 1, type: "inkos-ready" }));
  t.dispatchEvent(ev("https://hub.inkdos.workers.dev", { v: 1, type: "nope" }));
  t.dispatchEvent(ev("https://hub.inkdos.workers.dev", { v: 1, type: "inkos-ready", app: "foto" }));
  stop();
  t.dispatchEvent(ev("https://hub.inkdos.workers.dev", { v: 1, type: "inkos-ready" }));
  assert.deepEqual(got, ["inkos-ready"]);
});
