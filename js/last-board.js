// The last board you were reading — one device-local preference, one module.
//
// The landing rule (plan 2026-08-26-4, Revision 2) says a returning reader
// lands on the board they left. That is only meaningful if the choice outlives
// the tab, so it is stored; and it is stored HERE rather than in `forage.state`
// because it belongs to neither population. It is the device's, like the skin
// and the density, and js/board-density.js is the shape this copies.
//
// WHY THE ID IS OPEN-ENDED, and why that is not laziness: a feed slug
// ('whats-hot') and a hashtag ('tag-harvest') are both BOARDS —
// lists of posts differing only in where the posts come from. That taxonomy is
// the plan's, and it arrived by way of the owner noticing that "Discover" and
// `f/whats-hot` are one object in CURATED, not two kinds of thing. So this
// module cannot validate against a closed set the way density can, and it does
// not pretend to: it stores a non-empty string and refuses everything else.
// Whether a stored id still RESOLVES to a board is the caller's question —
// a feed can be unsaved — and answering it here would require importing the
// lens, which is how a preference module becomes a dependency knot.
//
// It is deliberately NOT cleared on sign-out. What is stored is the name of a
// reading choice, never graph data — `lens.forgetRings()` already drops the
// graph and the scope member lists, which are the account's. Clearing this too would mean signing
// out and back in loses your place, which defeats the rule it exists to serve.

export const LAST_BOARD_KEY = 'forage.lastboard';

// Read through storage on every call rather than caching in a module variable:
// a second tab writing this one must be visible on the next read, and a cached
// copy would make two tabs disagree about where you were.
export function lastBoard() {
  try {
    const stored = localStorage.getItem(LAST_BOARD_KEY);
    return typeof stored === 'string' && stored.trim() !== '' ? stored : null;
  } catch {
    return null; // no storage is not an error — it is no memory
  }
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setLastBoard(id) {
  // Refuse rather than write: a stored empty string would later read as "no
  // memory" anyway, and a stored number would resolve to no board at all. A
  // bad write is worse than a dropped one because it destroys the good value
  // that was already there.
  if (typeof id !== 'string') return;
  const next = id.trim();
  if (next === '') return;
  try { localStorage.setItem(LAST_BOARD_KEY, next); } catch { /* private mode */ }
  for (const fn of listeners) fn(next);
}

// ---- the landing rule ----
//
// Where `/` goes, in one pure function so the three cases are readable
// together rather than scattered across a router. The rule is the owner's
// (plan 2026-08-26-4, Revision 2):
//
//   signed out          -> the directory. A guest has no history worth
//                          remembering, and it is the same page for everyone,
//                          so there is ONE front page to design.
//   returning           -> the board they left. No click between opening the
//                          app and reading, which is the whole reason the
//                          board above is remembered at all.
//   first sign-in       -> Following, the timeline. A new account has no board
//                          to return to, and this is the closest thing to what
//                          someone arriving from Bluesky expects.
//
// That last one WAS the 'fol' rung, and the change is a rename rather than a
// new destination: /r/fol delegated straight to the timeline in one request,
// so the board a first sign-in landed on has always been this one. The rungs
// stopped being addresses on 2026-09-03 when the ring became a display scope,
// which left the timeline to be named by its own slug.
//
// A stored board is IGNORED while signed out rather than cleared: a feed slug
// would resolve to a board with none of the reader's context.
// Ignoring is reversible on the next sign-in; clearing is not.

export const DIRECTORY = 'directory';
export const FIRST_TIME_BOARD = 'following';

export function landingBoard({ signedIn, stored } = {}) {
  if (!signedIn) return DIRECTORY;
  return typeof stored === 'string' && stored.trim() !== '' ? stored : FIRST_TIME_BOARD;
}
