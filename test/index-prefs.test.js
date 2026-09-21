// D-own (plan 2026-09-08-plan-feed-index-and-jumpstarts, Phase 2b): the
// forager's own index — replace ours, add to it, or turn it off. Device-local
// like the card size; a corrupt stored value reads as NO choice (ours), never
// as an empty page; a file that fails the validator is refused with its words
// and the previous good one stays. The PDS record that follows the reader is
// the named follow-up, not this.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDEX_VERSION, emptyIndex } from '../js/feed-index.js';

// a localStorage the module can see (Node has none)
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const prefs = await import('../js/index-prefs.js');
const F = (n) => ({ uri: `at://did:plc:${n}/app.bsky.feed.generator/f${n}`, name: `Feed ${n}`, desc: '',
  creator: `c${n}.test`, platform: null, band: 1, tags: [] });
const good = { ...emptyIndex(), feeds: [F(1)] };

test('index-prefs: nothing stored is mode "forage" with no own index', () => {
  store.clear();
  assert.equal(prefs.mode(), 'forage');
  assert.equal(prefs.own(), null);
  assert.deepEqual(prefs.current(), { mode: 'forage', index: null, generatedAt: null, name: null });
});

test('index-prefs: setOwn validates first — an invalid file throws with the validator’s words and stores nothing', () => {
  store.clear();
  assert.throws(() => prefs.setOwn({ index: { ...good, feeds: [{ ...F(1), name: '' }] }, name: 'mine.json' }), /feeds\[0\]: name is empty/);
  assert.equal(prefs.own(), null);
  assert.equal(prefs.mode(), 'forage');
});

test('index-prefs: a valid own index is stored with a name and a stamp, and the mode defaults to "add"', () => {
  store.clear();
  prefs.setOwn({ index: good, name: 'mine.json', now: 1_700_000_000_000 });
  const o = prefs.own();
  assert.equal(o.name, 'mine.json');
  assert.equal(o.generatedAt, new Date(1_700_000_000_000).toISOString());
  assert.deepEqual(o.index.feeds.map((f) => f.uri), [F(1).uri]);
  assert.equal(prefs.mode(), 'add');
  assert.equal(prefs.current().mode, 'add');
});

test('index-prefs: the mode is one of four words; anything else throws; "replace"/"add" without an own index fall back to "forage"', () => {
  store.clear();
  assert.throws(() => prefs.setMode('mine'), /mode/);
  prefs.setMode('off');
  assert.equal(prefs.mode(), 'off');
  prefs.setMode('replace');
  assert.equal(prefs.mode(), 'replace', 'stored as asked');
  assert.equal(prefs.current().mode, 'forage', 'but with nothing to replace with, the effective mode is ours');
  prefs.setOwn({ index: good, name: 'x' });
  prefs.setMode('replace');
  assert.equal(prefs.current().mode, 'replace');
});

test('index-prefs: clearOwn forgets the file and puts the mode back to "forage"', () => {
  store.clear();
  prefs.setOwn({ index: good, name: 'x' });
  prefs.setMode('replace');
  prefs.clearOwn();
  assert.equal(prefs.own(), null);
  assert.equal(prefs.mode(), 'forage');
});

test('index-prefs: a corrupt stored value reads as no choice — never an empty page', () => {
  store.clear();
  store.set(prefs.KEY, '{not json');
  assert.equal(prefs.mode(), 'forage');
  assert.equal(prefs.own(), null);
  store.set(prefs.KEY, JSON.stringify({ mode: 'add', own: { index: { v: 99 }, name: 'bad' } }));
  assert.equal(prefs.own(), null, 'a stored index that no longer validates is dropped');
  assert.equal(prefs.current().mode, 'forage');
});

test('index-prefs: parseOwnText turns a pasted or uploaded file into an index or a readable refusal', () => {
  const ok = prefs.parseOwnText(JSON.stringify(good));
  assert.equal(ok.ok, true);
  assert.equal(ok.index.v, INDEX_VERSION);
  const notJson = prefs.parseOwnText('{');
  assert.equal(notJson.ok, false);
  assert.match(notJson.errors[0], /not JSON/i);
  const bad = prefs.parseOwnText(JSON.stringify({ v: 2 }));
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /version/);
});

// Plan 2026-09-21 own-index-on-the-pds, Phase 1: two fixes the device half was
// owed. (1) A file the browser cannot hold was toasted as "Stored" while the
// quota error was swallowed (E10) — a refusal must be words, never a silent
// nothing. (2) The one ceiling (D7) bounds a pasted file BEFORE it is parsed.
test('index-prefs: a file the browser will not hold is refused in words that say how big it is, and nothing changes', async () => {
  store.clear();
  prefs.setOwn({ index: good, name: 'small.json', now: 1_700_000_000_000 });
  const before = JSON.stringify(prefs.own());
  const real = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = (k, v) => {
    if (String(v).length > 50_000) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; }
    return real(k, v);
  };
  try {
    // rows sorted by uri as STRINGS (the validator's rule), hence the zero-padded ids
    const big = { ...good, feeds: Array.from({ length: 400 }, (_, i) => ({ ...F(String(i + 10).padStart(4, '0')), desc: 'd'.repeat(150) })) };
    assert.throws(() => prefs.setOwn({ index: big, name: 'big.json' }), (e) => /will not hold/.test(e.message) && /\d{5,} bytes/.test(e.message));
    assert.equal(JSON.stringify(prefs.own()), before, 'the previous file stays');
    assert.equal(prefs.own().name, 'small.json');
  } finally {
    globalThis.localStorage.setItem = real;
  }
});

test('index-prefs: parseOwnText refuses a paste over the ceiling before parsing it, naming both numbers', async () => {
  const { INDEX_BYTES_MAX } = await import('../js/feed-index-record.js');
  const r = prefs.parseOwnText('x'.repeat(INDEX_BYTES_MAX + 1));
  assert.equal(r.ok, false);
  assert.match(r.errors[0], new RegExp(`${INDEX_BYTES_MAX + 1}`));
  assert.match(r.errors[0], new RegExp(`${INDEX_BYTES_MAX}`));
  assert.doesNotMatch(r.errors[0], /not JSON/, 'the size is the reason, not the parse');
});
