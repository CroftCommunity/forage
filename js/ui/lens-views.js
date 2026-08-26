// The wide lens UI (6d): #/lens routes render the owner's Bluesky as a forum
// through the SAME components the memory tier uses — postRow and commentNode
// consume the lens shapes unchanged. Read-first: every write surface is a
// frontier chip backed by a ledger entry (DL-013..015), never a dead button.
// Identity is the OAuth session (2c): js/auth/session.js wraps the vendored
// official client; the library owns persistence (IndexedDB) and refresh, so
// sign-in survives reloads. The lens consumes { did, handle, fetchHandler }.

import { el, timeAgo, fmtScore } from '../util.js';
import { postRow, commentNode, skeleton, emptyState, toast } from './components.js';
import { createLens, LENS_PERMS } from '../substrates/lens.js';
import { initSession } from '../auth/session.js';

let manager = null;        // null = not booted; 'unavailable' = origin has no OAuth client
let session = null;        // the lens session shape, set after restore
let lens = createLens({});
let bootStarted = false;

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// Exported for main.js: an OAuth callback landing must complete the exchange
// BEFORE the router replaces the hash (the code lives in the fragment).
export async function ensureAuthBoot() { return bootAuth(); }

async function bootAuth() {
  if (bootStarted) return;
  bootStarted = true;
  try {
    const m = await initSession();
    if (!m) { manager = 'unavailable'; rerender(); return; }
    manager = m;
    m.onChange(() => rerender());
    const s = await m.restore(); // restores a saved session OR completes a callback
    if (s) await adoptSession(s);
  } catch (e) {
    manager = 'unavailable';
    toast(e.message, 'err'); // vendor drift / metadata failures speak, never blank
  }
  rerender();
}

async function adoptSession(s) {
  // Resolve the handle for display — unauth describeRepo (D2-proven); the DID
  // stands in if resolution fails (display nicety, never a gate).
  let handle = s.did;
  try {
    const r = await fetch(`https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(s.did)}`);
    if (r.ok) handle = (await r.json()).handle ?? s.did;
  } catch { /* keep the did */ }
  session = { did: s.did, handle, fetchHandler: (p, i) => manager.fetch(p, i) };
  lens = createLens({ session });
}

// Guest boards: the probe-verified unauth-200 surface (feed-URI and author
// sources). Signed in, the list is replaced by the account's saved feeds.
const CURATED = [
  { slug: 'whats-hot', title: "What's Hot", kind: 'feed',
    source: { kind: 'feed', uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' } },
  { slug: 'bsky.app', title: 'Bluesky Team', kind: 'author', source: { kind: 'author', actor: 'bsky.app' } },
];
const sources = new Map(CURATED.map((c) => [c.slug, c]));

const chip = (label, title) => el('span', { class: 'frontier-chip', title }, label);

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
  if (manager === null) { bootAuth(); return el('div', { class: 'card' }, el('div', { class: 'xs muted' }, 'Connecting sign-in…')); }
  if (manager === 'unavailable') {
    return el('div', { class: 'card' },
      el('div', { class: 'small' }, 'Read-only on this origin'),
      el('div', { class: 'xs muted' }, 'Sign in with Bluesky works on forage.fyi and localhost (the OAuth client is origin-bound).'));
  }
  if (session) {
    const out = el('button', { class: 'btn sm' }, 'Sign out');
    out.addEventListener('click', async () => {
      try { await manager.signOut(); } catch (e) { toast(e.message, 'err'); }
      session = null;
      lens = createLens({});
      toast('Signed out.', 'ok');
      rerender();
    });
    return el('div', { class: 'card' },
      el('div', { class: 'row spread' },
        el('div', { class: 'small' }, `Signed in as @${session.handle}`), out),
      el('div', { class: 'xs muted' }, 'Your Bluesky session (OAuth) — it survives reloads and refreshes itself.'));
  }
  if (manager.state && manager.state() === 'pending') {
    return el('div', { class: 'card' }, el('div', { class: 'small' }, 'Finishing sign-in…'),
      el('div', { class: 'xs muted' }, 'Completing the Bluesky authorization redirect.'));
  }
  const id = el('input', { type: 'text', placeholder: 'you.bsky.social' });
  const btn = el('button', { class: 'btn primary sm' }, 'Sign in with Bluesky');
  const go = async () => {
    const handle = id.value.trim().replace(/^@+/, '');
    if (!handle) return toast('Enter your Bluesky handle.', 'err');
    try { await manager.signIn(handle); } catch (e) { toast('Sign-in failed: ' + e.message, 'err'); }
  };
  btn.addEventListener('click', go);
  id.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return el('div', { class: 'card' },
    el('h2', {}, 'Sign in with Bluesky'),
    el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
      'The official OAuth flow — you authorize on your own server; no credentials touch Forage. Unlocks your saved feeds as Fields, Following, and search.'),
    el('div', { class: 'field-row' }, el('label', {}, 'Handle'), id),
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
