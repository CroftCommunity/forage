// 1b: mode lifecycle — the memory tier is untouchable, network modes are
// RAM-only (plan 2026-08-25-1). THE core invariant: `forage.state` is never
// written outside memory mode (structural suspension, not best-effort), and
// exiting a network mode restores the memory dataset byte- and fold-identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage so the storage adapter runs headless
// (same fake as test/store.test.js).
const bag = new Map();
globalThis.localStorage = {
  getItem: (k) => (bag.has(k) ? bag.get(k) : null),
  setItem: (k, v) => bag.set(k, String(v)),
  removeItem: (k) => bag.delete(k),
};

const store = await import('../js/store.js');
const { registerSubstrate } = await import('../js/config/routing.js');
const { buildSeed } = await import('../data/seed.js');

const KEY = 'forage.state';
const rawKey = () => globalThis.localStorage.getItem(KEY);

function seedMemory() {
  store.loadEvents(buildSeed());
  store.setPersona('u_fern');
}

test('the core invariant: enter → RAM dispatch → exit leaves forage.state byte-identical and the fold restored', () => {
  seedMemory();
  const before = rawKey();
  assert.ok(before, 'seed persisted');
  const eventsBefore = store.getEvents().length;
  const stateBefore = JSON.stringify(store.getState());

  store.enterMode('bbs');
  assert.equal(rawKey(), before, 'key untouched at enter');
  assert.equal(store.getEvents().length, 0, 'network mode starts with an empty RAM dataset');

  // a network-mode dispatch lands in RAM (the phase-5 substrate shape)…
  store.commit('account.registered', { handle: 'camper' }, { actor: 'u_x', ts: 1000 });
  assert.equal(store.getState().users.u_x.handle, 'camper', 'dispatch visible via the fold');
  // …and the key is still byte-identical
  assert.equal(rawKey(), before, 'key untouched after a network-mode dispatch');

  store.exitMode();
  assert.equal(rawKey(), before, 'key untouched at exit');
  assert.equal(store.getEvents().length, eventsBefore, 'memory log restored');
  assert.equal(JSON.stringify(store.getState()), stateBefore, 'memory fold deep-equal');
  assert.equal(store.getState().users.u_x, undefined, 'no network-mode residue');
});

test('persist-bearing calls during a network mode are structural no-ops on the key', () => {
  seedMemory();
  const before = rawKey();
  store.enterMode('bbs');
  store.setDev({ latency: 5 });           // persist() path
  store.setPersona('u_moss');             // persist() path
  assert.equal(rawKey(), before, 'setDev/setPersona wrote nothing');
  store.exitMode();
  store.setDev({ latency: 0 });
});

test('reset() during a network mode clears RAM only — the memory key survives', () => {
  seedMemory();
  const before = rawKey();
  store.enterMode('bbs');
  store.commit('account.registered', { handle: 'gone' }, { actor: 'u_y', ts: 1 });
  store.reset();
  assert.equal(store.getEvents().length, 0, 'RAM cleared');
  assert.equal(rawKey(), before, 'memory key NOT cleared');
  store.exitMode();
  assert.equal(store.getEvents().length > 0, true, 'memory restored after reset-in-mode');
});

test('exit without enter, enter twice, and enter("memory") all refuse with words', () => {
  assert.throws(() => store.exitMode(), /no network mode/i);
  seedMemory();
  store.enterMode('bbs');
  assert.throws(() => store.enterMode('bbs'), /already/i);
  store.exitMode();
  assert.throws(() => store.enterMode('memory'), (e) => {
    assert.match(e.message, /memory/);
    assert.match(e.message, /exitMode/i);
    return true;
  });
  assert.throws(() => store.enterMode('warp'), /warp/);
});

test('the empty-storage boundary: enter/exit with NO saved key lands in an EMPTY memory state (no RAM leak)', () => {
  store.reset(); // memory mode: clears the key too
  assert.equal(rawKey(), null);
  store.enterMode('bbs');
  store.commit('account.registered', { handle: 'leaky' }, { actor: 'u_l', ts: 1 });
  store.exitMode();
  assert.equal(store.getEvents().length, 0, 'bbs RAM data must not survive into memory');
  assert.equal(store.getState().users.u_l, undefined);
});

test('mode transitions announce themselves on the console', () => {
  const infos = [];
  const orig = console.info;
  console.info = (...a) => infos.push(a.join(' '));
  try {
    seedMemory();
    store.enterMode('bbs');
    store.exitMode();
  } finally {
    console.info = orig;
  }
  assert.ok(infos.some((m) => m.includes('bbs') && m.includes('suspended')), 'enter announced with the suspension');
  assert.ok(infos.some((m) => m.includes('memory')), 'exit announced');
});

test('1b wiring: a REAL action in a network mode lands in RAM via the registered substrate; the key never moves', async () => {
  const actions = await import('../js/actions.js');
  seedMemory();
  const before = rawKey();
  // the phase-5 substrate shape: a network substrate commits into the RAM fold
  registerSubstrate('bbs', { write: (t, p, o) => store.commit(t, p, o) });

  store.enterMode('bbs');
  // RAM dataset is empty — give the entry point something to post into
  store.loadEvents(buildSeed());
  store.setPersona('u_fern');
  const anyField = Object.keys(store.getState().fields)[0];
  await actions.createPost({ fieldId: anyField, format: 'text', title: 'camp post', bodyMd: 'x' });
  assert.equal(Object.values(store.getState().posts).some((p) => p.title === 'camp post'), true,
    'the post is visible via selectors in RAM');
  assert.equal(rawKey(), before, 'forage.state byte-identical through the whole journey');

  store.exitMode();
  assert.equal(Object.values(store.getState().posts).some((p) => p.title === 'camp post'), false,
    'the camp post did not follow us home');
  assert.equal(rawKey(), before);
});
