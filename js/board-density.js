// Board density — card or compact — as ONE device-local preference, read by
// both populations.
//
// The dial already existed, but only the Bluesky board read it: js/ui/views.js
// never passed `compact` to postRow, so a sandbox board stayed roomy however
// the reader had set it. One key, half an app honouring it.
//
// Named `density`, not `boardView`, on purpose: js/ui/views.js already exports
// a `boardView` — the listing RENDERER — and lens-views had a local const of
// the same name meaning the PREFERENCE. Two different things under one name in
// two files is how the next person loses an afternoon.
//
// Device-local, like skin and mode; never forage.state.

export const DENSITY_KEY = 'forage.boardview';
export const DENSITIES = Object.freeze([['card', 'Card'], ['compact', 'Compact']]);

export function density() {
  try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'card'; }
  catch { return 'card'; }
}

export function isCompact() { return density() === 'compact'; }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setDensity(v) {
  const next = v === 'compact' ? 'compact' : 'card';
  try { localStorage.setItem(DENSITY_KEY, next); } catch { /* private mode */ }
  for (const fn of listeners) fn(next);
}

// The dial itself, so both boards offer the same control rather than each
// growing its own copy that drifts.
export function densityDial(el, onPicked) {
  const sel = el('select', {
    'data-density': '1',
    'aria-label': 'Board density',
    title: 'Card shows previews and media; Compact is dense rows',
  }, ...DENSITIES.map(([v, label]) =>
    el('option', { value: v, selected: density() === v || false }, label)));
  sel.addEventListener('change', () => { setDensity(sel.value); onPicked?.(sel.value); });
  return sel;
}
