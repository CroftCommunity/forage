// Mixes — the reader's composed boards (plan 2026-09-08). A mix is rows of
// { source, on, weight } over the reader's subscriptions; Home is the mix
// that starts with every subscription on.
//
// Two shapes of mix, deliberately different (decision D3 and § A of the plan):
//
//   Home stores OVERRIDES ONLY. Its definition is "every subscription, on, at
//   Normal", so a feed the reader saves tomorrow is in Home tomorrow without
//   anyone visiting the Mixes page. A default that has to be maintained is not
//   a default.
//
//   A custom mix stores its rows in full and starts EMPTY — every subscription
//   listed, every switch off — because a mix is picked into.
//
// One number per row, a MULTIPLIER (decision D1, owner 2026-09-08: "I want more
// of this in this mix, but it has to play nice with top etc sort"): ×½ · ×1 ·
// ×2, Less · Normal · More. The deal reads it as a share, Top and Hot as a
// factor on the score; this module only stores it. Off is the SWITCH, not a
// fourth notch, and the switch remembers the weight (D2): a row turned back on
// comes back where the reader left it. "Deweighted to 0 effectively" is what
// the substrate sees — enabledRows() simply omits the row.
//
// Device-local, like the ring and the density dial (D4: "device local for
// now, yes, pds later, yes"). Rows are keyed by a stable SOURCE ID so the
// document would serialise into a fyi.forage.mix record unchanged when that
// day comes.
//
// This module never reaches for the lens or tagsubs. The caller hands it the
// subscriptions (subscriptions()), so every read is replayable with no session
// — the rule the retired ring board learned the hard way.
//
// Every read is a REPAIR, not a parse (the ring-scope tenet): a weight off the
// notches is clamped, a row for a subscription the reader has since dropped is
// kept and marked rather than lost, a corrupt document reads as Home alone.
// Writes refuse by name.

export const MIXES_KEY = 'forage.mixes';
export const HOME = 'home';
export const WEIGHTS = Object.freeze([0.5, 1, 2]);
export const DEFAULT_WEIGHT = 1;
const LABELS = { 0.5: 'Less', 1: 'Normal', 2: 'More' };
export const weightLabel = (w) => LABELS[w] || null;

// ---- sources ----

const TAG_NORM = (t) => String(t || '').trim().replace(/^#/, '').toLowerCase();

export function sourceId(source) {
  switch (source?.kind) {
    case 'timeline': return 'timeline';
    case 'feed': return `feed:${source.uri}`;
    case 'list': return `list:${source.uri}`;
    case 'hashtag': return `hashtag:${TAG_NORM(source.tag)}`;
    default: throw new Error(`mixes: not a mix source: ${JSON.stringify(source)}`);
  }
}

export function sourceFromId(id) {
  if (id === 'timeline') return { kind: 'timeline' };
  const i = String(id).indexOf(':');
  const kind = String(id).slice(0, i), rest = String(id).slice(i + 1);
  if (kind === 'feed' || kind === 'list') return { kind, uri: rest };
  if (kind === 'hashtag') return { kind, tag: rest };
  throw new Error(`mixes: not a source id: ${id}`);
}

// The reader's subscriptions, in the shape the caller already has: the saved
// feeds as lens.feeds() returns them (timeline included) and the effective
// tag list. Timeline first, then the feeds in their saved order, then tags.
export function subscriptions({ feeds = [], tags = [] } = {}) {
  const fromFeeds = feeds
    .filter((f) => ['timeline', 'feed', 'list'].includes(f.kind))
    .map((f) => {
      const source = f.kind === 'timeline' ? { kind: 'timeline' } : { kind: f.kind, uri: f.uri };
      return { id: sourceId(source), kind: f.kind, source, title: f.title || f.slug || f.uri };
    });
  const timeline = fromFeeds.filter((s) => s.kind === 'timeline');
  const rest = fromFeeds.filter((s) => s.kind !== 'timeline');
  const fromTags = tags.map((t) => {
    const source = { kind: 'hashtag', tag: TAG_NORM(t) };
    return { id: sourceId(source), kind: 'hashtag', source, title: `#${TAG_NORM(t)}` };
  });
  return [...timeline, ...rest, ...fromTags];
}

// ---- storage ----

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } };

const clampWeight = (w) => (WEIGHTS.includes(w) ? w : DEFAULT_WEIGHT);
const repairRow = (r) => ({ on: r?.on === true || r?.on === false ? r.on : true, weight: clampWeight(r?.weight) });
const repairRows = (rows) => (rows && typeof rows === 'object' && !Array.isArray(rows)
  ? Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, repairRow(r)]))
  : {});

const EMPTY_DOC = () => ({ home: { name: 'Home', overrides: {} }, mixes: [] });

