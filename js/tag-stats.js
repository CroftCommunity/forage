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
      if (v && typeof v.count === 'number' && typeof v.seen === 'number') out[tag] = v;
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
    for (const tag of tags) {
      const prev = map[tag] || { count: 0, seen: 0 };
      map[tag] = { count: prev.count + 1, seen: at };
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

export function topTags(n) {
  return Object.entries(readMap())
    .sort((a, b) => (b[1].count - a[1].count) || (b[1].seen - a[1].seen))
    .slice(0, Math.max(0, n | 0))
    .map(([tag, v]) => ({ tag, count: v.count }));
}
