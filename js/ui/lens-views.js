// The wide lens UI (6d): #/lens routes render the owner's Bluesky as a forum
// through the SAME components the memory tier uses — postRow and commentNode
// consume the lens shapes unchanged. Read-first: every write surface is a
// frontier chip backed by a ledger entry (DL-013..015), never a dead button.
// Identity is the OAuth session (2c): js/auth/session.js wraps the vendored
// official client; the library owns persistence (IndexedDB) and refresh, so
// sign-in survives reloads. The lens consumes { did, handle, fetchHandler }.

import { el, timeAgo, fmtScore, domainOf, plural } from '../util.js';
import { postRow, commentNode, voteBox, skeleton, emptyState, toast } from './components.js';
import { navTree } from './nav.js';
import { LADDER, RUNG_IDS, labelFor } from '../rings.js';
import { lastBoard, setLastBoard, landingBoard, DIRECTORY } from '../last-board.js';
import { createLens, LENS_PERMS, RING_CAP, facetSegments, slugifyFeedName, sortWindow, affordanceFor,
  feedCardModel, threadNodeStyle, feedPath, parseFeedRoute, sessionGateMessage, canDelete, sourceLabel,
  sortFeeds, filterFeeds, platforms, liveFeeds } from '../substrates/lens.js';
import { initSession, createAccountRoster, isOAuthCallback } from '../auth/session.js';
import { hostById, featuredHosts, canCreateAccount } from '../auth/hosts.js';
import { heroDismissed, dismissHero, EMBLEM } from '../hero.js';
import * as mediaScale from '../media-scale.js';
import * as lang from '../lang.js';
import { density, setDensity, DENSITIES } from '../board-density.js';
import { POST_LIMITS, IMAGE_LIMITS, graphemes, withTag } from '../compose.js';
import { MEDIA_SCALE } from '../media-scale.js';
import { settingsView } from './views.js';
import { tagSubs, subscribeTag, unsubscribeTag, isSubscribed, normalizeTag, onChange as onTagSubsChange } from '../tagsubs.js';
import { observeTags, topTags, SORTS, sortLabel } from '../tag-stats.js';
import { trendingTags, trendingTtl, setTrendingTtl, DEFAULT_TTL_MS } from '../trending-tags.js';
import { HASHTAG_SECTIONS, sectionEnabled, setSectionEnabled, enabledSections } from '../hashtag-prefs.js';

let manager = null;        // null = not booted; 'unavailable' = origin has no OAuth client
let session = null;        // the lens session shape, set after restore
let lens = createLens({});
let bootPromise = null;   // the in-flight boot, SHARED — see bootAuth()
// which feeds the account has saved (join state). Fetched ONCE per session
// and shared — the header card and the sidebar both need it, and a race
// between them showed the wrong Join/Leave label.
const savedFeedUris = new Set();
// 3s: and which of those are FAVORITED (pinned to the top row of the official
// app). Saved and pinned are two different states in savedFeedsPrefV2 — Forage
// used to force both at once, quietly rearranging that top row.
const pinnedFeedUris = new Set();
let savedFeedsPromise = null;
const roster = createAccountRoster();
function ensureSavedFeeds() {
  if (!session) return Promise.resolve(savedFeedUris);
  if (!savedFeedsPromise) {
    savedFeedsPromise = lens.feeds()
      .then((fs) => {
        for (const f of fs) {
          if (f.kind !== 'feed') continue;
          savedFeedUris.add(f.id);
          if (f.pinned) pinnedFeedUris.add(f.id);
        }
        return fs;
      })
      .catch(() => []);
  }
  return savedFeedsPromise;
}

const rerender = () => window.dispatchEvent(new PopStateEvent('popstate'));

// 3i: the OAuth identity, for the bluesky masthead. null = signed out;
// 'connecting' while restore is in flight (the masthead must never ask for a
// sign-in it is about to restore).
// 3i (owner: "launch oauth directly"): the masthead control starts the
// authorize redirect via the ENTRYWAY — bsky.social collects the handle; no
// local form. The sidebar card keeps the handle-first path.
export async function startDirectSignIn() {
  // 4k: through the REGISTRY, not a hardcoded string. The masthead keeps the
  // one-tap Bluesky path on purpose (owner, 2026-08-27) — the plural path is
  // the sheet, reachable from the sidebar card on every signed-out surface.
  return beginSignIn(hostById('bsky').entryway);
}

// The single door every sign-in goes through: the masthead's direct path, each
// row of the host sheet, and the any-server handle field. `options` is
// FORWARDED, never synthesised — an options-less sign-in must not invent a
// prompt, which is why this branches instead of passing `options` through as
// undefined and trusting every layer below to keep treating that as absent.
async function beginSignIn(handle, options) {
  await ensureAuthBoot();
  if (!manager || manager === 'unavailable') {
    return toast('Sign-in is origin-bound — works on forage.fyi and localhost.', 'err');
  }
  try { await (options ? manager.signIn(handle, options) : manager.signIn(handle)); }
  catch (e) { toast('Sign-in failed: ' + e.message, 'err'); }
}

