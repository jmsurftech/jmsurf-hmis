/* JMSURF HMIS service worker (hand-written). Caches the app shell and static assets; API calls are not cached here
 * (the app keeps its own IndexedDB read cache and write outbox). Bump VERSION to invalidate old caches. */
const VERSION = 'v1';
const SHELL = `jmsurf-shell-${VERSION}`;
const STATIC = `jmsurf-static-${VERSION}`;
const PRECACHE = ['/', '/dashboard', '/queue', '/patients', '/login', '/portal', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => undefined)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, STATIC].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API and third parties: network only

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith('/_next/static/') || /\.(?:svg|png|ico|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Pages (and RSC payloads): network-first, fall back to the cached page, then the cached shell.
  if (req.mode === 'navigate' || req.headers.get('RSC') === '1') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && req.mode === 'navigate') (await caches.open(SHELL)).put(req, res.clone());
        return res;
      } catch {
        const c = await caches.open(SHELL);
        return (await c.match(req, { ignoreSearch: true })) || (await c.match(url.pathname.startsWith('/portal') ? '/portal' : '/dashboard')) || (await c.match('/')) || Response.error();
      }
    })());
  }
});
