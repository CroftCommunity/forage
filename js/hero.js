// The emblem hero's dismissal state (plan 2026-08-26-3, Phase D).
//
// Device-local, like skin and density, and NEVER forage.state — the Bluesky
// population writes nothing to the event log and test/store-modes.test.js is
// the teeth on that.
//
// Dismissal NEVER expires (owner, 2026-08-27). That is only safe because the
// sticky masthead landed first and keeps sign-in on screen for someone who
// dismissed the hero; without it, one tap would remove the only front door
// permanently. There is deliberately no timestamp here: an expiry is another
// thing that can be got wrong later, and "it came back" is a worse surprise
// than "it stayed gone".
//
// This module owns PERSISTENCE only. Removing the node is the view's job, so a
// reader in private mode still gets a ✕ that does something — it hides the hero
// for this visit and forgets. A control that silently no-ops because storage is
// blocked is worse than one that is honest about its reach.

export const HERO_KEY = 'forage.hero.dismissed';

// The one value that counts as dismissed. Anything else — a half-written key,
// a value from a future version of this file, a browser extension's leavings —
// means SHOWN. Fail open, per the getSkin() precedent: a hero that vanishes
// because of a value nobody wrote on purpose is a front door nobody can get
// back, on a device where the reader never asked for that.
const DISMISSED = 'yes';

export function heroDismissed() {
  try { return localStorage.getItem(HERO_KEY) === DISMISSED; }
  catch { return false; }
}

export function dismissHero() {
  try { localStorage.setItem(HERO_KEY, DISMISSED); }
  catch { /* private mode, quota, blocked storage: the view still hides it */ }
}

// ---- the emblem asset -----------------------------------------------------
// The wordmark shipped as ONE 1600x576 JPEG, 216 KB, rendered at ~340 CSS px on
// a phone — the first thing above the fold and by some margin the heaviest.
//
// This lives here rather than in js/ui/lens-views.js so a test can IMPORT it.
// The same reasoning put js/auth/hosts.js in its own module: lens-views cannot
// be loaded outside a browser, so anything only it knows has to be checked by
// scraping source text, and a scrape asserts its own parse rather than the
// fact. The byte ceilings and the SHELL-membership check in test/hero.test.js
// are real assertions because this object is reachable.
//
// No <picture> and no second format: one format means one URL per width, and
// every one of them has to be named in sw.js SHELL or the hero becomes the one
// thing in the app that does not work offline.
export const EMBLEM = Object.freeze({
  alt: 'Forage — a rook in a wreath as the O',
  // Deliberately the SMALL one. `src` is what a client that ignores srcset
  // gets, and those are the clients least able to afford the big one.
  src: '/assets/logo-wordmark-400.jpg',
  srcset: [
    '/assets/logo-wordmark-400.jpg 400w',
    '/assets/logo-wordmark-800.jpg 800w',
    '/assets/logo-wordmark-1200.jpg 1200w',
  ].join(', '),
  // 560px is the stacked breakpoint in css/app.css and the two must stay the
  // same number: `sizes` describes the layout to the browser BEFORE any CSS has
  // been applied, so a stale copy here makes it choose for a layout that no
  // longer exists. Below it the emblem is the card's full width (viewport less
  // the shell and card padding); above it the card is ~350px wide.
  sizes: '(max-width: 560px) calc(100vw - 48px), 350px',
});

export function emblemSources() {
  return EMBLEM.srcset.split(',').map((s) => s.trim().split(/\s+/)[0]);
}
