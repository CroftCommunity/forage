// The feed index (plan 2026-09-08-plan-feed-index-and-jumpstarts): the pure
// core shared by the harvest (Node) and the app (browser). A file with a
// published shape, one validator on both sides of it, a merge for the
// forager's own index, and a search that needs no index structure — 1,313 rows
// scan in 0.085ms (D9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INDEX_VERSION, bandOf, validateIndex, mergeIndexes, searchIndex, edgeMaps,
  scriptOf, langHint, emptyIndex,
} from '../js/feed-index.js';

const F = (n, extra = {}) => ({ uri: `at://did:plc:${n}/app.bsky.feed.generator/f${n}`, name: `Feed ${n}`,
  desc: '', creator: `c${n}.test`, platform: 'skyfeed.me', band: 2, tags: [], ...extra });
const P = (n, extra = {}) => ({ uri: `at://did:plc:${n}/app.bsky.graph.starterpack/p${n}`, name: `Pack ${n}`,
  desc: '', creator: `c${n}.test`, members: 12, band: 1, tags: [], ...extra });
const index = (o = {}) => ({ v: INDEX_VERSION, feeds: [], jumpstarts: [], edges: [], providers: [], ...o });

// ---- bands: the rank hint that never carries a raw count (D2: churn) ----

test('bandOf: five bands on decimal thresholds, and a non-number is band 0', () => {
  assert.equal(bandOf(0), 0);
  assert.equal(bandOf(9), 0);
  assert.equal(bandOf(10), 1);
  assert.equal(bandOf(99), 1);
  assert.equal(bandOf(100), 2);
  assert.equal(bandOf(999), 2);
  assert.equal(bandOf(1000), 3);
  assert.equal(bandOf(9999), 3);
  assert.equal(bandOf(10000), 4);
  assert.equal(bandOf(52693), 4);
  assert.equal(bandOf(undefined), 0);
  assert.equal(bandOf(NaN), 0);
});

// ---- the validator: LEXICONS rule 4 applied to our own artifact ----

test('validateIndex: an empty index of the current version is valid', () => {
  assert.deepEqual(validateIndex(emptyIndex()), { ok: true, errors: [] });
});

test('validateIndex: the wrong version, a missing table, or a non-object is refused with words', () => {
  assert.equal(validateIndex(null).ok, false);
  assert.equal(validateIndex('x').ok, false);
  const v = validateIndex(index({ v: 2 }));
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /version/i);
  const t = validateIndex({ v: INDEX_VERSION, feeds: [] });
  assert.equal(t.ok, false);
  assert.ok(t.errors.some((e) => /jumpstarts/.test(e)), 'names the missing table');
});

test('validateIndex: a feed row must be a generator at-uri with a name, creator, band and tags', () => {
  const bad = (row) => validateIndex(index({ feeds: [row] }));
  assert.equal(bad(F(1)).ok, true);
  assert.equal(bad({ ...F(1), uri: 'at://did:plc:1/app.bsky.graph.starterpack/x' }).ok, false, 'a pack uri is not a feed');
  assert.equal(bad({ ...F(1), name: '' }).ok, false);
  assert.equal(bad({ ...F(1), band: 5 }).ok, false);
  assert.equal(bad({ ...F(1), tags: 'art' }).ok, false);
  assert.equal(bad({ ...F(1), desc: 'x'.repeat(161) }).ok, false, 'desc is capped at 160');
  assert.equal(bad({ ...F(1), labels: ['porn'] }).ok, true);
  assert.equal(bad({ ...F(1), labels: 'porn' }).ok, false);
  assert.equal(bad({ ...F(1), lang: 'pt' }).ok, true);
  assert.equal(bad({ ...F(1), video: true }).ok, true);
  assert.equal(bad({ ...F(1), platform: null }).ok, true, 'a generator on a did:plc has no platform');
  // the error names the row, so a forager's rejected file says WHICH line
  const r = bad({ ...F(1), name: '' });
  assert.match(r.errors[0], /feeds\[0\]/);
});

test('validateIndex: a jumpstart row must be a starterpack at-uri with a member count', () => {
  const bad = (row) => validateIndex(index({ jumpstarts: [row] }));
  assert.equal(bad(P(1)).ok, true);
  assert.equal(bad({ ...P(1), uri: F(1).uri }).ok, false);
  assert.equal(bad({ ...P(1), members: -1 }).ok, false);
  assert.equal(bad({ ...P(1), members: 1.5 }).ok, false);
});

test('validateIndex: rows are unique and sorted by uri — determinism is a property the file must have', () => {
  const a = F(1); const b = F(2);
  assert.equal(validateIndex(index({ feeds: [a, b] })).ok, true);
  const dup = validateIndex(index({ feeds: [a, a] }));
  assert.equal(dup.ok, false);
  assert.match(dup.errors[0], /duplicate/i);
  const unsorted = validateIndex(index({ feeds: [b, a] }));
  assert.equal(unsorted.ok, false);
  assert.match(unsorted.errors[0], /sorted/i);
});

test('validateIndex: an edge names a jumpstart and a feed that are both in the index', () => {
  const f = F(1); const p = P(1);
  assert.equal(validateIndex(index({ feeds: [f], jumpstarts: [p], edges: [[p.uri, f.uri]] })).ok, true);
  const dangling = validateIndex(index({ feeds: [f], jumpstarts: [p], edges: [[p.uri, F(9).uri]] }));
  assert.equal(dangling.ok, false);
  assert.match(dangling.errors[0], /edges\[0\]/);
  assert.equal(validateIndex(index({ feeds: [f], jumpstarts: [p], edges: [[f.uri, p.uri]] })).ok, false, 'direction is pack → feed');
});

