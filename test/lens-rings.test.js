// 3a: the ring dial's member computation (plan 2026-08-25-1). Rings are
// aperture over the social graph: mutuals = follows ∩ followers (paginated),
// mutuals+1 = mutuals ∪ their follows under the D6-measured cap, with honest
// overflow (never silent truncation). Hermetic over canned graph pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLens, computeMutuals, RING_CAP } from '../js/substrates/lens.js';

const ME = 'did:plc:me';

// Canned paginated graph: pages['getFollows:did:plc:me'] = [[a,b],[c]] etc.
function graphSession(pages) {
  const calls = [];
  const fetchHandler = async (path) => {
    const u = new URL('http://x' + path);
    const method = u.pathname.split('/').pop().replace('app.bsky.graph.', '');
    const actor = u.searchParams.get('actor');
    const cursor = parseInt(u.searchParams.get('cursor') ?? '0', 10);
    calls.push({ method, actor, cursor });
    const key = `${method}:${actor}`;
    const pageList = pages[key] ?? [[]];
    const page = pageList[cursor] ?? [];
    const body = {
      [method === 'getFollowers' ? 'followers' : 'follows']: page.map((did) => ({ did, handle: did.slice(8) + '.test' })),
      ...(cursor + 1 < pageList.length ? { cursor: String(cursor + 1) } : {}),
    };
    return { ok: true, status: 200, json: async () => body };
  };
  return { session: { did: ME, handle: 'me.test', fetchHandler }, calls };
}

const dids = (n, prefix) => Array.from({ length: n }, (_, i) => `did:plc:${prefix}${i}`);

test('computeMutuals is the pure intersection, order = follows order', () => {
  assert.deepEqual(computeMutuals(['a', 'b', 'c'], ['c', 'a', 'x']), ['a', 'c']);
  assert.deepEqual(computeMutuals([], ['a']), []);
  assert.deepEqual(computeMutuals(['a'], []), []);
});

test('world and following bypass the graph entirely', async () => {
  const { session, calls } = graphSession({});
  const lens = createLens({ session });
  assert.deepEqual(await lens.ringMembers('world'), { members: null });
  assert.deepEqual(await lens.ringMembers('following'), { members: null });
  assert.equal(calls.length, 0, 'no graph fetches');
});

test('mutuals: follows ∩ followers across page boundaries', async () => {
  // the mutual "did:plc:m1" appears on PAGE 2 of followers — pagination must matter
  const { session } = graphSession({
    [`getFollows:${ME}`]: [['did:plc:m0', 'did:plc:m1', 'did:plc:only-follow']],
    [`getFollowers:${ME}`]: [['did:plc:m0', 'did:plc:fan'], ['did:plc:m1']],
  });
  const lens = createLens({ session });
  const r = await lens.ringMembers('mutuals');
  assert.deepEqual(r.members, ['did:plc:m0', 'did:plc:m1']);
  assert.equal(r.overflow, undefined, 'mutuals has no cap');
});

test('empty intersection is an empty ring, not an error', async () => {
  const { session } = graphSession({
    [`getFollows:${ME}`]: [['did:plc:a']],
    [`getFollowers:${ME}`]: [['did:plc:b']],
  });
  const r = await createLens({ session }).ringMembers('mutuals');
  assert.deepEqual(r.members, []);
});

test('mutuals+1 unions each mutual\'s follows, dedups, and never counts a member twice', async () => {
  const { session } = graphSession({
    [`getFollows:${ME}`]: [['did:plc:m0', 'did:plc:m1']],
    [`getFollowers:${ME}`]: [['did:plc:m0', 'did:plc:m1']],
    'getFollows:did:plc:m0': [['did:plc:m1', 'did:plc:ext0']], // m1 already a mutual → once
    'getFollows:did:plc:m1': [['did:plc:ext0', 'did:plc:ext1']], // ext0 twice → once
  });
  const r = await createLens({ session }).ringMembers('mutuals+1');
  assert.deepEqual([...r.members].sort(), ['did:plc:ext0', 'did:plc:ext1', 'did:plc:m0', 'did:plc:m1']);
  assert.equal(r.overflow, undefined, 'under the cap: no overflow reported');
});