// The document: { home: { name, overrides: {id: {on, weight}} },
//                 mixes: [{ slug, name, rows: {id: {on, weight}} }] }
function doc() {
  const raw = read(MIXES_KEY);
  if (!raw) return EMPTY_DOC();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return EMPTY_DOC(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_DOC();
  const home = {
    name: typeof parsed.home?.name === 'string' && parsed.home.name.trim() ? parsed.home.name : 'Home',
    overrides: repairRows(parsed.home?.overrides),
  };
  const mixes = Array.isArray(parsed.mixes)
    ? parsed.mixes
      .filter((m) => m && typeof m.slug === 'string' && m.slug && m.slug !== HOME)
      .map((m) => ({ slug: m.slug, name: typeof m.name === 'string' && m.name.trim() ? m.name : m.slug, rows: repairRows(m.rows) }))
    : [];
  return { home, mixes };
}

const save = (d) => { write(MIXES_KEY, JSON.stringify(d)); notify(); };

// ---- reads ----

export function mixes() {
  const d = doc();
  return [{ slug: HOME, name: d.home.name, home: true }, ...d.mixes.map((m) => ({ slug: m.slug, name: m.name, home: false }))];
}

function stored(d, slug) {
  if (slug === HOME) return { slug: HOME, name: d.home.name, home: true, rows: d.home.overrides };
  const m = d.mixes.find((x) => x.slug === slug);
  if (!m) throw new Error(`mixes: no mix named ${slug}`);
  return { slug, name: m.name, home: false, rows: m.rows };
}

// The mix as the page draws it: one row per subscription — in Home on at
// Normal unless overridden, in a custom mix off unless stored — then any
// stored row whose subscription the reader has since dropped, last and marked
// `subscribed: false` so it can be seen and removed rather than silently lost.
export function mix(slug, subs = []) {
  const s = stored(doc(), slug);
  const dflt = s.home ? { on: true, weight: DEFAULT_WEIGHT } : { on: false, weight: DEFAULT_WEIGHT };
  const live = subs.map((sub) => ({ ...sub, ...(s.rows[sub.id] || dflt), subscribed: true }));
  const known = new Set(subs.map((sub) => sub.id));
  const orphans = Object.entries(s.rows)
    .filter(([id]) => !known.has(id))
    .map(([id, r]) => ({ id, kind: sourceFromId(id).kind, source: sourceFromId(id), title: id, ...r, subscribed: false }));
  return { slug: s.slug, name: s.name, home: s.home, rows: [...live, ...orphans] };
}

// What the substrate fetches: on, still subscribed, with the weight. A row
// switched off is not a queue at all.
export function enabledRows(slug, subs = []) {
  return mix(slug, subs).rows.filter((r) => r.on && r.subscribed);
}

// ---- writes ----

export function setRow(slug, id, { on, weight } = {}) {
  const d = doc();
  const target = slug === HOME ? d.home.overrides : d.mixes.find((m) => m.slug === slug)?.rows;
  if (!target) throw new Error(`mixes: no mix named ${slug}`);
  if (weight !== undefined && !WEIGHTS.includes(weight)) {
    throw new Error(`mixes: weight ${weight} is not a notch (${WEIGHTS.join(', ')}) — Off is the switch, not a weight`);
  }
  const prev = target[id] || (slug === HOME ? { on: true, weight: DEFAULT_WEIGHT } : { on: false, weight: DEFAULT_WEIGHT });
  target[id] = { on: on === undefined ? prev.on : !!on, weight: weight === undefined ? prev.weight : weight };
  save(d);
}

export const slugOf = (name) => String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function createMix(name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('mixes: a mix needs a name');
  const slug = slugOf(clean);
  if (!slug) throw new Error(`mixes: "${clean}" leaves no slug once trimmed to letters and digits`);
  if (slug === HOME) throw new Error('mixes: "home" is the Home mix, and there is only one');
  const d = doc();
  if (d.mixes.some((m) => m.slug === slug)) throw new Error(`mixes: a mix named ${slug} already exists`);
  d.mixes.push({ slug, name: clean, rows: {} });
  save(d);
  return slug;
}

export function renameMix(slug, name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('mixes: a mix needs a name');
  const d = doc();
  if (slug === HOME) d.home.name = clean;
  else {
    const m = d.mixes.find((x) => x.slug === slug);
    if (!m) throw new Error(`mixes: no mix named ${slug}`);
    m.name = clean; // the slug is the address and stays
  }
  save(d);
}

export function deleteMix(slug) {
  if (slug === HOME) throw new Error('mixes: Home cannot be deleted — it is the mix every subscription starts in');
  const d = doc();
  if (!d.mixes.some((m) => m.slug === slug)) throw new Error(`mixes: no mix named ${slug}`);
  d.mixes = d.mixes.filter((m) => m.slug !== slug);
  save(d);
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { const state = { mixes: mixes() }; for (const fn of listeners) fn(state); }
