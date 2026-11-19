const VERSION = "inkos-v9";
const STATIC = VERSION + "-static";
const RUNTIME = VERSION + "-rt";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./theme/catppuccin.css",
  "./icons.svg",
  "./pkg/inkos.js",
  "./pkg/inkos_bg.wasm",
  "./js/wm.js",
  "./js/mobile.js",
  "./js/terminal.js",
  "./js/apps.js",
  "./js/bench.js",
  "./js/session.js",
  "./js/swap.worker.js",
  "./js/appload.js",
  "./js/vfs.js",
  "./js/apps/finder.js",
  "./js/apps/browser.js",
  "./js/apps/shell.js",
  "./js/apps/cmd-exe.js",
  "./js/apps/settings.js",
  "./js/apps/monitor.js",
  "./apps/registry.json",
];
const HEAVY = /\/(pkg|apps)\/.*\.(wasm|js)$/;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATIC).then((c) => Promise.allSettled(ASSETS.map((u) => c.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) {
        if (!k.startsWith(VERSION)) await caches.delete(k);
      }
      await self.clients.claim();
    })()
  );
});

const put = async (name, req, resp) => {
  if (resp && resp.ok && resp.type === "basic" && resp.status === 200) {
    (await caches.open(name)).put(req, resp.clone());
  }
  return resp;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.headers.has("range")) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => put(STATIC, "./index.html", r))
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (HEAVY.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (c) => c || fetch(req).then((r) => put(RUNTIME, req, r))
      )
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((c) => {
      const net = fetch(req)
        .then((r) => put(RUNTIME, req, r))
        .catch(() => c);
      return c || net;
    })
  );
});
