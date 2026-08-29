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
const post = (tags, at = '2026-08-28T10:00:00Z', likes = 0) => ({
  id: `at://x/app.bsky.feed.post/p${seq++}`,
  likes,
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
    assert.deepEqual(topTags(5).map(({ tag, count }) => ({ tag, count })), [{ tag: 'harvest', count: 1 }]);
  });
});

test('tags are normalised the same way a subscription is, so the two agree', () => {
  withStorage({}, () => {
    observeTags([post(['Harvest'])]);
    observeTags([post(['#harvest'])]);
    observeTags([post([' HARVEST '])]);
    assert.deepEqual(topTags(5).map(({ tag, count }) => ({ tag, count })), [{ tag: 'harvest', count: 3 }],
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

// ---- sorting the browse list ----
//
// Four orderings are honestly available from what is stored: how many posts
// carried a tag, how well-liked those posts were, how recently one loaded, and
// the alphabet. "Most posts" and "most liked" are genuinely different
// questions — a tag can be everywhere and ignored, or rare and loved. A fifth the owner
// asked about earlier — "most posts in the last thirty days" — is NOT here,
// and deliberately: it needs per-window counts, where this keeps one running
// total. Offering it off this data would mean inventing a denominator.
import { SORTS, sortLabel } from '../js/tag-stats.js';

test('every offered sort is a real ordering with a label a reader can read', () => {
  assert.deepEqual(SORTS, ['count', 'likes', 'recent', 'alpha']);
  for (const s of SORTS) assert.ok(sortLabel(s) && sortLabel(s) !== s, `${s} has a human label`);
});

test('sorting by count, by recency, and alphabetically give different answers', () => {
  withStorage({}, () => {
    // zulu is busiest but oldest; alpha is newest but quietest.
    observeTags([post(['zulu']), post(['zulu']), post(['zulu'])]);
    observeTags([post(['mike']), post(['mike'])]);
    observeTags([post(['alpha'])]);
    assert.deepEqual(topTags(3, { sort: 'count' }).map((t) => t.tag), ['zulu', 'mike', 'alpha']);
    assert.deepEqual(topTags(3, { sort: 'recent' }).map((t) => t.tag), ['alpha', 'mike', 'zulu']);
    assert.deepEqual(topTags(3, { sort: 'alpha' }).map((t) => t.tag), ['alpha', 'mike', 'zulu']);
  });
});

test('an unknown sort falls back to count rather than returning nothing', () => {
  withStorage({}, () => {
    observeTags([post(['harvest']), post(['harvest']), post(['baking'])]);
    assert.deepEqual(topTags(2, { sort: 'nonsense' }).map((t) => t.tag), ['harvest', 'baking']);
    assert.deepEqual(topTags(2).map((t) => t.tag), ['harvest', 'baking'], 'and no options at all is the same');
  });
});

// ---- likes, and seeing the whole list ----
//
// "Most posts" and "most liked" are different questions and a browse list
// should answer both: a tag can be everywhere and ignored, or rare and loved.
// The likes are summed from the posts we counted, so the denominator is the
// same one the count uses — no second sample sneaking in.
test('likes accumulate per tag from the posts that carried it', () => {
  withStorage({}, () => {
    observeTags([post(['quiet'], '2026-08-28T10:00:00Z', 1), post(['quiet'], '2026-08-28T10:00:00Z', 1)]);
    observeTags([post(['loud'], '2026-08-28T10:00:00Z', 500)]);
    assert.deepEqual(topTags(2, { sort: 'count' }).map((t) => t.tag), ['quiet', 'loud'],
      'quiet is on more posts');
    assert.deepEqual(topTags(2, { sort: 'likes' }).map((t) => t.tag), ['loud', 'quiet'],
      'loud is on better-liked ones — a different question with a different answer');
    assert.deepEqual(topTags(2, { sort: 'likes' }).map((t) => t.likes), [500, 2]);
  });
});

test('a tag observed before likes were tracked still sorts, as zero rather than absent', () => {
  withStorage({ [TAGSTATS_KEY]: JSON.stringify({ legacy: { count: 4, seen: 1 } }) }, () => {
    const [row] = topTags(5, { sort: 'likes' });
    assert.equal(row.tag, 'legacy');
    assert.equal(row.likes, 0, 'an older cache entry is readable, not discarded');
  });
});

test('asking for every tag returns every tag, not a slice', () => {
  withStorage({}, () => {
    for (let i = 0; i < 40; i++) observeTags([post([`t${i}`])]);
    assert.equal(topTags(12).length, 12, 'a top-N is still a top-N');
    assert.equal(topTags(Infinity).length, 40, 'and Infinity means all of them');
    assert.equal(tagStatsCount(), 40);
  });
});
