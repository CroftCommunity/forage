// 1a: named mode tables + substrate registration (plan 2026-08-25-1, phase 1).
// A MODE is a named routing table over the same ten capabilities; the active
// mode is what substrateFor consults when no explicit table is passed (the
// conformance harness keeps its explicit-table override). Network substrates
// register at runtime; refusals come with words (invariant: self-diagnosing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  routing, substrateFor, CAPABILITIES,
  MODES, setMode, currentMode, registerSubstrate,
} from '../js/config/routing.js';

test('MODES holds exactly memory and bbs, each a full table over the capabilities', () => {
  assert.deepStrictEqual(Object.keys(MODES).sort(), ['bbs', 'memory']);
  for (const [name, table] of Object.entries(MODES)) {
    assert.deepStrictEqual(Object.keys(table).sort(), [...CAPABILITIES].sort(), name);
  }
  // memory mode IS today's routing table; bbs flips ALL wire capabilities at
  // once (imported decision 2026-08-24: no partial tier).
  assert.deepStrictEqual(MODES.memory, routing);
  for (const cap of CAPABILITIES) assert.equal(MODES.bbs[cap], 'bbs', cap);
});

test('the mode starts at memory and setMode switches it', () => {
  assert.equal(currentMode(), 'memory');
  setMode('bbs');
  assert.equal(currentMode(), 'bbs');
  setMode('memory');
  assert.equal(currentMode(), 'memory');
});

test('an unknown mode refuses with words naming it and the known modes', () => {
  assert.throws(() => setMode('teleport'), (e) => {
    assert.match(e.message, /teleport/);
    assert.match(e.message, /memory/);
    assert.match(e.message, /bbs/);
    return true;
  });
  assert.equal(currentMode(), 'memory'); // a refused switch changes nothing
});

test('bbs mode without a registered bbs substrate refuses with words at resolve time', () => {
  setMode('bbs');
  try {
    assert.throws(() => substrateFor('posting'), (e) => {
      assert.match(e.message, /bbs/);
      assert.match(e.message, /memory/); // the known substrates are in the words
      return true;
    });
  } finally {
    setMode('memory');
  }
});

test('an explicit table override still wins over the active mode (conformance seam)', () => {
  setMode('bbs');
  try {
    const sub = substrateFor('posting', { posting: 'memory' });
    assert.equal(typeof sub.write, 'function');
  } finally {
    setMode('memory');
  }
});

test('registerSubstrate refuses a name collision and a write-less module, with words', () => {
  assert.throws(() => registerSubstrate('memory', { write: () => {} }), /memory/);
  assert.throws(() => registerSubstrate('shiny', {}), (e) => {
    assert.match(e.message, /shiny/);
    assert.match(e.message, /write/);
    return true;
  });
});

test('1a wiring: with a registered bbs substrate and mode=bbs, a REAL action diverts to it and the memory store is untouched', async () => {
  const store = await import('../js/store.js');
  const actions = await import('../js/actions.js');
  const { buildSeed } = await import('../data/seed.js');
  store.loadEvents(buildSeed());
  store.setPersona('u_fern');

  const calls = [];
  registerSubstrate('bbs', {
    write(type, payload, opts) {
      calls.push({ type, payload, opts });
      return { type, payload };
    },
  });

  const before = store.getEvents().length;
  setMode('bbs');
  try {
    const anyFeed = Object.keys(store.getState().feeds)[0];
    await actions.createPost({ feedId: anyFeed, format: 'text', title: 'diverted', bodyMd: 'x' });
  } finally {
    setMode('memory');
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'post.created');
  assert.equal(calls[0].payload.title, 'diverted');
  // the entry point's write went to the stub, NOT the memory fold
  assert.equal(store.getEvents().length, before);
  assert.equal(Object.values(store.getState().posts).some((p) => p.title === 'diverted'), false);
});
