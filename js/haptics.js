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
//
// The pulse is 30 ms, not the plan's 12 (owner, 2026-09-16: "not giving me
// tactile response", on posts and on comments — the first device run; Phase 7
// shipped on the platform contract alone). What the platform does with the
// number: Chromium hands Android the deprecated one-shot, `Vibrator.vibrate(ms)`,
// with no VibrationEffect, no amplitude and no attributes, and skips the call
// outright when the ringer is on silent (services/device/vibration/android/
// .../VibrationManagerAndroid.java). Android's haptics guidance says to avoid
// exactly that legacy one-shot, and that a motor driven for 20 ms may not
// settle for another 20–50 (developer.android.com/develop/ui/views/haptics/
// haptics-principles). The one measured number: ~30 ms is the duration below
// which a vibrotactile stimulus reads as a pulse rather than a vibration
// (Remache-Vinueza et al., Sci Rep 15, 2025, doi:10.1038/s41598-025-85778-6).
// 30 is that floor; it is a tick, not a buzz. scripts/probe-haptics.html is the
// page to open on the phone when the number is in question again.

const KEY = 'forage.haptics';
let saidUnavailable = false;

export function enabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function set(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: the default stands */ }
}

export const PULSE_MS = 30;

export function buzz(ms = PULSE_MS) {
  if (!enabled()) return false;
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
  const vibrate = globalThis.navigator?.vibrate;
  if (typeof vibrate !== 'function') {
    if (!saidUnavailable) { saidUnavailable = true; console.debug('forage: haptics unavailable on this device'); }
    return false;
  }
  try { return !!vibrate.call(navigator, ms); } catch { return false; }
}
