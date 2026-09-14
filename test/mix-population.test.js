// The mixes population (e2e/harness/mock-mix.mjs) is "this morning's posts":
// the mix board opens its Top sort on the "Today" window (lens-views.js,
// `boardTimeframe = 'day'`, filtered by sortWindow), so a post stamped with a
// calendar date ages out of the board the day after it is written. That is
// exactly what happened: the fixture carried 2026-09-08T10:xx, the corpus was
// green at 2026-09-09T03:15 and red from 12:59 the same day with no code
// change near the board (forage TODO, "workflows CI job is red"). The claim
// this pins is the fixture's, not the board's: every post it answers with
// falls inside the day window on whatever day the corpus runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESPONSES } from '../e2e/harness/mock-mix.mjs';

const DAY_MS = 86400_000;
const posts = Object.values(RESPONSES).flatMap((r) => [
  ...(Array.isArray(r.feed) ? r.feed.map((e) => e.post) : []),
  ...(Array.isArray(r.posts) ? r.posts : []),
]);

test('the mix population is stamped inside the Top sort’s Today window on the day it runs', () => {
  assert.ok(posts.length >= 6 + 8 + 6 + 4, `the four sources answer (${posts.length} posts)`);
  const now = Date.now();
  for (const p of posts) {
    const ts = Date.parse(p.record.createdAt);
    assert.ok(now - ts < DAY_MS, `${p.record.text} is stamped ${p.record.createdAt}, outside Today`);
    assert.ok(ts <= now, `${p.record.text} is stamped in the future: ${p.record.createdAt}`);
    assert.equal(p.indexedAt, p.record.createdAt, 'indexedAt agrees with createdAt');
  }
});

test('within a source, post 1 is the newest — the deal and New both read it that way', () => {
  const bySource = new Map();
  for (const p of posts) {
    const src = p.record.text.split(' ')[0];
    bySource.set(src, [...(bySource.get(src) ?? []), Date.parse(p.record.createdAt)]);
  }
  for (const [src, stamps] of bySource) {
    const sorted = [...stamps].sort((a, b) => b - a);
    assert.deepEqual(stamps, sorted, `${src}: stamps run newest first`);
    assert.equal(new Set(stamps).size, stamps.length, `${src}: no two posts share a stamp`);
  }
});
