// Reducers (spec §5.1). State is a pure fold over the event log. Scores, comment
// counts, reputation and unread badges are DERIVED here, never stored by hand —
// drift is impossible when state is a fold over the log.

export function emptyState() {
  return {
    users: {},        // id -> {id, handle, email, registeredTs, suspended, prefs}
    fields: {},       // id -> field
    posts: {},        // id -> post
    comments: {},     // id -> comment
    votes: {},        // 'type:id' -> { userId: value }
    saves: {},        // userId -> Set('type:id')
    reports: [],      // {id, subjectType, subjectId, fieldId, reason, ruleId, detail, reporterId, ts, resolvedBy, resolution}
    audit: [],        // chronological mod.* events (the public log IS these)
    notifications: {},// userId -> [ {id, ts, kind, subjectType, subjectId, fromId, read} ]
    _counter: 0,
  };
}

const DEFAULT_PREFS = { theme: 'auto', commentThreshold: -4, defaultSort: 'hot', defaultFeed: 'home' };

export function reduce(state, ev) {
  const s = state; // mutate the working copy; store rebuilds from scratch each fold
  const p = ev.payload || {};
  const actor = ev.actor;
  switch (ev.type) {
    case 'account.registered':
      s.users[actor] = { id: actor, handle: p.handle, email: p.email || '',
        registeredTs: ev.ts, suspended: false, prefs: { ...DEFAULT_PREFS } };
      break;
    case 'account.suspended':
      if (s.users[p.userId]) s.users[p.userId].suspended = { reason: p.reason, ts: ev.ts };
      break;
    case 'prefs.updated':
      if (s.users[actor]) s.users[actor].prefs = { ...s.users[actor].prefs, ...p.patch };
      break;

    case 'field.created':
      s.fields[p.id] = {
        id: p.id, slug: p.slug, title: p.title, description: p.description || '',
        settings: { requireTags: false, nsfwAllowed: true, automod: [], rules: [], ...(p.settings || {}) },
        createdTs: ev.ts, ownerId: actor,
        stewards: new Set(actor ? [actor] : []),
        members: new Set(actor ? [actor] : []),
        banned: {}, // userId -> {ts, reason, duration}
      };
      break;
    case 'field.settingsUpdated':
      if (s.fields[p.fieldId]) {
        const { description, title, ...rest } = p.patch;
        if (description !== undefined) s.fields[p.fieldId].description = description;
        if (title !== undefined) s.fields[p.fieldId].title = title;
        s.fields[p.fieldId].settings = { ...s.fields[p.fieldId].settings, ...rest };
      }
      break;
    case 'field.joined':
      if (s.fields[p.fieldId] && actor) s.fields[p.fieldId].members.add(actor);
      break;
    case 'field.left':
      if (s.fields[p.fieldId] && actor) s.fields[p.fieldId].members.delete(actor);
      break;

    case 'post.created':
      s.posts[p.id] = {
        id: p.id, fieldId: p.fieldId, authorId: actor, format: p.format,
        title: p.title, bodyMd: p.bodyMd || '', url: p.url || '', tagId: p.tagId || null,
        nsfw: !!p.nsfw, spoiler: !!p.spoiler, createdTs: ev.ts,
        deleted: false, removed: false, removedReason: '', locked: false, pinned: false,
        held: !!p.held, edited: false,
      };
      break;
    case 'post.edited':
      if (s.posts[p.postId]) Object.assign(s.posts[p.postId], p.patch, { edited: true });
      break;
    case 'post.deletedByAuthor':
      if (s.posts[p.postId]) s.posts[p.postId].deleted = true;
      break;

    case 'comment.created':
      s.comments[p.id] = {
        id: p.id, postId: p.postId, parentId: p.parentId || null, authorId: actor,
        bodyMd: p.bodyMd, createdTs: ev.ts, deleted: false, removed: false,
        removedReason: '', edited: false,
      };
      // notification: reply to a parent comment's author, or top-level to post
      // author. Generated bulk seed comments set `quiet` so they don't flood.
      if (!p.quiet) notifyReply(s, ev, p);
      break;
    case 'comment.edited':
      if (s.comments[p.commentId]) Object.assign(s.comments[p.commentId], p.patch, { edited: true });
      break;
    case 'comment.deletedByAuthor':
      if (s.comments[p.commentId]) s.comments[p.commentId].deleted = true;
      break;

    case 'vote.set': {
      const key = `${p.subjectType}:${p.subjectId}`;
      if (!s.votes[key]) s.votes[key] = {};
      if (p.value === 0) delete s.votes[key][actor];
      else s.votes[key][actor] = p.value;
      break;
    }
    case 'save.set': {
      if (!actor) break;
      if (!s.saves[actor]) s.saves[actor] = new Set();
      const k = `${p.subjectType}:${p.subjectId}`;
      if (p.saved) s.saves[actor].add(k); else s.saves[actor].delete(k);
      break;
    }

    case 'report.filed':
      s.reports.push({
        id: p.id || `r${s.reports.length}`, subjectType: p.subjectType, subjectId: p.subjectId,
        fieldId: p.fieldId, reason: p.reason, ruleId: p.ruleId || null, detail: p.detail || '',
        reporterId: actor, ts: ev.ts, resolvedBy: null, resolution: null,
      });
      break;

    case 'mod.removed':
    case 'mod.approved':
    case 'mod.locked':
    case 'mod.unlocked':
    case 'mod.pinned':
    case 'mod.unpinned':
    case 'mod.banned':
    case 'mod.unbanned':
    case 'mod.stewardAdded':
    case 'mod.stewardRemoved':
      applyMod(s, ev, p);
      s.audit.push(ev); // every mod.* event IS the audit log
      break;

    case 'notification.read':
      for (const list of Object.values(s.notifications)) {
        for (const n of list) if (p.notificationIds.includes(n.id)) n.read = true;
      }
      break;
  }
  return s;
}

