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
//   - A skin may declare a SIBLING (`pairedWith`) — its opposite-palette twin.
//     The upper-right toggle swaps to the sibling, and is DISABLED where none
//     exists. That disabled state is deliberate and must stay visible: a user
//     on a light-only skin cannot reach dark, and a dead-looking control is
//     the honest way to say so.
// This models what forum themes actually are — phpBB ships light and dark as
// separate styles (freecad / freecad-dark), not as one style with two modes.

export const SKIN_KEY = 'forage.skin';

export const SKINS = Object.freeze({
  default: { label: 'Forage (default)', file: null, palette: 'light' },
  bbs: { label: 'Classic BBS (amber terminal)', file: 'skins/bbs.css', palette: 'dark' },
  usenet: { label: 'Usenet gray (newsprint)', file: 'skins/usenet.css', palette: 'light' },
});

// The sibling of a skin, or null when it ships only one palette. Null is a
// legal, expected answer — it is what disables the toggle — so it is not an
// error. An UNKNOWN id is, and says so by name (hrefFor precedent).
export function siblingOf(id, registry = SKINS) {
  const s = registry[id];
  if (!s) throw new Error(`unknown skin: ${id} (known: ${Object.keys(registry).join(', ')})`);
  return s.pairedWith ?? null;
}

// Pairing is data, and bad pairing data is silent breakage: a toggle that
// lands nowhere, or bounces between two skins of the same tone. Validate it
// loudly instead, and run this over the real registry from the test suite.
export function validatePairing(registry = SKINS) {
  for (const [id, s] of Object.entries(registry)) {
    const pair = s.pairedWith;
    if (pair == null) continue;
    if (pair === id) throw new Error(`skin ${id} is paired with itself`);
    const other = registry[pair];
    if (!other) throw new Error(`skin ${id} is paired with ${pair}, which is not registered`);
    if (other.pairedWith !== id) {
      throw new Error(`pairing is not symmetric: ${id} points at ${pair}, but ${pair} points at ${other.pairedWith ?? 'nothing'}`);
    }
    if (other.palette === s.palette) {
      throw new Error(`skins ${id} and ${pair} are paired but share palette '${s.palette}' — a sibling is the OPPOSITE palette`);
    }
  }
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
  const s = SKINS[id];
  if (!s) throw new Error(`unknown skin: ${id} (known: ${Object.keys(SKINS).join(', ')})`);
  return s.file ? `/${s.file}` : null;
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

const LINK_ID = 'skin-sheet';
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
