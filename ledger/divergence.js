// The divergence ledger (BSM §7, Appendix B). One list, three kinds:
//   frontier  — a path deliberately deferred; renders as a dashed chip and at
//               #/frontiers (invariant 7: deferring and registering are one commit)
//   proposal  — behavior one tier wants that the contract doesn't bless yet
//   tolerance — a named, bounded way two substrates/engine-variants may differ
//               and still pass conformance (invariant 9)
// The conformance harness refuses any observable difference not covered by an
// ACTIVE tolerance here. Adding an entry is a reviewed, committed act — that
// is the point: drift is either refused or documented, never silent.

export const LEDGER = [
  // ---- frontiers (js/frontier.js folded in, 2026-08-24) ----
  { id: 'DL-001', kind: 'frontier', capability: 'posting', label: 'Media upload',
    description: 'Post format tab is present but locked. Storage budget decision deferred; text and link posts only in v1.' },
  { id: 'DL-002', kind: 'frontier', capability: 'search', label: 'Search facets',
    description: 'Beyond the type filter (post/comment). Field, author, date facets require the scaled side.' },
  { id: 'DL-003', kind: 'frontier', capability: 'feeds', label: 'Custom multi-Field feeds',
    description: 'Build spec §13 deferred this. Saved feed compositions arrive with the api substrate.' },
  { id: 'DL-004', kind: 'frontier', capability: 'moderation', label: 'Metamoderation-style steward review',
    description: 'Deferred in build spec §10.4. Community review of steward actions needs the scaled side.' },
  { id: 'DL-005', kind: 'frontier', capability: 'moderation', label: 'Vote-ring detection',
    description: 'Build spec §11 out-of-scope list. Requires the scaled side.' },
  { id: 'DL-006', kind: 'frontier', capability: 'moderation', label: 'IP reputation',
    description: 'Build spec §11 out-of-scope list. Requires the scaled side.' },
  { id: 'DL-007', kind: 'frontier', capability: 'moderation', label: 'ML spam filtering',
    description: 'Build spec §11 out-of-scope list. Requires the scaled side.' },

  // ---- tolerances ----
  { id: 'DL-008', kind: 'tolerance', capability: 'feed-ranking',
    appliesTo: { probe: 'feedIds' },
    description: 'Feed ORDER may differ between ranking-engine variants or substrates; MEMBERSHIP may not.',
    reason: 'Ranking formulas are declared variant-swappable (engines are pure and pluggable); which posts are visible is policy and must agree exactly.',
    tolerance: 'set-equality',
    date: '2026-08-24', status: 'active' },
];

export const frontiers = () => LEDGER.filter((e) => e.kind === 'frontier');
export const tolerances = () => LEDGER.filter((e) => e.kind === 'tolerance' && e.status === 'active');

// The named tolerance comparators. 'set-equality': order-insensitive equality
// over arrays of ids; anything else must be added HERE, in the same commit as
// the ledger entry that names it.
export const COMPARATORS = {
  'set-equality': (a, b) =>
    Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]),
};
