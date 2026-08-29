// "What is the network doing right now", DERIVED — because there is no
// endpoint that answers it.
//
// Probed against the live API on 2026-08-28: `app.bsky.unspecced.getTrends`
// carries a postCount, a startedAt and a hot/cooling status, and looks exactly
// like a trending-hashtags endpoint. It returns FEED GENERATORS. Every `link`
// is `/profile/<did>/feed/<rkey>` and every `topic` is an opaque record key,
// not a tag. Bluesky publishes no hashtag ranking at any window.
//
// So this fetches the trending FEEDS and harvests the tag facets off their
// posts. That is a real barometer, and the sample travels with the answer so
// the page can say what it looked at — "tags on posts in what's trending right
// now" is defensible; "trending hashtags" would claim a ranking nobody
// publishes.
//
// THE COLLISION RULE (plan 2026-08-28-2). Nothing here touches
// js/tag-stats.js. That module counts what a reader was SHOWN, via
// renderBoard; this one polls. Merging them would make one list "what I read"
// and the other "what I read plus whatever we fetched in the background", and
// both would stop meaning anything. Opening a trending tag's board still counts
// toward the loaded statistics, which is correct — you read it. The rule is
// "rendering counts, fetching does not", and test/trending-tags.test.js pins it
// because the next person adding a background fetch will not read this comment.

import { normalizeTag } from './tagsubs.js';

export const TRENDING_KEY = 'forage.trendingtags';
export const TRENDING_TTL_KEY = 'forage.trendingttl';
export const DEFAULT_TTL_MS = 60 * 60 * 1000; // hourly (owner, 2026-08-28)
// A barometer, not a crawl. Five feeds is one request each on top of the trend
// list — cheap once an hour, and rude on every page view, which is what the
// cache is for.
export const TRENDING_FEEDS = 5;

export function trendingTtl() {
  try {
    const n = Number(localStorage.getItem(TRENDING_TTL_KEY));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
  } catch { return DEFAULT_TTL_MS; }
}

export function setTrendingTtl(ms) {
  const n = Number(ms);
  // Refuse rather than store: a zero or negative interval would refetch on
  // every render, which is six requests per keystroke-triggered repaint.
  if (!Number.isFinite(n) || n <= 0) return;
  try { localStorage.setItem(TRENDING_TTL_KEY, String(Math.trunc(n))); } catch { /* private mode */ }
}

function readCache() {
  try {
    const raw = localStorage.getItem(TRENDING_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || !Array.isArray(c.tags) || typeof c.at !== 'number') return null;
    return c;
  } catch { return null; }
}

function tagsOfPost(p) {
  const raw = (p?.facets || []).flatMap((f) => (f.features || [])
    .filter((ft) => (ft.$type || '').endsWith('#tag')).map((ft) => ft.tag));
  return [...new Set(raw.map(normalizeTag).filter(Boolean))];
}

export async function refreshTrending(lens, { now = Date.now() } = {}) {
  const topics = await lens.trending();
  // A topic whose link is not a feed uri is SKIPPED rather than guessed at —
  // the shape of that link is undocumented and inventing one would fetch
  // whatever a future format happened to resolve to.
  const uris = topics.map((t) => t.feedUri).filter(Boolean).slice(0, TRENDING_FEEDS);
  const counts = new Map();
  let feeds = 0, posts = 0;
  const results = await Promise.all(uris.map(async (uri) => {
    // One dead feed must not blank the barometer; it just narrows the sample,
    // and the sample is reported.
    try { return await lens.feed({ kind: 'feed', uri }); } catch { return null; }
  }));
  for (const board of results) {
    if (!board) continue;
    feeds++;
    for (const p of board.posts || []) {
      posts++;
      for (const t of tagsOfPost(p)) counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const tags = [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
  const cache = { at: now, tags, sampled: { feeds, posts } };
  try { localStorage.setItem(TRENDING_KEY, JSON.stringify(cache)); } catch { /* private mode */ }
  return cache;
}

export async function trendingTags(lens, { now = Date.now() } = {}) {
  const cached = readCache();
  if (cached && now - cached.at < trendingTtl()) return { ...cached, stale: false };
  try {
    return { ...(await refreshTrending(lens, { now })), stale: false };
  } catch {
    // Stale but true beats empty: a barometer that blanks when the network
    // hiccups is worse than one that says when it last read.
    return cached ? { ...cached, stale: true } : { at: 0, tags: [], sampled: { feeds: 0, posts: 0 }, stale: true };
  }
}
