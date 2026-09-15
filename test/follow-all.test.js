// Follow all on a jumpstart — the pure core (plan 2026-09-14-plan-jumpstart-follow-all,
// Phase 0). No network here: planFollows decides WHO, chunk decides HOW MANY per
// call, followRecord decides WHAT is written. The counts on the confirm page come
// from planFollows; the applyWrites bodies come from chunk + followRecord.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFollows, planUnfollows, chunk, followRecord, CHUNK_SIZE } from '../js/follow-all.js';

const ME = 'did:plc:me';

// A list member as lens.listMembers() shapes it: viewer state folded into flags,
// posture already applied (`hidden`). A guest sees no viewer block at all, so
// every flag is false and followingUri is null.
function member(did, extra = {}) {
  return { did, handle: `${did.split(':').pop()}.test`, displayName: null, avatar: null,
    followingUri: null, blocked: false, muted: false, hidden: false, ...extra };
}

function stressList() {
  return [
    member(ME),                                                             // me
    member('did:plc:followed', { followingUri: 'at://did:plc:me/app.bsky.graph.follow/3aaa' }),
    member('did:plc:iblock', { blocked: true }),                            // I block them
    member('did:plc:blocksme', { blocked: true }),                          // they block me
    member('did:plc:muted', { muted: true }),
    member('did:plc:hidden', { hidden: true }),                             // posture hides
    member('did:plc:a'), member('did:plc:b'), member('did:plc:c'), member('did:plc:d'),
  ];
}

test('planFollows: the four plain members are followed; me, followed, blocked ×2, muted, hidden are skipped with reasons', () => {
  const plan = planFollows(stressList(), { myDid: ME });
  assert.deepEqual(plan.follow.map((m) => m.did), ['did:plc:a', 'did:plc:b', 'did:plc:c', 'did:plc:d']);
  assert.deepEqual(plan.skipped.map((s) => [s.member.did, s.reason]), [
    [ME, 'me'],
    ['did:plc:followed', 'following'],
    ['did:plc:iblock', 'blocked'],
    ['did:plc:blocksme', 'blocked'],
    ['did:plc:muted', 'muted'],
    ['did:plc:hidden', 'hidden'],
  ]);
  assert.deepEqual(plan.counts, { follow: 4, me: 1, following: 1, blocked: 2, muted: 1, hidden: 1 });
});

test('planFollows: a skip has ONE reason, in the official client\'s order — me, then following, then blocked, then muted, then hidden', () => {
  // a member that is every reason at once is counted once, under the first
  const everything = member('did:plc:all', { followingUri: 'at://x', blocked: true, muted: true, hidden: true });
  const plan = planFollows([member(ME, { muted: true }), everything], { myDid: ME });
  assert.deepEqual(plan.skipped.map((s) => s.reason), ['me', 'following']);
  assert.deepEqual(plan.counts, { follow: 0, me: 1, following: 1, blocked: 0, muted: 0, hidden: 0 });
});

test('planFollows: guest input (no viewer state anywhere) plans every member but me', () => {
  const guest = ['did:plc:x', 'did:plc:y', ME, 'did:plc:z'].map((d) => member(d));
  const plan = planFollows(guest, { myDid: null });
  assert.deepEqual(plan.follow.map((m) => m.did), ['did:plc:x', 'did:plc:y', ME, 'did:plc:z'], 'no session: nobody is "me"');
  const signedIn = planFollows(guest, { myDid: ME });
  assert.deepEqual(signedIn.follow.map((m) => m.did), ['did:plc:x', 'did:plc:y', 'did:plc:z']);
  assert.equal(signedIn.counts.me, 1);
});

test('planFollows: an empty list plans nothing and every count is zero', () => {
  assert.deepEqual(planFollows([], { myDid: ME }), {
    follow: [], skipped: [], counts: { follow: 0, me: 0, following: 0, blocked: 0, muted: 0, hidden: 0 },
  });
});

