// Action contract (spec §5, write side). Wraps store.commit with the dev-bar's
// latency toggle and Fail-Next, and enforces permissions + limits at write time
// (selectors enforce at read time; writes double-check so nothing sneaks through).

import * as store from './store.js';
import * as sel from './selectors.js';
import { genId } from './store.js';

let toastFn = () => {};
export function setToaster(fn) { toastFn = fn; }

function delay() {
  const ms = store.getDev().latency || 0;
  return ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

// Simulate the async write path. If Fail-Next is armed, reject once (disarming it).
async function guardedCommit(type, payload, opts) {
  await delay();
  if (store.getDev().failNext) {
    store.setDev({ failNext: false });
    throw new Error('Simulated failure (Fail Next was armed)');
  }
  return store.commit(type, payload, opts);
}

// ---- voting: optimistic path lives in the UI; this persists the truth ----
export async function setVote(subjectType, subjectId, value) {
  const s = store.getState(), viewer = store.getPersonaId(), now = store.nowSec();
  const p = sel.permissions(s, viewer, subjectField(s, subjectType, subjectId), now);
  if (!p.loggedIn) { toastFn('Log in to vote.', 'err'); throw new Error('gated'); }
  if (p.bannedHere) { toastFn('You are banned in this Field.', 'err'); throw new Error('banned'); }
  return guardedCommit('vote.set', { subjectType, subjectId, value });
}

export async function setSave(subjectType, subjectId, saved) {
  if (!store.getPersonaId()) { toastFn('Log in to save.', 'err'); throw new Error('gated'); }
  return guardedCommit('save.set', { subjectType, subjectId, saved });
}

export async function createComment(postId, parentId, bodyMd) {
  const s = store.getState(), viewer = store.getPersonaId(), now = store.nowSec();
  const post = s.posts[postId];
  const p = sel.permissions(s, viewer, post.fieldId, now);
  if (!p.canComment) throw new Error('cannot comment');
  if (post.locked && !p.canModerate) { toastFn('This thread is locked.', 'err'); throw new Error('locked'); }
  const lim = sel.limits(s, viewer, now, store.getEvents());
  if (!lim.canComment) { toastFn(`Rate limited — wait ${lim.commentWaitSec}s.`, 'err'); throw new Error('rate'); }
  return guardedCommit('comment.created', { id: genId('c'), postId, parentId: parentId || undefined, bodyMd });
}

export async function createPost({ fieldId, format, title, bodyMd, url, tagId, nsfw, spoiler }) {
  const s = store.getState(), viewer = store.getPersonaId(), now = store.nowSec();
  const p = sel.permissions(s, viewer, fieldId, now);
  if (!p.canPost) throw new Error('cannot post');
  const lim = sel.limits(s, viewer, now, store.getEvents());
  if (!lim.canPost) { toastFn(`Rate limited — wait ${lim.postWaitSec}s before posting.`, 'err'); throw new Error('rate'); }
  // automod evaluation (spec §9): field rules, time-boxed, may 'hold'.
  const field = s.fields[fieldId];
  const held = evalAutomod(field, `${title} ${bodyMd || ''}`);
  const id = genId('p');
  const ev = await guardedCommit('post.created', { id, fieldId, format, title,
    bodyMd, url, tagId, nsfw: !!nsfw, spoiler: !!spoiler, held: !!held });
  if (held) toastFn('Held for steward review (automod).', 'ok');
  return ev;
}

function evalAutomod(field, text) {
  const rules = field?.settings?.automod || [];
  const started = performance.now();
  const hay = text.toLowerCase();
  for (const r of rules) {
    if (performance.now() - started > 20) break; // time-boxed
    if (r.action === 'hold' && hay.includes((r.match || '').toLowerCase())) return r;
  }
  return null;
}

export async function report(subjectType, subjectId, fieldId, reason, detail, ruleId) {
  if (!store.getPersonaId()) { toastFn('Log in to report.', 'err'); throw new Error('gated'); }
  return guardedCommit('report.filed', { id: genId('rep'), subjectType, subjectId, fieldId, reason, detail, ruleId });
}

// ---- mod actions ----
export async function mod(type, payload) {
  const s = store.getState(), viewer = store.getPersonaId();
  const fieldId = payload.fieldId || subjectField(s, payload.subjectType, payload.subjectId);
  const p = sel.permissions(s, viewer, fieldId, store.nowSec());
  if (!p.canModerate) throw new Error('not a steward');
  return guardedCommit(type, payload);
}

export async function joinField(fieldId, join) {
  if (!store.getPersonaId()) { toastFn('Log in to join.', 'err'); throw new Error('gated'); }
  return store.commit(join ? 'field.joined' : 'field.left', { fieldId }); // no latency; instant UX
}

export async function updatePrefs(patch) {
  if (!store.getPersonaId()) return;
  return store.commit('prefs.updated', { patch });
}

export async function updateFieldSettings(fieldId, patch) {
  const s = store.getState(), viewer = store.getPersonaId();
  if (!sel.permissions(s, viewer, fieldId, store.nowSec()).canManageField) throw new Error('not owner');
  return guardedCommit('field.settingsUpdated', { fieldId, patch });
}

export async function registerAccount(handle, email) {
  const id = `u_new_${handle.replace(/\W/g, '')}`;
  const ev = store.commit('account.registered', { handle, email }, { actor: id });
  return { id, ev };
}

function subjectField(s, type, id) {
  if (type === 'post') return s.posts[id]?.fieldId;
  if (type === 'comment') { const c = s.comments[id]; return c ? s.posts[c.postId]?.fieldId : null; }
  return null;
}
