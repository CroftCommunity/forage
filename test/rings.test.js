// The ring ladder, as sets.
//
// The dial shipped with four rings in the order world / following / mutuals /
// mutuals+1, and the owner's framing for the redesign was that each step out
// should be "inclusive of everything further up the ladder". Checking that
// against the existing rings is what found the defect: IT IS NOT TRUE, and
// cannot be made true by reordering, because `mutuals+1` (mutuals plus everyone
// THEY follow) does not contain `following` (everyone YOU follow). Someone you
// follow who follows nobody back, and whom none of your mutuals follow, drops
// out — so stepping "further out" from mutuals+1 to following would show you
// LESS.
//
// The fix is to define each rung as a cumulative union with the rung inside it,
// ordered by real containment. These tests are that property, plus the
// counterexample kept as an executable record of why the redefinition happened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNG_IDS, membersFor, OLD_MUTUALS_PLUS_ONE, SCOPES, byRank, scopeMembers } from '../js/rings.js';
import { RING_CAP } from '../js/substrates/lens.js';

// I follow A, B and C. Only A follows me back, so A is my only mutual.
// A follows X — and notably follows neither B nor C.
const GRAPH = {
  me: 'did:me',
  follows: ['did:A', 'did:B', 'did:C'],
  followers: ['did:A'],
  hopFollows: new Map([['did:A', ['did:X']]]),
};

test('the counterexample: the OLD mutuals+1 does not contain following', () => {
  const old = OLD_MUTUALS_PLUS_ONE(GRAPH);
  assert.ok(old.includes('did:A'), 'a mutual is in it');
  assert.ok(old.includes('did:X'), "a mutual's follow is in it");
  assert.ok(!old.includes('did:B'), 'but someone I follow is NOT');
  assert.ok(!old.includes('did:C'), 'nor this one');
  // Which is the whole point: "one step further out" showed you less.
  const following = GRAPH.follows;
  assert.ok(!following.every((d) => old.includes(d)),
    'old mutuals+1 is not a superset of following — the ladder metaphor was false');
});

test('every rung contains the rung inside it', () => {
  const sets = RUNG_IDS.filter((id) => id !== 'world')
    .map((id) => ({ id, members: membersFor(id, GRAPH).members }));
  for (let i = 1; i < sets.length; i++) {
    const inner = sets[i - 1], outer = sets[i];
    for (const did of inner.members) {
      assert.ok(outer.members.includes(did),
        `${outer.id} must contain everything in ${inner.id}, missing ${did}`);
    }
    assert.ok(outer.members.length >= inner.members.length, `${outer.id} is not smaller than ${inner.id}`);
  }
});

test('the rungs are the sets the ladder claims they are', () => {
  assert.deepEqual(membersFor('me', GRAPH).members, ['did:me']);
  assert.deepEqual(membersFor('mut', GRAPH).members, ['did:me', 'did:A']);
  assert.deepEqual(membersFor('fol', GRAPH).members, ['did:me', 'did:A', 'did:B', 'did:C']);
  assert.deepEqual(membersFor('hop', GRAPH).members, ['did:me', 'did:A', 'did:B', 'did:C', 'did:X']);
});

test('World is unsqueezed — it has no member list, which is not the same as an empty one', () => {
  assert.equal(membersFor('world', GRAPH).members, null,
    'null means "do not filter"; [] would mean "filter to nobody"');
});

test('an unknown rung is refused by name rather than silently treated as world', () => {
  assert.throws(() => membersFor('mutuals+1', GRAPH), /unknown rung/i,
    'the OLD ids are gone and asking for one is an error, not a fallback');
});

test('the hop rung caps with HONEST overflow — the true count, never silent', () => {
  const many = Array.from({ length: RING_CAP + 12 }, (_, i) => `did:h${i}`);
  const g = { me: 'did:me', follows: ['did:A'], followers: ['did:A'],
    hopFollows: new Map([['did:A', many]]) };
  const { members, overflow } = membersFor('hop', g);
  assert.equal(members.length, RING_CAP, 'drawn set is capped');
  assert.equal(overflow.capped, true);
  assert.equal(overflow.total, 2 + many.length, 'the PRE-cap total is reported, not the drawn one');
});

