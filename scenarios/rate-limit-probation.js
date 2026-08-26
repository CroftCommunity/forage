// Scenario: the probation seat — a days-old account gets doubled cooldowns,
// discounted reports, and no Feed creation; prefs updates merge.
// Covers: prefs.updated (+ the limits engine over a live budget).

const DAY = 86400;

export const rateLimitProbation = {
  id: 'rate-limit-probation',
  description: 'A 3-day-old account is on probation: doubled cooldowns bind, feed creation gated, report weight discounted; prefs merge.',
  events: [
    { t: -30 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'sage' } },
    { t: -3 * DAY, actor: 'u_newt', type: 'account.registered', payload: { handle: 'newt' } }, // 3 days old at replay
    { t: 0, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_patch', slug: 'patch', title: 'Patch' } },
    { t: 5, actor: 'u_newt', type: 'feed.joined', payload: { feedId: 'f_patch' } },
    { t: 10, actor: 'u_newt', type: 'prefs.updated', payload: { patch: { defaultSort: 'new' } } },
    { t: 20, actor: 'u_sage', type: 'post.created', payload: { id: 'p_intro', feedId: 'f_patch', format: 'text', title: 'Introductions' } },
    // newt comments at the last event: 60s later (assertion clock) a normal
    // account would be free (60s cooldown), but probation doubles it to 120s
    { t: 100, actor: 'u_newt', type: 'comment.created', payload: { id: 'c_hi', postId: 'p_intro', bodyMd: 'hi!' } },
  ],
  assertions: [
    { seat: 'u_newt', probe: 'perm', args: { feedId: 'f_patch', key: 'probation' }, expect: true },
    { seat: 'u_newt', probe: 'perm', args: { feedId: 'f_patch', key: 'canCreateFeed' }, expect: false },
    { seat: 'u_newt', probe: 'perm', args: { feedId: 'f_patch', key: 'reportWeight' }, expect: 0.3 },
    { seat: 'u_newt', probe: 'perm', args: { feedId: 'f_patch', key: 'canPost' }, expect: true }, // probation ≠ banned
    { seat: 'u_newt', probe: 'limitsInfo', args: { key: 'commentCooldown' }, expect: 120 },
    { seat: 'u_newt', probe: 'limitsInfo', args: { key: 'canComment' }, expect: false }, // 60s elapsed < 120s
    { seat: 'u_newt', probe: 'limitsInfo', args: { key: 'commentWaitSec' }, expect: 60 },
    { seat: 'u_newt', probe: 'limitsInfo', args: { key: 'reason' }, expect: 'probation' },
    { seat: 'u_sage', probe: 'limitsInfo', args: { key: 'canComment' }, expect: true }, // the older seat is free
    { seat: 'u_newt', probe: 'prefValue', args: { key: 'defaultSort' }, expect: 'new' },
    { seat: 'u_newt', probe: 'prefValue', args: { key: 'theme' }, expect: 'auto' }, // merge keeps defaults
  ],
};
