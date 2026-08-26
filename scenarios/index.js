// The scenario library. Every scenario registers here; the coverage gate
// (test/coverage.test.js) walks EVENT_TYPES and fails on any mutation type no
// scenario exercises (invariant 6, mechanical). Seed (4c) replays this list.

import { feedLifecycle } from './feed-lifecycle.js';
import { postVoteRank } from './post-vote-rank.js';
import { commentTreeCollapse } from './comment-tree-collapse.js';
import { modRemoveMask } from './mod-remove-mask.js';
import { banReadonly } from './ban-readonly.js';
import { rateLimitProbation } from './rate-limit-probation.js';
import { reportResolveNotify } from './report-resolve-notify.js';
import { saveAndProfile } from './save-and-profile.js';
import { searchVisibility } from './search-visibility.js';
import { demoExtras } from './demo-extras.js';

export const SCENARIOS = [
  feedLifecycle,
  postVoteRank,
  commentTreeCollapse,
  modRemoveMask,
  banReadonly,
  rateLimitProbation,
  reportResolveNotify,
  saveAndProfile,
  searchVisibility,
  demoExtras, // keep LAST: the seed staggers bases and this world must be freshest
];
