// View modes — how a board is SHOWN (plan 2026-09-14-plan-clips; owner,
// 2026-09-16, on mock v1: "we are looking at a 'mode' here like 'clip' mode
// that is vids centered, and we could do a 'gram' mode where it could be
// images centred … any mode could be used at any ring scale").
//
//   forum  the rows you have today
//   clip   video-centred: the board's clips, one per screen
//   gram   picture-centred: the board's picture posts, one per screen
//
// A mode is not a board and not a source. It is a way of showing the board you
// are on — the same posts, narrowed to the ones carrying the mode's media —
// so every board has every mode, and the ring scope and the moderation posture
// apply exactly as they do to rows. Nothing here fetches and nothing writes.
//
// THE WORD. Readers say "mode"; this module says "view", because js/mode.js
// already means which POPULATION the app is (the Bluesky view or the memory
// sandbox) and `MODES` in js/config/routing.js means the substrate tables.
// Three things named mode should not become four (plan D8).
//
// TWO STORES (owner, 2026-09-21: "add a 'default' setting for it in the user
// settings and have it be 'forum' by default"). The DEFAULT is a device
// preference on the account page — forum unless the reader chooses — and is
// what a fresh visit opens in. The LIVE choice is the top bar's dropdown, and
// it lasts the visit (sessionStorage): a reader who switched to Clip for an
// evening gets Forum back tomorrow unless they made Clip their default. Both
// on js/ring-scope.js's tenet: a read that repairs (garbage reads as forum), a
// write that refuses by name.

export const KEY = 'forage.view';            // this visit's choice (sessionStorage)
export const DEFAULT_KEY = 'forage.viewdefault'; // the device's default (localStorage)

export const MODES = Object.freeze([
  { id: 'forum', label: 'Forum', blurb: 'posts as rows' },
  { id: 'clip',  label: 'Clip',  blurb: 'the board’s clips, one per screen' },
  { id: 'gram',  label: 'Gram',  blurb: 'the board’s pictures, one per screen' },
].map(Object.freeze));
export const MODE_IDS = Object.freeze(MODES.map((m) => m.id));
export const DEFAULT_MODE = 'forum';

const readLive = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const writeLive = (v) => { try { sessionStorage.setItem(KEY, String(v)); } catch { /* private mode: the default stands */ } };
const readDefault = () => { try { return localStorage.getItem(DEFAULT_KEY); } catch { return null; } };
const writeDefault = (v) => { try { localStorage.setItem(DEFAULT_KEY, String(v)); } catch { /* private mode: forum stands */ } };

export const modeFor = (id) => MODES.find((m) => m.id === id) || null;
const check = (id) => { if (!MODE_IDS.includes(id)) throw new Error(`view: ${id} is not a mode (modes: ${MODE_IDS.join(', ')})`); };

export function defaultMode() {
  const v = readDefault();
  return MODE_IDS.includes(v) ? v : DEFAULT_MODE;
}

export function active() {
  const v = readLive();
  return MODE_IDS.includes(v) ? v : defaultMode();
}

export function set(id) {
  check(id);
  writeLive(id);
  for (const fn of listeners) fn(id);
}

// The account-page setting. It changes what the NEXT visit opens in, not this
// one: a reader on a reel who sets their default to Forum is not thrown out of
// the reel they are watching.
export function setDefault(id) {
  check(id);
  writeDefault(id);
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// The kind filter, over the SHAPED post's media (js/substrates/lens.js shapes
// every embed into `media.kind` already, so a mode costs no new field and no
// new fetch shape). A removed post is never a frame: there is nothing to show
// full-screen and the row already says why.
//
// D9: a GIF card is a picture to a reader and a video to the code. Gram shows
// it (paused, with its badge — the GIF autoplay setting governs, as on a row);
// Clip does not: a clip is a post someone filmed.
const KIND = Object.freeze({ clip: ['video'], gram: ['images', 'gif'] });
export function ofKind(posts, mode) {
  if (!MODE_IDS.includes(mode)) throw new Error(`view: ${mode} is not a mode`);
  if (mode === 'forum') return posts;
  return posts.filter((p) => !p.maskedRemoved && KIND[mode].includes(p.media?.kind));
}

// ---- the control ----
//
// A DROPDOWN, not the ring pill's segmented control (D7, owner 2026-09-21:
// "it's not really a gradient … it's basically a content type filter and
// formatting and it's one at a time and not really graduated like mutuals to
// world"). The ring pill is a containment ladder and a segmented control says
// so; a view is one of three kinds, and a select says that. It wears the sort
// bar's dressing (.pillsel) and lives in the top bar, on every board, so the
// way back to the rows is always on screen. Injected el() as everywhere.
//
// `which: 'default'` is the account page's copy of the same control, showing
// and picking the DEFAULT rather than this visit's choice.
export function viewSelect(el, { onPicked, which = 'live', ariaLabel = null } = {}) {
  const isDefault = which === 'default';
  const current = isDefault ? defaultMode() : active();
  return el('select', {
    class: 'pillsel viewsel', ...(isDefault ? { 'data-view-default': '1', id: 'pref-viewdefault' } : { 'data-view-select': '1' }),
    'aria-label': ariaLabel || (isDefault ? 'Default view \u2014 how a board opens' : 'How to show the board \u2014 rows, clips, or pictures'),
    onchange: (e) => onPicked(e.target.value),
  }, ...MODES.map((m) => el('option', { value: m.id, selected: m.id === current || false, title: m.blurb }, m.label)));
}
