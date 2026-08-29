// What hashtags have passed through your boards — a local, derived, disposable
// statistic, and the only material a "browse hashtags" surface can be built on.
//
// WHY IT HAS TO BE DERIVED. Probed 2026-08-28: Bluesky has no hashtag
// discovery. `app.bsky.unspecced.getTrends` carries postCount and a
// hot/cooling status and looks like the answer, but every result is a FEED —
// `link` is `/profile/<did>/feed/<rkey>` and `topic` is an opaque record key,
// not a tag. There is no list of hashtags to rank at any window, so the honest
// options are "tags I have seen" (this) and "tags a search turns up" (the
// /hashtags view's search box). Neither is "popular on Bluesky", and the view
// says so rather than implying it.
//
// DELIBERATELY NOT LEXICON-SHAPED, unlike js/tagsubs.js beside it. The
// difference is whose fact it is: a subscription is a DECISION you made and
// should follow your account into a repo; this is an OBSERVATION the app made
// about what you read, which it can rebuild by watching for a day. Putting it
// in someone's repo would be uploading telemetry about their reading habits
// under the guise of sync. So: capped, disposable, and nothing depends on it
// surviving.

import { normalizeTag } from './tagsubs.js';

export const TAGSTATS_KEY = 'forage.tagstats';
// Enough to rank a browse list from, small enough that the JSON stays trivial
// to parse on every board render. Eviction is by count first, so the cap costs
// you noise rather than the tags you actually read.
export const MAX_TRACKED = 300;
// Post ids already counted. Boards re-render constantly (a session restoring, a
// nav redraw), and without this a single popular post would inflate its own
// tags every time it was painted.
const SEEN_KEY = 'forage.tagstats.seen';
const MAX_SEEN = 1200;
// Recency is a monotonic OBSERVATION counter, not a post timestamp. Those are
// different facts: an old post you just read is recent to you, and a burst of
// posts sharing an indexedAt gave every tag the same "recency", which made
// eviction fall back to insertion order and throw away the newest. A counter
// cannot tie and needs no clock.
const SEQ_KEY = 'forage.tagstats.seq';
const nextSeq = () => {
  let n = 0;
  try { n = Number(localStorage.getItem(SEQ_KEY)) || 0; } catch { /* no storage */ }
  n += 1;
  try { localStorage.setItem(SEQ_KEY, String(n)); } catch { /* no storage */ }
  return n;
};

function readMap() {
  try {
    const raw = localStorage.getItem(TAGSTATS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [tag, v] of Object.entries(parsed)) {
      // `likes` is optional on read: entries written before it was tracked are
      // readable as zero rather than discarded. Throwing away a reader's whole
      // cache to add a field is a worse trade than a few tags reading 0.
      if (v && typeof v.count === 'number' && typeof v.seen === 'number') {
        out[tag] = { count: v.count, seen: v.seen, likes: typeof v.likes === 'number' ? v.likes : 0 };
      }
    }
    return out;
  } catch { return {}; }
}

const readSeen = () => {
  try { const p = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(p) ? p : []; }
  catch { return []; }
};

export function tagStatsCount() { return Object.keys(readMap()).length; }

// Tags on one shaped lens post, normalised and de-duplicated. Same facet shape
// tagChips reads, and the same normalisation a subscription uses — otherwise
// the browse list and the nav would disagree about what you had joined.
function tagsOf(post) {
  const raw = (post?.facets || []).flatMap((f) => (f.features || [])
    .filter((ft) => (ft.$type || '').endsWith('#tag'))
    .map((ft) => ft.tag));
  return [...new Set(raw.map(normalizeTag).filter(Boolean))];
}

