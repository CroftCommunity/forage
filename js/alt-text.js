// Should alt text be printed where it can be read without a screen reader?
// (gif-embeds phase 4; owner 2026-09-02: "an advanced setting checkbox to show
// or hide alt txt with hide as default".)
//
// Default HIDDEN, and no device signal gets a vote — D5. Autoplay next door is
// a MOTION question, and `prefers-reduced-motion` is a person having answered
// it system-wide; whether a caption is printed under a picture is a layout
// taste with no media query behind it. The owner said hide, so it is hidden.
//
// The case that prompted it: Bluesky's composer writes a GIF's alt into the
// external `description` as "ALT: <the GIF's own title>" (js/gif.js parses the
// prefix), so the card printed the same eight words twice. Hiding it by default
// removes the duplicate; switching it on is for readers who want every
// description an author supplied.
//
// D7 — this governs a VISIBLE caption ONLY. `<img alt>` is written in both
// states. The accessible name is not a preference, and a display toggle that
// stripped alt from the accessibility tree would turn a reading choice into an
// accessibility regression; test/a11y-names.test.js is what keeps that honest.
//
// Lives behind the ADVANCED disclosure on /me, beside Browse Hashtags: most
// readers should never need it, which is what that section is for.

export const KEY = 'forage.alttext';

// Only the literal "on". A default-OFF feature must not be switched on by a
// corrupt value — the mirror of the default-ON modules' "only 'off' disables".
export function shown() {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
}

export function set(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode: hidden stands */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}
