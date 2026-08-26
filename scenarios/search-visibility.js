// Scenario: search respects visibility — removed and held posts never
// surface, title and body both match, scope narrows to a Feed.
// Covers: search over the standing vocabulary (no new mutation types; this
// scenario exists because search-side masking is policy worth pinning).

const DAY = 86400;

export const searchVisibility = {
  id: 'search-visibility',
  description: 'Search finds title and body matches, never removed or held posts, and narrows by Feed scope.',
  events: [
    { t: -30 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'sage' } },
    { t: -30 * DAY + 1, actor: 'u_briar', type: 'account.registered', payload: { handle: 'briar' } },
    { t: 0, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_bed', slug: 'bed', title: 'Beds' } },
    { t: 1, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_bin', slug: 'bin', title: 'Bins' } },
    { t: 2, actor: 'u_sage', type: 'mod.stewardAdded', payload: { feedId: 'f_bed', userId: 'u_briar' } },
    { t: 10, actor: 'u_sage', type: 'post.created', payload: { id: 'p_title', feedId: 'f_bed', format: 'text', title: 'Compost basics' } },
    { t: 20, actor: 'u_sage', type: 'post.created', payload: { id: 'p_body', feedId: 'f_bin', format: 'text', title: 'Getting started', bodyMd: 'A compost bin in a week.' } },
    { t: 30, actor: 'u_sage', type: 'post.created', payload: { id: 'p_removed', feedId: 'f_bed', format: 'text', title: 'Compost spam' } },
    { t: 35, actor: 'u_briar', type: 'mod.removed', payload: { subjectType: 'post', subjectId: 'p_removed', reason: 'spam' } },
    { t: 40, actor: 'u_sage', type: 'post.created', payload: { id: 'p_held', feedId: 'f_bed', format: 'text', title: 'Compost hold', held: true } },
  ],
  assertions: [
    { seat: null, probe: 'searchIds', args: { q: 'compost' }, expect: ['p_title', 'p_body'] },
    { seat: 'u_briar', probe: 'searchIds', args: { q: 'compost' }, expect: ['p_title', 'p_body'] }, // masked even for stewards
    { seat: null, probe: 'searchIds', args: { q: 'compost', scope: 'feed:bed' }, expect: ['p_title'] },
    { seat: null, probe: 'searchIds', args: { q: 'nothing-matches-this' }, expect: [] },
  ],
};
