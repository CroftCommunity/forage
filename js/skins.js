// Skins (4a) — a skin is a TOKEN-SHEET SWAP: an extra stylesheet that may only
// assign custom properties declared in css/tokens.css, applied via one managed
// <link>. Skins and modes are independent axes (user, 2026-08-25): any skin in
// any mode — the BBS skin in the Bluesky view is legal, just off-theme. The
// preference is device-local, never forage.state.
// test/skins.test.js enforces the token-only rule with a static scan.
//
// Phase 1A (plan 2026-08-26-1) — SKINS SUBSUME THEMES. A skin carries exactly
// ONE palette; light/dark is no longer a second axis. Two consequences:
//   - Each entry declares `palette: 'light' | 'dark'`.
//   - A skin may PREFER a board density (`prefersDensity`, DL-028). It is a
//     SUGGESTION: a reader's explicit choice from the dial on the board always
//     wins, in both directions. A skin picks from the densities the app already
//     ships — it is never handed layout properties — so it cannot express
//     anything the reader cannot reach from that same dial.
//   - Each entry declares a FAMILY. The upper-right toggle swaps to the
//     opposite-palette member of the same family, and is DISABLED where none
//     exists. That disabled state is deliberate and must stay visible: a user
//     on a dark-only family cannot reach light, and a dead-looking control is
//     the honest way to say so.
// This models what forum themes actually are — phpBB ships light and dark as
// separate styles (freecad / freecad-dark), not as one style with two modes.
//
// Phase 1 (plan 2026-08-26-2) — THE PICKER IS FAMILY-SHAPED; THE MODEL IS
// STILL ONE SKIN, ONE PALETTE. Read that sentence before changing anything
// here, because the obvious misreading is that light/dark came back as a second
// axis. It did not. `forage.skin` still stores ONE concrete skin id, the
// pre-paint boot scripts in index.html/404.html still read that key, and every
// skin still carries exactly one palette. What changed is presentation: the
// Settings picker offers four STYLE rows instead of seven skins, and the ☾/☀
// toggle chooses the side.
//
// FAMILY IS CANONICAL and `pairedWith` is gone. The sibling is DERIVED from
// family + palette, which makes the three failure classes the old
// `validatePairing` checked — asymmetric, dangling, self-paired — structurally
// impossible rather than merely caught: there is no second place to write the
// relationship, so there is nothing to disagree with. Deriving introduces
// exactly one new class (two same-palette skins in one family) and
// `validateFamilies` is the guard for it.
//
// The two id namespaces OVERLAP: `bbs`, `usenet` and `phpbb` are each a skin id
// AND a family id. Passing one to a function expecting the other resolves
// silently for those three and throws for the rest, which is the worst possible
// distribution. Every function below names its namespace in its error.

export const SKIN_KEY = 'forage.skin';

// A FAMILY is one visual identity with up to two palettes. This is what the
// Settings picker lists, so the label names the STYLE and must read for both
// sides — no palette word, no per-side flavour note. `validateFamilies`
// enforces that rather than leaving it as prose (PATTERN.md: a rule with no
// check decays, and naming conventions decay fastest).
//
// `prefersDensity` (DL-028) lives HERE and not on the skin. It used to sit on
// each phpBB entry independently, where nothing stopped the two from
// disagreeing — and a disagreement means toggling palette silently re-lays-out
// the board. One home deletes that class.
export const FAMILIES = Object.freeze({
  forage: { label: 'Forage' },
  bbs: { label: 'Classic BBS' },
  usenet: { label: 'Usenet gray' },
  phpbb: { label: 'phpBB', prefersDensity: 'compact' },
});

