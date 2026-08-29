// Subscribed hashtags — stored on the device today, in the shape they will be
// stored in a repo tomorrow.
//
// The owner's instruction (2026-08-28) was to start local but design from the
// premise that these end up as records in a PDS, "and that way we can iterate
// fast… and we can still make that changeover seamless". So this module stores
// nothing of its own invention: every object it writes is a valid
// `fyi.forage.tagsub` record, and the migration is a loop of createRecord with
// no reshaping. test/tagsubs.test.js reads the lexicon file and asserts that,
// rather than restating the fields — a copy of a schema is a second schema.
//
// ONE RECORD PER SUBSCRIPTION, and unsubscribing is deleting it. That is the
// house style (`fyi.forage.save` and `fyi.forage.membership` both say so in
// their own descriptions) and it is the shape that survives two devices: a
// subscribe here and an unsubscribe there are independent records, where one
// list-record would be last-write-wins.
//
// NO STORED ORDER, deliberately. `createdAt` is in the record for its own sake,
// so newest-added is free; and the orderings actually worth having — busiest in
// the last 30 days, most-liked — are COMPUTED, so they stay true on their own
// where a hand-maintained order goes stale the moment your interests move. What
// this shape gives up is manual pinning, which can ride alongside later without
// touching the record.

export const TAGSUBS_KEY = 'forage.tagsubs';

// '#Harvest' and ' harvest ' are the same subscription. The '#' is punctuation
// people type, not part of the name — bsky's own tag facets store it bare.
export function normalizeTag(input) {
  if (typeof input !== 'string') return null;
  const bare = input.trim().replace(/^#+/, '').trim().toLowerCase();
  return bare === '' ? null : bare;
}

function read() {
  try {
    const raw = localStorage.getItem(TAGSUBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only well-formed records. A malformed entry cannot be unsubscribed
    // through the UI, so leaving it in would strand it on the device forever.
    return parsed.filter((r) => r && typeof r.tag === 'string' && typeof r.createdAt === 'string');
  } catch {
    return []; // no storage, or a corrupt store: no subscriptions, not an error
  }
}

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function write(records) {
  try { localStorage.setItem(TAGSUBS_KEY, JSON.stringify(records)); } catch { /* private mode */ }
  for (const fn of listeners) fn(records);
}

// Newest first. The sort is here rather than at each call site so every surface
// that lists subscriptions agrees about their order.
export function tagSubs() {
  return read().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function isSubscribed(tag) {
  const t = normalizeTag(tag);
  return t !== null && read().some((r) => r.tag === t);
}

export function subscribeTag(tag, { createdAt } = {}) {
  const t = normalizeTag(tag);
  if (t === null) return; // refuse rather than store: an unsubscribable subscription is worse than none
  const current = read();
  if (current.some((r) => r.tag === t)) return; // idempotent, like createRecord on a tid you already hold
  write([...current, { tag: t, createdAt: createdAt || new Date().toISOString() }]);
}

export function unsubscribeTag(tag) {
  const t = normalizeTag(tag);
  if (t === null) return;
  const current = read();
  const next = current.filter((r) => r.tag !== t);
  if (next.length !== current.length) write(next);
}
