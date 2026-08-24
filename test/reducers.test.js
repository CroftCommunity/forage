// Characterization: the fold as it behaves TODAY (phase 1b).
// State is a pure fold over the event log; these tests pin determinism,
// derived tallies/reputation, and the moderation pipeline. The one known
// nondeterminism (report-actioned notification ts = Date.now(),
// reducers.js resolveReports) is pinned as a `todo` — phase 2a's target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, reduce, tally, myVote, reputation } from '../js/reducers.js';

const fold = (events) => events.reduce((s, e) => reduce(s, e), emptyState());
let seq = 0;
const ev = (type, payload, actor, ts) => ({ id: `t_${seq++}`, type, actor, ts, payload });

// A log touching users, fields, posts, comments, votes, saves, and a
// benign mod event — deliberately NO report.filed/mod.removed pair, whose
// notification ts is wall-clock today (see the todo at the bottom).
function sampleLog() {
  return [
    ev('account.registered', { handle: 'alice' }, 'u_a', 100),
    ev('account.registered', { handle: 'bob' }, 'u_b', 110),
    ev('field.created', { id: 'f1', slug: 'gardening', title: 'Gardening' }, 'u_a', 120),
    ev('field.joined', { fieldId: 'f1' }, 'u_b', 130),
    ev('post.created', { id: 'p1', fieldId: 'f1', format: 'text', title: 'Hello' }, 'u_a', 140),
    ev('comment.created', { id: 'c1', postId: 'p1', bodyMd: 'First' }, 'u_b', 150),
    ev('comment.created', { id: 'c2', postId: 'p1', parentId: 'c1', bodyMd: 'Reply' }, 'u_a', 160),
    ev('vote.set', { subjectType: 'post', subjectId: 'p1', value: 1 }, 'u_b', 170),
    ev('vote.set', { subjectType: 'comment', subjectId: 'c1', value: -1 }, 'u_a', 180),
    ev('save.set', { subjectType: 'post', subjectId: 'p1', saved: true }, 'u_b', 190),
    ev('mod.locked', { subjectType: 'post', subjectId: 'p1' }, 'u_a', 200),
  ];
}

// ---- determinism ----

test('folding the same log twice yields deep-equal state', () => {
  const log = sampleLog();
  assert.deepStrictEqual(fold(log), fold(log));
});

test('the fold reads event ts, never the wall clock (log without report resolution)', () => {
  const s = fold(sampleLog());
  assert.equal(s.users.u_a.registeredTs, 100);
  assert.equal(s.posts.p1.createdTs, 140);
  assert.equal(s.comments.c1.createdTs, 150);
  // reply notifications carry the triggering event's ts
  const [toB] = s.notifications.u_b.filter((n) => n.kind === 'reply');
  assert.equal(toB.ts, 160);
});

// ---- derived: tally / myVote / reputation ----

test('tally counts ups, downs, and net score', () => {
  const s = fold(sampleLog());
  assert.deepStrictEqual(tally(s, 'post', 'p1'), { ups: 1, downs: 0, score: 1 });
  assert.deepStrictEqual(tally(s, 'comment', 'c1'), { ups: 0, downs: 1, score: -1 });
});

test('a re-vote overwrites; vote 0 retracts', () => {
  const log = sampleLog();
  log.push(ev('vote.set', { subjectType: 'post', subjectId: 'p1', value: -1 }, 'u_b', 210));
  assert.deepStrictEqual(tally(fold(log), 'post', 'p1'), { ups: 0, downs: 1, score: -1 });
  log.push(ev('vote.set', { subjectType: 'post', subjectId: 'p1', value: 0 }, 'u_b', 220));
  assert.deepStrictEqual(tally(fold(log), 'post', 'p1'), { ups: 0, downs: 0, score: 0 });
});

test('myVote: the viewer sees their own vote; logged-out sees 0', () => {
  const s = fold(sampleLog());
  assert.equal(myVote(s, 'u_b', 'post', 'p1'), 1);
  assert.equal(myVote(s, 'u_a', 'post', 'p1'), 0);
  assert.equal(myVote(s, null, 'post', 'p1'), 0);
});

