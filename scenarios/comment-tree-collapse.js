// Scenario: the comment tree — nesting, edits, auto-collapse below the score
// threshold, and the depth-10 deferral ("continue this thread").
// The threshold is set explicitly here rather than relying on the default; see
// the note beside the events.
// Covers: comment.created, comment.edited (+ post, votes).

const DAY = 86400;

const events = [
  { t: -30 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'sage' } },
  { t: -30 * DAY + 1, actor: 'u_fern', type: 'account.registered', payload: { handle: 'fern' } },
  { t: 0, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_grove', slug: 'grove', title: 'Grove' } },
  { t: 10, actor: 'u_fern', type: 'post.created', payload: { id: 'p_tree', feedId: 'f_grove', format: 'text', title: 'Deep thread' } },
  { t: 20, actor: 'u_sage', type: 'comment.created', payload: { id: 'c_top', postId: 'p_tree', bodyMd: 'Top comment' } },
  { t: 30, actor: 'u_fern', type: 'comment.created', payload: { id: 'c_reply', postId: 'p_tree', parentId: 'c_top', bodyMd: 'A reply' } },
  { t: 40, actor: 'u_sage', type: 'comment.edited', payload: { commentId: 'c_reply', patch: { bodyMd: 'A reply (edited)' } } },
  { t: 50, actor: 'u_sage', type: 'comment.created', payload: { id: 'c_bad', postId: 'p_tree', bodyMd: 'Bad take', quiet: true } },
];
// Auto-collapse used to be driven by five BURIES pushing c_bad under the
// default -4 threshold. Downvotes are gone (plan 2026-08-27-1), which has a
// consequence nobody's description of that change mentioned: a score can no
// longer be negative, so **the default commentThreshold of -4 can never fire
// again**. The feature is not dead — the threshold is a user preference, and a
// POSITIVE one still collapses lightly-boosted comments — but its default
// makes it inert and its name now means the opposite of what it used to.
//
// That is a product question for the owner (see the plan's Review Log), not a
// call this scenario should make silently. What it does here is keep the
// feature EXERCISED under its new semantics — collapse below N boosts — so the
// removal of downvotes does not quietly take auto-collapse's only coverage with
// it. If the owner retires the feature, this is the scenario that goes.
events.push({ t: 60, actor: 'u_fern', type: 'prefs.updated', payload: { patch: { commentThreshold: 1 } } });
events.push({ t: 61, actor: 'sv_0', type: 'vote.set', payload: { subjectType: 'comment', subjectId: 'c_top', value: 1 } });
// a chain to depth 11: c_d0 (depth 1, under c_top? no — own root chain)
let parent = null;
for (let d = 0; d <= 11; d++) {
  events.push({ t: 100 + d, actor: 'u_fern', type: 'comment.created', payload: { id: `c_d${d}`, postId: 'p_tree', parentId: parent, bodyMd: `depth ${d}`, quiet: true } });
  parent = `c_d${d}`;
}

export const commentTreeCollapse = {
  id: 'comment-tree-collapse',
  description: 'Nested comments render as a tree; low scores auto-collapse; depth 10 defers its subtree.',
  events,
  assertions: [
    { seat: 'u_fern', probe: 'threadNode', args: { postId: 'p_tree', id: 'c_bad', key: 'autoCollapsed' }, expect: true },
    { seat: 'u_fern', probe: 'threadNode', args: { postId: 'p_tree', id: 'c_top', key: 'autoCollapsed' }, expect: false },
    { seat: 'u_fern', probe: 'threadNode', args: { postId: 'p_tree', id: 'c_reply', key: 'body' }, expect: 'A reply (edited)' },
    { seat: 'u_fern', probe: 'threadNode', args: { postId: 'p_tree', id: 'c_reply', key: 'edited' }, expect: true },
    { seat: 'u_fern', probe: 'threadNode', args: { postId: 'p_tree', id: 'c_d10', key: 'deferred' }, expect: 1 },
    { seat: 'u_fern', probe: 'threadNode', args: { postId: 'p_tree', id: 'c_d11', key: 'depth' }, expect: null }, // beyond the cut — not rendered
    { seat: 'u_fern', probe: 'threadInfo', args: { postId: 'p_tree', key: 'total' }, expect: 15 }, // 3 + the 12-chain
  ],
};
