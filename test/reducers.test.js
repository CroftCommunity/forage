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

test('report-actioned notification ts equals the resolving event ts (replay-stable)', () => {
  // 2a: resolveReports formerly stamped Date.now() — the one impurity in the fold.
  const s = fold(reportedLog());
  const actioned = s.notifications.u_a.find((n) => n.kind === 'report-actioned');
  assert.equal(actioned.ts, 310);
});

test('a log with report resolution folds identically twice (full determinism)', () => {
  const log = reportedLog();
  assert.deepStrictEqual(fold(log), fold(log));
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

// ---- 2i gap-closers: full-shape pins and the untested mutation types ----

test('post.created: exact default shape when optional fields are omitted', () => {
  const s = fold([
    ev('account.registered', { handle: 'a' }, 'u_a', 100),
    ev('field.created', { id: 'f1', slug: 'g', title: 'G' }, 'u_a', 110),
    ev('post.created', { id: 'p1', fieldId: 'f1', format: 'text', title: 'T' }, 'u_a', 120),
  ]);
  assert.deepStrictEqual(s.posts.p1, {
    id: 'p1', fieldId: 'f1', authorId: 'u_a', format: 'text',
    title: 'T', bodyMd: '', url: '', tagId: null,
    nsfw: false, spoiler: false, createdTs: 120,
    deleted: false, removed: false, removedReason: '', locked: false, pinned: false,
    held: false, edited: false,
  });
});

test('field.created: exact default shape, creator becomes steward and member', () => {
  const s = fold([ev('field.created', { id: 'f1', slug: 'g', title: 'G' }, 'u_a', 100)]);
  const f = s.fields.f1;
  assert.deepStrictEqual(f.settings, { requireTags: false, nsfwAllowed: true, automod: [], rules: [] });
  assert.equal(f.description, '');
  assert.equal(f.ownerId, 'u_a');
  assert.deepStrictEqual([...f.stewards], ['u_a']);
  assert.deepStrictEqual([...f.members], ['u_a']);
  assert.deepStrictEqual(f.banned, {});
  assert.equal(f.createdTs, 100);
});

test('account.registered defaults + prefs.updated merge + account.suspended', () => {
  const s = fold([
    ev('account.registered', { handle: 'a' }, 'u_a', 100),
    ev('prefs.updated', { patch: { theme: 'dark' } }, 'u_a', 110),
    ev('account.suspended', { userId: 'u_a', reason: 'spam' }, 'u_admin', 120),
  ]);
  assert.equal(s.users.u_a.email, '');
  assert.deepStrictEqual(s.users.u_a.prefs,
    { theme: 'dark', commentThreshold: -4, defaultSort: 'hot', defaultFeed: 'home' });
  assert.deepStrictEqual(s.users.u_a.suspended, { reason: 'spam', ts: 120 });
});

test('field.settingsUpdated routes title/description out of settings; field.left removes membership', () => {
  const s = fold([
    ev('account.registered', { handle: 'a' }, 'u_a', 100),
    ev('account.registered', { handle: 'b' }, 'u_b', 101),
    ev('field.created', { id: 'f1', slug: 'g', title: 'G' }, 'u_a', 110),
    ev('field.joined', { fieldId: 'f1' }, 'u_b', 120),
    ev('field.settingsUpdated', { fieldId: 'f1', patch: { title: 'G2', description: 'd', requireTags: true } }, 'u_a', 130),
    // a partial patch must not clobber the fields it omits
    ev('field.settingsUpdated', { fieldId: 'f1', patch: { nsfwAllowed: false } }, 'u_a', 135),
    ev('field.left', { fieldId: 'f1' }, 'u_b', 140),
  ]);
  const f = s.fields.f1;
  assert.equal(f.title, 'G2');
  assert.equal(f.description, 'd');
  assert.equal(f.settings.nsfwAllowed, false);
  assert.equal(f.settings.requireTags, true);
  assert.ok(!('title' in f.settings) && !('description' in f.settings));
  assert.ok(!f.members.has('u_b'));
});

test('edits patch and flag; author deletes mark deleted; save.set retracts', () => {
  const log = sampleLog();
  log.push(ev('post.edited', { postId: 'p1', patch: { title: 'New' } }, 'u_a', 300));
  log.push(ev('comment.edited', { commentId: 'c1', patch: { bodyMd: 'edited' } }, 'u_b', 310));
  log.push(ev('comment.deletedByAuthor', { commentId: 'c2' }, 'u_a', 320));
  log.push(ev('save.set', { subjectType: 'post', subjectId: 'p1', saved: false }, 'u_b', 330));
  const s = fold(log);
  assert.equal(s.posts.p1.title, 'New');
  assert.equal(s.posts.p1.edited, true);
  assert.equal(s.comments.c1.bodyMd, 'edited');
  assert.equal(s.comments.c1.edited, true);
  assert.equal(s.comments.c2.deleted, true);
  assert.ok(!s.saves.u_b.has('post:p1'));
});

test('report.filed: exact stored shape, optional fields defaulted', () => {
  const log = sampleLog();
  log.push(ev('report.filed', { id: 'r9', subjectType: 'post', subjectId: 'p1', fieldId: 'f1', reason: 'spam' }, 'u_b', 300));
  const [r] = fold(log).reports;
  assert.deepStrictEqual(r, {
    id: 'r9', subjectType: 'post', subjectId: 'p1', fieldId: 'f1', reason: 'spam',
    ruleId: null, detail: '', reporterId: 'u_b', ts: 300, resolvedBy: null, resolution: null,
  });
});

test('mod flags set and clear both ways; ban info stored and cleared; steward add/remove', () => {
  const log = sampleLog(); // ends with mod.locked on p1
  assert.equal(fold(log).posts.p1.locked, true);
  log.push(ev('mod.unlocked', { subjectType: 'post', subjectId: 'p1' }, 'u_a', 300));
  log.push(ev('mod.pinned', { subjectType: 'post', subjectId: 'p1' }, 'u_a', 310));
  let s = fold(log);
  assert.equal(s.posts.p1.locked, false);
  assert.equal(s.posts.p1.pinned, true);
  log.push(ev('mod.unpinned', { subjectType: 'post', subjectId: 'p1' }, 'u_a', 320));
  log.push(ev('mod.banned', { fieldId: 'f1', userId: 'u_b', reason: 'r', duration: 7 }, 'u_a', 330));
  log.push(ev('mod.stewardAdded', { fieldId: 'f1', userId: 'u_b' }, 'u_a', 340));
  s = fold(log);
  assert.equal(s.posts.p1.pinned, false);
  assert.deepStrictEqual(s.fields.f1.banned.u_b, { ts: 330, reason: 'r', duration: 7 });
  assert.ok(s.fields.f1.stewards.has('u_b'));
  log.push(ev('mod.banned', { fieldId: 'f1', userId: 'u_a' }, 'u_a', 350)); // defaults
  log.push(ev('mod.unbanned', { fieldId: 'f1', userId: 'u_b' }, 'u_a', 360));
  log.push(ev('mod.stewardRemoved', { fieldId: 'f1', userId: 'u_b' }, 'u_a', 370));
  s = fold(log);
  assert.deepStrictEqual(s.fields.f1.banned.u_a, { ts: 350, reason: '', duration: null });
  assert.equal(s.fields.f1.banned.u_b, undefined);
  assert.ok(!s.fields.f1.stewards.has('u_b'));
});

test('mod.removed on a POST notifies its author; self-moderation does not notify', () => {
  const log = sampleLog();
  log.push(ev('mod.removed', { subjectType: 'post', subjectId: 'p1', reason: 'x' }, 'u_b', 300));
  let s = fold(log);
  const n = s.notifications.u_a.find((x) => x.kind === 'removed');
  assert.equal(n.subjectId, 'p1');
  assert.equal(n.fromId, 'u_b');
  // self-mod: author removes their own — no notification
  const log2 = sampleLog();
  log2.push(ev('mod.removed', { subjectType: 'post', subjectId: 'p1', reason: 'x' }, 'u_a', 300));
  s = fold(log2);
  assert.ok(!s.notifications.u_a?.some((x) => x.kind === 'removed'));
});

test('resolveReports touches only matching, still-open reports', () => {
  const log = sampleLog();
  log.push(ev('report.filed', { id: 'r1', subjectType: 'comment', subjectId: 'c1', fieldId: 'f1', reason: 'a' }, 'u_a', 300));
  log.push(ev('report.filed', { id: 'r2', subjectType: 'comment', subjectId: 'c2', fieldId: 'f1', reason: 'b' }, 'u_a', 301));
  log.push(ev('mod.removed', { subjectType: 'comment', subjectId: 'c1' }, 'u_a', 310));
  log.push(ev('mod.approved', { subjectType: 'comment', subjectId: 'c1' }, 'u_b', 320)); // r1 already resolved
  const s = fold(log);
  const r1 = s.reports.find((r) => r.id === 'r1');
  const r2 = s.reports.find((r) => r.id === 'r2');
  assert.equal(r1.resolvedBy, 'u_a'); // the FIRST resolver sticks
  assert.equal(r1.resolution, 'removed');
  assert.equal(r2.resolvedBy, null); // different subject — untouched
});

test('comment.created: exact default shape', () => {
  const s = fold([
    ev('account.registered', { handle: 'a' }, 'u_a', 100),
    ev('field.created', { id: 'f1', slug: 'g', title: 'G' }, 'u_a', 105),
    ev('post.created', { id: 'p1', fieldId: 'f1', format: 'text', title: 'T' }, 'u_a', 110),
    ev('comment.created', { id: 'c1', postId: 'p1', bodyMd: 'B' }, 'u_a', 120),
  ]);
  assert.deepStrictEqual(s.comments.c1, {
    id: 'c1', postId: 'p1', parentId: null, authorId: 'u_a',
    bodyMd: 'B', createdTs: 120, deleted: false, removed: false,
    removedReason: '', edited: false,
  });
});

test('a fresh account carries the exact default prefs', () => {
  const s = fold([ev('account.registered', { handle: 'a' }, 'u_a', 100)]);
  assert.deepStrictEqual(s.users.u_a.prefs,
    { theme: 'auto', commentThreshold: -4, defaultSort: 'hot', defaultFeed: 'home' });
});

test('field.created merges caller-supplied settings over the defaults', () => {
  const s = fold([ev('field.created',
    { id: 'f1', slug: 'g', title: 'G', settings: { requireTags: true, rules: [{ title: 'r1' }] } }, 'u_a', 100)]);
  assert.deepStrictEqual(s.fields.f1.settings,
    { requireTags: true, nsfwAllowed: true, automod: [], rules: [{ title: 'r1' }] });
});

test('events referencing unknown targets are IGNORED, never a crash', () => {
  // Schema validates shape, not referential integrity — a dangling reference
  // must fold to a no-op (the guards exist for exactly this).
  const base = [ev('account.registered', { handle: 'a' }, 'u_a', 100)];
  const danglers = [
    ev('account.suspended', { userId: 'u_ghost', reason: 'x' }, 'u_a', 200),
    ev('prefs.updated', { patch: { theme: 'dark' } }, 'u_ghost', 201),
    ev('field.settingsUpdated', { fieldId: 'f_ghost', patch: { title: 'X' } }, 'u_a', 202),
    ev('field.joined', { fieldId: 'f_ghost' }, 'u_a', 203),
    ev('field.left', { fieldId: 'f_ghost' }, 'u_a', 204),
    ev('post.edited', { postId: 'p_ghost', patch: { title: 'X' } }, 'u_a', 205),
    ev('post.deletedByAuthor', { postId: 'p_ghost' }, 'u_a', 206),
    ev('comment.edited', { commentId: 'c_ghost', patch: { bodyMd: 'X' } }, 'u_a', 207),
    ev('comment.deletedByAuthor', { commentId: 'c_ghost' }, 'u_a', 208),
    ev('mod.banned', { fieldId: 'f_ghost', userId: 'u_a' }, 'u_a', 209),
    ev('mod.stewardAdded', { fieldId: 'f_ghost', userId: 'u_a' }, 'u_a', 210),
    ev('mod.removed', { subjectType: 'post', subjectId: 'p_ghost' }, 'u_a', 211),
    ev('mod.locked', { subjectType: 'comment', subjectId: 'c_ghost' }, 'u_a', 212),
  ];
  const s = fold([...base, ...danglers]);           // must not throw
  assert.deepStrictEqual(s.users, fold(base).users); // and must change nothing user-visible
  assert.deepStrictEqual(s.fields, {});
});

test('notification.read flips read on the named ids only', () => {
  const s = fold(sampleLog());
  const target = s.notifications.u_b[0];
  const after = reduce(s, ev('notification.read', { notificationIds: [target.id] }, 'u_b', 500));
  assert.equal(after.notifications.u_b.find((n) => n.id === target.id).read, true);
  assert.ok(after.notifications.u_a.every((n) => n.read === false));
});