test('validateIndex: a provider row is a handle, a kind and tags', () => {
  const ok = validateIndex(index({ providers: [{ handle: 'bsky.app', kind: 'curator', tags: ['official'] }] }));
  assert.equal(ok.ok, true);
  assert.equal(validateIndex(index({ providers: [{ handle: 'bsky.app', kind: 'robot', tags: [] }] })).ok, false, 'kind is from a fixed vocabulary');
});

// ---- merge: the forager's own index over ours, theirs winning ----

test('mergeIndexes: rows union on uri with the second index winning; edges and providers union; output sorted', () => {
  const ours = index({ feeds: [F(1), F(2, { name: 'Ours' })], jumpstarts: [P(1)], edges: [[P(1).uri, F(1).uri]],
    providers: [{ handle: 'a.test', kind: 'curator', tags: [] }] });
  const mine = index({ feeds: [F(2, { name: 'Mine' }), F(0)], jumpstarts: [], edges: [[P(1).uri, F(2).uri]],
    providers: [{ handle: 'b.test', kind: 'community', tags: [] }] });
  const m = mergeIndexes(ours, mine);
  assert.equal(validateIndex(m).ok, true, validateIndex(m).errors.join('; '));
  assert.deepEqual(m.feeds.map((f) => f.name), ['Feed 0', 'Feed 1', 'Mine']);
  assert.equal(m.edges.length, 2);
  assert.deepEqual(m.providers.map((p) => p.handle), ['a.test', 'b.test']);
  assert.notEqual(m.feeds, ours.feeds, 'inputs are not mutated');
});

test('mergeIndexes: a provenance mark says whose row it is', () => {
  const m = mergeIndexes(index({ feeds: [F(1)] }), index({ feeds: [F(2)] }));
  assert.equal(m.feeds[0].source, 'forage');
  assert.equal(m.feeds[1].source, 'mine');
});

// ---- search: substring over name, description, creator, tags; band-ranked ----

test('searchIndex: case-insensitive substring over name, desc, creator and tags; empty query is empty', () => {
  const ix = index({ feeds: [F(1, { name: 'Trending Brasil', band: 4 }), F(2, { desc: 'photos of brazil', band: 1 }),
    F(3, { creator: 'brasilia.test', band: 2 }), F(4, { tags: ['lang:pt'] })], jumpstarts: [P(1, { name: 'Brazil devs' })] });
  const r = searchIndex(ix, 'brasil');
  assert.deepEqual(r.feeds.map((f) => f.name), ['Trending Brasil', 'Feed 3'], 'band 4 before band 2; brazil ≠ brasil');
  assert.deepEqual(searchIndex(ix, 'BRAZIL').feeds.map((f) => f.name), ['Feed 2']);
  assert.deepEqual(searchIndex(ix, 'brazil').jumpstarts.map((p) => p.name), ['Brazil devs']);
  assert.deepEqual(searchIndex(ix, 'lang:pt').feeds.map((f) => f.name), ['Feed 4']);
  assert.deepEqual(searchIndex(ix, ''), { feeds: [], jumpstarts: [] });
  assert.deepEqual(searchIndex(ix, '   '), { feeds: [], jumpstarts: [] });
});

test('searchIndex: ties within a band break on name, so the order is stable across runs', () => {
  const ix = index({ feeds: [F(2, { name: 'b art' }), F(1, { name: 'a art' })] });
  assert.deepEqual(searchIndex(ix, 'art').feeds.map((f) => f.name), ['a art', 'b art']);
});

// ---- edges both ways, offline ----

test('edgeMaps: feedsInPack and packsWithFeed from one edge list', () => {
  const ix = index({ feeds: [F(1), F(2)], jumpstarts: [P(1), P(2)],
    edges: [[P(1).uri, F(1).uri], [P(1).uri, F(2).uri], [P(2).uri, F(1).uri]] });
  const m = edgeMaps(ix);
  assert.deepEqual(m.feedsInPack.get(P(1).uri), [F(1).uri, F(2).uri]);
  assert.deepEqual(m.packsWithFeed.get(F(1).uri), [P(1).uri, P(2).uri]);
  assert.equal(m.packsWithFeed.get(F(9).uri), undefined);
});

// ---- language: the thing the protocol does not carry (D4) ----

test('scriptOf: the dominant script of a text, NONE when it has no letters', () => {
  assert.equal(scriptOf('Trending Brasil'), 'LATIN');
  assert.equal(scriptOf('狂聡FEED'), 'CJK');
  assert.equal(scriptOf('買っちゃった！'), 'HIRAGANA');
  assert.equal(scriptOf('한국어 답글 피드'), 'HANGUL');
  assert.equal(scriptOf('🇺🇦 Всі'), 'CYRILLIC');
  assert.equal(scriptOf('🐾 🔞'), 'NONE');
  assert.equal(scriptOf(''), 'NONE');
});

test('langHint: script decides where it can; Latin needs two stopword hits; otherwise null', () => {
  assert.equal(langHint('買っちゃった！ 日本のフィード'), 'ja');
  assert.equal(langHint('한국어 답글 피드'), 'ko');
  assert.equal(langHint('Всі новини України'), 'uk');
  assert.equal(langHint('Posts de notícias do Brasil para você'), 'pt');
  assert.equal(langHint('Noticias de los deportes para todos'), 'es');
  assert.equal(langHint('Trending News'), null, 'English is the default, not a detection');
  assert.equal(langHint('de'), null, 'one stopword is not evidence');
});
