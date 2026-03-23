const CACHE_NAME = "estoque-intel-mobile-v1";
const URLS_TO_CACHE = [
  "/squads/caixa-escolar/dashboard/gdp-estoque-intel-mobile.html",
  "/squads/caixa-escolar/dashboard/manifest-estoque-intel.json",
  "/squads/caixa-escolar/dashboard/icon-entregador-192.png",
  "/squads/caixa-escolar/dashboard/icon-entregador-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