export const SKINS = Object.freeze({
  // `default` IS Forage light: file null means "the palette already in
  // tokens.css", so the common case loads no extra sheet and cannot flash.
  default: { label: 'Forage (light)', file: null, palette: 'light', family: 'forage' },
  'forage-dark': { label: 'Forage (dark)', file: 'skins/forage-dark.css', palette: 'dark', family: 'forage' },
  bbs: { label: 'Classic BBS (amber terminal)', file: 'skins/bbs.css', palette: 'dark', family: 'bbs' },
  usenet: { label: 'Usenet gray (newsprint)', file: 'skins/usenet.css', palette: 'light', family: 'usenet' },
  'usenet-dark': { label: 'Usenet gray (after dark)', file: 'skins/usenet-dark.css', palette: 'dark', family: 'usenet' },
  // The classic phpBB board. Registered as always-available (owner, 2026-08-26):
  // a first-class entry, not tied to any mode.
  phpbb: { label: 'phpBB (classic board)', file: 'skins/phpbb.css', palette: 'light', family: 'phpbb' },
  'phpbb-dark': { label: 'phpBB (after hours)', file: 'skins/phpbb-dark.css', palette: 'dark', family: 'phpbb' },
});

// ---- families -------------------------------------------------------------

function skinEntry(id, registry) {
  const s = registry[id];
  if (!s) throw new Error(`unknown skin: ${id} (known skin ids: ${Object.keys(registry).join(', ')})`);
  return s;
}

export function familyOf(id, registry = SKINS) {
  return skinEntry(id, registry).family;
}

// The skin ids in a family, light first. Throws on a FAMILY id it does not
// know — which is what stops a skin id passed here from resolving silently for
// the three that overlap.
export function familyMembers(family, registry = SKINS, fams = FAMILIES) {
  if (!fams[family]) throw new Error(`unknown family: ${family} (known families: ${Object.keys(fams).join(', ')})`);
  return Object.keys(registry)
    .filter((id) => registry[id].family === family)
    .sort((a, b) => (registry[a].palette === 'light' ? -1 : 1) - (registry[b].palette === 'light' ? -1 : 1));
}

// The skin to land on when someone picks a family while in a given palette.
// A family that ships only one palette answers with it — a legal answer, not
// an error: the alternative is a picker row that refuses to be picked.
export function resolveInFamily(family, palette, registry = SKINS, fams = FAMILIES) {
  const members = familyMembers(family, registry, fams);
  if (!members.length) throw new Error(`family ${family} has no registered skins`);
  return members.find((id) => registry[id].palette === palette) ?? members[0];
}

// One row per family for the picker: both sides, and whether it has only one.
export function families(registry = SKINS, fams = FAMILIES) {
  return Object.entries(fams).map(([id, f]) => {
    const members = familyMembers(id, registry, fams);
    const light = members.find((m) => registry[m].palette === 'light') ?? null;
    const dark = members.find((m) => registry[m].palette === 'dark') ?? null;
    return { id, label: f.label, light, dark, sole: !(light && dark) };
  });
}

// The board density a family PREFERS, or undefined. Deliberately tolerant of an
// unknown skin id: js/board-density.js calls this on every render with whatever
// is stored, and a stored id from an older build must not take the board down.
export function prefersDensityFor(id, registry = SKINS, fams = FAMILIES) {
  return fams[registry[id]?.family]?.prefersDensity;
}

// Words that name ONE palette, and therefore cannot appear in a name that has
// to read for both. Kept as a list rather than a cleverer rule because it is
// the list a reviewer can argue with.
const PALETTE_WORDS = /\b(light|dark|day|night|dawn|dusk|noir|after hours|after dark)\b/i;

// Bad family data is silent breakage: a picker row that resolves to nothing, a
// toggle that picks arbitrarily between two same-palette members, or a row
// whose name lies about half of what it selects. Validate it loudly, and run
// this over the real registry from the test suite.
export function validateFamilies(fams = FAMILIES, registry = SKINS) {
  for (const [id, s] of Object.entries(registry)) {
    if (!fams[s.family]) {
      throw new Error(`skin ${id} claims family '${s.family}', which is not registered (known: ${Object.keys(fams).join(', ')})`);
    }
  }
  for (const [fid, f] of Object.entries(fams)) {
    const members = Object.keys(registry).filter((id) => registry[id].family === fid);
    if (!members.length) throw new Error(`family ${fid} has no registered skins — it would render a picker row that selects nothing`);
    for (const palette of ['light', 'dark']) {
      const same = members.filter((id) => registry[id].palette === palette);
      if (same.length > 1) {
        throw new Error(`family ${fid} holds two ${palette} skins (${same.join(', ')}) — the toggle would pick between them arbitrarily`);
      }
    }
    if (!f.label) throw new Error(`family ${fid} needs a human label`);
    const word = f.label.match(PALETTE_WORDS);
    if (word) {
      throw new Error(`family ${fid} label '${f.label}' names a palette ('${word[0]}') — a family label has to read for BOTH sides`);
    }
    if (/[()]/.test(f.label)) {
      throw new Error(`family ${fid} label '${f.label}' carries a parenthetical — that is per-side flavour, and it belongs on the skin label, not the family`);
    }
  }
  return fams;
}

