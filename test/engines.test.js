// Characterization: the ranking + limits engines as they behave TODAY
// (phase 1c). Pure functions — pinned on fixed inputs with boundary cases
// (window edges, factor thresholds, gates) so single-line mutations die.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hot, confidence, rising, sortItems } from '../js/engines/rank.js';
import { limits, humanWait, REP_FAST_THRESHOLD } from '../js/engines/limits.js';

const EPOCH = 1134028003; // reddit epoch, rank.js

// ---- hot ----

test('hot: measured pins — the same numbers, one argument fewer', () => {
  // Deliberately the SAME expectations as the two-sided version produced for
  // the equivalent net score: hot(10, 2, t) was log10(8) + t, and hot(8, t) is
  // too. If a simplification moves its own outputs it is a behaviour change,
  // and this is the line that would catch it.
  assert.equal(hot(8, EPOCH + 45000), 1.90309);   // log10(8) + 45000/45000, round7
  assert.equal(hot(0, EPOCH), 0);                 // no boosts -> log10(max(0,1)) = 0
  assert.equal(hot(1, EPOCH), 0);                 // and one boost is the same order term

  // The NEGATIVE pin is deleted rather than ported, and it is the most
  // interesting deletion in this phase: `hot(2, 10, EPOCH) === -0.90309`
  // exercised `sign(s)` flipping the order term for a net-negative score.
  // Scores cannot be negative now, so that branch is not merely untaken — it is
  // unreachable, which is why `sign()` is gone from rank.js rather than kept
  // "just in case".
});

test('hot: age moves rank even when the score is identical', () => {
  assert.ok(hot(4, EPOCH + 90000) > hot(4, EPOCH));
});

// ---- confidence (Wilson lower bound, z = 1.281551565545) ----

test('confidence: measured pins', () => {
  assert.equal(confidence(0, 0), 0); // no votes -> 0, not NaN
  // Downvotes are gone (plan 2026-08-27-1), so n === ups and p === 1 always.
  // These are the SAME numbers the two-argument version produced with downs=0 —
  // deliberately unchanged, because a formula simplification that moves its own
  // outputs is a behaviour change wearing a refactor's clothes.
  assert.ok(Math.abs(confidence(1) - 0.37844750322520615) < 1e-12);
  assert.ok(Math.abs(confidence(100) - 0.9838416366736703) < 1e-12);
  assert.equal(confidence(0), 0, 'no votes is no confidence, not a division by zero');
});

test('confidence: more evidence raises the lower bound', () => {
  // Was "more evidence AT THE SAME RATIO". There is only one ratio now, which
  // is why the old second assertion (confidence(30,10) > confidence(3,1)) is
  // not ported: its subject — two different ratios — no longer exists.
  assert.ok(confidence(100) > confidence(1));
  assert.ok(confidence(2) > confidence(1));
});

// The `controversy` tests are DELETED, not ported, and the distinction matters:
// the function is gone, so there is nothing left to assert about. Controversial
// was the only ranking defined BY the up/down split — every other sort merely
// consumed it — so it is the only one with no downs-free form. That loss is the
// owner's decision (*"controversial can go sure"*), recorded here because a
// deleted test and an abandoned test look identical in a diff.

// ---- rising: both gates at their exact edges ----

test('rising: age gate — exactly 6h passes, one second older is -Infinity', () => {
  assert.equal(rising(12, EPOCH, EPOCH + 6 * 3600), 2.0010791812); // velocity 2 at 6h
  assert.equal(rising(12, EPOCH, EPOCH + 6 * 3600 + 1), -Infinity);
});

test('rising: velocity gate — exactly 2 votes/hour passes, below is -Infinity', () => {
  const t = EPOCH;
  assert.ok(Number.isFinite(rising(2, t, t + 3600)));  // velocity 2.0
  assert.equal(rising(1, t, t + 3600), -Infinity);      // velocity 1.0
});

// ---- sortItems ----

