// Page views. Each returns { main, side } DOM. Policy comes from selectors; these
// only render. Every screen has skeleton/empty/error/gated states available.

import { el, esc, mdLite, timeAgo, domainOf, fmtScore } from '../util.js';
import * as store from '../store.js';
import * as sel from '../selectors.js';
import * as actions from '../actions.js';
import * as skins from '../skins.js';
import * as version from '../version.js';
import { go } from '../router.js';
import { frontiers } from '../../ledger/divergence.js';
import { humanWait } from '../engines/limits.js';
import { postRow, commentNode, voteBox, emptyState, gate, errorState, toast } from './components.js';
import { densityDial, isCompact } from '../board-density.js';

// A board scope for one feed. Derived, not spelled: the old literal was the
// length of 'field:' and the rename silently cut a character off every slug.
const FEED_SCOPE = 'feed:';

const V = () => store.getPersonaId();
const S = () => store.getState();
const NOW = () => store.nowSec(); // the one place views resolve the clock

function tabs(items, active) {
  return el('div', { class: 'tabs' }, ...items.map(([label, href]) =>
    el('a', { class: 'tab' + (label.toLowerCase() === active ? ' active' : ''), href }, label)));
}

// ---------- sidebar builders ----------
function feedsSidebar() {
  const list = sel.feedList(S(), V());
  return el('div', { class: 'card' },
    el('h2', {}, 'Feeds'),
    el('div', { class: 'stack' }, ...list.map((f) => el('div', { class: 'row spread' },
      el('a', { href: `/f/${f.slug}` }, `f/${f.slug}`),
      el('span', { class: 'xs muted' }, `${f.memberCount}${f.joined ? ' · joined' : ''}`)))),
    el('hr', { class: 'rule' }),
    el('a', { class: 'btn sm', href: '/create-feed' }, '+ Create a feed'),
    ' ',
    el('a', { class: 'btn sm', href: '/frontiers' }, 'Frontiers'));
}

function limitsSidebar() {
  const v = V(); if (!v) return null;
  const lim = sel.limits(S(), v, NOW(), store.getEvents());
  if (lim.canPost && lim.canComment && !lim.probation) return null;
  const notes = [];
  if (lim.probation) notes.push('On probation: cooldowns are doubled and report weight is reduced.');
  if (!lim.canPost) notes.push(`Next post available in ${humanWait(lim.postWaitSec)}.`);
  if (!lim.canComment) notes.push(`Next comment available in ${humanWait(lim.commentWaitSec)}.`);
  return el('div', { class: 'notice limit' }, el('strong', {}, 'Rate limits'), ...notes.map((n) => el('div', { class: 'xs' }, n)));
}

// ---------- feeds ----------
// Controversial is gone with downvotes (plan 2026-08-27-1) — it was the only
// sort DEFINED by the up/down split, so it has no one-sided form.
const SORTS = ['hot', 'new', 'top', 'rising'];
export function boardView(scope, title, query) {
  const sort = query.sort || (S().users[V()]?.prefs?.defaultSort ?? 'hot');
  const data = sel.board(S(), V(), scope, sort, 'all', NOW());
  const main = el('div', {});

  // Logged-out banner with the primary tagline (acceptance §12).
  if (!V()) {
    main.append(el('div', { class: 'notice gate hero-gate' },
      el('img', { class: 'hero-art', src: '/assets/logo-wordmark.jpg', alt: 'Forage — a rook in a wreath as the O' }),
      el('div', { class: 'hero-copy' },
        el('strong', { style: 'font-family:var(--font-display);font-size:18px' }, 'Forage the open web.'),
        el('div', { class: 'xs muted' }, 'You are browsing logged out. Join a Feed to start posting.')),
      el('a', { class: 'btn primary sm', href: '/signup' }, 'Sign up')));
  }

  main.append(el('div', { class: 'row spread wrap' },
    el('h1', {}, title),
    scope.startsWith('feed:') && data.perms.canPost
      ? el('a', { class: 'btn primary sm', href: `/submit?f=${scope.slice(FEED_SCOPE.length)}` }, '+ New post') : null));

  const base = scope.startsWith('feed:') ? `/f/${scope.slice(FEED_SCOPE.length)}` : `/${scope}`;
  main.append(el('div', { class: 'row spread wrap' },
    el('div', { class: 'tabs' }, ...SORTS.map((s) =>
      el('a', { class: 'tab' + (s === sort ? ' active' : ''), href: `${base}?sort=${s}` }, s[0].toUpperCase() + s.slice(1)))),
    densityDial(el)));

  if (!data.posts.length) {
    main.append(emptyState('Nothing growing here yet',
      scope === 'home' ? 'Join a Feed to fill your Home.' : 'Be the first to post.',
      el('a', { class: 'btn primary', href: scope === 'home' ? '/all' : '/create-feed' },
        scope === 'home' ? 'Discover feeds' : 'Create a feed')));
  } else {
    const card = el('div', { class: 'card' });
    for (const p of data.posts) card.append(postRow(p, data.perms.canVote, { compact: isCompact() }));
    main.append(card);
  }
  return { main, side: el('div', { class: 'side' }, limitsSidebar(), feedsSidebar()) };
}

