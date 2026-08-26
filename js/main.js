// Bootstrap: layout, routes, store subscription, theme, service worker.

import * as store from './store.js';
import * as router from './router.js';
import * as sel from './selectors.js';
import * as actions from './actions.js';
import { el } from './util.js';
import { devBar } from './devbar.js';
import * as skins from './skins.js';
import { toast } from './ui/components.js';
import { setToaster } from './actions.js';
import * as views from './ui/views.js';
import * as lensViews from './ui/lens-views.js';
import * as theme from './theme.js';

setToaster(toast);

// ---------- layout skeleton (built once) ----------
const app = document.getElementById('app');
const devHost = el('div', { id: 'devhost' });
const mastHost = el('div', { id: 'masthost' });
const mainEl = el('div', { class: 'main', id: 'main' });
const sideEl = el('div', { id: 'side' });
const shell = el('div', { class: 'shell' }, mainEl, sideEl);
app.append(devHost, mastHost, shell);
if (!document.getElementById('toasts')) document.body.append(el('div', { id: 'toasts' }));

function masthead() {
  const viewer = store.getPersonaId();
  const unread = sel.unreadCount(store.getState(), viewer);
  const search = el('input', { type: 'text', placeholder: 'Search Forage…', 'aria-label': 'Search' });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter' && search.value.trim()) router.go(`/search?q=${encodeURIComponent(search.value.trim())}`); });
  const who = store.getState().users[viewer];
  const dark = theme.resolvedDark();
  const themeBtn = el('button', { class: 'themetoggle', title: dark ? 'Switch to light' : 'Switch to dark',
    'aria-label': dark ? 'Switch to light mode' : 'Switch to dark mode' }, dark ? '☀' : '☾');
  themeBtn.addEventListener('click', () => theme.toggle());
  return el('header', { class: 'masthead' },
    el('a', { class: 'wordmark', href: '#/popular' },
      el('img', { class: 'wordmark-glyph', src: './icons/icon-192.png', alt: '' }), 'Forage'),
    el('nav', { class: 'row', style: 'gap:12px' },
      el('a', { href: '#/home', class: 'small' }, 'Home'),
      el('a', { href: '#/popular', class: 'small' }, 'Popular'),
      el('a', { href: '#/all', class: 'small' }, 'All'),
      el('a', { href: '#/lens', class: 'small' }, 'Lens')),
    el('div', { class: 'search' }, search),
    el('div', { class: 'who' },
      themeBtn,
      viewer ? el('a', { class: 'bell small', href: '#/notifications', title: 'Notifications' }, '🔔',
        unread ? el('span', { class: 'badge' }, unread) : null) : null,
      viewer ? el('a', { class: 'small', href: `#/u/${who?.handle}` }, who?.handle || 'me')
             : el('a', { class: 'small', href: '#/signup' }, 'Log in / Sign up')));
}

// ---------- routes ----------
router.route('/home', (p, q) => views.feedView('home', 'Home', q));
router.route('/popular', (p, q) => views.feedView('popular', 'Popular', q));
router.route('/all', (p, q) => views.feedView('all', 'All', q));
router.route('/f/:slug', views.fieldView);
router.route('/f/:slug/settings', views.fieldSettingsView);
router.route('/f/:slug/mod/log', views.auditView);
router.route('/f/:slug/mod/queue', views.queueView);
router.route('/f/:slug/p/:id', views.threadView);
router.route('/f/:slug/p/:id/:slug2', views.threadView);
router.route('/u/:handle', views.profileView);
router.route('/notifications', views.notificationsView);
router.route('/saved', (p, q) => views.profileView({ handle: store.getState().users[store.getPersonaId()]?.handle || '' }, { tab: 'saved' }));
router.route('/search', views.searchView);
router.route('/submit', views.submitView);
router.route('/create-field', views.createFieldView);
router.route('/settings', views.settingsView);
router.route('/frontiers', views.frontiersView);
router.route('/h/:tag', views.tagStreamView);
router.route('/lens/h/:tag', lensViews.lensHashtagView);
router.route('/lens', lensViews.lensHomeView);
router.route('/lens/f/:slug', lensViews.lensFieldView);
router.route('/lens/p', lensViews.lensThreadView);
router.route('/about', views.aboutView);
router.route('/signup', views.signupView);
router.setNotFound(() => ({ main: el('div', { class: 'empty' }, el('h2', {}, 'Lost in the pasture'), el('p', { class: 'muted' }, 'No such page.'), el('a', { class: 'btn', href: '#/popular' }, 'Go home')), side: null }));

// ---------- render pipeline ----------
let currentCleanup = null;
function render() {
  // dev bar + masthead always fresh (persona/unread may have changed)
  devHost.replaceChildren(devBar());
  mastHost.replaceChildren(masthead());
  if (currentCleanup) { currentCleanup(); currentCleanup = null; }
  let out;
  try { out = router.dispatch() || { main: el('div', {}), side: null }; }
  catch (e) { console.error(e); out = { main: el('div', { class: 'errstate' }, 'View error: ' + e.message), side: null }; }
  if (out.main && out.main._cleanup) currentCleanup = out.main._cleanup;
  mainEl.replaceChildren(out.main || el('div', {}));
  sideEl.replaceChildren(out.side || el('div', {}));
  // reflect frontier dev toggle
  document.body.classList.toggle('hide-frontiers', !store.getDev().frontiers);
  window.scrollingReset && window.scrollTo(0, 0);
}

// re-render on any store change (persona switch, dispatch, dev flags)
store.subscribe(render);
window.addEventListener('hashchange', render);

// ---------- theme + skin ----------
theme.apply();
theme.onChange(render); // re-render so the toggle icon flips
skins.apply();
skins.onChange(render);

// ---------- boot ----------
const hadState = store.hydrate();
// 3d: the front door. The unauth Bluesky view is forage.fyi's default route
// (OQ4); the preference is a device-local Settings choice (theme.js
// precedent — its own key, never forage.state).
const frontPref = (() => { try { return localStorage.getItem('forage.front') || 'bluesky'; } catch { return 'bluesky'; } })();
// An OAuth callback landing (code+state in the query OR the hash fragment —
// atproto's browser default is response_mode=fragment) must complete the
// exchange BEFORE the hash changes: boot the session first, then land on the
// lens signed in.
import('./auth/session.js').then(async ({ isOAuthCallback }) => {
  if (isOAuthCallback(location.search) || isOAuthCallback(location.hash)) {
    const lv = await import('./ui/lens-views.js');
    await lv.ensureAuthBoot();
    location.hash = '/lens';
  }
});
if (!location.hash) location.hash = frontPref === 'memory' ? '/popular' : '/lens';
if (!hadState && !location.hash.startsWith('#/lens')) {
  // First ever visit ON A MEMORY ROUTE: seed once so the demo has content.
  // Seeding is a memory-mode entry event — the lens front door must write
  // NOTHING to forage.state (3d named check; the workflow pins it). After
  // Delete All the app shows the genuine cleared/empty state.
  import('../data/seed.js').then(({ buildSeed }) => { store.loadEvents(buildSeed()); });
}
render();

// ---------- service worker (PWA layer last; ?nosw bypasses) ----------
if ('serviceWorker' in navigator && !/[?&]nosw\b/.test(location.search)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
  });
}
