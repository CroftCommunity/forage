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

  // ---- proposals ----
  { id: 'DL-009', kind: 'proposal', capability: 'posting',
    description: 'Deleted-post title retention differs by tier: memory keeps the original title on the tombstone ("[deleted]" body, real title); the scoped tier CLEARS the title from the wire record (content really leaves the repo). No scenario observes a deleted post\'s title yet — when one does, pick a side and promote this to a tolerance or unify.',
    reason: 'Privacy leans toward clearing; continuity leans toward keeping. Deferred until a scenario cares.',
    date: '2026-08-25', status: 'open' },

  // ---- the wide lens (phase 6): tolerances + frontiers, chips in js/ui/lens-views.js ----
  { id: 'DL-010', kind: 'tolerance', capability: 'feed-ranking', tier: 'wide',
    description: 'Lens feed ORDER is the feed generator\'s own ranking, not our hot/top/best; membership (which posts appear) is the generator\'s too.',
    reason: 'The lens renders the owner\'s existing experience; re-ranking it would misrepresent the source.',
    tolerance: 'shape-contract only (no order comparison against memory)',
    date: '2026-08-25', status: 'active' },
  { id: 'DL-011', kind: 'tolerance', capability: 'voting', tier: 'wide',
    description: 'Lens scores are likes-only: ups = likeCount, downs = 0. Bury counts do not exist on the network; controversial ranking is undefined at this tier.',
    reason: 'Bluesky has no downvote; pretending otherwise would fabricate data.',
    tolerance: 'score fields present, downs pinned 0',
    date: '2026-08-25', status: 'active' },
  { id: 'DL-012', kind: 'tolerance', capability: 'fields', tier: 'wide',
    description: 'Lens Field membership is the saved-feeds preference (pinned/saved feeds and lists), not a roster; memberCount is undefined.',
    reason: 'Fields = Feeds at this tier by design.',
    tolerance: 'field shape without roster-derived counts',
    date: '2026-08-25', status: 'active' },
  { id: 'DL-013', kind: 'frontier', capability: 'voting', tier: 'wide', label: 'Boost = like (write)',
    description: 'Writing a like from the lens is deferred: the plan is read-first, writes stay on memory. Chip on lens posts and threads.' },
  { id: 'DL-014', kind: 'frontier', capability: 'search', tier: 'wide', label: 'Guest lens search',
    description: 'searchPosts is 403 unauthenticated (probe-verified twice); guest search renders as a chip, sessions get real search.' },
  { id: 'DL-015', kind: 'frontier', capability: 'saving', tier: 'wide', label: 'Lens saves',
    description: 'Bookmarks are not public API surface; lens saved=false with a chip on the lens home.' },

  // ---- tolerances ----
  { id: 'DL-008', kind: 'tolerance', capability: 'feed-ranking',
    appliesTo: { probe: 'feedIds' },
    description: 'Feed ORDER may differ between ranking-engine variants or substrates; MEMBERSHIP may not.',
    reason: 'Ranking formulas are declared variant-swappable (engines are pure and pluggable); which posts are visible is policy and must agree exactly.',
    tolerance: 'set-equality',
    date: '2026-08-24', status: 'active' },

  // ---- the ring dial (plan 2026-08-25-1, 3b) ----
  { id: 'DL-016', kind: 'frontier', capability: 'feeds', tier: 'wide', label: 'Ring beyond the cap',
    description: 'mutuals+1 draws the first 25 members (D6-measured cap; latency is not the bound — board noise is). The chip reports the TRUE member count; drawing the full ring (sampling, rotation, or paging members) is this frontier.',
    date: '2026-08-25', status: 'open' },
  { id: 'DL-017', kind: 'frontier', capability: 'feeds', tier: 'wide', label: 'Ring criteria beyond the follow graph',
    description: 'Rings are follow-graph-shaped (mutuals, mutuals+1). Criteria like interaction density, lists, or shared-feed affinity are deferred until a ring proves too coarse.',
    date: '2026-08-25', status: 'open' },
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
