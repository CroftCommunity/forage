// The feed index — plan 2026-09-08-plan-feed-index-and-jumpstarts.
//
// A FILE with a published shape: what feeds and jumpstarts exist, what they
// are about (topic, language, community — none of which the protocol carries,
// D4), and which jumpstart names which feed (the edges, D7). It carries NO
// counts: likes and joins are free at read time and moved on a feed within
// fifteen minutes of a run (D2), so a count inside the file would churn the
// one diff a weekly job produces. A BAND is the rank hint instead.
//
// This module is the pure core both sides of the file share. The harvest
// (scripts/harvest-feeds.mjs, Node) builds and validates before it writes; the
// app (js/feed-index-store.js, browser) validates on the way IN and refuses a
// malformed file with words — LEXICONS.md rule 4 applied to our own artifact:
// a bad index is our bug, and it must fail loud, never render garbage. The
// same validator governs a forager's OWN index (D-own): replace ours, add to
// it, or turn it off, and the file format — not our hosting — is the interface.
//
// Nothing here touches the network or the DOM.

export const INDEX_VERSION = 1;

// A band is a decimal magnitude of the all-time count at harvest time. Five
// of them, so a first paint has an order before the live counts arrive and
// the file never carries a number that moves.
export const BANDS = Object.freeze([0, 1, 2, 3, 4]);
export function bandOf(n) {
  if (!Number.isFinite(n) || n < 10) return 0;
  if (n < 100) return 1;
  if (n < 1000) return 2;
  if (n < 10000) return 3;
  return 4;
}

// Who a provider row is: a curating account, a community's infrastructure
// account, the network operator's own, or a feed-builder platform.
export const PROVIDER_KINDS = Object.freeze(['curator', 'community', 'official', 'platform']);
export const SOURCES = Object.freeze(['forage', 'mine']);
export const DESC_MAX = 160;

const GENERATOR = /^at:\/\/did:[a-z]+:[A-Za-z0-9._:%-]+\/app\.bsky\.feed\.generator\/[^/\s]+$/;
const STARTERPACK = /^at:\/\/did:[a-z]+:[A-Za-z0-9._:%-]+\/app\.bsky\.graph\.starterpack\/[^/\s]+$/;

export function emptyIndex() {
  return { v: INDEX_VERSION, feeds: [], jumpstarts: [], edges: [], providers: [] };
}

// ---- the validator ----
// Every error names the row it is about (`feeds[12]: …`), because the file it
// most needs to explain is one a forager brought and cannot read as JSON.

const isStr = (x) => typeof x === 'string';
const isStrArray = (x) => Array.isArray(x) && x.every(isStr);

function rowErrors(row, i, table, { uriRe, kindWord, extra }) {
  const at = `${table}[${i}]`;
  const errs = [];
  if (!row || typeof row !== 'object') return [`${at}: not an object`];
  if (!isStr(row.uri) || !uriRe.test(row.uri)) errs.push(`${at}: uri is not a ${kindWord} at-uri: ${JSON.stringify(row.uri)}`);
  if (!isStr(row.name) || !row.name.trim()) errs.push(`${at}: name is empty`);
  if (row.desc !== undefined && (!isStr(row.desc) || row.desc.length > DESC_MAX)) errs.push(`${at}: desc must be a string of at most ${DESC_MAX} characters`);
  if (!isStr(row.creator) || !row.creator.trim()) errs.push(`${at}: creator is empty`);
  if (!Number.isInteger(row.band) || row.band < 0 || row.band > 4) errs.push(`${at}: band must be 0–4, got ${JSON.stringify(row.band)}`);
  if (!isStrArray(row.tags)) errs.push(`${at}: tags must be a list of strings`);
  if (row.lang !== undefined && !isStr(row.lang)) errs.push(`${at}: lang must be a string`);
  if (row.labels !== undefined && !isStrArray(row.labels)) errs.push(`${at}: labels must be a list of strings`);
  if (row.source !== undefined && !SOURCES.includes(row.source)) errs.push(`${at}: source must be one of ${SOURCES.join(', ')}`);
  errs.push(...extra(row, at));
  return errs;
}

const feedExtra = (row, at) => {
  const e = [];
  if (row.platform !== null && row.platform !== undefined && !isStr(row.platform)) e.push(`${at}: platform must be a host name or null`);
  if (row.video !== undefined && typeof row.video !== 'boolean') e.push(`${at}: video must be true or false`);
  return e;
};
const packExtra = (row, at) => (Number.isInteger(row.members) && row.members >= 0 ? [] : [`${at}: members must be a whole number`]);