export function observeTags(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return;
  let map, seen;
  try { map = readMap(); seen = new Set(readSeen()); } catch { return; }
  let touched = false;
  for (const p of posts) {
    const id = p?.id;
    if (!id || seen.has(id)) continue;
    const tags = tagsOf(p);
    seen.add(id);
    if (!tags.length) continue;
    const at = nextSeq();
    // Likes are summed from the SAME posts the count counts, so both sorts
    // share one denominator — a second sample would make "most liked" and
    // "most posts" answer about different material.
    const likes = Number(p.likes) || 0;
    for (const tag of tags) {
      const prev = map[tag] || { count: 0, seen: 0, likes: 0 };
      map[tag] = { count: prev.count + 1, seen: at, likes: prev.likes + likes };
      touched = true;
    }
  }
  // Count first, recency second. A tag you read constantly must not be evicted
  // by a burst of one-off noise, which a pure-recency cache would do.
  const entries = Object.entries(map).sort((a, b) =>
    (b[1].count - a[1].count) || (b[1].seen - a[1].seen));
  const kept = Object.fromEntries(entries.slice(0, MAX_TRACKED));
  const seenList = [...seen].slice(-MAX_SEEN);
  try {
    if (touched) localStorage.setItem(TAGSTATS_KEY, JSON.stringify(kept));
    localStorage.setItem(SEEN_KEY, JSON.stringify(seenList));
  } catch { /* private mode: the browse list is simply thinner */ }
}

// The orderings honestly available from what is stored. A fourth the owner
// asked about — "most posts in the last thirty days" — is NOT offered, and the
// omission is the point: this keeps ONE running total per tag, so a windowed
// count would have to be invented. Doing it properly means per-window buckets,
// which is a different storage shape and a deliberate decision rather than a
// tweak.
export const SORTS = Object.freeze(['count', 'likes', 'recent', 'alpha']);
const SORT_LABELS = { count: 'Most posts', likes: 'Most liked', recent: 'Recently loaded', alpha: 'A–Z' };
export const sortLabel = (id) => SORT_LABELS[id] || null;

const COMPARE = {
  count: (a, b) => (b[1].count - a[1].count) || (b[1].seen - a[1].seen),
  likes: (a, b) => (b[1].likes - a[1].likes) || (b[1].count - a[1].count),
  recent: (a, b) => (b[1].seen - a[1].seen) || (b[1].count - a[1].count),
  alpha: (a, b) => a[0].localeCompare(b[0]),
};

export function topTags(n, { sort = 'count' } = {}) {
  // An unknown sort falls back rather than returning nothing: a bad value in
  // storage or a stale link should cost you an ordering, not the whole list.
  const cmp = COMPARE[sort] || COMPARE.count;
  const all = Object.entries(readMap()).sort(cmp);
  // A non-finite or absent n means EVERY tag. `n | 0` would have turned
  // Infinity into 0 and silently returned nothing, which is the worst possible
  // reading of "show me all of them".
  const limited = Number.isFinite(n) ? all.slice(0, Math.max(0, Math.trunc(n))) : all;
  return limited.map(([tag, v]) => ({ tag, count: v.count, likes: v.likes }));
}

// ---- the word cloud's sizing ----
//
// A cloud sizes text by frequency, which is both the point and the
// accessibility problem: rare tags become small ones, and a 9px tag is one
// nobody with low vision can read. This repo blocks its build on axe at
// serious/critical, and croft-pwa/docs/ACCESSIBILITY.md is explicit that a
// green scan only counts if it graded the DOM a user actually gets.
//
// So the floor is the app's own smallest text token (--t-xs, 13px) rather than
// zero. A cloud may not invent a size smaller than anything else in the app.
// And it is a REPRESENTATION of a list that is still there — the toggle keeps
// the counted list one click away, which is the version with the numbers in it.
export const CLOUD_MIN_PX = 13;
export const CLOUD_MAX_PX = 32;

export function cloudSizes(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return [];
  const counts = tags.map((t) => Number(t.count) || 0);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  // No spread means no ranking to show. Scaling anyway would divide by zero,
  // and faking a gradient would be a lie told in font-size.
  const span = hi - lo;
  return tags.map((t) => ({
    ...t,
    size: span === 0
      ? CLOUD_MIN_PX
      : Math.round(CLOUD_MIN_PX + ((Number(t.count) || 0) - lo) / span * (CLOUD_MAX_PX - CLOUD_MIN_PX)),
  }));
}
