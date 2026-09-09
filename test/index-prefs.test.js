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
