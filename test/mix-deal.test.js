// Mixes — plan 2026-09-08, Phase 2: the deal, and the weight under every sort.
//
// A weight is ONE multiplier per row (D1: "I want more of this in this mix,
// but it has to play nice with top etc sort"). Under Default it is a share of
// a weighted round-robin deal: ×½ deals 1 per round, ×1 deals 2, ×2 deals 4.
// Under Top it multiplies likes; under Hot it multiplies engagement inside the
// log; under New it does nothing. A post with no weight sorts exactly as
// today — test/engines.test.js's literal pins are the guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deal, roundShare } from '../js/mix-deal.js';
import { sortItems, hot } from '../js/engines/rank.js';
import { sortWindow } from '../js/substrates/lens.js';
import { mulberry32 } from '../js/prng.js';

let seq = 0;
const p = (src, extra = {}) => ({ id: `at://${src}/post/${++seq}`, createdTs: 1_700_000_000_000 + seq * 1000, likes: 0, ...extra });
const queue = (id, n, weight) => ({ id, weight, posts: Array.from({ length: n }, () => p(id)) });
const srcOf = (post) => post.id.split('/')[2];

// ---- the share ----

test('the notches deal 1, 2 and 4 per round', () => {
  assert.deepEqual([0.5, 1, 2].map(roundShare), [1, 2, 4]);
});

test('×2 contributes 4 per round beside ×1 two and ×½ one, heaviest first', () => {
  const out = deal([queue('more', 20, 2), queue('normal', 20, 1), queue('less', 20, 0.5)]);
  assert.deepEqual(out.slice(0, 7).map(srcOf), ['more', 'more', 'more', 'more', 'normal', 'normal', 'less'], 'one round');
  assert.deepEqual(out.slice(7, 14).map(srcOf), ['more', 'more', 'more', 'more', 'normal', 'normal', 'less'], 'and the next');
});

test('equal weights break ties by source id, so the deal is deterministic', () => {
  const qa = queue('a', 4, 1), qb = queue('b', 4, 1);
  const a = deal([qb, qa]);
  const b = deal([qa, qb]);
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id), 'input order does not matter');
  assert.deepEqual(a.slice(0, 4).map(srcOf), ['a', 'a', 'b', 'b']);
});

test('weight 0 is never a queue — an off row contributes nothing however many posts it holds', () => {
  const out = deal([queue('on', 3, 1), queue('off', 50, 0)]);
  assert.ok(out.every((x) => srcOf(x) === 'on'));
  assert.equal(out.length, 3);
});

test('a dry queue is skipped and the others keep dealing; nothing is lost', () => {
  const out = deal([queue('short', 1, 2), queue('long', 6, 1)]);
  assert.deepEqual(out.map(srcOf), ['short', 'long', 'long', 'long', 'long', 'long', 'long']);
});

test('a post in two sources appears once, credited to the first source that dealt it', () => {
  const shared = p('shared');
  const out = deal([
    { id: 'a', weight: 1, posts: [p('a'), shared] },
    { id: 'b', weight: 1, posts: [{ ...shared }, p('b')] },
  ]);
  assert.equal(out.filter((x) => x.id === shared.id).length, 1);
  assert.equal(out.length, 3);
});

test('order within a source is the source\'s own — never re-sorted by time across sources', () => {
  // an older post in a heavy source deals before a newer one in a light source
  const old = p('heavy', { createdTs: 1 });
  const young = p('light', { createdTs: 9_999_999_999_999 });
  const out = deal([{ id: 'heavy', weight: 2, posts: [old] }, { id: 'light', weight: 0.5, posts: [young] }]);
  assert.deepEqual(out.map((x) => x.id), [old.id, young.id]);
});

