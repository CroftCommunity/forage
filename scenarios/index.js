// The scenario library. Every scenario registers here; the coverage gate
// (test/coverage.test.js) walks EVENT_TYPES and fails on any mutation type no
// scenario exercises (invariant 6, mechanical). Seed (4c) replays this list.

import { fieldLifecycle } from './field-lifecycle.js';
import { postVoteRank } from './post-vote-rank.js';
import { commentTreeCollapse } from './comment-tree-collapse.js';

export const SCENARIOS = [
  fieldLifecycle,
  postVoteRank,
  commentTreeCollapse,
];
