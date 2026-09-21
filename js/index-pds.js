// Your discovery index on the atmo provider account — the account half
// (plan 2026-09-21 own-index-on-the-pds, Phase 3), on the mixes-pds pattern.
//
// js/index-prefs.js is the device half and never learns the network exists.
// This module holds a per-DID cache of the ONE record (fyi.forage.feedindex at
// `self`) and the FILE it names — the blob from the reader's own PDS, or the
// link — and the one `effective()` the index store reads.
//
// The halves are DISJOINT (D6): publishing MOVES the file out of the device
// into the record, and the device copy becomes the cache of what the account
// holds; unpublishing brings it back, confirmed fresh, never from the cache.
// With a record present the device's own file is not consulted — except Off,
// which is this device's "no index here" (D4) and wins on this device.
//
// § E of the plan, in code: a fetch that fails NEVER rewrites the record or
// the mode. Forage's index is shown for THAT load with words (`fallback`),
// the last good copy stays if the file is the same one, and the next refresh
// tries again. Choosing Forage's back is a press the reader makes.
import * as prefs from './index-prefs.js';
import { validateIndex } from './feed-index.js';
import { toRecord, fromRecord, indexUrlProblem } from './feed-index-record.js';

export const PDS_CACHE_KEY = 'forage.feedindex.pds';

const UNKNOWN = (did) => ({ did: did || null, record: null, cid: null, index: null, fetchedAt: null, error: null, known: false });

function readCache(did) {
  if (!did) return UNKNOWN(did);
  try {
    const p = JSON.parse(localStorage.getItem(PDS_CACHE_KEY) || 'null');
    if (!p || p.did !== did || p.known !== true) return UNKNOWN(did);
    return { did, record: p.record ?? null, cid: p.cid ?? null, index: p.index ?? null, fetchedAt: p.fetchedAt ?? null, error: p.error ?? null, known: true };
  } catch { return UNKNOWN(did); }
}
function writeCache(c) {
  try { localStorage.setItem(PDS_CACHE_KEY, JSON.stringify({ ...c, known: true })); } catch { /* private mode: the account is still the truth */ }
  return { ...c, known: true, stale: false };
}
const identityOf = (rec) => (rec ? (rec.kind === 'file' ? `file:${rec.blob?.ref?.$link}` : `url:${rec.url}`) : null);
const nameOf = (rec) => rec.name || rec.url || null;

/** The last state read from this account — stale by definition. */
export function cachedAccount(did) {
  return { ...readCache(did), stale: true };
}

async function fetchFile(lens, rec) {
  return rec.kind === 'file' ? lens.fetchIndexBlob(rec.blob.ref.$link) : lens.fetchIndexUrl(rec.url);
}
function validated(index, what) {
  const v = validateIndex(index);
  if (!v.ok) throw new Error(`${what} was refused: ${v.errors[0]}`);
  return index;
}

/** Read the record and, when needed, the file it names. Offline → the last known state, labelled stale. */
export async function refresh(lens, did, { force = false, now = new Date().toISOString() } = {}) {
  const cached = readCache(did);
  if (!did) return { ...cached, stale: true };
  let got;
  try { got = await lens.indexRecord(); } catch { return { ...cached, stale: true }; }
  if (got === null) return writeCache({ did, record: null, cid: null, index: null, fetchedAt: now, error: null });
  let rec;
  try { rec = fromRecord(got.value); } catch (e) {
    // reported, never repaired or silently dropped — a malformed record of ours is our bug to see
    return writeCache({ did, record: null, cid: got.cid ?? null, index: null, fetchedAt: now, error: e.message });
  }
  const sameFile = cached.record && identityOf(cached.record) === identityOf(rec);
  const need = force || !sameFile || !cached.index;
  if (!need) return writeCache({ did, record: rec, cid: got.cid ?? null, index: cached.index, fetchedAt: cached.fetchedAt, error: null });
  try {
    const index = validated(await fetchFile(lens, rec), 'your index');
    return writeCache({ did, record: rec, cid: got.cid ?? null, index, fetchedAt: now, error: null });
  } catch (e) {
    // the record and its mode are untouched; the last good copy of the SAME file stays
    return writeCache({ did, record: rec, cid: got.cid ?? null, index: sameFile ? cached.index : null, fetchedAt: sameFile ? cached.fetchedAt : null, error: e.message });
  }
}

