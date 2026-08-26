// Scenario: saves and author deletion — save/unsave round-trip lands in the
// profile's saved tab; author-deleted content vanishes from feeds and
// tombstones in threads.
// Covers: save.set, post.deletedByAuthor, comment.deletedByAuthor.

const DAY = 86400;

export const saveAndProfile = {
  id: 'save-and-profile',
  description: 'Fern saves a post and a comment, unsaves the comment; deleted-by-author content drops from the feed and tombstones in the thread.',
  events: [
    { t: -30 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'sage' } },
    { t: -30 * DAY + 1, actor: 'u_fern', type: 'account.registered', payload: { handle: 'fern' } },
    { t: 0, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_shed', slug: 'shed', title: 'Shed' } },
    { t: 10, actor: 'u_sage', type: 'post.created', payload: { id: 'p_keep', feedId: 'f_shed', format: 'text', title: 'Tool inventory' } },
    { t: 20, actor: 'u_sage', type: 'post.created', payload: { id: 'p_gone', feedId: 'f_shed', format: 'text', title: 'Regrettable rant' } },
    { t: 30, actor: 'u_sage', type: 'comment.created', payload: { id: 'c_tip', postId: 'p_keep', bodyMd: 'Oil the hinges', quiet: true } },
    { t: 31, actor: 'u_sage', type: 'comment.created', payload: { id: 'c_oops', postId: 'p_keep', bodyMd: 'Wrong thread, sorry', quiet: true } },
    { t: 40, actor: 'u_fern', type: 'save.set', payload: { subjectType: 'post', subjectId: 'p_keep', saved: true } },
    { t: 41, actor: 'u_fern', type: 'save.set', payload: { subjectType: 'comment', subjectId: 'c_tip', saved: true } },
    { t: 50, actor: 'u_fern', type: 'save.set', payload: { subjectType: 'comment', subjectId: 'c_tip', saved: false } },
    { t: 60, actor: 'u_sage', type: 'post.deletedByAuthor', payload: { postId: 'p_gone' } },
    { t: 70, actor: 'u_sage', type: 'comment.deletedByAuthor', payload: { commentId: 'c_oops' } },
  ],
  assertions: [
    { seat: 'u_fern', probe: 'savedIds', args: { handle: 'fern' }, expect: ['p_keep'] }, // the unsaved comment is gone
    { seat: 'u_fern', probe: 'postInfo', args: { id: 'p_keep', key: 'saved' }, expect: true },
    { seat: 'u_sage', probe: 'postInfo', args: { id: 'p_keep', key: 'saved' }, expect: false }, // saves are per-viewer
    { seat: null, probe: 'feedIds', args: { scope: 'feed:shed', sort: 'new' }, expect: ['p_keep'] }, // deleted post dropped for everyone
    { seat: 'u_sage', probe: 'feedIds', args: { scope: 'feed:shed', sort: 'new' }, expect: ['p_keep'] }, // even its author
    { seat: null, probe: 'threadNode', args: { postId: 'p_keep', id: 'c_oops', key: 'body' }, expect: '[deleted]' },
    { seat: null, probe: 'threadNode', args: { postId: 'p_keep', id: 'c_oops', key: 'author' }, expect: '[deleted]' },
    { seat: null, probe: 'threadInfo', args: { postId: 'p_keep', key: 'total' }, expect: 1 }, // deleted comment out of the count
  ],
};
