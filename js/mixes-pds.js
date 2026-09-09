// Mixes that live in your repo — the published half (plan 2026-09-08
// mixes-on-the-pds, Phase 3), on the tagsub pattern: js/mixes.js is the
// device half and never learns the network exists; this module holds a
// per-DID cache of what the repo holds and the ONE list the rest of the app
// reads (effectiveMixes / effectiveMix / effectiveEnabledRows).
//
// The two halves are DISJOINT: publishing moves a mix out of the device,
// unpublishing moves it back. On a slug collision the published one wins —
// the record is the one that follows the reader between devices, so it is
// the one that is true. Where tagsubs differ: a published mix is EDITED in
// place (its key is its slug, D1), so the page's switch, dial and rename
// write through here rather than to js/mixes.js.
//
// Every record is validated on the way in (fromRecord throws with words);
// a record that fails is REPORTED (`rejected`), never silently dropped or
// silently repaired — a malformed record of ours is our bug to see.
import {
  HOME, mixes, mix, composeMix, enabledRows, toRecord, fromRecord, importMix, clearLocal,
  WEIGHTS, DEFAULT_WEIGHT,
} from './mixes.js';

export const PDS_CACHE_KEY = 'forage.mixes.pds';

const EMPTY = (did) => ({ did: did || null, records: [], rejected: [], fetchedAt: null });

function readCache(did) {
  if (!did) return EMPTY(did);
  try {
    const parsed = JSON.parse(localStorage.getItem(PDS_CACHE_KEY) || 'null');
    if (!parsed || parsed.did !== did || !Array.isArray(parsed.records)) throw new Error('miss');
    return { did, records: parsed.records, rejected: parsed.rejected || [], fetchedAt: parsed.fetchedAt || null };
  } catch {
    return EMPTY(did);
  }
}

function writeCache(did, records, rejected, fetchedAt) {
  try { localStorage.setItem(PDS_CACHE_KEY, JSON.stringify({ did, records, rejected, fetchedAt })); } catch { /* private mode */ }
}

// The repo's records, decoded: { slug, name, home, rows, createdAt, updatedAt }.
// Two records claiming home: the newest by updatedAt wins, the rest are
// reported — the client refuses to write a second one, but another client may.
function decode(list) {
  const records = [];
  const rejected = [];
  for (const { rkey, value } of list) {
    try {
      const m = fromRecord(value, { rkey });
      records.push({ ...m, createdAt: value.createdAt, updatedAt: value.updatedAt });
    } catch (e) {
      rejected.push({ rkey, error: e.message });
    }
  }
  const homes = records.filter((r) => r.home).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  for (const extra of homes.slice(1)) rejected.push({ rkey: extra.slug, error: `a second record claims home; the newer one (${homes[0].slug}, ${homes[0].updatedAt}) wins` });
  const kept = records.filter((r) => !r.home || r === homes[0]).map((r) => (r.home ? { ...r, slug: HOME } : r));
  return { records: kept, rejected };
}

/** The last set read from this account's repo — stale by definition. */
export function cachedPublished(did) {
  return { ...readCache(did), stale: true };
}

/** Read the account's published mixes. On failure, the last known set, labelled. */
export async function refreshPublished(lens, did) {
  const cached = readCache(did);
  if (!did) return { ...cached, stale: true };
  try {
    const { records, rejected } = decode(await lens.mixRecords());
    const fetchedAt = new Date().toISOString();
    writeCache(did, records, rejected, fetchedAt);
    return { did, records, rejected, fetchedAt, stale: false };
  } catch {
    return { ...cached, stale: true };
  }
}

const published = (did, slug) => readCache(did).records.find((r) => r.slug === slug) || null;
const rkeyOf = (slug) => slug; // the key IS the slug (D1); Home's record key is 'home'

/** Move a mix from this device into your repo. The local copy is dropped only
 *  after the record exists — a refused write leaves the mix exactly as it was. */
export async function publishMix(lens, did, slug) {
  if (!did) throw new Error('saving a mix to your account needs a session — sign in first');
  const now = new Date().toISOString();
  const prior = published(did, slug);
  const record = toRecord(slug, now, { createdAt: prior?.createdAt });
  await lens.saveMix(rkeyOf(slug), record);
  clearLocal(slug);
  return refreshPublished(lens, did);
}

