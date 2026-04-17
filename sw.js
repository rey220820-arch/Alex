// Service Worker для ТОП ГЕН
const CACHE = 'topgen-v2';
const PRECACHE = [ './', './index.html', './icons/icon-192.png', './icons/icon-512.png' ];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API и Matrix запросы — всегда сеть, без кеша
  if (url.pathname.startsWith('/_matrix') || url.pathname.startsWith('/_synapse')) {
    return;
  }

  // Кешируем только GET-запросы (POST/PUT/DELETE кешировать нельзя)
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
