// Haptics (plan 2026-08-29 post-and-thread, decision 6): a like buzzes on a
// device that can, nothing on un-like, one switch, default ON. Device-local
// like skin and mode (js/skins.js, js/mode.js — one localStorage key each).
//
// iOS Safari has no vibrate API: it degrades to NOTHING — never a sound, never
// a toast — and says so once per session on the console, because "the switch
// does nothing" is the report that line answers. O3: a reader who set
// prefers-reduced-motion asked for exactly this kind of quiet, so it is
// honoured even when the switch is on.
//
// Chrome ignores vibrate() outside a user activation: callers must buzz INSIDE
// the click handler, before any await.

const KEY = 'forage.haptics';
let saidUnavailable = false;

export function enabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function set(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: the default stands */ }
}

export function buzz(ms = 12) {
  if (!enabled()) return false;
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
  const vibrate = globalThis.navigator?.vibrate;
  if (typeof vibrate !== 'function') {
    if (!saidUnavailable) { saidUnavailable = true; console.debug('forage: haptics unavailable on this device'); }
    return false;
  }
  try { return !!vibrate.call(navigator, ms); } catch { return false; }
}
