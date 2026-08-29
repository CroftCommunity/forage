// Hashtag subscriptions that live in your repo — the PUBLISHED half.
//
// Its sibling js/tagsubs.js holds the LOCAL half, and the two are deliberately
// separate things rather than one list with a flag (owner, 2026-08-29):
//
//   local      this device, never leaves it, nobody can see it
//   published  fyi.forage.tagsub records — "picked up by each instance of forage
//              the same from the PDS across clients for forage"
//
// Local is a DESTINATION, not a waiting room. It offers something the published
// version structurally cannot: privacy. A record in a repo is world-readable,
// exactly like a follow, and the UI says so beside the button.
//
// THE TWO SETS ARE KEPT DISJOINT BY MOVING. PDS Save creates the record and then
// drops the local entry; Remove from PDS deletes the record and puts the local
// entry back. Moving rather than copying is what makes a row's status a single
// unambiguous word, and it is what dissolves the tombstone problem: a deleted
// record's ABSENCE is the deletion, because no device is holding a merged list
// trying to work out whether a gap means "removed" or "not seen yet".
//
// THE CACHE IS A DISPLAY FALLBACK AND NOTHING ELSE. Published subscriptions need
// the network, and that cost is not papered over: offline you see the last set
// Forage read, labelled as such, and Remove refuses in words rather than aiming
// a delete at an rkey it has not just confirmed.
import { normalizeTag, subscribeTag, unsubscribeTag, isSubscribed, tagSubs } from './tagsubs.js';

export const PDS_CACHE_KEY = 'forage.tagsubs.pds';

// KEYED BY DID. A cache that outlives its owner is a leak: sign out, sign in as
// someone else, and the previous account's public subscriptions would be sitting
// there presented as yours.
function readCache(did) {
  if (!did) return { did: null, records: [], fetchedAt: null };
  try {
    const parsed = JSON.parse(localStorage.getItem(PDS_CACHE_KEY) || 'null');
    if (!parsed || parsed.did !== did || !Array.isArray(parsed.records)) throw new Error('miss');
    return { did, records: parsed.records.filter(wellFormed), fetchedAt: parsed.fetchedAt || null };
  } catch {
    return { did, records: [], fetchedAt: null };
  }
}

// A row needs a tag to name and an rkey to delete. Without the rkey its Remove
// button cannot work, and a control that cannot work is worse than an absent row.
//
// THIS FILTER IS LOAD-BEARING, not defensive. Measured against a real PDS on
// 2026-08-29 (test/fixtures/atproto/tagsub-probe-summary.txt, P4): a
// fyi.forage.tagsub record carrying NEITHER required field was accepted with a
// 200. `required` in our lexicon binds Forage and nobody else, so anything may
// put a malformed record in a repo we then read. W17 asserts that is still true,
// so if a PDS ever starts validating we find out rather than assume.
const wellFormed = (r) => !!r && typeof r.tag === 'string' && r.tag !== ''
  && typeof r.rkey === 'string' && r.rkey !== '';

const byTag = (a, b) => String(a.tag).localeCompare(String(b.tag));

function writeCache(did, records, fetchedAt) {
  try {
    localStorage.setItem(PDS_CACHE_KEY, JSON.stringify({ did, records, fetchedAt }));
  } catch { /* private mode: the set is still correct this session, just not the next */ }
}

/** The last set Forage read from this account's repo. Always stale by definition
 *  — it was not read now. Display only. */
export function cachedPublished(did) {
  return { ...readCache(did), stale: true };
}

/** Read the account's published subscriptions. On failure, hand back the last
 *  known set marked stale — an empty list would be a lie about your account. */
export async function refreshPublished(lens, did) {
  const cached = readCache(did);
  if (!did) return { ...cached, stale: true };
  try {
    const records = (await lens.tagSubs()).filter(wellFormed).sort(byTag);
    const fetchedAt = new Date().toISOString();
    writeCache(did, records, fetchedAt);
    return { did, records, fetchedAt, stale: false };
  } catch {
    return { ...cached, stale: true };
  }
}

/** Move a tag from this device into your repo, where anyone can read it. The
 *  local entry is dropped only after the record exists — a failed write leaves
 *  the subscription exactly as it was. */
export async function publishTag(lens, did, tag) {
  const t = normalizeTag(tag);
  if (t === null) throw new Error('that is not a hashtag');
  if (!did) throw new Error('saving to your account needs a session — sign in first');
  await lens.saveTagSub(t);
  unsubscribeTag(t);
  return refreshPublished(lens, did);
}

/** Move a tag back out of your repo onto this device. The rkey is resolved from
 *  a FRESH list, never from the cache: offline this refuses in words rather than
 *  aiming a delete at a record it has not just confirmed. */
export async function unpublishTag(lens, did, tag) {
  const t = normalizeTag(tag);
  if (t === null) throw new Error('that is not a hashtag');
  if (!did) throw new Error('removing from your account needs a session — sign in first');
  let live;
  try {
    live = (await lens.tagSubs()).filter(wellFormed);
  } catch {
    throw new Error("can't reach your account right now — Forage will not remove a record it cannot see first");
  }
  const found = live.find((r) => r.tag === t);
  // Already gone (removed on another device) is not an error: the end state the
  // reader asked for is the end state they get.
  if (found) await lens.removeTagSub(found.rkey);
  subscribeTag(t);
  return refreshPublished(lens, did);
}

/** The one subscription list the rest of the app reads. Where a tag is stored is
 *  this module's business; the nav, the ring weave and the join toggle only need
 *  to know that you are subscribed. */
export function effectiveTags(did) {
  const all = new Set([...tagSubs().map((r) => r.tag), ...readCache(did).records.map((r) => r.tag)]);
  return [...all].sort((a, b) => a.localeCompare(b));
}

/** Is this tag subscribed at all — here or in your repo? The join toggle asks
 *  this rather than js/tagsubs.js directly, because a tag you published from
 *  another device is genuinely subscribed and a button offering to Join it
 *  again would be lying. */
export function isEffectivelySubscribed(did, tag) {
  const t = normalizeTag(tag);
  return t !== null && effectiveTags(did).includes(t);
}

/** Leave, and mean it. A published tag's Leave has to delete the record: a
 *  version that only dropped a local copy would take the tag out of the nav and
 *  leave the reader publicly subscribed in their own repo.
 *
 *  Which half a tag lives in is decided by the LOCAL set, not the cache. The two
 *  sets are disjoint by construction — publishing moves a tag out of local — so
 *  "it is local" is a fact this device already holds, and a local-only leave
 *  therefore reaches no network at all. That is the privacy the local set exists
 *  for, and it is why this does not consult the cached published list: a cache
 *  is a display fallback, never the thing a write is decided from. */
export async function unsubscribeEverywhere(lens, did, tag) {
  const t = normalizeTag(tag);
  if (t === null) return;
  if (isSubscribed(t) || !did) { unsubscribeTag(t); return; }
  const live = (await lens.tagSubs()).filter(wellFormed);
  const found = live.find((r) => r.tag === t);
  if (found) await lens.removeTagSub(found.rkey);
  await refreshPublished(lens, did);
}
