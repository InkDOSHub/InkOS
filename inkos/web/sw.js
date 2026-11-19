const VERSION = "inkos-arch-cachy-v1";
const CACHE = `inkos-cache-${VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./_headers",
  "./usr/share/themes/arch-cachy.css",
  "./usr/share/icons/icons.svg",
  "./boot/kernel-bridge.js",
  "./boot/swap.worker.js",
  "./sys/wm.js",
  "./sys/appload.js",
  "./sys/mobile.js",
  "./usr/apps/hub-runtime.js",
  "./usr/bin/settings.js",
  "./pkg/inkos.js",
  "./pkg/inkos_bg.wasm"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