// ---- the host sheet (plan 2026-08-26-3, Phase C) -------------------------
// Forage has no accounts of its own, so the front door's job is to route you to
// a server rather than register you. A single "Sign in with Bluesky" button
// teaches a newcomer that atproto is one company's product; a stacked list with
// visibly different rules teaches the truth by showing it.
//
// Native <dialog> + showModal(), NOT a hand-rolled div. Probed under the
// harness (Phase 0 D2) rather than assumed: it supplies focus entry, Esc, focus
// return to the trigger, and background inertness with no code, and axe can see
// inside an open one — proved by planting an unnamed button in the probe,
// because a clean scan would have proved nothing. Modals are precisely where
// hand-rolling fails, and every one of those behaviours is a thing a keyboard
// visitor needs and a sighted mouse user never notices missing.
//
// Built FRESH per open and removed on close: the rows are static, but the
// "Another server" field is not, and a lingering singleton would carry a
// half-typed handle from one visit into the next.
function authSheet() {
  const titleId = 'authsheet-title';
  const dialog = el('dialog', { class: 'authsheet', 'data-auth-sheet': '1', 'aria-labelledby': titleId });
  const close = el('button', { type: 'button', class: 'sheet-x', 'aria-label': 'Close' }, '✕');
  close.addEventListener('click', () => dialog.close());

  const list = el('div', { class: 'sheet-list' });
  for (const h of featuredHosts()) {
    const actions = el('div', { class: 'sheet-actions' });
    if (canCreateAccount(h)) {
      const create = el('button', { type: 'button', class: 'btn primary sm', 'data-host-create': '1' }, 'Create account');
      // prompt=create is not decoration: driven end to end against both open
      // hosts (Phase 0 D1), it lands in the registration wizard rather than the
      // sign-in screen. Without that evidence this button and the one beside it
      // would be two routes to the same page wearing different words.
      create.addEventListener('click', () => beginSignIn(h.entryway, { prompt: 'create' }));
      actions.append(create);
    } else {
      // The words sit in the CREATE slot rather than after the row, so the
      // column stays aligned and the italic explains the button that is
      // missing. An invite-only host still ADVERTISES create; offering it
      // would send someone to a screen that then demands a code.
      actions.append(el('span', { class: 'sheet-invite' }, 'invite only'));
    }
    const go = el('button', { type: 'button', class: 'btn sm', 'data-host-signin': '1' }, 'Sign in');
    go.addEventListener('click', () => beginSignIn(h.entryway));
    actions.append(go);
    list.append(el('div', { class: 'sheet-row', 'data-host-row': h.id },
      el('span', { class: 'sheet-host' }, h.label), actions));
  }

  // Everything not on the short list reaches the same seam. The list is an
  // editorial convenience, not a boundary — this is what keeps it from being
  // one.
  const handle = el('input', { type: 'text', id: 'sheet-other-handle', 'data-host-other-handle': '1',
    placeholder: 'you.example.com', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const form = el('form', { class: 'sheet-other', hidden: true },
    el('label', { for: 'sheet-other-handle', class: 'xs muted' }, 'Your handle on any atproto server'),
    el('div', { class: 'row', style: 'gap:6px;margin-top:4px' }, handle,
      el('button', { type: 'submit', class: 'btn primary sm', 'data-host-other-go': '1' }, 'Continue')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = handle.value.trim().replace(/^@+/, '');
    if (!v) return toast('Enter your handle — for example you.example.com.', 'err');
    beginSignIn(v);
  });
  const other = el('button', { type: 'button', class: 'btn sm sheet-more', 'data-host-other': '1' }, 'Another server');
  other.addEventListener('click', () => { other.hidden = true; form.hidden = false; handle.focus(); });

  dialog.append(
    el('div', { class: 'row spread' },
      el('h2', { id: titleId, style: 'margin:0' }, 'Choose your server'), close),
    el('p', { class: 'xs muted' },
      'Forage has no accounts of its own. You sign in with an account on an atproto server — Bluesky is one of many, and each sets its own rules.'),
    list, other, form);
  return dialog;
}

// ---- the emblem hero (plan 2026-08-26-3, Phase D) ------------------------
// The lens had no front door. The rook-and-wreath emblem with its sign-in call
// has existed since the first build — in boardView(), in the MEMORY population
// — while production defaults to the lens, so the one surface a first-time
// visitor actually lands on was the one surface without it.
//
// STACKED on a phone, emblem full width above the copy. The side-by-side
// variant was built, measured (198px, 32% of the fold against 289px, 42%) and
// rejected on sight by the owner: at 46% width the rook and the wreath stop
// reading and the headline wraps into the close control. It is not a smaller
// version of what was asked for. If this ever has to shrink, cut a line of
// copy, not the art.
//
// Home only, signed out only, dismissible forever.
function heroCard() {
  const card = el('div', { class: 'card hero-lens', 'data-hero': '1' });
  const x = el('button', { type: 'button', class: 'hero-x', 'data-hero-dismiss': '1',
    'aria-label': 'Hide this' }, '✕');
  x.addEventListener('click', () => {
    // The view removes the node; js/hero.js only persists. So a reader in
    // private mode still gets a ✕ that does something — it hides it for this
    // visit and forgets — rather than one that silently no-ops.
    dismissHero();
    card.remove();
  });
  const cta = el('button', { type: 'button', class: 'btn primary', 'data-hero-cta': '1' },
    'Sign in or create an account');
  cta.addEventListener('click', () => openAuthSheet());
  card.append(x,
    el('img', { class: 'hero-emblem', src: EMBLEM.src, srcset: EMBLEM.srcset,
      sizes: EMBLEM.sizes, alt: EMBLEM.alt,
      width: '1600', height: '576', decoding: 'async' }),
    el('div', { class: 'hero-copy' },
      el('strong', { class: 'hero-head' }, 'Forage the open web.'),
      el('p', { class: 'small' },
        'Your Bluesky as a forum — feeds are boards, threads are threads. Forage has no accounts of its own: you bring one from Bluesky or any other atproto server.'),
      cta));
  return card;
}

export function openAuthSheet() {
  // Never rendered signed in. Checked here as well as at the trigger, because
  // the trigger is markup and this is the door.
  if (session) return;
  const dialog = authSheet();
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

// Phase-1 live-proof finding: a click during the session-restore window used to
// vanish — the view re-rendered underneath it and nothing was said. Every
// session-gated control asks this, so "still restoring" and "signed out" never
// get conflated again.
function sessionGate(action) {
  const authState = manager && manager !== 'unavailable' && manager.state ? manager.state() : 'signed-out';
  return sessionGateMessage({ signedIn: !!session, authState }, action);
}

export function sessionIdentity() {
  if (session) return `@${session.handle}`;
  if (manager && manager !== 'unavailable' && manager.state && ['unknown', 'pending'].includes(manager.state())) return 'connecting';
  return null;
}

// Exported for main.js: an OAuth callback landing must complete the exchange
// BEFORE the router replaces the hash (the code lives in the fragment).
export async function ensureAuthBoot() { return bootAuth(); }

// Boot once, and make every caller WAIT for that one boot. The distinction is
// the whole point: a boolean `bootStarted` flag also boots once, but the second
// caller returns immediately while the first is still in flight, so `await
// ensureAuthBoot()` resolves before the session exists.
//
// That cost a production sign-in outage (2026-08-26). main.js deliberately
// awaits this before dropping the OAuth params from the URL — "must complete
// the exchange BEFORE the hash changes" — and the early return made that await
// a no-op, so replaceState wiped the fragment while the vendored client was
// still loading. The exchange then read an empty URL, client.init() returned
// undefined, and restore() correctly reported signed-out. Every layer behaved
// as written; the guard was the lie.
//
// Same fix, same reason, as the ring cache (3x): cache the PROMISE, so racing
// callers share one piece of work instead of one of them racing past it.
// Unlike the ring cache we never drop a rejected promise — the body catches
// everything itself, so failure is already a settled 'unavailable' state, and
// re-running boot on every repaint after a metadata failure would hammer it.
function bootAuth() {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    try {
      const m = await initSession();
      if (!m) { manager = 'unavailable'; rerender(); return; }
      manager = m;
      m.onChange(() => rerender());
      // Whether this boot ARRIVED as an OAuth callback, read before anything
      // clears it — main.js drops the params only after awaiting this function,
      // which is the whole point of the Phase 0 fix.
      const fromCallback = isOAuthCallback(location.search) || isOAuthCallback(location.hash);
      const s = await m.restore(); // restores a saved session OR completes a callback
      if (s) await adoptSession(s);
      else if (fromCallback) {
        // 4k: the state that used to be SILENT. An authorization came back and
        // produced no session — which is NOT the same as an ordinary
        // signed-out boot, and must not render as one. Every layer behaved as
        // written when this last happened, and the only instrument was a human
        // noticing they were still logged out.
        toast('Sign-in did not complete — the authorization came back but no session was created. Try again.', 'err');
      }
    } catch (e) {
      manager = 'unavailable';
      toast(e.message, 'err'); // vendor drift / metadata failures speak, never blank
    }
    rerender();
  })();
  return bootPromise;
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
  pinnedFeedUris.clear();
  savedFeedsPromise = null;
  // 3x: warm the ring the dial will most likely ask for, while the board is
  // still painting. Fire-and-forget: a failure here must never break sign-in,
  // and the dial will simply compute it the normal way.
  lens.ringMembers('mutuals').catch(() => {});
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
  // 4h: the FALLBACK name, not the name. Probed 2026-08-26: the network
  // reports displayName "Discover" for this rkey. Kept as a fallback for the
  // offline/failed-resolve case, and checked against the network by
  // e2e/curated-names-live.workflow.mjs (LIVE=1) so drift is reported, not shipped.
  { slug: 'whats-hot', title: 'Discover', kind: 'feed',
    source: { kind: 'feed', uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' } },
  // 4h: the FALLBACK name again — probed 2026-08-26, this account reports
  // displayName "Bluesky". It had been shipping as "Bluesky Team", which the
  // account has never called itself.
  { slug: 'bsky.app', title: 'Bluesky', kind: 'author', source: { kind: 'author', actor: 'bsky.app' } },
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
    // The `next === -1` branch and its DL-011 toast are gone with the control
    // that produced them (plan 2026-08-27-1). Nothing in the app can send -1
    // now; js/schema.js is what stops anything else from doing so (Phase 5).
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
    ...tags.map((t) => el('a', { class: 'tag', 'data-tag': t, href: `/h/${encodeURIComponent(t)}` }, `#${t}`)));
}

function facetedBody(p) {
  if (p.maskedRemoved || !p.body) return null;
  const segs = facetSegments(p.body, p.facets);
  const nodes = segs.map((seg) => {
    if (!seg.facet) return seg.text;
    if (seg.facet.type === 'link') return el('a', { href: seg.facet.value, target: '_blank', rel: 'noopener noreferrer' }, seg.text);
    if (seg.facet.type === 'mention') return el('a', { href: `https://bsky.app/profile/${seg.facet.value}`, target: '_blank', rel: 'noopener noreferrer', title: 'Profiles live on bsky.app — Forage is a lens' }, seg.text);
    if (seg.facet.type === 'tag') return el('a', { href: `/h/${encodeURIComponent(seg.facet.value)}`, 'data-tag': seg.facet.value, title: 'Open this hashtag as a board' }, seg.text);
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
      // 4i: an author who wrote alt text has named this link already — the img's
      // alt IS the link's accessible name. Where they did not, we name what the
      // link DOES and stop there. We do NOT invent a description of a picture
      // nobody has described: a fabricated alt makes a screen reader worse while
      // turning this gate green, which is the worst of both.
      ...p.media.items.map((i) => el('a', {
        href: i.full, target: '_blank', rel: 'noopener noreferrer',
        ...(i.alt ? {} : { 'aria-label': 'Image, opens full size' }),
      }, el('img', { src: i.thumb, alt: i.alt, loading: 'lazy' }))));
  }
  if (p.media.kind === 'video') {
    const link = `https://bsky.app/profile/${p.author}/post/${p.id.split('/').pop()}`;
    return el('div', { class: 'media-strip' },
      el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', title: 'Video — plays on bsky.app' },
        p.media.thumb ? el('img', { src: p.media.thumb, alt: '[video]', loading: 'lazy' }) : el('span', { class: 'tag' }, '▶ video')));
  }
  if (p.media.kind === 'external') {
    // 4i: the thumbnail is DECORATIVE — alt='' is correct and stays. What the
    // link means is its destination, so the ANCHOR is the thing that needs a
    // name, and the card's own title is that name (carried through the shaper
    // for exactly this). With no title, the host is the honest fallback: it
    // says where you are going, which is more than "link" and less than a
    // guess. Live SERIOUS violation until 2026-08-26.
    const name = p.media.title || domainOf(p.media.uri) || 'external link';
    return el('div', { class: 'media-strip' },
      el('a', { href: p.media.uri, target: '_blank', rel: 'noopener noreferrer',
        'aria-label': `${name} — opens in a new tab` },
        el('img', { src: p.media.thumb, alt: '', loading: 'lazy' })));
  }
  return null;
}

// The board view preference (card | compact) — device-local, like theme/skin.
// The density preference now lives in js/board-density.js so BOTH populations
// read one key through one module. `boardView` is kept as a local alias only
// because this file reads it in a dozen places.
const boardView = density;

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
  const viewSel = el('select', { 'data-density': '1', 'aria-label': 'Board density',
    title: 'Card shows previews and media; Compact is dense rows' },
    ...DENSITIES.map(([v, l]) =>
      el('option', { value: v, selected: boardView() === v || false }, l)));

  // 3t: how big previews should be is a per-screen judgement, so it is a
  // slider rather than a setting. Card view only — compact renders no media,
  // and a media control over a board with none is a lie. Applying it writes
  // ONE CSS custom property, so a drag never refetches or repaints the board.
  const slider = el('input', { type: 'range', 'data-media-scale': '1',
    min: String(MEDIA_SCALE.min), max: String(MEDIA_SCALE.max), step: String(MEDIA_SCALE.step),
    value: String(mediaScale.active()), title: 'Preview size' });
  const syncSlider = () => { slider.style.display = boardView() === 'card' ? '' : 'none'; };
  syncSlider();
  slider.addEventListener('input', () => { mediaScale.set(slider.value); applyMediaScale(); });

  viewSel.addEventListener('change', () => {
    setDensity(viewSel.value);
    syncSlider();
    onChange();
  });
  return el('div', { class: 'row wrap', style: 'gap:6px;margin:6px 0;align-items:center', 'data-board-toolbar': '1' },
    sortSel, tfSel, viewSel,
    el('div', { class: 'row', style: 'gap:6px;align-items:center;margin-left:auto' }, slider));
}

// 3t: the slider's ONE output — the board reads --media-max in CSS.
function applyMediaScale() {
  document.documentElement.style.setProperty('--media-max', mediaScale.cssValue());
}

// One board renderer: applies the window sort and the view mode.
function renderBoard(card, posts, { wholeCorpus = false } = {}) {
  const view = boardView();
  // 3u: the language filter runs BEFORE the window sort, so "Top" ranks what
  // you can actually read. Nothing is hidden silently — the count says so.
  // It still applies when the server ranked (4e): language is a content
  // filter, not an ordering, so it composes with either.
  const prefs = lang.active();
  const visible = prefs.length ? posts.filter((p) => lang.matches(p, prefs)) : posts;
  const hidden = posts.length - visible.length;
  // Count what the reader was SHOWN, which is `visible` and not `posts`. The
  // first version observed before this filter ran, so a post hidden by the
  // language preference still fed the browse list — statistics about reading
  // that included things nobody could read. (Owner asked what "seen" counts;
  // answering it precisely is what found this.)
  //
  // "Seen" still means LOADED ONTO A BOARD YOU OPENED, including below the
  // fold — not scrolled past. Doing it by viewport would need an
  // IntersectionObserver per row, and the copy on /hashtags says "as your
  // boards load" rather than implying otherwise.
  observeTags(visible);
  // 4e: when the SERVER ranked the whole corpus (a /h/ board), the posts arrive
  // already ordered — re-sorting locally would shuffle a ranking we did not
  // compute, and the window has already been applied at the query.
  const ordered = wholeCorpus ? visible : sortWindow(visible, boardSort, boardTimeframe, Date.now());
  // Top + a narrow timeframe can legitimately empty the board — say why
  // rather than showing a blank card (the journey caught this).
  if (!wholeCorpus && !ordered.length && visible.length) {
    card.replaceChildren(el('div', { class: 'xs muted', style: 'padding:10px' },
      `Nothing in the loaded posts falls within “${boardTimeframe === 'all' ? 'all time' : boardTimeframe}”. Try a wider timeframe, or load More.`));
    return;
  }
  card.replaceChildren(...ordered.map((p) => lensRow(p, view)));
  if (hidden > 0) {
    card.append(el('div', { class: 'xs muted', style: 'padding:6px', 'data-lang-hidden': String(hidden) },
      `${hidden} post${hidden === 1 ? '' : 's'} hidden by your content languages (${prefs.join(', ')}). `,
      el('a', { href: '/me' }, 'change that ›')));
  }
  if (!wholeCorpus && (boardSort !== 'feed' || (boardSort === 'top' && boardTimeframe !== 'all'))) {
    card.append(el('div', { class: 'xs muted', style: 'padding:6px' },
      'Sorted within the loaded posts — load More to widen the window.'));
  }
  for (const a of card.querySelectorAll('a[href*="/p/at:"]')) {
    const mm = a.getAttribute('href').match(/\/p\/(at:.+)$/);
    if (mm) a.setAttribute('href', `/p?uri=${encodeURIComponent(mm[1])}`);
  }
}

// 3v: the breadcrumb on a board row is a link people copy, so give it the
// shareable form whenever the registry knows who made the feed.
const feedHrefFor = (slug) => {
  const entry = sources.get(slug);
  return (entry && feedPath({ creator: entry.creator, rkey: entry.slug })) || `/f/${slug}`;
};

// Plan 2026-08-28-1: what a row IS, said above its title. A reply names and
// links the comment it answers — `/p?uri=` opens the thread the conversation
// actually lives in, and the envelope already paid for the author + excerpt. A
// repost says who repeated it, because the row's byline is the ORIGINAL
// author's and without this line the repeat reads as their fresh post.
function kindContext(p) {
  if (p.itemKind === 'reply' && p.replyTo?.uri) {
    const who = p.replyTo.author ? `@${p.replyTo.author}` : 'the conversation';
    const cut = p.replyTo.excerpt.length > 90 ? p.replyTo.excerpt.slice(0, 90) + '…' : p.replyTo.excerpt;
    return el('div', { class: 'xs reply-context', 'data-reply-context': p.replyTo.uri },
      '↩ replying to ',
      el('a', { href: `/p?uri=${encodeURIComponent(p.replyTo.uri)}` },
        cut ? `${who}: “${cut}”` : who));
  }
  if (p.itemKind === 'repost') {
    return el('div', { class: 'xs muted repost-context', 'data-repost-context': '1' },
      `⟳ reposted by ${p.repostBy ? '@' + p.repostBy : '[unknown]'}`);
  }
  return null;
}

