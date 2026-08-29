// P5 — the PUBLISHED half of hashtag subscriptions.
//
// The owner settled the model on 2026-08-29: "if you publish to pds it should be
// picked up by each instance of forage the same from the PDS across clients for
// forage", and "when local it's local to the device, no mystery, full
// admission." So there are TWO SETS, not one merged list:
//
//   local      js/tagsubs.js — this device, never leaves it
//   published  fyi.forage.tagsub records — the repo is the truth, every client
//              sees the same set
//
// They are kept DISJOINT by moving: PDS Save creates the record and drops the
// local entry; Remove from PDS deletes the record and puts the local entry back.
// That is what makes a row's status unambiguous, and it is what makes the
// tombstone problem vanish — a deleted record's ABSENCE is the deletion, because
// no device is holding a merged list wondering whether a gap means "removed" or
// "not yet seen".
//
// The one cost the plan refused to paper over: the published set needs the
// network. A cache is a fallback FOR DISPLAY ONLY. These tests are where that
// sentence is made to mean something.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const withStorage = async (seed, fn) => {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  // awaited, not returned: `try { return fn() } finally { restore() }` restores
  // the moment an async body hands back its PROMISE, tearing down the fixture
  // under the test that is still using it. (Caught 2026-08-29.)
  try { return await fn(store); }
  finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
};

const { PDS_CACHE_KEY, cachedPublished, refreshPublished, publishTag, unpublishTag, effectiveTags,
        isEffectivelySubscribed, unsubscribeEverywhere } =
  await import('../js/tagsubs-pds.js');
const { TAGSUBS_KEY, tagSubs, subscribeTag } = await import('../js/tagsubs.js');

const ME = 'did:plc:me';

// A lens double that records what it was asked to do. `records` is the repo.
function fakeLens({ records = [], failList = false, failWrite = false } = {}) {
  const calls = [];
  let next = 0;
  return {
    calls,
    repo: () => records,
    async tagSubs() {
      calls.push({ op: 'list' });
      if (failList) throw new Error('offline');
      return records.map((r) => ({ ...r }));
    },
    async saveTagSub(tag) {
      calls.push({ op: 'create', tag });
      if (failWrite) throw new Error('write refused');
      const rkey = `3rk${next += 1}`;
      records.push({ tag, rkey, createdAt: '2026-08-29T00:00:00.000Z' });
      return { rkey };
    },
    async removeTagSub(rkey) {
      calls.push({ op: 'delete', rkey });
      if (failWrite) throw new Error('write refused');
      const i = records.findIndex((r) => r.rkey === rkey);
      if (i >= 0) records.splice(i, 1);
    },
  };
}

