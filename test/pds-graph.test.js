import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPdsGraphSource } from '../js/substrates/pds-graph.js';
import { memoryStore } from '../vendor/pds-walker/pds-walker/index.js';

// P4 (plan 2026-09-08-plan-beta-pds-walker): the walker as a graphSource. A scripted fake
// transport stands in for the network; the store is the library's own memory store through
// the vendored path. me follows M (mutual, follows me and Y), F (not mutual, follows X), N.
const ME = 'did:plc:me';
const GRAPH = {
  [ME]: { pds: 'https://a.host.bsky.network', rev: 'r-me', follows: ['did:plc:m', 'did:plc:f', 'did:plc:n'] },
  'did:plc:m': { pds: 'https://a.host.bsky.network', rev: 'r-m', follows: [ME, 'did:plc:y'] },
  'did:plc:f': { pds: 'https://b.host.bsky.network', rev: 'r-f', follows: ['did:plc:x'] },
  'did:plc:n': { pds: 'https://c.host.bsky.network', rev: 'r-n', follows: [] },
};
function fakeTransport(graph, { failHosts = new Set() } = {}) {
  const hostOf = (pds) => new URL(pds).host;
  const calls = [];
  return {
    calls,
    resolve: async (did) => { calls.push(`resolve ${did}`); const n = graph[did]; return n ? { pds: n.pds } : { unknown: '404' }; },
    latestRev: async (pds, did) => { calls.push(`rev ${did}`); return failHosts.has(hostOf(pds)) ? { unknown: '502' } : graph[did].rev; },
    listFollows: async (pds, did) => { calls.push(`list ${did}`); return failHosts.has(hostOf(pds)) ? { unknown: '502' } : graph[did].follows; },
  };
}
const quiet = { debug() {}, info() {}, warn() {}, error() {} };

test('maps the walk to the lens graph shape: follows, followers := those who follow back, no hop unless asked', async () => {
  const source = createPdsGraphSource({ transport: fakeTransport(GRAPH), store: memoryStore(), log: quiet });
  const g = await source({ did: ME, needsHop: false });
  assert.equal(g.me, ME);
  assert.deepEqual([...g.follows].sort(), ['did:plc:f', 'did:plc:m', 'did:plc:n']);
  assert.deepEqual(g.followers, ['did:plc:m']);
  assert.equal(g.hopFollows.size, 0);
  assert.ok(!g.follows.includes(ME) && !g.followers.includes(ME), 'the account itself is not its own follow');
});

test('needsHop: hopFollows carries each MUTUAL\'s follows from the store (forage\'s hop = the mutuals\' follows)', async () => {
  const source = createPdsGraphSource({ transport: fakeTransport(GRAPH), store: memoryStore(), log: quiet });
  const g = await source({ did: ME, needsHop: true });
  assert.deepEqual([...g.hopFollows.keys()], ['did:plc:m']);
  assert.deepEqual(g.hopFollows.get('did:plc:m'), [ME, 'did:plc:y']);
});

test('an unreachable host leaves what was reachable intact: F stays a follow, hop is what M gave', async () => {
  const t = fakeTransport(GRAPH, { failHosts: new Set(['b.host.bsky.network']) });
  const source = createPdsGraphSource({ transport: t, store: memoryStore(), log: quiet });
  const g = await source({ did: ME, needsHop: true });
  assert.ok(g.follows.includes('did:plc:f'));
  assert.deepEqual(g.followers, ['did:plc:m']);
  assert.deepEqual(g.hopFollows.get('did:plc:m'), [ME, 'did:plc:y']);
});

test('the store warms the next source: a second walk over the same store re-lists nothing that did not move', async () => {
  const store = memoryStore();
  const t1 = fakeTransport(GRAPH);
  await createPdsGraphSource({ transport: t1, store, log: quiet })({ did: ME, needsHop: false });
  const t2 = fakeTransport(GRAPH);
  const g = await createPdsGraphSource({ transport: t2, store, log: quiet })({ did: ME, needsHop: false });
  assert.deepEqual([...g.follows].sort(), ['did:plc:f', 'did:plc:m', 'did:plc:n']);
  assert.equal(t2.calls.filter((c) => c.startsWith('list ')).length, 0, 'revs unchanged → no listing');
});
