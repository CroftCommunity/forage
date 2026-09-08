// Mixes — plan 2026-09-08, Phase 3: the substrate fan-out.
//
// lens.mix(rows, opts) opens one request per enabled row, in parallel, each
// behind a per-source timeout; a source that fails or hangs is reported in
// `failures` with words and the board still paints. Every constituent is
// re-shaped under a MIX src (feedKind 'mix'), so the ring's feed/hashtag
// exemption never sees it — a mix is "these things but within this radius"
// (E159). Each source is asked for a SMALL page (Phase 0: the payload, not
// the count, is the cost that scales).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLens } from '../js/substrates/lens.js';

const ME = 'did:plc:me';
const IN = 'did:plc:in';
const OUT = 'did:plc:out';
let seq = 0;
const post = (did, text, likes = 0) => ({
  uri: `at://${did}/app.bsky.feed.post/p${++seq}`, cid: `c${seq}`,
  author: { did, handle: `${did.split(':').pop()}.test` },
  record: { text, createdAt: `2026-09-08T10:00:${String(seq % 60).padStart(2, '0')}Z` },
  indexedAt: '2026-09-08T10:00:00Z', likeCount: likes, replyCount: 0,
});
const page = (posts, cursor) => ({ feed: posts.map((p) => ({ post: p })), ...(cursor ? { cursor } : {}) });

const MOD = {
  'app.bsky.actor.getPreferences': { preferences: [] },
  'app.bsky.graph.getMutes': { mutes: [] }, 'app.bsky.graph.getBlocks': { blocks: [] },
  'app.bsky.graph.getListMutes': { lists: [] }, 'app.bsky.graph.getListBlocks': { lists: [] },
};

// Routes by xrpc name; a handler may be a value, a function of the query, a
// thrown error, or 'hang'. Every call is recorded with its query.
function mixSession(routes, graph = { follows: [], followers: [] }) {
  const calls = [];
  const fetchHandler = async (path) => {
    const u = new URL('http://x' + path);
    const name = u.pathname.split('/').pop();
    const q = Object.fromEntries(u.searchParams);
    calls.push({ name, q });
    if (name === 'app.bsky.graph.getFollows') return { ok: true, status: 200, json: async () => ({ follows: graph.follows.map((did) => ({ did })) }) };
    if (name === 'app.bsky.graph.getFollowers') return { ok: true, status: 200, json: async () => ({ followers: graph.followers.map((did) => ({ did })) }) };
    const r = routes[name] ?? MOD[name];
    if (r === 'hang') return new Promise(() => {});
    if (r instanceof Error) throw r;
    if (r === undefined) return { ok: false, status: 404, json: async () => ({ error: 'NotFound' }) };
    const body = typeof r === 'function' ? r(q) : r;
    if (body && body.__status) return { ok: false, status: body.__status, json: async () => ({ error: 'Bad' }) };
    return { ok: true, status: 200, json: async () => body };
  };
  return { session: { did: ME, handle: 'me.test', fetchHandler }, calls };
}

const ROWS = [
  { id: 'timeline', kind: 'timeline', source: { kind: 'timeline' }, title: 'Following', weight: 1 },
  { id: 'feed:at://f/funny', kind: 'feed', source: { kind: 'feed', uri: 'at://f/funny' }, title: 'Funny', weight: 2 },
  { id: 'hashtag:harvest', kind: 'hashtag', source: { kind: 'hashtag', tag: 'harvest' }, title: '#harvest', weight: 0.5 },
];
const routesFor = (over = {}) => ({
  'app.bsky.feed.getTimeline': (q) => page([post(IN, 'tl1'), post(IN, 'tl2'), post(IN, 'tl3')], q.cursor ? undefined : 'tl-next'),
  'app.bsky.feed.getFeed': (q) => page([post(OUT, 'f1', 9), post(OUT, 'f2', 8), post(OUT, 'f3', 7), post(OUT, 'f4', 6), post(OUT, 'f5', 5)], q.cursor ? undefined : 'f-next'),
  'app.bsky.feed.searchPosts': () => ({ posts: [post(OUT, 'h1'), post(OUT, 'h2')] }),
  ...over,
});

test('every enabled row is fetched, in parallel, for a SMALL page; the result is dealt', async () => {
  const { session, calls } = mixSession(routesFor());
  const lens = createLens({ session });
  const r = await lens.mix(ROWS, { slug: 'home', name: 'Home', pageSize: 10 });
  const names = calls.map((c) => c.name).filter((n) => n.startsWith('app.bsky.feed.'));
  assert.deepEqual(names.sort(), ['app.bsky.feed.getFeed', 'app.bsky.feed.getTimeline', 'app.bsky.feed.searchPosts']);
  assert.ok(calls.filter((c) => c.name.startsWith('app.bsky.feed.')).every((c) => c.q.limit === '10'), 'each source asked for the page size, not 30');
  assert.equal(r.failures.length, 0);
  // the deal: ×2 funny deals 4, ×1 timeline 2, ×½ harvest 1
  assert.deepEqual(r.posts.slice(0, 7).map((p) => p.body), ['f1', 'f2', 'f3', 'f4', 'tl1', 'tl2', 'h1']);
  assert.equal(r.posts.length, 10);
  assert.deepEqual(r.sources.map((s) => [s.id, s.ok, s.posts.length]), [['timeline', true, 3], ['feed:at://f/funny', true, 5], ['hashtag:harvest', true, 2]]);
});

test('a page size is required to be small: the default is 12, never 30', async () => {
  const { session, calls } = mixSession(routesFor());
  await createLens({ session }).mix(ROWS, { slug: 'home', name: 'Home' });
  assert.ok(calls.filter((c) => c.name.startsWith('app.bsky.feed.')).every((c) => c.q.limit === '12'));
});