function tableErrors(rows, table, opts) {
  const errs = [];
  const seen = new Set();
  let prev = null;
  rows.forEach((row, i) => {
    errs.push(...rowErrors(row, i, table, opts));
    const uri = row?.uri;
    if (!isStr(uri)) return;
    if (seen.has(uri)) errs.push(`${table}[${i}]: duplicate uri ${uri}`);
    else if (prev !== null && prev > uri) errs.push(`${table}: not sorted by uri at [${i}] (${uri} after ${prev})`);
    seen.add(uri);
    prev = uri;
  });
  return errs;
}

export function validateIndex(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['not an index: expected an object'] };
  if (obj.v !== INDEX_VERSION) errors.push(`version: expected ${INDEX_VERSION}, got ${JSON.stringify(obj.v)}`);
  for (const t of ['feeds', 'jumpstarts', 'edges', 'providers']) {
    if (!Array.isArray(obj[t])) errors.push(`${t}: missing or not a list`);
  }
  if (errors.length) return { ok: false, errors };

  errors.push(...tableErrors(obj.feeds, 'feeds', { uriRe: GENERATOR, kindWord: 'feed generator', extra: feedExtra }));
  errors.push(...tableErrors(obj.jumpstarts, 'jumpstarts', { uriRe: STARTERPACK, kindWord: 'starter pack', extra: packExtra }));

  const feedUris = new Set(obj.feeds.map((f) => f?.uri));
  const packUris = new Set(obj.jumpstarts.map((p) => p?.uri));
  obj.edges.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== 2 || !isStr(e[0]) || !isStr(e[1])) { errors.push(`edges[${i}]: expected [jumpstartUri, feedUri]`); return; }
    if (!packUris.has(e[0])) errors.push(`edges[${i}]: jumpstart ${e[0]} is not in the index`);
    if (!feedUris.has(e[1])) errors.push(`edges[${i}]: feed ${e[1]} is not in the index`);
  });

  const handles = new Set();
  obj.providers.forEach((p, i) => {
    const at = `providers[${i}]`;
    if (!p || typeof p !== 'object') { errors.push(`${at}: not an object`); return; }
    if (!isStr(p.handle) || !p.handle.trim()) errors.push(`${at}: handle is empty`);
    else if (handles.has(p.handle)) errors.push(`${at}: duplicate handle ${p.handle}`);
    handles.add(p.handle);
    if (!PROVIDER_KINDS.includes(p.kind)) errors.push(`${at}: kind must be one of ${PROVIDER_KINDS.join(', ')}, got ${JSON.stringify(p.kind)}`);
    if (!isStrArray(p.tags)) errors.push(`${at}: tags must be a list of strings`);
  });
  return { ok: errors.length === 0, errors };
}

// ---- merge: the forager's index over ours (D-own) ----
// Theirs wins on a uri collision, edges and providers union, and every row
// says whose it is, so the UI can always show whose editorial act a reader is
// looking at. Inputs are not touched.

const byUri = (a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);
const byHandle = (a, b) => (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0);

function mergeRows(base, mine) {
  const m = new Map();
  for (const r of base) m.set(r.uri, { ...r, source: r.source || 'forage' });
  for (const r of mine) m.set(r.uri, { ...r, source: 'mine' });
  return [...m.values()].sort(byUri);
}

export function mergeIndexes(base, mine) {
  const edges = new Map();
  for (const e of [...base.edges, ...mine.edges]) edges.set(`${e[0]}\n${e[1]}`, [e[0], e[1]]);
  const providers = new Map();
  for (const p of [...base.providers, ...mine.providers]) providers.set(p.handle, { ...p });
  return {
    v: INDEX_VERSION,
    feeds: mergeRows(base.feeds, mine.feeds),
    jumpstarts: mergeRows(base.jumpstarts, mine.jumpstarts),
    edges: [...edges.values()].sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1)),
    providers: [...providers.values()].sort(byHandle),
  };
}

// ---- search: no index structure, on purpose (D9) ----
// A substring scan over ~3,000 rows is under a tenth of a millisecond. Ranked
// by band, then name, so the order is the same on every device and every run.

const hay = (r) => `${r.name} ${r.desc || ''} ${r.creator} ${(r.tags || []).join(' ')}`.toLowerCase();
const byRank = (a, b) => (b.band - a.band) || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0);

export function searchIndex(index, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return { feeds: [], jumpstarts: [] };
  const pick = (rows) => rows.filter((r) => hay(r).includes(needle)).sort(byRank);
  return { feeds: pick(index.feeds), jumpstarts: pick(index.jumpstarts) };
}

