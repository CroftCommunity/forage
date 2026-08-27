// Board density is ONE preference read through ONE module.
//
// The dial shipped reading `forage.boardview`, but only js/ui/lens-views.js
// honoured it — js/ui/views.js never passed `compact` to postRow, so a sandbox
// board stayed roomy whatever the reader chose. The fix is only a fix if both
// populations keep going through the same module; a second file reaching for
// the raw key is how they drift apart again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DENSITY_KEY, DENSITIES, density, isCompact, setDensity, onChange } from '../js/board-density.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

test('density falls back to card where localStorage is unavailable', () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;                    // node, private mode, blocked storage
  try {
    assert.equal(density(), 'card', 'no storage reads as card rather than throwing');
    assert.equal(isCompact(), false);
    setDensity('compact');                            // must not throw
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
});

test('density round-trips and notifies, and anything unknown reads as card', () => {
  const store = {};
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const seen = [];
  const off = onChange((v) => seen.push(v));
  try {
    setDensity('compact');
    assert.equal(density(), 'compact');
    assert.equal(isCompact(), true);

    setDensity('card');
    assert.equal(density(), 'card');

    // A junk value is not a third density — the dial has exactly two positions.
    setDensity('enormous');
    assert.equal(density(), 'card', 'an unrecognised value reads as card, never as itself');

    assert.deepEqual(seen, ['compact', 'card', 'card'], 'every change notifies with the STORED value');
  } finally {
    off();
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
});

test('the dial has exactly the two densities the CSS implements', () => {
  assert.deepEqual(DENSITIES.map(([v]) => v), ['card', 'compact']);
  const css = src('css/app.css');
  assert.match(css, /\.postrow\.compact\s*\{/, 'compact is a real rendered state, not just a stored string');
});

test('NEITHER view file reaches for the raw key — both go through the module', () => {
  // The regression that matters: one population quietly reading or writing
  // forage.boardview directly is how the two boards drift apart again.
  for (const f of ['js/ui/views.js', 'js/ui/lens-views.js']) {
    const body = src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(body, new RegExp(DENSITY_KEY.replace('.', '\\.')),
      `${f} references ${DENSITY_KEY} directly; use js/board-density.js`);
  }
});

test('the sandbox board actually passes compact through to the row', () => {
  // views.js honouring the preference is the whole point; asserting the import
  // alone would pass while the value went nowhere.
  const views = src('js/ui/views.js');
  assert.match(views, /postRow\([^)]*\{\s*compact:\s*isCompact\(\)\s*\}/,
    'js/ui/views.js must pass { compact } to postRow');
  assert.match(views, /densityDial\(/, 'and offer the dial on the board');
});

// ---------------------------------------------------------------------------
// DL-028 step two: a skin may PREFER a density.
//
// This is the half the owner deferred in OQ3, and the shape matters. A skin
// does not get layout properties — it picks from the two densities the app
// already ships, so it cannot express anything a reader cannot reach from the
// dial sitting on the same board. And the preference is a SUGGESTION: the
// moment a reader chooses, their choice is stored and wins for good.
//
// Stated plainly because it is the real cost: a skin preferring compact means a
// first-time viewer of that skin sees no body previews. That is a content
// visibility effect, mild and one click from undone, and it is why "an explicit
// choice always wins" is tested in both directions rather than assumed.
// ---------------------------------------------------------------------------

import { SKINS } from '../js/skins.js';

const withStorage = (initial, fn) => {
  const store = { ...initial };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  try { return fn(store); } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
};

test('DL-028: a skin with no preference leaves density at the default', () => {
  withStorage({ 'forage.skin': 'usenet' }, () => {
    assert.equal(density(), 'card', 'usenet expresses no density preference');
  });
});

test('DL-028: a skin that prefers compact gets it when the reader has not chosen', () => {
  withStorage({ 'forage.skin': 'phpbb' }, () => {
    assert.equal(density(), 'compact',
      'the classic board reads as a board on first sight, without a stored choice');
  });
});

test('DL-028: an explicit choice beats the skin preference, in BOTH directions', () => {
  // The guarantee that keeps this a suggestion rather than a skin seizing layout.
  withStorage({ 'forage.skin': 'phpbb', 'forage.boardview': 'card' }, () => {
    assert.equal(density(), 'card', 'a reader who chose card keeps card on a compact-preferring skin');
  });
  withStorage({ 'forage.skin': 'usenet', 'forage.boardview': 'compact' }, () => {
    assert.equal(density(), 'compact', 'and a reader who chose compact keeps it on a skin that prefers nothing');
  });
});

test('DL-028: every declared preference is one of the densities that exist', () => {
  const valid = DENSITIES.map(([v]) => v);
  for (const [id, s] of Object.entries(SKINS)) {
    if (s.prefersDensity === undefined) continue;
    assert.ok(valid.includes(s.prefersDensity),
      `${id} prefers "${s.prefersDensity}", which is not a density (${valid.join('|')})`);
  }
});

test('DL-028: both phpBB skins prefer compact — a board is dense in either palette', () => {
  assert.equal(SKINS.phpbb.prefersDensity, 'compact');
  assert.equal(SKINS['phpbb-dark'].prefersDensity, 'compact');
});