test('property: for random queues the deal is a permutation of the union, in-source order kept, per-round share held', () => {
  const rnd = mulberry32(1337);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  for (let trial = 0; trial < 200; trial++) {
    const n = 1 + Math.floor(rnd() * 6);
    const queues = Array.from({ length: n }, (_, i) => queue(`s${i}`, Math.floor(rnd() * 12), pick([0, 0.5, 1, 2])));
    const out = deal(queues);
    const expected = queues.filter((q) => q.weight > 0).flatMap((q) => q.posts.map((x) => x.id)).sort();
    assert.deepEqual(out.map((x) => x.id).sort(), expected, 'every live post once, none from an off queue');
    for (const q of queues.filter((x) => x.weight > 0)) {
      const mine = out.filter((x) => srcOf(x) === q.id).map((x) => x.id);
      assert.deepEqual(mine, q.posts.map((x) => x.id), `${q.id}: in-source order kept`);
    }
    // first round: each live, non-empty queue contributes min(share, length)
    const live = queues.filter((q) => q.weight > 0 && q.posts.length).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    let at = 0;
    for (const q of live) {
      const take = Math.min(roundShare(q.weight), q.posts.length);
      assert.deepEqual(out.slice(at, at + take).map(srcOf), Array(take).fill(q.id), `${q.id} deals ${take} in round one`);
      at += take;
    }
  }
});

// ---- the weight under the sorts ----

const now = 1_700_000_000;
const item = (id, likes, mixWeight, ageSec = 3600) => ({ id, likes, createdSec: now - ageSec, createdTs: (now - ageSec) * 1000, ...(mixWeight === undefined ? {} : { mixWeight }) });

test('Top: likes × weight — a ×2 post with half the likes ties a ×1 post, and wins with one more', () => {
  const tie = sortItems([item('half', 50, 2), item('full', 100, 1)], 'top', now).map((i) => i.id);
  assert.deepEqual(tie, ['half', 'full'], 'a tie keeps input order');
  const win = sortItems([item('full', 100, 1), item('half', 51, 2)], 'top', now).map((i) => i.id);
  assert.deepEqual(win, ['half', 'full']);
  const less = sortItems([item('less', 100, 0.5), item('plain', 60)], 'top', now).map((i) => i.id);
  assert.deepEqual(less, ['plain', 'less'], '×½ halves; a post with no weight is ×1');
});

test('Hot: engagement × weight inside the log — ×2 is worth 3¾ hours of youth', () => {
  // hot(score, t) = log10(score) + t/45000; ×2 adds log10(2) ≈ 0.301 → 0.301 × 45000 s ≈ 13,545 s
  const older = item('older', 100, 2, 3600 + 13_000);   // 3.6 h older, weighted ×2 → still wins
  const newer = item('newer', 100, 1, 3600);
  assert.deepEqual(sortItems([newer, older], 'hot', now).map((i) => i.id), ['older', 'newer']);
  const tooOld = item('tooold', 100, 2, 3600 + 14_000); // past the 3¾ h the weight buys
  assert.deepEqual(sortItems([tooOld, newer], 'hot', now).map((i) => i.id), ['newer', 'tooold']);
  assert.equal(hot(100, now), hot(100, now), 'hot() itself is untouched');
});

test('New: unweighted — time is the one order a weight cannot touch', () => {
  const out = sortItems([item('old-heavy', 0, 2, 7200), item('new-light', 0, 0.5, 60)], 'new', now).map((i) => i.id);
  assert.deepEqual(out, ['new-light', 'old-heavy']);
});

test('sortWindow reads the weight the same way — top and hot weighted, new and feed not', () => {
  const posts = [item('half', 51, 2), item('full', 100, 1)];
  assert.deepEqual(sortWindow(posts, 'top', 'all', now * 1000).map((i) => i.id), ['half', 'full']);
  assert.deepEqual(sortWindow(posts, 'feed', 'all', now * 1000).map((i) => i.id), ['half', 'full'], 'feed = as dealt');
  const byTime = [item('old-heavy', 0, 2, 7200), item('new-light', 0, 0.5, 60)];
  assert.deepEqual(sortWindow(byTime, 'new', 'all', now * 1000).map((i) => i.id), ['new-light', 'old-heavy']);
  const older = item('older', 100, 2, 3600 + 13_000), newer = item('newer', 100, 1, 3600);
  assert.deepEqual(sortWindow([newer, older], 'hot', 'all', now * 1000).map((i) => i.id), ['older', 'newer']);
});
