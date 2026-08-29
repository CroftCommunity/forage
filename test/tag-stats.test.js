// What hashtags have I actually SEEN — a local, derived, disposable statistic.
//
// This exists because Bluesky has no hashtag-discovery endpoint. Probed
// 2026-08-28: `app.bsky.unspecced.getTrends` looked like the answer — it
// carries postCount and a hot/cooling status — but every result is a FEED
// (`link = /profile/<did>/feed/<rkey>`, `topic` an opaque record key). There is
// no list of tags to rank, at any window. So "browse hashtags" can only be
// built from what passes through your own boards.
//
// DELIBERATELY NOT LEXICON-SHAPED, unlike js/tagsubs.js next door. A
// subscription is a decision you made and should follow your account; this is
// an observation the app made and can rebuild by watching for a day. Storing it
// in someone's repo would be uploading telemetry about their reading. It is
// capped, disposable, and nothing depends on it surviving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAGSTATS_KEY, observeTags, topTags, tagStatsCount, MAX_TRACKED } from '../js/tag-stats.js';

const withStorage = (seed, fn) => {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try { return fn(store); }
  finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
};

// A shaped lens post carries its tags as facets — the same shape tagChips reads.
// Ids are UNIQUE per call: deriving one from the tags made two posts sharing a
// tag into the same post, and the de-duplication then correctly counted them
// once. The fixture was wrong, not the counter — but it is worth the comment,
// because that is exactly the failure this module exists to prevent.
let seq = 0;
const post = (tags, at = '2026-08-28T10:00:00Z') => ({
  id: `at://x/app.bsky.feed.post/p${seq++}`,
  facets: tags.map((t) => ({ features: [{ $type: 'app.bsky.richtext.facet#tag', tag: t }] })),
  indexedAt: at,
});

test('nothing seen is an empty list, not an error, with or without storage', () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.deepEqual(topTags(5), []);
    observeTags([post(['harvest'])]);   // must not throw
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
  withStorage({}, () => assert.deepEqual(topTags(5), []));
});

test('observing counts posts, ranks by count, and returns only the top N asked for', () => {
  withStorage({}, () => {
    observeTags([
      post(['harvest', 'baking']), post(['harvest']), post(['harvest']),
      post(['baking']), post(['foraging']),
    ]);
    assert.deepEqual(topTags(2).map((t) => t.tag), ['harvest', 'baking']);
    assert.deepEqual(topTags(2).map((t) => t.count), [3, 2]);
    assert.equal(topTags(99).length, 3, 'asking for more than exist returns what exists');
  });
});

test('a post using one tag twice counts once — this counts POSTS, not mentions', () => {
  withStorage({}, () => {
    observeTags([post(['harvest', 'harvest', 'HARVEST'])]);
    assert.deepEqual(topTags(5), [{ tag: 'harvest', count: 1 }]);
  });
});

test('tags are normalised the same way a subscription is, so the two agree', () => {
  withStorage({}, () => {
    observeTags([post(['Harvest'])]);
    observeTags([post(['#harvest'])]);
    observeTags([post([' HARVEST '])]);
    assert.deepEqual(topTags(5), [{ tag: 'harvest', count: 3 }],
      'one tag, three spellings — otherwise the browse list and the nav disagree about what you joined');
  });
});

test('observing the same posts twice does not double-count them', () => {
  withStorage({}, () => {
    const batch = [post(['harvest']), post(['baking'])];
    observeTags(batch);
    observeTags(batch);
    assert.deepEqual(topTags(5).map((t) => t.count), [1, 1],
      'a board re-rendering must not inflate its own statistics');
  });
});

test('the cache is bounded — it evicts the least-seen rather than growing forever', () => {
  withStorage({}, () => {
    // One post per tag, so every count is 1 and eviction has to use recency.
    for (let i = 0; i < MAX_TRACKED + 25; i++) observeTags([post([`tag${i}`])]);
    assert.ok(tagStatsCount() <= MAX_TRACKED, `tracked ${tagStatsCount()} <= ${MAX_TRACKED}`);
    const kept = topTags(MAX_TRACKED).map((t) => t.tag);
    assert.ok(kept.includes(`tag${MAX_TRACKED + 24}`), 'the most recently seen survived');
    assert.ok(!kept.includes('tag0'), 'the oldest single-sighting was evicted');
  });
});

test('a busy tag survives eviction even when it has not been seen lately', () => {
  withStorage({}, () => {
    observeTags(Array.from({ length: 40 }, (_, i) => post(['classic', `x${i}`])));
    for (let i = 0; i < MAX_TRACKED + 25; i++) observeTags([post([`filler${i}`])]);
    assert.ok(topTags(MAX_TRACKED).some((t) => t.tag === 'classic'),
      'count outranks recency — a tag you read constantly is not evicted by a burst of noise');
  });
});

test('a corrupt cache reads as empty rather than throwing the page off', () => {
  withStorage({ [TAGSTATS_KEY]: 'not json' }, () => assert.deepEqual(topTags(5), []));
  withStorage({ [TAGSTATS_KEY]: '[1,2,3]' }, () => assert.deepEqual(topTags(5), []));
});
