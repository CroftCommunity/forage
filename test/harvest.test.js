// The harvest's pure steps (plan 2026-09-08-plan-feed-index-and-jumpstarts,
// Phase 0). The network is one function the CLI injects; everything here is a
// fold over recorded views, so it runs hermetic and the numbers in the plan
// (D1–D7) can be reproduced from fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDEX_VERSION, validateIndex } from '../js/feed-index.js';
import {
  slimFeed, slimPack, rescueByScript, capPerCreator, packEdges, buildIndex, guard, serialize,
  FLOORS,
} from '../scripts/lib/harvest.mjs';

// the AppView's generatorView / starterPackView, trimmed to what the harvest reads
const gen = (n, extra = {}) => ({ uri: `at://did:plc:${n}/app.bsky.feed.generator/f${n}`, did: 'did:web:skyfeed.me',
  displayName: `Feed ${n}`, description: 'plants', likeCount: 150, creator: { did: `did:plc:${n}`, handle: `c${n}.test` },
  labels: [], indexedAt: '2025-01-01T00:00:00Z', ...extra });
const pack = (n, extra = {}) => ({ uri: `at://did:plc:${n}/app.bsky.graph.starterpack/p${n}`,
  record: { name: `Pack ${n}`, description: 'people', feeds: [] }, creator: { handle: `c${n}.test` },
  joinedAllTimeCount: 25, joinedWeekCount: 0, labels: [], feeds: [], list: { listItemCount: 40 }, ...extra });

test('slimFeed: a generator view becomes an index row — banded, tagged with its platform, desc capped, no count', () => {
  const r = slimFeed(gen(1, { description: 'x'.repeat(300), contentMode: 'app.bsky.feed.defs#contentModeVideo',
    labels: [{ val: 'sexual' }, { val: 'porn' }] }));
  assert.equal(r.uri, gen(1).uri);
  assert.equal(r.name, 'Feed 1');
  assert.equal(r.desc.length, 160);
  assert.equal(r.creator, 'c1.test');
  assert.equal(r.platform, 'skyfeed.me');
  assert.equal(r.band, 2);
  assert.equal(r.video, true);
  assert.deepEqual(r.labels, ['porn', 'sexual'], 'sorted, so the diff is stable');
  assert.equal('likeCount' in r, false, 'D2: a count inside the index churns the diff');
  assert.deepEqual(r.tags, []);
});

test('slimFeed: a generator hosted on a did:plc has no platform; a missing name falls back to the rkey', () => {
  const r = slimFeed(gen(1, { did: 'did:plc:zzz', displayName: undefined }));
  assert.equal(r.platform, null);
  assert.equal(r.name, 'f1');
});

test('slimPack: a starter pack view becomes a jumpstart row with its member count and feed uris', () => {
  const r = slimPack(pack(1, { feeds: [{ uri: gen(7).uri }, { uri: gen(8).uri }], joinedAllTimeCount: 1200 }));
  assert.equal(r.name, 'Pack 1');
  assert.equal(r.members, 40);
  assert.equal(r.band, 3);
  assert.deepEqual(r.feedUris, [gen(7).uri, gen(8).uri]);
  assert.equal('joinedAllTimeCount' in r, false);
});

test('rescueByScript: the top N per non-Latin script below the floor, above a small minimum', () => {
  const feeds = [
    gen(1, { displayName: '日本の写真', likeCount: 40 }),
    gen(2, { displayName: '日本の鳥', likeCount: 30 }),
    gen(3, { displayName: '日本の猫', likeCount: 2 }),      // under the minimum
    gen(4, { displayName: '한국 뉴스', likeCount: 9 }),
    gen(5, { displayName: 'Trending Brasil', likeCount: 50 }), // Latin: not rescued
    gen(6, { displayName: '日本の犬', likeCount: 500 }),     // clears the floor on its own
  ];
  const kept = rescueByScript(feeds, { floor: 100, perScript: 2, minLikes: 5 });
  assert.deepEqual([...kept].sort(), [gen(1).uri, gen(2).uri, gen(4).uri].sort());
});

