// Selector contract (spec §5.2). Pure read API; policy lives here so it holds on
// every surface. All take `viewer` (a personaId, possibly null) first.

import { tally, myVote, reputation } from './reducers.js';
import { sortItems } from './engines/rank.js';
import { limits as limitsEngine } from './engines/limits.js';
import { personaById } from './personas.js';

// A board scope for one feed. Derived, not spelled: the old literal was the
// length of 'field:' and the rename silently cut a character off every slug.
const FEED_SCOPE = 'feed:';

// ---- viewer context ----
export function viewerCtx(state, viewerId, now) {
  // fail loud: a missing clock silently mis-derives age-probation (NaN < 7).
  if (!Number.isFinite(now)) throw new Error('viewerCtx: now (sec) is required');
  const persona = personaById(viewerId);
  const user = viewerId ? state.users[viewerId] : null;
  const rep = viewerId ? reputation(state, viewerId) : { post: 0, comment: 0, total: 0 };
  // probation: explicit persona flag, or account younger than 7 days.
  const ageDays = user ? (now * 1000 - user.registeredTs) / 86400000 : Infinity;
  const probation = !!persona.probation || (!!user && ageDays < 7);
  return {
    id: viewerId, handle: persona.handle, admin: !!persona.admin, probation,
    rep, suspended: !!(user && user.suspended),
  };
}

// ---- permissions: the §10.1 matrix as a function ----
export function permissions(state, viewerId, feedId, now) {
  const v = viewerCtx(state, viewerId, now);
  const feed = feedId ? state.feeds[feedId] : null;
  const bannedHere = !!(feed && v.id && feed.banned[v.id]);
  const isSteward = !!(feed && v.id && feed.stewards.has(v.id)) || v.admin;
  const isOwner = !!(feed && v.id && feed.ownerId === v.id) || v.admin;
  const loggedIn = !!v.id && !v.suspended;
  const canParticipate = loggedIn && !bannedHere;
  return {
    viewerId: v.id, loggedIn, admin: v.admin, probation: v.probation,
    isSteward, isOwner, bannedHere,
    banInfo: bannedHere ? feed.banned[v.id] : null,
    canView: true,
    canVote: canParticipate,
    canComment: canParticipate,
    canPost: canParticipate,
    canReport: loggedIn,
    canCreateFeed: loggedIn && !v.probation,
    canModerate: isSteward,
    canManageFeed: isOwner,
    canSuspendAccount: v.admin,
    canCloseFeed: v.admin,
    // report weight: probation seats carry low weight (§7 seat 5)
    reportWeight: v.probation ? 0.3 : v.rep.total >= 500 ? 2 : 1,
  };
}

// 3g: the memory-mode /h/ tag stream — the route scheme is a platform
// concept, not a lens hack. Tags are free-form strings on posts; the stream
// crosses feeds, newest first, case-insensitive, policy via shapePost.
export function tagStream(state, viewerId, tag, now) {
  const perms = permissions(state, viewerId, null, now);
  const needle = String(tag || '').toLowerCase();
  const posts = Object.values(state.posts)
    .filter((p) => !p.deleted && !p.held && String(p.tagId || '').toLowerCase() === needle && needle !== '')
    .sort((a, b) => b.createdTs - a.createdTs)
    .map((p) => shapePost(state, viewerId, p, perms));
  return { tag: needle, posts, perms };
}

// ---- shaping with removal/deletion masking ----
function shapePost(state, viewerId, post, perms) {
  const canSeeRemoved = perms.canModerate || post.authorId === viewerId;
  const t = tally(state, 'post', post.id);
  const feed = state.feeds[post.feedId];
  const base = {
    id: post.id, feedId: post.feedId, feedSlug: feed?.slug, feedTitle: feed?.title,
    format: post.format, tagId: post.tagId, nsfw: post.nsfw, spoiler: post.spoiler,
    createdTs: post.createdTs, createdSec: Math.floor(post.createdTs / 1000),
    locked: post.locked, pinned: post.pinned, edited: post.edited,
    removed: post.removed, deleted: post.deleted, held: post.held,
    ups: t.ups, downs: t.downs, score: t.score,
    myVote: myVote(state, viewerId, 'post', post.id),
    saved: isSaved(state, viewerId, 'post', post.id),
    commentCount: countComments(state, post.id),
  };
  if (post.deleted) return { ...base, title: post.title, body: '[deleted]', url: '', author: '[deleted]', authorId: null };
  if (post.removed && !canSeeRemoved)
    return { ...base, title: '[removed by stewards]', body: '', url: '', author: null, authorId: null, maskedRemoved: true };
  return { ...base, title: post.title, body: post.bodyMd, url: post.url,
    author: state.users[post.authorId]?.handle || '[unknown]', authorId: post.authorId,
    removedReason: post.removed ? post.removedReason : '' };
}