test('sortItems: new is createdSec desc; top is boosts desc', () => {
  const items = [
    { id: 'old', ups: 9, createdSec: EPOCH },
    { id: 'mid', ups: 1, createdSec: EPOCH + 100 },
    { id: 'new', ups: 3, createdSec: EPOCH + 200 },
  ];
  assert.deepStrictEqual(sortItems(items, 'new').map((i) => i.id), ['new', 'mid', 'old']);
  assert.deepStrictEqual(sortItems(items, 'top').map((i) => i.id), ['old', 'new', 'mid']);
  assert.deepStrictEqual(items.map((i) => i.id), ['old', 'mid', 'new']); // input not mutated
});

test('sortItems: unknown sort falls back to hot — and `controversial` is now unknown', () => {
  const items = [
    { id: 'a', ups: 0, createdSec: EPOCH },
    { id: 'b', ups: 5, createdSec: EPOCH },
  ];
  assert.deepStrictEqual(sortItems(items, 'nonsense').map((i) => i.id), ['b', 'a']);
  // The edge that matters to a person rather than to the engine: a shared link
  // carrying `?sort=controversial`, or a stored `defaultSort` from before this
  // change, must land on a working board instead of stranding someone on a
  // sort that no longer exists. The fallback already existed; nothing pinned
  // that THIS name reaches it.
  assert.deepStrictEqual(sortItems(items, 'controversial').map((i) => i.id), ['b', 'a']);
});

// ---- limits: factor thresholds ----

const evAt = (type, sec, extra = {}) => ({ type, actor: 'u_x', ts: sec * 1000, payload: {}, ...extra });

test('limits: logged-out can do nothing, with words (exact shape)', () => {
  assert.deepStrictEqual(limits(null, [], 0, false, 1000), {
    canComment: false, canPost: false, commentWaitSec: 0, postWaitSec: 0,
    probation: false, reason: 'logged-out',
  });
});

test('limits: POST wait arithmetic at its window edge (299s blocked, 300s free)', () => {
  const events = [evAt('post.created', 100)];
  const at399 = limits('u_x', events, 0, false, 399);
  assert.equal(at399.canPost, false);
  assert.equal(at399.postWaitSec, 1);
  const at400 = limits('u_x', events, 0, false, 400);
  assert.equal(at400.canPost, true);
  assert.equal(at400.postWaitSec, 0);
  // a comment does not consume the post budget
  assert.equal(limits('u_x', [evAt('comment.created', 399)], 0, false, 400).canPost, true);
});

test('limits: cooldown factor — probation 2x, rep at threshold 0.5x, one under threshold 1x', () => {
  const probation = limits('u_x', [], 0, true, 1000);
  assert.equal(probation.commentCooldown, 120);
  assert.equal(probation.postCooldown, 600);
  assert.equal(probation.reason, 'probation');

  const trusted = limits('u_x', [], REP_FAST_THRESHOLD, false, 1000);
  assert.equal(trusted.commentCooldown, 30);
  assert.equal(trusted.postCooldown, 150);
  assert.equal(trusted.reason, 'trusted');

  const normal = limits('u_x', [], REP_FAST_THRESHOLD - 1, false, 1000);
  assert.equal(normal.commentCooldown, 60);
  assert.equal(normal.postCooldown, 300);
  assert.equal(normal.reason, 'normal');
});

test('limits: wait arithmetic at the window edge (59s blocked, 60s free)', () => {
  const events = [evAt('comment.created', 100)];
  const at159 = limits('u_x', events, 0, false, 159);
  assert.equal(at159.canComment, false);
  assert.equal(at159.commentWaitSec, 1);
  const at160 = limits('u_x', events, 0, false, 160);
  assert.equal(at160.canComment, true);
  assert.equal(at160.commentWaitSec, 0);
});

test('limits: only own events count against the budget', () => {
  const events = [{ type: 'comment.created', actor: 'u_other', ts: 100_000, payload: {} }];
  assert.equal(limits('u_x', events, 0, false, 101).canComment, true);
});

// The rapid-bury cool-off is GONE (plan 2026-08-27-1 Phase 3). Three tests
// covered it — the 5-in-60s trigger, its window edge, and the "only buries
// count" discrimination — and all three are deleted because the act they
// measure cannot happen: nothing in the app can produce a `vote.set` of -1 any
// more. That is different from removing a rule we still want; the rules that
// remain are asserted below and must NOT have moved.

