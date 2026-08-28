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
// "do not filter", which is not the same as `[]` — an empty list would mean
// "filter to nobody" and paint an empty board. The boundary at World is the
// composition itself (the feeds and hashtags you have assembled), not a set of
// people, which is why it cannot be expressed as one.

import { RING_CAP } from './substrates/lens.js';

// Tightest first. The ORDER is load-bearing: the containment test walks
// adjacent pairs, so a rung inserted in the wrong place fails rather than
// quietly widening the wrong step.
export const LADDER = Object.freeze([
  ['me',    'Just me',                  'only what I posted'],
  ['mut',   'My mutuals',               'people who follow me back'],
  ['fol',   'My follows',               'everyone I follow'],
  ['hop',   'My follows, one hop out',  'and everyone my mutuals follow'],
  ['world', 'World',                    'everything in your composition'],
]);
export const RUNG_IDS = Object.freeze(LADDER.map(([id]) => id));
export const labelFor = (id) => (LADDER.find(([r]) => r === id) || [])[1] || null;

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

export function membersFor(rung, graph) {
  if (rung === 'world') return { members: null };
  if (!RUNG_IDS.includes(rung)) {
    throw new Error(`lens: unknown rung: ${rung} (known: ${RUNG_IDS.join(', ')})`);
  }
  const all = chain(graph).get(rung);
  // Only the hop rung can run away: it is one getFollows per mutual. The cap
  // reports the TRUE pre-cap total, never the drawn one — a silently truncated
  // board is indistinguishable from a small ring (DL-016).
  if (rung === 'hop' && all.length > RING_CAP) {
    return { members: all.slice(0, RING_CAP), overflow: { capped: true, total: all.length } };
  }
  return { members: all };
}
