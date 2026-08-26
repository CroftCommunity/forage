// Scenario: exclusion states — a standing ban is read-only, an unban restores
// participation, a removed steward loses mod powers, a suspended account
// loses login-gated writes everywhere, and settings updates route correctly.
// Covers: mod.banned (standing), mod.unbanned, mod.stewardRemoved,
// account.suspended, feed.settingsUpdated.

const DAY = 86400;

export const banReadonly = {
  id: 'ban-readonly',
  description: 'Banned reads but cannot participate; unbanned recovers; ex-steward demoted; suspended locked out; settings patch lands.',
  events: [
    { t: -30 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'sage' } },
    { t: -30 * DAY + 1, actor: 'u_briar', type: 'account.registered', payload: { handle: 'briar' } },
    { t: -30 * DAY + 2, actor: 'u_thorn', type: 'account.registered', payload: { handle: 'thorn' } },
    { t: -30 * DAY + 3, actor: 'u_moss', type: 'account.registered', payload: { handle: 'moss' } },
    { t: -30 * DAY + 4, actor: 'u_alder', type: 'account.registered', payload: { handle: 'alder' } },
    { t: 0, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_fence', slug: 'fence', title: 'Fence' } },
    { t: 1, actor: 'u_sage', type: 'mod.stewardAdded', payload: { feedId: 'f_fence', userId: 'u_briar' } },
    { t: 5, actor: 'u_thorn', type: 'feed.joined', payload: { feedId: 'f_fence' } },
    { t: 6, actor: 'u_moss', type: 'feed.joined', payload: { feedId: 'f_fence' } },
    { t: 10, actor: 'u_briar', type: 'mod.banned', payload: { feedId: 'f_fence', userId: 'u_thorn', reason: 'rule 1' } },
    { t: 20, actor: 'u_briar', type: 'mod.banned', payload: { feedId: 'f_fence', userId: 'u_moss', reason: 'mistake' } },
    { t: 30, actor: 'u_briar', type: 'mod.unbanned', payload: { feedId: 'f_fence', userId: 'u_moss' } },
    { t: 40, actor: 'u_sage', type: 'mod.stewardRemoved', payload: { feedId: 'f_fence', userId: 'u_briar' } },
    { t: 50, actor: 'u_wren', type: 'account.suspended', payload: { userId: 'u_alder', reason: 'tos' } },
    { t: 60, actor: 'u_sage', type: 'feed.settingsUpdated', payload: { feedId: 'f_fence', patch: { description: 'Good fences.', requireTags: true } } },
  ],
  assertions: [
    // standing ban: read yes, participate no, report still allowed
    { seat: 'u_thorn', probe: 'perm', args: { feedId: 'f_fence', key: 'canView' }, expect: true },
    { seat: 'u_thorn', probe: 'perm', args: { feedId: 'f_fence', key: 'canPost' }, expect: false },
    { seat: 'u_thorn', probe: 'perm', args: { feedId: 'f_fence', key: 'canVote' }, expect: false },
    { seat: 'u_thorn', probe: 'perm', args: { feedId: 'f_fence', key: 'canReport' }, expect: true },
    // unban restores
    { seat: 'u_moss', probe: 'perm', args: { feedId: 'f_fence', key: 'bannedHere' }, expect: false },
    { seat: 'u_moss', probe: 'perm', args: { feedId: 'f_fence', key: 'canPost' }, expect: true },
    // demoted steward
    { seat: 'u_briar', probe: 'perm', args: { feedId: 'f_fence', key: 'canModerate' }, expect: false },
    // suspension gates login-dependent writes globally
    { seat: 'u_alder', probe: 'perm', args: { feedId: 'f_fence', key: 'canPost' }, expect: false },
    { seat: 'u_alder', probe: 'perm', args: { feedId: 'f_fence', key: 'loggedIn' }, expect: false },
    // settings patch routed: description out of settings, flag into settings
    { seat: null, probe: 'feedInfo2', args: { slug: 'fence', key: 'description' }, expect: 'Good fences.' },
    { seat: null, probe: 'feedInfo2', args: { slug: 'fence', key: 'settings' }, expect: { requireTags: true, nsfwAllowed: true, automod: [], rules: [] } },
    { seat: null, probe: 'auditTypes', args: { slug: 'fence' }, expect: ['mod.stewardRemoved', 'mod.unbanned', 'mod.banned', 'mod.banned', 'mod.stewardAdded'] },
  ],
};
