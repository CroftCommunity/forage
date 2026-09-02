// What a board was showing when you left it (plan 2026-09-01-plan-feed-position-and-updates,
// phases 0, 2 and 4).
//
// The reported bug looks like a lost scroll offset and is not. `render()` rebuilds
// the view on every navigation AND on every store change, and each rebuild refetched
// the feed — so pressing Back gave you a different feed, one page deep, in a document
// that was empty at the instant the browser tried to restore your position. Measured
// on `ddbd947`: FOUR `getFeed` calls to arrive at one board, and the paged-in posts
// gone the moment you opened a post.
//
// So the record is the fix for three phases at once: a rebuild reads it instead of
// fetching (phase 0), Back reads it instead of fetching (phase 2), and it holds every
// page you loaded rather than just the first (phase 4). The scroll offset is a
// separate, smaller thing on top (js/scroll-memory.js) and only works because this
// makes the rows available SYNCHRONOUSLY — the browser restores after the popstate
// handler returns and before the next frame, and a document that is still fetching
// has already lost.
//
// In memory only, by the owner's decision (2026-09-01): "I think reload reloads the
// whole page so there is no scroll position to my mind at that point." That is a real
// simplification and not a shortcut — no storage, no serialisation, no schema to
// version, and a reload becomes the honest way to reset a board that has gone stale.

// Insertion-ordered, so the Map IS the LRU list: reading moves an entry to the end,
// and eviction takes from the front.
const RECORDS = new Map();

// Capped by POSTS, not by boards — the owner asked for "even like a hundred", and a
// hundred is cheap for shallow boards and not for deep ones. Measured 2026-09-01:
// ~22 KB of heap per 30-post board, so 100 shallow boards is ~2.2 MB but 100 boards
// paged to 120 posts is ~9 MB. Counting posts prices a board by what it actually
// holds. 3000 is a dozen ordinary boards, or a couple of deep ones.
export const POST_BUDGET = 3000;

const countPosts = () => [...RECORDS.values()].reduce((n, r) => n + r.posts.length, 0);

export function read(key) {
  const rec = RECORDS.get(key);
  if (!rec) return null;
  RECORDS.delete(key); RECORDS.set(key, rec); // most recently used
  return rec;
}

export function write(key, rec) {
  RECORDS.delete(key);
  RECORDS.set(key, rec);
  // evict oldest-first until the budget holds. Never evict the record just
  // written, however big it is: a board too large to cache should still be the
  // one you come back to, and dropping it would silently reinstate the bug.
  for (const k of [...RECORDS.keys()]) {
    if (countPosts() <= POST_BUDGET) break;
    if (k === key) continue;
    RECORDS.delete(k);
  }
}

// A record only exists once its fetch has landed, so two mounts racing each other
// both miss the cache and both fetch. That is not hypothetical: `render()` re-runs
// on every store change, and the second run reliably starts before the first
// response arrives — the count went 4 -> 2, not 4 -> 1, until this existed.
// A mount that finds a flight in progress joins it instead of starting another.
const INFLIGHT = new Map();
export function inflight(key) { return INFLIGHT.get(key) || null; }
export function track(key, promise) {
  INFLIGHT.set(key, promise);
  promise.then(() => {}, () => {}).then(() => { if (INFLIGHT.get(key) === promise) INFLIGHT.delete(key); });
  return promise;
}

export function drop(key) { RECORDS.delete(key); INFLIGHT.delete(key); }
export function clear() { RECORDS.clear(); INFLIGHT.clear(); }

// for tests and the dev bar
export function stats() { return { boards: RECORDS.size, posts: countPosts(), budget: POST_BUDGET }; }

// A board's identity, which is what "come back to this board" means. The feed's
// own uri where there is one — a slug is a registry nickname and two routes can
// carry the same feed (3v: `/f/:slug` and `/f/:handle/:rkey` resolve to one board).
export function keyOf(entry) {
  const s = entry?.source || {};
  return s.uri ? `feed:${s.uri}` : `${s.kind || 'board'}:${entry?.slug || ''}`;
}
