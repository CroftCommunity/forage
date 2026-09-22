// Should a clip start on its own in Clip mode? (plan 2026-09-14-plan-clips,
// D3.) Its own key — the GIF setting is about GIFs on rows. Same rule as
// js/gif-autoplay.js: the device answers (reduced motion → no) until a person
// does, and a stated choice wins in both directions. Muted, in view only, and
// never a labeled clip — those rules live in the reel, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, stored, enabled, deviceDefault, set, clear } from '../js/clip-autoplay.js';

function withStorage(values, fn) {
  const store = new Map(Object.entries(values));
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  try { return fn(store); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; }
}
function withReducedMotion(matches, fn) {
  const prev = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q.includes('reduce') ? matches : false });
  try { return fn(); } finally { if (prev === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = prev; }
}

test('its own key; nothing stored reads as no choice', () => {
  assert.equal(KEY, 'forage.clipautoplay');
  withStorage({}, () => assert.equal(stored(), null));
  withStorage({ [KEY]: 'maybe' }, () => assert.equal(stored(), null));
});

test('with no choice the device decides: play unless it asked for less motion', () => {
  withStorage({}, () => {
    withReducedMotion(false, () => { assert.equal(deviceDefault(), true); assert.equal(enabled(), true); });
    withReducedMotion(true, () => { assert.equal(deviceDefault(), false); assert.equal(enabled(), false); });
  });
});

test('a stated choice wins in both directions and is written', () => {
  withStorage({}, (store) => {
    withReducedMotion(true, () => { set(true); assert.equal(store.get(KEY), 'on'); assert.equal(enabled(), true); });
    withReducedMotion(false, () => { set(false); assert.equal(store.get(KEY), 'off'); assert.equal(enabled(), false); });
    clear();
    assert.equal(stored(), null);
  });
});
