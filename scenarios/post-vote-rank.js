// Scenario: posting and boost/bury ranking — tallies derive from the vote
// log, top and new disagree, an edit patches in place.
// Covers: post.created, post.edited, vote.set (+ registrations, feed).

const DAY = 86400;

export const postVoteRank = {
  id: 'post-vote-rank',
  description: 'Three posts, votes land, top order differs from new order, an edit marks the post edited.',
  events: [
    { t: -30 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'sage' } },
    { t: -30 * DAY + 1, actor: 'u_fern', type: 'account.registered', payload: { handle: 'fern' } },
    { t: -30 * DAY + 2, actor: 'u_alder', type: 'account.registered', payload: { handle: 'alder' } },
    { t: 0, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_meadow', slug: 'meadow', title: 'Meadow' } },
    { t: 5, actor: 'u_fern', type: 'feed.joined', payload: { feedId: 'f_meadow' } },
    { t: 6, actor: 'u_alder', type: 'feed.joined', payload: { feedId: 'f_meadow' } },
    { t: 100, actor: 'u_fern', type: 'post.created', payload: { id: 'p_a', feedId: 'f_meadow', format: 'text', title: 'First sowing' } },
    { t: 200, actor: 'u_alder', type: 'post.created', payload: { id: 'p_b', feedId: 'f_meadow', format: 'text', title: 'Bed rotation' } },
    { t: 300, actor: 'u_fern', type: 'post.created', payload: { id: 'p_c', feedId: 'f_meadow', format: 'text', title: 'Mulch question' } },
    { t: 400, actor: 'sv_1', type: 'vote.set', payload: { subjectType: 'post', subjectId: 'p_a', value: 1 } },
    { t: 401, actor: 'sv_2', type: 'vote.set', payload: { subjectType: 'post', subjectId: 'p_a', value: 1 } },
    { t: 402, actor: 'sv_3', type: 'vote.set', payload: { subjectType: 'post', subjectId: 'p_a', value: 1 } },
    { t: 410, actor: 'sv_4', type: 'vote.set', payload: { subjectType: 'post', subjectId: 'p_b', value: 1 } },
    { t: 411, actor: 'sv_5', type: 'vote.set', payload: { subjectType: 'post', subjectId: 'p_b', value: -1 } },
    { t: 420, actor: 'sv_6', type: 'vote.set', payload: { subjectType: 'post', subjectId: 'p_c', value: 1 } },
    { t: 421, actor: 'sv_7', type: 'vote.set', payload: { subjectType: 'post', subjectId: 'p_c', value: 1 } },
    { t: 500, actor: 'u_alder', type: 'post.edited', payload: { postId: 'p_b', patch: { title: 'Bed rotation (fixed)' } } },
  ],
  assertions: [
    { seat: null, probe: 'tally', args: { type: 'post', id: 'p_a' }, expect: { ups: 3, downs: 0, score: 3 } },
    { seat: null, probe: 'tally', args: { type: 'post', id: 'p_b' }, expect: { ups: 1, downs: 1, score: 0 } },
    { seat: null, probe: 'tally', args: { type: 'post', id: 'p_c' }, expect: { ups: 2, downs: 0, score: 2 } },
    { seat: null, probe: 'feedIds', args: { scope: 'feed:meadow', sort: 'top' }, expect: ['p_a', 'p_c', 'p_b'] },
    { seat: null, probe: 'feedIds', args: { scope: 'feed:meadow', sort: 'new' }, expect: ['p_c', 'p_b', 'p_a'] },
    { seat: null, probe: 'postInfo', args: { id: 'p_b', key: 'title' }, expect: 'Bed rotation (fixed)' },
    { seat: null, probe: 'postInfo', args: { id: 'p_b', key: 'edited' }, expect: true },
  ],
};
