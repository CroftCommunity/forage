// The wide lens UI (6d): #/lens routes render the owner's Bluesky as a forum
// through the SAME components the memory tier uses — postRow and commentNode
// consume the lens shapes unchanged. Read-first: every write surface is a
// frontier chip backed by a ledger entry (DL-013..015), never a dead button.
// Identity is the OAuth session (2c): js/auth/session.js wraps the vendored
// official client; the library owns persistence (IndexedDB) and refresh, so
// sign-in survives reloads. The lens consumes { did, handle, fetchHandler }.

import { el, timeAgo, fmtScore } from '../util.js';
import { postRow, commentNode, voteBox, skeleton, emptyState, toast } from './components.js';
import { createLens, LENS_PERMS, RING_CAP, facetSegments, slugifyFeedName, sortWindow, affordanceFor } from '../substrates/lens.js';
import { initSession, createAccountRoster } from '../auth/session.js';

let manager = null;        // null = not booted; 'unavailable' = origin has no OAuth client
let session = null;        // the lens session shape, set after restore
let lens = createLens({});
let bootStarted = false;
// which feeds the account has saved (join state). Fetched ONCE per session
// and shared — the header card and the sidebar both need it, and a race
// between them showed the wrong Join/Leave label.
const savedFeedUris = new Set();
let savedFeedsPromise = null;
const roster = createAccountRoster();
function ensureSavedFeeds() {
  if (!session) return Promise.resolve(savedFeedUris);
  if (!savedFeedsPromise) {
    savedFeedsPromise = lens.fields()
      .then((fs) => { for (const f of fs) if (f.kind === 'feed') savedFeedUris.add(f.id); return fs; })
      .catch(() => []);
  }
  return savedFeedsPromise;
}

const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// 3i: the OAuth identity, for the bluesky masthead. null = signed out;
// 'connecting' while restore is in flight (the masthead must never ask for a
// sign-in it is about to restore).
// 3i (owner: "launch oauth directly"): the masthead control starts the
// authorize redirect via the ENTRYWAY — bsky.social collects the handle; no
// local form. The sidebar card keeps the handle-first path.
export async function startDirectSignIn() {
  await ensureAuthBoot();
  if (!manager || manager === 'unavailable') {
    return toast('Sign-in is origin-bound — works on forage.fyi and localhost.', 'err');
  }
  try { await manager.signIn('https://bsky.social'); }
  catch (e) { toast('Sign-in failed: ' + e.message, 'err'); }
}

export function sessionIdentity() {
  if (session) return `@${session.handle}`;
  if (manager && manager !== 'unavailable' && manager.state && ['unknown', 'pending'].includes(manager.state())) return 'connecting';
  return null;
}

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
  savedFeedUris.clear();
  savedFeedsPromise = null;
  roster.remember({ did: s.did, handle }); // 3k: this device knows this account now
  // 3f: mirror the account's moderation posture — mute a word on bsky.app and
  // it is muted here. A failure runs unfiltered WITH WORDS, never silently.
  try {
    await lens.loadPosture();
  } catch (e) {
    toast('Moderation settings could not load — the lens is running unfiltered: ' + e.message, 'err');
  }
}

// 3f: the read-only Moderation panel — we mirror and respect; the network's
// own surface manages (the lens tenet applied to settings). putPreferences-
// based management from Forage is a registered frontier.
function moderationPanel() {
  if (!session) return null;
  const p = lens.posture();
  const line = (label, value) => el('div', { class: 'row spread' },
    el('span', { class: 'xs' }, label), el('span', { class: 'xs muted' }, String(value)));
  return el('div', { class: 'card', 'data-moderation-panel': '1' },
    el('h2', {}, 'Your moderation'),
    el('div', { class: 'xs muted', style: 'margin-bottom:4px' },
      'Mirrored from your account — Forage stores none of it.'),
    line('Muted words', p.mutedWords.length),
    line('Muted accounts', p.mutedDids.size),
    line('Blocked accounts', p.blockedDids.size),
    line('Label filters', p.labelPrefs.size),
    line('Adult content', p.adultEnabled ? 'enabled' : 'off'),
    el('div', { class: 'xs', style: 'margin-top:6px' },
      el('a', { href: 'https://bsky.app/moderation', target: '_blank', rel: 'noopener noreferrer' },
        'Edit on bsky.app ↗')));
}