// ---------- feed (about + feed) ----------
export function feedView(params, query) {
  const f = sel.feed(S(), V(), params.slug, NOW());
  if (!f) return { main: emptyState('No such Feed', 'This Feed does not exist.'), side: el('div', {}, feedsSidebar()) };
  const feed = boardView(`feed:${params.slug}`, f.title, query);

  const banNotice = f.perms.bannedHere
    ? el('div', { class: 'notice ban' }, el('strong', {}, 'You are banned from this Feed. '),
        `Reason: ${esc(f.perms.banInfo.reason || 'unspecified')}. You can read but not participate. `,
        el('a', { href: `/f/${f.slug}/mod/log` }, 'See the public audit log.'))
    : null;

  const joinBtn = el('button', { class: 'btn' + (f.joined ? '' : ' primary') }, f.joined ? 'Joined ✓' : 'Join');
  joinBtn.addEventListener('click', async () => { try { await actions.joinFeed(f.id, !f.joined); } catch {} });

  const about = el('div', { class: 'card' },
    el('h2', {}, `f/${f.slug}`),
    el('div', { class: 'small muted' }, f.description),
    el('div', { class: 'row spread', style: 'margin-top:8px' },
      el('span', { class: 'xs muted' }, `${f.memberCount} members · created ${timeAgo(f.createdTs)} ago`),
      V() && !f.perms.bannedHere ? joinBtn : null),
    el('hr', { class: 'rule' }),
    el('div', { class: 'xs muted' }, `Owner: ${esc(f.owner || '—')} · Stewards: ${f.stewards.map(esc).join(', ') || '—'}`),
    f.settings.requireTags ? el('div', { class: 'xs' }, el('span', { class: 'tag' }, 'tags required')) : null,
    el('div', { class: 'row wrap', style: 'margin-top:8px;gap:6px' },
      el('a', { class: 'btn sm', href: `/f/${f.slug}/mod/log` }, 'Audit log'),
      f.perms.canModerate ? el('a', { class: 'btn sm', href: `/f/${f.slug}/mod/queue` }, 'Mod queue') : null,
      f.perms.canManageFeed ? el('a', { class: 'btn sm', href: `/f/${f.slug}/settings` }, 'Feed settings') : null));

  const rules = f.rules.length ? el('div', { class: 'card' }, el('h2', {}, 'Rules'),
    el('ol', { style: 'margin:0;padding-left:18px' }, ...f.rules.map((r) =>
      el('li', { class: 'small', style: 'margin-bottom:6px' }, el('strong', {}, r.title), r.body ? el('div', { class: 'xs muted' }, r.body) : null)))) : null;

  const main = el('div', {}, banNotice, feed.main);
  return { main, side: el('div', { class: 'side' }, about, rules, limitsSidebar(), feedsSidebar()) };
}

// ---------- thread ----------
export function threadView(params, query) {
  const t = sel.thread(S(), V(), params.id, 'best', NOW());
  if (!t) return { main: emptyState('No such post', 'This post does not exist.'), side: null };
  const p = t.post;
  const main = el('div', {});

  // post card
  const head = el('div', { class: 'card' },
    el('div', { class: 'row', style: 'gap:12px;align-items:flex-start' },
      voteBox('post', p.id, p, t.perms.canVote),
      el('div', { class: 'grow' },
        el('div', { class: 'row wrap', style: 'gap:6px' },
          el('a', { href: `/f/${p.feedSlug}`, class: 'xs' }, `f/${p.feedSlug}`),
          p.pinned ? el('span', { class: 'chip badge-pin' }, '📌 pinned') : null,
          p.locked ? el('span', { class: 'chip badge-locked' }, '🔒 locked') : null,
          p.nsfw ? el('span', { class: 'chip badge-nsfw' }, 'NSFW') : null,
          p.spoiler ? el('span', { class: 'chip badge-spoiler' }, 'spoiler') : null,
          p.tagId ? el('span', { class: 'tag' }, p.tagId) : null),
        el('h1', {}, p.maskedRemoved ? '[removed by stewards]' : p.title),
        p.format === 'link' && p.url ? el('div', {}, el('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', class: 'domain' }, `${p.url} (${domainOf(p.url)})`)) : null,
        p.body && !p.maskedRemoved ? el('div', { class: 'small', html: mdLite(p.body) }) : null,
        el('div', { class: 'postmeta' },
          p.author ? el('a', { href: `/u/${p.author}` }, p.author) : el('span', { class: 'muted' }, '[removed]'),
          el('span', {}, timeAgo(p.createdTs) + ' ago'),
          el('span', {}, `${p.commentCount} comments`),
          t.perms.canReport ? linkAction('report', () => doReport('post', p.id, p.feedId)) : null,
          saveInline('post', p.id, p.saved),
          ...(t.perms.canModerate ? modInline('post', p) : [])))));
  main.append(head);

  if (t.locked) main.append(el('div', { class: 'notice lock' }, '🔒 This thread is locked. New comments are disabled.'));

  // composer
  if (t.perms.canComment && !t.locked) main.append(composer(p.id));
  else if (!t.perms.loggedIn) main.append(gate('Log in to join the discussion.'));
  else if (t.perms.bannedHere) main.append(el('div', { class: 'notice ban' }, 'You are banned in this Feed and cannot comment.'));

  // comments
  const ctx = { canVote: t.perms.canVote, canComment: t.perms.canComment, canReport: t.perms.canReport,
    canModerate: t.perms.canModerate, locked: t.locked, feedId: p.feedId, feedSlug: p.feedSlug };
  // A SECOND sort list, for comments inside a thread. The plan's phase list
  // named only the board's `SORTS`; this one was found by grepping rather than
  // by reading the plan, and it is the kind of duplicate a phase list assembled
  // from a description reliably misses.
  const sortRow = tabs([['Best', `/f/${p.feedSlug}/p/${p.id}?sort=best`], ['Top', `/f/${p.feedSlug}/p/${p.id}?sort=top`],
    ['New', `/f/${p.feedSlug}/p/${p.id}?sort=new`]],
    (query.sort || 'best'));
  main.append(el('div', { class: 'card' },
    el('div', { class: 'row spread' }, el('h2', {}, `${t.total} comments`), null), sortRow,
    ...(t.comments.length ? t.comments.map((c) => commentNode(c, ctx)) : [el('div', { class: 'muted small' }, 'No comments yet.')])));

  return { main, side: el('div', { class: 'side' }, feedsSidebar()) };
}

function composer(postId) {
  const ta = el('textarea', { placeholder: 'What are your thoughts?' });
  const btn = el('button', { class: 'btn primary' }, 'Comment');
  btn.addEventListener('click', async () => {
    if (!ta.value.trim()) return;
    try { await actions.createComment(postId, null, ta.value.trim()); ta.value = ''; toast('Comment posted.', 'ok'); } catch {}
  });
  return el('div', { class: 'card' }, ta, el('div', { style: 'margin-top:8px' }, btn));
}

