// Characterization: the ranking + limits engines as they behave TODAY
// (phase 1c). Pure functions — pinned on fixed inputs with boundary cases
// (window edges, factor thresholds, gates) so single-line mutations die.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hot, confidence, controversy, rising, sortItems } from '../js/engines/rank.js';
import {
  limits, humanWait,
  REP_FAST_THRESHOLD, RAPID_BURY_COUNT, RAPID_BURY_WINDOW, RAPID_BURY_PENALTY,
} from '../js/engines/limits.js';

const EPOCH = 1134028003; // reddit epoch, rank.js

// ---- hot ----

test('hot: measured pins — positive, negative, and zero score', () => {
  assert.equal(hot(10, 2, EPOCH + 45000), 1.90309);  // log10(8) + 45000/45000, round7
  assert.equal(hot(2, 10, EPOCH), -0.90309);          // sign flips the order term
  assert.equal(hot(3, 3, EPOCH), 0);                  // zero score -> log10(max(0,1)) = 0
});

test('hot: age moves rank even when the score is identical', () => {
  assert.ok(hot(5, 1, EPOCH + 90000) > hot(5, 1, EPOCH));
});

// ---- confidence (Wilson lower bound, z = 1.281551565545) ----

test('confidence: measured pins', () => {
  assert.equal(confidence(0, 0), 0); // no votes -> 0, not NaN
  assert.ok(Math.abs(confidence(1, 0) - 0.37844750322520615) < 1e-12);
  assert.ok(Math.abs(confidence(100, 0) - 0.9838416366736703) < 1e-12);
  assert.ok(Math.abs(confidence(3, 1) - 0.4325414503689865) < 1e-12);
});

test('confidence: more evidence at the same ratio raises the lower bound', () => {
  assert.ok(confidence(100, 0) > confidence(1, 0));
  assert.ok(confidence(30, 10) > confidence(3, 1));
});

// ---- controversy ----

test('controversy: zero when one-sided, magnitude^balance otherwise', () => {
  assert.equal(controversy(5, 0), 0);
  assert.equal(controversy(0, 5), 0);
  assert.equal(controversy(5, 5), 10);                              // 10^1
  assert.ok(Math.abs(controversy(8, 2) - 1.7782794100389228) < 1e-12); // 10^0.25
  assert.equal(controversy(2, 8), controversy(8, 2));               // balance is symmetric
});

// ---- rising: both gates at their exact edges ----

test('rising: age gate — exactly 6h passes, one second older is -Infinity', () => {
  assert.equal(rising(12, 0, EPOCH, EPOCH + 6 * 3600), 2.0010791812); // velocity 2 at 6h
  assert.equal(rising(12, 0, EPOCH, EPOCH + 6 * 3600 + 1), -Infinity);
});

test('rising: velocity gate — exactly 2 votes/hour passes, below is -Infinity', () => {
  const t = EPOCH;
  assert.ok(Number.isFinite(rising(2, 0, t, t + 3600)));  // velocity 2.0
  assert.equal(rising(1, 0, t, t + 3600), -Infinity);      // velocity 1.0
});

// ---- sortItems ----

test('sortItems: new is createdSec desc; top is net score desc', () => {
  const items = [
    { id: 'old', ups: 9, downs: 0, createdSec: EPOCH },
    { id: 'mid', ups: 1, downs: 5, createdSec: EPOCH + 100 },
    { id: 'new', ups: 3, downs: 1, createdSec: EPOCH + 200 },
  ];
  assert.deepStrictEqual(sortItems(items, 'new').map((i) => i.id), ['new', 'mid', 'old']);
  assert.deepStrictEqual(sortItems(items, 'top').map((i) => i.id), ['old', 'new', 'mid']);
  assert.deepStrictEqual(items.map((i) => i.id), ['old', 'mid', 'new']); // input not mutated
});

test('sortItems: unknown sort falls back to hot', () => {
  const items = [
    { id: 'a', ups: 0, downs: 5, createdSec: EPOCH },
    { id: 'b', ups: 5, downs: 0, createdSec: EPOCH },
  ];
  assert.deepStrictEqual(sortItems(items, 'nonsense').map((i) => i.id), ['b', 'a']);
});

// ---- limits: factor thresholds ----

const evAt = (type, sec, extra = {}) => ({ type, actor: 'u_x', ts: sec * 1000, payload: {}, ...extra });

test('limits: logged-out can do nothing, with words', () => {
  const l = limits(null, [], 0, false, 1000);
  assert.equal(l.canComment, false);
  assert.equal(l.canPost, false);
  assert.equal(l.reason, 'logged-out');
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

const bury = (sec) => evAt('vote.set', sec, { payload: { value: -1 } });

test('limits: rapid-bury cool-off at exactly 5 buries in the window; 4 does not trip', () => {
  const now = 1000;
  const five = [1, 2, 3, 4, 5].map((i) => bury(now - i));
  // a comment exactly at the normal free point (60s ago) stays blocked by the penalty
  const events = [evAt('comment.created', now - 60), ...five];
  const tripped = limits('u_x', events, 0, false, now);
  assert.equal(tripped.coolOff, true);
  assert.equal(tripped.canComment, false);
  assert.equal(tripped.commentWaitSec, RAPID_BURY_PENALTY); // 60 + 30 - 60
  const four = five.slice(0, RAPID_BURY_COUNT - 1);
  assert.equal(limits('u_x', four, 0, false, now).coolOff, false);
});

test('limits: bury window edge — a bury exactly 60s old counts, 61s does not', () => {
  const now = 1000;
  const fourRecent = [1, 2, 3, 4].map((i) => bury(now - i));
  const atEdge = limits('u_x', [...fourRecent, bury(now - RAPID_BURY_WINDOW)], 0, false, now);
  assert.equal(atEdge.coolOff, true);
  const pastEdge = limits('u_x', [...fourRecent, bury(now - RAPID_BURY_WINDOW - 1)], 0, false, now);
  assert.equal(pastEdge.coolOff, false);
});

test('humanWait: now / seconds / minutes', () => {
  assert.equal(humanWait(0), 'now');
  assert.equal(humanWait(59), '59s');
  assert.equal(humanWait(60), '1m');
  assert.equal(humanWait(61), '2m');
});