test(`cap edges: cap−1 and cap pass untouched; cap+1 reports honest overflow (cap=${RING_CAP})`, async () => {
  const mk = (extras) => graphSession({
    [`getFollows:${ME}`]: [['did:plc:m0']],
    [`getFollowers:${ME}`]: [['did:plc:m0']],
    'getFollows:did:plc:m0': [dids(extras, 'x')],
  });
  for (const [extras, expectOverflow] of [[RING_CAP - 2, false], [RING_CAP - 1, false], [RING_CAP, true]]) {
    const { session } = mk(extras);
    const r = await createLens({ session }).ringMembers('mutuals+1');
    const total = 1 + extras; // m0 + extras
    if (expectOverflow) {
      assert.equal(r.members.length, RING_CAP, `capped at ${RING_CAP}`);
      assert.deepEqual(r.overflow, { capped: true, total }, 'true pre-cap count reported');
    } else {
      assert.equal(r.members.length, total);
      assert.equal(r.overflow, undefined);
    }
  }
});

test('an unknown ring refuses with words naming the known rings', async () => {
  const { session } = graphSession({});
  await assert.rejects(() => createLens({ session }).ringMembers('galaxy'), (e) => {
    assert.match(e.message, /galaxy/);
    assert.match(e.message, /mutuals/);
    return true;
  });
});

test('rings need a session, with words', async () => {
  await assert.rejects(() => createLens({}).ringMembers('mutuals'), /session/);
});

// ---- 3b: the merged ring board ----

