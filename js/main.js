// Bootstrap: layout, routes, store subscription, skins, service worker.

import * as store from './store.js';
import * as ringScope from './ring-scope.js';
import * as router from './router.js';
import * as sel from './selectors.js';
import * as actions from './actions.js';
import { el } from './util.js';
import { devBar } from './devbar.js';
import * as skins from './skins.js';
import * as density from './board-density.js';
import * as cardSize from './card-size.js';
import * as threadShape from './thread-shape.js';
import * as rail from './rail.js';
import { toast } from './ui/components.js';
import { setToaster } from './actions.js';
import * as views from './ui/views.js';
import * as lensViews from './ui/lens-views.js';
import * as pmode from './mode.js';
import * as scrollMemory from './scroll-memory.js';
import { modeView, wrongPopulation } from './ui/mode-view.js';

setToaster(toast);

// board-cards decision 7: the stored card size lands on the root before the
// first paint — the 3t slider it replaced was only ever applied on a drag.
cardSize.apply();
threadShape.apply();

// ---------- layout skeleton (built once) ----------
const app = document.getElementById('app');
const devHost = el('div', { id: 'devhost' });
const mastHost = el('div', { id: 'masthost' });
const mainEl = el('div', { class: 'main', id: 'main' });
const sideEl = el('div', { id: 'side' });
// V4: the left nav lives in the shell rather than in each view, so it is drawn
// once and stays put across navigations instead of being rebuilt by every
// board. Its host is hidden entirely in the memory population, which keeps its
// own right-hand rail.
const navHost = el('div', { id: 'navhost' });
const navScrim = el('button', { class: 'navscrim', 'aria-label': 'Close navigation', hidden: true });
const shell = el('div', { class: 'shell' }, navHost, mainEl, sideEl);
app.append(devHost, mastHost, shell, navScrim);
rail.apply(); // board-cards decision 6: the rail's on/off lands on the shell before first paint
if (!document.getElementById('toasts')) document.body.append(el('div', { id: 'toasts' }));

// The upper-right control moves between a skin and its PAIRED OPPOSITE. Skins
// subsumed themes (plan 2026-08-26-1), so there is no second axis to flip: a
// skin that ships one palette has nowhere to go, and the control has to READ
// as unavailable rather than sit there absorbing clicks. Disabled with a title
// that says why — a dead-looking button is a bug report waiting to happen.
function skinToggle() {
  const active = skins.activeSkin();
  const entry = skins.SKINS[active];
  // A stored id from an older build would otherwise throw here and take the
  // whole masthead with it; treat it as sibling-less and let the picker recover.
  const sibling = entry ? skins.siblingOf(active) : null;
  const isDark = (entry?.palette ?? 'light') === 'dark';
  const label = entry?.label ?? active;
  const words = sibling
    ? (isDark ? 'Switch to light' : 'Switch to dark')
    : `${label} has only one palette`;
  const btn = el('button', {
    class: 'themetoggle', title: words, 'aria-label': words,
  }, isDark ? '☀' : '☾');
  if (sibling) btn.addEventListener('click', () => skins.setSkin(sibling));
  else { btn.disabled = true; btn.setAttribute('aria-disabled', 'true'); }
  return btn;
}

