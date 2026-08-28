// Service worker — PWA layer last (spec §11). Offline app shell.
// Navigations: network-first, falling back to the cached shell.
// Same-origin assets: stale-while-revalidate — serve cache instantly, refresh
// it in the background — so a new deploy is picked up on the next load without
// a manual cache bump. ?nosw on the page bypasses registration (see main.js).
//
// Bump CACHE whenever you want to force a clean re-cache on the very next load
// (asset URLs are hashless, so the name is the version).

const CACHE = 'forage-v44';
const SHELL = [
  '/', '/404.html', '/skins/bbs.css', '/skins/usenet.css', '/skins/usenet-dark.css', '/skins/forage-dark.css', '/skins/phpbb.css', '/skins/phpbb-dark.css',
  '/vendor/atproto-oauth-client-browser.js', '/js/auth/session.js', '/js/auth/hosts.js', '/js/skins.js',
  '/js/version.js', '/js/mode.js', '/js/hero.js', '/js/media-scale.js', '/js/lang.js', '/js/compose.js', '/js/ui/mode-view.js', '/css/tokens.css', '/css/app.css',
  '/js/main.js', '/js/router.js', '/js/store.js', '/js/storage.js', '/js/schema.js',
  '/js/reducers.js', '/js/selectors.js', '/js/personas.js', '/js/actions.js', '/js/util.js',
  '/js/board-density.js', '/js/prng.js', '/js/devbar.js', '/js/engines/rank.js',
  '/js/engines/limits.js', '/js/config/routing.js', '/js/substrates/memory.js',
  '/js/substrates/atproto.js', '/js/substrates/lens.js', '/js/ui/components.js',
  '/js/ui/views.js', '/js/ui/lens-views.js', '/data/seed.js', '/scenarios/ban-readonly.js',
  '/scenarios/comment-tree-collapse.js', '/scenarios/demo-extras.js',
  '/scenarios/feed-lifecycle.js', '/scenarios/format.js', '/scenarios/index.js',
  '/scenarios/mod-remove-mask.js', '/scenarios/post-vote-rank.js',
  '/scenarios/rate-limit-probation.js', '/scenarios/report-resolve-notify.js',
  '/scenarios/save-and-profile.js', '/scenarios/search-visibility.js', '/ledger/divergence.js',
  '/manifest.webmanifest', '/icons/favicon-32.png', '/icons/icon-192.png',
  '/assets/logo-wordmark-400.jpg', '/assets/logo-wordmark-800.jpg', '/assets/logo-wordmark-1200.jpg',
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
    // 3n: clean paths on GitHub Pages. A deep link like /h/gardening is not a
    // file, so Pages answers 404.html (right shell, wrong status). Once this
    // worker is installed we answer navigations from the cached shell first —
    // deep links become real 200s, work offline, and never flash the 404 body.
    e.respondWith((async () => {
      const shell = await caches.match('/');
      if (shell) return shell;
      try { return await fetch(request); }
      catch { return (await caches.match('/404.html')) || Response.error(); }
    })());
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