function subjectField(s, type, id) {
  if (type === 'post') return s.posts[id]?.fieldId;
  if (type === 'comment') { const c = s.comments[id]; return c ? s.posts[c.postId]?.fieldId : null; }
  return null;
}
function subjectAuthor(s, type, id) {
  if (type === 'post') return s.posts[id]?.authorId;
  if (type === 'comment') return s.comments[id]?.authorId;
  return null;
}

function applyMod(s, ev, p) {
  switch (ev.type) {
    case 'mod.removed':
      setSubject(s, p, { removed: true, removedReason: p.reason || '' });
      resolveReports(s, p, ev, 'removed');
      notifyAuthor(s, ev, p, 'removed');
      break;
    case 'mod.approved':
      setSubject(s, p, { removed: false, held: false });
      resolveReports(s, p, ev, 'approved');
      break;
    case 'mod.locked':   setSubject(s, p, { locked: true }); break;
    case 'mod.unlocked': setSubject(s, p, { locked: false }); break;
    case 'mod.pinned':   setSubject(s, p, { pinned: true }); break;
    case 'mod.unpinned': setSubject(s, p, { pinned: false }); break;
    case 'mod.banned':
      if (s.fields[p.fieldId]) s.fields[p.fieldId].banned[p.userId] = { ts: ev.ts, reason: p.reason || '', duration: p.duration || null };
      break;
    case 'mod.unbanned':
      if (s.fields[p.fieldId]) delete s.fields[p.fieldId].banned[p.userId];
      break;
    case 'mod.stewardAdded':
      if (s.fields[p.fieldId]) s.fields[p.fieldId].stewards.add(p.userId);
      break;
    case 'mod.stewardRemoved':
      if (s.fields[p.fieldId]) s.fields[p.fieldId].stewards.delete(p.userId);
      break;
  }
}

function setSubject(s, p, patch) {
  const bag = p.subjectType === 'post' ? s.posts : s.comments;
  if (bag[p.subjectId]) Object.assign(bag[p.subjectId], patch);
}

function resolveReports(s, p, ev, resolution) {
  for (const r of s.reports) {
    if (r.subjectType === p.subjectType && r.subjectId === p.subjectId && !r.resolvedBy) {
      r.resolvedBy = ev.actor; r.resolution = resolution;
      if (r.reporterId) pushNotification(s, r.reporterId, {
        kind: 'report-actioned', subjectType: r.subjectType, subjectId: r.subjectId, fromId: ev.actor, ts: ev.ts,
      });
    }
  }
}

function notifyAuthor(s, ev, p, kind) {
  const author = subjectAuthor(s, p.subjectType, p.subjectId);
  if (author && author !== ev.actor) pushNotification(s, author, {
    kind, subjectType: p.subjectType, subjectId: p.subjectId, fromId: ev.actor, ts: ev.ts,
  });
}

function notifyReply(s, ev, p) {
  let targetUser = null, kind = 'reply';
  if (p.parentId && s.comments[p.parentId]) targetUser = s.comments[p.parentId].authorId;
  else if (s.posts[p.postId]) { targetUser = s.posts[p.postId].authorId; kind = 'post-reply'; }
  if (targetUser && targetUser !== ev.actor) pushNotification(s, targetUser, {
    kind, subjectType: 'comment', subjectId: p.id, postId: p.postId, fromId: ev.actor, ts: ev.ts,
  });
}

function pushNotification(s, userId, n) {
  if (!s.notifications[userId]) s.notifications[userId] = [];
  s.notifications[userId].push({ id: `n_${userId}_${s.notifications[userId].length}`, read: false, ...n });
}

// ---- Derived helpers used by selectors ----
export function tally(state, type, id) {
  const v = state.votes[`${type}:${id}`] || {};
  let ups = 0, downs = 0;
  for (const val of Object.values(v)) { if (val === 1) ups++; else if (val === -1) downs++; }
  return { ups, downs, score: ups - downs };
}

export function myVote(state, viewerId, type, id) {
  if (!viewerId) return 0;
  return (state.votes[`${type}:${id}`] || {})[viewerId] || 0;
}

// Reputation: sum of net score across a user's non-removed posts / comments.
export function reputation(state, userId) {
  let post = 0, comment = 0;
  for (const pst of Object.values(state.posts))
    if (pst.authorId === userId && !pst.removed) post += tally(state, 'post', pst.id).score;
  for (const c of Object.values(state.comments))
    if (c.authorId === userId && !c.removed) comment += tally(state, 'comment', c.id).score;
  return { post, comment, total: post + comment };
}
