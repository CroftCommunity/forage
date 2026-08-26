// 3t: how large preview media renders in card view. A viewing preference, not
// account state — it lives on the device (like the presentation mode) and
// never reaches the Bluesky account. The value is the max height in px for an
// image in a board card; the board reads it as a CSS custom property so a drag
// repaints nothing.

const KEY = 'forage.mediascale';

export const MEDIA_SCALE = Object.freeze({
  min: 80,
  max: 640,
  step: 20,
  default: 220, // the cap that shipped — an untouched board looks unchanged
});

const clamp = (n) => Math.min(MEDIA_SCALE.max, Math.max(MEDIA_SCALE.min, n));

// A stored value that is not a number in range reads as NO choice, exactly as
// a garbage mode does: a corrupt preference must never produce a broken board.
export function stored() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < MEDIA_SCALE.min || n > MEDIA_SCALE.max) return clamp(n);
  return n;
}

export function active() {
  const s = stored();
  return s === null ? MEDIA_SCALE.default : clamp(s);
}

export function set(px) {
  const n = Number(px);
  if (!Number.isFinite(n)) throw new Error(`media scale must be a number of pixels, got ${JSON.stringify(px)}`);
  try { localStorage.setItem(KEY, String(clamp(n))); } catch { /* private mode: the board still works */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

export function cssValue() { return `${active()}px`; }
