const CACHE_NAME = "inkos-v1-offline";
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
  "./js/swap.worker.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return (
        cached ||
        fetch(e.request).then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return resp;
        })
      );
    })
  );
});
