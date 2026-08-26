// 3a: the capability -> substrate seam (BSM invariant 4). The routing table
// is the tier dial; substrates/memory.js is the ONLY module allowed to call
// store.commit; unknown capabilities fail loud naming themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routing, substrateFor, CAPABILITIES } from '../js/config/routing.js';

const ALL = ['posting', 'commenting', 'voting', 'saving', 'feeds', 'moderation',
  'reporting', 'notifications', 'accounts', 'prefs'];

test('the routing table covers exactly the ten capabilities, all on memory', () => {
  assert.deepStrictEqual(Object.keys(routing).sort(), [...ALL].sort());
  for (const cap of ALL) assert.equal(routing[cap], 'memory', cap);
  assert.deepStrictEqual([...CAPABILITIES].sort(), [...ALL].sort());
});

test('dispatch through the routing table reaches the memory substrate and the store', async () => {
  const store = await import('../js/store.js');
  store.loadEvents([]);
  const sub = substrateFor('accounts');
  const ev = sub.write('account.registered', { handle: 'alice' }, { actor: 'u_a', ts: 1000 });
  assert.equal(ev.type, 'account.registered');
  assert.equal(store.getState().users.u_a.handle, 'alice'); // the write is REAL
});

test('an unknown capability throws, naming it and the known keys', () => {
  assert.throws(() => substrateFor('telepathy'), (e) => {
    assert.match(e.message, /telepathy/);
    assert.match(e.message, /posting/); // the known keys are in the words
    return true;
  });
});

test('3b wiring: a real action travels UI-entry -> actions -> adapter -> memory -> store', async () => {
  const store = await import('../js/store.js');
  const actions = await import('../js/actions.js');
  const { buildSeed } = await import('../data/seed.js');
  store.loadEvents(buildSeed());
  store.setPersona('u_fern');
  const before = store.getEvents().length;
  const ev = await actions.createPost({ feedId: Object.values(store.getState().feeds)[0].id,
    format: 'text', title: 'Adapter wiring proof', bodyMd: 'x' });
  assert.equal(store.getEvents().length, before + 1);
  assert.equal(store.getState().posts[ev.payload.id].title, 'Adapter wiring proof');
  // Fail-Next rejects through the same path and commits nothing
  store.setDev({ failNext: true });
  await assert.rejects(
    () => actions.setVote('post', ev.payload.id, 1), /Simulated failure/);
  assert.equal(store.getEvents().length, before + 1);
});

test('an unknown substrate value throws with words (guards a routing typo)', () => {
  // the table override is the seam the phase-4 harness uses to pit substrates
  assert.throws(() => substrateFor('posting', { posting: 'memroy' }), /memroy/);
});
