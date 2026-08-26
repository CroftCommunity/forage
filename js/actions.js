// Action contract (spec §5, write side). Every write resolves its capability's
// substrate through the routing config (the adapter seam, invariant 1/4) and is
// wrapped in the dev-bar's latency toggle and Fail-Next; permissions + limits
// are enforced at write time (selectors enforce at read time; writes
// double-check so nothing sneaks through).

import * as store from './store.js';
import * as sel from './selectors.js';
import { genId } from './store.js';
import { substrateFor } from './config/routing.js';

let toastFn = () => {};
export function setToaster(fn) { toastFn = fn; }

function delay() {
  const ms = store.getDev().latency || 0;
  return ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

// Simulate the async write path through the ADAPTER: resolve the capability's
// substrate via routing, wrap it in the dev bar's latency and Fail-Next —
// transport simulation belongs here, whatever the substrate. If Fail-Next is
// armed, reject once (disarming it).
async function guardedWrite(capability, type, payload, opts) {
  await delay();
  if (store.getDev().failNext) {
    store.setDev({ failNext: false });
    throw new Error('Simulated failure (Fail Next was armed)');
  }
  return substrateFor(capability).write(type, payload, opts);
}

// ---- voting: optimistic path lives in the UI; this persists the truth ----
export async function setVote(subjectType, subjectId, value) {
  const s = store.getState(), viewer = store.getPersonaId(), now = store.nowSec();
  const p = sel.permissions(s, viewer, subjectField(s, subjectType, subjectId), now);
  if (!p.loggedIn) { toastFn('Log in to vote.', 'err'); throw new Error('gated'); }
  if (p.bannedHere) { toastFn('You are banned in this Feed.', 'err'); throw new Error('banned'); }
  return guardedWrite('voting', 'vote.set', { subjectType, subjectId, value });
}

export async function setSave(subjectType, subjectId, saved) {
  if (!store.getPersonaId()) { toastFn('Log in to save.', 'err'); throw new Error('gated'); }
  return guardedWrite('saving', 'save.set', { subjectType, subjectId, saved });
}

export async function createComment(postId, parentId, bodyMd) {
  const s = store.getState(), viewer = store.getPersonaId(), now = store.nowSec();
  const post = s.posts[postId];
  const p = sel.permissions(s, viewer, post.feedId, now);
  if (!p.canComment) throw new Error('cannot comment');
  if (post.locked && !p.canModerate) { toastFn('This thread is locked.', 'err'); throw new Error('locked'); }
  const lim = sel.limits(s, viewer, now, store.getEvents());
  if (!lim.canComment) { toastFn(`Rate limited — wait ${lim.commentWaitSec}s.`, 'err'); throw new Error('rate'); }
  return guardedWrite('commenting', 'comment.created', { id: genId('c'), postId, parentId: parentId || undefined, bodyMd });
}

export async function createPost({ feedId, format, title, bodyMd, url, tagId, nsfw, spoiler }) {
  const s = store.getState(), viewer = store.getPersonaId(), now = store.nowSec();
  const p = sel.permissions(s, viewer, feedId, now);
  if (!p.canPost) throw new Error('cannot post');
  const lim = sel.limits(s, viewer, now, store.getEvents());
  if (!lim.canPost) { toastFn(`Rate limited — wait ${lim.postWaitSec}s before posting.`, 'err'); throw new Error('rate'); }
  // automod evaluation (spec §9): feed rules, time-boxed, may 'hold'.
  const feed = s.feeds[feedId];
  const held = evalAutomod(feed, `${title} ${bodyMd || ''}`);
  const id = genId('p');
  const ev = await guardedWrite('posting', 'post.created', { id, feedId, format, title,
    bodyMd, url, tagId, nsfw: !!nsfw, spoiler: !!spoiler, held: !!held });
  if (held) toastFn('Held for steward review (automod).', 'ok');
  return ev;
}

function evalAutomod(feed, text) {
  const rules = feed?.settings?.automod || [];
  const started = performance.now();
  const hay = text.toLowerCase();
  for (const r of rules) {
    if (performance.now() - started > 20) break; // time-boxed
    if (r.action === 'hold' && hay.includes((r.match || '').toLowerCase())) return r;
  }
  return null;
}

export async function report(subjectType, subjectId, feedId, reason, detail, ruleId) {
  if (!store.getPersonaId()) { toastFn('Log in to report.', 'err'); throw new Error('gated'); }
  return guardedWrite('reporting', 'report.filed', { id: genId('rep'), subjectType, subjectId, feedId, reason, detail, ruleId });
}

// ---- mod actions ----
export async function mod(type, payload) {
  const s = store.getState(), viewer = store.getPersonaId();
  const feedId = payload.feedId || subjectField(s, payload.subjectType, payload.subjectId);
  const p = sel.permissions(s, viewer, feedId, store.nowSec());
  if (!p.canModerate) throw new Error('not a steward');
  return guardedWrite('moderation', type, payload);
}

export async function joinFeed(feedId, join) {
  if (!store.getPersonaId()) { toastFn('Log in to join.', 'err'); throw new Error('gated'); }
  return substrateFor('feeds').write(join ? 'feed.joined' : 'feed.left', { feedId }); // no latency; instant UX
}

export async function createFeed({ slug, title, description }) {
  const s = store.getState(), viewer = store.getPersonaId(), now = store.nowSec();
  const p = sel.permissions(s, viewer, undefined, now);
  if (!p.canCreateFeed) {
    const msg = p.probation ? 'Probation accounts cannot create Feeds yet.' : 'Log in to create a Feed.';
    toastFn(msg, 'err'); throw new Error(msg);
  }
  const id = genId('f');
  // the reducer makes the creator steward + member; no separate join needed
  return guardedWrite('feeds', 'feed.created', { id, slug, title, description: description || '' });
}

export async function markNotificationsRead(notificationIds) {
  if (!store.getPersonaId()) throw new Error('gated');
  return substrateFor('notifications').write('notification.read', { notificationIds }); // no latency; instant UX
}

export async function updatePrefs(patch) {
  if (!store.getPersonaId()) return;
  return substrateFor('prefs').write('prefs.updated', { patch });
}

export async function updateFeedSettings(feedId, patch) {
  const s = store.getState(), viewer = store.getPersonaId();
  if (!sel.permissions(s, viewer, feedId, store.nowSec()).canManageFeed) throw new Error('not owner');
  return guardedWrite('feeds', 'feed.settingsUpdated', { feedId, patch });
}

export async function registerAccount(handle, email) {
  const id = `u_new_${handle.replace(/\W/g, '')}`;
  const ev = substrateFor('accounts').write('account.registered', { handle, email }, { actor: id });
  return { id, ev };
}

function subjectField(s, type, id) {
  if (type === 'post') return s.posts[id]?.feedId;
  if (type === 'comment') { const c = s.comments[id]; return c ? s.posts[c.postId]?.feedId : null; }
  return null;
}
