// Shared UI components. DOM built imperatively (no build step, no framework).

import { el, esc, mdLite, timeAgo, domainOf, fmtScore, plural } from '../util.js';
import * as actions from '../actions.js';
import { openMenu } from './menu.js';
import * as haptics from '../haptics.js';

// ---------- toasts ----------
export function toast(msg, kind = '') {
  const host = document.getElementById('toasts');
  // 4k: an empty message renders a wordless coloured block — `.toast.err` is a
  // red rectangle with 10px/14px of padding and nothing in it. That is not a
  // degraded message, it is an alarming one that says nothing, and it comes
  // straight from `toast(e.message, 'err')` where the error carries no message.
  // Say the least-wrong true thing instead of showing a blank.
  const text = String(msg ?? '').trim()
    || (kind === 'err' ? 'Something went wrong, and it gave no reason.' : 'Done.');
  const t = el('div', { class: `toast ${kind}` }, text);
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
// ---------- the vote (plan 2026-08-29 post-and-thread, decision 1) ----------
// ONE control, two layouts: the pill `▲ 35` on a post's action row, the
// count-over-arrow stack in a comment's avatar column. Both are a
// button[data-vote] with a real aria-pressed; a reader who cannot vote gets
// the same element as a read-only span carrying the count — the arrow is an
// action you cannot take, the number is a fact (owner, 2026-08-27). The glyph
// is an ARROW and never a heart: a like here is a promotion, not an affection.
//
// This folds `voteBox` and `miniVote` — two implementations of one idea, and
// the named risk of every earlier vote change — into one. e2e/no-downvote
// visits a row AND a comment for exactly that reason.
export function vote(subjectType, id, data, canVote, { layout = 'pill', onVote = null } = {}) {
  const n = el('span', { class: 'n' }, fmtScore(data.likes));
  const arrow = el('span', { class: 'arrow', 'aria-hidden': 'true' }, '\u25B2');
  const cls = layout === 'stack' ? 'avvote' : 'vote';
  const parts = layout === 'stack' ? [n, arrow] : [arrow, n];
  if (!canVote) {
    // role="img" + aria-label: a bare "12" says nothing about twelve of what
    return el('span', { class: cls, 'data-vote': subjectType, 'data-readonly': '1', role: 'img',
      'aria-label': plural(data.likes, 'like') }, ...parts);
  }
  const btn = el('button', { type: 'button', class: cls, 'data-vote': subjectType,
    'aria-pressed': String(data.myVote === 1), 'aria-label': 'Like', title: 'Like' }, ...parts);
  let myVote = data.myVote, score = data.likes;
  const paint = () => { btn.setAttribute('aria-pressed', String(myVote === 1)); n.textContent = fmtScore(score); };
  btn.addEventListener('click', async () => {
    const prevVote = myVote, prevScore = score;
    const next = myVote === 1 ? 0 : 1;
    // optimistic paint; the arithmetic is what makes un-liking correct
    myVote = next; score = prevScore - prevVote + next; paint();
    // decision 6: a buzz on the flip TO on, never on off — here, inside the
    // gesture and before the await, or Chrome ignores it
    if (next === 1) haptics.buzz();
    try {
      if (onVote) await onVote(next, prevVote);
      else await actions.setVote(subjectType, id, next);
      // store notify triggers a full re-render with the truth
    } catch (e) {
      myVote = prevVote; score = prevScore; paint(); // revert to the ORIGINAL, not one off
      if (e.message !== 'gated' && e.message !== 'banned') toast('Vote failed — reverted.', 'err');
    }
  });
  return btn;
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

// ---------- byline (plan 2026-08-29 post-and-thread, decisions 7 + 8) ----------
// Every post row and comment opens the same way: avatar slot · who · bare time
// · ⋯ top-right. The avatar slot draws initials until Phase 2 hands it a
// picture; the kebab has no handler until Phase 3 hands it the menu — both are
// SLOTS pinned by e2e/thread-byline.workflow.mjs so the header cannot drift
// between the tiers while the rest lands.
function initials(name) {
  const n = String(name || '').replace(/^@/, '').split('.')[0];
  return n ? n.slice(0, 2).toLowerCase() : '··';
}

export function avatarSlot(name, avatar = null) {
  const av = el('span', { class: 'av', 'aria-hidden': 'true' }, initials(name));
  if (avatar) av.append(el('img', { src: avatar, alt: '', loading: 'lazy' }));
  return av;
}

// `avatar: false` draws no slot — a comment's avatar lives in its own column
// (decision 1 + 2, Phase 8b), a row's opens the byline.
export function byline({ name, whoNode, ts, avatar = null, after = [], menu = null }) {
  return el('div', { class: 'byline' },
    avatar === false ? null : avatarSlot(name, avatar),
    whoNode,
    el('span', { class: 'dot' }),
    el('span', { 'data-time': '1', title: new Date(ts).toLocaleString() }, timeAgo(ts)),
    ...after.filter(Boolean),
    kebabFor(name, menu));
}

function kebabFor(name, menu) {
  const b = el('button', { class: 'kebab', type: 'button', 'aria-label': `More, by ${name || '[removed]'}`,
    'aria-haspopup': 'menu', 'aria-expanded': 'false' }, '⋯');
  // Groups are computed at press time, not render time, so Save/Unsave reads
  // the store as it is now. `menu` is a function returning groups (see
  // memoryMenuGroups) — the lens supplies its own in Phase 4b.
  if (menu) b.addEventListener('click', () => openMenu({ anchor: b, groups: menu() }));
  return b;
}

// ---------- the ⋯ menu's memory-tier contents (decision 3) ----------
// Groups, separators only, destructive last. Only items the persona can USE —
// the guest-surface rule — so a guest gets the two things anyone can do.
async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied.`, 'ok');
  } catch (e) {
    console.warn('forage: clipboard write failed', e);
    toast(`Could not copy the ${what.toLowerCase()} — your browser refused the clipboard.`, 'err');
  }
}

export function memoryMenuGroups({ type, subject, text, link, perms = {}, viewerId = null }) {
  const own = viewerId && subject.authorId === viewerId;
  const url = `${location.origin}${link}`;
  const first = [
    { label: 'Copy text', icon: '⧉', onSelect: () => copy(text, 'Text') },
    { label: 'Copy link', icon: '🔗', onSelect: () => copy(url, 'Link') },
  ];
  if (perms.loggedIn) {
    first.push({ label: subject.saved ? 'Unsave' : 'Save', icon: '☆',
      onSelect: async () => { try { await actions.setSave(type, subject.id, !subject.saved); } catch {} } });
  }
  const report = perms.canReport && !own ? [{ label: 'Report', icon: '⚑', danger: true, onSelect: () => reportSheet({
    what: type === 'post' ? 'this post' : 'this comment',
    reasons: [['Spam', 'Spam'], ['Incivility', 'Incivility'], ['Off-topic', 'Off-topic'], ['Rule violation', 'Rule violation']],
    onSubmit: async ({ reason, detail }) => {
      await actions.report(type, subject.id, subject.feedId ?? perms.feedId, reason, detail);
      toast('Report filed.', 'ok');
    },
  }) }] : [];
  const steward = perms.canModerate ? stewardItems(type, subject) : [];
  return [first, report, steward];
}

// The report sheet (4b): reasons as radios, an optional detail line, Send —
// a native <dialog>, the menu's pattern; replaces the prompt() both tiers had.
export function reportSheet({ reasons, onSubmit, what = 'this' }) {
  const name = `report-${Math.random().toString(36).slice(2, 8)}`;
  const radios = reasons.map(([value, label], i) => el('label', { class: 'sheet-row' },
    el('input', { type: 'radio', name, value, ...(i === 0 ? { checked: '' } : {}) }), el('span', {}, label)));
  const detail = el('textarea', { class: 'form', rows: '2', placeholder: 'Anything the reviewer should know (optional)' });
  const send = el('button', { type: 'button', class: 'btn primary' }, 'Send report');
  const cancel = el('button', { type: 'button', class: 'btn' }, 'Cancel');
  const dialog = el('dialog', { class: 'sheet', 'aria-label': `Report ${what}` },
    el('div', { class: 'row spread' }, el('strong', {}, `Report ${what}`),
      el('button', { type: 'button', class: 'sheet-x', 'aria-label': 'Close' }, '✕')),
    el('div', { class: 'sheet-list' }, ...radios), detail,
    el('div', { class: 'sheet-actions' }, cancel, send));
  dialog.querySelector('.sheet-x').addEventListener('click', () => dialog.close());
  cancel.addEventListener('click', () => dialog.close());
  send.addEventListener('click', async () => {
    const reason = dialog.querySelector(`input[name="${name}"]:checked`)?.value;
    if (!reason) return;
    send.disabled = true;
    try { await onSubmit({ reason, detail: detail.value.trim() }); dialog.close(); }
    catch (e) { send.disabled = false; console.warn('forage: report failed', e); toast(e.message || 'The report was not sent.', 'err'); }
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

function stewardItems(type, subject) {
  const act = (label, evType, extra = {}) => ({ label, onSelect: async () => {
    const reason = evType === 'mod.removed' ? (prompt('Removal reason:', 'Rule violation') || '') : '';
    if (evType === 'mod.removed' && !reason) return;
    try { await actions.mod(evType, { subjectType: type, subjectId: subject.id, reason, ...extra }); toast('Done.', 'ok'); } catch {}
  } });
  const out = [];
  if (type === 'post') {
    out.push(subject.locked ? act('Unlock', 'mod.unlocked') : act('Lock', 'mod.locked'));
    out.push(subject.pinned ? act('Unpin', 'mod.unpinned') : act('Pin', 'mod.pinned'));
  }
  out.push(subject.removed ? act('Approve', 'mod.approved') : act('Remove', 'mod.removed'));
  return out;
}

// ---------- post row (feed) ----------
export function postRow(p, viewerCanVote, opts = {}) {
  const link = `/f/${p.feedSlug}/p/${p.id}`;
  const titleLink = p.format === 'link' && p.url
    ? el('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.title)
    : el('a', { href: link }, p.title);
  const meta = el('div', { class: 'postmeta' },
    // 3v: the lens passes a creator-qualified href when it has one, so a
    // copied breadcrumb resolves for a stranger. Memory Feeds are local and
    // need no creator, so the plain slug stays the default.
    el('a', { href: opts.feedHref || `/f/${p.feedSlug}` }, `f/${p.feedSlug}`),
    p.format === 'link' && p.url ? el('span', { class: 'domain' }, domainOf(p.url)) : null,
    el('a', { href: link }, plural(p.commentCount, 'comment')),
    p.edited ? el('span', { class: 'muted' }, 'edited') : null,
    opts.metaExtra || null, // 3u: the lens hangs a language chip here
  );
  // Compact drops the body preview. The lens already did this by passing
  // bodyNode: null explicitly; doing it HERE means compact means the same thing
  // in both populations instead of being a smaller font in one of them. An
  // explicit bodyNode still wins, so callers keep the final say.
  const body = opts.bodyNode !== undefined ? opts.bodyNode
    : (!opts.compact && p.format === 'text' && p.body && !p.maskedRemoved
      ? el('div', { class: 'clamp' }, p.body) : null);

  // Same contract as bodyNode: an explicit titleNode wins, so the lens can
  // drop a PLACEHOLDER title from a row that renders the media itself —
  // "[image]" above the actual image names nothing the reader can't see —
  // or swap it for a tiny thumbnail on a compact row that renders none.
  const title = opts.titleNode !== undefined ? opts.titleNode
    : el('div', { class: 'posttitle' }, titleLink);

  const right = el('div', {},
    // Context ABOVE the title (plan 2026-08-28-1): the lens hangs a reply's
    // parent link / a repost's byline here. An explicit node like bodyNode —
    // the memory tier passes nothing and its rows are untouched.
    opts.aboveNode || null,
    byline({
      name: p.author, ts: p.createdTs, avatar: p.avatar || null,
      whoNode: p.author
        ? el('span', { class: 'who' }, p.author, opts.authorBadge || '')
        : el('span', { class: 'who muted' }, '[removed]'),
      // `opts.menuGroups(p)` (the lens, Phase 4b) or `opts.perms(p)` (memory:
      // the feed-scoped permissions for this row's feed) — a row with neither
      // gets a guest's menu, which is the safe default.
      menu: opts.menuGroups ? () => opts.menuGroups(p)
        : () => memoryMenuGroups({ type: 'post', subject: p, link,
          text: [p.title, p.body].filter(Boolean).join('\n\n'),
          perms: opts.perms?.(p) ?? {}, viewerId: opts.perms?.(p)?.viewerId ?? null }),
    }),
    el('div', { class: 'row wrap', style: 'gap:6px;align-items:center' }, ...postBadges(p)),
    title,
    body,
  );
  // Decision 1: the vote is a pill on the action row; the left column is gone
  // (the byline carries the avatar). `.foot` is NOT `.postmeta`, on purpose —
  // mobile-fit exempts .postmeta as prose, and a tap target must be measured.
  right.append(el('div', { class: 'foot' }, vote('post', p.id, p, viewerCanVote, { onVote: opts.onVote }), meta));
  return el('div', { class: 'postrow' + (p.pinned ? ' pinned-row' : '') + (opts.compact ? ' compact' : '') }, right);
}

// ---------- comment tree: the rail and the fold (plan 2026-08-29 post-and-thread, decision 2) ----------
// A comment is a grid: avatar column | byline / text / action row, with its
// replies (.kids) spanning both columns below. A comment WITH replies draws a
// rail (.line) down from its avatar and carries ONE fold (⊖) on its action row;
// each child draws its own elbow off the rail in CSS. A comment without
// replies has neither — forty direct replies to a post no longer look nested
// under nothing. The old full-height collapse gutter was never discoverable
// on a phone and cost mis-taps; it is retired, deliberately, and a later
// session that "restores" it is undoing a decision.
//
// No auto-collapse: the score-threshold fold was a downvote feature and is
// retired (2026-08-27); the fold here is manual.
const CHILD_PAGE = 20; // "load N more replies" threshold

export function commentNode(node, ctx) {
  const hasKids = (node.children || []).length > 0 || (node.deferred || 0) > 0;
  const wrap = el('div', { class: 'comment' + (hasKids ? '' : ' leaf'), 'data-node-id': node.id });

  const avcol = el('div', { class: 'avcol' }, avatarSlot(node.author, node.avatar || null),
    hasKids ? el('span', { class: 'line', 'aria-hidden': 'true' }) : null);

  let fold = null;
  if (hasKids) {
    const hidden = countDesc(node);
    const lbl = el('span', { class: 'lbl' });
    fold = el('button', { type: 'button', class: 'fold', 'data-fold': '1', 'aria-expanded': 'true',
      'aria-label': 'Collapse replies', title: 'Collapse replies' }, el('span', { class: 'glyph', 'aria-hidden': 'true' }, '\u2296'), lbl);
    fold.addEventListener('click', () => {
      const collapsing = !wrap.classList.contains('collapsed');
      wrap.classList.toggle('collapsed', collapsing);
      fold.setAttribute('aria-expanded', String(!collapsing));
      fold.querySelector('.glyph').textContent = collapsing ? '\u2295' : '\u2296';
      lbl.textContent = collapsing ? ` ${plural(hidden, 'reply', 'replies')} hidden` : '';
      const name = collapsing ? `Show ${plural(hidden, 'reply', 'replies')}` : 'Collapse replies';
      fold.setAttribute('aria-label', name); fold.setAttribute('title', name);
    });
  }

  const author = node.author
    ? (ctx.authorHref
      ? el('a', { class: 'who', href: ctx.authorHref(node), target: '_blank', rel: 'noopener noreferrer', title: 'Profiles live on bsky.app — Forage is a lens' }, node.author)
      : el('a', { class: 'who', href: `/u/${node.author}` }, node.author))
    : el('span', { class: 'who removed-stub' }, node.deleted ? '[deleted]' : '[removed]');
  const meta = byline({
    name: node.author, whoNode: author, ts: node.createdTs, avatar: false,
    menu: node.maskedRemoved || node.deleted ? null
      : ctx.menuGroups ? () => ctx.menuGroups(node)
      : () => memoryMenuGroups({ type: 'comment', subject: node, text: node.body,
        link: `/f/${ctx.feedSlug}/p/${node.postId}`, perms: ctx, viewerId: ctx.viewerId ?? null }),
    after: [
      node.edited ? el('span', { class: 'muted' }, 'edited') : null,
      node.removed && ctx.canModerate ? el('span', { class: 'chip badge-nsfw' }, 'removed') : null,
    ],
  });

  const text = el('div', { class: 'comment-text', html: node.maskedRemoved || node.deleted ? esc(node.body) : mdLite(node.body) });

  const actionsRow = el('div', { class: 'comment-actions' });
  // the vote stack is a grid sibling in the avatar column, on the action row's
  // line, the rail passing behind it (decision 1)
  const voteEl = node.maskedRemoved || node.deleted ? null : vote('comment', node.id, node, ctx.canVote, { layout: 'stack' });
  if (fold) actionsRow.append(fold);
  if (!node.maskedRemoved && !node.deleted) {
    if (ctx.canComment && !ctx.locked) actionsRow.append(replyButton(node, ctx));
    // Save, Report and the steward actions live in the ⋯ menu now (Phase 3).
    // Phase 2: the lens hangs its own controls here (delete-your-own-reply).
    // Returns nodes or nothing; the memory tier passes no extraActions, so its
    // rows are untouched.
    const extra = ctx.extraActions?.(node);
    if (extra) actionsRow.append(...[].concat(extra).filter(Boolean));
  }

  // .comment-body is display:contents — its children sit in the comment's
  // grid, and every suite's `> .comment-body > .byline` keeps working
  const bodyWrap = el('div', { class: 'comment-body' }, meta, text, voteEl, actionsRow);
  const childrenWrap = el('div', { class: 'kids' });

  wrap.append(avcol, bodyWrap, childrenWrap);

  // render children with paging + continuation stubs
  renderChildren(childrenWrap, node, ctx);

  return wrap;
}

function renderChildren(container, node, ctx) {
  const kids = node.children || [];
  let shown = 0;
  const showBatch = () => {
    const slice = kids.slice(shown, shown + CHILD_PAGE);
    // 3r: the caller may draw some children differently (the lens draws a
    // quote-of-a-quote as a walled quote). Default stays commentNode, so the
    // memory tier is untouched.
    const draw = ctx.nodeRenderer || ((n) => commentNode(n, ctx));
    for (const k of slice) container.append(draw(k, ctx));
    shown += slice.length;
    more.remove();
    if (shown < kids.length) container.append(more);
  };
  const more = el('button', { class: 'loadmore btn sm' }, `load ${plural(Math.min(CHILD_PAGE, kids.length), 'more reply', 'more replies')}`);
  more.addEventListener('click', showBatch);

  if (kids.length) showBatch();

  // continuation stub past depth 10 (spec §9 / acceptance)
  if (node.deferred > 0) {
    container.append(el('a', { class: 'continue-stub', href: `/f/${ctx.feedSlug}/p/${node.postId}?focus=${node.id}` },
      `→ continue this thread (${node.deferred} more)`));
  }
}

function countDesc(node) {
  let n = 0;
  const walk = (x) => { for (const c of x.children || []) { n++; walk(c); } if (x.deferred) n += x.deferred; };
  walk(node);
  return n + (node.deferred || 0);
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

