// The media-posters register (plan 2026-09-14-plan-clips, Phase 1, § B bound 2):
// who has answered a reel with a frame before, per mode, on this device — so
// the next cold wave asks known posters first. Device-local, a hint only:
// nothing here decides who is IN a scope, only who is asked first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, known, remember, clear } from '../js/media-posters.js';

function withStorage(seed = {}, fn) {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try { return fn(store); } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
}

test('the key, and nothing known on a fresh device', () => {
  assert.equal(KEY, 'forage.media-posters');
  withStorage({}, () => { assert.deepEqual([...known('clip')], []); assert.deepEqual([...known('gram')], []); });
});

test('remembering posters per mode; the other mode is untouched; a second remember adds', () => {
  withStorage({}, (store) => {
    remember('clip', ['did:plc:a', 'did:plc:b']);
    remember('clip', ['did:plc:b', 'did:plc:c']);
    remember('gram', ['did:plc:z']);
    assert.deepEqual([...known('clip')].sort(), ['did:plc:a', 'did:plc:b', 'did:plc:c']);
    assert.deepEqual([...known('gram')], ['did:plc:z']);
    assert.ok(store[KEY].includes('did:plc:a'));
  });
});

test('a corrupt store reads as nothing known, and the next remember heals it', () => {
  withStorage({ [KEY]: '{not json' }, () => {
    assert.deepEqual([...known('clip')], []);
    remember('clip', ['did:plc:a']);
    assert.deepEqual([...known('clip')], ['did:plc:a']);
  });
});

test('the register is bounded: the newest 500 per mode survive', () => {
  withStorage({}, () => {
    remember('clip', Array.from({ length: 600 }, (_, i) => `did:plc:n${i}`));
    assert.equal(known('clip').size, 500);
    assert.ok(known('clip').has('did:plc:n599'));
    assert.ok(!known('clip').has('did:plc:n0'));
  });
});

test('an unknown mode refuses by name; clear forgets', () => {
  withStorage({}, () => {
    assert.throws(() => remember('shorts', ['x']), /shorts/);
    remember('clip', ['did:plc:a']);
    clear();
    assert.deepEqual([...known('clip')], []);
  });
});
