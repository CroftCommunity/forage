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

import { activeSkin, prefersDensityFor } from './skins.js';

export const DENSITY_KEY = 'forage.boardview';
export const DENSITIES = Object.freeze([['card', 'Card'], ['compact', 'Compact']]);

// Resolution order: the reader's explicit choice, then the active skin's
// preference, then card.
//
// A skin PREFERRING a density (DL-028) is a suggestion and nothing more. The
// dial sits on the same board, and the moment a reader touches it their choice
// is stored and wins for good — which is what keeps this from being a skin
// seizing layout. A skin also only ever picks from the densities the app
// already ships, so it cannot express anything the reader cannot undo.
export function density() {
  try {
    const stored = localStorage.getItem(DENSITY_KEY);
    if (stored === 'compact' || stored === 'card') return stored;
  } catch { /* no storage: fall through to the skin, then the default */ }
  // Through the FAMILY, not the skin (plan 2026-08-26-2 Phase 1). It sat on
  // each skin, so the two phpBB entries carried `compact` independently and
  // nothing stopped them disagreeing — which would mean the ☾/☀ toggle silently
  // re-laying-out the board. One home per family deletes that class.
  const preferred = prefersDensityFor(activeSkin());
  return preferred === 'compact' || preferred === 'card' ? preferred : 'card';
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
  // `.pillsel`: the same dressing as the sort selects beside it (board-cards
  // decision 3) — one control family, not a pill next to a bare native select.
  const sel = el('select', {
    class: 'pillsel',
    'data-density': '1',
    'aria-label': 'Board density',
    title: 'Card shows previews and media; Compact is dense rows',
  }, ...DENSITIES.map(([v, label]) =>
    el('option', { value: v, selected: density() === v || false }, label)));
  sel.addEventListener('change', () => { setDensity(sel.value); onPicked?.(sel.value); });
  return sel;
}