function shapeComment(state, viewerId, c, perms) {
  const canSeeRemoved = perms.canModerate || c.authorId === viewerId;
  const t = tally(state, 'comment', c.id);
  const base = {
    id: c.id, postId: c.postId, parentId: c.parentId, createdTs: c.createdTs,
    createdSec: Math.floor(c.createdTs / 1000), edited: c.edited,
    removed: c.removed, deleted: c.deleted,
    ups: t.ups, downs: t.downs, score: t.score,
    myVote: myVote(state, viewerId, 'comment', c.id),
    saved: isSaved(state, viewerId, 'comment', c.id),
  };
  if (c.deleted) return { ...base, body: '[deleted]', author: '[deleted]', authorId: null };
  if (c.removed && !canSeeRemoved)
    return { ...base, body: '[removed]', author: null, authorId: null, maskedRemoved: true };
  return { ...base, body: c.bodyMd, author: state.users[c.authorId]?.handle || '[unknown]',
    authorId: c.authorId, removedReason: c.removed ? c.removedReason : '' };
}

function isSaved(state, viewerId, type, id) {
  if (!viewerId) return false;
  return !!(state.saves[viewerId] && state.saves[viewerId].has(`${type}:${id}`));
}
function countComments(state, postId) {
  let n = 0;
  for (const c of Object.values(state.comments)) if (c.postId === postId && !c.deleted) n++;
  return n;
}

// ---- feed ----
export function board(state, viewerId, scope, sort = 'hot', timeframe = 'all', now) {
  const perms = permissions(state, viewerId, undefined, now);
  let posts = Object.values(state.posts);

  if (scope.startsWith('feed:')) {
    const slug = scope.slice(FEED_SCOPE.length);
    const feed = Object.values(state.feeds).find((f) => f.slug === slug);
    posts = feed ? posts.filter((p) => p.feedId === feed.id) : [];
  } else if (scope === 'home') {
    const memberFeeds = new Set(
      Object.values(state.feeds).filter((f) => viewerId && f.members.has(viewerId)).map((f) => f.id)
    );
    posts = posts.filter((p) => memberFeeds.has(p.feedId));
  } // 'all' and 'popular' => everything

  // visibility: drop deleted always; drop held & removed from non-mods.
  posts = posts.filter((p) => {
    if (p.deleted) return false;
    const canSee = permissions(state, viewerId, p.feedId, now).canModerate;
    if (p.held && !canSee) return false;
    if (p.removed && !canSee) return false;
    return true;
  });

  if (timeframe !== 'all' && (sort === 'top' || sort === 'controversial')) {
    const cutoff = now * 1000 - timeframeMs(timeframe);
    posts = posts.filter((p) => p.createdTs >= cutoff);
  }

  const items = posts.map((p) => ({ ...p, ups: tally(state, 'post', p.id).ups, downs: tally(state, 'post', p.id).downs, createdSec: Math.floor(p.createdTs / 1000) }));
  const sorted = sortItems(items, sort, now);
  // pinned to the top within a single feed view
  if (scope.startsWith('feed:')) {
    sorted.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }
  return { scope, sort, timeframe, perms,
    posts: sorted.map((p) => shapePost(state, viewerId, state.posts[p.id], permissions(state, viewerId, p.feedId, now))) };
}

function timeframeMs(tf) {
  return { hour: 3600e3, day: 86400e3, week: 6048e5, month: 2592e6, year: 31536e6 }[tf] || Infinity;
}

