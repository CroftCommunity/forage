// Mixes on the PDS — plan 2026-09-08 mixes-on-the-pds, Phase 3: the two halves.
//
// The tagsub pattern, mirrored: a per-DID cache of what the repo holds, a
// refresh that never turns "offline" into "no mixes", publish = write then
// drop the local copy, unpublish = confirm then delete then restore the local
// copy, and ONE list the rest of the app reads. The difference from tagsubs:
// a published mix is EDITED in place (its key is its slug), so the page's
// switches and dials write through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PDS_CACHE_KEY, cachedPublished, refreshPublished, publishMix, unpublishMix,
  setPublishedRow, renamePublished, effectiveMixes, effectiveMix, effectiveEnabledRows,
} from '../js/mixes-pds.js';
import { HOME, createMix, setRow, mixes, mix, subscriptions, MIXES_KEY } from '../js/mixes.js';

async function withStorage(seed, fn) {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try { return await fn(store); } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
}

const ME = 'did:plc:me';
const FUNNY_URI = 'at://did:plc:a/app.bsky.feed.generator/funny';
const FUNNY = `feed:${FUNNY_URI}`;
const SUBS = subscriptions({
  feeds: [{ kind: 'timeline', title: 'Following' }, { kind: 'feed', uri: FUNNY_URI, title: 'Funny' }],
  tags: ['harvest'],
});
const record = (over = {}) => ({
  $type: 'fyi.forage.mix', name: 'Weekend', home: false,
  rows: [{ kind: 'feed', uri: FUNNY_URI, on: true, weight: 'more' }],
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...over,
});

// A lens double: `repo` is the collection, keyed by rkey.
function fakeLens({ repo = {}, failList = false, failWrite = false } = {}) {
  const calls = [];
  return {
    calls, repo,
    async mixRecords() {
      calls.push({ op: 'list' });
      if (failList) throw new Error('offline');
      return Object.entries(repo).map(([rkey, value]) => ({ rkey, value: JSON.parse(JSON.stringify(value)) }));
    },
    async saveMix(rkey, value) {
      calls.push({ op: 'put', rkey, value });
      if (failWrite) throw new Error('write refused');
      repo[rkey] = value;
    },
    async removeMix(rkey) {
      calls.push({ op: 'delete', rkey });
      if (failWrite) throw new Error('write refused');
      delete repo[rkey];
    },
  };
}

test('the cache belongs to ONE account, and a malformed record is reported rather than shown', async () => {
  await withStorage({}, async () => {
    const lens = fakeLens({ repo: { weekend: record(), broken: { name: 'x' } } });
    const r = await refreshPublished(lens, ME);
    assert.deepEqual(r.records.map((x) => x.slug), ['weekend']);
    assert.equal(r.rejected.length, 1, 'the broken one is counted');
    assert.match(r.rejected[0].error, /rows/);
    assert.deepEqual(cachedPublished(ME).records.map((x) => x.slug), ['weekend']);
    assert.deepEqual(cachedPublished('did:plc:other').records, []);
    assert.deepEqual(cachedPublished(null).records, []);
  });
});

test('a refresh that fails returns the last known set, labelled stale — never an empty list', async () => {
  await withStorage({}, async () => {
    const ok = await refreshPublished(fakeLens({ repo: { weekend: record() } }), ME);
    assert.equal(ok.stale, false);
    const down = await refreshPublished(fakeLens({ failList: true }), ME);
    assert.equal(down.stale, true);
    assert.deepEqual(down.records.map((x) => x.slug), ['weekend']);
    assert.equal(down.fetchedAt, ok.fetchedAt);
  });
});

test('publish: the record is put at the slug, the local copy is gone, and the list is one', async () => {
  await withStorage({}, async () => {
    const slug = createMix('Weekend');
    setRow(slug, FUNNY, { on: true, weight: 2 });
    const lens = fakeLens();
    await publishMix(lens, ME, slug);
    assert.deepEqual(lens.calls.map((c) => c.op), ['put', 'list']);
    assert.equal(lens.calls[0].rkey, 'weekend');
    assert.deepEqual(lens.calls[0].value.rows, [{ kind: 'feed', uri: FUNNY_URI, on: true, weight: 'more' }]);
    assert.deepEqual(mixes().map((m) => m.slug), [HOME], 'moved, not copied');
    const eff = effectiveMixes(ME);
    assert.deepEqual(eff.map((m) => [m.slug, m.published]), [[HOME, false], ['weekend', true]]);
  });
});

test('publish: a refused write leaves the local mix exactly as it was', async () => {
  await withStorage({}, async () => {
    const slug = createMix('Weekend');
    setRow(slug, FUNNY, { on: true, weight: 2 });
    await assert.rejects(() => publishMix(fakeLens({ failWrite: true }), ME, slug), /refused/);
    assert.deepEqual(mixes().map((m) => m.slug), [HOME, 'weekend']);
    assert.equal(mix(slug, SUBS).rows.find((r) => r.id === FUNNY).weight, 2);
  });
});