test('capPerCreator: a creator keeps at most N feeds, by likes — bluetrends’ 2,966 rows do not ship', () => {
  const c1 = { did: 'did:plc:1', handle: 'c1.test' };
  const feeds = [gen(1, { likeCount: 5 }), gen(2, { likeCount: 50, creator: c1 }),
    gen(3, { likeCount: 500, creator: c1 }), gen(4, { likeCount: 1, creator: { did: 'did:plc:o', handle: 'other.test' } })];
  const kept = capPerCreator(feeds, { cap: 2 });
  assert.deepEqual(kept.map((f) => f.uri).sort(), [gen(2).uri, gen(3).uri, gen(4).uri].sort());
});

test('packEdges: [pack, feed] pairs, unique, sorted', () => {
  const packs = [slimPack(pack(2, { feeds: [{ uri: gen(1).uri }] })),
    slimPack(pack(1, { feeds: [{ uri: gen(2).uri }, { uri: gen(1).uri }, { uri: gen(1).uri }] }))];
  assert.deepEqual(packEdges(packs), [
    [pack(1).uri, gen(1).uri], [pack(1).uri, gen(2).uri], [pack(2).uri, gen(1).uri]]);
});

test('buildIndex: applies the floors, the rescue, the cap, keeps browse and suggested regardless, and validates', () => {
  const feeds = [gen(1, { likeCount: 150 }), gen(2, { likeCount: 3 }), gen(3, { likeCount: 5, displayName: '日本' }),
    gen(4, { likeCount: 0 })];
  const packs = [pack(1, { joinedAllTimeCount: 15, feeds: [{ uri: gen(1).uri }, { uri: gen(9).uri }] }),
    pack(2, { joinedAllTimeCount: 1 })];
  const ix = buildIndex({ feeds, packs, keepFeeds: new Set([gen(4).uri]), hydrated: [gen(9, { likeCount: 0 })],
    providers: [{ handle: 'c1.test', kind: 'curator', tags: ['test'] }] });
  const v = validateIndex(ix);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(ix.v, INDEX_VERSION);
  assert.deepEqual(ix.feeds.map((f) => f.uri).sort(),
    [gen(1).uri, gen(3).uri, gen(4).uri, gen(9).uri].sort(),
    'floor keeps 1; rescue keeps the Japanese 3; keepFeeds forces 4; the pack-referenced 9 is hydrated in');
  assert.deepEqual(ix.jumpstarts.map((p) => p.uri), [pack(1).uri], 'joins floor');
  assert.deepEqual(ix.edges, [[pack(1).uri, gen(1).uri], [pack(1).uri, gen(9).uri]]);
  assert.equal(ix.providers.length, 1);
  assert.equal(ix.feeds.find((f) => f.uri === gen(3).uri).lang, 'ja', 'the rescue tags the language it found');
});

test('FLOORS are the plan’s: 100 likes, 10 joins, 25 per script above 5, 25 per creator', () => {
  assert.deepEqual(FLOORS, { likes: 100, joins: 10, perScript: 25, minLikes: 5, perCreator: 25 });
});

test('guard: refuses a harvest materially smaller than the committed one, or below the absolute floors', () => {
  const prev = { feeds: 1400, jumpstarts: 1300 };
  assert.deepEqual(guard(prev, { feeds: 1350, jumpstarts: 1250 }), { ok: true });
  const r = guard(prev, { feeds: 900, jumpstarts: 1250 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /feeds 900 < 80% of 1400/);
  assert.equal(guard(prev, { feeds: 1350, jumpstarts: 200 }).ok, false);
  assert.equal(guard(null, { feeds: 499, jumpstarts: 400 }).ok, false, 'no previous file: the absolute floor still holds');
  assert.equal(guard(null, { feeds: 500, jumpstarts: 300 }).ok, true);
});

test('serialize: byte-identical for the same index, one row per line, no timestamp inside', () => {
  const ix = buildIndex({ feeds: [gen(2, { likeCount: 200 }), gen(1, { likeCount: 300 })], packs: [], providers: [] });
  const a = serialize(ix); const b = serialize(ix);
  assert.equal(a, b);
  assert.deepEqual(JSON.parse(a), ix);
  assert.ok(!/generatedAt|"ts"/.test(a));
  assert.ok(a.indexOf(gen(1).uri) < a.indexOf(gen(2).uri), 'sorted by uri in the bytes, not just in memory');
  assert.ok(a.endsWith('\n'));
});
