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
// Device-local, on js/ring-scope.js's tenet: one module read by everything, a
// read that repairs (garbage reads as forum) and a write that refuses by name.

export const KEY = 'forage.view';

export const MODES = Object.freeze([
  { id: 'forum', label: 'Forum', blurb: 'posts as rows' },
  { id: 'clip',  label: 'Clip',  blurb: 'the board’s clips, one per screen' },
  { id: 'gram',  label: 'Gram',  blurb: 'the board’s pictures, one per screen' },
].map(Object.freeze));
export const MODE_IDS = Object.freeze(MODES.map((m) => m.id));
export const DEFAULT_MODE = 'forum';

const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, String(v)); } catch { /* private mode: forum stands */ } };

export const modeFor = (id) => MODES.find((m) => m.id === id) || null;

export function active() {
  const v = read();
  return MODE_IDS.includes(v) ? v : DEFAULT_MODE;
}

export function set(id) {
  if (!MODE_IDS.includes(id)) throw new Error(`view: ${id} is not a mode (modes: ${MODE_IDS.join(', ')})`);
  write(id);
  for (const fn of listeners) fn(id);
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
// The same construction as the ring pill (js/ring-scope.js § the control):
// native radios, visually hidden, the labels as the segments, an injected
// el() so it is unit-testable with no DOM. It wears the ring pill's classes on
// purpose — D7 puts it directly under the ring pill, and two controls stacked
// in one column had better be one family.
let pillSeq = 0;
export function viewPill(el, { onPicked, ariaLabel = 'How to show it', block = false } = {}) {
  const current = active();
  const group = `viewpill-${++pillSeq}`;
  const segs = MODES.flatMap((m) => {
    const inputId = `${group}-${m.id}`;
    return [
      el('input', {
        type: 'radio', name: group, id: inputId, class: 'ringpill-in',
        'data-view': m.id, checked: m.id === current || false,
        onchange: () => onPicked(m.id),
      }),
      el('label', { class: 'ringseg', for: inputId, title: `${m.label} — ${m.blurb}` },
        el('span', { class: 'ringseg-t' }, m.label)),
    ];
  });
  return el('div', {
    class: block ? 'ringpill ringpill-block' : 'ringpill',
    'data-view-pill': '1', role: 'radiogroup', 'aria-label': ariaLabel,
  }, ...segs);
}
