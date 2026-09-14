// The COMMITTED files, graded by the gate (plan 2026-09-08-plan-feed-index-and-
// jumpstarts, Phase 0/1). The harvest validates before it writes; this is the
// second half — a bot commit that somehow carries a malformed index turns
// ci.yml red on that push, so main never serves one. It also pins the hand
// files' shapes, because a forager reading feed-providers.json to write their
// own is reading the documentation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIndex, PROVIDER_KINDS, INDEX_VERSION } from '../js/feed-index.js';
import { serialize } from '../scripts/lib/harvest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('data/feed-index.json is a valid index of the current version, and is byte-stable under serialize', () => {
  const text = read('data/feed-index.json');
  const ix = JSON.parse(text);
  const v = validateIndex(ix);
  assert.equal(v.ok, true, v.errors.slice(0, 5).join('\n'));
  assert.equal(ix.v, INDEX_VERSION);
  // the file is exactly what serialize produces — no hand edit, no reformat
  assert.equal(serialize(ix), text, 'data/feed-index.json is generated; regenerate it, never hand-edit');
});

test('data/feed-index.json carries what the plan promised: a corpus above the guard floors, edges, and no counts', () => {
  const ix = JSON.parse(read('data/feed-index.json'));
  assert.ok(ix.feeds.length >= 500, `feeds: ${ix.feeds.length}`);
  assert.ok(ix.jumpstarts.length >= 300, `jumpstarts: ${ix.jumpstarts.length}`);
  assert.ok(ix.edges.length > 0, 'the fold: at least one jumpstart names a feed');
  for (const f of ix.feeds) assert.equal('likeCount' in f, false);
  for (const p of ix.jumpstarts) assert.equal('joinedAllTimeCount' in p, false);
  assert.ok(ix.feeds.some((f) => f.lang && f.lang !== 'en'), 'the language rescue reached the file');
});

test('data/feed-index-meta.json says when, how much, and at what cost', () => {
  const m = JSON.parse(read('data/feed-index-meta.json'));
  assert.match(m.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  const ix = JSON.parse(read('data/feed-index.json'));
  assert.equal(m.counts.feeds, ix.feeds.length);
  assert.equal(m.counts.jumpstarts, ix.jumpstarts.length);
  assert.ok(m.requests > 0);
});

test('data/feed-providers.json: providers have a handle, a known kind and tags; pins are generator at-uris', () => {
  const p = JSON.parse(read('data/feed-providers.json'));
  assert.ok(Array.isArray(p.providers) && p.providers.length >= 50);
  const handles = new Set();
  for (const r of p.providers) {
    assert.ok(typeof r.handle === 'string' && r.handle, JSON.stringify(r));
    assert.ok(!handles.has(r.handle), `duplicate provider ${r.handle}`);
    handles.add(r.handle);
    assert.ok(PROVIDER_KINDS.includes(r.kind), `${r.handle}: kind ${r.kind}`);
    assert.ok(Array.isArray(r.tags) && r.tags.every((t) => /^(topic|lang|community|official)(:[a-z0-9-]+)?$/.test(t)), `${r.handle}: tags ${JSON.stringify(r.tags)}`);
  }
  for (const u of p.pins) assert.match(u, /^at:\/\/did:[a-z]+:[^/]+\/app\.bsky\.feed\.generator\/[^/]+$/);
});

test('data/feed-queries.json: two non-empty lists of terms, no duplicates', () => {
  const q = JSON.parse(read('data/feed-queries.json'));
  for (const k of ['feeds', 'jumpstarts']) {
    assert.ok(Array.isArray(q[k]) && q[k].length > 0, k);
    assert.equal(new Set(q[k]).size, q[k].length, `${k}: duplicate terms`);
    for (const t of q[k]) assert.ok(typeof t === 'string' && t.trim() === t && t, `${k}: ${JSON.stringify(t)}`);
  }
});
