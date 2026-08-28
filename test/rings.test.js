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
import { LADDER, RUNG_IDS, membersFor, OLD_MUTUALS_PLUS_ONE } from '../js/rings.js';
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

test('the ladder is ordered tightest-first and every rung is labelled', () => {
  assert.deepEqual(RUNG_IDS, ['me', 'mut', 'fol', 'hop', 'world']);
  for (const [id, label, desc] of LADDER) {
    assert.ok(RUNG_IDS.includes(id));
    assert.ok(label && typeof label === 'string', `${id} has a label`);
    assert.ok(desc && typeof desc === 'string', `${id} says what it means`);
  }
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
