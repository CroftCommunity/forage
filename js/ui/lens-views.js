// The wide lens UI (6d): #/lens routes render the owner's Bluesky as a forum
// through the SAME components the memory tier uses — postRow and commentNode
// consume the lens shapes unchanged. Read-first: every write surface is a
// frontier chip backed by a ledger entry (DL-013..015), never a dead button.
// Identity is the OAuth session (2c): js/auth/session.js wraps the vendored
// official client; the library owns persistence (IndexedDB) and refresh, so
// sign-in survives reloads. The lens consumes { did, handle, fetchHandler }.

import { el, timeAgo, fmtScore, domainOf, plural } from '../util.js';
import { postRow, commentNode, vote, focusComment, skeleton, emptyState, toast, reportSheet, whoNode, byline, providerMark as providerMarkNode } from './components.js';
import * as providerMark from '../provider-mark.js';
import * as drafts from '../drafts.js';
import { go, navKind, rerenderNow } from '../router.js';
import { appFor } from '../auth/hosts.js';
import { navTree } from './nav.js';
import { LADDER, RUNG_IDS, labelFor } from '../rings.js';
import { lastBoard, setLastBoard, landingBoard, DIRECTORY } from '../last-board.js';
import { createLens, LENS_PERMS, RING_CAP, facetSegments, trimCardLink, slugifyFeedName, sortWindow, affordanceFor,
  feedCardModel, threadNodeStyle, feedPath, parseFeedRoute, sessionGateMessage, canDelete, sourceLabel,
  sortFeeds, filterFeeds, platforms, liveFeeds } from '../substrates/lens.js';
import { initSession, createAccountRoster, isOAuthCallback } from '../auth/session.js';
import { hostById, featuredHosts, otherHosts, canCreateAccount } from '../auth/hosts.js';
import { heroDismissed, dismissHero, EMBLEM } from '../hero.js';
import { stage, carousel, grid, gifStage } from './stage.js';
import * as gifAutoplay from '../gif-autoplay.js';
import * as altText from '../alt-text.js';
import * as pictures from '../pictures.js';
import * as lang from '../lang.js';
import { density, densityDial } from '../board-density.js';
import { sortBar, TIMEFRAMES, WALK_TIMEFRAMES, nearestTimeframe } from './sortbar.js';
import { refreshControl } from './refresh-control.js';
import * as boardCache from '../board-cache.js';
import { sortItems } from '../engines/rank.js';
import { POST_LIMITS, IMAGE_LIMITS, graphemes, withTag } from '../compose.js';
import { cardSizeDial } from '../card-size.js';
import { settingsView } from './views.js';
import { tagSubs, subscribeTag, normalizeTag } from '../tagsubs.js';
// P5: the published half. Where a subscription is STORED is that module's
// business — every surface below asks the same question ("am I subscribed?")
// and gets one answer whether the tag lives on this device or in the repo.
import { cachedPublished, refreshPublished, publishTag, unpublishTag,
         effectiveTags, isEffectivelySubscribed, unsubscribeEverywhere } from '../tagsubs-pds.js';
import { observeTags, topTags, SORTS, sortLabel, cloudSizes } from '../tag-stats.js';
import { trendingTags, trendingTtl, setTrendingTtl, DEFAULT_TTL_MS } from '../trending-tags.js';
import { HASHTAG_SECTIONS, SECTION_IDS, sectionLabel, sectionEnabled, setSectionEnabled, enabledSections } from '../hashtag-prefs.js';

let manager = null;        // null = not booted; 'unavailable' = origin has no OAuth client
let session = null;        // the lens session shape, set after restore
// Decision 8 (plan 2026-08-29 post-and-thread): the masthead shows the
// account's picture. Fetched once per sign-in, fire-and-forget — a failure
// leaves the initials stand-in, which is the loading state anyway.
let sessionAvatarUrl = null;
export function sessionAvatar() { return session ? sessionAvatarUrl : null; }
// 4b "Hide for me": device-local, like the density preference. The substrate
// applies it through the posture; this file owns reading and writing it.
const HIDDEN_KEY = 'forage.hidden';
const hiddenUris = new Set((() => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } })());
const persistHidden = () => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenUris])); } catch { /* private mode */ } };
let lens = createLens({ hiddenUris });
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
          // v11: registering a saved feed under its slug happens HERE, in the
          // one place that fetches them. It used to happen in the rail's Feeds
          // card as a side effect of drawing a row — so removing that card (a
          // duplicate of the left nav) would have quietly broken `/f/<slug>`
          // for every feed you had joined.
          registerSource({ slug: f.slug, humanSlug: f.humanSlug, title: f.title, kind: f.kind, creator: f.creator,
            source: f.kind === 'author' ? { kind: 'author', actor: f.id }
              : f.kind === 'timeline' ? { kind: 'timeline' } : { kind: f.kind, uri: f.id } });
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

// a repaint, and it says so — a bare popstate here read as a Back (see router)
const rerender = () => rerenderNow();

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
// "Another provider" field is not, and a lingering singleton would carry a
// half-typed handle from one visit into the next.
const ATMO_GLOSS = 'A Personal Data Server provider in the open social Atmosphere';