test('reputation sums net scores of non-removed content only', () => {
  const log = sampleLog();
  // alice: p1 (+1), c2 (no votes); bob: c1 (-1, cast by alice)
  assert.deepStrictEqual(reputation(fold(log), 'u_a'), { post: 1, comment: 0, total: 1 });
  assert.deepStrictEqual(reputation(fold(log), 'u_b'), { post: 0, comment: -1, total: -1 });
  log.push(ev('mod.removed', { subjectType: 'post', subjectId: 'p1' }, 'u_a', 230));
  assert.deepStrictEqual(reputation(fold(log), 'u_a'), { post: 0, comment: 0, total: 0 });
});

// ---- moderation pipeline ----

function reportedLog() {
  const log = sampleLog();
  log.push(ev('report.filed', { id: 'r1', subjectType: 'comment', subjectId: 'c1', fieldId: 'f1', reason: 'spam' }, 'u_a', 300));
  log.push(ev('mod.removed', { subjectType: 'comment', subjectId: 'c1', reason: 'rule 2' }, 'u_a', 310));
  return log;
}

test('mod.removed masks the subject, resolves open reports, notifies the author', () => {
  const s = fold(reportedLog());
  assert.equal(s.comments.c1.removed, true);
  assert.equal(s.comments.c1.removedReason, 'rule 2');
  const [r] = s.reports;
  assert.equal(r.resolvedBy, 'u_a');
  assert.equal(r.resolution, 'removed');
  const removal = s.notifications.u_b.find((n) => n.kind === 'removed');
  assert.equal(removal.ts, 310); // author notification uses the event ts
});

test('every mod.* event lands in the audit log verbatim', () => {
  const s = fold(reportedLog());
  assert.equal(s.audit.length, 2); // mod.locked + mod.removed
  assert.deepStrictEqual(s.audit.map((e) => e.type), ['mod.locked', 'mod.removed']);
});

test('CURRENT: the report-actioned notification ts is wall-clock (nondeterministic)', () => {
  // resolveReports stamps Date.now() — the one impurity in the fold.
  const s = fold(reportedLog());
  const actioned = s.notifications.u_a.find((n) => n.kind === 'report-actioned');
  assert.equal(typeof actioned.ts, 'number');
  assert.ok(actioned.ts > 1_000_000); // wall-clock scale, not the log's toy ts values
});

test('2a target: report-actioned notification ts equals the resolving event ts', { todo: true }, () => {
  const s = fold(reportedLog());
  const actioned = s.notifications.u_a.find((n) => n.kind === 'report-actioned');
  assert.equal(actioned.ts, 310);
});

// ---- reply notifications ----

test('top-level comment notifies the post author; nested reply notifies the parent author', () => {
  const s = fold(sampleLog());
  const postReply = s.notifications.u_a.find((n) => n.kind === 'post-reply');
  assert.equal(postReply.subjectId, 'c1'); // bob's top-level comment -> alice
  const reply = s.notifications.u_b.find((n) => n.kind === 'reply');
  assert.equal(reply.subjectId, 'c2'); // alice's nested reply -> bob
});

test('self-replies and quiet comments do not notify', () => {
  const log = sampleLog();
  log.push(ev('comment.created', { id: 'c3', postId: 'p1', parentId: 'c2', bodyMd: 'self' }, 'u_a', 400));
  log.push(ev('comment.created', { id: 'c4', postId: 'p1', bodyMd: 'bulk', quiet: true }, 'u_b', 410));
  const s = fold(log);
  assert.ok(!s.notifications.u_a.some((n) => n.subjectId === 'c3' || n.subjectId === 'c4'));
});

test('notification.read flips read on the named ids only', () => {
  const s = fold(sampleLog());
  const target = s.notifications.u_b[0];
  const after = reduce(s, ev('notification.read', { notificationIds: [target.id] }, 'u_b', 500));
  assert.equal(after.notifications.u_b.find((n) => n.id === target.id).read, true);
  assert.ok(after.notifications.u_a.every((n) => n.read === false));
});
