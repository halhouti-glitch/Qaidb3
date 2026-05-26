/* Qaid service worker.
 *
 * Strategy:
 *   - On install, pre-cache the app shell so it works offline.
 *   - On fetch, serve from cache first; fall back to network and refresh the
 *     cache in the background. Navigation requests (HTML) always try network
 *     first so a fresh deploy is picked up immediately when online, and fall
 *     back to the cached index.html when offline.
 *   - Bumping CACHE_VERSION evicts old caches on activate.
 */

// Bump this whenever APP_SHELL changes so the old caches get evicted on activate.
const CACHE_VERSION = 'qaid-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  // ES module entry + dependencies — pre-cached so the app loads offline.
  './js/i18n.js',
  './js/scoring.js',
  './js/share.js',
  './js/util.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for HTML navigations (so deploys are picked up quickly).
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else (icons, manifest, fonts).
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // Refresh in background.
        fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
            }
          })
          .catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => undefined);
    })
  );
});