/** Move the file on this device onto the account. The device copy is dropped only after the record exists. */
export async function publishFile(lens, did, { now = new Date().toISOString() } = {}) {
  if (!did) throw new Error('keeping your index on your account needs a session — sign in first');
  const own = prefs.own();
  if (!own) throw new Error('there is no file on this browser to keep — paste or choose one first');
  const deviceMode = prefs.mode();
  const mode = deviceMode === 'replace' ? 'replace' : 'add';
  const blob = await lens.uploadIndex(JSON.stringify(own.index));
  const prior = readCache(did).record;
  const record = toRecord({ kind: 'file', blob, mode, name: own.name || undefined, createdAt: prior?.createdAt, now });
  const res = await lens.saveIndexRecord(record);
  prefs.clearOwn();
  return writeCache({ did, record: fromRecord(record), cid: res?.cid ?? null, index: own.index, fetchedAt: now, error: null });
}

/** Keep a LINK on the account. Fetched and validated BEFORE the put: a link that does not answer is never published. */
export async function publishUrl(lens, did, { url, mode, name, now = new Date().toISOString() } = {}) {
  if (!did) throw new Error('keeping your index on your account needs a session — sign in first');
  const bad = indexUrlProblem(url);
  if (bad) throw new Error(bad);
  const index = validated(await lens.fetchIndexUrl(url), `the file at ${new URL(url).host}`);
  const prior = readCache(did).record;
  const record = toRecord({ kind: 'url', url, mode, name: name || undefined, createdAt: prior?.createdAt, now });
  const res = await lens.saveIndexRecord(record);
  prefs.clearOwn();
  return writeCache({ did, record: fromRecord(record), cid: res?.cid ?? null, index, fetchedAt: now, error: null });
}

/** Change add ↔ replace on the record in place. The file is untouched; nothing is refetched. */
export async function setMode(lens, did, mode, { now = new Date().toISOString() } = {}) {
  if (!did) throw new Error('changing your saved index needs a session — sign in first');
  const c = readCache(did);
  if (!c.record) throw new Error('there is no index on your account to change');
  const record = toRecord({ kind: c.record.kind, blob: c.record.blob ?? undefined, url: c.record.url ?? undefined,
    mode, name: c.record.name ?? undefined, createdAt: c.record.createdAt, now });
  const res = await lens.saveIndexRecord(record);
  return writeCache({ ...c, record: fromRecord(record), cid: res?.cid ?? c.cid });
}

/** Bring the index back to this device and remove the record. Confirmed FRESH, never from the cache. */
export async function unpublish(lens, did, { now = new Date().toISOString() } = {}) {
  if (!did) throw new Error('removing your saved index needs a session — sign in first');
  let live;
  try { live = await lens.indexRecord(); } catch {
    throw new Error("can't reach your account right now — Forage will not remove a record it cannot see first");
  }
  if (live === null) return writeCache({ did, record: null, cid: null, index: null, fetchedAt: now, error: null });
  const rec = fromRecord(live.value);
  const c = readCache(did);
  const index = (c.index && identityOf(c.record) === identityOf(rec))
    ? c.index
    : validated(await fetchFile(lens, rec), 'your index');
  await lens.removeIndexRecord();
  prefs.setOwn({ index, name: nameOf(rec) });
  prefs.setMode(rec.mode);
  return writeCache({ did, record: null, cid: null, index: null, fetchedAt: now, error: null });
}

/** What the index store loads: { mode, index, generatedAt, name } — plus `fallback` words when the account's file could not be fetched. */
export function effective(did) {
  if (prefs.mode() === 'off') return { mode: 'off', index: null, generatedAt: null, name: null };
  if (!did) return prefs.current();
  const c = readCache(did);
  if (!c.known || !c.record) return prefs.current();
  if (c.index) return { mode: c.record.mode, index: c.index, generatedAt: c.fetchedAt, name: nameOf(c.record) };
  return { mode: 'forage', index: null, generatedAt: null, name: nameOf(c.record),
    fallback: `your index could not be fetched (${c.error || 'no reason given'}) — Forage's until it can` };
}
