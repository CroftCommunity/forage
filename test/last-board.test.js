// The last board you were reading, as ONE device-local preference.
//
// This exists because the landing rule needs it: a returning reader lands on
// the board they left, which is only meaningful if the choice outlives the tab.
// Modelled on js/board-density.js — one key, read through one module, never
// `forage.state` (that belongs to the memory population and this is neither
// population's data, it is the device's).
//
// A board id is OPEN-ENDED on purpose: a ring rung ('mut'), a feed slug
// ('whats-hot') and a hashtag ('tag-harvest') are all boards, which is the
// whole point of the taxonomy in plan 2026-08-26-4. So this cannot validate
// against a fixed list the way density can, and the contract is narrower for
// it: store a non-empty string, return it, and refuse anything else rather
// than writing a value that would later resolve to nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAST_BOARD_KEY, lastBoard, setLastBoard, onChange } from '../js/last-board.js';

const withStorage = (seed, fn) => {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try { return fn(store); }
  finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
};

test('the key is namespaced to the app, like every other device preference', () => {
  assert.match(LAST_BOARD_KEY, /^forage\./);
});

test('no remembered board reads as null rather than throwing, with or without storage', () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;                       // node, private mode, blocked storage
  try {
    assert.equal(lastBoard(), null, 'no storage is not an error, it is no memory');
    setLastBoard('mut');                                // must not throw
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
  withStorage({}, () => assert.equal(lastBoard(), null, 'empty storage is also no memory'));
});

test('a board written by a previous session is read back — this is what "returning" means', () => {
  // Seeded directly, with no set() call in this session: the reload case.
  withStorage({ [LAST_BOARD_KEY]: 'whats-hot' }, () => {
    assert.equal(lastBoard(), 'whats-hot');
  });
});

test('setting round-trips, notifies, and reads THROUGH storage rather than caching', () => {
  withStorage({}, (store) => {
    const seen = [];
    const off = onChange((v) => seen.push(v));
    try {
      setLastBoard('mut');
      assert.equal(lastBoard(), 'mut');
      assert.deepEqual(seen, ['mut'], 'a listener hears the change');
      // Another tab writes; this one must see it on the next read.
      store[LAST_BOARD_KEY] = 'tag-harvest';
      assert.equal(lastBoard(), 'tag-harvest', 'reads storage, not a module variable');
    } finally { off(); }
  });
});

test('any board id is storable — a rung, a feed slug, a hashtag are all boards', () => {
  for (const id of ['me', 'mut', 'fol', 'hop', 'world', 'whats-hot', 'tag-harvest']) {
    withStorage({}, () => {
      setLastBoard(id);
      assert.equal(lastBoard(), id, `${id} round-trips`);
    });
  }
});

test('junk is refused rather than written, and never clobbers a good value', () => {
  withStorage({ [LAST_BOARD_KEY]: 'mut' }, () => {
    for (const junk of ['', '   ', null, undefined, 42, {}, []]) {
      setLastBoard(junk);
      assert.equal(lastBoard(), 'mut', `${JSON.stringify(junk)} left the remembered board alone`);
    }
  });
});

// ---- V5: the landing rule ----
//
// Where `/` goes, as one pure function, because the interesting part is the
// THREE cases and not the storage. Owner's rule (plan 2026-08-26-4, Revision
// 2): a guest gets the directory; a returning reader gets the board they left;
// a brand-new account gets My follows.
import { landingBoard, DIRECTORY } from '../js/last-board.js';

test('a guest lands on the directory — they have no history worth remembering', () => {
  assert.equal(landingBoard({ signedIn: false, stored: null }), DIRECTORY);
  assert.equal(landingBoard({ signedIn: false, stored: 'mut' }), DIRECTORY,
    'even with a board remembered from a previous session: signed out, rungs do not resolve');
});

test('a returning reader lands on the board they left', () => {
  assert.equal(landingBoard({ signedIn: true, stored: 'mut' }), 'mut');
  assert.equal(landingBoard({ signedIn: true, stored: 'whats-hot' }), 'whats-hot',
    'a feed is a board too — the whole point of the taxonomy');
  assert.equal(landingBoard({ signedIn: true, stored: 'tag-harvest' }), 'tag-harvest');
});

test('a first sign-in lands on My follows, since there is no board to return to', () => {
  assert.equal(landingBoard({ signedIn: true, stored: null }), 'fol');
});

test('the directory is a named destination, not an empty string masquerading as one', () => {
  assert.equal(typeof DIRECTORY, 'string');
  assert.ok(DIRECTORY.length > 0);
});
