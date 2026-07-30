// Hash router (spec §9). Routes carry '#'; build spec's /n/ is renamed /f/.

const routes = [];
let notFound = () => {};

export function route(pattern, handler) {
  // pattern like '/f/:slug/p/:id/:slug2' -> regex with named params
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
  routes.push({ rx, keys, handler });
}
export function setNotFound(fn) { notFound = fn; }

export function currentPath() {
  const h = location.hash.replace(/^#/, '');
  return h || '/popular';
}

export function parseQuery(path) {
  const qi = path.indexOf('?');
  if (qi === -1) return { path, query: {} };
  const query = {};
  new URLSearchParams(path.slice(qi + 1)).forEach((v, k) => (query[k] = v));
  return { path: path.slice(0, qi), query };
}

export function dispatch() {
  const { path, query } = parseQuery(currentPath());
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

export function go(path) {
  if (location.hash === '#' + path) dispatch();
  else location.hash = path;
}

export function start() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}
