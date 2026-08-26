// Skins (4a) — a skin is a TOKEN-SHEET SWAP: an extra stylesheet that may only
// assign custom properties declared in css/tokens.css, applied via one managed
// <link>. Skins and modes are independent axes (user, 2026-08-25): any skin in
// any mode — the BBS skin in the Bluesky view is legal, just off-theme. The
// preference is device-local (theme.js precedent), never forage.state.
// test/skins.test.js enforces the token-only rule with a static scan.

export const SKIN_KEY = 'forage.skin';

export const SKINS = Object.freeze({
  default: { label: 'Forage (default)', file: null },
  bbs: { label: 'Classic BBS (amber terminal)', file: 'skins/bbs.css' },
  usenet: { label: 'Usenet gray (newsprint)', file: 'skins/usenet.css' },
});

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

export function activeSkin() {
  try {
    if (localStorage.getItem(SKIN_KEY)) return localStorage.getItem(SKIN_KEY);
  } catch { /* fall through */ }
  return transient || 'default';
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
