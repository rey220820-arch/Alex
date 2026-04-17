// Service Worker для ТОП ГЕН
const PRECACHE_NAME = 'topgen-precache-v1';
const RUNTIME_NAME = 'topgen-runtime-v1';
const PRECACHE_URLS = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(PRECACHE_NAME)
      .then(c => c.addAll(PRECACHE_URLS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  const keep = new Set([PRECACHE_NAME, RUNTIME_NAME]);
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => !keep.has(k)).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.pathname.startsWith('/_matrix') || url.pathname.startsWith('/_synapse')) return;
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.status === 200) {
          const clone = resp.clone();
          caches.open(RUNTIME_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(async () => {
        const match = await caches.match(e.request);
        if (match) return match;
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      })
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'ТОП ГЕН', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      data: { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) if (c.url.includes(url)) return c.focus();
      return clients.openWindow(url);
    })
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'skipWaiting') self.skipWaiting();
});
