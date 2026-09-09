// The index substrate (plan 2026-09-08-plan-feed-index-and-jumpstarts, Phase 2
// and 2b): loads the committed index same-origin, validates on the way in,
// refuses a malformed file with words, and folds a forager's OWN index over it
// (D-own: replace, add, or off). Hermetic — the fetch is injected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadIndex, createIndexStore } from '../js/feed-index-store.js';
import { INDEX_VERSION, emptyIndex } from '../js/feed-index.js';

const F = (n, extra = {}) => ({ uri: `at://did:plc:${n}/app.bsky.feed.generator/f${n}`, name: `Feed ${n}`,
  desc: '', creator: `c${n}.test`, platform: 'skyfeed.me', band: 2, tags: [], ...extra });
const P = (n, extra = {}) => ({ uri: `at://did:plc:${n}/app.bsky.graph.starterpack/p${n}`, name: `Pack ${n}`,
  desc: '', creator: `c${n}.test`, members: 12, band: 1, tags: [], ...extra });
const ours = { v: INDEX_VERSION, feeds: [F(1), F(2)], jumpstarts: [P(1)], edges: [[P(1).uri, F(1).uri]], providers: [] };
const meta = { generatedAt: '2026-09-08T05:23:00Z', counts: { feeds: 2, jumpstarts: 1 } };

// a same-origin fetch: paths → bodies; anything else 404
const fetchOf = (files) => async (url) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, '');
  if (!(path in files)) return { ok: false, status: 404, json: async () => { throw new Error('404'); } };
  const body = files[path];
  if (body instanceof Error) throw body;
  return { ok: true, status: 200, json: async () => body };
};
const served = () => fetchOf({ '/data/feed-index.json': ours, '/data/feed-index-meta.json': meta });

test('loadIndex: the committed index, validated, with its age', async () => {
  const r = await loadIndex({ fetchImpl: served() });
  assert.equal(r.status, 'forage');
  assert.equal(r.index.feeds.length, 2);
  assert.equal(r.generatedAt, meta.generatedAt);
  assert.deepEqual(r.errors, []);
});

test('loadIndex: a missing file is "missing" with an empty index — discovery falls back to the browse corpus, never an empty page', async () => {
  const r = await loadIndex({ fetchImpl: fetchOf({}) });
  assert.equal(r.status, 'missing');
  assert.deepEqual(r.index, emptyIndex());
  assert.match(r.errors[0], /feed-index\.json/);
});

test('loadIndex: a network failure is "missing" too, and says so', async () => {
  const r = await loadIndex({ fetchImpl: fetchOf({ '/data/feed-index.json': new Error('offline') }) });
  assert.equal(r.status, 'missing');
  assert.match(r.errors[0], /offline/);
});

test('loadIndex: a malformed file is REFUSED with the validator’s words, and the index is empty — never garbage', async () => {
  const bad = { ...ours, feeds: [{ ...F(1), band: 9 }] };
  const r = await loadIndex({ fetchImpl: fetchOf({ '/data/feed-index.json': bad, '/data/feed-index-meta.json': meta }) });
  assert.equal(r.status, 'invalid');
  assert.deepEqual(r.index, emptyIndex());
  assert.match(r.errors[0], /feeds\[0\].*band/);
});

test('loadIndex: meta missing is not fatal — the index loads with an unknown age', async () => {
  const r = await loadIndex({ fetchImpl: fetchOf({ '/data/feed-index.json': ours }) });
  assert.equal(r.status, 'forage');
  assert.equal(r.generatedAt, null);
});

// ---- D-own: the forager's index ----

test('loadIndex: mode "off" fetches nothing and reports off', async () => {
  let calls = 0;
  const r = await loadIndex({ fetchImpl: async () => { calls++; throw new Error('should not fetch'); }, own: { mode: 'off' } });
  assert.equal(calls, 0);
  assert.equal(r.status, 'off');
  assert.deepEqual(r.index, emptyIndex());
});

test('loadIndex: mode "replace" uses the forager’s index alone, marked mine, and ours is not fetched', async () => {
  let calls = 0;
  const mine = { ...emptyIndex(), feeds: [F(9)] };
  const r = await loadIndex({ fetchImpl: async () => { calls++; return served()('/data/feed-index.json'); }, own: { mode: 'replace', index: mine } });
  assert.equal(calls, 0);
  assert.equal(r.status, 'mine');
  assert.deepEqual(r.index.feeds.map((f) => [f.name, f.source]), [['Feed 9', 'mine']]);
});

test('loadIndex: mode "add" merges theirs over ours, theirs winning, marked', async () => {
  const mine = { ...emptyIndex(), feeds: [F(2, { name: 'Mine 2' }), F(3)] };
  const r = await loadIndex({ fetchImpl: served(), own: { mode: 'add', index: mine } });
  assert.equal(r.status, 'merged');
  assert.deepEqual(r.index.feeds.map((f) => [f.name, f.source]),
    [['Feed 1', 'forage'], ['Mine 2', 'mine'], ['Feed 3', 'mine']]);
  assert.equal(r.index.edges.length, 1);
});

test('loadIndex: an invalid own index is refused with words and OURS stands — the previous good index stays in place', async () => {
  const mine = { ...emptyIndex(), feeds: [{ ...F(9), name: '' }] };
  const r = await loadIndex({ fetchImpl: served(), own: { mode: 'replace', index: mine } });
  assert.equal(r.status, 'forage');
  assert.equal(r.index.feeds.length, 2);
  assert.match(r.errors[0], /your index.*feeds\[0\]/i);
});

// ---- the store the views read ----

test('createIndexStore: one load, then synchronous reads — search, edges both ways, status', async () => {
  const store = createIndexStore({ fetchImpl: served() });
  assert.equal(store.status().status, 'loading');
  await store.ready();
  assert.equal(store.status().status, 'forage');
  assert.equal(store.status().generatedAt, meta.generatedAt);
  assert.deepEqual(store.search('feed 2').feeds.map((f) => f.uri), [F(2).uri]);
  assert.deepEqual(store.feedsInPack(P(1).uri), [F(1).uri]);
  assert.deepEqual(store.packsWithFeed(F(1).uri), [P(1).uri]);
  assert.deepEqual(store.packsWithFeed(F(2).uri), []);
  assert.equal(store.feed(F(1).uri).name, 'Feed 1');
  assert.equal(store.feed('at://nope'), null);
  assert.equal(store.jumpstart(P(1).uri).members, 12);
  assert.equal(store.feeds().length, 2);
  assert.equal(store.jumpstarts().length, 1);
});

test('createIndexStore: ready() is idempotent and reload() takes a new own-index without a page load', async () => {
  let fetches = 0;
  const f = served();
  const store = createIndexStore({ fetchImpl: async (u) => { fetches++; return f(u); } });
  await store.ready(); await store.ready();
  assert.equal(fetches, 2, 'index + meta, once');
  await store.reload({ mode: 'replace', index: { ...emptyIndex(), feeds: [F(7)] } });
  assert.equal(store.status().status, 'mine');
  assert.equal(store.feeds().length, 1);
});