// ---- edges, both ways, from one list ----

export function edgeMaps(index) {
  const feedsInPack = new Map();
  const packsWithFeed = new Map();
  for (const [pack, feed] of index.edges) {
    if (!feedsInPack.has(pack)) feedsInPack.set(pack, []);
    feedsInPack.get(pack).push(feed);
    if (!packsWithFeed.has(feed)) packsWithFeed.set(feed, []);
    packsWithFeed.get(feed).push(pack);
  }
  return { feedsInPack, packsWithFeed };
}

// ---- language: what the protocol does not carry (D4) ----
// Script first, because it is unambiguous; Latin-script languages need two
// stopword hits, because one is not evidence ("de" is a Dutch surname
// particle and a Portuguese preposition). English is the DEFAULT of the
// network, never a detection — null means "nothing said otherwise".

const SCRIPTS = [
  ['HIRAGANA', /\p{Script=Hiragana}/u], ['KATAKANA', /\p{Script=Katakana}/u], ['CJK', /\p{Script=Han}/u],
  ['HANGUL', /\p{Script=Hangul}/u], ['CYRILLIC', /\p{Script=Cyrillic}/u], ['ARABIC', /\p{Script=Arabic}/u],
  ['HEBREW', /\p{Script=Hebrew}/u], ['THAI', /\p{Script=Thai}/u], ['GREEK', /\p{Script=Greek}/u],
  ['DEVANAGARI', /\p{Script=Devanagari}/u], ['BENGALI', /\p{Script=Bengali}/u], ['TAMIL', /\p{Script=Tamil}/u],
  ['LATIN', /\p{Script=Latin}/u],
];

export function scriptOf(text) {
  const counts = new Map();
  for (const ch of String(text || '')) {
    if (!/\p{L}/u.test(ch)) continue;
    const hit = SCRIPTS.find(([, re]) => re.test(ch));
    if (hit) counts.set(hit[0], (counts.get(hit[0]) || 0) + 1);
  }
  if (!counts.size) return 'NONE';
  // Latin is the network's default and shows up inside every other script's
  // names (a hashtag, a brand) — two letters of anything else outweigh it.
  const other = [...counts].filter(([s, n]) => s !== 'LATIN' && n >= 2);
  const pool = other.length ? other : [...counts];
  return pool.sort((a, b) => b[1] - a[1])[0][0];
}

const SCRIPT_LANG = { HIRAGANA: 'ja', KATAKANA: 'ja', CJK: 'ja', HANGUL: 'ko', ARABIC: 'ar', HEBREW: 'he',
  THAI: 'th', GREEK: 'el', DEVANAGARI: 'hi', BENGALI: 'bn', TAMIL: 'ta' };
const STOPWORDS = {
  pt: ['de', 'da', 'do', 'dos', 'das', 'para', 'não', 'você', 'notícias', 'brasil', 'português', 'com', 'em', 'uma'],
  es: ['de', 'los', 'las', 'para', 'español', 'noticias', 'con', 'una', 'todos', 'que'],
  fr: ['de', 'les', 'des', 'une', 'pour', 'français', 'sur', 'avec', 'actualités'],
  de: ['der', 'und', 'die', 'für', 'deutsch', 'mit', 'auf', 'beiträge', 'nachrichten'],
  it: ['di', 'che', 'per', 'gli', 'italiano', 'con', 'una', 'notizie'],
  nl: ['van', 'het', 'een', 'voor', 'nederlands', 'met', 'nieuws'],
  pl: ['polski', 'dla', 'posty', 'nie', 'jest', 'wiadomości', 'się'],
  tr: ['ve', 'için', 'türkçe', 'bir', 'ile', 'haber'],
  id: ['yang', 'dan', 'untuk', 'indonesia', 'dengan', 'berita'],
};

export function langHint(text) {
  const s = scriptOf(text);
  if (s === 'CYRILLIC') return /[іїєґ]/i.test(text) ? 'uk' : 'ru';
  if (SCRIPT_LANG[s]) return SCRIPT_LANG[s];
  if (s !== 'LATIN') return null;
  const tokens = String(text).toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  let best = null;
  for (const [lang, words] of Object.entries(STOPWORDS)) {
    const set = new Set(words);
    const n = tokens.filter((t) => set.has(t)).length;
    if (n >= 2 && (!best || n > best[1])) best = [lang, n];
  }
  return best ? best[0] : null;
}
