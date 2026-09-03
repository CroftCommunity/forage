// MOCK SWITCH — plans/mocks/self-thread.html, pending the owner's decision.
//
// A post's own continuation chain (the author replying to themselves, 1/3 →
// 2/3 → 3/3) can be drawn two ways, and the two are what the mock puts side by
// side. Both render the SAME nodes from the SAME builder; only placement moves:
//
//   hoist  the chain is the post's BODY — the parts sit inside the head card,
//          under the post's own words and picture. forage's forum shape: one
//          post header carrying the whole narrative.
//   pin    the chain is the first thing in the comment list, each part an
//          ordinary post carrying a "2/3" badge. What Bluesky itself does
//          (app.bsky.unspecced.defs#threadItemPost `opThread`, shipped to
//          every user 2026-09-02) — the parts keep their own controls because
//          they never stopped being posts.
//
// This exists so scripts/mock-snaps.mjs can capture both from the engine
// rather than draw them (MOCKS.md P1). The landing that follows the owner's
// decision collapses it to the chosen one and deletes this file.
export const KEY = 'forage.selfthread';
export const MODES = Object.freeze(['hoist', 'pin']);
export const DEFAULT = 'hoist';

export function active() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return DEFAULT; }
  return MODES.includes(raw) ? raw : DEFAULT;
}
