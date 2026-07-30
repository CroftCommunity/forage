// Frontier markers (spec §10). Rendered as dashed chips; listed at #/frontiers.
// The divergence ledger starts here (spec §13).

export const FRONTIERS = [
  { id: 'media-upload', label: 'Media upload',
    note: 'Post format tab is present but locked. Storage budget decision deferred; text and link posts only in v1.' },
  { id: 'search-facets', label: 'Search facets',
    note: 'Beyond the type filter (post/comment). Field, author, date facets require the scaled side.' },
  { id: 'multi-field-feeds', label: 'Custom multi-Field feeds',
    note: 'Build spec §13 deferred this. Saved feed compositions arrive with the api substrate.' },
  { id: 'metamod', label: 'Metamoderation-style steward review',
    note: 'Deferred in build spec §10.4. Community review of steward actions needs the scaled side.' },
  { id: 'vote-ring', label: 'Vote-ring detection',
    note: 'Build spec §11 out-of-scope list. Requires the scaled side.' },
  { id: 'ip-reputation', label: 'IP reputation',
    note: 'Build spec §11 out-of-scope list. Requires the scaled side.' },
  { id: 'ml-spam', label: 'ML spam filtering',
    note: 'Build spec §11 out-of-scope list. Requires the scaled side.' },
];

export function isLocked(id) {
  return FRONTIERS.some((f) => f.id === id);
}
