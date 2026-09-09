// Beta features: device-local switches for things the owner is trying before committing
// to them (plan 2026-09-08-plan-beta-pds-walker). Same shape as ring-scope: a
// `forage.beta.<name>` localStorage key per switch, read through every time, a listener
// set for the surfaces that must repaint. Never forage.state — a beta switch is about this
// device, like skin and density.
//
// The first switch: compute the reader's rings (mutuals, follows) with the pds-walker
// library, direct from the data servers, instead of the Bluesky AppView. Off by default:
// a beta is opt-in. It changes how the RINGS are computed and nothing else — feeds still
// come from the AppView, and World is the AppView by definition (owner, 2026-09-08).

export const BETA_PDSWALKER_KEY = 'forage.beta.pdswalker';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } };

export function pdsWalker() { return read(BETA_PDSWALKER_KEY) === '1'; }
export function setPdsWalker(on) { write(BETA_PDSWALKER_KEY, on ? '1' : '0'); notify(); }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() {
  const state = { pdsWalker: pdsWalker() };
  for (const fn of listeners) fn(state);
}
