// MouthLife Offline PWA Service Worker
// Network-first for HTML/shell (instant updates when online) + cache-first for immutable hashed Vite bundles.
const CACHE_NAME = 'mouthlife-shell-v3';
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './privacy.html',
];

// Hosts may send `Vary: Origin`; a module script asks with an Origin header and the stored copy was
// fetched without one, so a strict match misses it offline. These files are same-origin and their
// names carry their content hash, so the header cannot change what they hold.
const MATCH = { ignoreVary: true, ignoreSearch: false };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('mouthlife-shell-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// The page sends the hashed bundle URLs it loaded; cache them so the first visit already works offline.
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'precache' || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter(
    (u) => typeof u === 'string' && u.startsWith(self.location.origin) && u.includes('/assets/')
  );
  if (urls.length === 0) return;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        urls.slice(0, 40).map((u) =>
          cache.match(u, MATCH).then((hit) => hit || cache.add(u).catch(() => undefined))
        )
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Bundled soundtrack (/music/*): streamed with Range requests straight from the network; 70 MB of
  // audio never belongs in the shell cache.
  if (url.pathname.includes('/music/')) return;

  // Immutable content-hashed Vite bundles (/assets/*): cache-first, populate on miss
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(req, MATCH).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // HTML navigation & app shell: network-first so deployments never go stale, fallback to cache offline
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, MATCH).then((cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html', MATCH) : Response.error()))
      )
  );
});
