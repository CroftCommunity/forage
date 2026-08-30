// board-cards decision 5: "pictures shown at once" — 1 to 4, default 1. Up to
// that many stand in a grid; more fold into a carousel; 4 is never a carousel
// (Bluesky caps a post at four). Device-local; a corrupt value reads as 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PICTURES, KEY, NOTCHES, stored, active, set, clear, layoutFor } from '../js/pictures.js';

const withStore = (fn) => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  try { return fn(map); } finally { delete globalThis.localStorage; }
};

test('5: four notches, default 1 (one picture, a carousel for the rest)', () => {
  assert.deepEqual(PICTURES, { min: 1, max: 4, default: 1 });
  assert.deepEqual(NOTCHES, [1, 2, 3, 4]);
  assert.equal(KEY, 'forage.pictures');
});

test('5: nothing stored is the default; a choice persists; clearing forgets', () => {
  withStore((map) => {
    assert.equal(stored(), null); assert.equal(active(), 1);
    set(3); assert.equal(map.get('forage.pictures'), '3'); assert.equal(active(), 3);
    clear(); assert.equal(active(), 1);
  });
});

test('5: garbage reads as the default, warned once per raw value', () => {
  withStore((map) => {
    const warned = [];
    const orig = console.warn; console.warn = (...a) => warned.push(a.join(' '));
    try {
      for (const junk of ['0', '9', 'many', '1.5']) { map.set('forage.pictures', junk); assert.equal(active(), 1, junk); }
      map.set('forage.pictures', '9'); active(); // the same value again says nothing
    } finally { console.warn = orig; }
    assert.equal(warned.length, 4);
    assert.ok(warned.every((w) => /forage: pictures/.test(w)));
  });
});

test('5: set refuses a non-notch', () => {
  withStore(() => { for (const bad of [0, 5, 'x', NaN]) assert.throws(() => set(bad), /pictures/i); });
});

// The layout rule, as a pure function the views call: exactly N shown for a
// count ≤ N (never a one-slide carousel), a carousel above it.
test('5: layoutFor — one picture is a stage; up to the setting is a grid; more is a carousel', () => {
  assert.equal(layoutFor(1, 1), 'stage');
  assert.equal(layoutFor(1, 4), 'stage', 'one picture is never a grid of one');
  assert.equal(layoutFor(2, 1), 'carousel');
  assert.equal(layoutFor(2, 2), 'grid');
  assert.equal(layoutFor(3, 2), 'carousel');
  assert.equal(layoutFor(4, 4), 'grid', '4 is never a carousel');
  assert.equal(layoutFor(4, 3), 'carousel');
});
