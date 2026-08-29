// Trending hashtags, DERIVED — because there is no such endpoint.
//
// Probed 2026-08-28: app.bsky.unspecced.getTrends carries postCount and a
// hot/cooling status and returns FEED GENERATORS, with an opaque record key
// where a tag would be. Bluesky publishes no hashtag ranking at any window. So
// "trending hashtags" is: fetch the trending feeds, harvest the tag facets off
// their posts, count. The section then has to say what it sampled, which is why
// the sample travels with the result rather than being reconstructed by the
// view.
//
// THE COLLISION RULE (plan 2026-08-28-2) is tested here rather than commented,
// because the next person adding a background fetch will not read the comment:
// rendering counts toward "hashtags loaded", fetching does not. A refresh that
// quietly fed the loaded statistics would make one list "what I read" and the
// other "what I read plus whatever we polled", and both would be meaningless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRENDING_KEY, TRENDING_TTL_KEY, DEFAULT_TTL_MS, TRENDING_FEEDS,
  trendingTags, refreshTrending, trendingTtl, setTrendingTtl } from '../js/trending-tags.js';
import { TAGSTATS_KEY, tagStatsCount, observeTags } from '../js/tag-stats.js';

// AWAITS the body. The synchronous version of this helper — `try { return
// fn(store) } finally { restore() }` — tears the fake storage down the moment
// an async body returns its PROMISE, so every assertion after the first await
// reads the real environment instead. It fails as an empty store, which looks
// exactly like "the code did not write anything", and cost three tests before
// the shape of the failures gave it away.
const withStorage = async (seed, fn) => {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try { return await fn(store); }
  finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
};

const post = (id, tags, likes = 0) => ({
  id: `at://x/app.bsky.feed.post/${id}`, likes,
  facets: tags.map((t) => ({ features: [{ $type: 'app.bsky.richtext.facet#tag', tag: t }] })),
});

// A lens stub: three trending feeds, each with posts carrying tags.
const stubLens = (over = {}) => {
  const calls = { trending: 0, feeds: [] };
  return { calls, lens: {
    async trending() {
      calls.trending++;
      return over.topics ?? [
        { displayName: 'One', feedUri: 'at://did:plc:g/app.bsky.feed.generator/one' },
        { displayName: 'Two', feedUri: 'at://did:plc:g/app.bsky.feed.generator/two' },
        { displayName: 'No feed', feedUri: null },
      ];
    },
    async feed(source) {
      calls.feeds.push(source.uri);
      if (over.feedThrows?.(source.uri)) throw new Error('502');
      return { posts: source.uri.endsWith('one')
        ? [post('a', ['harvest', 'baking']), post('b', ['harvest'])]
        : [post('c', ['harvest']), post('d', ['mycology'])] };
    },
  } };
};

test('trending is harvested from the trending FEEDS and counted', async () => {
  await withStorage({}, async () => {
    const { lens, calls } = stubLens();
    const out = await refreshTrending(lens, { now: 1000 });
    assert.deepEqual(out.tags.map((t) => t.tag), ['harvest', 'baking', 'mycology'].slice(0, out.tags.length));
    assert.equal(out.tags[0].tag, 'harvest');
    assert.equal(out.tags[0].count, 3, 'counted across both feeds');
    assert.equal(calls.trending, 1);
    assert.equal(calls.feeds.length, 2, 'a topic with no feed uri is skipped rather than guessed at');
  });
});

test('the sample travels with the answer, so the page can say what it looked at', async () => {
  await withStorage({}, async () => {
    const { lens } = stubLens();
    const out = await refreshTrending(lens, { now: 1000 });
    assert.equal(out.sampled.feeds, 2);
    assert.equal(out.sampled.posts, 4);
    assert.equal(typeof out.at, 'number', 'and when, so staleness is visible');
  });
});

test('THE COLLISION RULE: a refresh does not touch the hashtags-loaded statistics', async () => {
  await withStorage({}, async () => {
    observeTags([post('read1', ['gardening'])]);   // something I actually read
    const before = tagStatsCount();
    const { lens } = stubLens();
    await refreshTrending(lens, { now: 1000 });
    assert.equal(tagStatsCount(), before,
      'polling the network is not reading — one list is what I read, the other is what is happening');
    assert.equal(localStorage.getItem(TAGSTATS_KEY).includes('harvest'), false,
      'and specifically: a tag only trending has not entered my own statistics');
  });
});

test('a cached answer is reused until it goes stale, then refetched', async () => {
  await withStorage({}, async () => {
    const { lens, calls } = stubLens();
    await refreshTrending(lens, { now: 0 });
    assert.equal((await trendingTags(lens, { now: 60_000 })).tags[0].tag, 'harvest');
    assert.equal(calls.trending, 1, 'inside the window: no second fetch, and no reshuffling list');
    await trendingTags(lens, { now: DEFAULT_TTL_MS + 1 });
    assert.equal(calls.trending, 2, 'past it: refetched');
  });
});

test('the refresh interval is a setting, hourly by default, and junk cannot break it', async () => {
  await withStorage({}, () => {
    assert.equal(trendingTtl(), DEFAULT_TTL_MS);
    assert.equal(DEFAULT_TTL_MS, 60 * 60 * 1000, 'an hour');
    setTrendingTtl(15 * 60 * 1000);
    assert.equal(trendingTtl(), 15 * 60 * 1000);
    for (const junk of ['nonsense', '-5', '0', null, undefined]) {
      setTrendingTtl(junk);
      assert.equal(trendingTtl(), 15 * 60 * 1000, `${junk} left the setting alone`);
    }
  });
});

test('one dead feed is skipped, not fatal — the barometer still reads', async () => {
  await withStorage({}, async () => {
    const { lens } = stubLens({ feedThrows: (uri) => uri.endsWith('two') });
    const out = await refreshTrending(lens, { now: 1000 });
    assert.equal(out.sampled.feeds, 1, 'the sample says it looked at one, not two');
    assert.ok(out.tags.some((t) => t.tag === 'harvest'));
    assert.ok(!out.tags.some((t) => t.tag === 'mycology'), 'nothing from the dead feed');
  });
});

test('a failed refresh keeps the last good answer rather than blanking the section', async () => {
  await withStorage({}, async () => {
    const { lens } = stubLens();
    await refreshTrending(lens, { now: 0 });
    const dead = { async trending() { throw new Error('offline'); } };
    const out = await trendingTags(dead, { now: DEFAULT_TTL_MS + 1 });
    assert.equal(out.tags[0].tag, 'harvest', 'stale but true beats empty');
    assert.equal(out.stale, true, 'and it says it is stale rather than pretending');
  });
});

test('never fetched and offline is an empty answer, not a thrown one', async () => {
  await withStorage({}, async () => {
    const dead = { async trending() { throw new Error('offline'); } };
    const out = await trendingTags(dead, { now: 0 });
    assert.deepEqual(out.tags, []);
  });
});

test('at most TRENDING_FEEDS feeds are sampled, however many are trending', async () => {
  await withStorage({}, async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ displayName: `T${i}`, feedUri: `at://did:plc:g/app.bsky.feed.generator/f${i}` }));
    const { lens, calls } = stubLens({ topics: many });
    await refreshTrending(lens, { now: 0 });
    assert.equal(calls.feeds.length, TRENDING_FEEDS, `a barometer is not a crawl: ${TRENDING_FEEDS} fetches, not 20`);
  });
});
