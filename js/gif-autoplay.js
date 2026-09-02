// Should a GIF start on its own? (gif-embeds phase 3; owner 2026-09-02: "there
// should be a setting in use rproifle to play gifs by default or not".)
//
// DESIGN.md § Foundations, the rule theme and content languages already follow:
// **defaults come from the device, choices come from the person.** A reader who
// set `prefers-reduced-motion: reduce` system-wide has answered "should things
// move on their own" once, for everything; absent a choice here, that answer is
// taken. An explicit choice then wins in BOTH directions.
//
// Not js/haptics.js's rule, on purpose. There, reduced-motion overrides the
// switch (O3) — a buzz is involuntary and offers no control at the instant it
// fires. A GIF carries a play/pause button on its own card, so a reader who
// turns autoplay on has said so deliberately and can still stop any single one.
//
// D6: "on" is WRITTEN. A choice recorded by removing the key reads as "never
// chose" and is undone by the device default on the next load — the exact
// most-missed trap DESIGN.md names for the "show everything" language choice.
//
// Device-local like every other reading preference (one localStorage key, no
// account sync); js/ui/stage.js and js/ui/lens-views.js read it at render time.

export const KEY = 'forage.gifautoplay';

// The stated choice, or null for "never chose" — a corrupt value is not a
// choice, so it falls through to the device rather than to a guess.
export function stored() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  return raw === 'on' || raw === 'off' ? raw : null;
}

// What the device asks for when nobody has chosen. No matchMedia (node, an old
// browser) means no stated preference for less motion, so: play.
export function deviceDefault() {
  return !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

export function enabled() {
  const choice = stored();
  return choice === null ? deviceDefault() : choice === 'on';
}

export function set(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: the device default stands */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}
