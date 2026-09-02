// Where you were (plan 2026-09-01-plan-feed-position-and-updates, phases 1 and 3).
//
// Measured across chromium, webkit and firefox on 2026-09-01, sampling every frame:
// the browser applies its saved offset AFTER the popstate handler returns and BEFORE
// the next animation frame. So a handler that returns a document with the rows in it
// lands exactly right, and one that returns a skeleton lands at 0 and never retries.
// js/board-cache.js is what makes the rows available in time; this file is the rest.
//
// We take the restore rather than leaving it to the browser, for two reasons:
//
// 1. Sampled per frame, `scrollRestoration = 'auto'` painted ONE frame at 0 in
//    firefox before landing (chromium and webkit were clean). A synchronous
//    scrollTo under 'manual' was correct on the first frame in all three.
// 2. Phase 3 needs it anyway. Coming back to a board by LINK — My follows,
//    Discover, My follows — creates a FRESH history entry, for which the browser
//    holds no offset at all. Once we own that case, owning both is one mechanism
//    instead of two that can disagree.
//
// Two maps because they answer different questions (plan D2). By history entry is
// exact and distinguishes two visits to one board at different depths — it is what
// Back wants. By board identity is what "return to this board" wants, since that
// arrives on an entry with no history of its own. In memory only: a reload is a
// fresh start by the owner's decision.

const byEntry = new Map();
const byBoard = new Map();

let entryKey = null;
let boardKey = null;
let armed = false;

export function entryOf() { return entryKey; }
export function setEntry(key) { entryKey = key; }
export function setBoard(key) { boardKey = key ?? null; }

// Record continuously rather than at navigation time. At the moment of a link
// click the app is still on the outgoing page, so its position is already known;
// trying to capture it inside the click handler means every future navigation
// path has to remember to. rAF-throttled, passive: it costs one number a frame
// while a finger is moving and nothing at all while it is not.
export function arm() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  let queued = false;
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const y = window.scrollY;
      if (entryKey) byEntry.set(entryKey, y);
      if (boardKey) byBoard.set(boardKey, y);
    });
  }, { passive: true });
}

// Where this render should leave the reader.
//   'link'     a new page: its top — unless it is a board we were reading (phase 3)
//   'same'     the link for the page you are already on: the top, always. The
//              tab-tap gesture, and the only way out of a restored position on a
//              board whose own nav entry would otherwise put you back in it.
//   'pop'      Back or Forward: exactly where that entry was
//   'rerender' a store change, not a navigation: do not move the reader at all
export function offsetFor(kind, key = boardKey) {
  if (kind === 'rerender') return null;
  if (kind === 'same') return 0;
  if (kind === 'pop') return byEntry.get(entryKey) ?? (key ? byBoard.get(key) : undefined) ?? 0;
  return (key && byBoard.has(key)) ? byBoard.get(key) : 0;
}

export function land(kind, key = boardKey) {
  const y = offsetFor(kind, key);
  if (y === null) return null;
  window.scrollTo(0, y);
  if (entryKey) byEntry.set(entryKey, y);
  if (key) byBoard.set(key, y);
  return y;
}

export function forget() { byEntry.clear(); byBoard.clear(); }
export function stats() { return { entries: byEntry.size, boards: byBoard.size }; }
