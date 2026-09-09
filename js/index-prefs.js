// D-own — plan 2026-09-08-plan-feed-index-and-jumpstarts, Phase 2b: the
// forager's OWN discovery index.
//
// A prepopulated index is an editorial act — whoever writes feed-providers.json
// decides what a forager finds first — and left as ours alone it is a central
// authority in a project whose reason for existing is that there should not
// be one. So the forager can dump ours: REPLACE it with their own file, ADD
// theirs over ours (theirs winning on a uri), or turn the index OFF and browse
// the live corpus alone. Their file goes through the same validator ours does
// (js/feed-index.js), and a file that fails is refused with its words while
// the previous good one stays.
//
// Device-local like the card size and the rail (owner, 2026-09-08: "user
// manageable … equitable … LTS thinking … independence from a central
// authority"); the PDS record that follows the reader is the named
// follow-up, on the path mixes walked. A corrupt stored value reads as NO
// choice — ours — never as an empty page.

import { validateIndex } from './feed-index.js';

export const KEY = 'forage.feedindex';
export const MODES = Object.freeze(['forage', 'replace', 'add', 'off']);

function read() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return {}; }
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

function write(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: the index still works for this visit */ }
}

// The stored own index, re-validated on every read: what was valid when it
// was stored may not be under a newer validator, and a stale file must not
// take the page down with it.
export function own() {
  const o = read().own;
  if (!o || typeof o !== 'object' || !o.index) return null;
  if (!validateIndex(o.index).ok) return null;
  return { index: o.index, name: o.name || null, generatedAt: o.generatedAt || null };
}

export function mode() {
  const m = read().mode;
  return MODES.includes(m) ? m : 'forage';
}

export function setMode(m) {
  if (!MODES.includes(m)) throw new Error(`index mode must be one of ${MODES.join(', ')}, got ${JSON.stringify(m)}`);
  write({ ...read(), mode: m });
}

// Validates BEFORE storing: a refused file leaves the previous one in place
// and the caller gets the validator's words to print. A newly stored file
// defaults the mode to 'add' — the least surprising outcome of "here is my
// list" is "and here is ours too", and Replace is one press away.
export function setOwn({ index, name = null, now = Date.now() }) {
  const v = validateIndex(index);
  if (!v.ok) throw new Error(`your index was not stored:\n${v.errors.slice(0, 8).join('\n')}`);
  const cur = read();
  write({ ...cur, mode: cur.mode === 'replace' ? 'replace' : 'add',
    own: { index, name, generatedAt: new Date(now).toISOString() } });
}

export function clearOwn() {
  write({ mode: 'forage' });
}

// What the substrate should load: the EFFECTIVE mode. 'replace' and 'add'
// with nothing stored are 'forage' — a mode with no file behind it is a wish,
// not a state, and the page must not go empty over it.
export function current() {
  const m = mode();
  const o = own();
  if ((m === 'replace' || m === 'add') && !o) return { mode: 'forage', index: null, generatedAt: null, name: null };
  if (m === 'forage' || m === 'off') return { mode: m, index: null, generatedAt: null, name: null };
  return { mode: m, index: o.index, generatedAt: o.generatedAt, name: o.name };
}

// A pasted or uploaded file → an index, or a refusal a person can read.
export function parseOwnText(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return { ok: false, errors: [`not JSON: ${e.message}`] }; }
  const v = validateIndex(parsed);
  return v.ok ? { ok: true, index: parsed } : { ok: false, errors: v.errors };
}
