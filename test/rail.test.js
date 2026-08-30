// board-cards decision 6: the right rail is optional — on by default, usable
// but less prominent; off, the content column stays 680 and centres. One
// device-local key; anything but the word 'off' is on (a corrupt value must
// never lose the reader their rail).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, enabled, set, clear, apply } from '../js/rail.js';

const withStore = (fn) => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  try { return fn(map); } finally { delete globalThis.localStorage; }
};

test('6: on by default; only the word off turns it off', () => {
  withStore((map) => {
    assert.equal(KEY, 'forage.rail');
    assert.equal(enabled(), true);
    set(false); assert.equal(map.get('forage.rail'), 'off'); assert.equal(enabled(), false);
    set(true); assert.equal(map.get('forage.rail'), 'on'); assert.equal(enabled(), true);
    for (const junk of ['', 'no', 'false', '0', 'OFF ']) { map.set('forage.rail', junk); assert.equal(enabled(), true, JSON.stringify(junk)); }
    clear(); assert.equal(map.has('forage.rail'), false);
  });
});

test('6: apply writes the state onto the shell, so the stylesheet decides the tracks', () => {
  withStore(() => {
    const shell = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    globalThis.document = { querySelector: (sel) => (sel === '.shell' ? shell : null) };
    try {
      apply(); assert.equal(shell.attrs['data-rail'], 'on');
      set(false); apply(); assert.equal(shell.attrs['data-rail'], 'off');
    } finally { delete globalThis.document; }
  });
});

test('6: a storage that throws still yields a rail', () => {
  const boom = () => { throw new Error('denied'); };
  globalThis.localStorage = { getItem: boom, setItem: boom, removeItem: boom };
  try { assert.equal(enabled(), true); assert.doesNotThrow(() => set(false)); assert.doesNotThrow(() => clear()); }
  finally { delete globalThis.localStorage; }
});