const lensRow = (p, view = 'card') => {
  const showsMedia = view !== 'compact' && p.media && !p.maskedRemoved;
  // Compact renders no media strip, so a placeholder-titled row takes a tiny
  // thumbnail as its handle instead of the literal '[image]' — the same link
  // to the same thread, showing a sliver of the thing rather than naming its
  // absence. A video with no thumbnail keeps the text placeholder: the handle
  // must render something.
  const thumb = view === 'compact' && p.placeholderTitle && !p.maskedRemoved
    ? (p.media?.kind === 'images' ? p.media.items?.[0]?.thumb : p.media?.thumb)
    : null;
  return postRow(p, !!session, {
    onVote: lensVote(p),
    aboveNode: kindContext(p),
    // 3i: never duplicate the title — a preview renders only when it adds
    // content. Card mode carries media and tag doorways; compact is dense.
    bodyNode: view === 'compact' ? null
      : showsMedia ? el('div', {}, mediaNode(p), tagChips(p) || '')
      : p.preview ? facetedBody({ ...p, body: p.preview }) : tagChips(p),
    // A placeholder title ('[image]', '[video]') exists so a row is never
    // blank. A card row showing the media IS the content, so the placeholder
    // drops there outright; a compact row swaps it for the thumb above.
    ...(showsMedia && p.placeholderTitle ? { titleNode: null } : {}),
    ...(thumb ? { titleNode: el('div', { class: 'posttitle' },
      // Same href shape postRow builds — renderBoard rewrites it to /p?uri=.
      // The img stays decorative inside a NAMED link: the label says what the
      // link does, and invents no description of an undescribed picture.
      el('a', { href: `/f/${p.feedSlug}/p/${p.id}`,
        'aria-label': p.media.kind === 'video' ? 'Video post — open thread' : 'Image post — open thread' },
        el('img', { class: 'title-thumb', src: thumb, alt: '', loading: 'lazy' }))) } : {}),
    authorBadge: verifiedBadge(p),
    metaExtra: langChip(p),
    feedHref: feedHrefFor(p.feedSlug),
    compact: view === 'compact',
  });
};

// 3u: name the language when the post declared one you do not read. With no
// preference stored the browser's language stands in, so a mixed board is
// legible before anyone has chosen anything.
function langChip(p) {
  const code = lang.annotate(p, lang.active(), typeof navigator !== 'undefined' ? navigator.language : null);
  return code ? el('span', { class: 'chip lang-chip', 'data-lang-chip': code, title: `This post declares its language as ${code}` }, code) : null;
}

function lensSidebar() {
  const feedsCard = el('div', { class: 'card' },
    el('div', { class: 'row spread' },
      el('h2', { style: 'margin:0' }, el('a', { href: '/feeds' }, 'Feeds')),
      el('a', { href: '/feeds', class: 'xs' }, 'browse ›')));
  const list = el('div', { class: 'stack' });
  feedsCard.append(list);
  if (!session) {
    for (const c of CURATED) {
      list.append(el('div', { class: 'row spread' },
        el('a', { href: `/f/${c.slug}` }, `f/${sourceLabel(c)}`),
        el('span', { class: 'xs muted' }, c.kind)));
    }
    list.append(el('div', { class: 'xs muted', style: 'margin-top:6px' },
      'Guest boards. Sign in and these become YOUR feeds.'));
  } else {
    list.append(skeleton(3));
    ensureSavedFeeds().then((feeds) => {
      list.replaceChildren(...feeds.map((f) => {
        const entry = { slug: f.slug, humanSlug: f.humanSlug, title: f.title, kind: f.kind, creator: f.creator,
          source: f.kind === 'author' ? { kind: 'author', actor: f.id }
            : f.kind === 'timeline' ? { kind: 'timeline' } : { kind: f.kind, uri: f.id } };
        registerSource(entry);
        // share links carry the FIXED identity (the rkey); the human alias
        // still routes when typed
        return el('div', { class: 'row spread' },
          el('a', { href: feedPath({ creator: f.creator, rkey: f.slug }) || `/f/${f.slug}`,
            title: f.creator ? `Shareable: /f/@${f.creator}/${f.slug}` : `/f/${f.slug}` }, `f/${sourceLabel(f)}`),
          el('span', { class: 'xs muted' }, `${f.kind}${f.pinned ? ' · pinned' : ''}`));
      }));
    }).catch((e) => list.replaceChildren(el('div', { class: 'xs muted' }, 'Feeds failed: ' + e.message)));
  }
  return feedsCard;
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
      pinnedFeedUris.clear();
      savedFeedsPromise = null;
      // (the new lens above has no ring memory — the graph belongs to the
      // account that just left)
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
  // 4l (owner, 2026-08-27): the sheet's entry point lives HERE rather than on
  // the masthead. The masthead keeps the one-tap Bluesky path settled back in
  // 3i ("launch OAuth DIRECTLY"), and reversing that six phases later needed a
  // better reason than symmetry. This card renders on every signed-out surface,
  // so a visitor whose server is not Bluesky stops depending on a hero that
  // exists on one page and can be dismissed forever.
  const more = el('button', { type: 'button', class: 'btn sm sheet-open', 'data-open-auth-sheet': '1' },
    'Use another server →');
  more.addEventListener('click', () => openAuthSheet());
  return el('div', { class: 'card' },
    el('h2', {}, 'Sign in with Bluesky'),
    el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
      'The official OAuth flow — you authorize on your own server; no credentials touch Forage. Unlocks your saved feeds as Feeds, Following, and search.'),
    el('div', { class: 'field-row' }, el('label', {}, 'Handle'), id),
    el('div', { class: 'row wrap', style: 'gap:6px' }, btn, more));
}

// 3b/V4: the ring dial is GONE. It was a card on one page, holding
// page-lifetime state that reset on reload, and the redesign moved the ladder
// into the left nav where every rung is a link with one job. What used to be
// `activeRing` is now the URL (/r/:rung) plus js/last-board.js, so the board
// you are on is shareable, reloadable, and remembered.

// Plan 2026-08-28-1: the ring board separates what its members WROTE from
// what they ANSWERED and what they merely REPEATED. Per-page-load view state,
// like boardSort: a tab is a filter over the loaded window, never a refetch —
// the fan-out already paid for every kind.
let ringTab = 'posts';
const RING_TABS = [['posts', 'Posts'], ['replies', 'Replies'], ['reposts', 'Reposts']];
const ringTabFor = (p) => p.itemKind === 'repost' ? 'reposts' : p.itemKind === 'reply' ? 'replies' : 'posts';

