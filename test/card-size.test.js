// board-cards decision 7: the card size — four notches, 1 (small) to 4 (as
// drawn), default 4 — replaces the 3t drag slider, which on a phone moved in
// visible jumps and felt broken. One setting scales the stage cap, the card
// padding and the title: the reader chooses how much room a post takes.
// Device-local like the skin; it never reaches the Bluesky account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_SIZE, KEY, stored, active, set, clear, apply } from '../js/card-size.js';

const withStore = (fn) => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  try { return fn(map); } finally { delete globalThis.localStorage; }
};

test('7: four notches, and the default is the biggest — as drawn (O4)', () => {
  assert.deepEqual(CARD_SIZE, { min: 1, max: 4, default: 4 });
  assert.equal(KEY, 'forage.cardsize');
});

test('7: nothing stored reads as the default', () => {
  withStore(() => {
    assert.equal(stored(), null);
    assert.equal(active(), 4);
  });
});

test('7: a choice persists and reads back; clearing forgets it', () => {
  withStore((map) => {
    set(2);
    assert.equal(map.get('forage.cardsize'), '2');
    assert.equal(stored(), 2);
    assert.equal(active(), 2);
    clear();
    assert.equal(stored(), null);
    assert.equal(active(), 4);
  });
});

test('7: a stored value outside 1–4 reads as 4 and is warned about ONCE, with the raw value', () => {
  withStore((map) => {
    const warned = [];
    const orig = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    try {
      for (const junk of ['', '0', '5', '2.5', 'big', 'NaN']) {
        map.set('forage.cardsize', junk);
        assert.equal(active(), 4, `${JSON.stringify(junk)} is not a notch`);
      }
    } finally { console.warn = orig; }
    // '' is absence, not garbage; the other five are garbage, each said once
    assert.equal(warned.length, 5, `one warning per bad value: ${JSON.stringify(warned)}`);
    assert.ok(warned.every((w) => /forage: card size/.test(w)), 'the line is prefixed');
    assert.ok(warned.some((w) => w.includes('"big"')), 'it names the raw value');
  });
});

test('7: set refuses anything that is not a notch', () => {
  withStore(() => {
    for (const bad of [0, 5, 2.5, 'x', NaN, null]) assert.throws(() => set(bad), /card size/i, `refuses ${bad}`);
  });
});

test('7: apply writes the notch onto the root element, so the stylesheet owns the numbers', () => {
  withStore(() => {
    const root = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    globalThis.document = { documentElement: root };
    try {
      set(3); apply();
      assert.equal(root.attrs['data-cardsize'], '3');
      clear(); apply();
      assert.equal(root.attrs['data-cardsize'], '4', 'the default is applied explicitly, never left unset');
    } finally { delete globalThis.document; }
  });
});

test('7: a storage that throws (private mode) still yields a working board', () => {
  const boom = () => { throw new Error('denied'); };
  globalThis.localStorage = { getItem: boom, setItem: boom, removeItem: boom };
  try {
    assert.equal(active(), 4);
    assert.doesNotThrow(() => set(2));
    assert.doesNotThrow(() => clear());
  } finally { delete globalThis.localStorage; }
});
