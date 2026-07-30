// Event schema + payload validation (spec §5.1, pulled forward per build order step 1).
// Validation is intentionally light but real: unknown types and missing required
// fields throw at dispatch time, so the contract is enforced from day one.

export const EVENT_TYPES = {
  'account.registered':      ['handle'],
  'account.suspended':       ['userId', 'reason'],
  'prefs.updated':           ['patch'],

  'field.created':           ['slug', 'title'],
  'field.settingsUpdated':   ['fieldId', 'patch'],
  'field.joined':            ['fieldId'],
  'field.left':              ['fieldId'],

  'post.created':            ['fieldId', 'format', 'title'],
  'post.edited':             ['postId', 'patch'],
  'post.deletedByAuthor':    ['postId'],

  'comment.created':         ['postId', 'bodyMd'],
  'comment.edited':          ['commentId', 'patch'],
  'comment.deletedByAuthor': ['commentId'],

  'vote.set':                ['subjectType', 'subjectId', 'value'],
  'save.set':                ['subjectType', 'subjectId', 'saved'],

  'report.filed':            ['subjectType', 'subjectId', 'fieldId', 'reason'],

  'mod.removed':             ['subjectType', 'subjectId'],
  'mod.approved':            ['subjectType', 'subjectId'],
  'mod.locked':              ['subjectType', 'subjectId'],
  'mod.unlocked':            ['subjectType', 'subjectId'],
  'mod.pinned':              ['subjectType', 'subjectId'],
  'mod.unpinned':            ['subjectType', 'subjectId'],
  'mod.banned':              ['fieldId', 'userId'],
  'mod.unbanned':            ['fieldId', 'userId'],
  'mod.stewardAdded':        ['fieldId', 'userId'],
  'mod.stewardRemoved':      ['fieldId', 'userId'],

  'notification.read':       ['notificationIds'],
};

export const MOD_TYPES = new Set(Object.keys(EVENT_TYPES).filter((t) => t.startsWith('mod.')));

export function validateEvent(ev) {
  if (!ev || typeof ev !== 'object') throw new Error('event must be an object');
  const req = EVENT_TYPES[ev.type];
  if (!req) throw new Error(`unknown event type: ${ev.type}`);
  if (!ev.actor && ev.type !== 'account.registered') {
    // account.registered may bootstrap its own actor; everything else needs one.
    if (ev.actor === undefined) throw new Error(`${ev.type} requires an actor`);
  }
  for (const key of req) {
    if (ev.payload == null || ev.payload[key] === undefined) {
      throw new Error(`${ev.type} missing required field: ${key}`);
    }
  }
  if (ev.type === 'vote.set' && ![-1, 0, 1].includes(ev.payload.value)) {
    throw new Error('vote.set value must be -1|0|1');
  }
  return true;
}
