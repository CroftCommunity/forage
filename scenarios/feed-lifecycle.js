// Scenario: the Feed lifecycle — create, join, steward, ban — with the
// permission matrix asserted seat by seat (BSM invariant 6: this scenario
// covers feed.created/joined/left, mod.stewardAdded, mod.banned).

const DAY = 86400;

export const feedLifecycle = {
  id: 'feed-lifecycle',
  description: 'A Feed is created, members join, a steward is added, one member is banned; every seat sees the right gates.',
  events: [
    // registrations 30 days back, so no seat is age-probation at replay time
    { t: -30 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'sage' } },
    { t: -30 * DAY + 1, actor: 'u_briar', type: 'account.registered', payload: { handle: 'briar' } },
    { t: -30 * DAY + 2, actor: 'u_fern', type: 'account.registered', payload: { handle: 'fern' } },
    { t: -30 * DAY + 3, actor: 'u_thorn', type: 'account.registered', payload: { handle: 'thorn' } },
    { t: 10, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_orchard', slug: 'orchard', title: 'Orchard' } },
    { t: 20, actor: 'u_fern', type: 'feed.joined', payload: { feedId: 'f_orchard' } },
    { t: 21, actor: 'u_thorn', type: 'feed.joined', payload: { feedId: 'f_orchard' } },
    { t: 22, actor: 'u_briar', type: 'feed.joined', payload: { feedId: 'f_orchard' } },
    { t: 30, actor: 'u_sage', type: 'mod.stewardAdded', payload: { feedId: 'f_orchard', userId: 'u_briar' } },
    { t: 40, actor: 'u_briar', type: 'mod.banned', payload: { feedId: 'f_orchard', userId: 'u_thorn', reason: 'rule 1' } },
    { t: 50, actor: 'u_thorn', type: 'feed.left', payload: { feedId: 'f_orchard' } },
  ],
  assertions: [
    { seat: 'u_fern', probe: 'perm', args: { feedId: 'f_orchard', key: 'canPost' }, expect: true },
    { seat: 'u_fern', probe: 'perm', args: { feedId: 'f_orchard', key: 'canModerate' }, expect: false },
    { seat: 'u_briar', probe: 'perm', args: { feedId: 'f_orchard', key: 'canModerate' }, expect: true },
    { seat: 'u_briar', probe: 'perm', args: { feedId: 'f_orchard', key: 'canManageFeed' }, expect: false },
    { seat: 'u_sage', probe: 'perm', args: { feedId: 'f_orchard', key: 'canManageFeed' }, expect: true },
    { seat: 'u_thorn', probe: 'perm', args: { feedId: 'f_orchard', key: 'bannedHere' }, expect: true },
    { seat: 'u_thorn', probe: 'perm', args: { feedId: 'f_orchard', key: 'canPost' }, expect: false },
    { seat: null, probe: 'perm', args: { feedId: 'f_orchard', key: 'canView' }, expect: true },
    { seat: null, probe: 'perm', args: { feedId: 'f_orchard', key: 'canPost' }, expect: false },
    { seat: 'u_fern', probe: 'feedInfo2', args: { slug: 'orchard', key: 'joined' }, expect: true },
    { seat: 'u_fern', probe: 'feedInfo2', args: { slug: 'orchard', key: 'memberCount' }, expect: 3 }, // sage, fern, briar — thorn left
    { seat: null, probe: 'auditTypes', args: { slug: 'orchard' }, expect: ['mod.banned', 'mod.stewardAdded'] }, // newest first
  ],
};
