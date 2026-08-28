// The emblem hero's dismissal state (plan 2026-08-26-3, Phase D).
//
// Device-local, like skin and density, and NEVER forage.state — the Bluesky
// population writes nothing to the event log and test/store-modes.test.js is
// the teeth on that.
//
// Dismissal NEVER expires (owner, 2026-08-27). That is only safe because the
// sticky masthead landed first and keeps sign-in on screen for someone who
// dismissed the hero; without it, one tap would remove the only front door
// permanently. There is deliberately no timestamp here: an expiry is another
// thing that can be got wrong later, and "it came back" is a worse surprise
// than "it stayed gone".
//
// This module owns PERSISTENCE only. Removing the node is the view's job, so a
// reader in private mode still gets a ✕ that does something — it hides the hero
// for this visit and forgets. A control that silently no-ops because storage is
// blocked is worse than one that is honest about its reach.

export const HERO_KEY = 'forage.hero.dismissed';

// The one value that counts as dismissed. Anything else — a half-written key,
// a value from a future version of this file, a browser extension's leavings —
// means SHOWN. Fail open, per the getSkin() precedent: a hero that vanishes
// because of a value nobody wrote on purpose is a front door nobody can get
// back, on a device where the reader never asked for that.
const DISMISSED = 'yes';

export function heroDismissed() {
  try { return localStorage.getItem(HERO_KEY) === DISMISSED; }
  catch { return false; }
}

export function dismissHero() {
  try { localStorage.setItem(HERO_KEY, DISMISSED); }
  catch { /* private mode, quota, blocked storage: the view still hides it */ }
}
