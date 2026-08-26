// The presentation mode (3h) — WHICH POPULATION the app is: the Bluesky view
// (the live network as a forum) or the memory sandbox. Mutually exclusive by
// design (user, 2026-08-26): one route namespace, resolved by the active
// mode; no cross-population chrome. Distinct from STORE modes (js/store.js
// enterMode/exitMode — the bbs lifecycle): this axis decides what the app IS,
// that one manages a dataset. Device-local like theme/skin; clearing the
// choice accepts the domain default.

const KEY = 'forage.mode';

export const DOMAIN_DEFAULT = 'bluesky';

export const PRESENTATIONS = Object.freeze({
  bluesky: { label: 'Bluesky view', blurb: 'The live network as a forum — topic-first, sign in for your ring.' },
  memory: { label: 'Memory sandbox', blurb: 'Local-only, seeded, yours to wreck. Nothing leaves this device.' },
});

export function stored() {
  try {
    const v = localStorage.getItem(KEY);
    return PRESENTATIONS[v] ? v : null; // garbage reads as no choice
  } catch { return null; }
}

export function active() {
  return stored() ?? DOMAIN_DEFAULT;
}

export function set(m) {
  if (!PRESENTATIONS[m]) {
    throw new Error(`unknown presentation mode: ${m} (known: ${Object.keys(PRESENTATIONS).join(', ')})`);
  }
  try { localStorage.setItem(KEY, m); } catch {}
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch {}
}