test('planFollows never mutates its input', () => {
  const list = stressList();
  const snapshot = JSON.stringify(list);
  planFollows(list, { myDid: ME });
  assert.equal(JSON.stringify(list), snapshot);
});

// D4 (owner, 2026-09-14): Unfollow all is the mirror — the list is the unit. Every
// member the viewer follows is unfollowed, whenever and wherever the follow was made;
// the uri comes from the list's own viewer state and nowhere else.
test('planUnfollows: every member with a followingUri is unfollowed, the rest are counted as not followed', () => {
  const list = stressList();
  const plan = planUnfollows(list);
  assert.deepEqual(plan.unfollow.map((m) => m.did), ['did:plc:followed']);
  assert.deepEqual(plan.unfollow.map((m) => m.followingUri), ['at://did:plc:me/app.bsky.graph.follow/3aaa']);
  assert.deepEqual(plan.counts, { unfollow: 1, notFollowed: 9 });
  // a hidden or blocked member I follow is STILL on the unfollow list — hiding is
  // about rendering; a follow record in my repo is a fact, and the mirror removes it
  const odd = [member('did:plc:h', { hidden: true, followingUri: 'at://did:plc:me/app.bsky.graph.follow/3h' }),
    member('did:plc:m', { muted: true, followingUri: 'at://did:plc:me/app.bsky.graph.follow/3m' })];
  assert.deepEqual(planUnfollows(odd).unfollow.map((m) => m.did), ['did:plc:h', 'did:plc:m']);
  assert.deepEqual(planUnfollows([]), { unfollow: [], counts: { unfollow: 0, notFollowed: 0 } });
});

test('chunk: the official client\'s 50 per applyWrites call — 0, 1, 50, 51 and 150 members', () => {
  assert.equal(CHUNK_SIZE, 50);
  const ids = (n) => Array.from({ length: n }, (_, i) => `did:plc:${i}`);
  assert.deepEqual(chunk(ids(0)), []);
  assert.deepEqual(chunk(ids(1)), [['did:plc:0']]);
  assert.equal(chunk(ids(50)).length, 1);
  assert.equal(chunk(ids(50))[0].length, 50);
  const c51 = chunk(ids(51));
  assert.deepEqual(c51.map((c) => c.length), [50, 1]);
  assert.equal(c51[1][0], 'did:plc:50');
  assert.deepEqual(chunk(ids(150)).map((c) => c.length), [50, 50, 50]);
  assert.deepEqual(chunk(ids(150)).flat(), ids(150), 'order is preserved and nothing is dropped');
  assert.deepEqual(chunk(ids(5), 2).map((c) => c.length), [2, 2, 1], 'the size is a parameter, pinned by default');
});

test('followRecord: { $type, subject, createdAt, via } and nothing else — via is the jumpstart\'s strongRef (D2)', () => {
  const via = { uri: 'at://did:plc:curator/app.bsky.graph.starterpack/3sp', cid: 'bafysp' };
  const rec = followRecord({ did: 'did:plc:a', via, now: '2026-09-14T12:00:00.000Z' });
  assert.deepEqual(rec, {
    $type: 'app.bsky.graph.follow', subject: 'did:plc:a', createdAt: '2026-09-14T12:00:00.000Z', via,
  });
  assert.deepEqual(Object.keys(rec), ['$type', 'subject', 'createdAt', 'via']);
  // via is a strongRef: both halves or the record is refused before it reaches a PDS
  assert.throws(() => followRecord({ did: 'did:plc:a', via: { uri: via.uri }, now: '2026-09-14T12:00:00.000Z' }), /via.*cid|cid.*via/i);
  assert.throws(() => followRecord({ did: 'did:plc:a', via: null, now: '2026-09-14T12:00:00.000Z' }), /via/i);
  assert.throws(() => followRecord({ did: 'not-a-did', via, now: '2026-09-14T12:00:00.000Z' }), /did/i);
});