// The sibling of a skin, DERIVED: the opposite-palette member of its family, or
// null when the family ships one palette. Null is a legal, expected answer — it
// is what disables the toggle — so it is not an error. An UNKNOWN id is, and
// says so by name (hrefFor precedent).
export function siblingOf(id, registry = SKINS) {
  const s = skinEntry(id, registry);
  const want = s.palette === 'dark' ? 'light' : 'dark';
  const sib = Object.keys(registry).find((other) =>
    other !== id && registry[other].family === s.family && registry[other].palette === want);
  return sib ?? null;
}

// The OS preference chooses the default palette, and it does so THROUGH the
// registry: the dark default is whatever `default` is paired with. Until a
// dark sibling is registered (Phase 1B), the dark branch falls back to
// `default`, so this changes nothing visible on its own.
export function resolveDefault(wantDark, registry = SKINS) {
  if (!wantDark) return 'default';
  return siblingOf('default', registry) ?? 'default';
}

// Safe in any environment: no matchMedia (node, old browsers) reads as light
// rather than throwing.
export function prefersDark() {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
  } catch {
    return false;
  }
}

export function hrefFor(id) {
  return skinEntry(id, SKINS).file ? `/${SKINS[id].file}` : null;
}

export function getSkin() {
  try { return localStorage.getItem(SKIN_KEY) || 'default'; } catch { return 'default'; }
}

export function setSkin(id) {
  hrefFor(id); // validates with words
  try { localStorage.setItem(SKIN_KEY, id); } catch {}
  apply();
  for (const fn of listeners) fn(id);
}

// A transient skin rides a MODE (bbs mode dresses as bbs) and never persists;
// an explicit user choice (the stored key) always wins over it.
let transient = null;
export function setTransient(id) { transient = id; apply(); }
export function clearTransient() { transient = null; apply(); }

// Resolution order: an explicit stored choice, then a mode's transient dress,
// then the OS preference. The stored choice wins over the OS in BOTH
// directions — someone who picked light on a dark-preferring machine meant it.
export function activeSkin() {
  try {
    const stored = localStorage.getItem(SKIN_KEY);
    if (stored) return stored;
  } catch { /* fall through */ }
  return transient || resolveDefault(prefersDark());
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Exported: the pre-paint boot script in index.html/404.html creates the same
// element, and apply() must ADOPT it rather than add a second sheet.
export const LINK_ID = 'skin-sheet';
export function apply() {
  const href = hrefFor(activeSkin());
  let link = document.getElementById(LINK_ID);
  if (!href) { if (link) link.remove(); return; }
  if (!link) {
    link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    document.head.append(link);
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

// ---- the scan (pure; the test suite runs it over every registered skin) ----

// Custom properties declared in a stylesheet (the token sheet).
export function declaredTokens(cssText) {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...clean.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

// A skin may only ASSIGN declared tokens. Any other declaration — a component
// property or an undeclared token — is a named violation.
export function skinScan(cssText, tokens) {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const violations = [];
  for (const m of clean.matchAll(/\{([^}]*)\}/g)) {
    for (const decl of m[1].split(';')) {
      const d = decl.trim();
      if (!d) continue;
      const prop = d.slice(0, d.indexOf(':')).trim();
      if (!prop) continue;
      if (!prop.startsWith('--')) violations.push(`component property smuggled: ${prop}`);
      else if (!tokens.has(prop)) violations.push(`undeclared token: ${prop}`);
    }
  }
  return { ok: violations.length === 0, violations };
}