// ---- thread (post + comment tree) ----
export function thread(state, viewerId, postId, sort = 'best', now) {
  const post = state.posts[postId];
  if (!post) return null;
  const perms = permissions(state, viewerId, post.feedId, now);
  const all = Object.values(state.comments).filter((c) => c.postId === postId);
  // hide held/removed from non-mods by masking (keeps tree shape / stubs)
  const childrenOf = {};
  for (const c of all) { const k = c.parentId || 'root'; (childrenOf[k] = childrenOf[k] || []).push(c); }

  const threshold = state.users[viewerId]?.prefs?.commentThreshold ?? -4;

  function build(parentKey, depth) {
    const kids = (childrenOf[parentKey] || []).map((c) => ({
      c, ups: tally(state, 'comment', c.id).ups, downs: tally(state, 'comment', c.id).downs,
      createdSec: Math.floor(c.createdTs / 1000),
    }));
    const sorted = sortItems(kids, sort, now);
    return sorted.map(({ c }) => {
      const shaped = shapeComment(state, viewerId, c, perms);
      const node = { ...shaped, depth,
        autoCollapsed: shaped.score < threshold && !shaped.maskedRemoved,
        children: depth >= 10 ? [] : build(c.id, depth + 1),
        deferred: depth >= 10 ? (childrenOf[c.id] || []).length : 0, // "continue this thread"
      };
      return node;
    });
  }

  const roots = build('root', 0);
  return {
    post: shapePost(state, viewerId, post, perms),
    perms, sort, locked: post.locked,
    comments: roots,
    total: all.filter((c) => !c.deleted).length,
  };
}

// ---- feed about ----
export function feed(state, viewerId, slug, now) {
  const f = Object.values(state.feeds).find((x) => x.slug === slug);
  if (!f) return null;
  const perms = permissions(state, viewerId, f.id, now);
  return {
    id: f.id, slug: f.slug, title: f.title, description: f.description,
    settings: f.settings, createdTs: f.createdTs,
    memberCount: f.members.size,
    joined: !!(viewerId && f.members.has(viewerId)),
    owner: state.users[f.ownerId]?.handle,
    stewards: [...f.stewards].map((id) => state.users[id]?.handle).filter(Boolean),
    rules: f.settings.rules || [],
    perms,
  };
}

// ---- audit log (PUBLIC; only removed-body masking, none other) ----
export function auditLog(state, viewerId, slug) {
  const f = Object.values(state.feeds).find((x) => x.slug === slug);
  if (!f) return null;
  const entries = state.audit
    .filter((ev) => modEventFeed(state, ev) === f.id)
    .map((ev) => ({
      type: ev.type, ts: ev.ts, by: state.users[ev.actor]?.handle || 'system',
      subjectType: ev.payload.subjectType, subjectId: ev.payload.subjectId,
      userId: ev.payload.userId, userHandle: ev.payload.userId ? state.users[ev.payload.userId]?.handle : null,
      reason: ev.payload.reason || '', duration: ev.payload.duration || null,
    }))
    .reverse();
  return { slug: f.slug, title: f.title, entries };
}

function modEventFeed(state, ev) {
  const p = ev.payload;
  if (p.feedId) return p.feedId;
  if (p.subjectType === 'post') return state.posts[p.subjectId]?.feedId;
  if (p.subjectType === 'comment') { const c = state.comments[p.subjectId]; return c ? state.posts[c.postId]?.feedId : null; }
  return null;
}

// ---- mod queue (steward-gated) ----
export function modQueue(state, viewerId, slug, now) {
  const f = Object.values(state.feeds).find((x) => x.slug === slug);
  if (!f) return null;
  const perms = permissions(state, viewerId, f.id, now);
  if (!perms.canModerate) return { gated: true, slug };
  const open = state.reports.filter((r) => r.feedId === f.id && !r.resolvedBy).map((r) => shapeReport(state, viewerId, r, perms));
  const held = Object.values(state.posts).filter((p) => p.feedId === f.id && p.held && !p.removed)
    .map((p) => ({ kind: 'held', post: shapePost(state, viewerId, p, perms) }));
  return { slug: f.slug, title: f.title, reports: open, held, perms };
}

function shapeReport(state, viewerId, r, perms) {
  const subj = r.subjectType === 'post'
    ? shapePost(state, viewerId, state.posts[r.subjectId], perms)
    : shapeComment(state, viewerId, state.comments[r.subjectId], perms);
  return { id: r.id, subjectType: r.subjectType, subjectId: r.subjectId, reason: r.reason,
    detail: r.detail, reporter: state.users[r.reporterId]?.handle || 'anon', ts: r.ts, subject: subj };
}

