const CACHE = "inkos-shell-v1";
const CORE = ["./", "./index.html", "./manifest.json", "./theme/catppuccin.css", "./icons.svg", "./js/wm.js", "./js/mobile.js", "./js/terminal.js"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const response = cached || await fetch(request);
    if (request.mode !== "navigate") return response;
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    return new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers });
  })());
});