function linkAction(label, fn) { const b = el('button', { class: 'linkish' }, label); b.style.cssText = 'background:none;border:none;color:var(--muted);cursor:pointer;padding:0;font-size:13px'; b.addEventListener('click', fn); return b; }
function saveInline(type, id, saved) { return linkAction(saved ? 'unsave' : 'save', async () => { try { await actions.setSave(type, id, !saved); } catch {} }); }
async function doReport(type, id, feedId) { const r = prompt('Report reason:', 'Spam'); if (!r) return; try { await actions.report(type, id, feedId, r, ''); toast('Report filed.', 'ok'); } catch {} }
function modInline(type, p) {
  const act = (label, evType, extra = {}) => linkAction(label, async () => {
    const reason = evType === 'mod.removed' ? (prompt('Reason:', 'Rule violation') || '') : '';
    if (evType === 'mod.removed' && !reason) return;
    try { await actions.mod(evType, { subjectType: type, subjectId: p.id, reason, ...extra }); toast('Done.', 'ok'); } catch {}
  });
  const out = [];
  out.push(p.removed ? act('approve', 'mod.approved') : act('remove', 'mod.removed'));
  out.push(p.locked ? act('unlock', 'mod.unlocked') : act('lock', 'mod.locked'));
  out.push(p.pinned ? act('unpin', 'mod.unpinned') : act('pin', 'mod.pinned'));
  return out;
}

// ---------- audit log (public) ----------
const ACTION_LABEL = {
  'mod.removed': 'removed', 'mod.approved': 'approved', 'mod.locked': 'locked', 'mod.unlocked': 'unlocked',
  'mod.pinned': 'pinned', 'mod.unpinned': 'unpinned', 'mod.banned': 'banned', 'mod.unbanned': 'unbanned',
  'mod.stewardAdded': 'steward+', 'mod.stewardRemoved': 'steward-',
};
export function auditView(params) {
  const log = sel.auditLog(S(), V(), params.slug);
  if (!log) return { main: emptyState('No such Feed', ''), side: null };
  const main = el('div', {}, el('h1', {}, `Audit log — f/${log.slug}`),
    el('p', { class: 'muted small' }, 'This log is public. Every steward action appears here.'));
  if (!log.entries.length) main.append(emptyState('Nothing logged yet', 'Steward actions will show up here.'));
  else {
    const card = el('div', { class: 'card' });
    for (const e of log.entries) {
      const tag = ACTION_LABEL[e.type] || e.type;
      const subj = e.userHandle ? `${e.userHandle}` : `${e.subjectType} ${e.subjectId}`;
      card.append(el('div', { class: 'logrow' },
        el('span', { class: 'when' }, timeAgo(e.ts) + ' ago'),
        el('span', { class: `action-tag ${tag.replace(/\W/g, '')}` }, tag),
        el('span', { class: 'grow small' }, `${esc(e.by)} → ${esc(subj)}`, e.reason ? el('span', { class: 'muted' }, ` — ${esc(e.reason)}`) : null)));
    }
    main.append(card);
  }
  return { main, side: el('div', { class: 'side' }, feedsSidebar()) };
}

// ---------- mod queue ----------
export function queueView(params) {
  const q = sel.modQueue(S(), V(), params.slug, NOW());
  if (!q) return { main: emptyState('No such Feed', ''), side: null };
  if (q.gated) return { main: gate('Only stewards can see the mod queue.'), side: null };
  const main = el('div', {}, el('h1', {}, `Mod queue — f/${q.slug}`),
    el('p', { class: 'muted small' }, 'Keys: j/k move · a approve · r remove'));

  const items = [];
  for (const r of q.reports) items.push({ kind: 'report', r });
  for (const h of q.held) items.push({ kind: 'held', h });

  if (!items.length) { main.append(emptyState('Queue is clear', 'No open reports or held posts.')); return wrapSide(main, params.slug); }

  let focus = 0;
  const nodes = [];
  const render = () => {
    list.innerHTML = '';
    items.forEach((it, i) => {
      const node = it.kind === 'report' ? queueReport(it.r, params.slug) : queueHeld(it.h, params.slug);
      node.classList.toggle('focused', i === focus);
      nodes[i] = node; list.append(node);
    });
  };
  const list = el('div', {});
  const handler = (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'j') { focus = Math.min(items.length - 1, focus + 1); render(); nodes[focus]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'k') { focus = Math.max(0, focus - 1); render(); nodes[focus]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'a') actOn(items[focus], 'mod.approved', params.slug);
    else if (e.key === 'r') actOn(items[focus], 'mod.removed', params.slug);
  };
  document.addEventListener('keydown', handler);
  main._cleanup = () => document.removeEventListener('keydown', handler);
  render(); main.append(list);
  return wrapSide(main, params.slug);
}
function wrapSide(main, slug) { return { main, side: el('div', { class: 'side' }, el('div', { class: 'card' }, el('a', { href: `/f/${slug}` }, '← back to feed'), el('br'), el('a', { href: `/f/${slug}/mod/log` }, 'Public audit log')), feedsSidebar()) }; }

