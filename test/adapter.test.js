// 3a: the capability -> substrate seam (BSM invariant 4). The routing table
// is the tier dial; substrates/memory.js is the ONLY module allowed to call
// store.commit; unknown capabilities fail loud naming themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routing, substrateFor, CAPABILITIES } from '../js/config/routing.js';

const ALL = ['posting', 'commenting', 'voting', 'saving', 'fields', 'moderation',
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

test('an unknown substrate value throws with words (guards a routing typo)', () => {
  // the table override is the seam the phase-4 harness uses to pit substrates
  assert.throws(() => substrateFor('posting', { posting: 'memroy' }), /memroy/);
});
