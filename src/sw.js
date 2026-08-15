/**
 * Offline-first service worker.
 *
 * `__PRECACHE__` and `__VERSION__` are substituted at build time by the
 * serviceWorker plugin in vite.config.js — the bundle filenames are content
 * hashed, so the list can only be known once Rollup has emitted them.
 *
 * Everything is resolved against the registration scope, so the same worker
 * runs correctly from a GitHub Pages project subpath, a user site or localhost.
 *
 *  - navigations : network-first, falling back to the cached shell
 *  - hashed assets: cache-first (their names change when the content does)
 *  - anything else same-origin: stale-while-revalidate
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;

const scoped = (p) => new URL(p, self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // Added one at a time: a single 404 must not sink the whole install.
      await Promise.all(
        PRECACHE.map((p) =>
          cache.add(new Request(scoped(p), { cache: 'reload' })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(VERSION);
          cache.put(scoped('index.html'), fresh.clone());
          return fresh;
        } catch {
          return (
            (await caches.match(scoped('index.html'))) ||
            (await caches.match(scoped(''))) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  // Vite emits content-hashed filenames, so these are safe to serve from cache
  // forever — a changed file arrives under a different name.
  // .wasm is on the list for the ONNX runtime behind the neural voice: at 21 MB
  // it is much too big to revalidate on every load.
  const immutable = /-[A-Za-z0-9_-]{8,}\.(js|css|wasm|woff2?|png|jpg|webp|svg)$/.test(
    url.pathname,
  );

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit && immutable) return hit;

      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      return hit || (await network) || Response.error();
    })(),
  );
});
