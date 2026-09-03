// The ring ladder, as sets. Pure — no session, no network, no clock.
//
// WHY THIS IS A REDEFINITION AND NOT A RENAME. The dial shipped four rings:
// world, following, mutuals, mutuals+1. The owner's framing for the redesign
// was that each step out should be "inclusive of everything further up the
// ladder", and checking that against the shipped rings is what found the bug:
// it is false and no reordering fixes it. `mutuals+1` is your mutuals plus
// everyone THEY follow, which does not contain everyone YOU follow — someone
// you follow who follows nobody back, and whom none of your mutuals follow,
// simply is not in it. So "one step further out" could show you LESS, which is
// the one thing a ladder must never do. test/rings.test.js keeps that
// counterexample executable, which is why OLD_MUTUALS_PLUS_ONE is exported
// from here rather than deleted.
//
// The fix: every rung is a cumulative union with the rung inside it, and the
// order is real containment rather than an intuition about closeness. Written
// as an explicit chain — each rung takes the previous set and adds to it — so
// the property the tests assert is the same property the code has, rather than
// something a reader has to re-derive from four independent definitions.
//
// World is the odd one and deliberately so: it has NO member list. `null` means
// "the ring does not narrow" — NOT "nothing is filtered". Blocks, mutes, muted
// words and label prefs all still apply at World (owner, 2026-09-03: "still
// blocks, moderation etc, just not ring filtered"); World is the last policy in
// the order going quiet, not all of them. And it is not the same as `[]` — an
// empty list would mean "narrow to nobody" and paint an empty board. The
// boundary at World is the composition itself (the feeds and hashtags you have
// assembled), not a set of people, which is why it cannot be expressed as one.

import { RING_CAP } from './substrates/lens.js';

// ---- the registry ----
//
// This was a frozen array of [id, label, description] tuples. It became a
// registry of objects when the ring stopped being five BOARDS and became one
// composable display scope (plan 2026-09-03), because two things that a fixed
// array could leave implicit stop being implicit the moment the READER composes
// the list:
//
//   `rank` is the containment position, and it is load-bearing. The pill sorts
//   its stops by rank and never by the order they are stored in. A reader has no
//   reason to know that "further out must contain everything nearer in" — it is
//   the invariant the comment above spent a paragraph earning — so the code
//   holds it rather than asking. Reordering your stops is allowed and does
//   nothing, which is the point.
//
//   `needs` names the graph reads a scope costs, so the substrate can fetch what
//   the SELECTED scope requires instead of everything the ladder could ask for.
//   Only `hop` costs a per-mutual fan-out, and it is the only entry that is not
//   in the default stop list.
//
// `label` is the settings/nav wording and `pill` is the short one, because a
// four-segment pill at a 44px tap floor is 176px before any text lands, and
// "My follows, one hop out" does not fit on a 390px phone.
//
// Tightest first. The ORDER of this array is the containment chain: the
// containment test walks adjacent pairs, so an entry in the wrong place fails
// rather than quietly widening the wrong step.
export const SCOPES = Object.freeze([
  { id: 'me',    rank: 0, pill: 'Me',      label: 'Just me',
    blurb: 'only what I posted',                needs: Object.freeze([]) },
  { id: 'mut',   rank: 1, pill: 'Mutuals', label: 'My mutuals',
    blurb: 'people who follow me back',         needs: Object.freeze(['follows', 'followers']) },
  { id: 'fol',   rank: 2, pill: 'Follows', label: 'My follows',
    blurb: 'everyone I follow',                 needs: Object.freeze(['follows', 'followers']) },
  { id: 'hop',   rank: 3, pill: '+1',      label: 'My follows, one hop out',
    blurb: 'and everyone my mutuals follow',    needs: Object.freeze(['follows', 'followers', 'hopFollows']) },
  { id: 'world', rank: 4, pill: 'World',   label: 'World',
    blurb: 'everything in your composition',    needs: Object.freeze([]) },
].map(Object.freeze));

export const RUNG_IDS = Object.freeze(SCOPES.map((s) => s.id));
export const scopeFor = (id) => SCOPES.find((s) => s.id === id) || null;
export const labelFor = (id) => scopeFor(id)?.label || null;

// A reader's stop list, in the only order that can be true. Unknown ids are
// DROPPED rather than thrown on: this list is read from storage, so it can name
// a scope a later version retired, and taking the whole control away over one
// stale entry is a worse answer than showing the stops that still exist.
// Duplicates collapse for the same reason.
export function byRank(ids) {
  return [...new Set(ids || [])]
    .map(scopeFor)
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .map((s) => s.id);
}

// Pure: follows ∩ followers, in follows order. (Same rule as the lens's own
// computeMutuals; kept here so this module needs nothing from the substrate
// but the cap.)
const mutualsOf = ({ follows, followers }) => {
  const fans = new Set(followers);
  return follows.filter((did) => fans.has(did));
};

// The shipped definition, preserved ONLY so the counterexample stays runnable.
// Nothing in the app calls this.
export const OLD_MUTUALS_PLUS_ONE = (graph) => {
  const seen = new Set(mutualsOf(graph));
  for (const m of mutualsOf(graph)) for (const did of graph.hopFollows?.get(m) || []) seen.add(did);
  return [...seen];
};

// Each rung ADDS to the one inside it. A Set keeps the union honest about
// duplicates while insertion order keeps the result stable for assertions and
// for a deterministic board.
function chain(graph) {
  const out = new Map();
  const add = (id, dids) => {
    const prev = out.size ? [...out.values()][out.size - 1] : [];
    const set = new Set(prev);
    for (const d of dids) set.add(d);
    out.set(id, [...set]);
    return out.get(id);
  };
  add('me', [graph.me]);
  add('mut', mutualsOf(graph));
  add('fol', graph.follows);
  add('hop', mutualsOf(graph).flatMap((m) => graph.hopFollows?.get(m) || []));
  return out;
}

// The cumulative set for a rung, or null for World. Throws on an unknown id —
// the two exported wrappers below differ ONLY in what they do about cost.
function chainSet(rung, graph) {
  if (rung === 'world') return null;
  if (!RUNG_IDS.includes(rung)) {
    throw new Error(`lens: unknown rung: ${rung} (known: ${RUNG_IDS.join(', ')})`);
  }
  return chain(graph).get(rung);
}

// The FILTER set: every member, always. Used by the display scope, which tests
// authorship on posts it already has and therefore fans out nothing.
//
// WHY THIS IS NOT membersFor. RING_CAP bounds a FAN-OUT — the ring board issues
// one author-feed request per member, and 25 was measured as the bound on that.
// Filtering issues zero requests, so applying the cap here would buy nothing and
// cost everything: a reader with 300 follows would silently stop seeing 275 of
// them, and a silently truncated ring is indistinguishable from a small one
// (DL-016). The two uses need two sets, which is why they are two functions
// rather than one with a flag.
export function scopeMembers(rung, graph) {
  return { members: chainSet(rung, graph) };
}

// The BOARD set: capped, with honest overflow. One author-feed request per
// member is the cost this bounds.
export function membersFor(rung, graph) {
  const all = chainSet(rung, graph);
  if (all === null) return { members: null };
  // Only the hop rung can run away: it is one getFollows per mutual. The cap
  // reports the TRUE pre-cap total, never the drawn one — a silently truncated
  // board is indistinguishable from a small ring (DL-016).
  if (rung === 'hop' && all.length > RING_CAP) {
    return { members: all.slice(0, RING_CAP), overflow: { capped: true, total: all.length } };
  }
  return { members: all };
}