async function actOn(item, evType, slug) {
  const subjectType = item.kind === 'report' ? item.r.subjectType : 'post';
  const subjectId = item.kind === 'report' ? item.r.subjectId : item.h.post.id;
  const reason = evType === 'mod.removed' ? (prompt('Removal reason:', item.kind === 'report' ? item.r.reason : 'Automod hold') || '') : '';
  if (evType === 'mod.removed' && !reason) return;
  try { await actions.mod(evType, { subjectType, subjectId, reason }); toast(evType === 'mod.removed' ? 'Removed.' : 'Approved.', 'ok'); } catch {}
}
function queueReport(r, slug) {
  const box = el('div', { class: 'queue-item' },
    el('div', { class: 'row spread' }, el('strong', {}, `Report: ${esc(r.reason)}`), el('span', { class: 'xs muted' }, `by ${esc(r.reporter)} · ${timeAgo(r.ts)} ago`)),
    r.detail ? el('div', { class: 'xs muted' }, esc(r.detail)) : null,
    el('div', { class: 'small', style: 'margin:6px 0', html: r.subject.maskedRemoved ? '[removed]' : mdLite(r.subject.body || r.subject.title || '') }),
    el('div', { class: 'row', style: 'gap:8px' },
      btn('Approve (keep)', 'primary sm', () => actOn({ kind: 'report', r }, 'mod.approved', slug)),
      btn('Remove', 'danger sm', () => actOn({ kind: 'report', r }, 'mod.removed', slug))));
  return box;
}
function queueHeld(h, slug) {
  return el('div', { class: 'queue-item' },
    el('div', { class: 'row spread' }, el('strong', {}, `Held post: ${esc(h.post.title)}`), el('span', { class: 'xs muted' }, `by ${esc(h.post.author)} · ${timeAgo(h.post.createdTs)} ago`)),
    el('div', { class: 'small', style: 'margin:6px 0', html: mdLite(h.post.body || '') }),
    el('div', { class: 'row', style: 'gap:8px' },
      btn('Approve (publish)', 'primary sm', () => actOn({ kind: 'held', h }, 'mod.approved', slug)),
      btn('Remove', 'danger sm', () => actOn({ kind: 'held', h }, 'mod.removed', slug))));
}
function btn(label, cls, fn) { const b = el('button', { class: 'btn ' + cls }, label); b.addEventListener('click', fn); return b; }

// ---------- profile ----------
export function profileView(params, query) {
  const tab = query.tab || 'overview';
  const pr = sel.profile(S(), V(), params.handle, tab, NOW());
  if (!pr) return { main: emptyState('No such user', ''), side: null };
  const main = el('div', {}, el('h1', {}, `u/${pr.handle}`),
    pr.suspended ? el('div', { class: 'notice ban' }, 'This account is suspended.') : null,
    el('div', { class: 'card' }, el('div', { class: 'rep' },
      el('div', {}, el('div', { class: 'n' }, fmtScore(pr.rep.post)), el('div', { class: 'xs muted' }, 'post reputation')),
      el('div', {}, el('div', { class: 'n' }, fmtScore(pr.rep.comment)), el('div', { class: 'xs muted' }, 'comment reputation')),
      el('div', {}, el('div', { class: 'xs muted', style: 'margin-top:18px' }, `joined ${timeAgo(pr.registeredTs)} ago`)))));

  const tlist = [['Overview', `/u/${pr.handle}?tab=overview`], ['Posts', `/u/${pr.handle}?tab=posts`], ['Comments', `/u/${pr.handle}?tab=comments`]];
  if (pr.canSeeSaved) tlist.push(['Saved', `/u/${pr.handle}?tab=saved`]);
  main.append(el('div', { class: 'tabs' }, ...tlist.map(([l, h]) => el('a', { class: 'tab' + (l.toLowerCase() === tab ? ' active' : ''), href: h }, l))));

  const card = el('div', { class: 'card' });
  if (tab === 'posts' || tab === 'overview') pr.posts.slice(0, tab === 'overview' ? 5 : 100).forEach((p) => card.append(postRow(p, false)));
  if (tab === 'comments' || tab === 'overview') pr.comments.slice(0, tab === 'overview' ? 5 : 100).forEach((c) => card.append(profileComment(c)));
  if (tab === 'saved') {
    if (!pr.saved.length) card.append(el('div', { class: 'muted small' }, 'Nothing saved yet.'));
    pr.saved.forEach((s) => s.type === 'post' ? card.append(postRow(s.item, false)) : card.append(profileComment(s.item)));
  }
  if (!card.children.length) card.append(el('div', { class: 'muted small' }, 'Nothing here yet.'));
  main.append(card);
  return { main, side: el('div', { class: 'side' }, feedsSidebar()) };
}
function profileComment(c) {
  return el('div', { class: 'postrow' }, el('div', {}),
    el('div', {}, el('div', { class: 'small', html: c.maskedRemoved ? '[removed]' : mdLite(c.body) }),
      el('div', { class: 'postmeta' }, el('span', {}, `${fmtScore(c.score)} pts`), c.postTitle ? el('a', { href: `/f/x/p/${c.postId}` }, `on “${esc(c.postTitle).slice(0, 48)}”`) : null, el('span', {}, timeAgo(c.createdTs) + ' ago'))));
}

// ---------- notifications ----------
const NOTIF_LABEL = { reply: 'replied to your comment', 'post-reply': 'commented on your post', removed: 'removed your content', 'report-actioned': 'a report you filed was actioned' };
export function notificationsView() {
  if (!V()) return { main: gate('Log in to see notifications.'), side: null };
  const n = sel.notifications(S(), V());
  const main = el('div', {}, el('div', { class: 'row spread' }, el('h1', {}, 'Notifications'),
    n.unread ? btn('Mark all read', 'sm', async () => { await actions.markNotificationsRead(n.items.map((x) => x.id)); }) : null));
  if (!n.items.length) { main.append(emptyState('Nothing growing here yet', 'You have no notifications.')); return { main, side: null }; }
  const card = el('div', { class: 'card' });
  for (const item of n.items) {
    const href = item.subjectType === 'comment' && item.postId ? `/f/x/p/${item.postId}` : '#';
    card.append(el('div', { class: 'logrow' + (item.read ? '' : ''), style: item.read ? '' : 'font-weight:600' },
      el('span', { class: 'when' }, timeAgo(item.ts) + ' ago'),
      el('span', { class: 'grow small' }, `${esc(item.from)} ${NOTIF_LABEL[item.kind] || item.kind}`),
      !item.read ? el('span', { class: 'chip joined' }, 'new') : null));
  }
  main.append(card);
  return { main, side: null };
}

