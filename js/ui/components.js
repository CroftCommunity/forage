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
//
// board-cards decision 1 (2026-08-29): a reader who cannot vote gets the same
// PILL as a DOOR — a button, dashed, a person glyph where the arrow would be,
// named with the count and "sign in to like" — whose tap calls `onGuest` (the
// lens opens the sign-in sheet; the sandbox toasts). It replaced a read-only
// span dressed exactly like the live pill, which read as a button and ignored
// the touch: the owner's first finding on the live site. The count stays the
// fact it is; the arrow stays an action, so it is not drawn for a guest.
const PERSON_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
//
// `onGuest` is passed ONLY for a guest. A signed-in reader who cannot vote a
// subject (the lens's comment stack: LENS_PERMS.canVote is false, comment likes
// are not wired) keeps the read-only count — a door for someone already inside
// would be a lie. The door is a claim about the viewer, so the caller makes it.
export const guestGate = () => toast('Log in to vote.', 'err'); // the sandbox's answer (O1) — the same words as actions.setVote's gate
// feed-row v9 (owner, 2026-08-31): ONE layout — the pill. The comment's
// column stack ('avvote') is gone: the like sits on the comment's action row
// before share, like a post row's and the thread head's.
export function vote(subjectType, id, data, canVote, { onVote = null, onGuest = null } = {}) {
  const n = el('span', { class: 'n' }, fmtScore(data.likes));
  const arrow = el('span', { class: 'arrow', 'aria-hidden': 'true' }); // the glyph is painted from --like-glyph (v13 decision 27)
  const cls = 'vote';
  if (!canVote && onGuest) {
    const person = el('span', { class: 'glyph', 'aria-hidden': 'true', html: PERSON_GLYPH });
    const door = el('button', { type: 'button', class: cls, 'data-vote': subjectType, 'data-guest': '1',
      'aria-label': `${plural(data.likes, 'like')} \u2014 sign in to like`, title: 'Sign in to like' },
      person, n);
    door.addEventListener('click', onGuest);
    return door;
  }
  const parts = [arrow, n];
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

// A picture REPLACES the initials — appended beside them, the two became two
// rows of the slot's grid, picture under letters (owner, 2026-08-29).
export function avatarSlot(name, avatar = null) {
  return el('span', { class: 'av', 'aria-hidden': 'true' },
    avatar ? el('img', { src: avatar, alt: '', loading: 'lazy' }) : initials(name));
}

// `avatar: false` draws no slot — a comment's avatar lives in its own column
// (decision 1 + 2, Phase 8b), a row's opens the byline.
export function byline({ name, whoNode, ts, avatar = null, after = [], menu = null, mark = null }) {
  return el('div', { class: 'byline' },
    avatar === false ? null : avatarSlot(name, avatar),
    whoNode,
    mark, // feed-row v2: the provider mark, or null
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
  // board-cards decision 8: a guest's menu ends with ONE item that says why the
  // rest is missing. The sandbox has personas, not a sign-in (O1), so it can
  // only say so; the lens's menu (lens-views.js) opens the sign-in sheet.
  const door = perms.loggedIn ? [] : [{ label: 'Sign in to like, save and reply', icon: '\u2192',
    onSelect: () => toast('Log in to like, save and reply \u2014 switch persona in the dev bar above.', 'err') }];
  return [first, report, steward, door];
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

// feed-row v2 (owner, 2026-08-30): the byline shows the name a person CHOSE;
// the handle — the one thing on a row nobody else can type — stays one hover
// away as the name's tooltip, and in the accessible name. A row with no chosen
// name shows the handle. `data-handle` is the stable hook for tests and
// tooling, since the text is no longer the handle.
// `href` makes it a link (the thread head's name opens the profile) and keeps
// it a direct `.who` child of the byline, so the one-line rules still apply.
export function whoNode(author, authorName, badge = '', href = null) {
  const name = authorName || author;
  return el(href ? 'a' : 'span', { class: 'who', 'data-handle': author, ...(href ? { href } : {}),
    ...(authorName ? { title: `@${author}`, 'aria-label': `${authorName} (@${author})` } : {}) }, name, badge || '');
}

// The provider mark (js/provider-mark.js): a glyph the size of the text,
// muted, with the provider in its tooltip. `provider` is null when the caller
// has none to show (the memory sandbox, a removed author, the setting off).
const BUTTERFLY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/></svg>';
const RING = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 3"/></svg>';
export function providerMark(provider, label) {
  if (!provider) return null;
  return el('span', { class: 'provider-mark', 'data-provider': provider.id, role: 'img', title: label, 'aria-label': label,
    html: provider.id === 'bsky' ? BUTTERFLY : RING });
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
    // need no creator, so the plain slug stays the default. feed-row v7: a
    // lens row passes `feedCrumb: false` — on a lens board every row's feed IS
    // the board, and the line read the same under every post (owner).
    opts.feedCrumb === false ? null : el('a', { href: opts.feedHref || `/f/${p.feedSlug}` }, opts.feedLabel || `f/${p.feedSlug}`),
    // v13: a lens row's card names the host itself (opts.domainLine === false)
    p.format === 'link' && p.url && opts.domainLine !== false ? el('span', { class: 'domain' }, domainOf(p.url)) : null,
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
  // feed-row v1 (2026-08-30): a Bluesky post's text is text, not a title —
  // the lens passes `textPost` and the row sets it at body weight. A memory
  // post has a real title and keeps the heading weight.
  const title = opts.titleNode !== undefined ? opts.titleNode
    : el('div', { class: 'posttitle' + (opts.textPost ? ' posttext' : '') }, titleLink);

  const right = el('div', {},
    // Context ABOVE the title (plan 2026-08-28-1): the lens hangs a reply's
    // parent link / a repost's byline here. An explicit node like bodyNode —
    // the memory tier passes nothing and its rows are untouched.
    opts.aboveNode || null,
    byline({
      name: p.author, ts: p.createdTs, avatar: p.avatar || null,
      whoNode: p.author
        ? whoNode(p.author, p.authorName, opts.authorBadge)
        : el('span', { class: 'who muted' }, '[removed]'),
      mark: p.author && opts.provider ? providerMark(opts.provider, opts.providerLabel) : null,
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
  // Decision 1 (post-and-thread): the vote is a pill on the action row; the
  // left column is gone (the byline carries the avatar). board-cards decision
  // 2 put share on every row — it was only in the ⋯ and the owner could not
  // find it. feed-row v1 (2026-08-30) reshaped the row to Bluesky's: replies ·
  // reposts · like · share, four equal cells (css .postrow .actions), the like
  // where the heart is. The owner's phone measured the old row — "7315 ·
  // 270 comments · 1225" wrapped the share arrow under it at 390px and left the
  // boxed like two lines tall. The replies control shows the glyph and the
  // number; "270 comments" stays its accessible name and its tooltip, so a
  // screen reader and a hover still get the words. `.actions` is NOT
  // `.postmeta`, on purpose — mobile-fit exempts .postmeta as prose, and a tap
  // target must be measured.
  const repliesWords = `${plural(p.commentCount, 'comment')} \u2014 open the thread`;
  const replies = el('a', { class: 'cbtn replies', href: link, title: repliesWords, 'aria-label': repliesWords },
    el('span', { 'aria-hidden': 'true' }, '\u{1F4AC}'), el('span', { class: 'n' }, fmtScore(p.commentCount)));
  // a repost COUNT, never a write on a row (post-and-thread O2); the sandbox
  // has no reposts and draws nothing
  const reposts = p.repostCount == null ? null
    : el('span', { class: 'cbtn', 'data-repost': '1', 'data-readonly': '1', role: 'img',
      'aria-label': plural(p.repostCount, 'repost') }, el('span', { 'aria-hidden': 'true' }, '\u27F3'), el('span', { class: 'n' }, fmtScore(p.repostCount)));
  right.append(el('div', { class: 'actions' },
    replies, reposts,
    vote('post', p.id, p, viewerCanVote, { onVote: opts.onVote,
      // the lens passes its sheet; a sandbox row decides from its feed-scoped perms
      onGuest: opts.onGuest ?? (opts.perms?.(p)?.loggedIn ? null : guestGate) }),
    shareButton(opts.permalink ?? `${location.origin}${link}`, 'post')));
  // no empty line where the crumb was — and appended conditionally, because
  // Element.append stringifies a null into the word "null" (the v7 frame)
  if (meta.childElementCount) right.append(meta);
  // the row carries its post's identity, so a reader's position can be expressed
  // as "this post, this far down it" and not only as a pixel (feed-position D2)
  const wrap = el('div', { class: 'postrow' + (p.pinned ? ' pinned-row' : '') + (opts.compact ? ' compact' : ''),
    ...(p.id ? { 'data-uri': String(p.id) } : {}) }, right);
  // feed-row v13 (E, bsky.app's card): the ROW opens its thread on a press on its
  // own ground — the text is text now (tags, links and mentions live in it), so
  // it is no longer the link. Anything that is a control keeps its own press;
  // a drag that selected text is not a press. The replies control stays the
  // accessible path to the thread (its name says so).
  if (opts.open) {
    wrap.dataset.open = '1';
    wrap.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.target.closest('a, button, input, textarea, select, label, dialog, video, iframe, [data-no-open]')) return;
      if (window.getSelection?.()?.toString()) return;
      opts.open(wrap);
    });
  }
  return wrap;
}

// ---------- deep links (plan 2026-08-29 post-and-thread, decision 10) ----------
// Every comment has an address; the share glyph copies it. Quiet at rest
// (55%), full hit area, always the LAST thing on the action row.
// feed-row v3 (owner, 2026-08-30: "I really don't like that bottom right share
// icon"): the ↗ text glyph read as "external link" and sat tiny at 55%; the
// glyph is now the share icon board-cards v5 drew — a tray with an arrow up out
// of it, the shape bsky.app and iOS use — at text size, one weight with the
// other three. Recorded alternative: a chain link (the button DOES copy a link).
const SHARE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>';
export function shareButton(url, what = 'comment') {
  const b = el('button', { type: 'button', class: 'cbtn share', 'aria-label': `Copy link to this ${what}`, title: 'Copy link' },
    el('span', { class: 'glyph', 'aria-hidden': 'true', html: SHARE_ICON }));
  b.addEventListener('click', () => copy(url, 'Link'));
  return b;
}

// Opening a permalink renders the WHOLE thread and lands on the comment:
// marked, its ancestors expanded, its siblings folded, a bar saying so with a
// way back. Works on a detached tree (the view calls it before attaching);
// only the scroll waits for a frame. Returns the bar to prepend.
export function focusComment(container, id, { threadHref }) {
  const back = el('a', { href: threadHref }, 'see the whole thread');
  const target = container.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
  if (!target) {
    console.warn('forage: focus id not in thread', id);
    return el('div', { class: 'focus-bar', role: 'status' }, 'That comment isn\u2019t in this thread \u2014 ', back);
  }
  target.classList.add('focused');
  // the path from the root to the target: expand each step, fold what is beside it
  const path = [];
  for (let n = target; n && n !== container; n = n.parentElement?.closest('.comment')) path.unshift(n);
  const setFolded = (node, folded) => {
    // thread-depth Phase B: a deep-folded ancestor hides the target with a bar
    // of its own, and the ⊖ fold does not know about it. Open it first, or a
    // permalink into a deep subtree scrolls to something display:none —
    // the target IS in the DOM (the bar hides, it never skips the render),
    // which is the whole reason the fold is a class and not a lazy branch.
    if (!folded) node.querySelector(':scope > [data-deep]')?.click();
    const fold = node.querySelector(':scope > .comment-body > .comment-actions > [data-fold]');
    const is = node.classList.contains('collapsed');
    if (fold && is !== folded) fold.click();      // keeps the fold's own label honest
    else if (!fold) node.classList.toggle('collapsed', folded); // a leaf: hide its text only
  };
  for (const step of path) {
    setFolded(step, false);
    const level = step.parentElement; // .kids, or the comments container
    for (const sib of level.querySelectorAll(':scope > .comment')) if (sib !== step) setFolded(sib, true);
  }
  requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  return el('div', { class: 'focus-bar', role: 'status' }, 'Viewing one comment \u2014 ', back);
}

// ---------- comment tree: the rail and the fold (plan 2026-08-29 post-and-thread, decision 2) ----------
// A comment is a grid: avatar column | byline / text / action row, with its
// replies (.kids) spanning both columns below. A comment WITH replies draws a
// rail (.line) down from its avatar and carries ONE fold (⊖) on its action row;
// each child draws its own elbow off the rail in CSS. A comment without
// replies has neither — forty direct replies to a post no longer look nested
// under nothing. A QUOTE is the one exception (v14 decision 34): it always
// draws the rail, painted in the brand ink, because that rail IS the tell that
// this node is a repost with its own thread. The old full-height collapse gutter was never discoverable
// on a phone and cost mis-taps; it is retired, deliberately, and a later
// session that "restores" it is undoing a decision.
//
// No auto-collapse: the score-threshold fold was a downvote feature and is
// retired (2026-08-27); the fold here is manual. thread-depth (2026-09-03) does
// NOT revive it — what that decision retired was a judgement about a comment
// (its score), and what this adds is a fact about the tree (its depth and its
// shape). Nothing here reads a count of anyone's approval.
const CHILD_PAGE = 20; // "load N more replies" threshold

// thread-depth Phase B: the depth this tree arrives OPEN to. A comment at or
// below this depth hands its replies over folded, behind one bar that says how
// many there are; everything shallower is untouched, so an ordinary three- or
// four-deep conversation never meets this rule at all.
//
// It is a RENDER budget, not a fetch one and not a judgement: the subtree is
// built, shaped and put in the DOM exactly as before — the bar only hides it.
// That is deliberate and it is what makes a permalink keep working: ?focus=<id>
// finds its target with querySelector (js/ui/components.js focusComment) and
// walks the path open, and a target that was never rendered would have made a
// shared link land on "That comment isn't in this thread".
//
// Reddit's answer at this depth is a link that RE-ROOTS the page. We already
// have that at the tree's own wall (the depth-10 continuation stub), and it
// costs a navigation and a scroll position. At this depth the replies are
// already in hand, so the bar opens them where they stand.
export const DEEP_FOLD_AT = 5;

export function commentNode(node, ctx) {
  const hasKids = (node.children || []).length > 0 || (node.deferred || 0) > 0;
  // Phase 9 (decision 5): a quote-response is a comment marked as quoted
  // material; the lens says which nodes are quotes (node.kind) and hands the
  // extra byline words and controls through ctx.
  // feed-row v14 decision 34 (owner: "why don't we just make that line the one
  // that has the highlight and do away with sort of the secondary indent
  // one?"): the mark is the node's OWN rail — the line under its avatar,
  // painted in the brand ink — not a second bar outside the avatar column. A
  // quote therefore draws a rail whether or not it has replies: with replies
  // the rail runs into the elbow of the first one, without them it stops at
  // the bottom of the quote's action row.
  const isQuote = node.kind === 'quote';
  // thread-depth Phase A: a comment whose replies are ONE reply is a CHAIN —
  // the conversation continued, it did not branch. The class says so; css/app.css
  // decides at which depth that reply stops being indented, because the answer is
  // a width judgement and differs between a phone and a desktop. `deferred`
  // disqualifies: a node standing at the depth-10 wall has more under it than the
  // one child we can see, and flattening it would promise a chain we cannot know is one.
  const chain = (node.children || []).length === 1 && !(node.deferred || 0);
  const wrap = el('div', { class: 'comment' + (hasKids ? '' : ' leaf') + (isQuote ? ' quote' : '') + (chain ? ' chain' : ''), 'data-node-id': node.id,
    ...(node.kind ? { 'data-kind': node.kind } : {}), ...(node.depth != null ? { 'data-depth': String(node.depth) } : {}) });

  const avcol = el('div', { class: 'avcol' }, avatarSlot(node.author, node.avatar || null),
    hasKids || isQuote ? el('span', { class: 'line', 'aria-hidden': 'true' }) : null);

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

  // feed-row v2: the chosen name, the handle in the tooltip (a comment's link
  // already opened the profile — the lens's title said where; the handle now
  // rides in front of that)
  const shown = node.authorName || node.author;
  const authorTitle = (node.authorName ? `@${node.author}` : '') + (ctx.authorHref ? `${node.authorName ? ' — ' : ''}Profiles live on bsky.app — Forage is a lens` : '');
  const author = node.author
    ? el('a', { class: 'who', 'data-handle': node.author, ...(authorTitle ? { title: authorTitle } : {}),
      ...(node.authorName ? { 'aria-label': `${node.authorName} (@${node.author})` } : {}),
      ...(ctx.authorHref ? { href: ctx.authorHref(node), target: '_blank', rel: 'noopener noreferrer' } : { href: `/u/${node.author}` }) }, shown)
    : el('span', { class: 'who removed-stub' }, node.deleted ? '[deleted]' : '[removed]');
  const meta = byline({
    name: node.author, whoNode: author, ts: node.createdTs, avatar: false,
    mark: node.author && ctx.providerOf ? providerMark(ctx.providerOf(node.author), ctx.providerLabel(node.author)) : null,
    menu: node.maskedRemoved || node.deleted ? null
      : ctx.menuGroups ? () => ctx.menuGroups(node)
      : () => memoryMenuGroups({ type: 'comment', subject: node, text: node.body,
        link: `/f/${ctx.feedSlug}/p/${node.postId}?focus=${encodeURIComponent(node.id)}`, perms: ctx, viewerId: ctx.viewerId ?? null }),
    after: [
      ctx.bylineExtra?.(node) || null, // the lens: "⟳ quoted this" on a quote
      node.edited ? el('span', { class: 'muted' }, 'edited') : null,
      node.removed && ctx.canModerate ? el('span', { class: 'chip badge-nsfw' }, 'removed') : null,
    ],
  });

  // post-text (2026-09-01): a comment's words. The memory tier keeps mdLite (its
  // bodies are markdown-ish and carry no facets); the lens hands its own
  // renderer through ctx.textNode, because a Bluesky reply's links, #tags and
  // @mentions live in byte-indexed facets — rendered as markdown they were
  // inert text on every thread. The seam is the one postRow already uses for
  // titleNode: the component asks, the population answers.
  const text = node.maskedRemoved || node.deleted
    ? el('div', { class: 'comment-text', html: esc(node.body) })
    : ctx.textNode ? el('div', { class: 'comment-text posttext' }, ...ctx.textNode(node))
    : el('div', { class: 'comment-text', html: mdLite(node.body) });

  // reply-embeds (2026-09-01): a reply's pictures, video, link card and the
  // post it quotes. The same seam `textNode` already is — the component asks,
  // the population answers — because these are drawn by mediaNode and
  // quotedContext, which live with the lens and know its stage, carousel and
  // quote-card rules. The memory tier passes no embedNodes and its threads are
  // untouched. Order is the head post's: what the reply shows, then what it
  // quotes.
  const embedList = node.maskedRemoved || node.deleted ? [] : (ctx.embedNodes?.(node) || []);
  // One wrapper, not loose children: `.comment` is a two-column grid and
  // `.comment-body` is display:contents, so every body child is placed in that
  // grid by hand. A bare `.stage` would land in the 32px AVATAR column. The
  // wrapper is also the single thing the collapse rule has to hide.
  const embeds = embedList.length ? el('div', { class: 'comment-embed' }, ...embedList) : null;

  const actionsRow = el('div', { class: 'comment-actions' });
  const replyHost = el('div', { class: 'reply-host' }); // where a lens composer lands, under this node
  // feed-row v9 (owner): the like is a pill on the action row, before share —
  // the same cell a post row gives it. (Decision 1's column stack, 2026-08-29,
  // is retired.) ctx.onVote(node) hands the lens its like/unlike for THIS node,
  // the same seam postRow already had; the memory tier passes none and writes locally
  const voteEl = node.maskedRemoved || node.deleted ? null
    : vote('comment', node.id, node, ctx.canVote, { onGuest: ctx.onGuest, onVote: ctx.onVote ? ctx.onVote(node) : null });
  if (fold) actionsRow.append(fold);
  if (!node.maskedRemoved && !node.deleted) {
    // Reply on EVERY node (post-and-thread decision 2's row, mock v18 claim C):
    // the lens hands its composer through ctx.onReply and mounts it in the
    // comment's own reply host; the memory tier keeps its inline form.
    if (ctx.onReply || (ctx.canComment && !ctx.locked)) actionsRow.append(replyButton(node, ctx, replyHost));
    // Save, Report and the steward actions live in the ⋯ menu now (Phase 3).
    // Phase 2: the lens hangs its own controls here (delete-your-own-reply).
    // Returns nodes or nothing; the memory tier passes no extraActions, so its
    // rows are untouched.
    const extra = ctx.extraActions?.(node);
    if (extra) actionsRow.append(...[].concat(extra).filter(Boolean));
    if (voteEl) actionsRow.append(voteEl); // v9: the like, then share last (decision 10)
    // decision 10: the permalink — the lens supplies its own address (Phase 13)
    const permalink = ctx.permalink ? ctx.permalink(node)
      : `${location.origin}/f/${ctx.feedSlug}/p/${node.postId}?focus=${encodeURIComponent(node.id)}`;
    actionsRow.append(shareButton(permalink));
  }

  // .comment-body is display:contents — its children sit in the comment's
  // grid, and every suite's `> .comment-body > .byline` keeps working
  const bodyWrap = el('div', { class: 'comment-body' }, ...[meta, text, embeds, actionsRow, replyHost].filter(Boolean));
  const childrenWrap = el('div', { class: 'kids' });

  // thread-depth Phase B: past DEEP_FOLD_AT the replies arrive folded behind one
  // bar. Only where there are rendered children to fold — a node standing at the
  // tree's depth-10 wall has none, and its continuation stub says the true thing
  // already; a bar over it would be a second control saying the same thing worse.
  const deepFold = (node.depth ?? 0) >= DEEP_FOLD_AT && (node.children || []).length > 0;
  let deepBar = null;
  if (deepFold) {
    wrap.classList.add('deep', 'folded');
    deepBar = el('button', { type: 'button', class: 'deep-bar', 'data-deep': '1', 'aria-expanded': 'false' },
      el('span', { class: 'glyph', 'aria-hidden': 'true' }, '\u2295'), ` ${plural(countDesc(node), 'reply', 'replies')}`);
    deepBar.addEventListener('click', () => {
      wrap.classList.remove('folded');
      deepBar.setAttribute('aria-expanded', 'true');
      deepBar.remove(); // the ⊖ fold on the action row folds it again — one control per job
    });
  }

  wrap.append(...[avcol, bodyWrap, childrenWrap].filter(Boolean)); // a null child would print as the word "null"

  // render children with paging + continuation stubs
  renderChildren(childrenWrap, node, ctx);
  // the bar lives INSIDE .kids, first: that is the one place it picks up the
  // indent this level was actually given (`--in`) without repeating the rule
  // that decides it — a flattened chain's bar sits flush, an indented one's
  // sits where its first reply would.
  if (deepBar) childrenWrap.prepend(deepBar);

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

  // continuation stub past depth 10 (spec §9 / acceptance); the lens supplies
  // its own address and words for a quote cascade (ctx.continueStub)
  if (node.deferred > 0) {
    const custom = ctx.continueStub?.(node);
    container.append(custom || el('a', { class: 'continue-stub', href: `/f/${ctx.feedSlug}/p/${node.postId}?focus=${node.id}` },
      `→ continue this thread (${node.deferred} more)`));
  }
}

function countDesc(node) {
  let n = 0;
  const walk = (x) => { for (const c of x.children || []) { n++; walk(c); } if (x.deferred) n += x.deferred; };
  walk(node);
  return n + (node.deferred || 0);
}


function replyButton(node, ctx, replyHost) {
  // the return arrow IS the verb (mock v17 § C: "Two icons, two verbs" — the
  // bubble counts, the arrow answers)
  // v12: the word is its own span so a narrow row can keep the glyph and drop
  // the word (five controls at 390px); the name stays for a screen reader
  const btn = el('button', { class: 'reply', type: 'button', 'aria-label': 'Reply' }, el('span', { 'aria-hidden': 'true' }, '\u21A9 '), el('span', { class: 'word' }, 'Reply'));
  btn.addEventListener('click', () => {
    if (ctx.onReply) { ctx.onReply(node, replyHost); return; }
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