function masthead() {
  const themeBtn0 = skinToggle();
  // 3h: populations do not mix — the Bluesky masthead carries NO memory
  // chrome (no persona, no notifications, no memory search).
  if (pmode.active() === 'bluesky') {
    const who = lensViews.sessionIdentity();
    const burger = el('button', { class: 'navburger', 'aria-label': 'Open navigation',
      'aria-expanded': 'false', title: 'Boards' }, '\u2630');
    burger.addEventListener('click', () => setDrawer(!drawerOpen));
    return el('header', { class: 'masthead' },
      burger,
      el('a', { class: 'wordmark', href: '/' },
        el('img', { class: 'wordmark-glyph', src: '/icons/icon-192.png', alt: '' }), 'Forage'),
      // 4j: no nav here. It held ONE link — "Home", href '/' — which is the
      // wordmark's href immediately to its left: the same destination twice,
      // one of them redundant. That cost nothing until the masthead went
      // sticky and had to meet the 44px touch floor, at which point the extra
      // item is what pushed the bar to a second row: measured at 320px,
      // 113px with it and 61px without. Removing a duplicate beats hiding it
      // behind a media query, and beats making the nav horizontally
      // scrollable — which was measured too, and put "Home" off-screen.
      // The memory masthead's nav is NOT this: Home/Popular/All are three
      // real destinations and it keeps them.
      // E144: ONE account control, not three. This bar fits a single row at
      // 320px only because a duplicate link was removed to save 52px (2776537,
      // 113px -> 61px), and V4's hamburger spent that back. A handle plus a
      // caret plus a "Settings" link is ~215px; an avatar is 30. That is the
      // whole reason this is a dependency of the nav rather than a tidy-up.
      //
      // It is a STAND-IN, not a fetched avatar: drawing initials costs no
      // request, cannot flash in late, and cannot fail. The owner's ask
      // allowed for it — "their little avatar or like a stand-in".
      //
      // Signed out it is still here, because Preferences live behind it now
      // and a guest can legitimately use them. That is the guest-surface rule
      // read correctly: hide what a reader CANNOT use, keep what they can.
      // The direct-OAuth "Sign in" (3i) stays beside it rather than being
      // folded in — collapsing it would put an extra press between a newcomer
      // and the authorize screen.
      el('div', { class: 'who' }, themeBtn0,
        (() => {
          const name = who && who !== 'connecting' ? String(who).replace(/^@/, '') : null;
          const initials = name
            ? name.split('.')[0].slice(0, 2).toLowerCase()
            : '\u00b7\u00b7';
          // Decision 8 (plan 2026-08-29 post-and-thread): the picture, when
          // the account has one — initials stay underneath as the
          // not-yet-loaded state, so nothing flashes and nothing shifts.
          const avatar = lensViews.sessionAvatar();
          return el('a', {
            class: 'accountbtn', href: '/me', 'data-account': '1',
            'aria-label': name ? `${name} — your account and preferences` : 'Your account and preferences',
            title: name ? `${name} — account and preferences` : 'Account and preferences',
          }, initials, avatar ? el('img', { src: avatar, alt: '' }) : null);
        })(),
        who === 'connecting' ? el('span', { class: 'small muted' }, '\u2026')
          : who ? null
          : (() => {
              // 3i (owner): launch OAuth DIRECTLY — the entryway collects the
              // handle; no local form between you and the authorize screen.
              const b = el('a', { class: 'small', href: '/', role: 'button' }, 'Sign in');
              b.addEventListener('click', (e) => { e.preventDefault(); lensViews.startDirectSignIn(); });
              return b;
            })()));
  }
  const viewer = store.getPersonaId();
  const unread = sel.unreadCount(store.getState(), viewer);
  const search = el('input', { type: 'text', placeholder: 'Search Forage…', 'aria-label': 'Search' });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter' && search.value.trim()) router.go(`/search?q=${encodeURIComponent(search.value.trim())}`); });
  const who = store.getState().users[viewer];
  const themeBtn = skinToggle();
  return el('header', { class: 'masthead' },
    el('a', { class: 'wordmark', href: '/popular' },
      el('img', { class: 'wordmark-glyph', src: '/icons/icon-192.png', alt: '' }), 'Forage'),
    el('nav', { class: 'row', style: 'gap:12px' },
      el('a', { href: '/home', class: 'small' }, 'Home'),
      el('a', { href: '/popular', class: 'small' }, 'Popular'),
      el('a', { href: '/all', class: 'small' }, 'All')),
    el('div', { class: 'search' }, search),
    el('div', { class: 'who' },
      themeBtn,
      viewer ? el('a', { class: 'bell small', href: '/notifications', title: 'Notifications' }, '🔔',
        unread ? el('span', { class: 'badge' }, unread) : null) : null,
      viewer ? el('a', { class: 'small', href: `/u/${who?.handle}` }, who?.handle || 'me')
             : el('a', { class: 'small', href: '/signup' }, 'Log in / Sign up')));
}

// ---------- routes (3h: ONE namespace, resolved by the active population) ----------
const inBluesky = () => pmode.active() === 'bluesky';
// a route that exists in both populations dispatches; one that exists in only
// one gates WITH WORDS in the other (never a silent redirect)
const byMode = (bluesky, memory) => (p, q) => (inBluesky() ? bluesky(p, q) : memory(p, q));
const memoryOnly = (handler) => (p, q) => (inBluesky() ? wrongPopulation('memory') : handler(p, q));
const blueskyOnly = (handler) => (p, q) => (inBluesky() ? handler(p, q) : wrongPopulation('bluesky'));

