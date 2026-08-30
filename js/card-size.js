// board-cards decision 7 (2026-08-29): the card size — four notches, 1 (small)
// to 4 (as drawn), default 4. One setting scales the stage's height cap, the
// card padding and the title, so the reader chooses how much room a post
// takes. It replaced the 3t drag slider (js/media-scale.js), which on a phone
// moved in visible jumps and felt broken; a notch is a choice a thumb can make.
//
// The stylesheet OWNS the numbers: apply() writes the notch onto the root as
// `data-cardsize`, and css/app.css maps each notch to its variables. Nothing
// here knows a pixel. Device-local like the skin; never account state.

export const KEY = 'forage.cardsize';
export const CARD_SIZE = Object.freeze({ min: 1, max: 4, default: 4 });
export const NOTCHES = Object.freeze([1, 2, 3, 4]);

const isNotch = (n) => Number.isInteger(n) && n >= CARD_SIZE.min && n <= CARD_SIZE.max;

// A stored value that is not a notch reads as NO choice — a corrupt preference
// must never produce a broken board — and says so once per value (Pass 3
// observability): the raw string is the whole diagnosis.
const warned = new Set();
export function stored() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  if (isNotch(n)) return n;
  if (!warned.has(raw)) { warned.add(raw); console.warn(`forage: card size ${JSON.stringify(raw)} is not a notch (1–4); reading as ${CARD_SIZE.default}`); }
  return null;
}

export function active() { return stored() ?? CARD_SIZE.default; }

export function set(n) {
  if (!isNotch(n)) throw new Error(`card size must be a notch ${CARD_SIZE.min}–${CARD_SIZE.max}, got ${JSON.stringify(n)}`);
  try { localStorage.setItem(KEY, String(n)); } catch { /* private mode: the board still works */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

// Explicit even at the default, so a stylesheet rule keyed on the attribute
// never has to guess what "unset" means.
export function apply() {
  document.documentElement.setAttribute('data-cardsize', String(active()));
}

// The dial, so both boards offer the same control (the density dial's pattern).
export function cardSizeDial(el, onPicked) {
  const sel = el('select', { class: 'pillsel', 'data-size': '1', 'aria-label': 'Card size',
    title: 'How much room a post takes: 1 is small, 4 is the full stage' },
    ...NOTCHES.map((n) => el('option', { value: String(n), selected: active() === n || false }, `Size · ${n}`)));
  sel.addEventListener('change', () => { set(Number(sel.value)); apply(); onPicked?.(Number(sel.value)); });
  return sel;
}
