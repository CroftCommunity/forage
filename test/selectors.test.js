// Characterization: the selector policy layer as it behaves TODAY (phase 1c).
// Permissions for all 9 seats (grants AND denials), masking both ways,
// thread depth at its boundary, auto-collapse at its threshold.
// Selectors still call Date.now()/store internally (phase-2 target) — these
// tests pin relative behavior only, so they survive the `now` threading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, reduce } from '../js/reducers.js';
import { permissions, feed, thread, field, notifications } from '../js/selectors.js';

let seq = 0;
const ev = (type, payload, actor, ts = 1000 + seq) => ({ id: `t_${seq++}`, type, actor, ts, payload });
const fold = (events) => events.reduce((s, e) => reduce(s, e), emptyState());

function baseLog() {
  const users = ['u_wren', 'u_sage', 'u_briar', 'u_fern', 'u_moss', 'u_thorn', 'u_aspen', 'u_dove'];
  const log = users.map((id) => ev('account.registered', { handle: id.slice(2) }, id));
  log.push(ev('field.created', { id: 'f1', slug: 'gardening', title: 'Gardening' }, 'u_sage'));
  log.push(ev('mod.stewardAdded', { fieldId: 'f1', userId: 'u_briar' }, 'u_sage'));
  for (const id of ['u_fern', 'u_moss', 'u_thorn', 'u_aspen']) log.push(ev('field.joined', { fieldId: 'f1' }, id));
  log.push(ev('mod.banned', { fieldId: 'f1', userId: 'u_thorn', reason: 'rule 1' }, 'u_briar'));
  // aspen's high-rep post: 500 synthetic boosts (the sv_N pattern the seed uses)
  log.push(ev('post.created', { id: 'p_aspen', fieldId: 'f1', format: 'text', title: 'Aspen post' }, 'u_aspen'));
  for (let i = 0; i < 500; i++) log.push(ev('vote.set', { subjectType: 'post', subjectId: 'p_aspen', value: 1 }, `sv_${i}`));
  return log;
}

// ---- permissions: the 9-seat matrix, grants and denials ----

test('logged-out: view-only, every write gate closed', () => {
  const p = permissions(fold(baseLog()), null, 'f1');
  assert.equal(p.canView, true);
  assert.equal(p.loggedIn, false);
  for (const k of ['canVote', 'canComment', 'canPost', 'canReport', 'canCreateField', 'canModerate', 'canManageField']) {
    assert.equal(p[k], false, k);
  }
});

test('admin.wren: moderates and manages everywhere, can suspend and close', () => {
  const p = permissions(fold(baseLog()), 'u_wren', 'f1');
  assert.equal(p.admin, true);
  assert.equal(p.canModerate, true);
  assert.equal(p.canManageField, true);
  assert.equal(p.canSuspendAccount, true);
  assert.equal(p.canCloseField, true);
});

test('owner.sage: owns and stewards gardening', () => {
  const p = permissions(fold(baseLog()), 'u_sage', 'f1');
  assert.equal(p.isOwner, true);
  assert.equal(p.isSteward, true);
  assert.equal(p.canManageField, true);
  assert.equal(p.admin, false);
});

test('steward.briar: moderates but does not manage', () => {
  const p = permissions(fold(baseLog()), 'u_briar', 'f1');
  assert.equal(p.isSteward, true);
  assert.equal(p.canModerate, true);
  assert.equal(p.isOwner, false);
  assert.equal(p.canManageField, false);
  assert.equal(p.canSuspendAccount, false);
});

test('member.fern: full participation, no mod powers, weight 1', () => {
  const p = permissions(fold(baseLog()), 'u_fern', 'f1');
  for (const k of ['canVote', 'canComment', 'canPost', 'canReport', 'canCreateField']) assert.equal(p[k], true, k);
  assert.equal(p.canModerate, false);
  assert.equal(p.reportWeight, 1);
});

test('newbie.moss: probation blocks field creation, discounts reports, allows posting', () => {
  const p = permissions(fold(baseLog()), 'u_moss', 'f1');
  assert.equal(p.probation, true);
  assert.equal(p.canCreateField, false);
  assert.equal(p.reportWeight, 0.3);
  assert.equal(p.canPost, true);
});

test('banned.thorn: banned here — no participation, can still view and report', () => {
  const p = permissions(fold(baseLog()), 'u_thorn', 'f1');
  assert.equal(p.bannedHere, true);
  assert.ok(p.banInfo);
  for (const k of ['canVote', 'canComment', 'canPost']) assert.equal(p[k], false, k);
  assert.equal(p.canView, true);
  assert.equal(p.canReport, true);
});

test('heavy.aspen: rep at the threshold doubles report weight', () => {
  const p = permissions(fold(baseLog()), 'u_aspen', 'f1');
  assert.equal(p.reportWeight, 2);
  assert.equal(p.canCreateField, true);
});

test('pristine.dove: plain defaults, nothing special granted', () => {
  const p = permissions(fold(baseLog()), 'u_dove', 'f1');
  assert.equal(p.loggedIn, true);
  assert.equal(p.probation, false);
  assert.equal(p.canModerate, false);
  assert.equal(p.reportWeight, 1);
});