// V5: `/` is where the landing rule is applied. A guest falls through to the
// directory (lensHomeView); a signed-in reader is REPLACED onto the board they
// left, or onto My follows the first time. replaceState rather than push, so
// Back still leaves the app instead of bouncing between / and the board.
router.route('/', byMode((p, q) => {
  const path = lensViews.landingPath();
  if (path && router.currentPath() === '/') {
    router.replacePath(path);
    return router.dispatch(path);
  }
  return lensViews.lensHomeView(p, q);
}, (p, q) => views.boardView('popular', 'Popular', q)));
router.route('/r/:rung', blueskyOnly(lensViews.lensRingView));
// The directory needs an address of its own. Its row in the nav used to point
// at '/', which the landing rule redirects away from the instant a signed-in
// reader touches it — so the directory was unreachable for exactly the readers
// who have a nav. Caught by bluesky-view, which clicked through to Trending
// and found a board. '/' stays the landing; '/trending' is the destination.
router.route('/trending', blueskyOnly(lensViews.lensHomeView));
router.route('/mode', modeView);
router.route('/home', memoryOnly((p, q) => views.boardView('home', 'Home', q)));
router.route('/popular', memoryOnly((p, q) => views.boardView('popular', 'Popular', q)));
router.route('/all', memoryOnly((p, q) => views.boardView('all', 'All', q)));
router.route('/f/:slug', byMode(lensViews.lensFeedView, views.feedView));
// ORDER MATTERS BELOW. The router returns the FIRST pattern that matches, and
// `/f/:handle/:rkey` is two segments under /f/ — the same shape as
// `/f/:slug/settings`. Registered above it, the generic form swallowed it and
// Feed settings was unreachable in both modes on production (2026-08-26): the
// memory tier answered "No such Feed", the lens tier fired resolveHandle at
// the literal string "settings" and 400'd. So every SPECIFIC sub-route is
// registered first, and the creator-qualified shape is the fallback.
// test/routes.test.js proves each route is reachable, because a route table
// cannot show you this by inspection — every line looks correct.
router.route('/f/:slug/settings', memoryOnly(views.feedSettingsView));
router.route('/f/:slug/mod/log', memoryOnly(views.auditView));
router.route('/f/:slug/mod/queue', memoryOnly(views.queueView));
router.route('/f/:slug/p/:id', memoryOnly(views.threadView));
router.route('/f/:slug/p/:id/:slug2', memoryOnly(views.threadView));
// 3v: the SHAREABLE feed path — /f/@creator/<rkey> resolves cold, which the
// bare-rkey form cannot (an rkey has no did). Bluesky population only; the
// memory tier's Feeds are local and need no creator.
router.route('/f/:handle/:rkey', byMode(lensViews.lensFeedView, views.feedView));
router.route('/notifications', memoryOnly(views.notificationsView));
router.route('/saved', memoryOnly((p, q) => views.profileView({ handle: store.getState().users[store.getPersonaId()]?.handle || '' }, { tab: 'saved' })));
router.route('/search', memoryOnly(views.searchView));
router.route('/submit', memoryOnly(views.submitView));
router.route('/create-feed', memoryOnly(views.createFeedView));
// E144: one page, not two that can drift. In the lens, Preferences live on
// /me — the page the avatar opens, which already carried accounts, languages
// and the moderation mirror. /settings stays a working address and redirects,
// because links to it exist. The MEMORY population keeps its own /settings.
router.route('/settings', byMode(() => {
  router.replacePath('/me');
  return router.dispatch('/me');
}, views.settingsView));
router.route('/frontiers', views.frontiersView);
router.route('/h/:tag', byMode(lensViews.lensHashtagView, views.tagStreamView));
router.route('/p', blueskyOnly(lensViews.lensThreadView));
// The Web Share Target's landing (manifest.webmanifest declares it). A doorway,
// not a page: it turns whatever a share sheet handed the installed PWA into one
// of the addresses above and replaceState's onto it, so Back leaves the app
// instead of bouncing through here. Bluesky population only — a bsky.app link
// is not a thing the memory sandbox can honour, so it gates with words like
// every other cross-population route.
router.route('/share', blueskyOnly(lensViews.lensShareView));
router.route('/reply', blueskyOnly(lensViews.lensReplyView)); // feed-row v4: a reply is a page
router.route('/me', blueskyOnly(lensViews.lensProfileView));
router.route('/feeds', blueskyOnly(lensViews.lensFeedsView));
router.route('/hashtags', blueskyOnly(lensViews.lensHashtagsView));
router.route('/hashtags/:section', blueskyOnly(lensViews.lensHashtagsView));
router.route('/u/:handle', byMode(lensViews.lensUserView, views.profileView));
router.route('/about', views.aboutView);
router.route('/signup', memoryOnly(views.signupView));
// legacy /lens* deep links → the unified namespace
const redirectTo = (path) => { router.replacePath(path); return router.dispatch(path); };
router.route('/lens', () => redirectTo('/'));
router.route('/lens/f/:slug', (p) => redirectTo(`/f/${p.slug}`));
router.route('/lens/h/:tag', (p) => redirectTo(`/h/${p.tag}`));
router.route('/lens/p', (p, q) => redirectTo(`/p?uri=${encodeURIComponent(q.uri || '')}${q.from ? `&from=${q.from}` : ''}`));
router.setNotFound(() => ({ main: el('div', { class: 'empty' }, el('h2', {}, 'Lost in the pasture'), el('p', { class: 'muted' }, 'No such page.'), el('a', { class: 'btn', href: '/' }, 'Go home')), side: null }));