test('a cached published set belongs to ONE account and is never shown to another', async () => {
  // Sign out, sign in as someone else, and the first account's public
  // subscriptions must not appear as yours. The cache is keyed by DID for
  // exactly this, because a cache that outlives its owner is a leak.
  await withStorage({}, async () => {
    const lens = fakeLens({ records: [{ tag: 'mycology', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' }] });
    await refreshPublished(lens, ME);
    assert.deepEqual(cachedPublished(ME).records.map((r) => r.tag), ['mycology']);
    assert.deepEqual(cachedPublished('did:plc:someone-else').records, [],
      'another account sees nothing of mine');
    assert.deepEqual(cachedPublished(null).records, [], 'and signed out, nothing at all');
  });
});

test('a refresh that succeeds is fresh; a refresh that fails returns the last known set, labelled', async () => {
  await withStorage({}, async () => {
    const records = [{ tag: 'harvest', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' }];
    const ok = await refreshPublished(fakeLens({ records }), ME);
    assert.equal(ok.stale, false);
    assert.deepEqual(ok.records.map((r) => r.tag), ['harvest']);
    assert.ok(ok.fetchedAt, 'a fresh read records WHEN, because the stale line has to name a time');

    const down = await refreshPublished(fakeLens({ failList: true }), ME);
    assert.equal(down.stale, true, 'offline does not mean empty — stale-but-true beats a blank list');
    assert.deepEqual(down.records.map((r) => r.tag), ['harvest']);
    assert.equal(down.fetchedAt, ok.fetchedAt, 'and it still names the time it was actually read');
  });
});

test('PDS Save moves a tag: the record is created and the local entry is gone', async () => {
  await withStorage({}, async () => {
    subscribeTag('harvest', { createdAt: '2026-08-28T10:00:00.000Z' });
    subscribeTag('baking', { createdAt: '2026-08-28T11:00:00.000Z' });
    const lens = fakeLens();
    const res = await publishTag(lens, ME, '#Harvest');
    assert.deepEqual(lens.calls.map((c) => c.op), ['create', 'list'],
      'created, then re-read — the repo is the truth, not our optimism about it');
    assert.deepEqual(lens.calls[0].tag, 'harvest', 'normalised on the way out, like every other surface');
    assert.deepEqual(res.records.map((r) => r.tag), ['harvest']);
    assert.deepEqual(tagSubs().map((r) => r.tag), ['baking'], 'no longer local — it moved, it was not copied');
  });
});

test('a failed PDS Save changes nothing — the tag is still local and still yours', async () => {
  await withStorage({}, async () => {
    subscribeTag('harvest', { createdAt: '2026-08-28T10:00:00.000Z' });
    const lens = fakeLens({ failWrite: true });
    await assert.rejects(() => publishTag(lens, ME, 'harvest'));
    assert.deepEqual(tagSubs().map((r) => r.tag), ['harvest'],
      'the local entry is dropped only AFTER the record exists');
  });
});

test('Remove from PDS moves it back: the record is deleted and the tag is local again', async () => {
  await withStorage({}, async () => {
    const records = [{ tag: 'mycology', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' }];
    const lens = fakeLens({ records });
    const res = await unpublishTag(lens, ME, 'mycology');
    assert.deepEqual(lens.calls.map((c) => c.op), ['list', 'delete', 'list'],
      'the rkey is read fresh before it is used — never resolved out of the cache');
    assert.deepEqual(res.records, []);
    assert.deepEqual(tagSubs().map((r) => r.tag), ['mycology'],
      'it falls back to local-only on the device that pressed it, rather than vanishing');
  });
});

test('offline, Remove from PDS refuses in words instead of guessing an rkey', async () => {
  await withStorage({}, async () => {
    await refreshPublished(fakeLens({ records: [{ tag: 'mycology', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' }] }), ME);
    const down = fakeLens({ failList: true });
    await assert.rejects(() => unpublishTag(down, ME, 'mycology'), /offline|reach|network|connect/i,
      'a cache is a display fallback; it is never the thing a write is aimed at');
    assert.deepEqual(down.calls.map((c) => c.op), ['list'], 'and nothing was deleted on a guess');
  });
});

test('a malformed record in the repo is ignored rather than rendered as a broken row', async () => {
  await withStorage({}, async () => {
    const lens = fakeLens({ records: [
      { tag: 'harvest', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' },
      { tag: '', rkey: '3bb', createdAt: '2026-08-01T00:00:00.000Z' },
      { rkey: '3cc', createdAt: '2026-08-01T00:00:00.000Z' },
      { tag: 'baking', rkey: '', createdAt: '2026-08-01T00:00:00.000Z' },
      // Shape-checking "is it a non-empty string" would have PASSED this one.
      // Validating against the schema does not: createdAt is the only ordering
      // these rows have, so a present-but-unparseable one produces a WRONG list
      // rather than a short one — the worse of the two failures.
      { tag: 'ferns', rkey: '3dd', createdAt: 'whenever' },
    ] });
    const res = await refreshPublished(lens, ME);
    assert.deepEqual(res.records.map((r) => r.tag), ['harvest'],
      'a row with no rkey has no working Remove button, which is worse than not showing it');
  });
});

test('the app reads ONE subscription list: local plus published, deduped, sorted', async () => {
  await withStorage({}, async () => {
    subscribeTag('baking', { createdAt: '2026-08-28T11:00:00.000Z' });
    await refreshPublished(fakeLens({ records: [
      { tag: 'mycology', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' },
      { tag: 'baking', rkey: '3bb', createdAt: '2026-08-01T00:00:00.000Z' },
    ] }), ME);
    // The nav, the ring weave and the join toggle must not care WHERE a
    // subscription is stored — that is the whole point of "published means
    // synced". This is the one function they all call.
    assert.deepEqual(effectiveTags(ME), ['baking', 'mycology']);
    assert.deepEqual(effectiveTags(null), ['baking'], 'signed out, only what is on this device');
  });
});

test('the cache key is stable, because a rename orphans everyone\'s cached set', async () => {
  assert.equal(PDS_CACHE_KEY, 'forage.tagsubs.pds');
  assert.notEqual(PDS_CACHE_KEY, TAGSUBS_KEY);
});

test('a published tag reads as subscribed everywhere — that is what "synced" means', async () => {
  await withStorage({}, async () => {
    await refreshPublished(fakeLens({ records: [
      { tag: 'mycology', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' },
    ] }), ME);
    subscribeTag('baking', { createdAt: '2026-08-28T11:00:00.000Z' });
    assert.equal(isEffectivelySubscribed(ME, '#Mycology'), true, 'published, and normalised the same way');
    assert.equal(isEffectivelySubscribed(ME, 'baking'), true, 'local');
    assert.equal(isEffectivelySubscribed(ME, 'ferns'), false);
    assert.equal(isEffectivelySubscribed(null, 'mycology'), false, 'signed out, the repo is not readable');
  });
});

test('leaving a published tag deletes the record — it does not quietly demote to local', async () => {
  // The join toggle on a tag board says Leave, and Leave has to mean it. If it
  // only dropped a local copy the reader would press it, see the tag disappear
  // from the nav, and still be publicly subscribed in their repo.
  await withStorage({}, async () => {
    const records = [{ tag: 'mycology', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' }];
    const lens = fakeLens({ records });
    await unsubscribeEverywhere(lens, ME, 'mycology');
    assert.deepEqual(records, [], 'the record is gone from the repo');
    assert.deepEqual(tagSubs(), [], 'and nothing was left behind on the device');
    assert.equal(isEffectivelySubscribed(ME, 'mycology'), false);
  });
});

test('leaving a local-only tag touches the network not at all', async () => {
  await withStorage({}, async () => {
    subscribeTag('baking', { createdAt: '2026-08-28T11:00:00.000Z' });
    const lens = fakeLens();
    await unsubscribeEverywhere(lens, ME, 'baking');
    assert.deepEqual(lens.calls, [], 'a device-local subscription is nobody else\'s business, leaving included');
    assert.deepEqual(tagSubs(), []);
  });
});
