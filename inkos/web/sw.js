// InkOS service worker.
// VERSION and PRECACHE are rewritten by scripts/build.sh from the dist/ content hash.
// Strategy: network-first for same-origin GETs (keeps inkos.js and inkos_bg.wasm
// from the same build), cache fallback when offline. Cached responses keep the
// original COOP/COEP headers, so crossOriginIsolated survives an offline reload.
const VERSION = "inkos-dev";
const PRECACHE = ["./", "./index.html"];
const CACHE = `inkos-${VERSION}`;
const HUB_CACHE = "inkos-hub-registry";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("inkos-") && k !== CACHE && k !== HUB_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isHubRegistry(url) {
  return url.pathname.endsWith("/registry.json") && url.origin !== self.location.origin;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (hit) return hit;
    if (request.mode === "navigate") {
      const shell = await cache.match("./index.html");
      if (shell) return shell;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(HUB_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (isHubRegistry(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