function authSheet() {
  const titleId = 'authsheet-title';
  const dialog = el('dialog', { class: 'authsheet', 'data-auth-sheet': '1', 'aria-labelledby': titleId });
  const close = el('button', { type: 'button', class: 'sheet-x', 'aria-label': 'Close' }, '✕');
  close.addEventListener('click', () => dialog.close());

  // One row shape for both panels. The two-direction rule (open offers Create,
  // invite-only shows the WORDS in the create slot) is a property of the host,
  // not of the panel it sits on — so a host that changes posture moves panels
  // and changes its controls in one edit to the registry.
  const hostRow = (h) => {
    const actions = el('div', { class: 'sheet-actions' });
    if (canCreateAccount(h)) {
      const create = el('button', { type: 'button', class: 'btn primary sm', 'data-host-create': '1' }, 'Create account');
      // prompt=create is not decoration: driven end to end against the open
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
    return el('div', { class: 'sheet-row', 'data-host-row': h.id },
      el('span', { class: 'sheet-host' }, h.label), actions);
  };

  // The front page is the hosts a newcomer can JOIN from here (owner,
  // 2026-08-29). Invite-only hosts are one tap in, below.
  const list = el('div', { class: 'sheet-list' }, ...featuredHosts().map(hostRow));

  // Everything not on the short list reaches the same seam. The list is an
  // editorial convenience, not a boundary — this is what keeps it from being
  // one. The panel carries the invite-only hosts first (a member of one still
  // signs in by name, and the words in the create slot say why there is no
  // Create), then the handle field for any atproto host at all.
  const handle = el('input', { type: 'text', id: 'sheet-other-handle', 'data-host-other-handle': '1',
    placeholder: 'you.example.com', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const form = el('form', { class: 'sheet-other-form' },
    el('label', { for: 'sheet-other-handle', class: 'xs muted' }, 'Your handle on any atmo provider'),
    el('div', { class: 'row', style: 'gap:6px;margin-top:4px' }, handle,
      el('button', { type: 'submit', class: 'btn primary sm', 'data-host-other-go': '1' }, 'Continue')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = handle.value.trim().replace(/^@+/, '');
    if (!v) return toast('Enter your handle — for example you.example.com.', 'err');
    beginSignIn(v);
  });
  const panel = el('div', { class: 'sheet-other', hidden: true },
    el('div', { class: 'sheet-list' }, ...otherHosts().map(hostRow)), form);
  const other = el('button', { type: 'button', class: 'btn sm sheet-more', 'data-host-other': '1' }, 'Another provider');
  other.addEventListener('click', () => { other.hidden = true; panel.hidden = false; handle.focus(); });

  dialog.append(
    el('div', { class: 'row spread' },
      // "atmo" is the owner's word (2026-08-29) for a home on the open social
      // Atmosphere. The gloss is a native <abbr title>: it hovers on a desktop
      // and assistive tech reads it, but touch cannot hover — so the sentence
      // below says the same thing in plain sight, and the tooltip is a bonus,
      // not the only copy of the definition.
      el('h2', { id: titleId, style: 'margin:0' }, 'Choose your ',
        el('abbr', { class: 'sheet-gloss', title: ATMO_GLOSS }, 'atmo'), ' provider'), close),
    el('p', { class: 'xs muted' },
      `Forage has no accounts of its own. You sign in with an account from an atmo provider — ${ATMO_GLOSS.charAt(0).toLowerCase()}${ATMO_GLOSS.slice(1)}. Bluesky is one of many, and each sets its own rules.`),
    list, other, panel);
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
        'Your Bluesky as a forum — feeds are boards, threads are threads. Forage has no accounts of its own: you bring one from Bluesky or any other atmo provider.'),
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
  lens = createLens({ session, hiddenUris });
  sessionAvatarUrl = null;
  lens.profile(s.did).then((p) => { if (session?.did === s.did) { sessionAvatarUrl = p.avatar; rerender(); } })
    .catch((e) => console.warn('forage: could not load your profile picture', e));
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
  //
  // v11 (owner, 2026-09-01: "remove Bluesky from the default feed on the left"):
  // `inNav: false` keeps it OUT of the left nav's Feeds list and nowhere else.
  // It stays in this registry because that is what makes /f/bsky.app resolve,
  // and it stays on the home page's Browse card, which is a list of what a
  // guest can open rather than a list of their boards. A guest's Feeds section
  // is now Discover and the directory — the two boards a signed-out reader can
  // actually read — where one company's own account was a default nobody chose.
  { slug: 'bsky.app', title: 'Bluesky', kind: 'author', inNav: false,
    source: { kind: 'author', actor: 'bsky.app' } },
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
// (tagChips — the chip row under a post — retired by v13: the tags are links in the text)
function facetNodes(text, facets) {
  return facetSegments(text, facets).map((seg) => {
    if (!seg.facet) return seg.text;
    if (seg.facet.type === 'link') return el('a', { href: seg.facet.value, target: '_blank', rel: 'noopener noreferrer' }, seg.text);
    if (seg.facet.type === 'mention') return el('a', { href: `https://bsky.app/profile/${seg.facet.value}`, target: '_blank', rel: 'noopener noreferrer', title: 'Profiles live on bsky.app — Forage is a lens' }, seg.text);
    if (seg.facet.type === 'tag') return el('a', { href: `/h/${encodeURIComponent(seg.facet.value)}`, 'data-tag': seg.facet.value, title: 'Open this hashtag as a board' }, seg.text);
    return seg.text;
  });
}
// post-text: the words the thread head shows. The post's body when it has one
// (the title is a placeholder or an alt-derived stand-in otherwise), minus the
// trailing url that the external card below already carries in full.
function headWords(p) {
  const raw = p.body || p.title || '';
  const { text, facets } = trimCardLink(raw, p.facets, p.media?.kind === 'external' ? p.media.uri : null);
  return facetNodes(text.slice(0, 300), facets);
}
function facetedBody(p) {
  if (p.maskedRemoved || !p.body) return null;
  // post-text: one renderer. This was a verbatim copy of facetNodes' segment
  // mapping, and the two had already started to drift.
  const bodyEl = el('div', { class: 'clamp' }, ...facetNodes(p.body, p.facets));
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
    // board-cards decision 4: every picture stands on a stage (js/ui/stage.js).
    // 4i: an author who wrote alt text has named this link already — the img's
    // alt IS the link's accessible name. Where they did not, we name what the
    // link DOES and stop there. We do NOT invent a description of a picture
    // nobody has described: a fabricated alt makes a screen reader worse while
    // turning this gate green, which is the worst of both.
    // decision 5: one picture is a stage; up to "pictures shown at once" is a
    // grid; more fold into a carousel (js/pictures.js owns the rule)
    const linkAttrs = { target: '_blank', rel: 'noopener noreferrer' };
    const layout = pictures.layoutFor(p.media.items.length, pictures.active());
    const i = p.media.items[0];
    const picture = layout === 'grid' ? grid({ items: p.media.items, linkAttrs })
      : layout === 'carousel' ? carousel({ items: p.media.items, linkAttrs })
      : stage({ kind: 'images', thumb: i.thumb, alt: i.alt, aspect: i.aspect, link: i.full,
          linkLabel: i.alt ? null : 'Image, opens full size', linkAttrs });
    // gif-embeds phase 4: the alt a person wrote, printed where it can be read
    // without a screen reader. Hidden by default (the owner's choice); the
    // <img alt> above is written either way (D7).
    return withAltCaption(picture, p.media.items);
  }
  if (p.media.kind === 'video') {
    // v13 decision 30 (owner: "this video seems to open directly on bluesky
    // instead of playing the content"): the clip plays HERE. The stage is the
    // poster; the press mounts a <video> on the post's HLS playlist — Safari
    // plays HLS natively, Chromium and Firefox through vendored hls.js, loaded
    // only now. Nothing is fetched from the video host before the press.
    const link = `https://bsky.app/profile/${p.author}/post/${p.id.split('/').pop()}`;
    if (!p.media.playlist) {
      return el('div', { class: 'media-strip' },
        el('a', { href: link, target: '_blank', rel: 'noopener noreferrer', title: 'Video — plays on bsky.app' }, el('span', { class: 'tag' }, '▶ video')));
    }
    return stage({ kind: 'video', thumb: p.media.thumb || '', alt: '[video]', aspect: p.media.aspect, playLabel: 'Play video',
      onPlay: (node) => mountVideo(node, { playlist: p.media.playlist, poster: p.media.thumb, fallback: link }) });
  }
  if (p.media.kind === 'gif') return gifCard(p);
  if (p.media.kind === 'external') return externalCard(p);
  return null;
}

// gif-embeds phase 4: alt text as a VISIBLE caption, off unless asked for.
//
// Today alt lives only in `<img alt>`, which is right for a screen reader and
// invisible to everyone else. The owner asked for a switch; the default is
// hide, because the case that prompted it was Bluesky auto-filling a GIF's alt
// with the GIF's own title and printing the same words twice.
//
// D7: this adds a caption. It never removes the `<img alt>` written above it —
// a display preference must not become an accessibility regression.
function altCaptionNode(items) {
  const named = items.map((i, n) => ({ alt: (i.alt || '').trim(), n })).filter((x) => x.alt);
  if (!named.length) return null;
  const many = items.length > 1;
  return el('div', { class: 'alt-caption', 'data-alt-text': '1' },
    ...named.map(({ alt, n }) => el('div', {},
      // numbered only when there is more than one picture to tell apart
      many ? el('span', { class: 'muted' }, `${n + 1}. `) : null, alt)));
}
function withAltCaption(picture, items) {
  if (!altText.shown()) return picture;
  const caption = altCaptionNode(items);
  return caption ? el('div', { class: 'stages' }, picture, caption) : picture;
}

// gif-embeds phase 2: the GIF CARD (owner, 2026-09-02 — "the gif shuld show a
// play/pause overlay … not just tha tpost, but that TYPE of post").
//
// The stage is a player rather than a still thumbnail with a link out; the
// caption keeps the card's identity. D8: bsky.app hides the title and host for
// a GIF (`hideDetails`), forage does not — the owner asked for a player and a
// setting, not for the card to lose its name. The duplication that prompted
// the report is gone anyway, because the "ALT: <the title again>" line is what
// the alt-text setting hides by default.
function gifCard(p) {
  const { uri, thumb, title, alt, player, sources, src, aspect } = p.media;
  const host = domainOf(uri) || '';
  const name = title || host || 'GIF';
  const linkAttrs = { target: '_blank', rel: 'noopener noreferrer' };
  return el('div', { class: 'extcard', 'data-extcard': '1', 'data-gifcard': '1', 'data-provider': 'gif' },
    gifStage({ player, sources, src, thumb, alt, aspect, autoplay: gifAutoplay.enabled() }),
    el('a', { class: 'ext-caption', href: uri, ...linkAttrs, 'aria-label': `${name} — opens in a new tab` },
      el('div', { class: 'ext-title', 'data-ext-title': '1' }, name),
      altText.shown() && alt ? el('div', { class: 'ext-desc', 'data-alt-text': '1' }, alt) : null,
      el('div', { class: 'ext-host' }, el('span', { 'data-ext-host': '1' }, host))));
}

// v13 decisions 29 and 31: the EXTERNAL CARD — the picture on a stage (centred,
// contain-fit, the blurred backdrop; a book cover is no longer pinned to an
// edge), then the title, the description and the host, the whole caption one
// link out. A YouTube link says so and PLAYS IN PLACE: the press swaps the
// stage for YouTube's embed (the nocookie host, autoplay on the press only);
// until then nothing loads from YouTube — the picture is the post's own.
// 4i still holds: the thumbnail is decorative (alt=''), the anchor is named.
function youtubeId(uri) {
  try {
    const u = new URL(uri);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = /^\/(?:shorts|embed|live)\/([^/?]+)/.exec(u.pathname);
      return m ? m[1] : null;
    }
  } catch { /* not a url */ }
  return null;
}
function externalCard(p) {
  const { uri, thumb, title, description } = p.media;
  const host = domainOf(uri) || '';
  const name = title || host || 'external link';
  const yt = youtubeId(uri);
  const linkAttrs = { target: '_blank', rel: 'noopener noreferrer' };
  // post-text: a page with no og:image gives us no thumbnail. The card is its
  // words then — title, description, host — and NOT an empty stage; before this
  // the lens refused to build the media at all and the link went nowhere.
  const picture = !thumb ? null
    : yt
    ? stage({ kind: 'external', thumb, alt: '', playLabel: `Play ${name} on YouTube, here`,
        onPlay: (node) => {
          const frame = el('iframe', { class: 'ext-embed', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?autoplay=1`,
            title: name, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '', referrerpolicy: 'strict-origin-when-cross-origin' });
          node.replaceChildren(frame);
        } })
    : stage({ kind: 'external', thumb, alt: '', link: uri, linkLabel: `${name} — opens in a new tab`, linkAttrs });
  return el('div', { class: 'extcard', 'data-extcard': '1', ...(thumb ? {} : { 'data-nothumb': '1' }), ...(yt ? { 'data-provider': 'youtube' } : {}) },
    picture,
    el('a', { class: 'ext-caption', href: uri, ...linkAttrs, 'aria-label': `${name} — opens in a new tab` },
      el('div', { class: 'ext-title', 'data-ext-title': '1' }, name),
      description ? el('div', { class: 'ext-desc' }, description.length > 160 ? description.slice(0, 160) + '…' : description) : null,
      el('div', { class: 'ext-host' },
        yt ? el('span', { class: 'ext-provider', 'data-ext-provider': '1' }, el('span', { 'aria-hidden': 'true' }, '▶ '), 'YouTube') : null,
        el('span', { 'data-ext-host': '1' }, host))));
}

// the vendored HLS demuxer, loaded once and only when a browser needs it
let hlsLoading = null;
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsLoading) {
    hlsLoading = new Promise((resolve, reject) => {
      const sc = el('script', { src: '/vendor/hls.light.min.js' });
      sc.addEventListener('load', () => (window.Hls ? resolve(window.Hls) : reject(new Error('hls.js loaded but defined nothing'))));
      sc.addEventListener('error', () => reject(new Error('the video player could not load')));
      document.head.append(sc);
    });
  }
  return hlsLoading;
}

// Could the demuxer play here? This is the test hls.js's own `Hls.isSupported()`
// runs, hoisted so the routing decision can be made WITHOUT first downloading
// 385 KB to ask it.
function mseHlsSupported() {
  const MS = window.ManagedMediaSource || window.MediaSource || window.WebKitMediaSource;
  try {
    return !!MS && typeof MS.isTypeSupported === 'function'
      && MS.isTypeSupported('video/mp4;codecs="avc1.42E01E,mp4a.40.2"');
  } catch { return false; }
}

// LIVE 2026-08-31, the owner on Chrome for Android: a clip mounted, showed its
// poster, and then sat at 0:00 behind a broken-media glyph with nothing said.
// The routing asked `canPlayType('application/vnd.apple.mpegurl')` FIRST and
// took any non-empty answer as proof — but Chrome 147 answers "maybe" on
// Android and macOS while its native HLS demuxer then fails on playlists like
// Bluesky's (video-dev/hls.js#7827; hls.js's own README now warns that a
// browser "may report support but potentially fail to play certain streams
// natively"). So a non-empty canPlayType is NOT evidence, and the branch it
// guarded was the silent one: only the hls.js path ever said anything.
//
// The gate that IS evidence: take the native path only where the browser
// claims HLS and hls.js could not have helped anyway —
//   · Safari 17.1+, where `ManagedMediaSource` is Safari's and Safari's alone,
//     and native HLS is both the better player and 385 KB cheaper;
//   · older iOS Safari, which has no MSE at all for hls.js to run on.
// Everything else — Chrome, Edge, Chromium on Android, Firefox — goes through
// the demuxer, which is what actually plays these playlists.
function nativeHlsFirst(video) {
  if (!video.canPlayType('application/vnd.apple.mpegurl')) return false;
  return 'ManagedMediaSource' in window || !mseHlsSupported();
}

function mountVideo(node, { playlist, poster, fallback }) {
  const video = el('video', { class: 'stage-video', controls: '', autoplay: '', playsinline: '', poster: poster || '', 'data-playlist': playlist, preload: 'metadata' });
  node.replaceChildren(video);
  const viaHls = () => loadHls().then((Hls) => {
    if (!Hls.isSupported()) throw new Error('this browser cannot play HLS video');
    const hls = new Hls();
    hls.on(Hls.Events.ERROR, (_, data) => { if (data?.fatal) { hls.destroy(); toast(`The video would not play here — it is on bsky.app: ${fallback}`, 'err'); } });
    hls.loadSource(playlist); hls.attachMedia(video);
  }).catch((e) => toast(`${e.message} — it plays on bsky.app: ${fallback}`, 'err'));
  if (nativeHlsFirst(video)) {
    // `data-player` records the DECISION and never changes — it is what the
    // workflow asserts on. Even here the browser's promise is a first try, not
    // the last word: one media error and the demuxer takes over, so a browser
    // that lies costs a retry rather than leaving a reader a broken box.
    video.dataset.player = 'native';
    video.addEventListener('error', () => {
      video.removeAttribute('src');
      video.load();
      video.dataset.playerFallback = 'hls';
      viaHls();
    }, { once: true });
    video.src = playlist;
    return;
  }
  video.dataset.player = 'hls';
  viaHls();
}

// The board view preference (card | compact) — device-local, like theme/skin.
// The density preference now lives in js/board-density.js so BOTH populations
// read one key through one module. `boardView` is kept as a local alias only
// because this file reads it in a dozen places.
const boardView = density;

// Per-page-load sort state (a view concern, like the ring).
let boardSort = 'feed';
let boardTimeframe = 'day';
// the thread's own sort, session-local like the board's (Phase 11c)
let threadSort = 'hot';
let threadFrom = 'all';
const THREAD_WINDOW_MS = { day: 86400e3, week: 6048e5, month: 2592e6, year: 31536e6 };

// The reddit-style toolbar: sort · timeframe (under Top) · view. Sorting is
// HONEST about scope — it re-orders the loaded window only (the generator
// owns the true ranking, DL-010; whole-feed live sorts are the Jetstream v2
// frontier, E139).
// `timeframes` says what THIS board's window can answer (sortbar.js). A board
// that widens by walking offers the rungs its walk can be told apart by; one
// with a real server window offers all five. The carried choice is clamped
// here, once, so the select can never show a value it does not have.
// `refresh` is the board's refresh control (feed-position D9/D13), passed in
// rather than built here because the BOARD owns the check and the pending
// list — the bar only gives it its outboard slot.
function boardToolbar(onChange, { timeframes = TIMEFRAMES, refresh = null } = {}) {
  boardTimeframe = nearestTimeframe(boardTimeframe, timeframes);
  // Phase 11c: the same bar the memory board has. Sorts the LOADED posts —
  // the feed itself is ranked by its generator (DL-010); Hot is engagement
  // over that window (decision 9), From applies to Hot and Top.
  // rebuilt on every change so From appears the moment a windowed sort is chosen
  // The density dial is the SHARED one (js/board-density.js), drawn inside the
  // sort bar's row so both populations show one control family (board-cards
  // decision 3). Redrawn with the bar — it is cheap and reads its own state.
  const barHost = el('div', { style: 'display:contents' });
  const drawBar = () => barHost.replaceChildren(sortBar({
    sorts: [['feed', 'Default'], ['hot', 'Hot'], ['new', 'New'], ['top', 'Top']],
    sort: boardSort, from: boardTimeframe, timeframes,
    onChange: ({ sort, from }) => { boardSort = sort; boardTimeframe = from; drawBar(); onChange(); },
    // decision 7: the card size dial (1–4) stands where the 3t slider stood —
    // a notch is a choice a thumb can make; the slider moved in visible jumps
    // feed-position D13: refresh sits OUTBOARD of the two display dials. It
    // acts on content where they act on presentation, and the outermost slot
    // is the one a thumb reaches — so it is last, at the column's right edge.
    extra: [el('span', { class: 'grow' }), densityDial(el, () => onChange()), cardSizeDial(el),
      ...(refresh ? [refresh.live, refresh.node] : [])],
  }));
  drawBar();
  return el('div', { class: 'row wrap', style: 'gap:6px;margin:6px 0;align-items:center', 'data-board-toolbar': '1' }, barHost);
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
  // v11: the second clause was `boardSort === 'top' && boardTimeframe !== 'all'`,
  // which the first already covers — it read as though "all time" were exempt
  // from the loaded-window caveat, and now that All time walks like every other
  // rung it plainly is not. Same condition, one clause.
  if (!wholeCorpus && boardSort !== 'feed') {
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
  // feed-row v1 (2026-08-30): the picture shows in BOTH densities. Compact
  // tightens the row — padding, byline, no body preview, no tag chips — but
  // does not take the post's content out of it. The owner's phone runs the
  // phpBB skin, which prefers compact, and showed a feed with no pictures
  // beside a thread page with them; the 40px title-thumb that stood in for a
  // placeholder-titled compact row went with the rule.
  const showsMedia = !!p.media && !p.maskedRemoved;
  // quote-embed (owner, 2026-09-01, on a quote of a video): the row shows what
  // the post QUOTES. Until now p.quoted rendered on the post page alone, so a
  // quote-post's row was the quoter's sentence over nothing — the reader had to
  // open the thread to find out what was being talked about, and the video the
  // post is entirely about never appeared at all. Same rule as feed-row v1's
  // picture: it shows in BOTH densities, because compact tightens a row without
  // taking the post's content out of it, and a quote's content is the quote.
  const showsQuote = !!p.quoted && !p.maskedRemoved;
  const threadPath = `/p?uri=${encodeURIComponent(p.id)}`;
  // v13 (E, H): a post's words are TEXT — faceted, so its #tags, links and
  // mentions are live in place (owner: "I don't love how we extract every
  // hashtag and present it under and have it in the original") — and an
  // external post's words are text too; the card under them is the link. A
  // title with no words (the alt-derived one) stays plain.
  const titleNode = p.maskedRemoved ? undefined
    : showsMedia && p.placeholderTitle ? null
    // post-text: the row trims the card's own url too — the row shows the card
    // (bodyNode, below), so the raw url would be printed twice there as well
    : p.body ? el('div', { class: 'posttitle posttext' }, ...headWords(p))
    : undefined;
  return postRow(p, !!session, {
    onVote: lensVote(p),
    onGuest: session ? null : openAuthSheet, // board-cards decision 1: the guest's pill is the door
    permalink: `${location.origin}${threadPath}`, // decision 2: the row's share
    // v13 (E): the row's own ground opens the thread — through the replies LINK's
    // press, so it is a link navigation (scroll to the top, history) and not go()'s
    // popstate, which keeps the scroll the way back/forward must
    open: (wrap) => wrap.querySelector('.actions a.replies')?.click(),
    menuGroups: (row) => lensMenuGroups(row, { kind: 'post' }), // 4b
    aboveNode: kindContext(p),
    // 3i: never duplicate the text. Card mode carries the media or the link card;
    // compact is dense (the picture stays — feed-row v1). No chip row (v13).
    bodyNode: showsMedia || showsQuote
      ? el('div', { class: 'rowbody' },
        showsMedia ? mediaNode(p) : null,
        showsQuote ? quotedContext(p.quoted) : null)
      : null,
    ...(titleNode !== undefined ? { titleNode } : {}),
    // a Bluesky post's text is body text, a link post's included (v13)
    textPost: true,
    authorBadge: verifiedBadge(p),
    // feed-row v2: the provider mark, unless the reader switched it off
    ...(providerMark.enabled() ? { provider: providerMark.providerOf(p.author), providerLabel: providerMark.markLabel(providerMark.providerOf(p.author), p.author) } : {}),
    metaExtra: langChip(p),
    // feed-row v7: no feed line under a lens row — the board's own header names
    // it once (v5's `@handle` crumb for author boards went with it)
    feedCrumb: false,
    domainLine: false, // v13 (J): the card carries the host
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

// board-cards decision 6: the rail — the guest's sign-in card first, then
// Trending last (the home page draws Trending in its column and passes
// trending: false). One order, so seven views cannot each invent one.
//
// v11 (owner, 2026-09-01: "remove this duplicate box on the right"): the Feeds
// card is GONE. It listed exactly what the left nav's Feeds section lists — the
// curated boards for a guest, your saved feeds signed in — and its "browse ›"
// pointed where the nav's "Browse all feeds" already points. Two lists of one
// thing, side by side, is a question about which one is authoritative.
function lensRail({ trending = true } = {}) {
  return [session ? null : sessionCard(), trending ? trendingRail() : null];
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
      lens = createLens({ hiddenUris });
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
    if (!handle) return toast('Enter your handle — for example you.bsky.social.', 'err');
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
    'Use another provider →');
  more.addEventListener('click', () => openAuthSheet());
  return el('div', { class: 'card', 'data-signin-card': '1' },
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
  lens.ringFeed(ring, { cursor, onPage, tags: effectiveTags(session?.did) }).then((b) => render(b, holder))
    .catch((e) => holder.replaceChildren(emptyState('Ring fetch failed', e.message)));
  return holder;
}

// The left nav for the Bluesky population. Feeds arrive async, so the tree is
// drawn immediately with what is known and the feed rows are filled in when
// they land — the same shape the rail's Feeds card used, moved to the side of
// the screen navigation actually belongs on.
export function lensNav(current) {
  const guestFeeds = CURATED.filter((c) => c.inNav !== false).map((c) => ({ slug: c.slug, title: c.title }));
  const host = el('div', { 'data-navhost': '1' },
    navTree({ el, session, feeds: guestFeeds, tags: effectiveTags(session?.did), current }));
  if (session) {
    ensureSavedFeeds().then((feeds) => {
      if (!session) return;
      host.replaceChildren(navTree({ el, session, current, tags: effectiveTags(session?.did),
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
  if (path.startsWith('/hashtags')) return 'hashtags';
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
        'With an account you get your own ring — following, mutuals, and one step past them — plus joining and favouriting feeds, liking posts, and posting and replying. Forage has no accounts of its own; you bring one from Bluesky or any other atmo provider.')]),
      el('div', { class: 'row wrap', style: 'gap:6px' },
        ...(session ? [] : [chip('guest search: needs sign-in (DL-014)', 'searchPosts is 403 unauthenticated — probe-verified')]),
        chip('saves: deferred (DL-015)', 'Bookmarks are not public API surface yet'))),
    el('div', { class: 'card' },
      el('h2', {}, 'Browse'),
      el('div', { class: 'stack' },
        ...CURATED.map((c) => el('div', {}, el('a', { href: `/f/${c.slug}` }, `f/${sourceLabel(c)}`), el('span', { class: 'xs muted' }, ` — ${c.kind}`))))));
  return { main, side: el('div', { class: 'side' }, ...lensRail({ trending: false })) };
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
  const side = el('div', { class: 'side' }, ...lensRail());
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
  const main = el('div', {});
  const allPosts = [];
  let nextCursor = null;
  // phases 0/2/4: what this board was showing when you left it. Read BEFORE
  // anything is drawn, because a hit paints synchronously and a miss must not
  // have drawn a skeleton it is about to replace.
  const cacheKey = boardCache.keyOf(entry);
  const cached = boardCache.read(cacheKey);
  let lastInfo = cached?.info ?? null;
  const remember = () => boardCache.write(cacheKey,
    { posts: allPosts.slice(), cursor: nextCursor, info: lastInfo, at: Date.now() });
  const card = el('div', { class: 'card' });
  const moreHost = el('div', {});
  const repaint = () => {
    renderBoard(card, allPosts);
    moreHost.replaceChildren();
    if (nextCursor) {
      const more = el('button', { class: 'btn sm', style: 'margin:8px' }, 'More');
      more.addEventListener('click', () => {
        lens.feed(entry.source, { title: entry.title, cursor: nextCursor })
          .then((next) => { allPosts.push(...next.posts); nextCursor = next.cursor || null; repaint(); remember(); })
          .catch((e) => toast('More failed: ' + e.message, 'err'));
      });
      moreHost.append(more);
    }
  };
  const headerHost = el('div', {});
  // feed-position Phase 5: what changed while you were gone. The check reads
  // page one and counts what sits ABOVE the top post the reader is holding —
  // it never writes into the board. Accepting is the press (D6): restoring is
  // automatic, refreshing is a press.
  //
  // Deliberately independent of Phases 0–4: the count needs only "is there
  // anything newer than allPosts[0]", not the board record, so this ships and
  // is judged on its own.
  let pending = [];
  const refresh = refreshControl({
    onRefresh: () => {
      if (pending.length) {
        allPosts.unshift(...pending);
        pending = [];
        refresh.setState('rest');
        repaint();
        remember();
        window.scrollTo(0, 0);
        return;
      }
      refresh.setState('busy');
      checkForNew().finally(() => { if (!pending.length) refresh.setState('rest'); });
    },
  });
  const checkForNew = () => {
    const top = allPosts[0]?.id;
    return lens.feed(entry.source, { title: entry.title })
      .then((f) => {
        const known = new Set(allPosts.map((p) => p.id));
        // what is ABOVE the post the reader is holding — a post further down
        // that we simply never paged to is not news, it is depth
        const idx = f.posts.findIndex((p) => p.id === top);
        const fresh = (idx === -1 ? f.posts : f.posts.slice(0, idx)).filter((p) => !known.has(p.id));
        pending = fresh;
        refresh.setState(fresh.length ? 'news' : 'rest', fresh.length);
      })
      .catch(() => refresh.setState('rest'));
  };
  // The deterministic seam the mock captures and the parity claims drive, in
  // the shape js/auth/session.js already uses for its fake manager. A timer
  // would make both of them wait on a clock they cannot see.
  window.__forageCheckForNew = checkForNew;
  // 4f: a /f/ board has no server window (DL-032), so "Top · this week" widens
  // by paging backwards on a budget and then says which of the three ways it
  // ended. The note is part of the answer, not decoration.
  const deepNote = el('div', { class: 'xs muted', style: 'padding:6px', 'data-deepen': '1' });
  let deepening = false;
  // v11 (owner, 2026-09-01), two changes to WHEN this runs:
  //
  // - "All time" walks. It used to be the one window that returned here without
  //   widening, so it ranked whatever the previous choice happened to have
  //   loaded — measured: 210 posts where "this year" ranked 240. A rung that
  //   promises the most and delivers the least inverts the whole ladder, which
  //   is the incoherence the owner was looking at. Infinity as the target means
  //   the walk never "covers"; it ends on the budget or on the feed running out,
  //   and says which.
  // - Hot walks too. From applies to Hot and Top alike (decision 9) and means
  //   the same window in both, so widening one and not the other made
  //   "Hot · today" and "Top · today" two different promises under one control.
  const WINDOWED = ['hot', 'top'];
  const deepen = () => {
    if (deepening || !WINDOWED.includes(boardSort)) { deepNote.replaceChildren(''); return; }
    const hours = { day: 24, week: 168, month: 720, year: 8760, all: Infinity }[boardTimeframe];
    const span = boardTimeframe === 'all' ? 'as far back as it goes' : `the last ${boardTimeframe}`;
    deepening = true;
    deepNote.replaceChildren(`Widening to ${span}…`);
    lens.deepen(entry.source, { toHours: hours, nowMs: Date.now() })
      .then((out) => {
        allPosts.length = 0;
        allPosts.push(...out.posts);
        nextCursor = out.cursor || null;
        repaint();
        remember();
        deepNote.replaceChildren(
          out.outcome === 'covered'
            ? `Ranked every post this feed served in the last ${boardTimeframe} (${out.pages} page${out.pages === 1 ? '' : 's'}).`
            : out.outcome === 'exhausted'
              ? `This feed only goes back ${out.reachedHours}h — that is everything it has, ranked.`
              : boardTimeframe === 'all'
                ? `Ranked the last ${out.reachedHours}h — as far back as this feed lets us page.`
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
  // ONE paint, reached from a record or from the network. It must be callable
  // synchronously: `render()` is the popstate handler, and the browser applies
  // the saved offset after that handler returns and before the next frame — so
  // a board that is still fetching when it returns has already lost the reader's
  // place, in every engine (measured chromium/webkit/firefox 2026-09-01).
  const paint = (info) => {
    lastInfo = info ?? lastInfo;
    if (lastInfo) headerHost.replaceChildren(feedHeaderCard(lastInfo));
    main.replaceChildren(
      el('div', { class: 'row spread wrap' },
        // 4h: `info` is the network's answer and is already resolved here —
        // reaching past it for the registry string is how a retired name shipped.
        el('h1', {}, lastInfo?.title || entry.title)), // the DL chips are gone (feed-row v4)
      headerHost,
      // this board widens by walking, so it offers what a walk can tell apart
      boardToolbar(() => { repaint(); deepen(); }, { timeframes: WALK_TIMEFRAMES, refresh }),
      allPosts.length ? card : emptyState('Nothing here', 'This source returned no posts.'),
      deepNote,
      moreHost);
    repaint();
    // the pill follows the reader only once the bar is on the page to watch
    const stop = refresh.watch();
    main._cleanup = () => { stop(); if (window.__forageCheckForNew === checkForNew) delete window.__forageCheckForNew; };
    // thread links: lens posts route through #/p?uri=
    for (const a of card.querySelectorAll('a[href*="/p/at:"], a[href^="/f/"]')) {
      const href = a.getAttribute('href');
      const m = href.match(/\/p\/(at:.+)$/);
      if (m) a.setAttribute('href', `/p?uri=${encodeURIComponent(m[1])}&from=${entry.slug}`);
    }
  };

  if (cached) {
    // Phase 0/2: a rebuild or a Back asks the record, not the network. This is
    // also why arriving at a board no longer costs four fetches — `render()`
    // runs on every store change and each run used to re-fetch.
    allPosts.push(...cached.posts);
    nextCursor = cached.cursor ?? null;
    paint(cached.info);
    // On return to board (owner, 2026-09-02, choosing among three candidate
    // triggers). A cache hit means you have been here before, so this mount is
    // either Back out of a post or a walk back to a board you were reading —
    // both are the moment "what did I miss" has an answer.
    //
    // Keyed on ARRIVING, not on mounting: render() re-runs on every store change
    // and each run hits the cache, so a check keyed on the mount would ask the
    // network on a timer nobody chose. It costs one page-one request per return
    // and cannot move the reader — checkForNew only counts and announces.
    if (navKind() !== 'rerender') checkForNew();
  } else {
    main.append(
      el('div', { class: 'row spread wrap' }, el('h1', {}, entry.title)),
      skeleton(6));
    const flight = boardCache.inflight(cacheKey)
      || boardCache.track(cacheKey, Promise.all([infoReady, lens.feed(entry.source, { title: entry.title })]));
    flight.then(([info, f]) => {
      if (info?.hidden) {
        main.replaceChildren(emptyState('This feed is hidden by your moderation settings',
          'It carries an adult content label and your Bluesky account has adult content turned off. Forage mirrors that setting and adds no switch of its own — change it in your Bluesky settings if you want it back.'));
        return;
      }
      allPosts.push(...f.posts);
      nextCursor = f.cursor || null;
      paint(info);
      remember();
    }).catch((e) => main.replaceChildren(emptyState('Lens fetch failed', e.message)));
  }
  // the board's identity travels with the view, so main.js can ask scroll memory
  // where this board was without needing to know what a board is
  return { main, side: el('div', { class: 'side' }, ...lensRail()), boardKey: cacheKey };
}

// 3e/3q: a quote-response rendered as thread continuation. 3q gives it a left
// WALL — quoted material, the same grammar the feed blurb uses — so it reads
// as a top-level thread ON the post rather than blending into the replies
// below it (which carry the green collapse gutter instead). The ❝ marker keeps
// the distinction in words; the node still opens as its own thread, because
// the conversation genuinely branched into a new room.
// Phase 9 (plan 2026-08-29 post-and-thread, decision 5): a quote-response
// renders THROUGH commentNode — avatar column, byline, vote stack, the same
// action row — with a wall on its outer edge and two additions: the byline
// says "⟳ quoted this", and the action row carries a Repost glyph (O6: a real
// write, 4a-iii). No tint, no "open its thread" (the ⋯ has Open on bsky.app).
function quoteNode(node, ctx) {
  return commentNode(node, {
    ...ctx,
    bylineExtra: (n) => (n.kind === 'quote'
      ? el('span', { class: 'kind', title: 'A quote-response: this author quoted the post above' },
        el('span', { 'aria-hidden': 'true' }, '\u27F3 '), `quoted ${n.depth ? 'that' : 'this'}`)
      : ctx.bylineExtra?.(n) || null),
    extraActions: (n) => ctx.extraActions?.(n) || null, // v12 decision 25: ⟳ comes from the thread ctx for every node, the quote included
    continueStub: (n) => (n.kind === 'quote'
      ? el('a', { class: 'continue-stub', href: `/p?uri=${encodeURIComponent(n.quoteUri)}` },
        `→ ${n.deferred} more quote${n.deferred === 1 ? '' : 's'} of this, in its own thread`)
      : ctx.continueStub?.(n) || null),
  });
}

// 4a-iii / Phase 9: the Repost glyph — icon only, a count beside it, pressed
// when it is your repost. feed-row v12 decision 25 (owner: "the same button
// for us should just popup with a dialogue that allows us to add commentary
// or not and if we hit post without then it's just a plain repost"): the
// figure is reposts + quotes (bsky.app's: social-app PostControls sums them),
// and a press opens the sheet below instead of toggling. A guest sees the
// figure and nothing opens (the like's door pattern is the sheet's Post).
const repostFigure = (p) => (p.repostCount || 0) + (p.quoteCount || 0);
function repostControl(p) {
  const n = el('span', { class: 'n' }, fmtScore(repostFigure(p)));
  if (!session) {
    return el('span', { class: 'cbtn', 'data-repost': '1', 'data-readonly': '1', role: 'img',
      'aria-label': plural(repostFigure(p), 'repost') }, el('span', { 'aria-hidden': 'true' }, '\u27F3'), n);
  }
  const b = el('button', { type: 'button', class: 'cbtn', 'data-repost': '1', 'aria-pressed': String(!!p.repostUri),
    'aria-haspopup': 'dialog', 'aria-label': 'Repost', title: 'Repost, or quote with a comment' }, el('span', { 'aria-hidden': 'true' }, '\u27F3'), n);
  b.addEventListener('click', () => repostSheet(p, { onChange: () => { n.textContent = fmtScore(repostFigure(p)); b.setAttribute('aria-pressed', String(!!p.repostUri)); } }));
  return b;
}

// Decision 25's sheet: one box, one Post. Words → a QUOTE post of mine that
// embeds the node (it lands in the thread under the node it quotes, with the
// ⟳ tell, once the thread refetches); no words → a plain repost, which no
// thread shows; already reposted → Remove repost. A quote is a post: it goes
// away through its own ⋯ → Delete, not through this sheet. Native <dialog>,
// the mute-words sheet's pattern (DESIGN.md's one exception to pages).
function repostSheet(p, { onChange } = {}) {
  const box = el('textarea', { rows: '4', 'data-repost-text': '1', placeholder: 'Add a comment — or leave this empty to repost as it is', 'aria-label': 'Your comment (optional)' });
  const count = countRing();
  const post = el('button', { type: 'button', class: 'btn primary', 'data-repost-post': '1' }, 'Post');
  const cancel = el('button', { type: 'button', class: 'btn', 'data-repost-cancel': '1' }, 'Cancel');
  const remove = p.repostUri ? el('button', { type: 'button', class: 'btn danger', 'data-repost-remove': '1' }, 'Remove repost') : null;
  const dialog = el('dialog', { class: 'sheet repost-sheet', 'data-repost-sheet': '1', 'aria-label': 'Repost' },
    el('div', { class: 'row spread' }, el('strong', {}, 'Repost'),
      el('button', { type: 'button', class: 'sheet-x', 'aria-label': 'Close' }, '✕')),
    el('p', { class: 'small muted' }, 'With a comment it is a quote — a post of yours that shows this one, and it appears under it here. Without one it is a plain repost.'),
    box, el('div', { class: 'row spread' }, el('span', {}), count.node),
    el('div', { class: 'sheet-actions' }, remove, cancel, post));
  const sync = () => { const left = POST_LIMITS.graphemes - graphemes(box.value.trim()); count.paint(left); post.disabled = left < 0; };
  box.addEventListener('input', sync); sync();
  dialog.querySelector('.sheet-x').addEventListener('click', () => dialog.close());
  cancel.addEventListener('click', () => dialog.close());
  remove?.addEventListener('click', async () => {
    remove.disabled = true;
    try {
      await lens.unrepost(p.repostUri);
      p.repostUri = null; p.repostCount = Math.max(0, (p.repostCount || 0) - 1); onChange?.();
      dialog.close(); toast('Repost removed.', 'ok');
    } catch (e) { remove.disabled = false; toast(e.message, 'err'); }
  });
  post.addEventListener('click', async () => {
    const text = box.value.trim();
    post.disabled = true;
    try {
      if (!text) {
        const { repostUri } = await lens.repost(p.id, p.cid);
        p.repostUri = repostUri; p.repostCount = (p.repostCount || 0) + 1; onChange?.();
        dialog.close(); toast('Reposted.', 'ok');
      } else {
        await lens.publish({ text, quote: { uri: p.id, cid: p.cid } });
        p.quoteCount = (p.quoteCount || 0) + 1; onChange?.();
        dialog.close(); toast('Posted — your quote will show under this once the thread refreshes.', 'ok');
        rerender();
      }
    } catch (e) { post.disabled = false; console.warn('forage: repost refused', e); toast(e.message, 'err'); }
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  box.focus();
}

// 3r: one dispatch for every thread node. The substrate says which kind it is;
// the view only draws.
// ---- the ⋯ menu on the lens (4b; decision 3) ------------------------------
// post · thread · account groups, separators only, destructive last; a guest
// gets only what a guest can do. Own posts carry no Mute/Block/Report (Delete
// stays the two-press control in the action row, which bluesky-view pins).
async function copyText(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied.`, 'ok'); }
  catch (e) { console.warn('forage: clipboard write failed', e); toast(`Could not copy the ${what.toLowerCase()} — your browser refused the clipboard.`, 'err'); }
}

async function afterPostureWrite(msg) {
  try { await lens.loadPosture(); } catch (e) { console.warn('forage: posture reload failed', e); }
  if (msg) toast(msg, 'ok');
  rerender();
}

function muteWordSheet() {
  const input = el('input', { class: 'form', type: 'text', placeholder: 'a word, or #tag', 'aria-label': 'Word or tag to mute' });
  const save = el('button', { type: 'button', class: 'btn primary' }, 'Mute');
  const cancel = el('button', { type: 'button', class: 'btn' }, 'Cancel');
  const dialog = el('dialog', { class: 'sheet', 'aria-label': 'Mute words & tags' },
    el('div', { class: 'row spread' }, el('strong', {}, 'Mute words & tags'),
      el('button', { type: 'button', class: 'sheet-x', 'aria-label': 'Close' }, '✕')),
    el('p', { class: 'small muted' }, 'Muted on your Bluesky account — posts containing it disappear here and in every app that honours your settings. A leading # mutes a tag only. Forage\u2019s own hashtag preferences are on your account page.'),
    input, el('div', { class: 'sheet-actions' }, cancel, save));
  dialog.querySelector('.sheet-x').addEventListener('click', () => dialog.close());
  cancel.addEventListener('click', () => dialog.close());
  save.addEventListener('click', async () => {
    const word = input.value.trim();
    if (!word) return;
    save.disabled = true;
    try {
      const wrote = await lens.muteWord(word);
      dialog.close();
      await afterPostureWrite(wrote ? `Muted ${word}.` : `${word} was already muted.`);
    } catch (e) { save.disabled = false; toast(e.message, 'err'); }
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
}

function lensMenuGroups(p, { kind }) {
  const rkey = String(p.id).split('/').pop();
  const app = appFor(session?.serverMetadata?.issuer ?? null); // v13 decision 28
  // decision 10: a comment's link is its root's thread, focused on it
  const link = kind === 'comment' && p.postId && p.postId !== p.id
    ? `${location.origin}/p?uri=${encodeURIComponent(p.postId)}&focus=${encodeURIComponent(p.id)}`
    : `${location.origin}/p?uri=${encodeURIComponent(p.id)}`;
  const first = [
    { label: 'Copy text', icon: '⧉', onSelect: () => copyText(p.body || p.title || '', 'Text') },
    { label: 'Copy link', icon: '🔗', onSelect: () => copyText(link, 'Link') },
    // v13 decision 28: the reader's own provider's app when the registry names one; bsky.app otherwise, and the item says so
    { label: `Open on ${app.host}`, icon: '↗', onSelect: () => window.open(`${app.url}/profile/${encodeURIComponent(p.author)}/post/${rkey}`, '_blank', 'noopener') },
  ];
  // board-cards decision 8: the guest's menu ends with the door, behind a rule
  if (!session) return [first, [{ label: 'Sign in to like, save and reply', icon: '\u2192', onSelect: () => openAuthSheet() }]];
  first.push({ label: p.saved ? 'Unsave' : 'Save', icon: '☆', onSelect: async () => {
    try { await lens.bookmark(p.id, p.cid, !p.saved); p.saved = !p.saved; toast(p.saved ? 'Saved.' : 'Removed from saved.', 'ok'); rerender(); }
    catch (e) { console.warn('forage: bookmark refused', e); toast(e.message, 'err'); }
  } });
  const rootUri = kind === 'comment' ? (p.postId || p.id) : p.id;
  const thread = [
    { label: p.threadMute ? 'Unmute thread' : 'Mute thread', icon: '🔕', onSelect: async () => {
      try { await lens.muteThread(rootUri, !p.threadMute); p.threadMute = !p.threadMute; toast(p.threadMute ? 'Thread muted — no notifications from it.' : 'Thread unmuted.', 'ok'); }
      catch (e) { console.warn('forage: mute thread refused', e); toast(e.message, 'err'); }
    } },
    { label: 'Mute words & tags', icon: '⛉', onSelect: () => muteWordSheet() },
  ];
  const hide = [{ label: 'Hide for me', icon: '⌀', onSelect: () => {
    lens.hide(p.id, true); persistHidden();
    const node = document.querySelector(`[data-node-id="${CSS.escape(p.id)}"]`);
    if (node) node.remove(); else rerender();
    toast('Hidden on this device. Your account page can unhide it.', 'ok');
  } }];
  const own = session && p.authorId === session.did;
  const posture = lens.posture();
  const muted = posture.mutedDids.has(p.authorId);
  const blockUri = posture.blockUriByDid.get(p.authorId);
  const account = own ? [] : [
    { label: muted ? 'Unmute account' : 'Mute account', icon: '🔇', onSelect: async () => {
      try { await lens.muteActor(p.authorId, !muted); await afterPostureWrite(muted ? `Unmuted @${p.author}.` : `Muted @${p.author}. Their posts disappear here and on Bluesky.`); }
      catch (e) { console.warn('forage: mute refused', e); toast(e.message, 'err'); }
    } },
    { label: blockUri ? 'Unblock account' : 'Block account', icon: '⛔', onSelect: async () => {
      try {
        if (blockUri) await lens.unblock(blockUri); else await lens.block(p.authorId);
        await afterPostureWrite(blockUri ? `Unblocked @${p.author}.` : `Blocked @${p.author}. Blocks are public on Bluesky — they can see it.`);
      } catch (e) { console.warn('forage: block refused', e); toast(e.message, 'err'); }
    } },
    { label: 'Report', icon: '⚑', danger: true, onSelect: () => reportSheet({
      what: kind === 'comment' ? 'this reply' : 'this post',
      reasons: [['spam', 'Spam'], ['rude', 'Harassment or rudeness'], ['misleading', 'Misleading'], ['sexual', 'Unwanted sexual content'], ['violation', 'Breaks Bluesky\u2019s rules'], ['other', 'Something else']],
      onSubmit: async ({ reason, detail }) => { await lens.report({ uri: p.id, cid: p.cid }, reason, detail); toast('Report sent to your moderation service.', 'ok'); },
    }) },
  ];
  return [first, thread, hide, account];
}

function lensNode(node, ctx) {
  return threadNodeStyle(node).walled ? quoteNode(node, ctx) : commentNode(node, ctx);
}

// 3e inbound: any post that IS a quote shows what it quotes, linked home.
//
// quote-embed (owner, 2026-09-01): the quoted post's MEDIA renders here too,
// through the same mediaNode every other surface uses — the report was a quote
// of a video whose card showed the words and no video, and a second renderer
// for quoted media is how the two would drift apart again. mediaNode reads
// exactly three things off a post, so the quoted card lends it three: its own
// media, and the author and uri its video fallback link is built from.
//
// A quote whose target is gone says so in words. It used to draw a card reading
// "❝ [unknown]" over nothing at all — on the post page one bad card, and
// in the feed row one on every such post.
const QUOTE_GONE_WORDS = {
  notFound: 'the quoted post has been deleted',
  blocked: 'the quoted post is from someone you have blocked, or who has blocked you',
  detached: 'its author detached the quoted post from this quote',
};
function quotedContext(quoted) {
  if (quoted.unavailable) {
    return el('div', { class: 'card quoted', style: 'margin-top:6px', 'data-quoted': quoted.unavailable },
      el('div', { class: 'xs muted' }, '❝ ', QUOTE_GONE_WORDS[quoted.unavailable] || 'the quoted post is unavailable'));
  }
  return el('div', { class: 'card quoted', style: 'margin-top:6px', 'data-quoted': '1' },
    // Named the way every OTHER byline in the app names people (owner,
    // 2026-09-01, on the v1 mock: "the name in the quote box … should be the
    // human readable alias name"): whoNode owns that rule — the chosen name,
    // the handle in the tooltip and the accessible name, the handle itself when
    // no name was chosen. Sending this card through the same function is what
    // stops it drifting from the row's byline a second time.
    //
    // The link goes to the author's board HERE rather than to their bsky.app
    // profile, which is where the post page's head byline already sends it. The
    // old outbound link was this card's own invention.
    el('div', { class: 'xs muted' }, '❝ quoting ',
      whoNode(quoted.author, quoted.authorName, '', `/u/${encodeURIComponent(quoted.author)}`)),
    quoted.excerpt ? el('div', { class: 'small' }, quoted.excerpt) : null,
    quoted.media ? mediaNode({ media: quoted.media, author: quoted.author, id: quoted.uri }) : null,
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
// feed-row v4 (owner, 2026-08-30): a reply is a PAGE (/reply — the post you
// are answering above the box, so you can read it) or, under a comment, a
// quick box — textarea, Send, Cancel, nothing else. Both keep what you typed
// as a draft in this browser (js/drafts.js), keyed by the post answered: Cancel
// keeps it, Send clears it, Discard throws it away. Text only in v4: the image
// strip composerCard carries is not on a reply box (recorded on the mock, O7).
// The image picker, shared by the composer and the reply page (feed-row v6;
// it closes O7). Alt text is REQUIRED — probe-verified, the server refuses a
// record whose image omits it — and a blank alt would pass the server while
// leaving the post unreadable to anyone using a screen reader, so Send stays
// disabled until every attached image is described. Files are held here and
// uploaded on Send, not on select: an unreferenced blob is garbage-collected
// within minutes, so uploading early risks it expiring mid-compose. `gif`
// adds a second door that takes a .gif from the device — GIF SEARCH (Tenor
// through a proxy, as bsky.app does) is an external API nobody here has
// verified, so it is the recorded follow-on, not a button that does nothing.
const ICON = {
  image: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  gif: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="700" font-family="system-ui,sans-serif" fill="currentColor" stroke="none">GIF</text></svg>',
  emoji: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/></svg>',
};
function imagePicker({ onChange, gif = false }) {
  const picked = [];
  const strip = el('div', { class: 'row wrap', style: 'gap:8px;margin-top:8px' });
  const input = (kind, accept) => {
    const i = el('input', { type: 'file', accept, multiple: true, style: 'display:none', 'data-image-input': kind });
    i.addEventListener('change', () => {
      for (const f of [...i.files]) {
        if (picked.length >= IMAGE_LIMITS.count) { toast(`A post holds ${IMAGE_LIMITS.count} images.`, 'err'); break; }
        if (f.size > IMAGE_LIMITS.bytes) { toast(`${f.name} is ${Math.round(f.size / 1000)}kB and the limit is ${IMAGE_LIMITS.bytes / 1000}kB.`, 'err'); continue; }
        const entry = { file: f, alt: '', url: URL.createObjectURL(f), aspectRatio: null };
        // the dimensions come free from the preview we are about to draw, and
        // sending them stops a viewer's feed jumping as the image loads
        const probe = new Image();
        probe.onload = () => { entry.aspectRatio = { width: probe.naturalWidth, height: probe.naturalHeight }; };
        probe.src = entry.url;
        picked.push(entry);
      }
      i.value = '';
      drawStrip(); onChange();
    });
    return i;
  };
  const imageInput = input('image', 'image/*');
  const gifInput = gif ? input('gif', 'image/gif') : null;
  const imageButton = el('button', { type: 'button', class: 'cbtn iconbtn', 'data-attach-image': '1', 'aria-label': 'Add image', title: 'Add image', html: ICON.image });
  imageButton.addEventListener('click', () => imageInput.click());
  const gifButton = gif ? el('button', { type: 'button', class: 'cbtn iconbtn', 'data-attach-gif': '1', 'aria-label': 'Add a GIF from your device', title: 'Add a GIF from your device', html: ICON.gif }) : null;
  gifButton?.addEventListener('click', () => gifInput.click());
  const drawStrip = () => {
    strip.replaceChildren(imageInput, gifInput, ...picked.map((p, i) => {
      // aria-label, not the placeholder alone: a placeholder is not a reliable
      // accessible name — it disappears the moment someone types
      const alt = el('input', { type: 'text', 'data-image-alt': String(i),
        'aria-label': `Alt text for image ${i + 1} of ${picked.length} (required)`,
        placeholder: 'Describe this image (required)', value: p.alt });
      alt.addEventListener('input', () => { p.alt = alt.value; onChange(); });
      const drop = el('button', { type: 'button', class: 'btn sm', 'data-image-remove': String(i), title: 'Remove this image' }, '×');
      drop.addEventListener('click', () => { URL.revokeObjectURL(p.url); picked.splice(i, 1); drawStrip(); onChange(); });
      return el('div', { class: 'card', style: 'padding:6px;min-width:180px;flex:1' },
        el('div', { class: 'row', style: 'gap:6px;align-items:center' }, el('img', { src: p.url, alt: '', class: 'thumb' }), drop),
        alt);
    }));
  };
  drawStrip();
  return { picked, strip, imageInput, imageButton, gifButton,
    undescribed: () => picked.some((p) => !p.alt.trim()),
    revoke: () => { for (const p of picked) URL.revokeObjectURL(p.url); } };
}

// The remaining-count ring (bsky.app's): the number, and a ring that fills as
// the 300 graphemes go; red past the limit.
function countRing() {
  const num = el('span', { class: 'n', 'data-count': '1' }, String(POST_LIMITS.graphemes));
  const R = 8, C = 2 * Math.PI * R;
  const ring = el('span', { class: 'count-ring', 'data-count-ring': '1', 'aria-hidden': 'true',
    html: `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="2"/><circle class="arc" cx="10" cy="10" r="${R}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 10 10)"/></svg>` });
  const arc = ring.querySelector('.arc');
  const node = el('span', { class: 'count', 'data-remaining': '1', role: 'status' }, num, ring);
  return { node, paint(left) {
    const used = Math.min(1, Math.max(0, (POST_LIMITS.graphemes - left) / POST_LIMITS.graphemes));
    arc.setAttribute('stroke-dashoffset', String(C * (1 - used)));
    num.textContent = String(left);
    node.classList.toggle('over', left < 0);
    node.setAttribute('aria-label', left >= 0 ? `${left} characters left` : `${-left} characters over`);
  } };
}

// A small emoji palette (feed-row v6): a button, a grid of common emoji, and
// an insert at the caret. Hermetic — no picker library, no network.
const EMOJI = ['😀', '😂', '🥲', '😍', '🤔', '😮', '😢', '😡', '🙏', '👍', '👎', '👏', '🙌', '❤️', '💔', '🔥', '✨', '🎉', '💯', '👀', '🌱', '🌿', '🍄', '🌻', '🐸', '🐦', '🥧', '☕', '🍞', '🧀', '📚', '🎵', '🚲', '🏕️', '🌧️', '☀️', '⭐', '✅', '❓', '‼️'];
function emojiButton(textarea, onInsert) {
  const palette = el('div', { class: 'emoji-palette', 'data-emoji-palette': '1', role: 'group', 'aria-label': 'Emoji', hidden: '' },
    ...EMOJI.map((e) => { const b = el('button', { type: 'button', class: 'emoji', 'aria-label': e }, e); b.addEventListener('click', () => {
      const s = textarea.selectionStart ?? textarea.value.length, t = textarea.selectionEnd ?? s;
      textarea.value = textarea.value.slice(0, s) + e + textarea.value.slice(t);
      textarea.selectionStart = textarea.selectionEnd = s + e.length;
      palette.hidden = true; btn.setAttribute('aria-expanded', 'false'); textarea.focus(); onInsert();
    }); return b; }));
  const btn = el('button', { type: 'button', class: 'cbtn iconbtn', 'data-emoji': '1', 'aria-label': 'Add emoji', title: 'Add emoji', 'aria-expanded': 'false', html: ICON.emoji });
  btn.addEventListener('click', () => { palette.hidden = !palette.hidden; btn.setAttribute('aria-expanded', String(!palette.hidden)); });
  return { btn, palette };
}

const replyPath = (parentUri, rootUri, fromSlug) =>
  `/reply?uri=${encodeURIComponent(parentUri)}&root=${encodeURIComponent(rootUri)}${fromSlug ? `&from=${encodeURIComponent(fromSlug)}` : ''}`;

function replyBox({ parentUri, replyTo, onDone, onCancel, quick = false, autofocus = false }) {
  const stored = drafts.load(parentUri);
  const box = el('textarea', { rows: quick ? '3' : '6', 'data-composer-text': '1', placeholder: 'Write your reply…', 'aria-label': 'Your reply' });
  if (stored) box.value = stored.text;
  const count = countRing();
  const status = el('span', { class: 'xs muted', 'data-draft-status': '1' });
  const discard = el('button', { type: 'button', class: 'linkish xs', 'data-draft-discard': '1' }, 'Discard draft');
  const send = el('button', { type: 'button', class: 'btn sm primary', 'data-send': '1' }, 'Send');
  const cancel = el('button', { type: 'button', class: 'btn sm', 'data-cancel': '1' }, 'Cancel');
  // the page's box carries the tools (image · GIF · emoji, bottom-left, bsky's
  // row — owner 2026-08-30); the quick box stays a text box with its count
  const pics = quick ? null : imagePicker({ onChange: () => sync(), gif: true });
  const emoji = quick ? null : emojiButton(box, () => sync());
  const paintDraft = (d) => {
    status.textContent = d ? `Draft saved in this browser · ${new Date(d.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
    discard.hidden = !d;
  };
  paintDraft(stored);
  let timer = null;
  const sync = () => {
    const left = POST_LIMITS.graphemes - graphemes(box.value.trim());
    count.paint(left);
    const hasContent = box.value.trim() || pics?.picked.length;
    const undescribed = pics?.undescribed() ?? false;
    send.disabled = left < 0 || !hasContent || undescribed;
    send.title = undescribed ? 'Every image needs alt text before this can be sent' : '';
  };
  box.addEventListener('input', () => { sync(); clearTimeout(timer); timer = setTimeout(() => paintDraft(drafts.save(parentUri, box.value)), 400); });
  sync();
  discard.addEventListener('click', () => { clearTimeout(timer); drafts.clear(parentUri); box.value = ''; sync(); paintDraft(null); box.focus(); });
  cancel.addEventListener('click', () => { clearTimeout(timer); if (box.value.trim()) drafts.save(parentUri, box.value); pics?.revoke(); onCancel?.(); });
  send.addEventListener('click', async () => {
    send.disabled = true; clearTimeout(timer);
    try {
      // upload NOW, adjacent to the post — an unreferenced blob expires within minutes
      const images = [];
      for (const pc of pics?.picked ?? []) {
        send.replaceChildren(`Uploading ${images.length + 1}/${pics.picked.length}…`);
        images.push({ blob: await lens.uploadImage(pc.file), alt: pc.alt.trim(), aspectRatio: pc.aspectRatio });
      }
      send.replaceChildren('Send');
      await lens.publish({ text: box.value, replyTo, images, langs: lang.active().slice(0, 1),
        navLang: typeof navigator !== 'undefined' ? navigator.language : null });
      pics?.revoke();
      drafts.clear(parentUri);
      toast('Reply sent — it is on your Bluesky account too.', 'ok');
      onDone?.();
    } catch (e) { toast('Reply failed: ' + e.message, 'err'); send.disabled = false; }
  });
  const tools = quick ? null : el('div', { class: 'reply-tools' }, pics.imageButton, pics.gifButton, emoji.btn);
  const card = el('div', { class: 'card reply-box' + (quick ? ' quick' : ''), 'data-composer': '1', ...(quick ? { 'data-quick': '1' } : {}) },
    quick ? null : el('div', { class: 'row spread', style: 'align-items:center;margin-bottom:6px' }, cancel, send),
    box,
    pics?.strip ?? null,
    emoji?.palette ?? null,
    quick
      ? el('div', { class: 'row spread wrap', style: 'gap:8px;align-items:center;margin-top:6px' },
        el('div', { class: 'row wrap', style: 'gap:8px;align-items:center' }, status, discard),
        el('div', { class: 'row', style: 'gap:8px;align-items:center' }, count.node, cancel, send))
      : el('div', { class: 'reply-bar' },
        tools,
        el('div', { class: 'reply-bar-right' }, status, discard, count.node)));
  if (autofocus) queueMicrotask(() => box.focus());
  return card;
}

// /reply?uri=<parent>&root=<root>[&from=<slug>] — the post (or comment) you
// are answering, then the box. Sent or cancelled, you land back on the thread.
export function lensReplyView(params, query) {
  const parentUri = query.uri ? decodeURIComponent(query.uri) : null;
  const rootUri = query.root ? decodeURIComponent(query.root) : parentUri;
  if (!parentUri) return { main: emptyState('Nothing to reply to', 'Missing post uri.'), side: null };
  const threadHref = `/p?uri=${encodeURIComponent(rootUri)}${parentUri !== rootUri ? `&focus=${encodeURIComponent(parentUri)}` : ''}`;
  const gate = sessionGate('reply');
  if (gate) return { main: emptyState('Sign in to reply', gate, el('a', { class: 'btn', href: threadHref }, 'Back to the thread')), side: null };
  const from = sources.get(query.from);
  const src = from ? { feedId: `lens:${from.slug}`, feedSlug: from.slug, feedTitle: from.title }
                   : { feedId: 'lens:thread', feedSlug: 'thread', feedTitle: 'Thread' };
  const main = el('div', {}, skeleton(4));
  Promise.all([lens.thread(parentUri, src), parentUri === rootUri ? null : lens.thread(rootUri, src)])
    .then(([t, rt]) => {
      const p = t.post; const rootPost = rt ? rt.post : p;
      const replyTo = { root: { uri: rootPost.id, cid: rootPost.cid }, parent: { uri: p.id, cid: p.cid } };
      const pr = providerMark.enabled() ? providerMark.providerOf(p.author) : null;
      const target = el('div', { class: 'card reply-target', 'data-reply-target': p.id },
        el('div', { class: 'xs muted', style: 'margin-bottom:6px' }, p.id === rootUri ? 'Replying to the post' : 'Replying to this comment'),
        byline({ name: p.author, ts: p.createdTs, avatar: p.avatar || null,
          whoNode: p.author ? whoNode(p.author, p.authorName, verifiedBadge(p)) : el('span', { class: 'who muted' }, '[removed]'),
          mark: pr ? providerMarkNode(pr, providerMark.markLabel(pr, p.author)) : null,
          menu: () => lensMenuGroups(p, { kind: 'post' }) }),
        facetedBody(p),
        p.media && !p.maskedRemoved ? mediaNode(p) : null);
      main.replaceChildren(
        el('div', { class: 'row wrap', style: 'gap:6px;margin-bottom:8px' },
          el('a', { href: threadHref, class: 'xs' }, `f/${src.feedSlug}`), el('span', { class: 'xs muted' }, '› Reply')),
        target,
        replyBox({ parentUri: p.id, replyTo, autofocus: true, onDone: () => go(threadHref), onCancel: () => go(threadHref) }));
    })
    .catch((e) => main.replaceChildren(emptyState('Could not load the post', e.message, el('a', { class: 'btn', href: threadHref }, 'Back to the thread'))));
  return { main, side: el('div', { class: 'side' }, ...lensRail()) };
}

function composerCard({ tag, replyTo, onDone }) {
  const box = el('textarea', { rows: '3', 'data-composer-text': '1',
    placeholder: tag ? `Post to #${tag}…` : 'Write a reply…' });
  const remaining = el('span', { class: 'xs muted', 'data-remaining': '1' });
  const note = el('span', { class: 'xs muted' },
    tag ? `#${tag} is added for you if you don’t write it.` : '');
  const send = el('button', { class: 'btn sm primary' }, replyTo ? 'Reply' : 'Post');
  const cancel = el('button', { class: 'btn sm' }, 'Cancel');
  // Phase 3: images — the picker is shared with the reply box (feed-row v6);
  // alt text is REQUIRED and Post stays disabled until every image has it
  const pics = imagePicker({ onChange: () => sync() });
  const picked = pics.picked, strip = pics.strip, filePicker = pics.imageInput, attach = pics.imageButton;

  const card = el('div', { class: 'card', 'data-composer': '1', style: 'margin-top:8px' },
    box,
    strip,
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
// feed-row v7 (owner, 2026-08-31): Follow lives on the profile page. Signed
// out it is the door to sign-in (board-cards decision 1's shape); your own page
// has none. Optimistic like the like; a refusal reverts and says so.
function followButton(p) {
  if (session && p.did === session.did) return null;
  let uri = p.followingUri || null;
  const btn = el('button', { type: 'button', class: 'btn sm' + (uri ? '' : ' primary'), 'data-follow': '1', 'aria-pressed': String(!!uri),
    ...(session ? {} : { 'data-guest': '1', title: 'Sign in to follow' }) }, uri ? 'Following' : 'Follow');
  const paint = () => { btn.textContent = uri ? 'Following' : 'Follow'; btn.setAttribute('aria-pressed', String(!!uri)); btn.classList.toggle('primary', !uri); };
  btn.addEventListener('click', async () => {
    if (!session) return openAuthSheet();
    const had = uri; uri = had ? null : 'pending'; paint(); btn.disabled = true;
    try {
      if (had) { await lens.unfollow(had); uri = null; }
      else { uri = (await lens.follow(p.did)).followUri; }
    } catch (e) { uri = had; toast((had ? 'Unfollow' : 'Follow') + ' failed: ' + e.message, 'err'); }
    paint(); btn.disabled = false;
  });
  return btn;
}

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
    session = null; lens = createLens({ hiddenUris }); savedFeedUris.clear(); pinnedFeedUris.clear(); savedFeedsPromise = null;
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
      // A profile board is ONE page and has no More: its window is neither a
      // server query nor a walk, it is the loaded posts. All five rungs stay,
      // because on a quiet account one page of 30 spans years and each of them
      // filters it differently — the case that is degenerate on a fast feed is
      // the live one here. What it cannot do is widen, and the board says so.
      main.replaceChildren(profileHeader(p, followButton(p)), boardToolbar(repaint),
        board.posts.length ? card : emptyState('No posts', 'Nothing here yet.'));
      repaint();
    })
    .catch((e) => main.replaceChildren(emptyState('Profile fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, ...lensRail()) };
}

// 3j/3p: the feed's ONE box. It used to be two — this card and a separate
// affordance strip — which restated the <h1>'s title and then the description
// twice (observed 2026-08-26). Now: logo, who curates it, likes, Join/Leave on
// the same line, and the feed's own description QUOTED beneath, because that
// prose is the only inclusion rule that exists (DL-025). feedCardModel decides
// what belongs; this function only draws it.
function feedHeaderCard(info, onChange) {
  const m = feedCardModel(info, { signedIn: !!session });
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

  // feed-row v7 (owner, 2026-08-31): ONE line — the likes, then the curator as
  // a link OUT to bsky.app (their profile lives there, not here) — the
  // description quoted under it, and the card outlined so the feed's own box
  // reads apart from the rows
  // v11 (owner, 2026-09-01): the curator READS as a name — "Curated by Bluesky"
  // — and the handle it is really made of stays in the hover and the href. An
  // account with no display name has only its handle, and that is what shows.
  const curatorLabel = m.creatorName || (m.creator ? `@${m.creator}` : '@unknown');
  const curatorTitle = m.creator
    ? `@${m.creator} — their profile, on bsky.app`
    : 'This feed’s creator could not be resolved';
  // v11 (owner: "should be right aligned inside the feed information box"): v8
  // right-aligned it inside the TEXT BLOCK, which shrink-wraps its content, so
  // on a wide card the curator stopped a long way short of the box's edge and
  // the alignment was invisible. `flex:1` on the group and on the block is what
  // makes the line as wide as the card, which is what "inside the box" meant.
  return el('div', { class: 'card highlight', 'data-feed-header': '1', 'data-affordance': 'curated' },
    el('div', { class: 'row spread wrap', style: 'gap:10px;align-items:center' },
      el('div', { class: 'row', style: 'gap:10px;align-items:center;min-width:0;flex:1' },
        m.avatar ? el('img', { src: m.avatar, alt: '', class: 'feed-avatar', loading: 'lazy' }) : null,
        el('div', { style: 'min-width:0;flex:1' },
          // v8 (owner): likes at the left, the curator right-aligned on the same line
          el('div', { class: 'small feed-line', 'data-feed-line': '1' },
            el('strong', { 'data-feed-likes': '1' }, `${fmtScore(m.likeCount)} likes`),
            el('span', { 'data-feed-curator': '1' }, 'Curated by ',
              m.creator
                ? el('a', { href: m.creatorUrl, target: '_blank', rel: 'noopener noreferrer', title: curatorTitle }, curatorLabel)
                : curatorLabel)),
          adoption)),
      // A guest manages nothing here — the header reads as a thing you are
      // looking at rather than one you own. Absent, not disabled (owner).
      // v11: absent means the GROUP too. An empty flex item is zero-wide but
      // still costs the row's 10px gap, and that gap was the whole reason the
      // curator stopped 11px short of the card's edge once the line was made
      // full-width — a nothing that was still taking up space.
      session ? el('div', { class: 'row', style: 'gap:6px;align-items:center' }, star, btn) : null),
    // v11: no blurb at all for a guest on a feed whose description addresses an
    // account it does not have (GUEST_BLIND_BLURBS) — an absent line, not an
    // empty one, so nothing is left behind where the quote was.
    m.blurb
      ? el('div', { class: 'feed-blurb' + (m.blurbIsOwnWords ? '' : ' muted'), 'data-feed-blurb': m.blurbIsOwnWords ? 'feed' : 'ours' },
        m.blurb)
      : null,
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
let trendMode = 'list';   // the LIST is the default: it is the one with numbers
let seenFilter = '';
let seenShowAll = false;
const SEEN_PAGE = 12;

// One view, two shapes. `/hashtags` is three SLICES; `/hashtags/:section` is
// one of them at full depth. Same code builds both, because a full page that
// drifted from its slice would be two answers to one question — and the slice
// is the one people see first, so the drift would be invisible.
export function lensHashtagsView(params = {}) {
  const section = SECTION_IDS.includes(params.section) ? params.section : null;
  const full = (id) => section === id;
  const subCount = effectiveTags(session?.did).length;
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
    const shown = (seenShowAll || full('loaded')) ? matching : matching.slice(0, SEEN_PAGE);
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

  // The cloud is a REPRESENTATION of the list, never a replacement for it. The
  // list is the default and the one with the numbers in it; the toggle is one
  // click away in both directions. Sizes are bounded (js/tag-stats.js) so the
  // rarest tag is still readable — a cloud whose small end is unreadable has
  // hidden its own data behind a decoration.
  const cloud = (tags) => {
    const box = el('div', { class: 'tagcloud', 'data-tagcloud': '1' });
    for (const t of cloudSizes(tags)) {
      box.append(el('a', {
        href: `/h/${encodeURIComponent(t.tag)}`, 'data-browse-tag': t.tag,
        // The accessible name carries the COUNT, because for a screen reader
        // the font size — the only place the count is shown here — does not
        // exist. Same information, both ways of reading.
        'aria-label': `#${t.tag}, ${plural(t.count, 'post')}`,
        style: `font-size:${t.size}px`,
      }, `#${t.tag}`));
    }
    return box;
  };
  const modeBar = (id, current, onPick) => {
    const bar = el('div', { class: 'row wrap', style: 'gap:6px', 'data-view-mode': id });
    for (const [mode, label] of [['list', 'List'], ['cloud', 'Cloud']]) {
      const b = el('button', { class: 'btn sm' + (current === mode ? ' primary' : ''),
        'data-mode': mode, 'aria-pressed': String(current === mode) }, label);
      b.addEventListener('click', () => { onPick(mode); rerender(); });
      bar.append(b);
    }
    return bar;
  };

  // ---- trending: derived, cached, and honest about its sample ----
  const trendList = el('div', {}, skeleton(3));
  const trendNote = el('div', { class: 'xs muted', style: 'margin-top:6px' });
  const INTERVALS = [[15 * 60 * 1000, 'every 15 minutes'], [DEFAULT_TTL_MS, 'hourly'],
    [6 * 60 * 60 * 1000, 'every 6 hours'], [24 * 60 * 60 * 1000, 'daily']];
  const ttlSel = el('select', { class: 'form', 'data-trend-ttl': '1', 'aria-label': 'How often to refresh trending' },
    ...INTERVALS.map(([ms, label]) => el('option', { value: String(ms), selected: trendingTtl() === ms || false }, label)));
  ttlSel.addEventListener('change', () => { setTrendingTtl(Number(ttlSel.value)); rerender(); });

  trendingTags(lens).then((t) => {
    const slice = full('trending') ? t.tags : t.tags.slice(0, SEEN_PAGE);
    trendList.replaceChildren(t.tags.length
      ? (trendMode === 'cloud' ? cloud(slice) : rows(slice, (n) => `${plural(n, 'post')} in the sample`))
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
      modeBar('trending', trendMode, (m) => { trendMode = m; }),
      el('span', { class: 'xs muted' }, 'Refresh'), ttlSel),
    trendList, trendNote);

  const input = el('input', { type: 'text', class: 'form', placeholder: 'Find a hashtag…', 'data-tag-search': '1', 'aria-label': 'Search hashtags' });
  const out = el('div', {});
  const go = () => {
    const q = input.value.trim();
    if (!q) return;
    if (!session) { out.replaceChildren(el('div', { class: 'xs muted' }, 'Search needs a session — Bluesky returns 403 to guests (DL-014).')); return; }
    out.replaceChildren(skeleton(3));
    lens.search(q, { limit: full('search') ? 100 : 30 }).then((board) => {
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
  // The way into a section's own page, and back out of it. Present on a slice,
  // absent on the page it leads to — a "see all" on the page that already
  // shows all is a link to where you are.
  const seeAll = (id, label) => full(id) || section
    ? null
    : el('div', { style: 'margin-top:8px' },
        el('a', { class: 'small', href: `/hashtags/${id}`, 'data-see-all': id }, `${label} →`));
  searchCard.append(seeAll('search', 'Search on its own page') || '');
  trendCard.append(seeAll('trending', 'All trending tags') || '');
  seenCard.append(seeAll('loaded', 'Every hashtag you have loaded') || '');

  const cards = { search: searchCard, trending: trendCard, loaded: seenCard };
  // A section's own page shows that section WHETHER OR NOT it is switched on in
  // Advanced: you got here by asking for it by name, and refusing a direct
  // request because of a display preference would be the setting overreaching.
  if (section) {
    return { main: el('div', {},
      el('div', { class: 'row', style: 'gap:8px;align-items:center;margin-bottom:4px' },
        el('a', { class: 'small', href: '/hashtags', 'data-back-to-hashtags': '1' }, '← Hashtags')),
      el('h1', {}, sectionLabel(section)), cards[section]), side: null };
  }
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

    // 4d: checked by default (search since 4d — a third of results were dead or
    // stale; the popular list since v11 decision 26) and a real control, not a
    // hidden behaviour.
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
        // feed-row v11 decision 26 (owner, 2026-08-30: "make the hide inactive on
        // browse all feeds the default"): ON for the popular list too — that day
        // 46 of its 111 were stale, empty or silent (30 / 3 / 13). It was on
        // for search only (4d); the line still says how many went, and the box
        // still turns it off.
        hideDead = true;
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
    side: el('div', { class: 'side' }, ...lensRail()),
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
    // P5: "subscribed" now has two homes, and the button must not care. A tag
    // published from another device is genuinely subscribed here, so offering
    // to Join it again would be a lie the reader can see.
    const on = isEffectivelySubscribed(session?.did, tag);
    const b = el('button', { class: 'btn sm' + (on ? '' : ' primary'), 'data-tagsub': tag,
      'aria-pressed': String(on),
      title: on ? `Leave #${tag} — it stops appearing in your boards` : `Join #${tag} — it joins your boards and World` },
      on ? 'Leave' : 'Join');
    b.addEventListener('click', async () => {
      // Joining is always LOCAL first: local is a destination, not a waiting
      // room, and the reader chooses publicity separately on their account page.
      if (!isEffectivelySubscribed(session?.did, tag)) { subscribeTag(tag); rerender(); return; }
      b.disabled = true;
      try { await unsubscribeEverywhere(lens, session?.did, tag); }
      catch (e) { b.disabled = false; toast(e.message, 'err'); return; }
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
      side: el('div', { class: 'side' }, ...lensRail()) };
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
            // the one board with a REAL window: searchPosts takes since/until
            // server-side, so all five rungs are five different queries over
            // the whole corpus rather than five names for one page (4e)
            boardToolbar(() => load(false), { timeframes: TIMEFRAMES }),
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
  return { main, side: el('div', { class: 'side' }, ...lensRail()) };
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
// The choice list lives in js/lang.js, which seeds the browser default from
// it (2026-08-30) — the panel and the seed must agree on what can be shown.
const LANG_CHOICES = lang.LANG_CHOICES;

function languagePanel(onChange) {
  const current = new Set(lang.active());
  const chosen = lang.stored() !== null;
  const label = (code) => LANG_CHOICES.find(([c]) => c === code)?.[1] ?? code;
  const seed = lang.browserDefault();
  const defaultNote = chosen ? null
    : seed.length
      ? `Until you choose, this follows your browser's languages — right now ${seed.map(label).join(', ')}. Ticking or clearing a box makes it your choice.`
      : 'Your browser asks for languages Forage cannot list, so nothing is filtered until you choose.';
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
    defaultNote ? el('p', { class: 'xs muted', 'data-lang-default': '1', style: 'margin:0 0 8px' }, defaultNote) : null,
    clearBtn);
}


// P5: hashtag subscriptions, and the choice of where each one lives.
//
// The owner's reading (2026-08-29) reframed what local storage IS here: "I'm
// actually starting to think this local prefs thing is a nice privacy option to
// have." Local is a DESTINATION. It offers something a repo structurally cannot
// — nobody can see what you follow — and this box is where a reader trades that
// away deliberately, one tag at a time, rather than by signing in.
//
// So the publicness is stated ONCE, in words, right where the decision is made.
// "PDS Save" does not carry "public" on its own; the line under the heading is
// the difference between a feature and a leak.
function hashtagSubsPanel() {
  const did = session?.did || null;
  const host = el('div', { class: 'card', 'data-tagsub-panel': '1' });

  const paint = ({ records = [], stale = false, fetchedAt = null, loading = false } = {}) => {
    const local = tagSubs().map((r) => ({ tag: r.tag, where: 'local' }));
    const pub = records.map((r) => ({ tag: r.tag, where: 'pds' }));
    const rows = [...local, ...pub].sort((a, b) => a.tag.localeCompare(b.tag));

    // Writes are OFF while the published set is stale. A cache is a display
    // fallback; aiming a create or a delete at an account Forage cannot
    // currently read is exactly the thing the plan refused to paper over.
    const frozen = !!did && (stale || loading);

    const act = async (fn, btn) => {
      btn.disabled = true;
      try { const res = await fn(); paint({ ...res, loading: false }); }
      catch (e) { btn.disabled = false; toast(e.message, 'err'); }
    };

    const rowNode = ({ tag, where }) => {
      const published = where === 'pds';
      const btn = el('button', { class: 'btn sm', 'data-pds': published ? 'remove' : 'save', 'data-tag': tag },
        published ? 'Remove from PDS' : 'PDS Save');
      if (!did) {
        btn.disabled = true;
        btn.title = 'Saving a hashtag to your account needs a session — sign in first. Joining hashtags works without one.';
      } else if (frozen) {
        btn.disabled = true;
        btn.title = "Forage can't reach your account right now.";
      } else {
        btn.addEventListener('click', () => act(
          () => (published ? unpublishTag(lens, did, tag) : publishTag(lens, did, tag)), btn));
      }
      return el('div', { class: 'row spread', 'data-tagsub-row': tag,
        style: 'align-items:center;gap:8px;padding:4px 0' },
        el('div', { class: 'row', style: 'gap:8px;align-items:center' },
          el('a', { href: `/h/${encodeURIComponent(tag)}` }, `#${tag}`),
          el('span', { class: 'chip', 'data-where': where },
            published ? 'Saved to PDS' : 'Local only')),
        btn);
    };

    // replaceChildren is not el(): it stringifies a null child into the text
    // "null" rather than dropping it. Filter before handing it the list.
    host.replaceChildren(...[
      el('h2', { style: 'margin:0 0 4px' }, 'Hashtag subscriptions'),
      // The one sentence this whole section exists to make sure nobody misses.
      el('p', { class: 'xs muted', style: 'margin:0 0 8px' },
        'PDS-saved tags are visible to anyone, like your follows, and every Forage client you sign into sees them. '
        + 'Tags kept local stay on this device and never leave it.'),
      loading ? el('div', { class: 'xs muted' }, 'Reading your account\u2026') : null,
      stale && did && !loading
        ? el('div', { class: 'xs muted', 'data-tagsub-stale': '1', style: 'margin-bottom:6px' },
            fetchedAt
              ? `Showing the last set Forage read from your account, ${timeAgo(Date.parse(fetchedAt))} ago. Saving and removing are off until it can reach your account again.`
              : "Forage hasn't been able to read your account, so only this device's tags are listed. Saving and removing are off until it can.")
        : null,
      rows.length
        ? el('div', { class: 'stack' }, ...rows.map(rowNode))
        : el('div', { class: 'xs muted', style: 'padding:6px 0' },
            'No hashtag subscriptions yet. Join one from Browse hashtags and it shows up here.'),
      !did ? el('div', { class: 'xs muted', style: 'margin-top:6px' },
        'Joining hashtags works signed out — it is device storage and asks nothing of the network. Signing in adds the option to save one to your account.') : null,
    ].filter(Boolean));
  };

  const cache = cachedPublished(did);
  // A first-ever load with a session has no cache, so it says it is reading
  // rather than flashing an empty list and then a stale warning.
  paint(did && !cache.fetchedAt ? { loading: true } : { records: cache.records, stale: !!did, fetchedAt: cache.fetchedAt });
  if (did) refreshPublished(lens, did).then((r) => { if (session) paint(r); });
  return host;
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
    // gif-embeds phase 4 (owner, 2026-09-02): show or hide alt text, hidden by
    // default. Advanced because most readers should never need it — the same
    // reason Browse Hashtags is here. D7: this prints a caption; the alt on the
    // picture itself is written either way, so a screen reader is unaffected in
    // both states.
    const altBox = el('input', { type: 'checkbox', id: 'pref-alttext', 'data-alttext': '1',
      checked: altText.shown() || false });
    altBox.addEventListener('change', () => { altText.set(altBox.checked); rerenderNow(); });
    return el('details', { class: 'card', 'data-advanced': '1' },
      el('summary', { style: 'cursor:pointer;min-height:44px;display:flex;align-items:center' }, 'Advanced'),
      el('div', { style: 'margin-top:8px' },
        el('h3', { style: 'font-size:var(--t-md);margin:0 0 4px' }, 'Alt text'),
        el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
          'Alt text is the description an author writes for people who cannot see a picture. Off, it stays where screen readers read it. On, it is printed under the picture too — including on GIFs, where Bluesky often fills it in with the GIF’s own title.'),
        el('label', { class: 'seccheck', for: 'pref-alttext' }, altBox, el('span', {}, 'Show alt text under pictures')),
        el('h3', { style: 'font-size:var(--t-md);margin:12px 0 4px' }, 'Browse Hashtags'),
        el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
          'Which sections appear on the Hashtags page. Unchecking all of them leaves it empty, which is allowed.'),
        box));
  };
  const prefs = () => el('div', { 'data-prefs': '1' }, settingsView().main, advanced());
  if (!session) {
    return { main: el('div', {}, el('h1', {}, 'Your account'),
      el('p', { class: 'muted small' }, 'Sign in and this page carries your session and your moderation mirror.'),
      sessionCard(), hashtagSubsPanel(), prefs()), side: null };
  }
  // capture the handle NOW: an in-flight profile fetch must not read a
  // session that sign-out has since cleared (the journey caught this).
  const handle = session.handle;
  const main = el('div', {}, skeleton(3), accountMenu(), languagePanel(), hashtagSubsPanel(), moderationPanel(), prefs());
  lens.profile(handle)
    .then((p) => { if (session) main.replaceChildren(profileHeader(p), accountMenu(), languagePanel(), hashtagSubsPanel(), moderationPanel(), prefs()); })
    .catch(() => { if (session) main.replaceChildren(el('h1', {}, `@${handle}`), accountMenu(), languagePanel(), hashtagSubsPanel(), moderationPanel(), prefs()); });
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
    // feed-row v4: Reply is a link to the /reply page (owner: "put reply on the
    // right side"); the inline head composer is gone — the page shows the post
    // above the box instead. v11 decision 23 moved it off the like's row to the
    // bottom of the head.
    const replyLink = el('a', { class: 'btn sm primary reply-right', 'data-reply-open': '1',
      href: replyPath(p.id, p.id, src.feedSlug === 'thread' ? null : src.feedSlug) }, 'Reply');
    // feed-row v6 (owner, 2026-08-30: "move the name here to the human display
    // name in the top left and put the f/threads content on the top right"):
    // the head opens like a row — avatar · chosen name · mark · time on the
    // left, the board's breadcrumb (and NSFW) at the right end of that line,
    // then the text, then the like row (count of replies · Reply)
    const headProvider = providerMark.enabled() ? providerMark.providerOf(p.author) : null;
    const head = el('div', { class: 'card', style: 'display:flex;gap:10px' },
      el('div', { style: 'flex:1;min-width:0' },
      el('div', { class: 'head-byline' },
        byline({ name: p.author, ts: p.createdTs, avatar: p.avatar || null,
          whoNode: p.author ? whoNode(p.author, p.authorName, verifiedBadge(p), `/u/${encodeURIComponent(p.author)}`) : el('span', { class: 'who muted' }, '[removed]'),
          mark: headProvider ? providerMarkNode(headProvider, providerMark.markLabel(headProvider, p.author)) : null,
          after: [
            el('a', { href: `/f/${src.feedSlug}`, class: 'xs head-crumb' }, `f/${src.feedSlug}`),
            p.nsfw ? el('span', { class: 'chip badge-nsfw' }, 'NSFW') : null,
          ],
          menu: () => lensMenuGroups(p, { kind: 'post' }) })),
      // The placeholder heading ('[image]', '[video]') drops when the media
      // renders below — the picture is the thing the heading stood in for.
      // A real title (text or alt-derived) keeps its heading above the media.
      // feed-row v1: a post's text at the head is text — one step up from the
      // body, body face and weight — not a 26px serif heading (the owner's
      // phone, 2026-08-30: a four-line post filled the screen above its
      // picture). A link post's headline keeps the heading.
      // post-text (2026-09-01, the owner's forage.fyi/bsky.app comparison): the
      // head shows the post's own WORDS — faceted like the row, with the line
      // structure the author wrote. Three things were wrong here at once:
      //   - `format === 'link'` withheld `posttext`, so a Bluesky news post's
      //     280 characters rendered as a 26px serif headline. That exemption was
      //     written for a link post with a REAL title; a Bluesky external-embed
      //     post has none — `title` IS the body (shapeLensPost), so on this
      //     surface the exemption fired on every news post and never correctly
      //   - it rendered `p.title` as one raw string, so the head was the only
      //     surface with no facets: links, #tags and @mentions were dead text
      //   - it dropped every \n: 30% of live posts carry line structure
      // `pre-wrap` on .posttext keeps the breaks; the h1 stays valid because
      // facetNodes returns phrasing content only (text and anchors).
      p.placeholderTitle && p.media ? null : el('h1', { class: 'posttext' }, ...headWords(p)),
      // The post's own media, at full board size — until 2026-08-28 an image
      // post's thread page rendered no image at all.
      p.media && !p.maskedRemoved ? mediaNode(p) : null,
      // 3i: the poster's own 1/3-2/3-3/3 chain reads as the post body
      // post-text: the third copy of the segment mapping, collapsed onto
      // facetNodes; `posttext` gives the continuation its line structure too
      // 2026-09-02: and whatever the part CARRIED. A hoisted part is the post's
      // body, so it renders like one — words, then its picture / clip / link
      // card / GIF, then what it quotes. Before this the shape had no media at
      // all and an author answering their own post with a picture had it
      // silently dropped (found while building gif-embeds).
      ...(t.selfThread || []).flatMap((part) => [
        el('div', { class: 'small posttext', style: 'margin-top:8px' }, ...facetNodes(part.text, part.facets)),
        part.media ? mediaNode(part) : null,
        part.quoted ? quotedContext(part.quoted) : null,
      ].filter(Boolean)),
      p.quoted ? quotedContext(p.quoted) : null,
      t.quotesFailed ? el('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
        chip(`${t.quoteCount} quote${t.quoteCount === 1 ? '' : 's'} — couldn't fetch`, 'getQuotes failed; replies still render. Reload to retry.')) : null,
      // post-text v2, decision 7 (owner, on the v1 frames: "can we move the reply
      // count, repost count and upvote count down to the line where the reply
      // button is now?"). The counts used to have a row of their own directly
      // under the words, which put a rule of numbers between the post and the
      // card it is about — the v1 frames made that obvious once the words above
      // it stopped being a headline. They join Reply instead, so the head reads
      // words → what the post is about → what people did about it, and every
      // control that answers the post is on one line. (This supersedes feed-row
      // v11 decision 23, which moved Reply down here alone and left them behind.)
      el('div', { class: 'actions head-actions' },
        el('div', { class: 'postmeta' }, plural(p.commentCount, 'reply', 'replies')), // the author and the time moved up into the byline (v6)
        repostControl(p), // v12 decision 25: ⟳ on the head too
        vote('post', p.id, p, !!session, { onVote: lensVote(p), onGuest: session ? null : openAuthSheet }), // Phase 6c: the head's pill
        replyLink),
      // phase 2: only ever rendered for a post that is genuinely yours
      deleteControl(p, () => {
        main.replaceChildren(emptyState('This post was deleted',
          'It is gone from your Bluesky account. Anyone who already saw it may still have a copy — deleting removes the record, it does not un-send it.',
          el('a', { class: 'btn', href: `/f/${src.feedSlug}` }, 'Back to the board')));
      })));
    const ctx = { ...LENS_PERMS,
      // post-text: a reply's words, faceted — its links, #tags and @mentions are
      // as live as the head's. The node shape carries `facets` as of this change.
      textNode: (n) => facetNodes(n.body || '', n.facets),
      // reply-embeds (owner, 2026-09-01): a reply draws what it shows and what
      // it quotes, through the SAME mediaNode and quotedContext the feed row
      // and the post head use. A reply-only renderer is how the surfaces drift
      // apart again — the rendering matrix asks all three the same question of
      // every shape for exactly that reason.
      embedNodes: (n) => [
        n.media && !n.maskedRemoved ? mediaNode(n) : null,
        n.quoted ? quotedContext(n.quoted) : null,
      ].filter(Boolean),
      // save/mod still gate; replying does not —
      // Reply sits on every node (mock v18 claim C; on forage.fyi 2026-08-30 only
      // the head offered it), the composer mounting under the node you answered
      onReply: (n, host) => {
        const gate = sessionGate('reply');
        if (gate) return toast(gate, 'err');
        if (host.querySelector('[data-composer]')) { host.replaceChildren(); return; } // a second press folds it
        // feed-row v4: the quick box — textarea, Send, Cancel; the draft survives Cancel
        host.replaceChildren(replyBox({ parentUri: n.id, replyTo: { root: rootRef, parent: { uri: n.id, cid: n.cid } },
          quick: true, autofocus: true, onDone: () => rerender(), onCancel: () => host.replaceChildren() }));
      },
      // A reply's stack is the same like the head's pill is (owner, 2026-08-29:
      // signed in, the comment arrow did nothing — it was the guest span).
      canVote: !!session, onVote: (n) => lensVote(n),
      onGuest: session ? null : openAuthSheet, // board-cards decision 1: a guest's vote stack is the door too
      menuGroups: (n) => lensMenuGroups(n, { kind: 'comment' }), // 4b: the ⋯ on every reply
      permalink: (n) => `${location.origin}/p?uri=${encodeURIComponent(p.id)}&focus=${encodeURIComponent(n.id)}`, // decision 10
      authorHref: (n) => `/u/${encodeURIComponent(n.author)}`, // 3k: authors reach OUR profile page (which links out)
      // feed-row v2: the provider mark on comments too, unless switched off
      providerOf: providerMark.enabled() ? providerMark.providerOf : null,
      providerLabel: (h) => providerMark.markLabel(providerMark.providerOf(h), h),
      nodeRenderer: (n, c) => lensNode(n, c), // 3r: a quote nested under a reply is still a quote
      // phase 2: a reply you regret is the commoner case than a post you
      // regret, so your own replies carry the same control. Same guard, same
      // two-click arming; the node simply removes itself when it is gone.
      // v12 decision 25: ⟳ on every node, between Reply and the like; then the
      // delete-your-own control where it applies
      extraActions: (n) => [repostControl(n), deleteControl(n, () => {
        const host = commentsCard.querySelector(`[data-node-id="${CSS.escape(n.id)}"]`);
        if (host) host.replaceChildren(el('div', { class: 'xs muted', style: 'padding:6px 0' }, 'You deleted this reply.'));
        else rerender();
      })] };
    const commentsCard = el('div', { class: 'card' });
    // Phase 11c: the thread's sort bar — the top-level replies re-sorted
    // CLIENT-SIDE (the thread is already loaded whole; nothing to re-query),
    // Hot on engagement (likes + replies + reposts, the node's own children
    // standing in for a reply count), From windowing the top level only.
    const orderComments = (comments) => {
      const nowSec = Math.floor(Date.now() / 1000);
      const windowed = threadSort !== 'new' && threadFrom !== 'all'
        ? comments.filter((n) => n.createdTs >= Date.now() - THREAD_WINDOW_MS[threadFrom]) : comments;
      return sortItems(windowed, threadSort, nowSec);
    };
    let latest = t.comments;
    const paintComments = (comments) => {
      latest = comments;
      commentsCard.replaceChildren(
        sortBar({ sorts: [['hot', 'Hot'], ['top', 'Top'], ['new', 'New']], sort: threadSort, from: threadFrom,
          onChange: ({ sort, from }) => { threadSort = sort; threadFrom = from; paintComments(latest); } }),
        ...orderComments(comments).map((n) => lensNode(n, ctx)));
    };
    paintComments(t.comments);
    // decision 10: ?focus= (or a reply uri, resolved by the substrate) lands on
    // its comment; the way back is the root's own address
    const focus = query.focus ? decodeURIComponent(query.focus) : t.focus;
    const threadHref = `/p?uri=${encodeURIComponent(p.id)}`;
    const bar = focus ? focusComment(commentsCard, focus, { threadHref }) : null;
    // the cascade landed — redraw the list in place, and land on the focused
    // comment AGAIN: the repaint is a fresh tree, and the first focus went with
    // the old one (mock v20 claim F, found by the shipped capture 2026-08-30)
    onCascade = (next) => { paintComments(next.comments); if (focus) focusComment(commentsCard, focus, { threadHref }); };
    main.replaceChildren(...[bar, head, t.comments.length ? commentsCard : emptyState('No replies', 'Nothing below this post yet.')].filter(Boolean));
  }).catch((e) => main.replaceChildren(emptyState('Lens fetch failed', e.message)));
  return { main, side: el('div', { class: 'side' }, ...lensRail()) };
}
