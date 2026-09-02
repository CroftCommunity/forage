// gif-embeds phase 3 (owner 2026-09-02: "there should be a setting in use
// rproifle to play gifs by default or not").
//
// DESIGN.md § Foundations: defaults come from the DEVICE, choices come from the
// PERSON. A reader who has set `prefers-reduced-motion: reduce` system-wide has
// already answered "should things move on their own", so absent a choice that
// answer is taken. An explicit choice then beats it in BOTH directions — and is
// stored as a value, never as a removed key, or it reads as "never chose" and
// undoes itself under the device default on the next load.
//
// This is deliberately NOT js/haptics.js's rule, where reduced-motion wins even
// over the switch (O3). A buzz is involuntary and has no control at the moment
// it fires; a GIF has a visible play button on every card, so a reader who
// turns autoplay on has said so twice and can stop any one of them by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, stored, enabled, deviceDefault, set, clear } from '../js/gif-autoplay.js';

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
  globalThis.matchMedia = (q) => ({ matches: matches && /prefers-reduced-motion/.test(q) });
  try { return fn(); } finally { if (prev === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = prev; }
}

test('gif-autoplay: the key, and nothing stored is not a choice', () => {
  assert.equal(KEY, 'forage.gifautoplay');
  withStorage({}, () => assert.equal(stored(), null));
});

test('gif-autoplay: absent → the device answers', () => {
  withReducedMotion(false, () => withStorage({}, () => {
    assert.equal(deviceDefault(), true);
    assert.equal(enabled(), true, 'no stated preference for less motion: GIFs play');
  }));
  withReducedMotion(true, () => withStorage({}, () => {
    assert.equal(deviceDefault(), false);
    assert.equal(enabled(), false, 'reduce: they wait for a press');
  }));
});

test('gif-autoplay: an explicit choice beats the device BOTH ways', () => {
  withReducedMotion(true, () => withStorage({ 'forage.gifautoplay': 'on' }, () => {
    assert.equal(enabled(), true, 'reduce + an explicit on: the person wins');
  }));
  withReducedMotion(false, () => withStorage({ 'forage.gifautoplay': 'off' }, () => {
    assert.equal(enabled(), false);
  }));
});

test('gif-autoplay: D6 — "on" is WRITTEN, never left as an absent key', () => {
  withReducedMotion(true, () => withStorage({}, (store) => {
    set(true);
    assert.equal(store.get('forage.gifautoplay'), 'on',
      'a reader with reduced motion who turns autoplay on must keep it across a reload');
    assert.equal(enabled(), true);
    set(false);
    assert.equal(store.get('forage.gifautoplay'), 'off');
    clear();
    assert.equal(stored(), null);
    assert.equal(enabled(), false, 'forgotten: back to the device');
  }));
});

test('gif-autoplay: a corrupt value is not a choice — the device answers again', () => {
  withReducedMotion(false, () => withStorage({ 'forage.gifautoplay': 'banana' }, () => {
    assert.equal(stored(), null);
    assert.equal(enabled(), true);
  }));
  withReducedMotion(true, () => withStorage({ 'forage.gifautoplay': '' }, () => {
    assert.equal(enabled(), false);
  }));
});

test('gif-autoplay: no localStorage and no matchMedia (private mode, node) → plays, never throws', () => {
  assert.doesNotThrow(() => enabled());
  assert.equal(enabled(), true);
  assert.doesNotThrow(() => set(true));
});
