// board-cards decision 6 (2026-08-29): the right rail — suggestions and, for a
// guest, the sign-in card — is OPTIONAL: on by default, usable but quieter
// than the column, and off it gives the column its centre. Device-local like
// the card size. Only the word 'off' turns it off: a corrupt value must never
// cost the reader their rail. The stylesheet decides the tracks from the
// shell's `data-rail`; this owns only the word.
//
// feed-index Phase 4 (plan 2026-09-08, owner 2026-09-04: "the right side can
// be a couple of user choosable panels … by default it's trending
// 'jumpstarts'"): the word grew into an ORDERED LIST of panel ids. The shell
// still reads on|off (shellWord); the views read panels(). Popular jumpstarts
// is first by default — popular, never "trending": 52 packs in 145k had any
// weekly joins (D6), so a trending panel would be an empty one. The legacy
// words keep their meaning: 'off' is off, 'on' is the default order.

export const KEY = 'forage.rail';

// The guest's sign-in card stays FIRST (board-cards decision 6: "the door,
// then trending" — guest-surface.workflow.mjs holds it); it draws nothing
// for a signed-in reader, so for them Popular jumpstarts leads.
export const PANELS = Object.freeze([
  { id: 'signin', label: 'Sign in', blurb: 'the sign-in card, shown only while you are signed out' },
  { id: 'jumpstarts', label: 'Popular jumpstarts', blurb: 'the most-joined jumpstarts in the index' },
  { id: 'trending', label: 'Trending', blurb: 'what the network says is hot right now' },
]);
export const DEFAULT_PANELS = Object.freeze(PANELS.map((p) => p.id));
const KNOWN = new Set(DEFAULT_PANELS);

// The stored shape: 'off' | 'on' | JSON {"panels":[…]}. Anything else reads
// as no choice — the default — and says so once (the raw string is the
// whole diagnosis).
const warned = new Set();
function read() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (raw === null || raw === '' || raw === 'on') return null;
  if (raw === 'off') return [];
  try {
    const v = JSON.parse(raw);
    if (v && Array.isArray(v.panels)) return v.panels.filter((id) => KNOWN.has(id));
  } catch { /* fall through */ }
  if (!warned.has(raw)) { warned.add(raw); console.warn(`forage: rail ${JSON.stringify(raw)} is not on, off, or a panel list; reading as the default`); }
  return null;
}

export function panels() { return read() ?? [...DEFAULT_PANELS]; }
export function enabled() { return panels().length > 0; }
export function has(id) { return panels().includes(id); }
export function shellWord() { return enabled() ? 'on' : 'off'; }

export function setPanels(ids) {
  const list = [...new Set((ids || []).filter((id) => KNOWN.has(id)))];
  try { localStorage.setItem(KEY, list.length ? JSON.stringify({ panels: list }) : 'off'); } catch { /* private mode */ }
}

export function set(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

export function apply() {
  document.querySelector('.shell')?.setAttribute('data-rail', shellWord());
}