function boardSession({ graph, authorFeeds }) {
  const fetchHandler = async (path) => {
    const u = new URL('http://x' + path);
    const method = u.pathname.split('/').pop();
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (method === 'app.bsky.graph.getFollows' || method === 'app.bsky.graph.getFollowers') {
      const actor = u.searchParams.get('actor');
      const key = `${method.replace('app.bsky.graph.', '')}:${actor}`;
      const page = (graph[key] ?? [[]])[0] ?? [];
      return json({ [method.endsWith('getFollowers') ? 'followers' : 'follows']: page.map((did) => ({ did })) });
    }
    if (method === 'app.bsky.feed.getAuthorFeed') {
      const actor = u.searchParams.get('actor');
      const cursor = u.searchParams.get('cursor') ?? '0';
      const spec = authorFeeds[actor];
      if (spec === 'FAIL') return { ok: false, status: 500, json: async () => ({}) };
      const page = (spec ?? {})[cursor];
      if (!page) return json({ feed: [] });
      return json({ feed: page.items.map((p) => ({ post: p })), ...(page.next ? { cursor: page.next } : {}) });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { did: 'did:plc:me', handle: 'me.test', fetchHandler };
}

const mkPost = (uri, author, indexedAt) => ({
  uri: `at://${author}/app.bsky.feed.post/${uri}`, cid: 'cid-' + uri,
  author: { did: author, handle: author.slice(8) + '.test' },
  record: { text: uri, createdAt: indexedAt }, indexedAt,
  replyCount: 0, repostCount: 0, likeCount: 0,
});

const RING_GRAPH = {
  'getFollows:did:plc:me': [['did:plc:aa', 'did:plc:bb']],
  'getFollowers:did:plc:me': [['did:plc:aa', 'did:plc:bb']],
};

test('3b: the merged board interleaves by time; TIES break by author DID then uri (deterministic)', async () => {
  const session = boardSession({ graph: RING_GRAPH, authorFeeds: {
    'did:plc:aa': { 0: { items: [mkPost('a1', 'did:plc:aa', '2026-08-25T10:00:00Z'), mkPost('a2', 'did:plc:aa', '2026-08-25T08:00:00Z')] } },
    'did:plc:bb': { 0: { items: [mkPost('b1', 'did:plc:bb', '2026-08-25T10:00:00Z'), mkPost('b2', 'did:plc:bb', '2026-08-25T09:00:00Z')] } },
  } });
  const board = await createLens({ session }).ringFeed('mutuals');
  const order = board.posts.map((p) => p.id.split('/').pop());
  // 10:00 tie: aa before bb (did order); then 09:00 b2; then 08:00 a2
  assert.deepEqual(order, ['a1', 'b1', 'b2', 'a2']);
  assert.equal(board.ring, 'mutuals');
  assert.deepEqual(board.failures, []);
});

test('3b: one member failing mid-fan-out is a REPORTED failure, not a broken board', async () => {
  const session = boardSession({ graph: RING_GRAPH, authorFeeds: {
    'did:plc:aa': { 0: { items: [mkPost('a1', 'did:plc:aa', '2026-08-25T10:00:00Z')] } },
    'did:plc:bb': 'FAIL',
  } });
  const board = await createLens({ session }).ringFeed('mutuals');
  assert.equal(board.posts.length, 1);
  assert.deepEqual(board.failures, ['did:plc:bb']);
});

test('3b: cursor round-trip resumes WITHOUT duplicates; exhausted members drop out', async () => {
  const session = boardSession({ graph: RING_GRAPH, authorFeeds: {
    'did:plc:aa': {
      0: { items: [mkPost('a1', 'did:plc:aa', '2026-08-25T10:00:00Z')], next: 'aa2' },
      aa2: { items: [mkPost('a2', 'did:plc:aa', '2026-08-25T07:00:00Z')] },
    },
    'did:plc:bb': { 0: { items: [mkPost('b1', 'did:plc:bb', '2026-08-25T09:00:00Z')] } }, // exhausted after page 1
  } });
  const lens = createLens({ session });
  const p1 = await lens.ringFeed('mutuals');
  assert.deepEqual(p1.posts.map((p) => p.id.split('/').pop()), ['a1', 'b1']);
  assert.ok(p1.cursor, 'a member still has more');
  const p2 = await lens.ringFeed('mutuals', { cursor: p1.cursor });
  assert.deepEqual(p2.posts.map((p) => p.id.split('/').pop()), ['a2'], 'no duplicates, only the resumed member');
  assert.equal(p2.cursor, undefined, 'everyone exhausted');
});

test('3b: following delegates to the timeline; world refuses with words (its board is the sources)', async () => {
  const calls = [];
  const session = { did: 'did:plc:me', handle: 'me.test', fetchHandler: async (path) => {
    calls.push(path);
    return { ok: true, status: 200, json: async () => ({ feed: [] }) };
  } };
  await createLens({ session }).ringFeed('following');
  assert.ok(calls[0].includes('getTimeline'));
  await assert.rejects(() => createLens({ session }).ringFeed('world'), /world.*sources|sources.*world/i);
});

test('3b: the overflow rides the board (capped ring reports it through)', async () => {
  const graph = {
    'getFollows:did:plc:me': [['did:plc:m0']],
    'getFollowers:did:plc:me': [['did:plc:m0']],
    'getFollows:did:plc:m0': [dids(RING_CAP + 4, 'x')],
  };
  const feeds = Object.fromEntries([['did:plc:m0', { 0: { items: [] } }],
    ...dids(RING_CAP + 4, 'x').map((d) => [d, { 0: { items: [] } }])]);
  const board = await createLens({ session: boardSession({ graph, authorFeeds: feeds }) }).ringFeed('mutuals+1');
  assert.deepEqual(board.overflow, { capped: true, total: RING_CAP + 5 });
});

// ---- 3l: opportunistic painting + per-member timeouts ----

test('3l: ringFeed paints progressively — onPage fires per member as each lands', async () => {
  const seen = [];
  const session = boardSession({ graph: RING_GRAPH, authorFeeds: {
    'did:plc:aa': { 0: { items: [mkPost('a1', 'did:plc:aa', '2026-08-25T10:00:00Z')] } },
    'did:plc:bb': { 0: { items: [mkPost('b1', 'did:plc:bb', '2026-08-25T11:00:00Z')] } },
  } });
  const board = await createLens({ session }).ringFeed('mutuals', {
    onPage: (posts) => seen.push(posts.map((p) => p.id.split('/').pop())),
  });
  assert.equal(seen.length, 2, 'one paint per member, not one at the end');
  assert.deepEqual(seen.flat().sort(), ['a1', 'b1']);
  // the final board is still fully sorted across members
  assert.deepEqual(board.posts.map((p) => p.id.split('/').pop()), ['b1', 'a1']);
});

test('3l: a member whose feed never answers is timed out and REPORTED; the board still paints', async () => {
  const session = { did: 'did:plc:me', handle: 'me.test', fetchHandler: async (path) => {
    const u = new URL('http://x' + path);
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (path.includes('graph.getFollows') || path.includes('graph.getFollowers')) {
      const key = path.includes('getFollowers') ? 'followers' : 'follows';
      return json({ [key]: [{ did: 'did:plc:aa' }, { did: 'did:plc:hang' }] });
    }
    if (u.searchParams.get('actor') === 'did:plc:hang') return new Promise(() => {}); // never resolves
    return json({ feed: [{ post: mkPost('a1', 'did:plc:aa', '2026-08-25T10:00:00Z') }] });
  } };
  const t0 = Date.now();
  const board = await createLens({ session }).ringFeed('mutuals', { timeoutMs: 40 });
  assert.ok(Date.now() - t0 < 3000, 'the hung member does not hold the board hostage');
  assert.deepEqual(board.posts.map((p) => p.id.split('/').pop()), ['a1']);
  assert.deepEqual(board.failures, ['did:plc:hang'], 'the timeout is reported, not swallowed');
});

// ---- 3x: the ring is remembered ----
// mutuals+1 costs one getFollows per mutual, so a 25-member ring is 26+ graph
// calls before a single post loads. Recomputing that on every visit to the
// dial is the difference between instant and several seconds. The graph
// changes slowly; the cache is per session, in memory, and keyed by ring.

test('3x: ringMembers is computed once per ring and reused', async () => {
  const calls = [];
  const json = (d) => ({ ok: true, status: 200, json: async () => d });
  const fetchHandler = async (path) => {
    calls.push(path);
    if (path.includes('getFollows?actor=did%3Aplc%3Ame')) return json({ follows: [{ did: 'did:plc:a' }, { did: 'did:plc:b' }] });
    if (path.includes('getFollowers')) return json({ followers: [{ did: 'did:plc:a' }] });
    if (path.includes('getFollows')) return json({ follows: [{ did: 'did:plc:c' }] });
    return json({});
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me', fetchHandler } });

  const first = await lens.ringMembers('mutuals');
  const graphCallsAfterFirst = calls.length;
  assert.deepEqual(first.members, ['did:plc:a']);

  const second = await lens.ringMembers('mutuals');
  assert.deepEqual(second.members, ['did:plc:a'], 'same answer');
  assert.equal(calls.length, graphCallsAfterFirst, 'and NO new graph calls — the ring is remembered');

  // a different ring is a different question, so it is computed
  const plus = await lens.ringMembers('mutuals+1');
  assert.ok(calls.length > graphCallsAfterFirst, 'mutuals+1 does its own work');
  assert.deepEqual(plus.members.sort(), ['did:plc:a', 'did:plc:c']);
  const afterPlus = calls.length;
  await lens.ringMembers('mutuals+1');
  assert.equal(calls.length, afterPlus, 'and is then remembered too');
});

test('3x: two callers racing the same cold ring share ONE computation', async () => {
  let graphCalls = 0;
  const json = (d) => ({ ok: true, status: 200, json: async () => d });
  const fetchHandler = async (path) => {
    graphCalls += 1;
    await new Promise((r) => setTimeout(r, 5));
    if (path.includes('getFollowers')) return json({ followers: [{ did: 'did:plc:a' }] });
    return json({ follows: [{ did: 'did:plc:a' }] });
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me', fetchHandler } });
  const [a, b] = await Promise.all([lens.ringMembers('mutuals'), lens.ringMembers('mutuals')]);
  assert.deepEqual(a.members, b.members);
  assert.equal(graphCalls, 2, 'follows + followers, once — not twice over');
});

test('3x: a FAILED ring is not cached — the next visit tries again', async () => {
  let attempt = 0;
  const json = (d) => ({ ok: true, status: 200, json: async () => d });
  const fetchHandler = async (path) => {
    attempt += 1;
    if (attempt <= 2) return { ok: false, status: 502, json: async () => ({}) };
    if (path.includes('getFollowers')) return json({ followers: [{ did: 'did:plc:a' }] });
    return json({ follows: [{ did: 'did:plc:a' }] });
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me', fetchHandler } });
  await assert.rejects(() => lens.ringMembers('mutuals'));
  const ok = await lens.ringMembers('mutuals');
  assert.deepEqual(ok.members, ['did:plc:a'], 'a transient failure must not be remembered as an empty ring');
});

test('3x: forgetRings clears the memory — a new account is a new graph', async () => {
  let graphCalls = 0;
  const json = (d) => ({ ok: true, status: 200, json: async () => d });
  const fetchHandler = async (path) => {
    graphCalls += 1;
    if (path.includes('getFollowers')) return json({ followers: [{ did: 'did:plc:a' }] });
    return json({ follows: [{ did: 'did:plc:a' }] });
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me', fetchHandler } });
  await lens.ringMembers('mutuals');
  const before = graphCalls;
  lens.forgetRings();
  await lens.ringMembers('mutuals');
  assert.ok(graphCalls > before, 'after forgetting, the graph is read again');
});
