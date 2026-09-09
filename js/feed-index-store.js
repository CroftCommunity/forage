// The index store — plan 2026-09-08-plan-feed-index-and-jumpstarts,
// Phases 2 and 2b.
//
// Loads data/feed-index.json SAME-ORIGIN (it ships with the app and sw.js
// caches it with the shell, so it is there offline), validates it on the way
// in, and refuses a malformed file with the validator's words — the page then
// falls back to the browse corpus, never to garbage and never to nothing.
//
// D-own: the forager's OWN index folds in here too. `own` is { mode, index }
// from js/index-prefs.js — 'forage' (ours), 'replace' (theirs alone; ours is
// not even fetched), 'add' (theirs over ours, theirs winning on a uri), 'off'
// (no index at all; discovery is the live browse corpus). Their file goes
// through the same validator, and a rejected one leaves the previous good
// index standing, with the errors kept so the settings page can print which
// row and why.
//
// Reads are synchronous once ready(): the views paint from memory (D9 — a
// substring scan over the whole file is under a tenth of a millisecond).
import { validateIndex, mergeIndexes, searchIndex, edgeMaps, emptyIndex } from './feed-index.js';

export const INDEX_URL = '/data/feed-index.json';
export const META_URL = '/data/feed-index-meta.json';

const mark = (index, source) => ({
  ...index,
  feeds: index.feeds.map((r) => ({ ...r, source: r.source || source })),
  jumpstarts: index.jumpstarts.map((r) => ({ ...r, source: r.source || source })),
});

async function fetchJson(fetchImpl, url) {
  const r = await fetchImpl(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export async function loadIndex({ fetchImpl = (u) => fetch(u), own = null } = {}) {
  const errors = [];
  const mode = own?.mode || 'forage';
  if (mode === 'off') return { status: 'off', index: emptyIndex(), generatedAt: null, errors };

  // the forager's file first: if it is good and replaces ours, ours is not fetched
  let mine = null;
  if ((mode === 'replace' || mode === 'add') && own?.index) {
    const v = validateIndex(own.index);
    if (v.ok) mine = own.index;
    else errors.push(...v.errors.map((e) => `your index: ${e}`));
  }
  if (mode === 'replace' && mine) return { status: 'mine', index: mark(mine, 'mine'), generatedAt: own.generatedAt || null, errors };

  let ours = null;
  let generatedAt = null;
  try {
    const raw = await fetchJson(fetchImpl, INDEX_URL);
    const v = validateIndex(raw);
    if (v.ok) ours = raw;
    else { errors.push(...v.errors); return { status: 'invalid', index: emptyIndex(), generatedAt: null, errors }; }
  } catch (e) {
    errors.push(`${INDEX_URL}: ${e.message}`);
    return { status: 'missing', index: emptyIndex(), generatedAt: null, errors };
  }
  try { generatedAt = (await fetchJson(fetchImpl, META_URL)).generatedAt || null; } catch { generatedAt = null; }

  if (mode === 'add' && mine) return { status: 'merged', index: mergeIndexes(ours, mine), generatedAt, errors };
  return { status: 'forage', index: mark(ours, 'forage'), generatedAt, errors };
}

export function createIndexStore({ fetchImpl = (u) => fetch(u), own = null } = {}) {
  let state = { status: 'loading', index: emptyIndex(), generatedAt: null, errors: [] };
  let maps = edgeMaps(state.index);
  let feedByUri = new Map();
  let packByUri = new Map();
  let pending = null;
  let currentOwn = own;

  const adopt = (s) => {
    state = s;
    maps = edgeMaps(s.index);
    feedByUri = new Map(s.index.feeds.map((r) => [r.uri, r]));
    packByUri = new Map(s.index.jumpstarts.map((r) => [r.uri, r]));
  };
  const load = () => loadIndex({ fetchImpl, own: currentOwn }).then(adopt);

  return {
    ready() { if (!pending) pending = load(); return pending; },
    reload(nextOwn) { currentOwn = nextOwn === undefined ? currentOwn : nextOwn; pending = load(); return pending; },
    status() { return { status: state.status, generatedAt: state.generatedAt, errors: state.errors,
      counts: { feeds: state.index.feeds.length, jumpstarts: state.index.jumpstarts.length, edges: state.index.edges.length } }; },
    feeds() { return state.index.feeds; },
    jumpstarts() { return state.index.jumpstarts; },
    providers() { return state.index.providers; },
    feed(uri) { return feedByUri.get(uri) || null; },
    jumpstart(uri) { return packByUri.get(uri) || null; },
    search(q) { return searchIndex(state.index, q); },
    feedsInPack(uri) { return maps.feedsInPack.get(uri) || []; },
    packsWithFeed(uri) { return maps.packsWithFeed.get(uri) || []; },
  };
}