function ringTabsRow(onChange) {
  const row = el('div', { class: 'tabs', 'data-ring-tabs': '1' });
  const paint = () => {
    for (const b of row.children) {
      const on = b.dataset.ringTab === ringTab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  };
  for (const [id, label] of RING_TABS) {
    const b = el('button', { type: 'button', class: 'tab', 'data-ring-tab': id }, label);
    b.addEventListener('click', () => { if (ringTab !== id) { ringTab = id; paint(); onChange(); } });
    row.append(b);
  }
  paint();
  return row;
}

function ringBoard(ring, cursor) {
  const holder = el('div', {}, skeleton(6));
  // 3l: paint members as they land — a slow member no longer holds the whole
  // board on a skeleton (owner-reported hang on mutuals+1).
  const live = el('div', { class: 'card', 'data-ring-live': '1' });
  // ONE tabs row serves both phases; what "repaint" means advances from the
  // arrival window to the settled board when render() lands.
  let repaint = () => {};
  const tabs = ringTabsRow(() => repaint());
  const arrived = [];
  let painted = 0;
  repaint = () => live.replaceChildren(
    ...arrived.filter((p) => ringTabFor(p) === ringTab).map((p) => lensRow(p, boardView())));
  const onPage = (posts) => {
    if (!posts.length) return;
    if (painted === 0) holder.replaceChildren(tabs, el('div', { class: 'xs muted', style: 'padding:4px' }, 'Loading your ring…'), live);
    arrived.push(...posts);
    for (const p of posts) if (ringTabFor(p) === ringTab) live.append(lensRow(p, boardView()));
    painted += posts.length;
  };
  const render = (board, into) => {
    const chips = el('div', { class: 'row wrap', style: 'gap:6px' });
    if (board.overflow) chips.append(chip(`ring capped: ${board.overflow.total} members → first ${RING_CAP} (DL-016)`, `The ring truly has ${board.overflow.total} members; the board draws the first ${RING_CAP}. Honest overflow, never silent.`));
    if (board.failures.length) chips.append(chip(`${board.failures.length} member feed(s) unreachable`, board.failures.join(', ')));
    const card = el('div', { class: 'card' });
    // Observed ONCE, on the whole board, and deliberately outside paint():
    //
    // - outside, because paint() re-runs on every tab switch. observeTags
    //   de-duplicates by post id so it would be harmless, but "count when the
    //   board loads" is the rule and running it per repaint states a different
    //   one.
    // - the WHOLE board, not the active tab's rows. The language filter case is
    //   different and stays different: a post the language filter drops can
    //   never be seen, where a post on another tab is one click away and needed
    //   no fetch. Counting per-tab would also make the same board yield
    //   different statistics depending on which tab you happened to land on.
    observeTags(board.posts);
    const paint = () => {
      const rows = board.posts.filter((p) => ringTabFor(p) === ringTab);
      card.replaceChildren(...rows.map((p) => lensRow(p)));
      for (const a of card.querySelectorAll('a[href*="/p/at:"]')) {
        const m = a.getAttribute('href').match(/\/p\/(at:.+)$/);
        if (m) a.setAttribute('href', `/p?uri=${encodeURIComponent(m[1])}&from=${board.feedSlug}`);
      }
      // An empty TAB is not an empty ring — say which, and that More widens
      // the window (same honesty rule as the board sort).
      if (!rows.length && board.posts.length) {
        card.replaceChildren(el('div', { class: 'xs muted', style: 'padding:10px', 'data-ring-tab-empty': ringTab },
          `No ${ringTab} among the loaded posts${board.cursor ? ' — More may reach some' : ''}.`));
      }
    };
    repaint = paint;
    paint();
    const more = board.cursor ? el('button', { class: 'btn sm' }, 'More') : null;
    if (more) more.addEventListener('click', () => { into.replaceChildren(ringBoard(ring, board.cursor)); });
    into.replaceChildren(tabs, chips, board.posts.length ? card : emptyState('A quiet ring', 'No posts from these members yet.'), more || '');
  };
  lens.ringFeed(ring, { cursor, onPage, tags: tagSubs().map((r) => r.tag) }).then((b) => render(b, holder))
    .catch((e) => holder.replaceChildren(emptyState('Ring fetch failed', e.message)));
  return holder;
}

// The left nav for the Bluesky population. Feeds arrive async, so the tree is
// drawn immediately with what is known and the feed rows are filled in when
// they land — the same shape lensSidebar used, moved to the side of the screen
// navigation actually belongs on.
export function lensNav(current) {
  const guestFeeds = CURATED.map((c) => ({ slug: c.slug, title: c.title }));
  const host = el('div', { 'data-navhost': '1' },
    navTree({ el, session, feeds: guestFeeds, tags: tagSubs().map((r) => r.tag), current }));
  if (session) {
    ensureSavedFeeds().then((feeds) => {
      if (!session) return;
      host.replaceChildren(navTree({ el, session, current, tags: tagSubs().map((r) => r.tag),
        feeds: feeds.map((f) => ({ slug: f.slug, title: f.title,
          href: feedPath({ creator: f.creator, rkey: f.slug }) || `/f/${f.slug}` })) }));
    }).catch(() => { /* the nav keeps the curated rows rather than emptying */ });
  }
  return host;
}

// Which nav row is current, from the path alone — so the marker cannot drift
// from the address bar.
export function currentBoardId(path) {
  const m = /^\/r\/([a-z+]+)/.exec(path);
  if (m) return m[1];
  const h = /^\/h\/([^/?]+)/.exec(path);
  if (h) return `tag-${decodeURIComponent(h[1])}`;
  const f = /^\/f\/([^/?]+)/.exec(path);
  if (f) return decodeURIComponent(f[1]);
  if (path === '/feeds') return 'feeds';
  if (path === '/trending') return DIRECTORY;
  if (path === '/hashtags') return 'hashtags';
  return DIRECTORY;
}

// /r/:rung — a rung is a destination now, not a mode flag.
export function lensRingView(params) {
  const rung = params.rung;
  if (!RUNG_IDS.includes(rung)) {
    return { main: emptyState('No such ring', `Known rings: ${RUNG_IDS.join(', ')}.`), side: null };
  }
  if (!session) {
    return { main: el('div', {}, el('h1', {}, labelFor(rung)),
      el('p', { class: 'muted small' },
        'Rings are computed from your own follow graph, so they need an account.')), side: null };
  }
  setLastBoard(rung);
  return { main: el('div', {}, el('h1', {}, labelFor(rung)), ringBoard(rung)), side: null };
}

// V5: where `/` lands, as a PATH, for the route handler to redirect to. It
// lives here because it needs the session, and it returns a path rather than
// performing the navigation because a view that redirects itself is a view
// that cannot be rendered — which is exactly what the first attempt did.
export function landingPath() {
  const landing = landingBoard({ signedIn: !!session, stored: lastBoard() });
  if (landing === DIRECTORY) return null;
  return RUNG_IDS.includes(landing) ? `/r/${landing}` : `/f/${landing}`;
}

export function lensHomeView() {
  const main = el('div', {},
    // The hero comes FIRST and outside the <h1>: it is the front door, and a
    // door behind the sign is not a door. Home only (owner) — a hero on every
    // board would be an ad rather than a welcome.
    !session && !heroDismissed() ? heroCard() : null,
    el('h1', {}, 'The Lens'),
    trendingRail(),
    el('div', { class: 'card' },
      el('p', { class: 'small' },
        'Your Bluesky, shaped as a forum: feeds are the boards, threads are threads, and a like here is a real like on Bluesky — the arrow promotes a post rather than reacting to it. Signed out, the lens is read-only.'),
      // It stated a limitation without naming one thing you would gain. The
      // controls a guest cannot use are ABSENT rather than dangled, so this is
      // where the answer to "what would an account get me" actually lives —
      // once, in prose, instead of six muted nags across every surface.
      ...(session ? [] : [el('p', { class: 'small', 'data-account-adds': '1' },
        'With an account you get your own ring — following, mutuals, and one step past them — plus joining and favouriting feeds, liking posts, and posting and replying. Forage has no accounts of its own; you bring one from Bluesky or any other atproto server.')]),
      el('div', { class: 'row wrap', style: 'gap:6px' },
        ...(session ? [] : [chip('guest search: needs sign-in (DL-014)', 'searchPosts is 403 unauthenticated — probe-verified')]),
        chip('saves: deferred (DL-015)', 'Bookmarks are not public API surface yet'))),
    el('div', { class: 'card' },
      el('h2', {}, 'Browse'),
      el('div', { class: 'stack' },
        ...CURATED.map((c) => el('div', {}, el('a', { href: `/f/${c.slug}` }, `f/${sourceLabel(c)}`), el('span', { class: 'xs muted' }, ` — ${c.kind}`))))));
  return { main, side: session ? null : el('div', { class: 'side' }, sessionCard()) };
}

// 3v: /f/ has two shapes. A creator-qualified path (/f/@handle/rkey) is the
// SHAREABLE one and resolves cold — handle → did → feed — so a stranger with
// the link gets the board. A bare slug still works for in-session navigation
// and for every link already shared, but it cannot resolve cold: an rkey has
// no did, and nothing resolves one without a repo.
export function lensFeedView(params) {
  const route = parseFeedRoute(params);
  if (route.kind === 'slug') {
    const entry = sources.get(route.slug);
    if (!entry) {
      return { main: emptyState('Unknown feed',
        'This link is missing the feed’s creator, so it only works while browsing. Open Discover and find it by name — the link from there can be shared.',
        el('a', { class: 'btn primary', href: '/feeds' }, 'Browse feeds')), side: null };
    }
    return feedBoardView(entry);
  }

  const host = el('div', {}, skeleton(6));
  const side = el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar());
  lens.resolveFeed({ handle: route.handle, rkey: route.rkey })
    .then((info) => {
      const entry = { slug: route.rkey, humanSlug: slugifyFeedName(info.title), title: info.title,
        kind: 'feed', creator: info.creator, source: { kind: 'feed', uri: info.uri } };
      registerSource(entry);
      host.replaceChildren(feedBoardView(entry, info).main);
    })
    .catch((e) => host.replaceChildren(emptyState('Could not open that feed',
      `@${route.handle} / ${route.rkey} — ${e.message}`, el('a', { class: 'btn', href: '/feeds' }, 'Browse feeds'))));
  return { main: host, side };
}

function feedBoardView(entry, preInfo) {
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
  // 4f: a /f/ board has no server window (DL-032), so "Top · this week" widens
  // by paging backwards on a budget and then says which of the three ways it
  // ended. The note is part of the answer, not decoration.
  const deepNote = el('div', { class: 'xs muted', style: 'padding:6px', 'data-deepen': '1' });
  let deepening = false;
  const deepen = () => {
    if (deepening || boardSort !== 'top' || boardTimeframe === 'all') { deepNote.replaceChildren(''); return; }
    const hours = { day: 24, week: 168, month: 720, year: 8760 }[boardTimeframe];
    deepening = true;
    deepNote.replaceChildren(`Widening to the last ${boardTimeframe}…`);
    lens.deepen(entry.source, { toHours: hours, nowMs: Date.now() })
      .then((out) => {
        allPosts.length = 0;
        allPosts.push(...out.posts);
        nextCursor = out.cursor || null;
        repaint();
        deepNote.replaceChildren(
          out.outcome === 'covered'
            ? `Ranked every post this feed served in the last ${boardTimeframe} (${out.pages} page${out.pages === 1 ? '' : 's'}).`
            : out.outcome === 'exhausted'
              ? `This feed only goes back ${out.reachedHours}h — that is everything it has, ranked.`
              : `This feed posts faster than we can page: ranked the last ${out.reachedHours}h of it, not the whole ${boardTimeframe}.`);
      })
      .catch((e) => deepNote.replaceChildren(`Could not widen the window: ${e.message}`))
      .finally(() => { deepening = false; });
  };
  // 4a: for a FEED source the card is also the moderation gate — an
  // adult-labelled generator must not paint its board when the account (or a
  // guest, who has no preferences to mirror) has adult content off. Both reads
  // fly in parallel and the paint waits on the pair, so the gate costs latency
  // = max(info, feed), never sum, and there is no flash of gated content.
  const isFeedSource = entry.source.kind === 'feed' && !!entry.source.uri;
  const infoReady = isFeedSource
    // 3v: a cold resolve already fetched this — do not ask twice
    ? Promise.all([preInfo ? Promise.resolve(preInfo) : lens.feedInfo(entry.source.uri), ensureSavedFeeds()])
        .then(([info]) => info)
        .catch(() => null)   // the board still works without its card
    : Promise.resolve(null);
  Promise.all([infoReady, lens.feed(entry.source, { title: entry.title })]).then(([info, f]) => {
    if (info?.hidden) {
      main.replaceChildren(emptyState('This feed is hidden by your moderation settings',
        'It carries an adult content label and your Bluesky account has adult content turned off. Forage mirrors that setting and adds no switch of its own — change it in your Bluesky settings if you want it back.'));
      return;
    }
    if (info) headerHost.replaceChildren(feedHeaderCard(info));
    allPosts.push(...f.posts);
    nextCursor = f.cursor || null;
    main.replaceChildren(
      el('div', { class: 'row spread wrap' },
        // 4h: `info` is the network's answer and is already resolved here —
        // reaching past it for the registry string is how a retired name shipped.
        el('h1', {}, info?.title || entry.title),
        el('div', { class: 'row', style: 'gap:6px' },
          chip('likes-only scores (DL-011)'),
          chip('ranking: feed order (DL-010)'))),
      headerHost,
      boardToolbar(() => { repaint(); deepen(); }),
      f.posts.length ? card : emptyState('Nothing here', 'This source returned no posts.'),
      deepNote,
      moreHost);
    repaint();
    // thread links: lens posts route through #/p?uri=
    for (const a of card.querySelectorAll('a[href*="/p/at:"], a[href^="/f/"]')) {
      const href = a.getAttribute('href');
      const m = href.match(/\/p\/(at:.+)$/);
      if (m) a.setAttribute('href', `/p?uri=${encodeURIComponent(m[1])}&from=${entry.slug}`);
    }
  }).catch((e) => main.replaceChildren(emptyState('Lens fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
}

// 3e/3q: a quote-response rendered as thread continuation. 3q gives it a left
// WALL — quoted material, the same grammar the feed blurb uses — so it reads
// as a top-level thread ON the post rather than blending into the replies
// below it (which carry the green collapse gutter instead). The ❝ marker keeps
// the distinction in words; the node still opens as its own thread, because
// the conversation genuinely branched into a new room.
function quoteNode(node, ctx) {
  const kids = el('div', { class: 'quote-children' });
  const box = el('div', { class: 'comment quote-node', 'data-kind': 'quote', 'data-depth': String(node.depth) },
    el('div', { class: 'quote-meta' },
      el('span', { title: 'A quote-response: this author quoted the post above' }, '❝ '),
      node.author ? el('a', { href: `/u/${encodeURIComponent(node.author)}` }, node.author) : '[muted]',
      el('span', { class: 'muted' },
        ` quoted ${node.depth ? 'that' : 'this'} · ${timeAgo(node.createdTs)} ago · ${plural(node.likes, 'like')}`)),
    el('div', { class: 'quote-body' }, node.maskedRemoved ? el('span', { class: 'muted' }, node.title || '[muted]') : node.body),
    el('div', { class: 'xs quote-open' },
      el('a', { href: `/p?uri=${encodeURIComponent(node.quoteUri)}` }, 'open its thread ↳')),
    kids);
  // 3r: a quote collects its own replies and its own quotes — the cascade
  // renders through the SAME dispatch, so a wall nests inside a wall and a
  // gutter nests inside a wall, each keeping its own grammar.
  for (const k of node.children || []) kids.append(lensNode(k, ctx));
  if (node.deferred > 0) {
    kids.append(el('a', { class: 'continue-stub', href: `/p?uri=${encodeURIComponent(node.quoteUri)}` },
      `→ ${node.deferred} more quote${node.deferred === 1 ? '' : 's'} of this, in its own thread`));
  }
  return box;
}

// 3r: one dispatch for every thread node. The substrate says which kind it is;
// the view only draws.
function lensNode(node, ctx) {
  return threadNodeStyle(node).walled ? quoteNode(node, ctx) : commentNode(node, ctx);
}

// 3e inbound: any post that IS a quote shows what it quotes, linked home.
function quotedContext(quoted) {
  return el('div', { class: 'card', style: 'margin-top:6px', 'data-quoted': '1' },
    el('div', { class: 'xs muted' }, '❝ quoting ',
      el('a', { href: `https://bsky.app/profile/${quoted.author}`, target: '_blank', rel: 'noopener noreferrer' }, quoted.author)),
    el('div', { class: 'small' }, quoted.excerpt),
    el('div', { class: 'xs' }, el('a', { href: `/p?uri=${encodeURIComponent(quoted.uri)}` }, 'open the original ↳')));
}

// 3m: the affordance strip — the one place /f/ and /h/ differ. Same chrome
// above and below; different promise here.
function affordanceStrip(stream, onPosted) {
  const a = affordanceFor(stream);
  const host = el('div', { class: 'card', 'data-affordance': a.targetable ? 'targetable' : 'curated' });
  // 3w: the promise is now KEPT. A hashtag board is targetable, so its button
  // opens a real composer; a feed still gets none, because we cannot promise
  // entry to a program whose criteria are unpublished (DL-025).
  const compose = a.composeLabel
    ? (() => {
        const b = el('button', { class: 'btn sm primary', 'data-compose': '1' }, a.composeLabel);
        b.addEventListener('click', () => {
          const gate = sessionGate('post');
          if (gate) return toast(gate, 'err');
          if (host.querySelector('[data-composer]')) return;
          host.append(composerCard({ tag: stream.key, onDone: onPosted }));
        });
        return b;
      })()
    : null;
  host.append(el('div', { class: 'row spread wrap', style: 'gap:8px;align-items:center' },
    el('div', { style: 'min-width:0' },
      el('div', { class: 'small' }, el('strong', {}, a.headline)),
      el('div', { class: 'xs muted', style: 'white-space:pre-wrap' }, a.detail)),
    compose));
  return host;
}

// Phase 2: the delete control. Deleting is irreversible and federated — the
// record leaves your repo but copies may already be elsewhere — so it takes
// two deliberate clicks. NOT a confirm() dialog: a modal dialog freezes the
// whole page, and this is a small enough act that arming the button in place
// reads better than interrupting everything.
function deleteControl(post, onDone) {
  if (!canDelete(post, session)) return null;
  let armed = false;
  const b = el('button', { class: 'btn sm', 'data-delete-post': '1',
    title: 'Delete this post from your Bluesky account' }, 'Delete');
  const disarm = () => {
    armed = false;
    b.removeAttribute('data-armed');
    b.classList.remove('danger');
    b.replaceChildren('Delete');
  };
  b.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      b.setAttribute('data-armed', '1');
      b.classList.add('danger');
      b.replaceChildren('Really delete?');
      setTimeout(() => { if (armed) disarm(); }, 6000); // an unanswered arm relaxes
      return;
    }
    b.disabled = true;
    try {
      await lens.deletePost(post.id);
      toast('Deleted — it is gone from your Bluesky account too.', 'ok');
      onDone?.();
    } catch (e) {
      toast('Delete failed: ' + e.message, 'err');
      b.disabled = false;
      disarm();
    }
  });
  return b;
}

