// Service worker — PWA layer last (spec §11). Offline app shell.
// Navigations: network-first, falling back to the cached shell.
// Same-origin assets: stale-while-revalidate — serve cache instantly, refresh
// it in the background — so a new deploy is picked up on the next load without
// a manual cache bump. ?nosw on the page bypasses registration (see main.js).
//
// Bump CACHE whenever you want to force a clean re-cache on the very next load
// (asset URLs are hashless, so the name is the version).

const CACHE = 'forage-v5';
const SHELL = [
  './', './index.html',
  './css/tokens.css', './css/app.css',
  './js/main.js', './js/router.js', './js/store.js', './js/storage.js',
  './js/schema.js', './js/reducers.js', './js/selectors.js', './js/personas.js',
  './js/actions.js', './js/util.js', './js/frontier.js', './js/prng.js', './js/devbar.js',
  './js/theme.js', './js/engines/rank.js', './js/engines/limits.js',
  './js/ui/components.js', './js/ui/views.js',
  './data/seed.js',
  './manifest.webmanifest', './icons/favicon-32.png', './icons/icon-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  if (request.mode === 'navigate') {
    // network-first for navigations, fall back to cached shell (offline reload)
    e.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }
  // stale-while-revalidate for same-origin assets
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 504, statusText: 'offline' });
  })());
});
