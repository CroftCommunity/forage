// Who has answered a reel with a frame before, per mode, on this device
// (plan 2026-09-14-plan-clips, § B bound 2). A HINT, read by the wave planner
// to ask known posters first on a cold wave: nothing here decides who is in a
// scope, only who is asked before whom. Device-local; never forage.state.
//
// Bounded, newest last, so a long-lived device does not carry every account
// that ever posted a clip. Every read is a repair (garbage reads as nothing
// known); writes refuse an unknown mode by name.
import { MODE_IDS } from './view-mode.js';

export const KEY = 'forage.media-posters';
const CAP = 500;

const read = () => {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return {}; }
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
};
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

const check = (mode) => { if (!MODE_IDS.includes(mode) || mode === 'forum') throw new Error(`media-posters: ${mode} is not a reel mode`); };

export function known(mode) {
  check(mode);
  const list = read()[mode];
  return new Set(Array.isArray(list) ? list.filter((d) => typeof d === 'string') : []);
}

export function remember(mode, dids) {
  check(mode);
  const all = read();
  const had = Array.isArray(all[mode]) ? all[mode].filter((d) => typeof d === 'string') : [];
  const next = [...had.filter((d) => !dids.includes(d)), ...dids];
  all[mode] = next.slice(-CAP);
  write(all);
}

export function clear() { try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ } }
