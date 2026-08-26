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
