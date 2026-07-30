// Service worker — PWA layer last (spec §11). Offline app shell; cache-first for
// same-origin static assets, network-first navigations falling back to the shell.
// ?nosw on the page bypasses registration (see main.js).

const CACHE = 'graze-v1';
const SHELL = [
  './', './index.html',
  './css/tokens.css', './css/app.css',
  './js/main.js', './js/router.js', './js/store.js', './js/storage.js',
  './js/schema.js', './js/reducers.js', './js/selectors.js', './js/personas.js',
  './js/actions.js', './js/util.js', './js/frontier.js', './js/prng.js', './js/devbar.js',
  './js/engines/rank.js', './js/engines/limits.js',
  './js/ui/components.js', './js/ui/views.js',
  './data/seed.js',
  './manifest.webmanifest', './icons/icon.svg',
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
  // cache-first for static assets
  e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
    return res;
  }).catch(() => hit)));
});
