// Event schema + payload validation (spec §5.1, pulled forward per build order step 1).
// Validation is intentionally light but real: unknown types and missing required
// feeds throw at dispatch time, so the contract is enforced from day one.

export const EVENT_TYPES = {
  'account.registered':      ['handle'],
  'account.suspended':       ['userId', 'reason'],
  'prefs.updated':           ['patch'],

  'feed.created':           ['id', 'slug', 'title'],
  'feed.settingsUpdated':   ['feedId', 'patch'],
  'feed.joined':            ['feedId'],
  'feed.left':              ['feedId'],

  'post.created':            ['id', 'feedId', 'format', 'title'],
  'post.edited':             ['postId', 'patch'],
  'post.deletedByAuthor':    ['postId'],

  'comment.created':         ['id', 'postId', 'bodyMd'],
  'comment.edited':          ['commentId', 'patch'],
  'comment.deletedByAuthor': ['commentId'],

  'vote.set':                ['subjectType', 'subjectId', 'value'],
  'save.set':                ['subjectType', 'subjectId', 'saved'],

  'report.filed':            ['id', 'subjectType', 'subjectId', 'feedId', 'reason'],

  'mod.removed':             ['subjectType', 'subjectId'],
  'mod.approved':            ['subjectType', 'subjectId'],
  'mod.locked':              ['subjectType', 'subjectId'],
  'mod.unlocked':            ['subjectType', 'subjectId'],
  'mod.pinned':              ['subjectType', 'subjectId'],
  'mod.unpinned':            ['subjectType', 'subjectId'],
  'mod.banned':              ['feedId', 'userId'],
  'mod.unbanned':            ['feedId', 'userId'],
  'mod.stewardAdded':        ['feedId', 'userId'],
  'mod.stewardRemoved':      ['feedId', 'userId'],

  'notification.read':       ['notificationIds'],
};

export const MOD_TYPES = new Set(Object.keys(EVENT_TYPES).filter((t) => t.startsWith('mod.')));

export function validateEvent(ev) {
  if (!ev || typeof ev !== 'object') throw new Error('event must be an object');
  const req = EVENT_TYPES[ev.type];
  if (!req) throw new Error(`unknown event type: ${ev.type}`);
  // account.registered may bootstrap its own actor; everything else needs one
  // PRESENT (null and undefined both rejected — a logged-out commit is invalid).
  // Presence, not registered-existence: synthetic actors (sv_N) stay legal.
  if (ev.actor == null && ev.type !== 'account.registered') {
    throw new Error(`${ev.type} requires an actor`);
  }
  for (const key of req) {
    if (ev.payload == null || ev.payload[key] === undefined) {
      throw new Error(`${ev.type} missing required feed: ${key}`);
    }
  }
  if (ev.type === 'vote.set' && ![0, 1].includes(ev.payload.value)) {
    // -1 gets its own sentence. It was legal until 2026-08-27 (plan
    // 2026-08-27-1), so anyone hitting it is replaying an old log or pasting
    // old code, and a bare range would send them hunting for a typo. An
    // EXISTING stored log containing -1 still hydrates — hydrate() does not
    // re-validate — and js/reducers.js folds it to no vote.
    throw new Error(ev.payload.value === -1
      ? 'vote.set value -1 (bury) is no longer accepted — downvotes were removed; value must be 0|1'
      : 'vote.set value must be 0|1');
  }
  return true;
}
