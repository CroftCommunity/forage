// The emblem hero's dismissal — device-local, permanent, and fail-open.
//
// The owner's call is that dismissal NEVER expires, which is only survivable
// because the sticky masthead keeps sign-in on screen for someone who dismissed
// it. That makes the read path the risky half: a hero that vanishes because
// storage threw is a front door nobody can get back, on a device where nothing
// the reader did asked for that. So an unreadable store means SHOWN, the same
// way getSkin() falls back to 'default' rather than to nothing.
//
// The write path is best-effort by design. A ✕ that silently does nothing
// because the browser is in private mode would be worse than one that hides the
// hero for this visit and forgets — so persistence is what this module owns,
// and removing the node is the view's job. That split is why there is no
// module-level flag here to reset between tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HERO_KEY, heroDismissed, dismissHero } from '../js/hero.js';

function withStorage(impl, fn) {
  const saved = globalThis.localStorage;
  globalThis.localStorage = impl;
  try { return fn(); } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
}

const map = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    calls: [],
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { this.calls.push(['set', k, v]); m.set(k, String(v)); },
    removeItem(k) { this.calls.push(['remove', k]); m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
};

test('a first-time visitor sees the hero', () => {
  withStorage(map(), () => assert.equal(heroDismissed(), false));
});

test('dismissing it persists, and the next visit does not see it', () => {
  const store = map();
  withStorage(store, () => {
    dismissHero();
    assert.equal(heroDismissed(), true);
  });
  // Same device, fresh page: the module is not holding this in memory.
  withStorage(map(store.dump()), () => assert.equal(heroDismissed(), true));
});

test('dismissal never expires — there is no timestamp to age out', () => {
  const store = map();
  withStorage(store, () => dismissHero());
  const written = store.calls.filter((c) => c[0] === 'set');
  assert.equal(written.length, 1, `one write: ${JSON.stringify(written)}`);
  assert.doesNotMatch(String(written[0][2]), /\d{4}|\d{10}/,
    `the stored value carries no date or epoch — an expiry is a thing that can be got wrong later: ${written[0][2]}`);
});

test('unreadable storage means SHOWN — fail open, never a lost front door', () => {
  withStorage({ getItem() { throw new Error('blocked'); }, setItem() {}, removeItem() {} },
    () => assert.equal(heroDismissed(), false));
  // and with no storage object at all (node, hardened browser)
  withStorage(undefined, () => assert.equal(heroDismissed(), false));
});

test('garbage in the key means SHOWN, not dismissed', () => {
  withStorage(map({ [HERO_KEY]: 'maybe' }), () => assert.equal(heroDismissed(), false));
});

test('unwritable storage does not throw — the ✕ still works, it just forgets', () => {
  withStorage({ getItem() { return null; }, setItem() { throw new Error('quota'); }, removeItem() {} },
    () => assert.doesNotThrow(() => dismissHero()));
});

test('dismissal is device-local and never touches forage.state', () => {
  assert.notEqual(HERO_KEY, 'forage.state');
  const store = map({ 'forage.state': '{"version":2,"events":[]}' });
  withStorage(store, () => dismissHero());
  assert.deepEqual(store.calls.map((c) => c[1]).filter((k) => k !== HERO_KEY), [],
    'the Bluesky population writes nothing to the event log; test/store-modes.test.js is the teeth on that and this is the lens');
  assert.equal(store.dump()['forage.state'], '{"version":2,"events":[]}');
});
