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

// ---- feed-index Phase 4 (plan 2026-09-08): the rail as PANELS ----
// The word grows into an ordered list of panel ids; the shell still reads
// on|off; the legacy words keep their meaning; a corrupt value still yields
// the rail. Popular jumpstarts is first by default (owner, 2026-09-04) —
// POPULAR, never trending (D6: 52 packs in 145k had any weekly joins).
import { PANELS, DEFAULT_PANELS, panels, setPanels, has, shellWord } from '../js/rail.js';

test('P4: the panel vocabulary and the default order — the door, then jumpstarts, then trending', () => {
  withStore(() => {
    assert.deepEqual(PANELS.map((p) => p.id), ['signin', 'jumpstarts', 'trending']);
    assert.deepEqual(DEFAULT_PANELS, ['signin', 'jumpstarts', 'trending']);
    assert.deepEqual(panels(), DEFAULT_PANELS);
    assert.equal(enabled(), true);
  });
});

test('P4: the legacy words still mean what they meant — off is off, on is the default order', () => {
  withStore((map) => {
    map.set(KEY, 'off'); assert.equal(enabled(), false); assert.deepEqual(panels(), []);
    map.set(KEY, 'on'); assert.equal(enabled(), true); assert.deepEqual(panels(), DEFAULT_PANELS);
  });
});

test('P4: setPanels stores an ordered list; unknown ids are dropped; an empty list is off', () => {
  withStore(() => {
    setPanels(['trending', 'jumpstarts']); assert.deepEqual(panels(), ['trending', 'jumpstarts']); assert.equal(enabled(), true);
    setPanels(['trending', 'bogus']); assert.deepEqual(panels(), ['trending']);
    setPanels([]); assert.equal(enabled(), false); assert.deepEqual(panels(), []);
  });
});

test('P4: set(true|false) keeps working — off empties, on restores the default order', () => {
  withStore(() => {
    set(false); assert.equal(enabled(), false);
    set(true); assert.deepEqual(panels(), DEFAULT_PANELS);
  });
});

test('P4: a corrupt stored value reads as the default — never an empty rail by accident', () => {
  withStore((map) => {
    map.set(KEY, '{nonsense'); assert.equal(enabled(), true); assert.deepEqual(panels(), DEFAULT_PANELS);
    map.set(KEY, JSON.stringify({ panels: 'trending' })); assert.deepEqual(panels(), DEFAULT_PANELS);
  });
});

test('P4: has(id) answers for the views; the word written on the shell is on|off, unchanged', () => {
  withStore(() => {
    setPanels(['trending']); assert.equal(has('trending'), true); assert.equal(has('jumpstarts'), false); assert.equal(shellWord(), 'on');
    set(false); assert.equal(shellWord(), 'off');
  });
});