// Guest boards: the probe-verified unauth-200 surface (feed-URI and author
// sources). Signed in, the list is replaced by the account's saved feeds.
const CURATED = [
  { slug: 'whats-hot', title: "What's Hot", kind: 'feed',
    source: { kind: 'feed', uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' } },
  { slug: 'bsky.app', title: 'Bluesky Team', kind: 'author', source: { kind: 'author', actor: 'bsky.app' } },
];
const sources = new Map(CURATED.map((c) => [c.slug, c]));
// Register a source under its canonical slug AND its human alias (3i: route
// on either, display the display name). First wins — an alias that would
// collide with an existing key is dropped, never ambiguous.
function registerSource(entry) {
  if (!sources.has(entry.slug)) sources.set(entry.slug, entry);
  if (entry.humanSlug && !sources.has(entry.humanSlug)) sources.set(entry.humanSlug, entry);
}

const chip = (label, title) => el('span', { class: 'frontier-chip', title }, label);

// 3c: boost = like. Optimistic flip lives in voteBox; this handler does the
// network truth. Bury has no Bluesky analogue (DL-011 likes-only) — words,
// then the 'gated' signal so voteBox reverts silently.
function lensVote(p) {
  return async (next) => {
    if (next === -1) { toast('Bury has no Bluesky analogue — boosts ride likes (DL-011).', 'err'); throw new Error('gated'); }
    if (next === 1) {
      const { likeUri } = await lens.like(p.id, p.cid);
      p.likeUri = likeUri; // so an immediate unboost knows its rkey
    } else {
      if (!p.likeUri) throw new Error('no like to remove');
      await lens.unlike(p.likeUri);
      p.likeUri = null;
    }
  };
}
// 3f: facet-aware body — links live, mentions link OUT (the lens tenet),
// #tags emphasized (they become /h/ doorways at 3g). Byte-indexed decode in
// the substrate; this only renders segments.
// 3i: a row's tag doorways survive even when there is no preview — the
// facet #tags render as chips under the title.
function tagChips(p) {
  const tags = (p.facets || []).flatMap((f) => (f.features || [])
    .filter((ft) => (ft.$type || '').endsWith('#tag')).map((ft) => ft.tag));
  if (!tags.length) return null;
  return el('div', { class: 'row wrap', style: 'gap:4px' },
    ...tags.map((t) => el('a', { class: 'tag', 'data-tag': t, href: `#/h/${encodeURIComponent(t)}` }, `#${t}`)));
}

function facetedBody(p) {
  if (p.maskedRemoved || !p.body) return null;
  const segs = facetSegments(p.body, p.facets);
  const nodes = segs.map((seg) => {
    if (!seg.facet) return seg.text;
    if (seg.facet.type === 'link') return el('a', { href: seg.facet.value, target: '_blank', rel: 'noopener noreferrer' }, seg.text);
    if (seg.facet.type === 'mention') return el('a', { href: `https://bsky.app/profile/${seg.facet.value}`, target: '_blank', rel: 'noopener noreferrer', title: 'Profiles live on bsky.app — Forage is a lens' }, seg.text);
    if (seg.facet.type === 'tag') return el('a', { href: `#/h/${encodeURIComponent(seg.facet.value)}`, 'data-tag': seg.facet.value, title: 'Open this hashtag as a board' }, seg.text);
    return seg.text;
  });
  const bodyEl = el('div', { class: 'clamp' }, ...nodes);
  if (p.warnLabels) {
    const veil = el('details', { 'data-warn': p.warnLabels.join(',') },
      el('summary', { class: 'xs muted' }, `content warning: ${p.warnLabels.join(', ')} — click to view`), bodyEl);
    return veil;
  }
  return bodyEl;
}

// 3f: the network's trust signals, display-only — never a gate.
function verifiedBadge(p) {
  if (p.verified === 'valid') return el('span', { class: 'xs', title: 'Verified on Bluesky' }, ' ✓');
  if (p.verified === 'trusted') return el('span', { class: 'xs', title: 'Trusted verifier on Bluesky' }, ' ✪');
  return '';
}

// 3i: media in card mode — images as lazy thumbs (fullsize behind a click),
// video as its thumbnail linking out (playback is bsky.app's job for now).
function mediaNode(p) {
  if (!p.media) return null;
  if (p.media.kind === 'images') {
    return el('div', { class: 'media-strip' },
      ...p.media.items.map((i) => el('a', { href: i.full, target: '_blank', rel: 'noopener noreferrer' },
        el('img', { src: i.thumb, alt: i.alt, loading: 'lazy' }))));
  }
  if (p.media.kind === 'video') {
    const link = `https://bsky.app/profile/${p.author}/post/${p.id.split('/').pop()}`;
    return el('div', { class: 'media-strip' },
      el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', title: 'Video — plays on bsky.app' },
        p.media.thumb ? el('img', { src: p.media.thumb, alt: '[video]', loading: 'lazy' }) : el('span', { class: 'tag' }, '▶ video')));
  }
  if (p.media.kind === 'external') {
    return el('div', { class: 'media-strip' },
      el('a', { href: p.media.uri, target: '_blank', rel: 'noopener noreferrer' },
        el('img', { src: p.media.thumb, alt: '', loading: 'lazy' })));
  }
  return null;
}

// The board view preference (card | compact) — device-local, like theme/skin.
const VIEW_KEY = 'forage.boardview';
const boardView = () => { try { return localStorage.getItem(VIEW_KEY) === 'compact' ? 'compact' : 'card'; } catch { return 'card'; } };

// Per-page-load sort state (a view concern, like the ring).
let boardSort = 'feed';
let boardTimeframe = 'day';

// The reddit-style toolbar: sort · timeframe (under Top) · view. Sorting is
// HONEST about scope — it re-orders the loaded window only (the generator
// owns the true ranking, DL-010; whole-feed live sorts are the Jetstream v2
// frontier, E139).
function boardToolbar(onChange) {
  const sortSel = el('select', { title: 'Sorts the LOADED posts — the feed itself is ranked by its generator (DL-010)' },
    ...[['feed', 'Feed order'], ['new', 'New'], ['top', 'Top']].map(([v, l]) =>
      el('option', { value: v, selected: boardSort === v || false }, l)));
  const tfSel = el('select', { title: 'Timeframe for Top' },
    ...[['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['all', 'All time']].map(([v, l]) =>
      el('option', { value: v, selected: boardTimeframe === v || false }, l)));
  if (boardSort !== 'top') tfSel.style.display = 'none';
  sortSel.addEventListener('change', () => { boardSort = sortSel.value; tfSel.style.display = boardSort === 'top' ? '' : 'none'; onChange(); });
  tfSel.addEventListener('change', () => { boardTimeframe = tfSel.value; onChange(); });
  const viewSel = el('select', { title: 'Card shows previews and media; Compact is dense rows' },
    ...[['card', 'Card'], ['compact', 'Compact']].map(([v, l]) =>
      el('option', { value: v, selected: boardView() === v || false }, l)));
  viewSel.addEventListener('change', () => { try { localStorage.setItem(VIEW_KEY, viewSel.value); } catch {} onChange(); });
  return el('div', { class: 'row wrap', style: 'gap:6px;margin:6px 0', 'data-board-toolbar': '1' },
    sortSel, tfSel, viewSel);
}

// One board renderer: applies the window sort and the view mode.
function renderBoard(card, posts) {
  const view = boardView();
  const ordered = sortWindow(posts, boardSort, boardTimeframe, Date.now());
  // Top + a narrow timeframe can legitimately empty the board — say why
  // rather than showing a blank card (the journey caught this).
  if (!ordered.length && posts.length) {
    card.replaceChildren(el('div', { class: 'xs muted', style: 'padding:10px' },
      `Nothing in the loaded posts falls within “${boardTimeframe === 'all' ? 'all time' : boardTimeframe}”. Try a wider timeframe, or load More.`));
    return;
  }
  card.replaceChildren(...ordered.map((p) => lensRow(p, view)));
  if (boardSort !== 'feed' || (boardSort === 'top' && boardTimeframe !== 'all')) {
    card.append(el('div', { class: 'xs muted', style: 'padding:6px' },
      'Sorted within the loaded posts — load More to widen the window.'));
  }
  for (const a of card.querySelectorAll('a[href*="/p/at:"]')) {
    const mm = a.getAttribute('href').match(/\/p\/(at:.+)$/);
    if (mm) a.setAttribute('href', `#/p?uri=${encodeURIComponent(mm[1])}`);
  }
}

const lensRow = (p, view = 'card') => postRow(p, !!session, {
  onVote: lensVote(p),
  // 3i: never duplicate the title — a preview renders only when it adds
  // content. Card mode carries media and tag doorways; compact is dense.
  bodyNode: view === 'compact' ? null
    : (p.media && !p.maskedRemoved) ? el('div', {}, mediaNode(p), tagChips(p) || '')
    : p.preview ? facetedBody({ ...p, body: p.preview }) : tagChips(p),
  authorBadge: verifiedBadge(p),
  compact: view === 'compact',
});

function lensSidebar() {
  const fieldsCard = el('div', { class: 'card' },
    el('div', { class: 'row spread' },
      el('h2', { style: 'margin:0' }, el('a', { href: '#/feeds' }, 'Feeds')),
      el('a', { href: '#/feeds', class: 'xs' }, 'discover ›')));
  const list = el('div', { class: 'stack' });
  fieldsCard.append(list);
  if (!session) {
    for (const c of CURATED) {
      list.append(el('div', { class: 'row spread' },
        el('a', { href: `#/f/${c.slug}` }, `f/${c.slug}`),
        el('span', { class: 'xs muted' }, c.kind)));
    }
    list.append(el('div', { class: 'xs muted', style: 'margin-top:6px' },
      'Guest boards. Sign in and these become YOUR feeds.'));
  } else {
    list.append(skeleton(3));
    ensureSavedFeeds().then((fields) => {
      list.replaceChildren(...fields.map((f) => {
        const entry = { slug: f.slug, humanSlug: f.humanSlug, title: f.title, kind: f.kind,
          source: f.kind === 'author' ? { kind: 'author', actor: f.id }
            : f.kind === 'timeline' ? { kind: 'timeline' } : { kind: f.kind, uri: f.id } };
        registerSource(entry);
        // share links carry the FIXED identity (the rkey); the human alias
        // still routes when typed
        return el('div', { class: 'row spread' },
          el('a', { href: `#/f/${f.slug}`, title: f.humanSlug ? `also #/f/${f.humanSlug}` : `#/f/${f.slug}` }, `f/${f.title}`),
          el('span', { class: 'xs muted' }, `${f.kind}${f.pinned ? ' · pinned' : ''}`));
      }));
    }).catch((e) => list.replaceChildren(el('div', { class: 'xs muted' }, 'Feeds failed: ' + e.message)));
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
  if (manager.state && (manager.state() === 'unknown')) {
    return el('div', { class: 'card' }, el('div', { class: 'xs muted' }, 'Restoring your session…'));
  }
  if (session) {
    const out = el('button', { class: 'btn sm' }, 'Sign out');
    out.addEventListener('click', async () => {
      try { await manager.signOut(); } catch (e) { toast(e.message, 'err'); }
      session = null;
      lens = createLens({});
      savedFeedUris.clear();
      savedFeedsPromise = null;
      activeRing = 'world';
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
  const id = el('input', { type: 'text', id: 'signin-handle', placeholder: 'you.bsky.social' });
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

// 3b: the ring dial — how far out does your ring go? Session-gated rings
// refuse with words; the selection is page-lifetime state (a view concern).
let activeRing = 'world';

function ringDial() {
  const RINGS = [['world', 'World'], ['following', 'Following'], ['mutuals', 'Mutuals'], ['mutuals+1', 'Mutuals +1']];
  const row = el('div', { class: 'row wrap', style: 'gap:6px', 'data-ring-dial': '1' });
  for (const [id, label] of RINGS) {
    const b = el('button', { class: 'btn sm' + (activeRing === id ? ' primary' : '') }, label);
    b.addEventListener('click', () => {
      if (id !== 'world' && !session) {
        const connecting = manager && manager !== 'unavailable' && manager.state && ['unknown', 'pending'].includes(manager.state());
        return toast(connecting ? 'Still restoring your session — one moment.' : 'Sign in first — rings are computed from your graph.', 'err');
      }
      activeRing = id;
      rerender();
    });
    row.append(b);
  }
  return el('div', { class: 'card' }, el('h2', {}, 'Your ring'), row,
    el('div', { class: 'xs muted', style: 'margin-top:4px' },
      'World is everyone; Following is your timeline; Mutuals is follows ∩ followers; +1 adds who they follow (capped honestly).'));
}

function ringBoard(ring, cursor) {
  const holder = el('div', {}, skeleton(6));
  // 3l: paint members as they land — a slow member no longer holds the whole
  // board on a skeleton (owner-reported hang on mutuals+1).
  const live = el('div', { class: 'card', 'data-ring-live': '1' });
  let painted = 0;
  const onPage = (posts) => {
    if (!posts.length) return;
    if (painted === 0) holder.replaceChildren(el('div', { class: 'xs muted', style: 'padding:4px' }, 'Loading your ring…'), live);
    for (const p of posts) live.append(lensRow(p, boardView()));
    painted += posts.length;
  };
  const render = (board, into) => {
    const chips = el('div', { class: 'row wrap', style: 'gap:6px' });
    if (board.overflow) chips.append(chip(`ring capped: ${board.overflow.total} members → first ${RING_CAP} (DL-016)`, `The ring truly has ${board.overflow.total} members; the board draws the first ${RING_CAP}. Honest overflow, never silent.`));
    if (board.failures.length) chips.append(chip(`${board.failures.length} member feed(s) unreachable`, board.failures.join(', ')));
    const card = el('div', { class: 'card' });
    for (const p of board.posts) card.append(lensRow(p));
    for (const a of card.querySelectorAll('a[href*="/p/at:"]')) {
      const m = a.getAttribute('href').match(/\/p\/(at:.+)$/);
      if (m) a.setAttribute('href', `#/p?uri=${encodeURIComponent(m[1])}&from=${board.fieldSlug}`);
    }
    const more = board.cursor ? el('button', { class: 'btn sm' }, 'More') : null;
    if (more) more.addEventListener('click', () => { into.replaceChildren(ringBoard(ring, board.cursor)); });
    into.replaceChildren(chips, board.posts.length ? card : emptyState('A quiet ring', 'No posts from these members yet.'), more || '');
  };
  lens.ringFeed(ring, { cursor, onPage }).then((b) => render(b, holder))
    .catch((e) => holder.replaceChildren(emptyState('Ring fetch failed', e.message)));
  return holder;
}

export function lensHomeView() {
  if (activeRing !== 'world') {
    const title = activeRing === 'following' ? 'Following' : activeRing === 'mutuals' ? 'Mutuals' : 'Mutuals +1';
    return { main: el('div', {}, el('h1', {}, title), ringDial(), ringBoard(activeRing)),
      side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
  }
  const main = el('div', {},
    el('h1', {}, 'The Lens'),
    ringDial(),
    trendingRail(),
    el('div', { class: 'card' },
      el('p', { class: 'small' },
        'Your Bluesky, shaped as a forum: feeds are the boards, threads are threads, and boosting IS liking — a boost here is a real like on Bluesky. Signed out, the lens is read-only.'),
      el('div', { class: 'row wrap', style: 'gap:6px' },
        ...(session ? [] : [chip('guest search: needs sign-in (DL-014)', 'searchPosts is 403 unauthenticated — probe-verified')]),
        chip('saves: deferred (DL-015)', 'Bookmarks are not public API surface yet'))),
    el('div', { class: 'card' },
      el('h2', {}, 'Browse'),
      el('div', { class: 'stack' },
        ...CURATED.map((c) => el('div', {}, el('a', { href: `#/f/${c.slug}` }, `f/${c.slug}`), el('span', { class: 'xs muted' }, ` — ${c.title}`))))));
  return { main, side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
}

export function lensFieldView(params) {
  const entry = sources.get(params.slug);
  if (!entry) return { main: emptyState('Unknown lens Field', 'Open the lens home first so its sources register.', el('a', { class: 'btn', href: '#/' }, 'Lens home')), side: null };
  const main = el('div', {},
    el('div', { class: 'row spread wrap' },
      el('h1', {}, entry.title),
      chip('ranking: the feed’s own order (DL-010)', 'The generator ranks; our hot/top do not apply here')),
    skeleton(6));
  const allPosts = [];
  let nextCursor = null;
  const card = el('div', { class: 'card' });
  const moreHost = el('div', {});
  const repaint = () => {
    renderBoard(card, allPosts);
    moreHost.replaceChildren();
    if (nextCursor) {
      const more = el('button', { class: 'btn sm', style: 'margin:8px' }, 'More');
      more.addEventListener('click', () => {
        lens.feed(entry.source, { title: entry.title, cursor: nextCursor })
          .then((next) => { allPosts.push(...next.posts); nextCursor = next.cursor || null; repaint(); })
          .catch((e) => toast('More failed: ' + e.message, 'err'));
      });
      moreHost.append(more);
    }
  };
  const headerHost = el('div', {});
  if (entry.source.kind === 'feed' && entry.source.uri) {
    Promise.all([lens.feedInfo(entry.source.uri), ensureSavedFeeds()])
      .then(([info]) => headerHost.replaceChildren(
        feedHeaderCard(info), affordanceStrip({ kind: 'feed', info })))
      .catch(() => {}); // the board still works without its card
  }
  lens.feed(entry.source, { title: entry.title }).then((f) => {
    allPosts.push(...f.posts);
    nextCursor = f.cursor || null;
    main.replaceChildren(
      el('div', { class: 'row spread wrap' },
        el('h1', {}, entry.title),
        el('div', { class: 'row', style: 'gap:6px' },
          chip('likes-only scores (DL-011)'),
          chip('ranking: feed order (DL-010)'))),
      headerHost,
      boardToolbar(repaint),
      f.posts.length ? card : emptyState('Nothing here', 'This source returned no posts.'),
      moreHost);
    repaint();
    // thread links: lens posts route through #/p?uri=
    for (const a of card.querySelectorAll('a[href*="/p/at:"], a[href^="#/f/"]')) {
      const href = a.getAttribute('href');
      const m = href.match(/\/p\/(at:.+)$/);
      if (m) a.setAttribute('href', `#/p?uri=${encodeURIComponent(m[1])}&from=${entry.slug}`);
    }
  }).catch((e) => main.replaceChildren(emptyState('Lens fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
}

// 3e: a quote-response rendered as thread continuation — the ❝ marker carries
// the distinction; the node opens as its own thread (the conversation
// branched into a new room, honestly).
function quoteNode(node) {
  return el('div', { class: 'comment', 'data-kind': 'quote' },
    el('div', { class: 'cmeta' },
      el('span', { title: 'A quote-response: this author quoted the post above' }, '❝ '),
      node.author ? el('a', { href: `#/u/${encodeURIComponent(node.author)}` }, node.author) : '[muted]',
      el('span', { class: 'muted' }, ` quoted this · ${timeAgo(node.createdTs)} ago · ${fmtScore(node.score)} likes`)),
    el('div', { class: 'cbody' }, node.maskedRemoved ? el('span', { class: 'muted' }, node.title || '[muted]') : node.body),
    el('div', { class: 'xs' },
      el('a', { href: `#/p?uri=${encodeURIComponent(node.quoteUri)}` }, 'open its thread ↳')));
}

// 3e inbound: any post that IS a quote shows what it quotes, linked home.
function quotedContext(quoted) {
  return el('div', { class: 'card', style: 'margin-top:6px', 'data-quoted': '1' },
    el('div', { class: 'xs muted' }, '❝ quoting ',
      el('a', { href: `https://bsky.app/profile/${quoted.author}`, target: '_blank', rel: 'noopener noreferrer' }, quoted.author)),
    el('div', { class: 'small' }, quoted.excerpt),
    el('div', { class: 'xs' }, el('a', { href: `#/p?uri=${encodeURIComponent(quoted.uri)}` }, 'open the original ↳')));
}

// 3m: the affordance strip — the one place /f/ and /h/ differ. Same chrome
// above and below; different promise here.
function affordanceStrip(stream) {
  const a = affordanceFor(stream);
  const compose = a.composeLabel
    ? (() => {
        const b = el('button', { class: 'btn sm', 'data-compose': '1', disabled: true },
          `${a.composeLabel} (composing not built yet)`);
        return b;
      })()
    : null;
  return el('div', { class: 'card', 'data-affordance': a.targetable ? 'targetable' : 'curated' },
    el('div', { class: 'row spread wrap', style: 'gap:8px;align-items:center' },
      el('div', { style: 'min-width:0' },
        el('div', { class: 'small' }, el('strong', {}, a.headline)),
        el('div', { class: 'xs muted', style: 'white-space:pre-wrap' }, a.detail)),
      compose));
}

// 3k: the profile header — the bsky card, read-only (editing lives there).
function profileHeader(p, extra) {
  return el('div', { class: 'card', 'data-profile-header': '1' },
    p.banner ? el('img', { src: p.banner, alt: '', class: 'profile-banner', loading: 'lazy' }) : null,
    el('div', { class: 'row wrap', style: 'gap:12px;align-items:flex-start' },
      p.avatar ? el('img', { src: p.avatar, alt: '', class: 'profile-avatar', loading: 'lazy' }) : null,
      el('div', { style: 'min-width:0;flex:1' },
        el('h1', { style: 'margin:0' }, p.displayName,
          p.verified === 'valid' ? el('span', { class: 'xs', title: 'Verified on Bluesky' }, ' ✓') : null,
          p.verified === 'trusted' ? el('span', { class: 'xs', title: 'Trusted verifier' }, ' ✪') : null),
        el('div', { class: 'small muted' }, `@${p.handle}`),
        el('div', { class: 'row wrap', style: 'gap:12px;margin-top:6px' },
          el('span', { class: 'small' }, el('strong', {}, fmtScore(p.followers)), ' followers'),
          el('span', { class: 'small' }, el('strong', {}, fmtScore(p.following)), ' following'),
          el('span', { class: 'small' }, el('strong', {}, fmtScore(p.posts)), ' posts')),
        p.description ? el('p', { class: 'small', style: 'margin:8px 0 0;white-space:pre-wrap' }, p.description) : null,
        el('div', { class: 'xs', style: 'margin-top:6px' },
          el('a', { href: `https://bsky.app/profile/${p.handle}`, target: '_blank', rel: 'noopener noreferrer' },
            'Profile settings live on bsky.app ↗')),
        extra || null)));
}

// 3k: the account menu — switch between fully separate signed-in accounts,
// add another, or sign out. The OAuth library keeps each session isolated.
export function accountMenu() {
  const accounts = roster.list();
  const rows = accounts.map((a) => {
    const active = session && a.did === session.did;
    const b = el('button', { class: 'btn sm' + (active ? '' : ' primary'), 'data-switch-did': a.did },
      `@${a.handle}${active ? ' (active)' : ''}`);
    if (active) b.disabled = true;
    else b.addEventListener('click', async () => {
      try {
        const s = await manager.switchTo(a.did);
        await adoptSession(s);
        toast(`Switched to @${a.handle}`, 'ok');
        rerender();
      } catch (e) { toast(`Could not switch: ${e.message}. Sign in again to re-add it.`, 'err'); }
    });
    return b;
  });
  const add = el('button', { class: 'btn sm' }, '+ Add another account');
  add.addEventListener('click', () => startDirectSignIn());
  const out = el('button', { class: 'btn sm' }, 'Sign out');
  out.addEventListener('click', async () => {
    const did = session?.did;
    try { await manager.signOut(); } catch (e) { toast(e.message, 'err'); }
    if (did) roster.forget(did);
    session = null; lens = createLens({}); savedFeedUris.clear(); savedFeedsPromise = null; activeRing = 'world';
    toast('Signed out.', 'ok');
    rerender();
  });
  return el('div', { class: 'card', 'data-account-menu': '1' },
    el('h2', { style: 'margin:0 0 6px' }, 'Accounts'),
    el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
      'Each account is completely separate — its own session, feeds, and moderation.'),
    el('div', { class: 'row wrap', style: 'gap:6px' }, ...rows),
    el('div', { class: 'row wrap', style: 'gap:6px;margin-top:8px' }, add, out));
}

// 3k: any user's profile — the persistent /u/<handle> surface.
export function lensUserView(params) {
  const handle = decodeURIComponent(params.handle);
  const main = el('div', {}, skeleton(4));
  Promise.all([lens.profile(handle), lens.feed({ kind: 'author', actor: handle }, { title: `@${handle}` })])
    .then(([p, board]) => {
      const card = el('div', { class: 'card' });
      const repaint = () => renderBoard(card, board.posts);
      main.replaceChildren(profileHeader(p), boardToolbar(repaint),
        board.posts.length ? card : emptyState('No posts', 'Nothing here yet.'));
      repaint();
    })
    .catch((e) => main.replaceChildren(emptyState('Profile fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
}

// 3j: the feed's card — avatar, description (where "post #tag to appear here"
// lives, since feeds publish NO machine-readable criteria — probe-verified),
// creator, likes, and Join/Leave.
function feedHeaderCard(info, onChange) {
  const savedNow = () => savedFeedUris.has(info.uri);
  const btn = el('button', { class: 'btn sm' + (savedNow() ? '' : ' primary') }, savedNow() ? 'Leave' : 'Join');
  btn.addEventListener('click', async () => {
    if (!session) return toast('Sign in to join feeds — it saves to your Bluesky account.', 'err');
    const want = !savedNow();
    btn.disabled = true;
    try {
      await (want ? lens.pinFeed(info.uri) : lens.unpinFeed(info.uri));
      if (want) savedFeedUris.add(info.uri); else savedFeedUris.delete(info.uri);
      toast(want ? 'Joined — it is in your feeds on Bluesky too.' : 'Left the feed.', 'ok');
      onChange?.();
    } catch (e) { toast((want ? 'Join' : 'Leave') + ' failed: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.replaceChildren(savedNow() ? 'Leave' : 'Join'); btn.classList.toggle('primary', !savedNow()); }
  });
  return el('div', { class: 'card', 'data-feed-header': '1' },
    el('div', { class: 'row spread wrap', style: 'gap:10px;align-items:center' },
      el('div', { class: 'row', style: 'gap:10px;align-items:center;min-width:0' },
        info.avatar ? el('img', { src: info.avatar, alt: '', class: 'feed-avatar', loading: 'lazy' }) : null,
        el('div', { style: 'min-width:0' },
          el('h2', { style: 'margin:0' }, info.title),
          el('div', { class: 'xs muted' }, `feed by @${info.creator} · ${fmtScore(info.likeCount)} likes`))),
      btn),
    info.description ? el('p', { class: 'small', style: 'margin:8px 0 0' }, info.description) : null,
    info.online === false || info.valid === false
      ? el('div', { class: 'xs muted' }, 'This feed’s server is not responding right now.') : null);
}

// 3j: feed discovery — /feeds. Popular generators, searchable (unauth-200),
// each with its own Join.
export function lensFeedsView() {
  const results = el('div', { class: 'stack' }, skeleton(4));
  const input = el('input', { type: 'text', placeholder: 'Search feeds…', 'data-feed-search': '1' });
  const run = (query) => {
    results.replaceChildren(skeleton(3));
    lens.discoverFeeds({ query })
      .then((feeds) => results.replaceChildren(...(feeds.length
        ? feeds.map((f) => {
            registerSource({ slug: f.uri.split('/').pop(), humanSlug: slugifyFeedName(f.title), title: f.title,
              kind: 'feed', source: { kind: 'feed', uri: f.uri } });
            return el('div', { class: 'card', 'data-discover-feed': f.uri },
              el('div', { class: 'row spread wrap', style: 'gap:8px;align-items:center' },
                el('div', { class: 'row', style: 'gap:8px;align-items:center;min-width:0' },
                  f.avatar ? el('img', { src: f.avatar, alt: '', class: 'feed-avatar', loading: 'lazy' }) : null,
                  el('div', { style: 'min-width:0' },
                    el('a', { href: `#/f/${f.uri.split('/').pop()}` }, f.title),
                    el('div', { class: 'xs muted' }, `by @${f.creator} · ${fmtScore(f.likeCount)} likes`)))),
              f.description ? el('div', { class: 'xs muted', style: 'margin-top:4px' }, f.description) : null);
          })
        : [emptyState('No feeds found', query ? `Nothing matched “${query}”.` : 'Discovery returned nothing.')])))
      .catch((e) => results.replaceChildren(emptyState('Discovery failed', e.message)));
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(input.value.trim() || undefined); });
  const go = el('button', { class: 'btn sm primary' }, 'Search');
  go.addEventListener('click', () => run(input.value.trim() || undefined));
  run();
  return {
    main: el('div', {},
      el('h1', {}, 'Discover feeds'),
      el('p', { class: 'small muted' },
        'Feeds are built by the community — each one decides its own content. How to get INTO a feed lives in its description; feeds publish no machine-readable rules.'),
      el('div', { class: 'card' }, el('div', { class: 'row', style: 'gap:6px' }, input, go)),
      results),
    side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()),
  };
}

// 3g: the hashtag board — /h/ in the Bluesky view. Session-gated (search is
// 403 unauthenticated, probe-verified) — guests get words + the way in.
export function lensHashtagView(params) {
  const tag = decodeURIComponent(params.tag);
  if (!session) {
    return { main: emptyState(`#${tag} needs a session`,
      'Hashtag boards ride search, which Bluesky gates behind sign-in (DL-021). Sign in and this becomes a live board.'),
      side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
  }
  const main = el('div', {}, el('h1', {}, `#${tag}`), skeleton(6));
  lens.stream({ kind: 'hashtag', key: tag }).then((board) => {
    const card = el('div', { class: 'card' });
    const repaint = () => renderBoard(card, board.posts);
    main.replaceChildren(el('h1', {}, `#${tag}`),
      affordanceStrip({ kind: 'hashtag', key: tag }),
      boardToolbar(repaint),
      board.posts.length ? card : emptyState('A quiet tag', `No recent posts carry #${tag}.`));
    repaint();
  }).catch((e) => main.replaceChildren(el('h1', {}, `#${tag}`), emptyState('Hashtag fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
}

// 3g: the trending rail — unspecced API; absent WITH WORDS when it breaks,
// never a blank hole. Each topic with a feed link opens as a feed stream.
function trendingRail() {
  const card = el('div', { class: 'card', 'data-trending': '1' }, el('h2', {}, 'Trending'), skeleton(3));
  lens.trending().then((topics) => {
    const rows = topics.map((t) => {
      if (!t.feedUri) return el('div', { class: 'xs muted' }, t.displayName);
      const slug = `trend-${t.feedUri.split('/').pop()}`;
      sources.set(slug, { slug, title: t.displayName, kind: 'feed', source: { kind: 'feed', uri: t.feedUri } });
      return el('div', {}, el('a', { href: `#/f/${slug}` }, t.displayName),
        t.description ? el('div', { class: 'xs muted' }, t.description) : null);
    });
    card.replaceChildren(el('h2', {}, 'Trending'),
      rows.length ? el('div', { class: 'stack' }, ...rows)
        : el('div', { class: 'xs muted' }, 'Nothing trending right now.'));
  }).catch(() => card.replaceChildren(el('h2', {}, 'Trending'),
    el('div', { class: 'xs muted' }, 'Trending is unavailable (it rides an unstable API — DL-020). The rest of the lens is unaffected.')));
  return card;
}

// 3i (owner): the signed-in identity + moderation mirror live on YOUR page,
// not the front page. The masthead @handle links here.
export function lensProfileView() {
  if (!session) {
    return { main: el('div', {}, el('h1', {}, 'Your profile'),
      el('p', { class: 'muted small' }, 'Sign in and this page carries your session and your moderation mirror.'),
      sessionCard()), side: null };
  }
  // capture the handle NOW: an in-flight profile fetch must not read a
  // session that sign-out has since cleared (the journey caught this).
  const handle = session.handle;
  const main = el('div', {}, skeleton(3), accountMenu(), moderationPanel());
  lens.profile(handle)
    .then((p) => { if (session) main.replaceChildren(profileHeader(p), accountMenu(), moderationPanel()); })
    .catch(() => { if (session) main.replaceChildren(el('h1', {}, `@${handle}`), accountMenu(), moderationPanel()); });
  return { main, side: null };
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
    const head = el('div', { class: 'card', style: 'display:flex;gap:10px' },
      voteBox('post', p.id, p, !!session, 'col', lensVote(p)),
      el('div', {},
      el('div', { class: 'row wrap', style: 'gap:6px' },
        el('a', { href: `#/f/${src.fieldSlug}`, class: 'xs' }, `f/${src.fieldSlug}`),
        p.nsfw ? el('span', { class: 'chip badge-nsfw' }, 'NSFW') : null),
      el('h1', {}, p.title.slice(0, 300)),
      el('div', { class: 'postmeta' },
        p.author ? el('a', { href: `#/u/${encodeURIComponent(p.author)}` }, p.author) : '[muted]',
        ` · ${fmtScore(p.score)} likes · ${timeAgo(p.createdTs)} ago · ${p.commentCount} replies`),
      // 3i: the poster's own 1/3-2/3-3/3 chain reads as the post body
      ...(t.selfThread || []).map((part) => el('div', { class: 'small', style: 'margin-top:8px' },
        ...facetSegments(part.text, part.facets).map((seg) => {
          if (!seg.facet) return seg.text;
          if (seg.facet.type === 'link') return el('a', { href: seg.facet.value, target: '_blank', rel: 'noopener noreferrer' }, seg.text);
          if (seg.facet.type === 'mention') return el('a', { href: `https://bsky.app/profile/${seg.facet.value}`, target: '_blank', rel: 'noopener noreferrer' }, seg.text);
          if (seg.facet.type === 'tag') return el('a', { href: `#/h/${encodeURIComponent(seg.facet.value)}`, 'data-tag': seg.facet.value }, seg.text);
          return seg.text;
        }))),
      p.quoted ? quotedContext(p.quoted) : null,
      t.quotesFailed ? el('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
        chip(`${t.quoteCount} quote${t.quoteCount === 1 ? '' : 's'} — couldn't fetch`, 'getQuotes failed; replies still render. Reload to retry.')) : null));
    const ctx = { ...LENS_PERMS, locked: true, // read-only: reply/vote/save/mod all gate
      authorHref: (n) => `#/u/${encodeURIComponent(n.author)}` }; // 3k: authors reach OUR profile page (which links out)
    const commentsCard = el('div', { class: 'card' });
    for (const node of t.comments) {
      commentsCard.append(node.kind === 'quote' ? quoteNode(node) : commentNode(node, ctx));
    }
    main.replaceChildren(head, t.comments.length ? commentsCard : emptyState('No replies', 'Nothing below this post yet.'));
  }).catch((e) => main.replaceChildren(emptyState('Lens fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
}