// ---------- search ----------
export function searchView(params, query) {
  const q = query.q || '';
  const type = query.type || 'post';
  const res = sel.search(S(), V(), q, query.scope || 'all', type, NOW());
  const main = el('div', {}, el('h1', {}, 'Search'));
  const input = el('input', { type: 'text', value: q, placeholder: 'Search posts and comments…' });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(`/search?q=${encodeURIComponent(input.value)}&type=${type}`); });
  main.append(el('div', { class: 'card' }, input,
    el('div', { class: 'tabs', style: 'margin-top:10px' },
      el('a', { class: 'tab' + (type === 'post' ? ' active' : ''), href: `/search?q=${encodeURIComponent(q)}&type=post` }, 'Posts'),
      el('a', { class: 'tab' + (type === 'comment' ? ' active' : ''), href: `/search?q=${encodeURIComponent(q)}&type=comment` }, 'Comments')),
    el('span', { class: 'frontier-chip' }, 'facets: frontier')));
  if (!q) main.append(el('div', { class: 'muted small', style: 'padding:16px' }, 'Type a query and press Enter.'));
  else if (!res.results.length) main.append(emptyState('No results', `Nothing matched “${esc(q)}”.`));
  else { const card = el('div', { class: 'card' }); res.results.forEach((r) => r.type === 'post' ? card.append(postRow(r.item, false)) : card.append(profileComment(r.item))); main.append(card); }
  return { main, side: null };
}

// ---------- submission wizard (4 linear steps) ----------
export function submitView(params, query) {
  if (!V()) return { main: gate('Log in to post.'), side: null };
  const state = { step: 1, feedSlug: query.f || '', format: 'text', title: '', body: '', url: '', tagId: '', nsfw: false, spoiler: false };
  const feeds = sel.feedList(S(), V());
  const host = el('div', { class: 'card' });
  const render = () => {
    host.innerHTML = '';
    host.append(el('div', { class: 'wizard-steps' }, ...['Feed', 'Format', 'Content', 'Review'].map((s, i) =>
      el('span', { class: 'step' + (state.step === i + 1 ? ' active' : '') }, `${i + 1}. ${s}`))));
    if (state.step === 1) step1();
    else if (state.step === 2) step2();
    else if (state.step === 3) step3();
    else step4();
  };
  const next = () => { state.step++; render(); };
  const back = () => { state.step--; render(); };

  function step1() {
    const sel2 = el('select', { class: 'form' }, el('option', { value: '' }, '— choose a feed —'),
      ...feeds.map((f) => el('option', { value: f.slug, selected: f.slug === state.feedSlug || false }, `f/${f.slug}`)));
    sel2.addEventListener('change', () => (state.feedSlug = sel2.value));
    host.append(fieldRow('Post to which Feed?', sel2),
      el('button', { class: 'btn primary', onclick: () => { if (!state.feedSlug) return toast('Pick a Feed.', 'err'); next(); } }, 'Next →'));
  }
  function step2() {
    const tabsEl = el('div', { class: 'format-tabs' },
      fmtTab('text', 'Text'), fmtTab('link', 'Link'), fmtTab('media', 'Media', true));
    host.append(tabsEl, el('div', { class: 'row', style: 'gap:8px' },
      el('button', { class: 'btn', onclick: back }, '← Back'), el('button', { class: 'btn primary', onclick: next }, 'Next →')));
  }
  function fmtTab(fmt, label, locked) {
    const t = el('div', { class: 'ft' + (state.format === fmt ? ' active' : '') + (locked ? ' locked' : ''),
      ...(locked ? { 'aria-disabled': 'true' } : {}) }, label,
      locked ? el('div', { class: 'xs' }, 'frontier') : null);
    if (!locked) t.addEventListener('click', () => { state.format = fmt; render(); });
    return t;
  }
  function step3() {
    const feed = feeds.find((f) => f.slug === state.feedSlug);
    const fdata = sel.feed(S(), V(), state.feedSlug, NOW());
    const title = el('input', { type: 'text', value: state.title, placeholder: 'Title' });
    title.addEventListener('input', () => (state.title = title.value));
    host.append(fieldRow('Title', title));
    if (state.format === 'text') {
      const body = el('textarea', { placeholder: 'Body (markdown-lite: **bold**, *italic*, `code`)' }); body.value = state.body;
      body.addEventListener('input', () => (state.body = body.value));
      host.append(fieldRow('Body', body));
    } else {
      const url = el('input', { type: 'url', value: state.url, placeholder: 'https://…' });
      url.addEventListener('input', () => { state.url = url.value; checkDupe(); });
      const dupe = el('div', { class: 'xs', style: 'color:var(--clay-600)' });
      const checkDupe = () => {
        const hit = Object.values(S().posts).find((pp) => pp.url && pp.url === state.url.trim() && !pp.deleted);
        dupe.textContent = hit ? `⚠ Possible duplicate: “${hit.title}” was already posted.` : '';
      };
      url.addEventListener('blur', checkDupe);
      host.append(fieldRow('URL', url, dupe));
    }
    if (fdata?.settings.requireTags) {
      const tag = el('input', { type: 'text', value: state.tagId, placeholder: 'e.g. guide, help, chat' });
      tag.addEventListener('input', () => (state.tagId = tag.value));
      host.append(fieldRow('Tag (required in this Feed)', tag));
    }
    const nsfw = el('input', { type: 'checkbox' }); nsfw.checked = state.nsfw; nsfw.addEventListener('change', () => (state.nsfw = nsfw.checked));
    const spoiler = el('input', { type: 'checkbox' }); spoiler.checked = state.spoiler; spoiler.addEventListener('change', () => (state.spoiler = spoiler.checked));
    host.append(el('div', { class: 'row', style: 'gap:16px' },
      el('label', { class: 'xs' }, nsfw, ' NSFW'), el('label', { class: 'xs' }, spoiler, ' Spoiler')),
      el('div', { class: 'row', style: 'gap:8px;margin-top:12px' },
        el('button', { class: 'btn', onclick: back }, '← Back'),
        el('button', { class: 'btn primary', onclick: () => {
          if (!state.title.trim()) return toast('Title is required.', 'err');
          if (fdata?.settings.requireTags && !state.tagId.trim()) return toast('This Feed requires a tag.', 'err');
          if (state.format === 'link' && !state.url.trim()) return toast('URL is required.', 'err');
          next();
        } }, 'Review →')));
  }
  function step4() {
    const fdata = sel.feed(S(), V(), state.feedSlug, NOW());
    const wouldHold = (fdata?.settings.automod || []).some((r) => `${state.title} ${state.body}`.toLowerCase().includes((r.match || '').toLowerCase()));
    host.append(el('div', { class: 'stack' },
      el('div', { class: 'muted xs' }, `Posting to f/${state.feedSlug} as ${state.format}`),
      el('h2', {}, state.title),
      state.format === 'text' ? el('div', { class: 'small', html: mdLite(state.body) }) : el('a', { href: state.url, target: '_blank' }, state.url),
      state.tagId ? el('span', { class: 'tag' }, state.tagId) : null,
      wouldHold ? el('div', { class: 'notice lock' }, '⏳ Automod will hold this for steward review (matched a rule).') : null,
      el('div', { class: 'row', style: 'gap:8px' },
        el('button', { class: 'btn', onclick: back }, '← Back'),
        el('button', { class: 'btn primary', onclick: submit }, 'Submit'))));
  }
  async function submit() {
    const feed = sel.feed(S(), V(), state.feedSlug, NOW());
    try {
      const ev = await actions.createPost({ feedId: feed.id, format: state.format, title: state.title.trim(),
        bodyMd: state.body, url: state.url.trim(), tagId: state.tagId.trim() || null, nsfw: state.nsfw, spoiler: state.spoiler });
      toast('Posted.', 'ok');
      go(`/f/${state.feedSlug}/p/${ev.payload.id}`);
    } catch (e) { /* rate-limit toast already shown */ }
  }

  render();
  return { main: el('div', {}, el('h1', {}, 'New post'), host), side: null };
}

