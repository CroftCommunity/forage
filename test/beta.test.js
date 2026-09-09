import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BETA_PDSWALKER_KEY, pdsWalker, setPdsWalker, onChange } from '../js/beta.js';

// Beta features (plan 2026-09-08-plan-beta-pds-walker, P2): device-local switches, read
// through every time like every other preference module (ring-scope, board-density).
function withStorage(seed = {}, fn) {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  try { return fn(store); } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
}

test('pds-walker rings are OFF by default — a beta is opt-in', () => {
  withStorage({}, () => { assert.equal(pdsWalker(), false); });
});

test('on/off round-trips through its own key, and notifies with the new state', () => {
  withStorage({}, (store) => {
    const seen = [];
    const off = onChange((s) => seen.push(s));
    setPdsWalker(true);
    assert.equal(pdsWalker(), true);
    assert.equal(store[BETA_PDSWALKER_KEY], '1');
    setPdsWalker(false);
    assert.equal(pdsWalker(), false);
    assert.equal(store[BETA_PDSWALKER_KEY], '0');
    assert.deepEqual(seen, [{ pdsWalker: true }, { pdsWalker: false }]);
    off();
    setPdsWalker(true);
    assert.equal(seen.length, 2, 'an unsubscribed listener is not called');
  });
});

test('only the literal "1" means on; anything else (or a throwing storage) is off', () => {
  withStorage({ [BETA_PDSWALKER_KEY]: 'true' }, () => { assert.equal(pdsWalker(), false); });
  withStorage({ [BETA_PDSWALKER_KEY]: '1' }, () => { assert.equal(pdsWalker(), true); });
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => { throw new Error('private mode'); }, setItem: () => { throw new Error('private mode'); } };
  try {
    assert.equal(pdsWalker(), false);
    assert.doesNotThrow(() => setPdsWalker(true));
  } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
});