test('publish Home: its overrides travel flagged home, and the device forgets them', async () => {
  await withStorage({}, async () => {
    setRow(HOME, 'timeline', { on: false });
    const lens = fakeLens();
    await publishMix(lens, ME, HOME);
    assert.equal(lens.calls[0].value.home, true);
    assert.deepEqual(lens.calls[0].value.rows, [{ kind: 'timeline', on: false, weight: 'normal' }]);
    assert.ok(mix(HOME, SUBS).rows.every((r) => r.on), 'locally, Home is back to everything on');
    assert.equal(effectiveMix(ME, HOME, SUBS).rows.find((r) => r.id === 'timeline').on, false, 'but the effective Home reads the record');
    assert.equal(effectiveMix(ME, HOME, SUBS).published, true);
  });
});

test('publish keeps createdAt across an update, and updatedAt moves', async () => {
  await withStorage({}, async () => {
    const lens = fakeLens({ repo: { weekend: record({ createdAt: '2026-09-01T00:00:00.000Z' }) } });
    await refreshPublished(lens, ME);
    await setPublishedRow(lens, ME, 'weekend', 'hashtag:harvest', { on: true });
    const put = lens.calls.find((c) => c.op === 'put');
    assert.equal(put.value.createdAt, '2026-09-01T00:00:00.000Z');
    assert.ok(put.value.updatedAt > '2026-09-01T00:00:00.000Z');
    assert.deepEqual(put.value.rows.map((r) => r.kind), ['feed', 'hashtag']);
  });
});

test('unpublish confirms the record FRESH, deletes it, and restores the local copy', async () => {
  await withStorage({}, async () => {
    const lens = fakeLens({ repo: { weekend: record() } });
    await refreshPublished(lens, ME);
    await unpublishMix(lens, ME, 'weekend');
    assert.deepEqual(lens.calls.map((c) => c.op), ['list', 'list', 'delete', 'list']);
    assert.deepEqual(mixes().map((m) => m.slug), [HOME, 'weekend'], 'back on this device');
    assert.equal(mix('weekend', SUBS).rows.find((r) => r.id === FUNNY).weight, 2, 'with its rows');
    assert.deepEqual(effectiveMixes(ME).map((m) => [m.slug, m.published]), [[HOME, false], ['weekend', false]]);
  });
});

test('unpublish offline refuses in words rather than aiming a delete at a cache', async () => {
  await withStorage({}, async () => {
    await refreshPublished(fakeLens({ repo: { weekend: record() } }), ME);
    const down = fakeLens({ failList: true });
    await assert.rejects(() => unpublishMix(down, ME, 'weekend'), /reach/);
    assert.ok(!down.calls.some((c) => c.op === 'delete'));
  });
});

test('the effective list: Home first, published wins on a slug collision, a local mix keeps its place', async () => {
  await withStorage({}, async () => {
    const lens = fakeLens({ repo: { weekend: record({ name: 'Weekend (published)' }) } });
    await refreshPublished(lens, ME);
    createMix('Weekend');   // same slug, local
    createMix('Sunday');
    const eff = effectiveMixes(ME);
    assert.deepEqual(eff.map((m) => [m.slug, m.name, m.published]),
      [[HOME, 'Home', false], ['weekend', 'Weekend (published)', true], ['sunday', 'Sunday', false]]);
    assert.deepEqual(effectiveEnabledRows(ME, 'weekend', SUBS).map((r) => [r.id, r.weight]), [[FUNNY, 2]]);
    assert.deepEqual(effectiveEnabledRows(ME, 'sunday', SUBS), []);
  });
});

test('editing a published mix writes through: the switch, the weight, the name', async () => {
  await withStorage({}, async () => {
    const lens = fakeLens({ repo: { weekend: record() } });
    await refreshPublished(lens, ME);
    await setPublishedRow(lens, ME, 'weekend', FUNNY, { on: false });
    assert.equal(effectiveMix(ME, 'weekend', SUBS).rows.find((r) => r.id === FUNNY).on, false);
    assert.equal(lens.repo.weekend.rows[0].on, false, 'the repo holds it');
    assert.equal(lens.repo.weekend.rows[0].weight, 'more', 'and the weight is remembered while off');
    await renamePublished(lens, ME, 'weekend', 'Weekend reads');
    assert.equal(lens.repo.weekend.name, 'Weekend reads');
    assert.equal(effectiveMixes(ME).find((m) => m.slug === 'weekend').name, 'Weekend reads');
  });
});

test('two records claim home: the newest by updatedAt wins and the other is reported', async () => {
  await withStorage({}, async () => {
    const lens = fakeLens({ repo: {
      home: record({ name: 'Home', home: true, rows: [{ kind: 'timeline', on: false, weight: 'normal' }], updatedAt: '2026-09-02T00:00:00.000Z' }),
      'home-old': record({ name: 'Home', home: true, rows: [], updatedAt: '2026-09-01T00:00:00.000Z' }),
    } });
    const r = await refreshPublished(lens, ME);
    assert.deepEqual(r.records.map((x) => x.slug), ['home']);
    assert.ok(r.rejected.some((x) => x.rkey === 'home-old' && /home/i.test(x.error)));
    assert.equal(effectiveMix(ME, HOME, SUBS).rows.find((x) => x.id === 'timeline').on, false);
  });
});

test('signed out: the effective list is the device alone', async () => {
  await withStorage({}, async () => {
    createMix('Sunday');
    assert.deepEqual(effectiveMixes(null).map((m) => m.slug), [HOME, 'sunday']);
    assert.equal(PDS_CACHE_KEY, 'forage.mixes.pds');
    assert.equal(MIXES_KEY, 'forage.mixes');
  });
});
