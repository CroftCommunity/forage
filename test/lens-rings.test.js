// The scope's member computation. Rings are an aperture over the social graph:
// mutuals = follows ∩ followers (paginated), mutuals+1 = mutuals ∪ their
// follows. Hermetic over canned graph pages.
//
// This file was twice its length until 2026-09-03. The other half tested the
// merged ring BOARD — the per-member author-feed fan-out, its cursor, its kind
// tabs, its progressive paint and the RING_CAP edges — and went with that board
// when /r/<rung> was retired and the ring became a display scope. What remains
// is the walk itself, which the scope still needs and which was never the
// board's: who is in a rung, computed once and remembered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLens, computeMutuals } from '../js/substrates/lens.js';

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

test('world has no member list; every other rung is computed from the graph', async () => {
  const { session, calls } = graphSession({});
  const lens = createLens({ session });
  assert.deepEqual(await lens.scopeMembersFor('world'), { members: null });
  assert.equal(calls.length, 0, 'no graph fetches');
});

test('the mutuals rung: follows ∩ followers across page boundaries', async () => {
  // the mutual "did:plc:m1" appears on PAGE 2 of followers — pagination must matter
  const { session } = graphSession({
    [`getFollows:${ME}`]: [['did:plc:m0', 'did:plc:m1', 'did:plc:only-follow']],
    [`getFollowers:${ME}`]: [['did:plc:m0', 'did:plc:fan'], ['did:plc:m1']],
  });
  const lens = createLens({ session });
  const r = await lens.scopeMembersFor('mut');
  // ME leads every rung: the ladder is cumulative from 'me' inward-out, so
  // "my mutuals" is my posts AND theirs. That is the containment property
  // (test/rings.test.js) showing up in the substrate.
  assert.deepEqual(r.members, [ME, 'did:plc:m0', 'did:plc:m1']);
  assert.equal(r.overflow, undefined, 'the mutuals rung has no cap');
});

test('empty intersection is an empty ring, not an error', async () => {
  const { session } = graphSession({
    [`getFollows:${ME}`]: [['did:plc:a']],
    [`getFollowers:${ME}`]: [['did:plc:b']],
  });
  const r = await createLens({ session }).scopeMembersFor('mut');
  // No mutuals is not an empty BOARD any more: you are always in your own ring.
  assert.deepEqual(r.members, [ME], 'the innermost rung is still you');
});

test('mutuals+1 unions each mutual\'s follows, dedups, and never counts a member twice', async () => {
  const { session } = graphSession({
    [`getFollows:${ME}`]: [['did:plc:m0', 'did:plc:m1']],
    [`getFollowers:${ME}`]: [['did:plc:m0', 'did:plc:m1']],
    'getFollows:did:plc:m0': [['did:plc:m1', 'did:plc:ext0']], // m1 already a mutual → once
    'getFollows:did:plc:m1': [['did:plc:ext0', 'did:plc:ext1']], // ext0 twice → once
  });
  const r = await createLens({ session }).scopeMembersFor('hop');
  assert.deepEqual([...r.members].sort(), [ME, 'did:plc:ext0', 'did:plc:ext1', 'did:plc:m0', 'did:plc:m1'].sort());
  assert.equal(r.overflow, undefined, 'under the cap: no overflow reported');
});


// ---- 3x: the ring is remembered ----
// mutuals+1 costs one getFollows per mutual, so a wide ring is dozens of graph
// calls before a single post is filtered. Recomputing that every time the
// reader moves the pill is the difference between instant and several seconds.
// The graph changes slowly; the cache is per session, in memory, and keyed by
// scope, with the GRAPH cached separately so two scopes share one walk.

test('3x: a scope is computed once and reused', async () => {
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

  const first = await lens.scopeMembersFor('mut');
  const graphCallsAfterFirst = calls.length;
  assert.deepEqual(first.members, ['did:plc:me', 'did:plc:a']);

  const second = await lens.scopeMembersFor('mut');
  assert.deepEqual(second.members, ['did:plc:me', 'did:plc:a'], 'same answer');
  assert.equal(calls.length, graphCallsAfterFirst, 'and NO new graph calls — the ring is remembered');

  // a different ring is a different question, so it is computed
  const plus = await lens.scopeMembersFor('hop');
  assert.ok(calls.length > graphCallsAfterFirst, 'the hop rung does its own work');
  // THE COUNTEREXAMPLE, in the substrate. This fixture follows a and b, but
  // only a follows back, and a follows c. The OLD mutuals+1 was {a, c} — it
  // dropped b, someone you follow, which is why "one step further out" could
  // show you less. The hop rung is cumulative, so b is in it.
  assert.deepEqual(plus.members.sort(),
    ['did:plc:a', 'did:plc:b', 'did:plc:c', 'did:plc:me'].sort());
  const afterPlus = calls.length;
  await lens.scopeMembersFor('hop');
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
  const [a, b] = await Promise.all([lens.scopeMembersFor('mut'), lens.scopeMembersFor('mut')]);
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
  await assert.rejects(() => lens.scopeMembersFor('mut'));
  const ok = await lens.scopeMembersFor('mut');
  assert.deepEqual(ok.members, ['did:plc:me', 'did:plc:a'], 'a transient failure must not be remembered as an empty ring');
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
  await lens.scopeMembersFor('mut');
  const before = graphCalls;
  lens.forgetRings();
  await lens.scopeMembersFor('mut');
  assert.ok(graphCalls > before, 'after forgetting, the graph is read again');
});
