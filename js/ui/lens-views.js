// The wide lens UI (6d): #/lens routes render the owner's Bluesky as a forum
// through the SAME components the memory tier uses — postRow and commentNode
// consume the lens shapes unchanged. Read-first: every write surface is a
// frontier chip backed by a ledger entry (DL-013..015), never a dead button.
// The session is in-memory only, page-lifetime — scaffolding like the dev bar,
// until a real OAuth flow arrives.

import { el, timeAgo, fmtScore } from '../util.js';
import { postRow, commentNode, skeleton, emptyState, toast } from './components.js';
import { createLens, LENS_PERMS } from '../substrates/lens.js';

let session = null;
let lens = createLens({});

// Guest boards: the probe-verified unauth-200 surface (feed-URI and author
// sources). Signed in, the list is replaced by the account's saved feeds.
const CURATED = [
  { slug: 'whats-hot', title: "What's Hot", kind: 'feed',
    source: { kind: 'feed', uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' } },
  { slug: 'bsky.app', title: 'Bluesky Team', kind: 'author', source: { kind: 'author', actor: 'bsky.app' } },
];
const sources = new Map(CURATED.map((c) => [c.slug, c]));

const chip = (label, title) => el('span', { class: 'frontier-chip', title }, label);

async function signIn(identifier, password) {
  const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (res.status !== 200) throw new Error(`sign-in failed (HTTP ${res.status})`);
  const s = await res.json();
  session = { service: 'https://bsky.social', did: s.did, handle: s.handle, accessJwt: s.accessJwt };
  lens = createLens({ session });
}

function lensSidebar() {
  const fieldsCard = el('div', { class: 'card' }, el('h2', {}, 'Lens Fields'));
  const list = el('div', { class: 'stack' });
  fieldsCard.append(list);
  if (!session) {
    for (const c of CURATED) {
      list.append(el('div', { class: 'row spread' },
        el('a', { href: `#/lens/f/${c.slug}` }, `f/${c.slug}`),
        el('span', { class: 'xs muted' }, c.kind)));
    }
    list.append(el('div', { class: 'xs muted', style: 'margin-top:6px' },
      'Guest boards. Sign in and your saved feeds become Fields.'));
  } else {
    list.append(skeleton(3));
    lens.fields().then((fields) => {
      list.replaceChildren(...fields.map((f) => {
        sources.set(f.slug, { slug: f.slug, title: f.title, kind: f.kind,
          source: f.kind === 'author' ? { kind: 'author', actor: f.id }
            : f.kind === 'timeline' ? { kind: 'timeline' } : { kind: f.kind, uri: f.id } });
        return el('div', { class: 'row spread' },
          el('a', { href: `#/lens/f/${f.slug}` }, `f/${f.slug}`),
          el('span', { class: 'xs muted' }, `${f.kind}${f.pinned ? ' · pinned' : ''}`));
      }));
    }).catch((e) => list.replaceChildren(el('div', { class: 'xs muted' }, 'Fields failed: ' + e.message)));
  }
  return fieldsCard;
}

function sessionCard() {
  if (session) {
    return el('div', { class: 'card' },
      el('div', { class: 'small' }, `Signed in as ${session.handle}`),
      el('div', { class: 'xs muted' }, 'Session lives in memory only; reload signs out.'));
  }
  const id = el('input', { type: 'text', placeholder: 'handle (e.g. you.bsky.social)' });
  const pw = el('input', { type: 'password', placeholder: 'app password' });
  const btn = el('button', { class: 'btn primary sm' }, 'Sign in');
  btn.addEventListener('click', async () => {
    try { await signIn(id.value.trim(), pw.value); toast('Signed in to the lens.', 'ok'); location.reload = null; window.dispatchEvent(new HashChangeEvent('hashchange')); }
    catch (e) { toast(e.message, 'err'); }
  });
  return el('div', { class: 'card' },
    el('h2', {}, 'Sign in (app password)'),
    el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
      'Unlocks your saved feeds as Fields, Following, and search. Held in memory only — scaffolding until OAuth.'),
    el('div', { class: 'field-row' }, el('label', {}, 'Handle'), id),
    el('div', { class: 'field-row' }, el('label', {}, 'App pass'), pw),
    btn);
}

export function lensHomeView() {
  const main = el('div', {},
    el('h1', {}, 'The Lens'),
    el('div', { class: 'card' },
      el('p', { class: 'small' },
        'Your Bluesky, shaped as a forum: Fields are feeds, threads are threads, boosts ride likes. Read-only — writes stay on the demo tier for now.'),
      el('div', { class: 'row wrap', style: 'gap:6px' },
        chip('boost = like: deferred (DL-013)', 'Writing likes from the lens is a ledgered frontier'),
        chip('guest search: needs sign-in (DL-014)', 'searchPosts is 403 unauthenticated — probe-verified'),
        chip('saves: deferred (DL-015)', 'Bookmarks are not public API surface yet'))),
    el('div', { class: 'card' },
      el('h2', {}, 'Browse'),
      el('div', { class: 'stack' },
        ...CURATED.map((c) => el('div', {}, el('a', { href: `#/lens/f/${c.slug}` }, `f/${c.slug}`), el('span', { class: 'xs muted' }, ` — ${c.title}`))))));
  return { main, side: el('div', { class: 'side' }, sessionCard(), lensSidebar()) };
}

export function lensFieldView(params) {
  const entry = sources.get(params.slug);
  if (!entry) return { main: emptyState('Unknown lens Field', 'Open the lens home first so its sources register.', el('a', { class: 'btn', href: '#/lens' }, 'Lens home')), side: null };
  const main = el('div', {},
    el('div', { class: 'row spread wrap' },
      el('h1', {}, entry.title),
      chip('ranking: the feed’s own order (DL-010)', 'The generator ranks; our hot/top do not apply here')),
    skeleton(6));
  lens.feed(entry.source, { title: entry.title }).then((f) => {
    const card = el('div', { class: 'card' });
    for (const p of f.posts) card.append(postRow(p, false));
    main.replaceChildren(
      el('div', { class: 'row spread wrap' },
        el('h1', {}, entry.title),
        el('div', { class: 'row', style: 'gap:6px' },
          chip('likes-only scores (DL-011)'),
          chip('ranking: feed order (DL-010)'))),
      f.posts.length ? card : emptyState('Nothing here', 'This source returned no posts.'));
    // thread links: lens posts route through #/lens/p?uri=
    for (const a of card.querySelectorAll('a[href*="/p/at:"], a[href^="#/f/"]')) {
      const href = a.getAttribute('href');
      const m = href.match(/\/p\/(at:.+)$/);
      if (m) a.setAttribute('href', `#/lens/p?uri=${encodeURIComponent(m[1])}&from=${entry.slug}`);
    }
  }).catch((e) => main.replaceChildren(emptyState('Lens fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, sessionCard(), lensSidebar()) };
}

export function lensThreadView(params, query) {
  const uri = query.uri ? decodeURIComponent(query.uri) : null;
  if (!uri) return { main: emptyState('No thread', 'Missing post uri.'), side: null };
  const from = sources.get(query.from);
  const src = from ? { fieldId: `lens:${from.slug}`, fieldSlug: from.slug, fieldTitle: from.title }
                   : { fieldId: 'lens:thread', fieldSlug: 'thread', fieldTitle: 'Thread' };
  const main = el('div', {}, skeleton(8));
  lens.thread(uri, src).then((t) => {
    const p = t.post;
    const head = el('div', { class: 'card' },
      el('div', { class: 'row wrap', style: 'gap:6px' },
        el('a', { href: `#/lens/f/${src.fieldSlug}`, class: 'xs' }, `f/${src.fieldSlug}`),
        p.nsfw ? el('span', { class: 'chip badge-nsfw' }, 'NSFW') : null),
      el('h1', {}, p.title.slice(0, 300)),
      el('div', { class: 'postmeta' },
        p.author ? el('a', { href: `https://bsky.app/profile/${p.author}`, target: '_blank', rel: 'noopener noreferrer' }, p.author) : '[muted]',
        ` · ${fmtScore(p.score)} likes · ${timeAgo(p.createdTs)} ago · ${p.commentCount} replies`),
      el('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
        chip('boost = like: deferred (DL-013)')));
    const ctx = { ...LENS_PERMS, locked: true }; // read-only: reply/vote/save/mod all gate
    const commentsCard = el('div', { class: 'card' });
    for (const node of t.comments) commentsCard.append(commentNode(node, ctx));
    main.replaceChildren(head, t.comments.length ? commentsCard : emptyState('No replies', 'Nothing below this post yet.'));
  }).catch((e) => main.replaceChildren(emptyState('Lens fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, sessionCard(), lensSidebar()) };
}