// ---- feed visibility masking, both directions ----

function maskingLog() {
  const log = baseLog();
  log.push(ev('post.created', { id: 'p_norm', fieldId: 'f1', format: 'text', title: 'Normal' }, 'u_fern'));
  log.push(ev('post.created', { id: 'p_del', fieldId: 'f1', format: 'text', title: 'Gone' }, 'u_fern'));
  log.push(ev('post.deletedByAuthor', { postId: 'p_del' }, 'u_fern'));
  log.push(ev('post.created', { id: 'p_rem', fieldId: 'f1', format: 'text', title: 'Spam', bodyMd: 'buy' }, 'u_aspen'));
  log.push(ev('mod.removed', { subjectType: 'post', subjectId: 'p_rem', reason: 'rule 2' }, 'u_briar'));
  log.push(ev('post.created', { id: 'p_held', fieldId: 'f1', format: 'text', title: 'Held', held: true }, 'u_fern'));
  return log;
}

test('feed: a plain member sees neither deleted, removed, nor held posts', () => {
  const ids = feed(fold(maskingLog()), 'u_fern', 'field:gardening').posts.map((p) => p.id);
  assert.ok(ids.includes('p_norm'));
  assert.ok(ids.includes('p_aspen'));
  assert.ok(!ids.includes('p_del'));
  assert.ok(!ids.includes('p_rem'));
  assert.ok(!ids.includes('p_held'));
});

test('feed: a steward sees removed and held, but never deleted', () => {
  const ids = feed(fold(maskingLog()), 'u_briar', 'field:gardening').posts.map((p) => p.id);
  assert.ok(ids.includes('p_rem'));
  assert.ok(ids.includes('p_held'));
  assert.ok(!ids.includes('p_del'));
});

test('feed: home scope is membership-driven', () => {
  const s = fold(maskingLog());
  assert.ok(feed(s, 'u_fern', 'home').posts.length > 0);
  assert.equal(feed(s, 'u_dove', 'home').posts.length, 0); // dove joined nothing
});

test('thread: a removed post masks for members and shows for its author', () => {
  const s = fold(maskingLog());
  const masked = thread(s, 'u_fern', 'p_rem').post;
  assert.equal(masked.maskedRemoved, true);
  assert.equal(masked.title, '[removed by stewards]');
  assert.equal(masked.authorId, null);
  const own = thread(s, 'u_aspen', 'p_rem').post;
  assert.equal(own.title, 'Spam');
  assert.equal(own.removedReason, 'rule 2');
});

// ---- thread depth boundary ----

test('thread: children render to depth 10; depth-10 nodes defer their subtree', () => {
  const log = maskingLog();
  for (let d = 0; d <= 11; d++) {
    log.push(ev('comment.created',
      { id: `c${d}`, postId: 'p_norm', parentId: d === 0 ? null : `c${d - 1}`, bodyMd: `depth ${d}` }, 'u_fern'));
  }
  const t = thread(fold(log), 'u_fern', 'p_norm');
  let node = t.comments.find((c) => c.id === 'c0');
  for (let d = 0; d < 10; d++) {
    assert.equal(node.depth, d);
    assert.equal(node.children.length, 1, `depth ${d} keeps its child`);
    node = node.children[0];
  }
  assert.equal(node.depth, 10);
  assert.equal(node.children.length, 0);   // depth >= 10: subtree cut...
  assert.equal(node.deferred, 1);          // ...and surfaced as "continue this thread"
});

// ---- auto-collapse threshold boundary ----

test('thread: score -4 stays open, -5 auto-collapses (threshold is strict <)', () => {
  const log = maskingLog();
  log.push(ev('comment.created', { id: 'c_at', postId: 'p_norm', bodyMd: 'at threshold', quiet: true }, 'u_aspen'));
  log.push(ev('comment.created', { id: 'c_under', postId: 'p_norm', bodyMd: 'under it', quiet: true }, 'u_aspen'));
  for (let i = 0; i < 4; i++) log.push(ev('vote.set', { subjectType: 'comment', subjectId: 'c_at', value: -1 }, `sv_${i}`));
  for (let i = 0; i < 5; i++) log.push(ev('vote.set', { subjectType: 'comment', subjectId: 'c_under', value: -1 }, `sv_${i}`));
  const t = thread(fold(log), 'u_fern', 'p_norm');
  assert.equal(t.comments.find((c) => c.id === 'c_at').autoCollapsed, false);
  assert.equal(t.comments.find((c) => c.id === 'c_under').autoCollapsed, true);
});

// ---- field + notifications shape ----

test('field: membership, stewards, and joined flag resolve', () => {
  const f = field(fold(baseLog()), 'u_fern', 'gardening');
  assert.equal(f.memberCount, 5); // sage (creator) + fern/moss/thorn/aspen; stewardAdded is not a join
  assert.equal(f.owner, 'sage');
  assert.ok(f.stewards.includes('briar'));
  assert.equal(f.joined, true);
  assert.equal(field(fold(baseLog()), 'u_dove', 'gardening').joined, false);
});

test('notifications: logged-out gets the empty shape', () => {
  assert.deepStrictEqual(notifications(fold(baseLog()), null), { items: [], unread: 0 });
});