/** Move a mix back out of your repo onto this device. The record is confirmed
 *  FRESH, never from the cache: offline this refuses in words. */
export async function unpublishMix(lens, did, slug) {
  if (!did) throw new Error('removing a mix from your account needs a session — sign in first');
  let live;
  try {
    live = decode(await lens.mixRecords()).records;
  } catch {
    throw new Error("can't reach your account right now — Forage will not remove a record it cannot see first");
  }
  const found = live.find((r) => r.slug === slug);
  if (found) {
    await lens.removeMix(rkeyOf(slug));
    importMix({ slug: found.slug, name: found.name, home: found.home, rows: found.rows });
  }
  return refreshPublished(lens, did);
}

// Write-through edits on a published mix: the whole record goes back, with
// the change applied, createdAt kept and updatedAt moved.
async function rewrite(lens, did, slug, change) {
  if (!did) throw new Error('editing a saved mix needs a session — sign in first');
  const cur = published(did, slug);
  if (!cur) throw new Error(`mixes: ${slug} is not published from this account`);
  const next = change({ ...cur, rows: { ...cur.rows } });
  const now = new Date().toISOString();
  const record = {
    $type: 'fyi.forage.mix', name: next.name, home: next.home,
    rows: Object.entries(next.rows).map(([id, r]) => rowToWire(id, r)),
    createdAt: cur.createdAt || now, updatedAt: now,
  };
  await lens.saveMix(rkeyOf(slug), record);
  return refreshPublished(lens, did);
}

// The same wire shape toRecord builds, for a stored row (kept here rather
// than exported from js/mixes.js so the device half stays ignorant of the wire).
const WORD_OF = { 0.5: 'less', 1: 'normal', 2: 'more' };
function rowToWire(id, r) {
  const i = id.indexOf(':');
  const kind = id === 'timeline' ? 'timeline' : id.slice(0, i);
  const rest = id.slice(i + 1);
  return {
    kind,
    ...(kind === 'feed' || kind === 'list' ? { uri: rest } : {}),
    ...(kind === 'hashtag' ? { tag: rest } : {}),
    on: r.on, weight: WORD_OF[r.weight] || 'normal',
  };
}

export function setPublishedRow(lens, did, slug, id, { on, weight } = {}) {
  if (weight !== undefined && !WEIGHTS.includes(weight)) throw new Error(`mixes: weight ${weight} is not a notch`);
  return rewrite(lens, did, slug, (m) => {
    const prev = m.rows[id] || (m.home ? { on: true, weight: DEFAULT_WEIGHT } : { on: false, weight: DEFAULT_WEIGHT });
    m.rows[id] = { on: on === undefined ? prev.on : !!on, weight: weight === undefined ? prev.weight : weight };
    return m;
  });
}

export function removePublishedRow(lens, did, slug, id) {
  return rewrite(lens, did, slug, (m) => { delete m.rows[id]; return m; });
}

export function renamePublished(lens, did, slug, name) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('mixes: a mix needs a name');
  return rewrite(lens, did, slug, (m) => ({ ...m, name: clean }));
}

/** The one list the app reads: Home first, then every mix, published or
 *  local, a published one winning on a slug collision. */
export function effectiveMixes(did) {
  const pub = readCache(did).records;
  const pubBy = new Map(pub.map((r) => [r.slug, r]));
  const local = mixes();
  const out = local.map((m) => (pubBy.has(m.slug)
    ? { slug: m.slug, name: pubBy.get(m.slug).name, home: m.home, published: true }
    : { ...m, published: false }));
  for (const r of pub) if (!local.some((m) => m.slug === r.slug)) out.push({ slug: r.slug, name: r.name, home: false, published: true });
  return out;
}

/** One mix as the page draws it, from whichever half holds it. */
export function effectiveMix(did, slug, subs = []) {
  const r = published(did, slug);
  if (r) return { ...composeMix({ slug, name: r.name, home: r.home, rows: r.rows }, subs), published: true };
  return { ...mix(slug, subs), published: false };
}

/** What the substrate fetches for this mix: on and still subscribed. */
export function effectiveEnabledRows(did, slug, subs = []) {
  const r = published(did, slug);
  if (r) return composeMix({ slug, name: r.name, home: r.home, rows: r.rows }, subs).rows.filter((x) => x.on && x.subscribed);
  return enabledRows(slug, subs);
}
