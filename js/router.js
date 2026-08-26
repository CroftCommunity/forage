// Clean-path router (3n). URLs are real paths — /h/gardening, /f/whats-hot,
// /u/alice.test — because these get shared and a hashtag's identity IS the
// literal string. GitHub Pages has no rewrite rules, so 404.html serves the
// same shell for deep links (and sw.js answers navigations from cache, which
// also turns the 404 status into a 200 once the worker is installed).
//
// The old hash URLs (#/f/x) shipped to forage.fyi already, so boot bridges
// them to their clean equivalents — except OAuth fragment responses, which
// must never be mistaken for a route.

const routes = [];
let notFound = () => {};

export function route(pattern, handler) {
  // pattern like '/f/:slug/p/:id/:slug2' -> regex with named params
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
  routes.push({ rx, keys, handler });
}
export function setNotFound(fn) { notFound = fn; }

// The current route path, from the REAL location (path + query).
export function pathOf(loc = location) {
  return `${loc.pathname || '/'}${loc.search || ''}`;
}
export function currentPath() { return pathOf(); }

// A legacy '#/...' link → its clean path. Anything else (notably an OAuth
// fragment response carrying code/state) returns null and is left alone.
export function legacyHashPath(hash) {
  if (!hash || !hash.startsWith('#/')) return null;
  const rest = hash.slice(1);
  const params = new URLSearchParams(rest.replace(/^[?#]/, ''));
  if (params.has('code') && params.has('state')) return null;
  return rest;
}

export function parseQuery(path) {
  const qi = path.indexOf('?');
  if (qi === -1) return { path, query: {} };
  const query = {};
  new URLSearchParams(path.slice(qi + 1)).forEach((v, k) => (query[k] = v));
  return { path: path.slice(0, qi), query };
}

export function dispatch(rawPath = currentPath()) {
  const { path, query } = parseQuery(rawPath);
  for (const r of routes) {
    const m = path.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return r.handler(params, query);
    }
  }
  return notFound();
}

// Navigate without a page load. Same path → re-dispatch (a no-op click still
// refreshes the view, matching the old hash behavior).
export function go(path) {
  if (pathOf() === path) return dispatch();
  history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  return undefined;
}

// Intercept in-app link clicks so real hrefs (good for sharing, middle-click,
// and copy-link) never cost a full page load. Modified clicks, other origins,
// downloads, and target=_blank are left to the browser.
export function interceptLinks(onNavigate) {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/') || a.target === '_blank' || a.hasAttribute('download')) return;
    e.preventDefault();
    if (pathOf() === href) { onNavigate?.(); return; }
    history.pushState({}, '', href);
    onNavigate?.();
  });
}