// ---------- the nav drawer (narrow viewports only) ----------
// Off-canvas until asked for, which is the whole reason the sidebar beat the
// strip it replaced: it costs no vertical space until you open it. Closing on
// the scrim AND on Escape is not decoration — this is our own drawer, so focus
// and dismissal are our responsibility and no axe rule can see them.
let drawerOpen = false;
let lastRenderedPath = null;
function setDrawer(open) {
  drawerOpen = open;
  const nav = navHost.firstElementChild;
  if (nav) nav.hidden = !open && window.matchMedia('(max-width: 800px)').matches;
  navScrim.hidden = !open;
  const btn = document.querySelector('.navburger');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}
navScrim.addEventListener('click', () => setDrawer(false));
// Crossing the breakpoint re-applies the rule: a sidebar that was simply
// visible at desktop width otherwise becomes the drawer, open, with no scrim
// and a burger that says it is shut (owner, 2026-08-29, after resizing).
window.matchMedia('(max-width: 800px)').addEventListener('change', () => setDrawer(false));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerOpen) setDrawer(false); });

// Moving the pill changes what every board contains, so the repaint waits for
// the graph walk behind the new scope to land. Painting immediately would show
// the OLD board under the NEW label for as long as the walk takes — the one
// thing a control whose entire effect is a re-render must not do.
ringScope.onChange(() => {
  lensViews.syncRingScope().then(() => render()).catch((e) => {
    console.warn('forage: ring scope failed to apply', e);
  });
});

