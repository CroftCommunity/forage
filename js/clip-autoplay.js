// Should a clip start on its own in Clip mode? (plan 2026-09-14-plan-clips, D3;
// the plan's proposal: on inside Clip only.)
//
// Its own key. js/gif-autoplay.js is about GIFs on rows; a clip is a video
// post, and a reader can reasonably want GIFs still and clips moving, or the
// reverse. The rule is the same one (DESIGN.md § Foundations): the device
// answers — `prefers-reduced-motion: reduce` means no — until a person does,
// and a stated choice wins in both directions, "on" written like "off".
//
// What this module does NOT decide, because the reel does (js/ui/reel.js and
// the caller that mounts a player): muted, in view only, never a labeled clip,
// never a frame in Gram or Forum. This is only the reader's yes or no.
export const KEY = 'forage.clipautoplay';

export function stored() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  return raw === 'on' || raw === 'off' ? raw : null;
}

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
