// Scenario: the reporter's loop closes — a filed report is actioned, the
// reporter is notified, and reading one notification leaves the rest unread.
// Covers: notification.read (+ report.filed, mod.approved, the notify fold).

const DAY = 86400;

export const reportResolveNotify = {
  id: 'report-resolve-notify',
  description: 'A report is approved-away; the reporter gets a report-actioned notification; marking one read leaves the other unread.',
  events: [
    { t: -30 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'sage' } },
    { t: -30 * DAY + 1, actor: 'u_briar', type: 'account.registered', payload: { handle: 'briar' } },
    { t: -30 * DAY + 2, actor: 'u_fern', type: 'account.registered', payload: { handle: 'fern' } },
    { t: -30 * DAY + 3, actor: 'u_thorn', type: 'account.registered', payload: { handle: 'thorn' } },
    { t: 0, actor: 'u_sage', type: 'field.created', payload: { id: 'f_gate', slug: 'gate', title: 'Gate' } },
    { t: 1, actor: 'u_sage', type: 'mod.stewardAdded', payload: { fieldId: 'f_gate', userId: 'u_briar' } },
    { t: 10, actor: 'u_fern', type: 'post.created', payload: { id: 'p_q', fieldId: 'f_gate', format: 'text', title: 'Question' } },
    // thorn replies to fern's post -> fern notification #1 (post-reply, id n_u_fern_0)
    { t: 20, actor: 'u_thorn', type: 'comment.created', payload: { id: 'c_sus', postId: 'p_q', bodyMd: 'Sketchy answer' } },
    // fern reports the comment; briar approves it (not removal-worthy)
    { t: 30, actor: 'u_fern', type: 'report.filed', payload: { id: 'r_sus', subjectType: 'comment', subjectId: 'c_sus', fieldId: 'f_gate', reason: 'misleading' } },
    { t: 40, actor: 'u_briar', type: 'mod.approved', payload: { subjectType: 'comment', subjectId: 'c_sus' } },
    // fern reads ONLY the report-actioned notification (deterministic id: second push = n_u_fern_1)
    { t: 50, actor: 'u_fern', type: 'notification.read', payload: { notificationIds: ['n_u_fern_1'] } },
  ],
  assertions: [
    { seat: 'u_fern', probe: 'unread', args: {}, expect: 1 },  // the reply stays unread
    { seat: 'u_thorn', probe: 'unread', args: {}, expect: 0 }, // approval notifies nobody else
    { seat: null, probe: 'auditTypes', args: { slug: 'gate' }, expect: ['mod.approved', 'mod.stewardAdded'] },
    { seat: 'u_fern', probe: 'threadNode', args: { postId: 'p_q', id: 'c_sus', key: 'removed' }, expect: false },
  ],
};