// ---------- render pipeline ----------
let currentCleanup = null;
// What KIND of render this is lives in the router now (router.navKind), because a
// VIEW needs it too: a board checks for new posts only when the reader ARRIVED,
// and render() re-runs on every store change.
function render() {
  // dev bar (memory-only scaffolding, user 2026-08-26) + masthead always fresh
  devHost.replaceChildren(pmode.active() === 'memory' ? devBar() : '');
  mastHost.replaceChildren(masthead());
  if (currentCleanup) { currentCleanup(); currentCleanup = null; }
  let out;
  try { out = router.dispatch() || { main: el('div', {}), side: null }; }
  catch (e) { console.error(e); out = { main: el('div', { class: 'errstate' }, 'View error: ' + e.message), side: null }; }
  if (out.main && out.main._cleanup) currentCleanup = out.main._cleanup;
  const lensMode = pmode.active() === 'bluesky';
  // Auth boots from the RENDER PIPELINE, not as a side effect of some view
  // rendering the sign-in card. Before V4 every guest landing drew that card,
  // so the boot happened by accident; the moment a rung became a real address
  // (/r/mut), landing there directly meant the session never restored and the
  // nav showed a guest their own account as signed out. Booting here makes it
  // independent of which board you arrived on. bootAuth() shares one in-flight
  // promise, so calling it every render costs nothing after the first.
  if (lensMode) lensViews.ensureAuthBoot();
  navHost.hidden = !lensMode;
  shell.classList.toggle('with-nav', lensMode);
  if (lensMode) {
    navHost.replaceChildren(lensViews.lensNav(lensViews.currentBoardId(router.currentPath())));
    // Close the drawer on a NAVIGATION, never on a re-render. render() runs on
    // every store change — a session restoring, saved feeds landing — and
    // closing here unconditionally shut the drawer under the reader's finger a
    // beat after they opened it. Caught by the workflow, which could not click
    // a scrim that had already been dismissed by a background fetch.
    if (router.currentPath() !== lastRenderedPath) { lastRenderedPath = router.currentPath(); setDrawer(false); }
    else setDrawer(drawerOpen); // re-apply state to the freshly built nav
  } else navHost.replaceChildren();
  mainEl.replaceChildren(out.main || el('div', {}));
  sideEl.replaceChildren(out.side || el('div', {}));
  sideEl.hidden = lensMode && !out.side;
  // reflect frontier dev toggle
  document.body.classList.toggle('hide-frontiers', !store.getDev().frontiers);
  // Where the reader ends up. A LINK navigation opens the new page at its top
  // (owner, 2026-08-29: a thread opened wherever the board had been scrolled to)
  // — unless it is a board they were already reading, which is phase 3. A store
  // re-render never moves them. Back and Forward go exactly where that entry was,
  // which works only because the board painted from its record synchronously just
  // above: the browser applies its own restore after this handler returns, and we
  // have taken that job with scrollRestoration = 'manual'. A `?focus=` deep link
  // still wins: focusComment scrolls in a later frame.
  scrollMemory.setEntry(router.entryKey());
  scrollMemory.setBoard(out.boardKey ?? null);
  scrollMemory.land(router.navKind(), out.boardKey ?? null);
  router.clearNavKind();
}

// re-render on any store change (persona switch, dispatch, dev flags)
store.subscribe(() => { router.setNavKind('rerender'); render(); });
// only an UNCLAIMED popstate is a real Back or Forward — go() and rerenderNow()
// both dispatch one, and reading those as navigation cost three fetches a load
window.addEventListener('popstate', () => { router.claimPop(); render(); });
router.interceptLinks(() => render()); // real hrefs, no page loads (the router claimed the kind)
// A legacy '#/...' link followed while the app is ALREADY open is a
// same-document change — boot never re-runs, so bridge it here too.
window.addEventListener('hashchange', () => {
  const path = router.legacyHashPath(location.hash);
  if (!path) return;
  router.replacePath(path);
  render();
});

// ---------- skins (which now carry the palette too) ----------
// The palette is a skin, and the inline <head> script already injected its
// sheet before first paint; this only re-adopts that element. Nothing else
// applies a palette any more — there is no separate theme module to call.
skins.apply();
skins.onChange(render);
// Density is a display preference like the skin: changing it repaints, and
// the sandbox board reads it at render time.
density.onChange(render);

// ---------- boot ----------
// The first entry is the page load's, so it has no id until we give it one, and
// the restore has to be ours before anything can scroll.
router.stampCurrent();
scrollMemory.arm();

const hadState = store.hydrate();
// An OAuth callback landing (code+state in the query OR the hash fragment —
// atproto's browser default is response_mode=fragment) must complete the
// exchange BEFORE the hash changes: boot the session first, then land on the
// lens signed in.
import('./auth/session.js').then(async ({ isOAuthCallback }) => {
  if (isOAuthCallback(location.search) || isOAuthCallback(location.hash)) {
    const lv = await import('./ui/lens-views.js');
    await lv.ensureAuthBoot();
    router.replacePath('/'); // drop the callback params from the bar
    render();
  }
});
// 3n: bridge the hash URLs already shared from the deployed site. Runs AFTER
// the OAuth check so a fragment response is never mistaken for a route.
const legacy = router.legacyHashPath(location.hash);
if (legacy) router.replacePath(legacy);
if (!hadState && pmode.active() === 'memory') {
  // First ever visit IN THE MEMORY POPULATION: seed once so the sandbox has
  // content. Seeding keys off the presentation mode now (3h) — the Bluesky
  // population must write
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
