// Shared UI components. DOM built imperatively (no build step, no framework).

import { el, esc, mdLite, timeAgo, domainOf, fmtScore } from '../util.js';
import * as actions from '../actions.js';

// ---------- toasts ----------
export function toast(msg, kind = '') {
  const host = document.getElementById('toasts');
  const t = el('div', { class: `toast ${kind}` }, msg);
  host.append(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

// ---------- states ----------
export function skeleton(rows = 5) {
  return el('div', { class: 'card skeleton' },
    ...Array.from({ length: rows }, (_, i) => el('div', { class: 'sk-line', style: `width:${90 - i * 8}%` })));
}
export function emptyState(title, body, cta) {
  return el('div', { class: 'empty' }, el('h2', {}, title), el('p', { class: 'muted' }, body), cta || null);
}
export function errorState(msg) {
  return el('div', { class: 'errstate' }, el('strong', {}, 'Something went wrong. '), msg || 'Try again.');
}
export function gate(msg) {
  return el('div', { class: 'notice gate' }, msg || 'Log in to do that. ',
    el('span', { class: 'muted' }, 'Switch persona in the dev bar above.'));
}

// ---------- vote control (optimistic) ----------
// onVote (optional) replaces the memory-tier write path — the lens injects
// its like/unlike here so policy stays out of this component (invariant 2).
export function voteBox(subjectType, id, data, canVote, orientation = 'col', onVote = null) {
  const scoreEl = el('div', { class: 'score' }, fmtScore(data.score));
  const boost = el('button', { class: 'vote boost' + (data.myVote === 1 ? ' on' : ''), title: 'Boost', 'aria-label': 'Boost' }, '▲');
  const bury = el('button', { class: 'vote bury' + (data.myVote === -1 ? ' on' : ''), title: 'Bury', 'aria-label': 'Bury' }, '▼');
  let myVote = data.myVote, score = data.score;

  const apply = async (target) => {
    if (!canVote) { toast('Log in to vote.', 'err'); return; }
    const prevVote = myVote, prevScore = score;
    const next = myVote === target ? 0 : target;
    // optimistic paint
    myVote = next; score = prevScore - prevVote + next;
    boost.classList.toggle('on', next === 1);
    bury.classList.toggle('on', next === -1);
    scoreEl.textContent = fmtScore(score);
    try {
      if (onVote) await onVote(next, prevVote);
      else await actions.setVote(subjectType, id, next);
      // store notify triggers a full re-render with the truth
    } catch (e) {
      // revert (the "fills green then reverts" path with Fail Next armed)
      myVote = prevVote; score = prevScore;
      boost.classList.toggle('on', prevVote === 1);
      bury.classList.toggle('on', prevVote === -1);
      scoreEl.textContent = fmtScore(prevScore);
      if (e.message !== 'gated' && e.message !== 'banned') toast('Vote failed — reverted.', 'err');
    }
  };
  boost.addEventListener('click', () => apply(1));
  bury.addEventListener('click', () => apply(-1));
  return el('div', { class: 'votebox' }, boost, scoreEl, bury);
}

// ---------- badges ----------
function postBadges(p) {
  const b = [];
  if (p.pinned) b.push(el('span', { class: 'chip badge-pin' }, '📌 pinned'));
  if (p.locked) b.push(el('span', { class: 'chip badge-locked' }, '🔒 locked'));
  if (p.nsfw) b.push(el('span', { class: 'chip badge-nsfw' }, 'NSFW'));
  if (p.spoiler) b.push(el('span', { class: 'chip badge-spoiler' }, 'spoiler'));
  if (p.held) b.push(el('span', { class: 'chip' }, '⏳ held'));
  if (p.removed && !p.maskedRemoved) b.push(el('span', { class: 'chip badge-nsfw' }, 'removed'));
  if (p.tagId) b.push(el('span', { class: 'tag' }, p.tagId));
  return b;
}

// ---------- post row (feed) ----------
export function postRow(p, viewerCanVote, opts = {}) {
  const link = `#/f/${p.fieldSlug}/p/${p.id}`;
  const titleLink = p.format === 'link' && p.url
    ? el('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.title)
    : el('a', { href: link }, p.title);
  const meta = el('div', { class: 'postmeta' },
    el('a', { href: `#/f/${p.fieldSlug}` }, `f/${p.fieldSlug}`),
    p.author ? el('span', {}, `by ${p.author}`, opts.authorBadge || '') : el('span', { class: 'muted' }, 'by [removed]'),
    el('span', {}, timeAgo(p.createdTs) + ' ago'),
    p.format === 'link' && p.url ? el('span', { class: 'domain' }, domainOf(p.url)) : null,
    el('a', { href: link }, `${p.commentCount} comments`),
    p.edited ? el('span', { class: 'muted' }, 'edited') : null,
  );
  const body = opts.bodyNode !== undefined ? opts.bodyNode
    : (p.format === 'text' && p.body && !p.maskedRemoved
      ? el('div', { class: 'clamp' }, p.body) : null);

  const right = el('div', {},
    el('div', { class: 'row wrap', style: 'gap:6px;align-items:center' }, ...postBadges(p)),
    el('div', { class: 'posttitle' }, titleLink),
    body, meta,
  );
  const row = el('div', { class: 'postrow' + (p.pinned ? ' pinned-row' : '') },
    voteBox('post', p.id, p, viewerCanVote, 'col', opts.onVote), right);
  return row;
}

// ---------- comment tree with the signature collapse gutter (§3.3) ----------
const CHILD_PAGE = 20; // "load N more replies" threshold

export function commentNode(node, ctx) {
  const wrap = el('div', { class: 'comment' + (node.autoCollapsed ? ' collapsed' : '') });

  const gutter = el('button', { class: 'gutter', 'aria-label': 'Collapse thread', title: 'Collapse' });
  gutter.addEventListener('click', () => {
    const collapsing = !wrap.classList.contains('collapsed');
    wrap.classList.toggle('collapsed');
    note.textContent = collapsing ? ` [+] ${countDesc(node)} hidden` : '';
  });

  const author = node.author
    ? el('a', { href: `#/u/${node.author}` }, node.author)
    : el('span', { class: 'removed-stub' }, node.deleted ? '[deleted]' : '[removed]');
  const note = el('span', { class: 'collapse-note' });
  const meta = el('div', { class: 'comment-meta' },
    author,
    el('span', {}, `${fmtScore(node.score)} pts`),
    el('span', {}, timeAgo(node.createdTs) + ' ago'),
    node.edited ? el('span', { class: 'muted' }, 'edited') : null,
    node.removed && ctx.canModerate ? el('span', { class: 'chip badge-nsfw' }, 'removed') : null,
    note,
  );

  const text = el('div', { class: 'comment-text', html: node.maskedRemoved || node.deleted ? esc(node.body) : mdLite(node.body) });

  const actionsRow = el('div', { class: 'comment-actions' });
  if (!node.maskedRemoved && !node.deleted) {
    const vb = miniVote('comment', node.id, node, ctx.canVote);
    actionsRow.append(vb.up, vb.score, vb.down);
    if (ctx.canComment && !ctx.locked) actionsRow.append(replyButton(node, ctx));
    actionsRow.append(saveButton('comment', node.id, node.saved, ctx));
    if (ctx.canReport) actionsRow.append(reportButton('comment', node.id, ctx));
    if (ctx.canModerate) actionsRow.append(...modButtons('comment', node, ctx));
  }

  const bodyWrap = el('div', { class: 'comment-body' }, meta, text, actionsRow);
  const childrenWrap = el('div', { class: 'children' });

  wrap.append(gutter, bodyWrap, childrenWrap);

  // render children with paging + continuation stubs
  renderChildren(childrenWrap, node, ctx);

  if (node.autoCollapsed) note.textContent = ` [+] ${countDesc(node)} hidden`;
  return wrap;
}

function renderChildren(container, node, ctx) {
  const kids = node.children || [];
  let shown = 0;
  const showBatch = () => {
    const slice = kids.slice(shown, shown + CHILD_PAGE);
    for (const k of slice) container.append(commentNode(k, ctx));
    shown += slice.length;
    more.remove();
    if (shown < kids.length) container.append(more);
  };
  const more = el('button', { class: 'loadmore btn sm' }, `load ${Math.min(CHILD_PAGE, kids.length)} more replies`);
  more.addEventListener('click', showBatch);

  if (kids.length) showBatch();

  // continuation stub past depth 10 (spec §9 / acceptance)
  if (node.deferred > 0) {
    container.append(el('a', { class: 'continue-stub', href: `#/f/${ctx.fieldSlug}/p/${node.postId}?focus=${node.id}` },
      `→ continue this thread (${node.deferred} more)`));
  }
}

function countDesc(node) {
  let n = 0;
  const walk = (x) => { for (const c of x.children || []) { n++; walk(c); } if (x.deferred) n += x.deferred; };
  walk(node);
  return n + (node.deferred || 0);
}

function miniVote(type, id, data, canVote) {
  const score = el('span', {}, `${fmtScore(data.score)}`);
  let my = data.myVote, sc = data.score;
  const up = el('button', { class: 'cvote boost' + (my === 1 ? ' on' : '') }, '▲');
  const down = el('button', { class: 'cvote bury' + (my === -1 ? ' on' : '') }, '▼');
  const apply = async (t) => {
    if (!canVote) { toast('Log in to vote.', 'err'); return; }
    const pv = my, ps = sc, next = my === t ? 0 : t;
    my = next; sc = ps - pv + next;
    up.classList.toggle('on', next === 1); down.classList.toggle('on', next === -1); score.textContent = fmtScore(sc);
    try { await actions.setVote(type, id, next); }
    catch (e) { my = pv; sc = ps; up.classList.toggle('on', pv === 1); down.classList.toggle('on', pv === -1); score.textContent = fmtScore(ps);
      if (e.message !== 'gated' && e.message !== 'banned') toast('Vote failed — reverted.', 'err'); }
  };
  up.addEventListener('click', () => apply(1));
  down.addEventListener('click', () => apply(-1));
  return { up, down, score };
}

function replyButton(node, ctx) {
  const btn = el('button', {}, 'reply');
  btn.addEventListener('click', () => {
    if (btn.nextSibling && btn.nextSibling.classList?.contains('reply-form')) { btn.nextSibling.remove(); return; }
    const ta = el('textarea', { placeholder: 'Add a reply…' });
    const send = el('button', { class: 'btn sm primary' }, 'Reply');
    const form = el('div', { class: 'reply-form stack', style: 'margin:6px 0' }, ta, send);
    send.addEventListener('click', async () => {
      if (!ta.value.trim()) return;
      try { await actions.createComment(node.postId, node.id, ta.value.trim()); toast('Reply posted.', 'ok'); }
      catch (e) { /* toast already shown for rate/lock */ }
    });
    btn.after(form); ta.focus();
  });
  return btn;
}

function saveButton(type, id, saved, ctx) {
  const btn = el('button', {}, saved ? 'unsave' : 'save');
  btn.addEventListener('click', async () => {
    try { await actions.setSave(type, id, !saved); } catch {}
  });
  return btn;
}

function reportButton(type, id, ctx) {
  const btn = el('button', {}, 'report');
  btn.addEventListener('click', async () => {
    const reason = prompt('Report reason (Spam, Incivility, Off-topic, Rule violation):', 'Spam');
    if (!reason) return;
    try { await actions.report(type, id, ctx.fieldId, reason, ''); toast('Report filed.', 'ok'); } catch {}
  });
  return btn;
}

function modButtons(type, node, ctx) {
  const mk = (label, evType, extra = {}, cls = '') => {
    const b = el('button', { class: cls }, label);
    b.addEventListener('click', async () => {
      const reason = evType === 'mod.removed' ? (prompt('Removal reason:', 'Rule violation') || '') : '';
      if (evType === 'mod.removed' && !reason) return;
      try { await actions.mod(evType, { subjectType: type, subjectId: node.id, reason, ...extra }); toast('Done.', 'ok'); } catch {}
    });
    return b;
  };
  if (node.removed) return [mk('approve', 'mod.approved')];
  return [mk('remove', 'mod.removed', {}, 'danger')];
}
