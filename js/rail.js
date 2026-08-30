// board-cards decision 6 (2026-08-29): the right rail — suggestions and, for a
// guest, the sign-in card — is OPTIONAL: on by default, usable but quieter
// than the column, and off it gives the column its centre. Device-local like
// the card size. Only the word 'off' turns it off: a corrupt value must never
// cost the reader their rail. The stylesheet decides the tracks from the
// shell's `data-rail`; this owns only the word.

export const KEY = 'forage.rail';

export function enabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function set(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

export function apply() {
  document.querySelector('.shell')?.setAttribute('data-rail', enabled() ? 'on' : 'off');
}
