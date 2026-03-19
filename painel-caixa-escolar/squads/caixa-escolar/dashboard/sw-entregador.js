const CACHE_NAME = 'gdp-entregador-v3';
const URLS_TO_CACHE = [
  '/gdp-entregador.html',
  '/manifest-entregador.json',
  '/icon-entregador-192.png',
  '/icon-entregador-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Network first, fallback to cache (garante versao mais recente)
  event.respondWith(
    fetch(event.request).then(response => {
      // Atualizar cache com versao nova
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