// ---------- create feed ----------
export function createFeedView() {
  const perms = sel.permissions(S(), V(), undefined, NOW());
  if (!perms.canCreateFeed) return { main: gate(perms.probation ? 'Probation accounts cannot create Feeds yet.' : 'Log in to create a Feed.'), side: null };
  const slug = el('input', { type: 'text', placeholder: 'slug (lowercase, no spaces)' });
  const title = el('input', { type: 'text', placeholder: 'Title' });
  const desc = el('textarea', { placeholder: 'Description' });
  const host = el('div', { class: 'card' },
    fieldRow('Slug', slug),
    fieldRow('Title', title),
    fieldRow('Description', desc),
    el('button', { class: 'btn primary', onclick: async () => {
      const s = slug.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!s || !title.value.trim()) return toast('Slug and title required.', 'err');
      if (Object.values(S().feeds).some((f) => f.slug === s)) return toast('That slug is taken.', 'err');
      try {
        await actions.createFeed({ slug: s, title: title.value.trim(), description: desc.value.trim() });
      } catch { return; } // the action already toasted the refusal
      toast('Feed created.', 'ok'); go(`/f/${s}`);
    } }, 'Create feed'));
  return { main: el('div', {}, el('h1', {}, 'Create a feed'), host), side: null };
}

// 3g: the memory-mode /h/ tag stream — same route scheme as the Bluesky view.
export function tagStreamView(params) {
  const s = store.getState();
  const r = sel.tagStream(s, store.getPersonaId(), params.tag, store.nowSec());
  const card = el('div', { class: 'card' });
  for (const p of r.posts) card.append(postRow(p, r.perms.canVote));
  const main = el('div', {},
    el('h1', {}, `#${r.tag}`),
    el('div', { class: 'xs muted', style: 'margin-bottom:8px' }, 'Tagged posts across every Feed.'),
    r.posts.length ? card : emptyState('No tagged posts', `Nothing carries #${r.tag} yet.`));
  return { main, side: null };
}

// ---------- feed settings (owner) ----------
export function feedSettingsView(params) {
  const f = sel.feed(S(), V(), params.slug, NOW());
  if (!f) return { main: emptyState('No such Feed', ''), side: null };
  if (!f.perms.canManageFeed) return { main: gate('Only the owner can change Feed settings.'), side: null };
  const desc = el('textarea', {}); desc.value = f.description;
  const reqTags = el('input', { type: 'checkbox' }); reqTags.checked = f.settings.requireTags;
  const host = el('div', { class: 'card' },
    fieldRow('Description', desc),
    el('label', { class: 'xs' }, reqTags, ' Require a tag on every post'),
    el('div', { style: 'margin-top:12px' }, el('button', { class: 'btn primary', onclick: async () => {
      await actions.updateFeedSettings(f.id, { requireTags: reqTags.checked, description: desc.value.trim() });
      toast('Settings saved.', 'ok'); go(`/f/${f.slug}`);
    } }, 'Save')));
  return { main: el('div', {}, el('h1', {}, `Settings — f/${f.slug}`),
    el('p', { class: 'muted small' }, `Steward management and the rules editor are owner tools; stewards: ${f.stewards.join(', ')}`), host), side: null };
}

// NOTE FOR ANY FUTURE field->feed RENAME: `field-row` here is a FORM FIELD,
// not a Feed. The 2026-08-26 rename spared fieldRow(), fieldset and
// subjectField by name but swept this class LITERAL to 'feed-row', while
// css/app.css kept styling `.field-row` — so every form row in the app lost its
// styling and nothing failed. test/css-classes.test.js now catches that.
//
// A <label> that merely sits NEXT TO an input names nothing. A screen reader
// announces "edit text, blank", and clicking the label does not focus the
// feed. Both are fixed by one association: label[for] -> control[id].
//
// Centralised because the bare pattern was repeated at 17 call sites and 14 of
// them were unlabelled — this is not a thing to remember per form. Rows that
// hold a LINK or a readout rather than a control (Mode, Accounts, Version) are
// not form feeds; they keep their plain label and are left alone.
let fieldSeq = 0;
export function fieldRow(labelText, control, ...extra) {
  const isControl = /^(INPUT|SELECT|TEXTAREA)$/.test(control?.tagName ?? '');
  if (!isControl) return el('div', { class: 'field-row' }, el('label', {}, labelText), control, ...extra);
  if (!control.id) control.id = `fr-${++fieldSeq}`;
  return el('div', { class: 'field-row' }, el('label', { for: control.id }, labelText), control, ...extra);
}