test('a tighter rung never caps — only the expensive one does', () => {
  const many = Array.from({ length: RING_CAP + 12 }, (_, i) => `did:f${i}`);
  const g = { me: 'did:me', follows: many, followers: many, hopFollows: new Map() };
  assert.equal(membersFor('fol', g).overflow, undefined, 'following is one call and is not capped');
  assert.equal(membersFor('fol', g).members.length, many.length + 1);
});

// ---- the scope registry (plan 2026-09-03: the ring as a display scope) ----
//
// The ladder becomes a REGISTRY because the pill's stops are the reader's to
// compose. Two things that were implicit in a frozen array have to become
// explicit the moment a reader can reorder it:
//
//   `rank` — containment position, which is what the pill sorts by. Taking the
//   order from the reader's stored list would re-open the exact defect the
//   redefinition above closed: "further out" showing you less.
//
//   capped vs uncapped — RING_CAP bounds a FAN-OUT (one author-feed request per
//   member) for the ring BOARD. A ring FILTER fetches nothing, so the cap there
//   would silently hide everyone past the 25th, which is the DL-016 class of
//   bug. Same ladder, two sets, and they must not be the same function.

test('every scope carries the fields the pill and the settings both need', () => {
  for (const s of SCOPES) {
    assert.ok(s.id && typeof s.id === 'string', 'has an id');
    assert.ok(s.label && typeof s.label === 'string', `${s.id} has a settings label`);
    assert.ok(s.pill && typeof s.pill === 'string', `${s.id} has a SHORT pill label`);
    assert.ok(s.blurb && typeof s.blurb === 'string', `${s.id} says what it means`);
    assert.equal(typeof s.rank, 'number', `${s.id} has a containment rank`);
    assert.ok(Array.isArray(s.needs), `${s.id} declares the graph reads it costs`);
  }
});

test('ranks are unique and ascend with containment', () => {
  const ranks = SCOPES.map((s) => s.rank);
  assert.deepEqual(ranks, [...new Set(ranks)], 'no two scopes share a rank');
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'the registry is stored tightest-first');
  assert.deepEqual(SCOPES.map((s) => s.id), ['me', 'mut', 'fol', 'hop', 'world']);
});

test('byRank sorts a reader-composed stop list into containment order', () => {
  // The reader dragged World into the middle. They do not get to invert
  // containment; they get their stops, in the only order that can be true.
  assert.deepEqual(byRank(['world', 'fol', 'mut']), ['mut', 'fol', 'world']);
  assert.deepEqual(byRank(['fol', 'mut', 'world']), ['mut', 'fol', 'world']);
  assert.deepEqual(byRank(['world']), ['world']);
  assert.deepEqual(byRank([]), []);
});

test('byRank drops ids that are not scopes rather than throwing', () => {
  // A stop list is READ FROM STORAGE, so it can name a scope a later version
  // retired. Refusing the whole pill because one entry went stale would take
  // the control away over a bookkeeping problem.
  assert.deepEqual(byRank(['fol', 'mutuals+1', 'world']), ['fol', 'world']);
});

test('scopeMembers is the FILTER set and is never capped', () => {
  const many = Array.from({ length: RING_CAP + 12 }, (_, i) => `did:h${i}`);
  const g = { me: 'did:me', follows: ['did:A'], followers: ['did:A'],
    hopFollows: new Map([['did:A', many]]) };
  const { members, overflow } = scopeMembers('hop', g);
  assert.equal(members.length, 2 + many.length, 'every member survives — a filter fans out nothing');
  assert.equal(overflow, undefined, 'and there is nothing to be honest about, because nothing was hidden');
  // The board's set is a DIFFERENT set, and still capped.
  assert.equal(membersFor('hop', g).members.length, RING_CAP);
});

test('scopeMembers agrees with membersFor wherever no cap bites', () => {
  for (const id of ['me', 'mut', 'fol', 'hop']) {
    assert.deepEqual(scopeMembers(id, GRAPH).members, membersFor(id, GRAPH).members,
      `${id}: the two sets differ only by the cap`);
  }
  assert.equal(scopeMembers('world', GRAPH).members, null, 'world does not filter');
});

test('scopeMembers refuses an unknown scope by name', () => {
  assert.throws(() => scopeMembers('following', GRAPH), /unknown rung/i);
});