test('limits: removing the bury cool-off NARROWED the rule set, it did not weaken it', () => {
  // The phase's actual risk. A cool-off removal that also dropped the penalty
  // arithmetic, or loosened a cooldown, would look identical in a diff to one
  // that only removed the unreachable rule.
  const now = 1000;
  const spam = [1, 2, 3, 4, 5].map((i) => evAt('vote.set', now - i, { payload: { value: 1 } }));
  const withRecentPost = limits('u_x', [...spam, evAt('post.created', now - 10)], 0, false, now);
  assert.equal(withRecentPost.canPost, false, 'the post cooldown still bites');
  assert.equal(withRecentPost.postWaitSec, 290, 'and by exactly its own amount — no lingering penalty');
  const withRecentComment = limits('u_x', [...spam, evAt('comment.created', now - 10)], 0, false, now);
  assert.equal(withRecentComment.canComment, false, 'the comment cooldown still bites');
  assert.equal(withRecentComment.commentWaitSec, 50);
  // and boosting as fast as you like is not itself limited — it never was
  assert.equal(limits('u_x', spam, 0, false, now).canPost, true);
  assert.equal(limits('u_x', spam, 0, false, now).coolOff, undefined,
    'coolOff is not reported as false — the field is gone, because the concept is');
});

// ---- 2i gap-closers ----

test('rising: the two gates are independent — old-but-fast dies to AGE alone', () => {
  // 100 votes at 7h would pass the velocity gate (14.3/h): only the age gate kills it.
  assert.equal(rising(100, EPOCH, EPOCH + 7 * 3600), -Infinity);
  // and young-but-slow dies to VELOCITY alone. The old second half of this test
  // asserted that DOWNS counted toward velocity, which is not a repair case:
  // its subject is gone, so it is replaced by the other independence direction
  // rather than ported.
  assert.equal(rising(1, EPOCH, EPOCH + 3600), -Infinity);
});

test('sortItems: each sort key dispatches to ITS ranking (orders differ from hot)', () => {
  const now = EPOCH + 200000;
  // top vs hot: newer low-score beats older high-score on hot, reverses on top
  const t = [
    { id: 'lowNew', ups: 1, createdSec: EPOCH + 90000 },
    { id: 'highOld', ups: 100, createdSec: EPOCH },
  ];
  assert.deepStrictEqual(sortItems(t, 'hot', now).map((i) => i.id), ['lowNew', 'highOld']);
  assert.deepStrictEqual(sortItems(t, 'top', now).map((i) => i.id), ['highOld', 'lowNew']);
  // The controversial-vs-hot pair is gone with the sort. It carried a stated
  // property worth restating: input order differed from BOTH outputs, so a
  // comparator degraded to `undefined` (a stable no-op sort) died on it. With
  // two items and two sorts that disagree, one output must equal input order —
  // so that guard now comes from the OTHER sort in each pair below, and each
  // pair is ordered so at least one of them reverses it.
  // best vs top: Wilson favors volume over a single vote
  const b = [
    { id: 'one', ups: 1, createdSec: EPOCH },     // confidence .378
    { id: 'many', ups: 50, createdSec: EPOCH },   // confidence ~.96
  ];
  assert.deepStrictEqual(sortItems(b, 'best', now).map((i) => i.id), ['many', 'one']);
  assert.deepStrictEqual(sortItems(b, 'top', now).map((i) => i.id), ['many', 'one']);
  // rising vs hot: the old high-scorer is age-gated out of rising
  const r = [
    { id: 'slowNew', ups: 2, createdSec: now - 3600 },
    { id: 'fastOld', ups: 100, createdSec: now - 7 * 3600 },
  ];
  assert.deepStrictEqual(sortItems(r, 'hot', now).map((i) => i.id), ['fastOld', 'slowNew']);
  assert.deepStrictEqual(sortItems(r, 'rising', now).map((i) => i.id), ['slowNew', 'fastOld']);
});

test('humanWait: now / seconds / minutes', () => {
  assert.equal(humanWait(0), 'now');
  assert.equal(humanWait(59), '59s');
  assert.equal(humanWait(60), '1m');
  assert.equal(humanWait(61), '2m');
});