// ---------- settings / prefs ----------
export function settingsView() {
  // Skins subsumed themes (plan 2026-08-26-1): the separate Theme control is
  // gone, because a palette IS a skin. Light and dark are two entries in the
  // list below, and the masthead toggle is the shortcut between paired ones.
  // 3d (OQ4): the front-door/mode preference is a device-local setting —
  // "it's local to them". The dev-bar Mode control is a scaffolding mirror.
  // 3o: which build is this device running? (owner ask) — a stale service
  // worker is the usual answer to "my change isn't there".
  const versionOut = el('span', { class: 'small muted', 'data-version': 'pending' }, 'checking…');
  Promise.all([version.deployedVersion(), version.runningVersion()]).then(([deployed, running]) => {
    const st = version.versionStatus({ deployed, running });
    versionOut.setAttribute('data-version', st.state);
    versionOut.replaceChildren(st.label);
    if (st.state === 'stale') {
      const b = el('button', { class: 'btn sm', style: 'margin-left:8px' }, 'Reload now');
      b.addEventListener('click', () => location.reload());
      versionOut.append(b);
    }
  });
  // 4a: the skin picker — skins and modes are independent axes; any skin in
  // any mode. Device-local, like theme and front door.
  //
  // FAMILY-SHAPED (plan 2026-08-26-2 Phase 1, owner-decided). One row per style,
  // not one per skin: four rows instead of seven. Grouping the flat list into
  // Light and Dark optgroups was the previous attempt at the same problem and
  // it made the wrong thing the choice — "Forage (light)" and "Forage (dark)"
  // read as two unrelated themes in two separate lists, so picking a style
  // meant knowing which half of the list you were allowed to look in. Here the
  // row IS the style and the ☾/☀ toggle is the side.
  //
  // The MODEL did not change: `forage.skin` still stores one concrete skin id.
  // This select's value is a FAMILY id, which is resolved to a skin on change
  // — and the two namespaces overlap on bbs/usenet/phpbb, so nothing may read
  // this value as a skin id.
  const curFamily = skins.SKINS[skins.activeSkin()]?.family ?? null;
  const skinSel = el('select', { class: 'form', id: 'pref-skin' },
    ...skins.families().map((f) => el('option',
      { value: f.id, 'data-family': f.id, selected: f.id === curFamily || false },
      f.sole ? `${f.label} — ${f.dark ? 'dark' : 'light'} only` : f.label)));
  skinSel.addEventListener('change', () => {
    // The palette is read HERE rather than captured at render time: setSkin
    // re-renders, and a captured value would be one change stale.
    const palette = skins.SKINS[skins.activeSkin()]?.palette ?? 'light';
    skins.setSkin(skins.resolveInFamily(skinSel.value, palette));
  });
  const themeCard = el('div', { class: 'card' },
    fieldRow('Skin', skinSel),
    // Say where the other half of the choice lives. Without this the picker
    // silently lost four rows and nothing tells you the toggle gained them.
    el('div', { class: 'xs muted', style: 'margin:-4px 0 8px' },
      'Light or dark is the ☾ toggle in the top bar. A style that ships one palette says so.'),
    el('div', { class: 'field-row' }, el('label', {}, 'Mode'),
      el('a', { href: '/mode' }, 'Bluesky view ↔ Memory sandbox — choose at /mode')),
    el('div', { class: 'field-row' }, el('label', {}, 'Accounts'),
      el('a', { href: '/me' }, 'Switch account, add another, or sign out')),
    el('div', { class: 'field-row' }, el('label', {}, 'Version'), versionOut),
    el('div', { class: 'xs muted' }, 'Skin and mode are this device only.'));

  if (!V()) {
    return { main: el('div', {}, el('h1', {}, 'Preferences'), themeCard,
      el('p', { class: 'muted small', style: 'margin-top:12px' }, 'Log in to set comment and feed preferences.')), side: null };
  }
  const prefs = S().users[V()].prefs;
  const thr = el('input', { type: 'number', id: 'pref-threshold', value: prefs.commentThreshold });
  thr.addEventListener('change', async () => { await actions.updatePrefs({ commentThreshold: parseInt(thr.value, 10) || 0 }); });
  const sort = el('select', { class: 'form', id: 'pref-sort' }, ...['hot', 'new', 'top', 'best'].map((s) => el('option', { value: s, selected: prefs.defaultSort === s || false }, s)));
  sort.addEventListener('change', async () => { await actions.updatePrefs({ defaultSort: sort.value }); });
  return { main: el('div', {}, el('h1', {}, 'Preferences'),
    themeCard,
    el('div', { class: 'card', style: 'margin-top:12px' },
      fieldRow('Auto-collapse comments below score', thr),
      fieldRow('Default feed sort', sort))), side: null };
}