// ---- profile ----
export function profile(state, viewerId, handle, tab = 'overview', now) {
  const user = Object.values(state.users).find((u) => u.handle === handle);
  if (!user) return null;
  const perms = permissions(state, viewerId, undefined, now);
  const rep = reputation(state, user.id);
  const self = viewerId === user.id;
  const posts = Object.values(state.posts).filter((p) => p.authorId === user.id && !p.deleted)
    .sort((a, b) => b.createdTs - a.createdTs)
    .map((p) => shapePost(state, viewerId, p, permissions(state, viewerId, p.feedId, now)));
  const comments = Object.values(state.comments).filter((c) => c.authorId === user.id && !c.deleted)
    .sort((a, b) => b.createdTs - a.createdTs)
    .map((c) => ({ ...shapeComment(state, viewerId, c, permissions(state, viewerId, state.posts[c.postId]?.feedId, now)),
      postTitle: state.posts[c.postId]?.title }));
  let saved = [];
  if (self && state.saves[user.id]) {
    saved = [...state.saves[user.id]].map((k) => {
      const [t, id] = k.split(':');
      if (t === 'post' && state.posts[id]) return { type: 'post', item: shapePost(state, viewerId, state.posts[id], permissions(state, viewerId, state.posts[id].feedId, now)) };
      if (t === 'comment' && state.comments[id]) return { type: 'comment', item: shapeComment(state, viewerId, state.comments[id], perms) };
      return null;
    }).filter(Boolean);
  }
  return { handle: user.handle, registeredTs: user.registeredTs, suspended: !!user.suspended,
    rep, self, tab, posts, comments, saved, canSeeSaved: self };
}

// ---- notifications ----
export function notifications(state, viewerId) {
  if (!viewerId) return { items: [], unread: 0 };
  const list = (state.notifications[viewerId] || []).slice().reverse().map((n) => ({
    ...n, from: state.users[n.fromId]?.handle || 'system',
  }));
  return { items: list, unread: list.filter((n) => !n.read).length };
}
export function unreadCount(state, viewerId) {
  if (!viewerId) return 0;
  return (state.notifications[viewerId] || []).filter((n) => !n.read).length;
}

// ---- search ----
export function search(state, viewerId, q, scope = 'all', type = 'post', now) {
  const needle = (q || '').toLowerCase().trim();
  if (!needle) return { q, results: [] };
  let results = [];
  if (type === 'post' || type === 'all') {
    for (const p of Object.values(state.posts)) {
      if (p.deleted || p.removed || p.held) continue;
      if (scope.startsWith('feed:') && state.feeds[p.feedId]?.slug !== scope.slice(FEED_SCOPE.length)) continue;
      const hay = `${p.title} ${p.bodyMd} ${p.url}`.toLowerCase();
      if (hay.includes(needle)) results.push({ type: 'post', item: shapePost(state, viewerId, p, permissions(state, viewerId, p.feedId, now)) });
    }
  }
  if (type === 'comment' || type === 'all') {
    for (const c of Object.values(state.comments)) {
      if (c.deleted || c.removed) continue;
      if (c.bodyMd.toLowerCase().includes(needle))
        results.push({ type: 'comment', item: { ...shapeComment(state, viewerId, c, permissions(state, viewerId, state.posts[c.postId]?.feedId, now)), postTitle: state.posts[c.postId]?.title } });
    }
  }
  return { q, scope, type, results: results.slice(0, 50) };
}

// ---- limits ----
export function limits(state, viewerId, now, events) {
  if (!Array.isArray(events)) throw new Error('limits: events[] is required');
  const v = viewerCtx(state, viewerId, now);
  return limitsEngine(viewerId, events, v.rep.total, v.probation, now);
}

// ---- feeds list (for sidebars / discovery) ----
export function feedList(state, viewerId) {
  return Object.values(state.feeds).map((f) => ({
    id: f.id, slug: f.slug, title: f.title, memberCount: f.members.size,
    joined: !!(viewerId && f.members.has(viewerId)),
  })).sort((a, b) => b.memberCount - a.memberCount);
}