test('every dealt post is a MIX post: feedKind mix, the slug, its row weight and source id', async () => {
  const { session } = mixSession(routesFor());
  const r = await createLens({ session }).mix(ROWS, { slug: 'home', name: 'Home' });
  assert.ok(r.posts.every((p) => p.feedKind === 'mix' && p.feedSlug === 'm:home'));
  const f = r.posts.find((p) => p.body === 'f1');
  assert.deepEqual({ w: f.mixWeight, src: f.mixSource }, { w: 2, src: 'feed:at://f/funny' });
  assert.equal(r.posts.find((p) => p.body === 'h1').mixWeight, 0.5);
  assert.equal(r.feedSlug, 'm:home');
  assert.equal(r.feedTitle, 'Home');
});

test('the ring applies to a mix even with the feed/hashtag exemption ON — E159', async () => {
  const { session } = mixSession(routesFor(), { follows: [IN], followers: [] });
  const lens = createLens({ session });
  await lens.loadPosture();
  await lens.applyScope('fol', { exemptKinds: ['feed', 'hashtag'] });
  const r = await lens.mix(ROWS, { slug: 'home', name: 'Home' });
  assert.deepEqual(r.posts.map((p) => p.body), ['tl1', 'tl2', 'tl3'], 'the strangers from the feed and the hashtag are gone');
  // and the same feed opened BY NAME is whole: the exemption still means what it meant
  const byName = await lens.feed({ kind: 'feed', uri: 'at://f/funny' });
  assert.equal(byName.posts.length, 5);
});

test('a failed source is named, not fatal; a hung one times out; the rest paint', async () => {
  const { session } = mixSession(routesFor({
    'app.bsky.feed.getFeed': { __status: 502 },
    'app.bsky.feed.searchPosts': 'hang',
  }));
  const r = await createLens({ session }).mix(ROWS, { slug: 'home', name: 'Home', timeoutMs: 50 });
  assert.deepEqual(r.posts.map((p) => p.body), ['tl1', 'tl2', 'tl3']);
  assert.equal(r.failures.length, 2);
  const byId = Object.fromEntries(r.failures.map((f) => [f.id, f]));
  assert.match(byId['feed:at://f/funny'].error, /502/);
  assert.match(byId['hashtag:harvest'].error, /timed out|timeout/i);
  assert.equal(byId['feed:at://f/funny'].title, 'Funny', 'named for the info line');
  assert.deepEqual(r.sources.map((s) => s.ok), [true, false, false]);
});

test('cursors come back per source, and More pages only the sources that had one', async () => {
  const { session, calls } = mixSession(routesFor());
  const lens = createLens({ session });
  const first = await lens.mix(ROWS, { slug: 'home', name: 'Home' });
  assert.deepEqual(first.cursors, { timeline: 'tl-next', 'feed:at://f/funny': 'f-next' }, 'the hashtag answered without a cursor');
  calls.length = 0;
  const more = await lens.mix(ROWS, { slug: 'home', name: 'Home', cursors: first.cursors });
  const paged = calls.filter((c) => c.name.startsWith('app.bsky.feed.'));
  assert.deepEqual(paged.map((c) => c.name).sort(), ['app.bsky.feed.getFeed', 'app.bsky.feed.getTimeline']);
  assert.ok(paged.every((c) => c.q.cursor), 'each with its own cursor');
  assert.deepEqual(more.cursors, {}, 'and now both are exhausted');
});

test('a post in two sources appears once, carrying the HEAVIER weight (D8)', async () => {
  const shared = post(IN, 'both', 3);
  const { session } = mixSession(routesFor({
    'app.bsky.feed.getTimeline': () => page([shared, post(IN, 'tl-only')]),
    'app.bsky.feed.getFeed': () => page([{ ...shared }, post(OUT, 'f-only')]),
  }));
  const r = await createLens({ session }).mix(ROWS, { slug: 'home', name: 'Home' });
  const hits = r.posts.filter((p) => p.body === 'both');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].mixWeight, 2, 'the ×2 feed, not the ×1 timeline it was dealt from');
});

test('a timeline envelope keeps its kind through the re-shape (repost, reply)', async () => {
  const orig = post(OUT, 'reposted');
  const { session } = mixSession(routesFor({
    'app.bsky.feed.getTimeline': () => ({ feed: [
      { post: orig, reason: { $type: 'app.bsky.feed.defs#reasonRepost', by: { handle: 'in.test' } } },
      { post: post(IN, 'a reply'), reply: { parent: { uri: orig.uri, record: { text: 'reposted' }, author: { handle: 'out.test' } } } },
    ] }),
  }));
  const r = await createLens({ session }).mix(ROWS, { slug: 'home', name: 'Home' });
  assert.equal(r.posts.find((p) => p.body === 'reposted').itemKind, 'repost');
  assert.equal(r.posts.find((p) => p.body === 'a reply').itemKind, 'reply');
});

test('an off row is never fetched, and no rows is an empty board with no requests', async () => {
  const { session, calls } = mixSession(routesFor());
  const lens = createLens({ session });
  const r = await lens.mix([], { slug: 'empty', name: 'Empty' });
  assert.deepEqual(r.posts, []);
  assert.equal(calls.filter((c) => c.name.startsWith('app.bsky.feed.')).length, 0);
});

test('mix refuses a row of a kind it cannot fetch, by name, before any request', async () => {
  const { session, calls } = mixSession(routesFor());
  await assert.rejects(createLens({ session }).mix([{ id: 'author:x', kind: 'author', source: { kind: 'author', actor: 'x' }, title: 'x', weight: 1 }], { slug: 'h', name: 'H' }), /author/);
  assert.equal(calls.length, 0);
});