// ---------- about the dev bar (meta) ----------
const DEVBAR_DOCS = [
  { name: 'Persona', kind: 'the dropdown',
    what: 'Switches which “seat” you are browsing as. Forage has no login in this prototype — identity is this dropdown. Switching re-derives every viewer-dependent view at once: permissions, vote state, unread counts, what is masked or gated.',
    when: 'Whenever you want to see the app from another vantage. Each seat is chosen to cover a different slice of the product.',
    seats: [
      ['Logged out', 'Public reads only; every write shows an auth gate.'],
      ['admin.wren', 'Site admin — can suspend accounts and act sitewide.'],
      ['owner.sage', 'Owner of f/gardening — Feed settings, rules, held-post review.'],
      ['steward.briar', 'Steward of f/gardening, plain member elsewhere — the dual-hat mod experience.'],
      ['member.fern', 'Established member — the default reader seat.'],
      ['newbie.moss', 'On probation — rate-limited, cannot create Feeds, low report weight.'],
      ['banned.thorn', 'Banned in f/gardening (read-only there), active elsewhere.'],
      ['heavy.aspen', 'High reputation, sitting at the post rate limit, saved items populated.'],
      ['pristine.dove', 'Never seeded — the permanent first-run / empty-state seat.'],
    ] },
  { name: 'Seed', kind: 'button',
    what: 'Loads the scripted demo scenario: five feeds, varied posts (long/link/duplicate/NSFW/spoiler/pinned/locked/removed/held), a public audit log, in-flight moderation states, and a generated ~1,000-comment stress thread.',
    when: 'To get the populated demo back after clearing, or to reset to a known-good starting state. Deterministic — you get the same world every time.' },
  { name: 'Delete All', kind: 'button',
    what: 'Wipes all local data (the entire event log in your browser) back to the genuine first-run state — no Feeds, no posts, logged out.',
    when: 'To see cold-start and empty states as a brand-new visitor would, or to start over. Nothing leaves your browser; this only clears local storage.' },
  { name: 'Export', kind: 'button',
    what: 'Downloads the whole event log as a JSON file (forage-export.json). Because state is a pure fold over that log, the file is a complete, portable snapshot.',
    when: 'To capture a specific state — a bug repro, a demo setup — so you or someone else can reload it exactly.' },
  { name: 'Import', kind: 'button',
    what: 'Loads a previously exported JSON file and replays it, replacing current state.',
    when: 'To restore a snapshot, or to hand a precise state between machines. Pair it with Export.' },
  { name: 'Latency', kind: 'the dropdown (0 / 250 / 600 ms)',
    what: 'Injects an artificial delay into every write (posting, voting, moderating) so you can watch the loading path instead of instant local writes.',
    when: 'Set 250 or 600 ms to see skeleton/loading states and to make optimistic UI visible — e.g. a vote fills immediately, then settles when the “server” responds.' },
  { name: 'Fail Next', kind: 'toggle button',
    what: 'Arms a one-shot failure: the very next write is rejected, then the switch disarms itself.',
    when: 'To exercise error handling and optimistic rollback. Arm it, then boost a post (ideally with Latency at 600 ms): the arrow fills green, then reverts with an error toast when the write fails.' },
  { name: 'Frontiers', kind: 'toggle button',
    what: 'Shows or hides the dashed “frontier” markers — features deliberately deferred to the scaled backend (media upload, search facets, vote-ring detection, and so on).',
    when: 'Hide them for a cleaner demo; show them to talk through what v1 intentionally leaves for later. The full list lives at the Frontiers page.' },
  { name: 'SW unregister', kind: 'button',
    what: 'Unregisters the service worker — the PWA layer that caches the app shell for offline use.',
    when: 'If a stale cached build is being served after a deploy, or you want to force a fully network-only load. You can also append ?nosw to the URL to bypass the worker entirely.' },
];

export function aboutView() {
  const main = el('div', {},
    el('img', { class: 'about-banner', src: '/assets/banner-forum.jpg', alt: 'Forage — forum and community' }),
    el('h1', {}, 'About this demo'),
    el('div', { class: 'card' },
      el('p', { class: 'small' }, 'The dashed strip across the top is the ',
        el('strong', {}, 'dev bar'), ' — the control surface for this behavioral-twin prototype. Forage v1 runs entirely in your browser on an in-memory event log, with no backend yet. There is no login; instead you switch ',
        el('strong', {}, 'personas'), ' and drive the app through states that a real deployment would reach through many accounts and network conditions.'),
      el('p', { class: 'small muted' }, 'It is dashed on purpose: it is scaffolding, not product chrome, and would not ship in a production build. Everything it does is local to your browser — nothing is sent anywhere.')));

  for (const d of DEVBAR_DOCS) {
    const card = el('div', { class: 'card', style: 'margin-top:12px' },
      el('div', { class: 'row spread wrap', style: 'align-items:baseline' },
        el('h2', { style: 'margin:0' }, d.name),
        el('span', { class: 'xs muted' }, d.kind)),
      el('div', { class: 'small', style: 'margin-top:6px' }, el('strong', {}, 'What it does. '), d.what),
      el('div', { class: 'small', style: 'margin-top:4px' }, el('strong', {}, 'When to use it. '), d.when));
    if (d.seats) {
      const list = el('div', { class: 'stack', style: 'margin-top:8px' });
      for (const [seat, note] of d.seats)
        list.append(el('div', { class: 'row', style: 'gap:8px;align-items:baseline' },
          el('span', { class: 'chip', style: 'flex:none' }, seat), el('span', { class: 'xs muted' }, note)));
      card.append(list);
    }
    main.append(card);
  }
  main.append(el('p', { class: 'small muted', style: 'margin-top:16px' },
    'Related: ', el('a', { href: '/frontiers' }, 'Frontiers'), ' (what v1 defers) and ',
    el('a', { href: '/settings' }, 'Preferences'), ' (skin, comment threshold, default sort).'));
  return { main, side: null };
}

// ---------- frontiers ----------
export function frontiersView() {
  const main = el('div', {}, el('h1', {}, 'Frontiers'),
    el('p', { class: 'muted small' }, 'What this prototype deliberately defers — the frontier entries of the divergence ledger (ledger/divergence.js). Conformance refuses any drift the ledger does not name.'),
    ...frontiers().map((f) => el('div', { class: 'frontier-item' },
      el('div', { class: 'row spread' }, el('strong', {}, f.label), el('span', { class: 'frontier-chip' }, f.id + ' · deferred')),
      el('div', { class: 'small muted' }, f.description))));
  return { main, side: null };
}

// ---------- signup ----------
export function signupView() {
  const handle = el('input', { type: 'text', placeholder: 'handle' });
  const email = el('input', { type: 'email', placeholder: 'email (optional)' });
  return { main: el('div', {},
    el('img', { class: 'signup-art', src: '/assets/logo-wordmark.jpg', alt: 'Forage — a rook in a wreath as the O' }),
    el('h1', {}, 'Join Forage'),
    el('p', { class: 'muted' }, 'Forage the open web.'),
    el('div', { class: 'card' },
      fieldRow('Handle', handle),
      fieldRow('Email', email),
      el('button', { class: 'btn primary', onclick: async () => {
        const h = handle.value.trim();
        if (!h) return toast('Pick a handle.', 'err');
        if (Object.values(S().users).some((u) => u.handle === h)) return toast('Handle taken.', 'err');
        const { id } = await actions.registerAccount(h, email.value.trim());
        store.setPersona(id); // becomes a genuinely new persona in the dropdown
        toast(`Welcome, ${h}!`, 'ok'); go('/home');
      } }, 'Create account')),
    el('p', { class: 'xs muted', style: 'margin-top:12px' }, 'New accounts appear as a real persona in the dev bar.')), side: null };
}