// 3w: the composer. The pure module owns what a post IS — the two limits, the
// byte-indexed facets, the reply refs — so this only collects text and shows
// the writer what the composer would say before they send it. The counter goes
// NEGATIVE past the limit rather than clamping, because clamping hides that
// their words are being cut.
function composerCard({ tag, replyTo, onDone }) {
  const box = el('textarea', { rows: '3', 'data-composer-text': '1',
    placeholder: tag ? `Post to #${tag}…` : 'Write a reply…' });
  const remaining = el('span', { class: 'xs muted', 'data-remaining': '1' });
  const note = el('span', { class: 'xs muted' },
    tag ? `#${tag} is added for you if you don’t write it.` : '');
  const send = el('button', { class: 'btn sm primary' }, replyTo ? 'Reply' : 'Post');
  const cancel = el('button', { class: 'btn sm' }, 'Cancel');
  // Phase 3: images. Alt text is REQUIRED — probe-verified, the server refuses
  // a record whose image omits it — and a blank alt would pass the server while
  // leaving the post unreadable to anyone using a screen reader, so Post stays
  // disabled until every attached image is described. Files are held here and
  // uploaded on Post, not on select: an unreferenced blob is garbage-collected
  // within minutes, so uploading early risks it expiring mid-compose.
  const picked = [];
  const strip = el('div', { class: 'row wrap', style: 'gap:8px;margin-top:8px' });
  const filePicker = el('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
  const attach = el('button', { class: 'btn sm', 'data-attach-image': '1' }, 'Add image');
  attach.addEventListener('click', () => filePicker.click());

  const drawStrip = () => {
    strip.replaceChildren(...picked.map((p, i) => {
      // aria-label, not the placeholder alone: a placeholder is not a reliable
      // accessible name — it disappears the moment someone types, and screen
      // readers treat it inconsistently. Alt text is REQUIRED to post, so an
      // unnamed control here blocks publishing rather than just annoying.
      // Named per image because the strip repeats this input once per attachment.
      const alt = el('input', { type: 'text', 'data-image-alt': String(i),
        'aria-label': `Alt text for image ${i + 1} of ${picked.length} (required)`,
        placeholder: 'Describe this image (required)', value: p.alt });
      alt.addEventListener('input', () => { p.alt = alt.value; sync(); });
      const drop = el('button', { class: 'btn sm', title: 'Remove this image' }, '×');
      drop.addEventListener('click', () => { picked.splice(i, 1); drawStrip(); sync(); });
      return el('div', { class: 'card', style: 'padding:6px;min-width:180px;flex:1' },
        el('div', { class: 'row', style: 'gap:6px;align-items:center' },
          el('img', { src: p.url, alt: '', class: 'thumb' }), drop),
        alt);
    }));
  };
  filePicker.addEventListener('change', () => {
    for (const f of [...filePicker.files]) {
      if (picked.length >= IMAGE_LIMITS.count) {
        toast(`A post holds ${IMAGE_LIMITS.count} images.`, 'err');
        break;
      }
      if (f.size > IMAGE_LIMITS.bytes) {
        toast(`${f.name} is ${Math.round(f.size / 1000)}kB and the limit is ${IMAGE_LIMITS.bytes / 1000}kB.`, 'err');
        continue;
      }
      const entry = { file: f, alt: '', url: URL.createObjectURL(f), aspectRatio: null };
      // the dimensions come free from the preview we are about to draw, and
      // sending them stops a viewer's feed jumping as the image loads
      const probe = new Image();
      probe.onload = () => { entry.aspectRatio = { width: probe.naturalWidth, height: probe.naturalHeight }; };
      probe.src = entry.url;
      picked.push(entry);
    }
    filePicker.value = '';
    drawStrip();
    sync();
  });

  const card = el('div', { class: 'card', 'data-composer': '1', style: 'margin-top:8px' },
    box,
    strip,
    filePicker,
    el('div', { class: 'row spread wrap', style: 'gap:8px;align-items:center;margin-top:6px' },
      el('div', { class: 'row', style: 'gap:8px;align-items:center' }, remaining, note),
      el('div', { class: 'row', style: 'gap:6px' }, attach, cancel, send)));

  const sync = () => {
    // count what will actually be SENT, board tag included — otherwise the
    // number lies by exactly the length of the tag
    const willSend = tag ? withTag(box.value, tag) : box.value.trim();
    const left = POST_LIMITS.graphemes - graphemes(willSend);
    remaining.textContent = left >= 0 ? `${left} left` : `${-left} over`;
    remaining.classList.toggle('over', left < 0);
    const undescribed = picked.some((p) => !p.alt.trim());
    // an image is something to say, so text may be empty when one is attached
    const hasContent = willSend.trim() || picked.length;
    send.disabled = left < 0 || !hasContent || undescribed;
    send.title = undescribed ? 'Every image needs alt text before this can be posted' : '';
  };
  box.addEventListener('input', sync);
  sync();

  cancel.addEventListener('click', () => card.remove());
  send.addEventListener('click', async () => {
    send.disabled = true;
    try {
      // upload NOW, adjacent to the post — an unreferenced blob expires within
      // minutes, so uploading at file-select could leave a dead ref behind
      const images = [];
      for (const p of picked) {
        send.replaceChildren(`Uploading ${images.length + 1}/${picked.length}…`);
        images.push({ blob: await lens.uploadImage(p.file), alt: p.alt.trim(), aspectRatio: p.aspectRatio });
      }
      send.replaceChildren(replyTo ? 'Reply' : 'Post');
      await lens.publish({ text: box.value, tag, replyTo, images,
        langs: lang.active().slice(0, 1),
        navLang: typeof navigator !== 'undefined' ? navigator.language : null });
      for (const p of picked) URL.revokeObjectURL(p.url);
      toast('Posted — it is on your Bluesky account too.', 'ok');
      card.remove();
      onDone?.();
    } catch (e) {
      toast('Post failed: ' + e.message, 'err');
      send.disabled = false;
    }
  });
  return card;
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
    session = null; lens = createLens({}); savedFeedUris.clear(); pinnedFeedUris.clear(); savedFeedsPromise = null;
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

// 3j/3p: the feed's ONE box. It used to be two — this card and a separate
// affordance strip — which restated the <h1>'s title and then the description
// twice (observed 2026-08-26). Now: logo, who curates it, likes, Join/Leave on
// the same line, and the feed's own description QUOTED beneath, because that
// prose is the only inclusion rule that exists (DL-025). feedCardModel decides
// what belongs; this function only draws it.
function feedHeaderCard(info, onChange) {
  const m = feedCardModel(info);
  const savedNow = () => savedFeedUris.has(info.uri);
  const favNow = () => pinnedFeedUris.has(info.uri);

  // 3s: favorite = pin it to the top row, the same row bsky.app shows. It is
  // NOT joining: you can be joined without pinning, and favoriting something
  // you never joined joins you too (pinned-but-unsaved is not a real state).
  const star = el('button', { class: 'btn sm star', 'data-feed-favorite': '1',
    'aria-pressed': String(favNow()), title: 'Favorite — pin this feed to the top of your feeds' },
    favNow() ? '★' : '☆');
  star.addEventListener('click', async () => {
    if (!session) return toast('Sign in to favorite feeds — it pins to your Bluesky account.', 'err');
    const want = !favNow();
    star.disabled = true;
    try {
      await lens.favoriteFeed(info.uri, want);
      if (want) { pinnedFeedUris.add(info.uri); savedFeedUris.add(info.uri); } else pinnedFeedUris.delete(info.uri);
      toast(want ? 'Favorited — pinned to the top of your feeds.' : 'Unfavorited — still joined.', 'ok');
      onChange?.();
    } catch (e) { toast((want ? 'Favorite' : 'Unfavorite') + ' failed: ' + e.message, 'err'); }
    finally {
      star.disabled = false;
      star.setAttribute('aria-pressed', String(favNow()));
      star.replaceChildren(favNow() ? '★' : '☆');
      btn.replaceChildren(savedNow() ? 'Leave' : 'Join');
      btn.classList.toggle('primary', !savedNow());
    }
  });

  const btn = el('button', { class: 'btn sm' + (savedNow() ? '' : ' primary') }, savedNow() ? 'Leave' : 'Join');
  btn.addEventListener('click', async () => {
    if (!session) return toast('Sign in to join feeds — it saves to your Bluesky account.', 'err');
    const want = !savedNow();
    btn.disabled = true;
    try {
      await (want ? lens.joinFeed(info.uri) : lens.leaveFeed(info.uri));
      if (want) { savedFeedUris.add(info.uri); } else { savedFeedUris.delete(info.uri); pinnedFeedUris.delete(info.uri); }
      star.setAttribute('aria-pressed', String(pinnedFeedUris.has(info.uri)));
      star.replaceChildren(pinnedFeedUris.has(info.uri) ? '★' : '☆');
      toast(want ? 'Joined — it is in your feeds on Bluesky too.' : 'Left the feed.', 'ok');
      onChange?.();
    } catch (e) { toast((want ? 'Join' : 'Leave') + ' failed: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.replaceChildren(savedNow() ? 'Leave' : 'Join'); btn.classList.toggle('primary', !savedNow()); }
  });
  // 4g (ADR-004): adoption signals no Bluesky endpoint exposes — how many
  // people QUOTED this feed, how many starter packs include it. Two requests
  // to Constellation for the one feed you are looking at, never a fan-out over
  // a corpus. It renders only if it answers: an absent signal must never read
  // as "0 shares" (ADR-004 point 2), so this line simply does not appear.
  const adoption = el('div', { class: 'xs muted', 'data-adoption': 'pending' });
  lens.adoption(info.uri).then((a) => {
    if (!a) { adoption.remove(); return; }
    const part = (n, recent, one, many) =>
      n ? `${fmtScore(n)} ${n === 1 ? one : many}${recent ? ` (${recent} this week)` : ''}` : null;
    const bits = [part(a.quotes.total, a.quotes.d7, 'share', 'shares'),
                  part(a.packs.total, a.packs.d7, 'starter pack', 'starter packs')].filter(Boolean);
    if (!bits.length) { adoption.remove(); return; }
    adoption.setAttribute('data-adoption', 'shown');
    adoption.replaceChildren(bits.join(' · '));
  }).catch(() => adoption.remove());

  return el('div', { class: 'card', 'data-feed-header': '1', 'data-affordance': 'curated' },
    el('div', { class: 'row spread wrap', style: 'gap:10px;align-items:center' },
      el('div', { class: 'row', style: 'gap:10px;align-items:center;min-width:0' },
        m.avatar ? el('img', { src: m.avatar, alt: '', class: 'feed-avatar', loading: 'lazy' }) : null,
        el('div', { style: 'min-width:0' },
          el('div', { class: 'small' }, el('strong', {}, m.headline)),
          el('div', { class: 'xs muted' }, `${fmtScore(m.likeCount)} likes`),
          adoption)),
      // A guest manages nothing here — the header reads as a thing you are
      // looking at rather than one you own. Absent, not disabled (owner).
      el('div', { class: 'row', style: 'gap:6px;align-items:center' }, ...(session ? [star, btn] : []))),
    el('div', { class: 'feed-blurb' + (m.blurbIsOwnWords ? '' : ' muted'), 'data-feed-blurb': m.blurbIsOwnWords ? 'feed' : 'ours' },
      m.blurb),
    m.degraded ? el('div', { class: 'xs muted' }, 'This feed’s server is not responding right now.') : null);
}

// 3j: feed discovery — /feeds. Popular generators, searchable (unauth-200),
// each with its own Join.
// Browse hashtags. Two lists, because there are exactly two honest sources.
//
// Bluesky has NO hashtag discovery — probed 2026-08-28: getTrends carries post
// counts and a hot/cooling status, and every result is a feed generator, with
// an opaque rkey for a topic. So this cannot say "popular on Bluesky", and it
// does not pretend to. It offers what you have SEEN (counted locally as boards
// render) and what a SEARCH turns up (real posts, whose tags are real and in
// use). The copy says which is which, because a ranked list with no stated
// sample reads as authoritative.
// Page-lifetime, like the board sort above it — a chosen ordering is not worth
// a stored preference until someone asks for it to stick.
let seenSort = 'count';
let seenFilter = '';
let seenShowAll = false;
const SEEN_PAGE = 12;

export function lensHashtagsView() {
  const subCount = tagSubs().length;
  // Each list states its own sample IN ITS OWN TERMS: "3 posts in your boards"
  // counts posts you read, "on 2 of 30 results" counts a search's hits. Two
  // different denominators, so one shared phrasing would have flattened them
  // into a number that means neither.
  const rows = (tags, label) => {
    if (!tags.length) return el('div', { class: 'xs muted', style: 'padding:6px' }, 'Nothing yet.');
    const stack = el('div', { class: 'stack' });
    for (const row of tags) {
      const { tag, count } = row;
      stack.append(el('div', { class: 'row spread', style: 'align-items:center;gap:8px;padding:4px 0' },
        el('div', {},
          el('a', { href: `/h/${encodeURIComponent(tag)}`, 'data-browse-tag': tag }, `#${tag}`),
          el('span', { class: 'xs muted' }, ` — ${label(count, row)}`)),
        tagSubButton(tag)));
    }
    return stack;
  };

  // The default slice is small enough to scan; "Show all" exists because a
  // browse surface that only ever shows a top-N cannot answer "what else is in
  // there", which is the question someone browsing is actually asking.
  const seenList = el('div', { 'data-loaded-tags': '1' });
  const countLine = el('div', { class: 'xs muted', style: 'margin-top:6px' });
  const paintSeen = () => {
    const all = topTags(Infinity, { sort: seenSort });
    const q = seenFilter.trim().toLowerCase();
    const matching = q ? all.filter((t) => t.tag.includes(q)) : all;
    const shown = seenShowAll ? matching : matching.slice(0, SEEN_PAGE);
    seenList.replaceChildren(rows(shown,
      (n, r) => `${plural(n, 'post')} · ${plural(r.likes || 0, 'like')}`));
    const rest = matching.length - shown.length;
    countLine.replaceChildren(
      matching.length === all.length
        ? `${plural(all.length, 'hashtag')} loaded so far.`
        : `${matching.length} of ${plural(all.length, 'hashtag')} match "${seenFilter.trim()}".`);
    if (rest > 0) {
      const more = el('button', { class: 'btn sm', style: 'margin-left:8px', 'data-show-all': '1' }, `Show all ${matching.length}`);
      more.addEventListener('click', () => { seenShowAll = true; rerender(); });
      countLine.append(more);
    } else if (seenShowAll && matching.length > SEEN_PAGE) {
      const less = el('button', { class: 'btn sm', style: 'margin-left:8px', 'data-show-all': '0' }, 'Show fewer');
      less.addEventListener('click', () => { seenShowAll = false; rerender(); });
      countLine.append(less);
    }
  };

  const sortBar = el('div', { class: 'row wrap', style: 'gap:6px', 'data-tag-sort': '1' });
  for (const id of SORTS) {
    const b = el('button', { class: 'btn sm' + (seenSort === id ? ' primary' : ''),
      'data-sort': id, 'aria-pressed': String(seenSort === id) }, sortLabel(id));
    b.addEventListener('click', () => { seenSort = id; rerender(); });
    sortBar.append(b);
  }
  const filterInput = el('input', { type: 'text', class: 'form', value: seenFilter,
    placeholder: 'Filter…', 'data-tag-filter': '1', 'aria-label': 'Filter loaded hashtags' });
  filterInput.addEventListener('input', () => { seenFilter = filterInput.value; paintSeen(); });

  const seenCard = el('div', { class: 'card' },
    el('h2', {}, 'Hashtags loaded'),
    el('div', { class: 'xs muted', style: 'margin-bottom:8px' },
      'Every post on a board you opened, including below the fold, and only what your language settings let through. Not scrolling — loading. This is YOUR reading, not the network: Bluesky publishes no list of popular hashtags.'),
    el('div', { class: 'row wrap', style: 'gap:8px;align-items:center;margin-bottom:8px' }, sortBar, filterInput),
    seenList, countLine);
  paintSeen();

  // ---- trending: derived, cached, and honest about its sample ----
  const trendList = el('div', {}, skeleton(3));
  const trendNote = el('div', { class: 'xs muted', style: 'margin-top:6px' });
  const INTERVALS = [[15 * 60 * 1000, 'every 15 minutes'], [DEFAULT_TTL_MS, 'hourly'],
    [6 * 60 * 60 * 1000, 'every 6 hours'], [24 * 60 * 60 * 1000, 'daily']];
  const ttlSel = el('select', { class: 'form', 'data-trend-ttl': '1', 'aria-label': 'How often to refresh trending' },
    ...INTERVALS.map(([ms, label]) => el('option', { value: String(ms), selected: trendingTtl() === ms || false }, label)));
  ttlSel.addEventListener('change', () => { setTrendingTtl(Number(ttlSel.value)); rerender(); });

  trendingTags(lens).then((t) => {
    trendList.replaceChildren(t.tags.length
      ? rows(t.tags.slice(0, SEEN_PAGE), (n) => `${plural(n, 'post')} in the sample`)
      : el('div', { class: 'xs muted', style: 'padding:6px' },
          'Nothing to read right now — trending was unavailable.'));
    // Say what was actually looked at. "Trending hashtags" would claim a
    // ranking Bluesky does not publish; this says which posts were counted.
    trendNote.replaceChildren(t.sampled.feeds
      ? `Tags on ${plural(t.sampled.posts, 'post')} across ${plural(t.sampled.feeds, 'trending feed')}${t.stale ? ' — last read a while ago; the network is not answering now' : ''}.`
      : 'No sample yet.');
  }).catch((e) => {
    trendList.replaceChildren(emptyState('Trending unavailable', e.message));
  });

  const trendCard = el('div', { class: 'card', 'data-trending-tags': '1' },
    el('h2', {}, 'Trending now'),
    el('div', { class: 'xs muted', style: 'margin-bottom:8px' },
      'Bluesky publishes no hashtag ranking, so this reads the tags on posts inside the feeds that are trending. It is a barometer of the network, not a chart of it.'),
    el('div', { class: 'row wrap', style: 'gap:8px;align-items:center;margin-bottom:8px' },
      el('span', { class: 'xs muted' }, 'Refresh'), ttlSel),
    trendList, trendNote);

  const input = el('input', { type: 'text', class: 'form', placeholder: 'Find a hashtag…', 'data-tag-search': '1', 'aria-label': 'Search hashtags' });
  const out = el('div', {});
  const go = () => {
    const q = input.value.trim();
    if (!q) return;
    if (!session) { out.replaceChildren(el('div', { class: 'xs muted' }, 'Search needs a session — Bluesky returns 403 to guests (DL-014).')); return; }
    out.replaceChildren(skeleton(3));
    lens.search(q).then((board) => {
      // Harvest the tags off real posts. This is what reaches BEYOND what you
      // have read: a tag nobody in your boards uses still shows up here if
      // anyone on the network is using it.
      const counts = new Map();
      for (const p of board.posts || []) {
        const tags = new Set((p.facets || []).flatMap((f) => (f.features || [])
          .filter((ft) => (ft.$type || '').endsWith('#tag')).map((ft) => normalizeTag(ft.tag)).filter(Boolean)));
        for (const t of tags) counts.set(t, (counts.get(t) || 0) + 1);
      }
      const found = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
      const total = (board.posts || []).length;
      out.replaceChildren(found.length
        ? rows(found, (n) => `on ${n} of ${plural(total, 'result')}`)
        : emptyState('No tags in those results', 'The search matched posts, but none of them carried a hashtag.'));
    }).catch((e) => out.replaceChildren(emptyState('Search failed', e.message)));
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  const btn = el('button', { class: 'btn sm primary' }, 'Search');
  btn.addEventListener('click', go);
  // LOGGED OUT the control is absent, not disabled and not waiting to refuse.
  // searchPosts answers 403 to everyone without a session (DL-014, re-probed
  // 2026-08-29 — plain and with tag=), so an input here would take a query and
  // only then admit it could never help. That is the shape the owner rejected
  // for the ring dial: "putting a bunch of pop up landmines, even if it's our
  // own pop up, is a bad plan." Same treatment as ringDial got in 49cf873 —
  // the capability is still NAMED, so a reader learns it exists, and what
  // unlocks it is said once in words.
  //
  // The other two sections stay: trending and loaded are both public, verified
  // against the live API on 2026-08-29. Hiding them alongside this one would
  // be punishing a reader for a limit that is not theirs.
  const searchCard = session
    ? el('div', { class: 'card' },
        el('h2', {}, 'Find a hashtag'),
        el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
          'Searches real posts and reports the tags they carry — so this reaches past what you happen to have read.'),
        el('div', { class: 'row', style: 'gap:6px' }, input, btn), out)
    : el('div', { class: 'card', 'data-search-gated': '1' },
        el('h2', {}, 'Find a hashtag'),
        el('div', { class: 'small' },
          'With an account you can search the network for hashtags — which is how you find corners nobody you follow has posted in yet.'),
        el('div', { class: 'xs muted', style: 'margin-top:4px' },
          'Bluesky answers search only for signed-in readers, so there is nothing to show here until then. Trending and your loaded tags below work either way.'));

  // Owner's ordering (2026-08-28): search, then trending, then what you have
  // loaded. P2 makes them three equal slices with their own full pages.
  const cards = { search: searchCard, trending: trendCard, loaded: seenCard };
  const on = enabledSections();
  const main = el('div', {}, el('h1', {}, 'Hashtags'));
  // Hiding all three is allowed — the SETTING does not refuse the last
  // unchecking, because a control that silently declines to do what it says is
  // worse than an empty page. The page explains itself and offers the way back.
  if (!on.length) {
    main.append(emptyState('Every section is switched off',
      'Turn one back on under Advanced on your account page.'),
      el('a', { class: 'btn sm', href: '/me' }, 'Open settings'));
  } else for (const id of on) main.append(cards[id]);
  return { main, side: null };
}

export function lensFeedsView() {
  const results = el('div', { class: 'stack' }, skeleton(4));
  const controls = el('div', { class: 'row wrap', style: 'gap:6px;margin-top:8px', 'data-feed-controls': '1' });
  const countLine = el('div', { class: 'xs muted', style: 'margin:6px 0' });
  const input = el('input', { type: 'text', placeholder: 'Search feeds…', 'data-feed-search': '1' });

  // 4b: the loaded corpus and the view over it. Browse holds all 117 feeds, so
  // these sorts describe the whole list; a query is a slice of an unbounded
  // index, so sorting is disabled there and the server's relevance order shows.
  let corpus = [];
  let searching = false;
  let sort = 'popular';
  let platform = '';
  let videoOnly = false;
  // 4c: uri → { d7, d30, capped }. Measured lazily, ONCE per page load, the
  // first time a Rising sort is chosen — 117 requests is not something to spend
  // on arrival for a sort nobody may pick.
  let windows = new Map();
  let measuring = false;
  // 4d: uri → live | stale | empty | silent. Defaulted ON for search, where a
  // third of results are dead or stale (D6), and OFF for browse, where 0 of 117
  // popular feeds were (the filter would be dead weight there).
  let states = new Map();
  let hideDead = false;
  let probing = false;

  const card = (f) => {
    // 3v (from main): the shareable form carries the creator, and the source
    // registry keeps it so every link the app draws can use that form.
    registerSource({ slug: f.uri.split('/').pop(), humanSlug: slugifyFeedName(f.title), title: f.title,
      kind: 'feed', creator: f.creator, source: { kind: 'feed', uri: f.uri } });
    return el('div', { class: 'card', 'data-discover-feed': f.uri },
      el('div', { class: 'row spread wrap', style: 'gap:8px;align-items:center' },
        el('div', { class: 'row', style: 'gap:8px;align-items:center;min-width:0' },
          f.avatar ? el('img', { src: f.avatar, alt: '', class: 'feed-avatar', loading: 'lazy' }) : null,
          el('div', { style: 'min-width:0' },
            el('a', { href: feedPath({ creator: f.creator, uri: f.uri }) || `/f/${f.uri.split('/').pop()}` }, f.title),
            el('div', { class: 'xs muted' },
              `by @${f.creator} · ${fmtScore(f.likeCount)} likes`,
              risingNote(f),
              f.platform ? ` · built on ${f.platform}` : '',
              f.video ? ' · video' : '')))),
      f.description ? el('div', { class: 'xs muted', style: 'margin-top:4px' }, f.description) : null);
  };

  const risingNote = (f) => {
    const w = windows.get(f.uri);
    if (!sort.startsWith('rising')) return '';
    if (!w) return measuring ? ' · measuring…' : ' · not measured';
    const n = sort === 'rising7' ? w.d7 : w.d30;
    const span = sort === 'rising7' ? '7d' : '30d';
    // a full page is a floor, not a number (D2)
    return ` · ${w.capped && n >= 100 ? '100+' : n} likes in ${span}`;
  };

  const paint = () => {
    const ranked = searching ? corpus : sortFeeds(filterFeeds(corpus, { platform, video: videoOnly }), sort, windows);
    const live = hideDead ? liveFeeds(ranked, states) : null;
    const shown = live ? live.kept : ranked;
    results.replaceChildren(...(shown.length
      ? shown.map(card)
      : [emptyState('No feeds found', searching
          ? 'Nothing matched that search.'
          : 'No feed in the list matches those filters. Widen them and it comes back.')]));
    const base = searching
      ? `${shown.length} result${shown.length === 1 ? '' : 's'} — in the order Bluesky's search ranked them.`
      : shown.length === corpus.length
        ? `All ${corpus.length} feeds Bluesky lists as popular.`
        : `${shown.length} of ${corpus.length} feeds.`;
    // 4c: say what Rising is counting, and that joins are not countable at all
    // 4d: never filter silently — say how many went where, and keep `silent`
    // separate from `stale`, because one is an observation and the other is the
    // absence of one (D9).
    const dropped = live && (live.stale + live.silent + live.empty)
      ? ` Hiding ${[live.stale && `${live.stale} stale`, live.empty && `${live.empty} empty`,
          live.silent && `${live.silent} that did not answer`].filter(Boolean).join(', ')}.` +
        (live.silent && !session ? ' Some of those may be personalized feeds that need you signed in.' : '')
      : (hideDead && probing ? ' Checking which are still alive…' : '');
    const note = sort.startsWith('rising')
      ? ` Ranked by likes gained in the last ${sort === 'rising7' ? '7 days' : '30 days'}` +
        `${measuring ? ` — measured ${windows.size} of ${corpus.length} so far…` : ''}. ` +
        'Joining a feed is private, so likes are the only public signal there is.'
      : '';
    countLine.replaceChildren(base + dropped + note);
  };

  // 4b: sorting a search slice would claim to rank everything that matched, so
  // the controls disable rather than lie. Browse gets the whole corpus.
  const buildControls = () => {
    const sortSel = el('select', { 'data-feed-sort': '1', disabled: searching || undefined,
      title: searching ? 'Search results keep Bluesky\'s relevance order' : 'Orders the whole popular list' },
      ...[['popular', 'Popular'], ['likes', 'Most liked'], ['rising7', 'Rising · 7 days'],
          ['rising30', 'Rising · 30 days'], ['new', 'Newest'], ['old', 'Oldest']]
        .map(([v, l]) => el('option', { value: v, selected: sort === v || false }, l)));
    sortSel.addEventListener('change', () => { sort = sortSel.value; ensureWindows(); paint(); });

    const hosts = platforms(corpus);
    const platSel = el('select', { 'data-feed-platform': '1', disabled: searching || undefined,
      title: 'Feeds are built on services — this narrows to one builder' },
      el('option', { value: '', selected: platform === '' || false }, 'Any builder'),
      ...hosts.map(({ host, count }) =>
        el('option', { value: host, selected: platform === host || false }, `${host} (${count})`)));
    platSel.addEventListener('change', () => { platform = platSel.value; paint(); });

    const vid = el('label', { class: 'xs', style: 'display:flex;gap:4px;align-items:center' },
      el('input', { type: 'checkbox', 'data-feed-video': '1', checked: videoOnly || undefined,
        disabled: searching || undefined }), 'Video only');
    vid.querySelector('input').addEventListener('change', (e) => { videoOnly = e.target.checked; paint(); });

    // 4d: on search this is checked by default — a third of search results are
    // dead or stale — and it is a real control, not a hidden behaviour.
    const alive = el('label', { class: 'xs', style: 'display:flex;gap:4px;align-items:center' },
      el('input', { type: 'checkbox', 'data-feed-alive': '1', checked: hideDead || undefined }),
      'Hide inactive');
    alive.querySelector('input').addEventListener('change', (e) => {
      hideDead = e.target.checked;
      ensureLiveness();
      paint();
    });

    controls.replaceChildren(sortSel, platSel, vid, alive);
  };

  // 4c: 24h is NOT offered. Measured over the whole corpus, only 9 of 117 feeds
  // got 2 or more likes in a day — the window is mostly ties at zero and would
  // present noise as a ranking. 7d and 30d separate them.
  const ensureWindows = () => {
    if (!sort.startsWith('rising') || measuring || windows.size) return;
    measuring = true;
    paint();
    lens.likeWindows(corpus.map((f) => f.uri), {
      nowMs: Date.now(),
      // progressive: each measurement lands in the map the view is already
      // rendering from, so the list reorders as the counts arrive (3l's idiom)
      onWindow: (uri, w) => { windows.set(uri, w); paint(); },
    }).finally(() => { measuring = false; paint(); });
  };

  const ensureLiveness = () => {
    if (!hideDead || probing || states.size) return;
    probing = true;
    paint();
    lens.liveness(corpus.map((f) => f.uri), {
      nowMs: Date.now(),
      onState: (uri, st) => { states.set(uri, st); paint(); },
    }).finally(() => { probing = false; paint(); });
  };

  const run = (query) => {
    searching = !!query;
    results.replaceChildren(skeleton(3));
    countLine.replaceChildren('');
    lens.discoverFeeds({ query })
      .then((feeds) => {
        corpus = feeds;
        windows = new Map();   // a new corpus invalidates the measurements
        states = new Map();
        hideDead = searching;  // on for search, off for the curated popular list
        if (!searching) { platform = ''; videoOnly = false; }
        if (searching && sort.startsWith('rising')) sort = 'popular';
        buildControls();
        ensureWindows();
        ensureLiveness();
        paint();
      })
      .catch((e) => {
        controls.replaceChildren();
        results.replaceChildren(emptyState('Discovery failed', e.message));
      });
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(input.value.trim() || undefined); });
  const go = el('button', { class: 'btn sm primary' }, 'Search');
  go.addEventListener('click', () => run(input.value.trim() || undefined));
  run();
  return {
    main: el('div', {},
      el('h1', {}, 'Browse feeds'),
      el('p', { class: 'small muted' },
        'Feeds are built by the community — each one decides its own content. How to get INTO a feed lives in its description; feeds publish no machine-readable rules.'),
      el('div', { class: 'card' },
        el('div', { class: 'row', style: 'gap:6px' }, input, go),
        controls),
      countLine,
      results),
    side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()),
  };
}

// 3g: the hashtag board — /h/ in the Bluesky view. Session-gated (search is
// 403 unauthenticated, probe-verified) — guests get words + the way in.
// Subscribe / unsubscribe for a hashtag board. Deliberately the same VERB a
// feed uses (Join / Leave) rather than a new one: a subscribed hashtag is
// presented and woven in exactly like a feed, so calling it something else
// would invent a distinction the app does not have.
function tagSubButton(tag) {
  const draw = () => {
    const on = isSubscribed(tag);
    const b = el('button', { class: 'btn sm' + (on ? '' : ' primary'), 'data-tagsub': tag,
      'aria-pressed': String(on),
      title: on ? `Leave #${tag} — it stops appearing in your boards` : `Join #${tag} — it joins your boards and World` },
      on ? 'Leave' : 'Join');
    b.addEventListener('click', () => {
      if (isSubscribed(tag)) unsubscribeTag(tag); else subscribeTag(tag);
      rerender();
    });
    return b;
  };
  return draw();
}

export function lensHashtagView(params) {
  const tag = decodeURIComponent(params.tag);
  if (!session) {
    return { main: emptyState(`#${tag} needs a session`,
      'Hashtag boards ride search, which Bluesky gates behind sign-in (DL-021). Sign in and this becomes a live board.'),
      side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
  }
  const heading = () => el('div', { class: 'row spread', style: 'align-items:center;gap:8px' },
    el('h1', { style: 'margin:0' }, `#${tag}`), tagSubButton(tag));
  const main = el('div', {}, heading(), skeleton(6));
  const card = el('div', { class: 'card', 'data-board': 'hashtag' });
  const note = el('div', { class: 'xs muted', style: 'padding:6px', 'data-whole-corpus': '1' });
  // 4e: the toolbar RE-QUERIES here rather than re-sorting what loaded.
  // searchPosts takes sort and since server-side, so a hashtag board's "Top ·
  // this week" ranks every post that matched — the one place DL-010's
  // limitation genuinely lifts. The loaded-window caveat must not follow it.
  const load = (first) => {
    if (!first) card.replaceChildren(skeleton(3));
    lens.stream({ kind: 'hashtag', key: tag, sort: boardSort, timeframe: boardTimeframe, nowMs: Date.now() })
      .then((board) => {
        if (first) {
          main.replaceChildren(heading(),
            affordanceStrip({ kind: 'hashtag', key: tag }),
            boardToolbar(() => load(false)),
            board.posts.length ? card : emptyState('A quiet tag', `No recent posts carry #${tag}.`),
            note);
        }
        renderBoard(card, board.posts, { wholeCorpus: board.wholeCorpus });
        note.replaceChildren(boardSort === 'top'
          ? `Bluesky ranked every #${tag} post${boardTimeframe === 'all' ? '' : ` from the last ${boardTimeframe}`} — not only the ones loaded here. Its “top” weighs engagement, not likes alone.`
          : '');
      })
      .catch((e) => {
        if (first) main.replaceChildren(el('h1', {}, `#${tag}`), emptyState('Hashtag fetch failed', e.message));
        else card.replaceChildren(emptyState('Hashtag fetch failed', e.message));
      });
  };
  load(true);
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
      return el('div', {}, el('a', { href: `/f/${slug}` }, t.displayName),
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
// 3u: content languages. Bluesky publishes a post's declared language
// (app.bsky.feed.post.langs) but has NO account-level language preference —
// verified against app.bsky.actor.defs, where no such def exists. The official
// app's setting is app-local. So this one is ours, it lives on this device
// only, and the panel says so rather than implying it syncs. (DL-026)
const LANG_CHOICES = [
  ['en', 'English'], ['ja', '日本語'], ['pt', 'Português'], ['es', 'Español'],
  ['de', 'Deutsch'], ['fr', 'Français'], ['ko', '한국어'], ['uk', 'Українська'],
];

function languagePanel(onChange) {
  const current = new Set(lang.active());
  const boxes = LANG_CHOICES.map(([code, label]) => {
    const box = el('input', { type: 'checkbox', value: code });
    box.checked = current.has(code);
    box.addEventListener('change', () => {
      if (box.checked) current.add(code); else current.delete(code);
      lang.set([...current]);
      onChange?.();
    });
    return el('label', { class: 'row', style: 'gap:6px;align-items:center' }, box, el('span', { class: 'small' }, label));
  });
  const clearBtn = el('button', { class: 'btn sm' }, 'Show every language');
  clearBtn.addEventListener('click', () => {
    current.clear();
    lang.clear();
    for (const l of boxes) l.querySelector('input').checked = false;
    onChange?.();
  });
  return el('div', { class: 'card', 'data-lang-panel': '1' },
    el('h2', { style: 'margin:0 0 4px' }, 'Content languages'),
    el('p', { class: 'xs muted', style: 'margin:0 0 8px' },
      'Bluesky posts declare their own language, but the account has no language setting for Forage to follow — '
      + 'the official app keeps that choice inside the app. So this one is Forage only, stored on this device, '
      + 'and it never changes anything on your Bluesky account.'),
    el('div', { class: 'row wrap', style: 'gap:10px' }, ...boxes),
    el('p', { class: 'xs muted', style: 'margin:8px 0 4px' },
      'With nothing selected, every language shows. A post that declares no language is never hidden.'),
    clearBtn);
}

export function lensProfileView() {
  // E144: this page absorbed Preferences. It already carried the account
  // switcher, content languages and the moderation mirror — three "what do I
  // see" controls — so appearance joining them is the merge the owner asked
  // for rather than a new idea. It is embedded by CALLING settingsView rather
  // than by copying its markup: two copies of a skin picker is exactly how the
  // density dial drifted before (js/board-density.js says so in its header).
  // ADVANCED, collapsed by default (owner, 2026-08-28). `<details>` is used
  // rather than a hand-built toggle because it is keyboard- and
  // screen-reader-correct for free, and this is a disclosure and nothing more.
  const advanced = () => {
    const box = el('div', { class: 'stack' });
    for (const [id, label] of HASHTAG_SECTIONS) {
      const cb = el('input', { type: 'checkbox', id: `sec-${id}`, 'data-section': id,
        checked: sectionEnabled(id) || false });
      cb.addEventListener('change', () => { setSectionEnabled(id, cb.checked); });
      // NOT class="row": `.row` sets display:flex, which OVERRIDES the UA rule
      // that hides a closed <details>'s children — so the checkboxes rendered
      // (and were tappable) while the disclosure looked shut. Caught by the
      // touch-floor gate finding three inputs on a page that should have had
      // none visible.
      box.append(el('label', { class: 'seccheck', for: `sec-${id}` },
        cb, el('span', {}, label)));
    }
    return el('details', { class: 'card', 'data-advanced': '1' },
      el('summary', { style: 'cursor:pointer;min-height:44px;display:flex;align-items:center' }, 'Advanced'),
      el('div', { style: 'margin-top:8px' },
        el('h3', { style: 'font-size:var(--t-md);margin:0 0 4px' }, 'Browse Hashtags'),
        el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
          'Which sections appear on the Hashtags page. Unchecking all of them leaves it empty, which is allowed.'),
        box));
  };
  const prefs = () => el('div', { 'data-prefs': '1' }, settingsView().main, advanced());
  if (!session) {
    return { main: el('div', {}, el('h1', {}, 'Your account'),
      el('p', { class: 'muted small' }, 'Sign in and this page carries your session and your moderation mirror.'),
      sessionCard(), prefs()), side: null };
  }
  // capture the handle NOW: an in-flight profile fetch must not read a
  // session that sign-out has since cleared (the journey caught this).
  const handle = session.handle;
  const main = el('div', {}, skeleton(3), accountMenu(), languagePanel(), moderationPanel(), prefs());
  lens.profile(handle)
    .then((p) => { if (session) main.replaceChildren(profileHeader(p), accountMenu(), languagePanel(), moderationPanel(), prefs()); })
    .catch(() => { if (session) main.replaceChildren(el('h1', {}, `@${handle}`), accountMenu(), languagePanel(), moderationPanel(), prefs()); });
  return { main, side: null };
}

export function lensThreadView(params, query) {
  const uri = query.uri ? decodeURIComponent(query.uri) : null;
  if (!uri) return { main: emptyState('No thread', 'Missing post uri.'), side: null };
  const from = sources.get(query.from);
  const src = from ? { feedId: `lens:${from.slug}`, feedSlug: from.slug, feedTitle: from.title }
                   : { feedId: 'lens:thread', feedSlug: 'thread', feedTitle: 'Thread' };
  const main = el('div', {}, skeleton(8));
  // 3r: the cascade repaints in place — a quote of a quote is worth showing,
  // never worth making the thread wait.
  let onCascade = () => {};
  lens.thread(uri, src, { onCascade: (t) => onCascade(t) }).then((t) => {
    const p = t.post;
    // 3w: the thread is no longer read-only — replies are a real write now.
    // A reply's PARENT is the node you answered; its ROOT is the top of the
    // thread, which for a lens thread is always the post being read. Defined
    // before the head, which uses them.
    const rootRef = { uri: p.id, cid: p.cid };
    const replyHost = el('div', {});
    const openReply = (parentRef) => {
      const gate = sessionGate('reply');
      if (gate) return toast(gate, 'err');
      if (replyHost.querySelector('[data-composer]')) return;
      replyHost.replaceChildren(composerCard({
        replyTo: { root: rootRef, parent: parentRef },
        onDone: () => rerender(),
      }));
    };
    const head = el('div', { class: 'card', style: 'display:flex;gap:10px' },
      voteBox('post', p.id, p, !!session, 'col', lensVote(p)),
      el('div', {},
      el('div', { class: 'row wrap', style: 'gap:6px' },
        el('a', { href: `/f/${src.feedSlug}`, class: 'xs' }, `f/${src.feedSlug}`),
        p.nsfw ? el('span', { class: 'chip badge-nsfw' }, 'NSFW') : null),
      // The placeholder heading ('[image]', '[video]') drops when the media
      // renders below — the picture is the thing the heading stood in for.
      // A real title (text or alt-derived) keeps its heading above the media.
      p.placeholderTitle && p.media ? null : el('h1', {}, p.title.slice(0, 300)),
      el('div', { class: 'postmeta' },
        p.author ? el('a', { href: `/u/${encodeURIComponent(p.author)}` }, p.author) : '[muted]',
        ` · ${plural(p.likes, 'like')} · ${timeAgo(p.createdTs)} ago · ${plural(p.commentCount, 'reply', 'replies')}`),
      // The post's own media, at full board size — until 2026-08-28 an image
      // post's thread page rendered no image at all.
      p.media && !p.maskedRemoved ? mediaNode(p) : null,
      // 3i: the poster's own 1/3-2/3-3/3 chain reads as the post body
      ...(t.selfThread || []).map((part) => el('div', { class: 'small', style: 'margin-top:8px' },
        ...facetSegments(part.text, part.facets).map((seg) => {
          if (!seg.facet) return seg.text;
          if (seg.facet.type === 'link') return el('a', { href: seg.facet.value, target: '_blank', rel: 'noopener noreferrer' }, seg.text);
          if (seg.facet.type === 'mention') return el('a', { href: `https://bsky.app/profile/${seg.facet.value}`, target: '_blank', rel: 'noopener noreferrer' }, seg.text);
          if (seg.facet.type === 'tag') return el('a', { href: `/h/${encodeURIComponent(seg.facet.value)}`, 'data-tag': seg.facet.value }, seg.text);
          return seg.text;
        }))),
      p.quoted ? quotedContext(p.quoted) : null,
      t.quotesFailed ? el('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
        chip(`${t.quoteCount} quote${t.quoteCount === 1 ? '' : 's'} — couldn't fetch`, 'getQuotes failed; replies still render. Reload to retry.')) : null,
      el('div', { class: 'row', style: 'gap:6px;margin-top:8px;align-items:center' },
        (() => {
          const b = el('button', { class: 'btn sm primary', 'data-reply-open': '1' }, 'Reply');
          b.addEventListener('click', () => openReply(rootRef)); // replying to the post: parent IS root
          return b;
        })(),
        // phase 2: only ever rendered for a post that is genuinely yours
        deleteControl(p, () => {
          main.replaceChildren(emptyState('This post was deleted',
            'It is gone from your Bluesky account. Anyone who already saw it may still have a copy — deleting removes the record, it does not un-send it.',
            el('a', { class: 'btn', href: `/f/${src.feedSlug}` }, 'Back to the board')));
        })),
      replyHost));
    const ctx = { ...LENS_PERMS, locked: true, // vote/save/mod still gate; replying does not
      authorHref: (n) => `/u/${encodeURIComponent(n.author)}`, // 3k: authors reach OUR profile page (which links out)
      nodeRenderer: (n, c) => lensNode(n, c), // 3r: a quote nested under a reply is still a quote
      // phase 2: a reply you regret is the commoner case than a post you
      // regret, so your own replies carry the same control. Same guard, same
      // two-click arming; the node simply removes itself when it is gone.
      extraActions: (n) => deleteControl(n, () => {
        const host = commentsCard.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`);
        if (host) host.replaceChildren(el('div', { class: 'xs muted', style: 'padding:6px 0' }, 'You deleted this reply.'));
        else rerender();
      }) };
    const commentsCard = el('div', { class: 'card' });
    const paintComments = (comments) => {
      commentsCard.replaceChildren(...comments.map((n) => lensNode(n, ctx)));
    };
    paintComments(t.comments);
    onCascade = (next) => paintComments(next.comments); // the cascade landed — redraw the list in place
    main.replaceChildren(head, t.comments.length ? commentsCard : emptyState('No replies', 'Nothing below this post yet.'));
  }).catch((e) => main.replaceChildren(emptyState('Lens fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, session ? null : sessionCard(), lensSidebar()) };
}
