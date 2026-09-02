// gif-embeds phase 4 (owner 2026-09-02: "an advanced setting checkbox to show
// or hide alt txt with hide as default").
//
// Default HIDDEN, and no device signal gets a vote — D5: autoplay is a motion
// question a person may already have answered system-wide, but whether a
// caption is printed under a picture is a layout taste with no media query
// behind it. The owner said hide, so absent a choice it is hidden.
//
// D7: this governs a VISIBLE caption only. `<img alt>` is untouched in both
// states — the accessible name is not a preference, and a display toggle that
// stripped alt from the accessibility tree would turn a reading choice into an
// accessibility regression.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, shown, set, clear } from '../js/alt-text.js';

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

test('alt-text: the key, and hidden until asked for', () => {
  assert.equal(KEY, 'forage.alttext');
  withStorage({}, () => assert.equal(shown(), false));
});

test('alt-text: only the literal "on" shows it', () => {
  withStorage({ 'forage.alttext': 'on' }, () => assert.equal(shown(), true));
  withStorage({ 'forage.alttext': 'off' }, () => assert.equal(shown(), false));
  withStorage({ 'forage.alttext': 'banana' }, () => assert.equal(shown(), false,
    'a corrupt value must not switch on a feature the owner defaulted off'));
  withStorage({ 'forage.alttext': 'ON' }, () => assert.equal(shown(), false));
});

test('alt-text: a choice persists and can be forgotten', () => {
  withStorage({}, (store) => {
    set(true); assert.equal(store.get('forage.alttext'), 'on'); assert.equal(shown(), true);
    set(false); assert.equal(store.get('forage.alttext'), 'off'); assert.equal(shown(), false);
    set(true); clear(); assert.equal(shown(), false, 'forgotten: back to hidden');
  });
});

test('alt-text: D5 — no device signal changes it', () => {
  for (const reduce of [true, false]) {
    withReducedMotion(reduce, () => {
      withStorage({}, () => assert.equal(shown(), false));
      withStorage({ 'forage.alttext': 'on' }, () => assert.equal(shown(), true));
    });
  }
});

test('alt-text: no localStorage (private mode, node) → hidden, never throws', () => {
  assert.doesNotThrow(() => shown());
  assert.equal(shown(), false);
  assert.doesNotThrow(() => set(true));
});
