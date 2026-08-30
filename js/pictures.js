// board-cards decision 5 (2026-08-29): "pictures shown at once" — 1 to 4,
// default 1. A post with up to that many pictures shows them all in a grid;
// more than that fold into one stage as a carousel. 4 is never a carousel,
// because Bluesky caps a post at four. Device-local like the card size; the
// stylesheet and js/ui/stage.js own the shapes, this owns only the number.

export const KEY = 'forage.pictures';
export const PICTURES = Object.freeze({ min: 1, max: 4, default: 1 });
export const NOTCHES = Object.freeze([1, 2, 3, 4]);

const isNotch = (n) => Number.isInteger(n) && n >= PICTURES.min && n <= PICTURES.max;

const warned = new Set();
export function stored() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  if (isNotch(n)) return n;
  if (!warned.has(raw)) { warned.add(raw); console.warn(`forage: pictures ${JSON.stringify(raw)} is not a notch (1–4); reading as ${PICTURES.default}`); }
  return null;
}

export function active() { return stored() ?? PICTURES.default; }

export function set(n) {
  if (!isNotch(n)) throw new Error(`pictures shown at once must be a notch ${PICTURES.min}–${PICTURES.max}, got ${JSON.stringify(n)}`);
  try { localStorage.setItem(KEY, String(n)); } catch { /* private mode */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

// The rule, pure: one picture is a plain stage; up to the setting is a grid
// (exactly N shown, never a one-slide carousel); above it, a carousel.
export function layoutFor(count, atOnce) {
  if (count <= 1) return 'stage';
  return count <= atOnce ? 'grid' : 'carousel';
}
