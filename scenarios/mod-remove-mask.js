// Scenario: the moderation pipeline — report, remove (masked for members,
// visible to stewards), approve a held post, lock/unlock, pin/unpin.
// Covers: report.filed, mod.removed, mod.approved, mod.locked, mod.unlocked,
// mod.pinned, mod.unpinned.

const DAY = 86400;

export const modRemoveMask = {
  id: 'mod-remove-mask',
  description: 'Removal masks for members but not stewards; approval clears held; pin floats a post; lock round-trips.',
  events: [
    { t: -30 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'sage' } },
    { t: -30 * DAY + 1, actor: 'u_briar', type: 'account.registered', payload: { handle: 'briar' } },
    { t: -30 * DAY + 2, actor: 'u_fern', type: 'account.registered', payload: { handle: 'fern' } },
    { t: -30 * DAY + 3, actor: 'u_dell', type: 'account.registered', payload: { handle: 'dell' } },
    { t: 0, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_hedge', slug: 'hedge', title: 'Hedge' } },
    { t: 1, actor: 'u_sage', type: 'mod.stewardAdded', payload: { feedId: 'f_hedge', userId: 'u_briar' } },
    { t: 5, actor: 'u_fern', type: 'feed.joined', payload: { feedId: 'f_hedge' } },
    { t: 6, actor: 'u_dell', type: 'feed.joined', payload: { feedId: 'f_hedge' } },
    { t: 10, actor: 'u_fern', type: 'post.created', payload: { id: 'p_spam', feedId: 'f_hedge', format: 'text', title: 'Discount seeds!!!' } },
    { t: 20, actor: 'u_fern', type: 'post.created', payload: { id: 'p_held', feedId: 'f_hedge', format: 'text', title: 'Held by automod', held: true } },
    { t: 30, actor: 'u_fern', type: 'post.created', payload: { id: 'p_plain', feedId: 'f_hedge', format: 'text', title: 'Plain post' } },
    { t: 40, actor: 'u_fern', type: 'post.created', payload: { id: 'p_notice', feedId: 'f_hedge', format: 'text', title: 'Feed notice' } },
    { t: 50, actor: 'u_fern', type: 'report.filed', payload: { id: 'r_spam', subjectType: 'post', subjectId: 'p_spam', feedId: 'f_hedge', reason: 'spam' } },
    { t: 60, actor: 'u_briar', type: 'mod.removed', payload: { subjectType: 'post', subjectId: 'p_spam', reason: 'rule 2' } },
    { t: 70, actor: 'u_briar', type: 'mod.approved', payload: { subjectType: 'post', subjectId: 'p_held' } },
    { t: 80, actor: 'u_briar', type: 'mod.locked', payload: { subjectType: 'post', subjectId: 'p_plain' } },
    { t: 85, actor: 'u_briar', type: 'mod.unlocked', payload: { subjectType: 'post', subjectId: 'p_plain' } },
    { t: 90, actor: 'u_briar', type: 'mod.pinned', payload: { subjectType: 'post', subjectId: 'p_plain' } },
    { t: 95, actor: 'u_briar', type: 'mod.unpinned', payload: { subjectType: 'post', subjectId: 'p_plain' } },
    { t: 100, actor: 'u_briar', type: 'mod.pinned', payload: { subjectType: 'post', subjectId: 'p_notice' } },
  ],
  assertions: [
    // members: removed is gone, held-then-approved is visible, pinned floats first
    { seat: 'u_fern', probe: 'feedIds', args: { scope: 'feed:hedge', sort: 'new' }, expect: ['p_notice', 'p_plain', 'p_held'] },
    // stewards additionally see the removed post (oldest, so last under 'new')
    { seat: 'u_briar', probe: 'feedIds', args: { scope: 'feed:hedge', sort: 'new' }, expect: ['p_notice', 'p_plain', 'p_held', 'p_spam'] },
    // a plain member gets the mask; the AUTHOR and stewards see through it
    { seat: 'u_dell', probe: 'postInfo', args: { id: 'p_spam', key: 'maskedRemoved' }, expect: true },
    { seat: 'u_dell', probe: 'postInfo', args: { id: 'p_spam', key: 'title' }, expect: '[removed by stewards]' },
    { seat: 'u_fern', probe: 'postInfo', args: { id: 'p_spam', key: 'removedReason' }, expect: 'rule 2' },
    { seat: 'u_briar', probe: 'postInfo', args: { id: 'p_spam', key: 'title' }, expect: 'Discount seeds!!!' },
    { seat: 'u_fern', probe: 'postInfo', args: { id: 'p_held', key: 'held' }, expect: false },
    { seat: 'u_fern', probe: 'postInfo', args: { id: 'p_plain', key: 'locked' }, expect: false },
    { seat: 'u_fern', probe: 'postInfo', args: { id: 'p_plain', key: 'pinned' }, expect: false },
    { seat: 'u_fern', probe: 'postInfo', args: { id: 'p_notice', key: 'pinned' }, expect: true },
    { seat: null, probe: 'auditTypes', args: { slug: 'hedge' }, expect: ['mod.pinned', 'mod.unpinned', 'mod.pinned', 'mod.unlocked', 'mod.locked', 'mod.approved', 'mod.removed', 'mod.stewardAdded'] },
  ],
};
