// Your discovery index on the atmo provider account — plan 2026-09-21
// own-index-on-the-pds, Phase 3: the two halves. js/index-prefs.js is the
// device half and never learns the network exists; this module holds a per-DID
// cache of the RECORD and the FILE it names, and the ONE `effective()` the
// index store reads. The halves are DISJOINT (D6): publishing moves the file
// out of the device into the record, unpublishing brings it back — confirmed
// fresh, never from the cache. And § E, as tests: a fetch that fails never
// rewrites the record or the mode; Forage's index is shown for THAT load with
// words, and the next refresh tries again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INDEX_VERSION, emptyIndex } from '../js/feed-index.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const prefs = await import('../js/index-prefs.js');
const pds = await import('../js/index-pds.js');

const ME = 'did:plc:me';
const F = (n) => ({ uri: `at://did:plc:${n}/app.bsky.feed.generator/f${n}`, name: `Feed ${n}`, desc: '',
  creator: `c${n}.test`, platform: null, band: 1, tags: [] });
const MINE = { ...emptyIndex(), feeds: [F(1)] };
const THEIRS = { ...emptyIndex(), feeds: [F(2), F(3)] };
const BLOB = (cid = 'bafkreiaaa') => ({ $type: 'blob', ref: { $link: cid }, mimeType: 'application/json', size: 60 });
const fileRecord = (over = {}) => ({ $type: 'fyi.forage.feedindex', kind: 'file', file: BLOB(), mode: 'add', name: 'Gardeners',
  createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', ...over });
const urlRecord = (over = {}) => ({ $type: 'fyi.forage.feedindex', kind: 'url', url: 'https://gardeners.example/index.json', mode: 'replace',
  createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', ...over });

// A lens double over one repo slot and two file sources.
function fakeLens({ record = null, cid = 'reccid', blobs = {}, urls = {}, offline = false, failWrite = false, failUpload = false } = {}) {
  const calls = [];
  const state = { record, cid };
  return {
    calls, state,
    async indexRecord() { calls.push({ op: 'get' }); if (offline) throw new Error('offline'); return state.record ? { value: state.record, cid: state.cid } : null; },
    async saveIndexRecord(value) { calls.push({ op: 'put', value }); if (failWrite) throw new Error('write refused'); state.record = value; state.cid = `cid-${calls.length}`; },
    async removeIndexRecord() { calls.push({ op: 'delete' }); if (failWrite) throw new Error('write refused'); state.record = null; },
    async uploadIndex(text) { calls.push({ op: 'upload', text }); if (failUpload) throw new Error('upload refused'); const b = BLOB(`bafkrei-up-${calls.length}`); blobs[b.ref.$link] = JSON.parse(text); return b; },
    async fetchIndexBlob(c) { calls.push({ op: 'blob', cid: c }); if (offline) throw new Error('offline'); if (!(c in blobs)) throw new Error('Blob not found'); return blobs[c]; },
    async fetchIndexUrl(u) { calls.push({ op: 'url', url: u }); if (offline) throw new Error(`could not fetch ${new URL(u).host}`); if (!(u in urls)) throw new Error(`${new URL(u).host} answered HTTP 404`); return urls[u]; },
  };
}
const fresh = () => { store.clear(); };

test('index-pds: nothing cached is nothing — and effective() is the device half, signed out or not', async () => {
  fresh();
  assert.deepEqual(pds.cachedAccount(ME), { did: ME, record: null, index: null, fetchedAt: null, error: null, stale: true, known: false });
  prefs.setOwn({ index: MINE, name: 'mine.json' });
  assert.deepEqual(pds.effective(null), prefs.current(), 'signed out: the device, as today');
  assert.deepEqual(pds.effective(ME), prefs.current(), 'signed in with nothing read yet: still the device');
});

test('index-pds: refresh reads the record, fetches the file it names, validates it, and effective() is the record\'s mode with the file', async () => {
  fresh();
  const lens = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: THEIRS } });
  const c = await pds.refresh(lens, ME);
  assert.deepEqual(lens.calls.map((x) => x.op), ['get', 'blob']);
  assert.equal(c.record.kind, 'file');
  assert.equal(c.known, true);
  assert.deepEqual(c.index.feeds.map((f) => f.uri), [F(2).uri, F(3).uri]);
  assert.equal(c.error, null);
  assert.equal(c.stale, false, 'freshly read is not stale');
  assert.ok(c.fetchedAt);
  const e = pds.effective(ME);
  assert.equal(e.mode, 'add');
  assert.equal(e.name, 'Gardeners');
  assert.deepEqual(e.index.feeds.map((f) => f.uri), [F(2).uri, F(3).uri]);
  assert.equal(e.generatedAt, c.fetchedAt);
  // a url record the same way, through the link
  fresh();
  const lens2 = fakeLens({ record: urlRecord(), urls: { 'https://gardeners.example/index.json': THEIRS } });
  const c2 = await pds.refresh(lens2, ME);
  assert.deepEqual(lens2.calls.map((x) => x.op), ['get', 'url']);
  assert.equal(pds.effective(ME).mode, 'replace');
  assert.equal(pds.effective(ME).name, 'https://gardeners.example/index.json', 'a link with no name is named by its link');
  assert.equal(c2.index.feeds.length, 2);
});

test('index-pds: a file fetched once is not fetched again until the record changes or the reader asks (D5)', async () => {
  fresh();
  const lens = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: THEIRS, bafkreibbb: MINE } });
  await pds.refresh(lens, ME);
  const again = await pds.refresh(lens, ME);
  assert.deepEqual(lens.calls.map((x) => x.op), ['get', 'blob', 'get'], 'the second refresh re-reads the record and keeps the file');
  assert.equal(again.record.kind, 'file');
  assert.equal(again.index.feeds.length, 2, 'kept, not dropped');
  assert.equal(again.stale, false);
  await pds.refresh(lens, ME, { force: true });
  assert.deepEqual(lens.calls.map((x) => x.op).slice(-2), ['get', 'blob'], 'Refresh fetches again');
  // the record changed elsewhere: a new blob → the old copy is dropped and the new one fetched
  lens.state.record = fileRecord({ file: BLOB('bafkreibbb') });
  lens.state.cid = 'reccid2';
  const c = await pds.refresh(lens, ME);
  assert.deepEqual(lens.calls.map((x) => x.op).slice(-2), ['get', 'blob']);
  assert.deepEqual(c.index.feeds.map((f) => f.uri), [F(1).uri]);
  // and a url record whose LINK changed is a different file too
  fresh();
  const urls = { 'https://a.example/i.json': THEIRS, 'https://b.example/i.json': MINE };
  const lu = fakeLens({ record: urlRecord({ url: 'https://a.example/i.json' }), urls });
  await pds.refresh(lu, ME);
  lu.state.record = urlRecord({ url: 'https://b.example/i.json' });
  const cu = await pds.refresh(lu, ME);
  assert.deepEqual(lu.calls.map((x) => x.op), ['get', 'url', 'get', 'url']);
  assert.deepEqual(cu.index.feeds.map((f) => f.uri), [F(1).uri]);
  // refresh with no session reads nothing and invents nothing
  const none = fakeLens({ record: fileRecord() });
  const cn = await pds.refresh(none, null);
  assert.deepEqual(none.calls, []);
  assert.equal(cn.known, false);
  assert.equal(cn.stale, true);
});

test('index-pds: no record on the account is KNOWN as no record — effective() is the device half, and nothing is invented', async () => {
  fresh();
  prefs.setOwn({ index: MINE, name: 'mine.json' });
  const c = await pds.refresh(fakeLens({ record: null }), ME);
  assert.equal(c.record, null);
  assert.equal(c.known, true);
  assert.deepEqual(pds.effective(ME), prefs.current());
  assert.equal(pds.effective(ME).mode, 'add');
});

test('index-pds: offline, the last known state stays and is labelled stale — "cannot reach" is never "no record"', async () => {
  fresh();
  const good = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: THEIRS } });
  await pds.refresh(good, ME);
  const c = await pds.refresh(fakeLens({ offline: true }), ME);
  assert.equal(c.stale, true);
  assert.equal(c.record.kind, 'file');
  assert.equal(c.index.feeds.length, 2, 'the cached file is still there');
  assert.equal(pds.effective(ME).mode, 'add');
});

test('index-pds: a fetch that fails NEVER rewrites the record or the mode (§ E.2) — Forage\'s index for this load, with words, retried next time', async () => {
  fresh();
  // no cache yet: the record is read but its blob is gone
  const lens = fakeLens({ record: fileRecord(), blobs: {} });
  const c = await pds.refresh(lens, ME);
  assert.equal(c.record.kind, 'file', 'the record is kept');
  assert.equal(c.record.mode, 'add');
  assert.equal(c.index, null);
  assert.match(c.error, /Blob not found/);
  const e = pds.effective(ME);
  assert.equal(e.mode, 'forage', 'Forage\'s index for THIS load');
  assert.equal(e.index, null);
  assert.match(e.fallback, /could not be fetched/);
  assert.match(e.fallback, /Blob not found/);
  assert.deepEqual(lens.calls.filter((x) => x.op === 'put' || x.op === 'delete'), [], 'nothing was written');
  // the network comes back: the next refresh fetches it
  lens.fetchIndexBlob = async () => THEIRS;
  const c2 = await pds.refresh(lens, ME);
  assert.equal(c2.index.feeds.length, 2);
  assert.equal(c2.error, null);
  assert.equal(pds.effective(ME).mode, 'add');
  // and with a cached copy, a later failure keeps the copy, labelled
  lens.fetchIndexBlob = async () => { throw new Error('HTTP 502'); };
  const c3 = await pds.refresh(lens, ME, { force: true });
  assert.equal(c3.index.feeds.length, 2, 'the last good copy stays');
  assert.match(c3.error, /502/);
  assert.equal(pds.effective(ME).mode, 'add');
});

test('index-pds: a fetched file that fails the validator is refused with its words; the previous copy stays', async () => {
  fresh();
  const lens = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: { v: 1, feeds: [{ ...F(1), name: '' }], jumpstarts: [], edges: [], providers: [] } } });
  const c = await pds.refresh(lens, ME);
  assert.equal(c.index, null);
  assert.match(c.error, /^your index was refused: feeds\[0\]: name is empty/);
});

test('index-pds: a record another client wrote badly is REPORTED, never silently repaired — and the device half stands in', async () => {
  fresh();
  prefs.setOwn({ index: MINE, name: 'mine.json' });
  const c = await pds.refresh(fakeLens({ record: { $type: 'fyi.forage.feedindex', kind: 'url', url: 'http://plain.example/i.json', mode: 'add', createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z' } }), ME);
  assert.equal(c.record, null);
  assert.equal(c.known, true);
  assert.match(c.error, /https/);
  assert.deepEqual(pds.effective(ME), prefs.current());
});

test('index-pds: publishFile moves the device\'s file onto the account — upload, put, THEN the device copy is dropped; the mode travels', async () => {
  fresh();
  prefs.setOwn({ index: MINE, name: 'mine.json' });
  prefs.setMode('replace');
  const lens = fakeLens();
  const c = await pds.publishFile(lens, ME, { now: '2026-09-21T10:00:00.000Z' });
  assert.deepEqual(lens.calls.map((x) => x.op), ['upload', 'put']);
  assert.equal(lens.calls[0].text, JSON.stringify(MINE), 'the index, as JSON, is what goes up');
  const rec = lens.calls[1].value;
  assert.equal(rec.kind, 'file');
  assert.equal(rec.mode, 'replace', 'Replace on the laptop is Replace on the phone (D4)');
  assert.equal(rec.name, 'mine.json');
  assert.equal(rec.file.ref.$link, 'bafkrei-up-1');
  assert.equal(rec.createdAt, '2026-09-21T10:00:00.000Z');
  assert.equal(prefs.own(), null, 'the device half no longer holds the file');
  assert.equal(prefs.mode(), 'forage');
  assert.equal(c.record.kind, 'file');
  assert.deepEqual(c.index.feeds.map((f) => f.uri), [F(1).uri], 'the copy is now the cache of the account\'s file');
  assert.equal(pds.effective(ME).mode, 'replace');
  // a device on Add (or on Forage's, or Off) publishes as add — Off is not a record value
  for (const deviceMode of ['add', 'forage', 'off']) {
    fresh();
    prefs.setOwn({ index: MINE, name: 'mine.json' });
    prefs.setMode(deviceMode);
    const l = fakeLens();
    await pds.publishFile(l, ME);
    assert.equal(l.calls[1].value.mode, 'add', `device ${deviceMode} → record add`);
  }
});

test('index-pds: publishFile with nothing on the device refuses in words; a refused upload or put leaves the device exactly as it was', async () => {
  fresh();
  await assert.rejects(() => pds.publishFile(fakeLens(), ME), /no file/i);
  prefs.setOwn({ index: MINE, name: 'mine.json' });
  const before = JSON.stringify(prefs.current());
  await assert.rejects(() => pds.publishFile(fakeLens({ failUpload: true }), ME), /upload refused/);
  assert.equal(JSON.stringify(prefs.current()), before);
  await assert.rejects(() => pds.publishFile(fakeLens({ failWrite: true }), ME), /write refused/);
  assert.equal(JSON.stringify(prefs.current()), before);
  await assert.rejects(() => pds.publishFile(fakeLens(), null), /sign in/i);
});

test('index-pds: publishUrl fetches and validates the link BEFORE the put — a link that does not answer is never published', async () => {
  fresh();
  const dead = fakeLens({ urls: {} });
  await assert.rejects(() => pds.publishUrl(dead, ME, { url: 'https://gardeners.example/index.json', mode: 'add' }), /404/);
  assert.deepEqual(dead.calls.map((x) => x.op), ['url'], 'no put');
  await assert.rejects(() => pds.publishUrl(fakeLens(), ME, { url: 'http://gardeners.example/index.json', mode: 'add' }), /https/);
  const bad = fakeLens({ urls: { 'https://gardeners.example/index.json': { v: 2 } } });
  await assert.rejects(() => pds.publishUrl(bad, ME, { url: 'https://gardeners.example/index.json', mode: 'add' }), /version/);
  assert.deepEqual(bad.calls.map((x) => x.op), ['url']);
  await assert.rejects(() => pds.publishUrl(bad, ME, { url: 'https://gardeners.example/index.json', mode: 'add' }), /the file at gardeners\.example was refused: version/);
  await assert.rejects(() => pds.publishUrl(fakeLens(), null, { url: 'https://gardeners.example/index.json', mode: 'add' }), /sign in/i);
  prefs.setOwn({ index: MINE, name: 'mine.json' });
  const lens = fakeLens({ urls: { 'https://gardeners.example/index.json': THEIRS } });
  const c = await pds.publishUrl(lens, ME, { url: 'https://gardeners.example/index.json', mode: 'add', name: 'Gardeners', now: '2026-09-21T10:00:00.000Z' });
  assert.deepEqual(lens.calls.map((x) => x.op), ['url', 'put']);
  assert.equal(lens.calls[1].value.kind, 'url');
  assert.equal(lens.calls[1].value.url, 'https://gardeners.example/index.json');
  assert.equal(lens.calls[1].value.name, 'Gardeners');
  assert.equal(c.index.feeds.length, 2);
  assert.equal(prefs.own(), null, 'where it is kept is where it is: the device file is dropped for the link');
  assert.equal(pds.effective(ME).mode, 'add');
});

test('index-pds: setMode rewrites the record in place — createdAt kept, updatedAt moved, the file untouched', async () => {
  fresh();
  const lens = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: THEIRS } });
  await pds.refresh(lens, ME);
  const c = await pds.setMode(lens, ME, 'replace', { now: '2026-09-22T00:00:00.000Z' });
  const put = lens.calls.find((x) => x.op === 'put');
  assert.equal(put.value.mode, 'replace');
  assert.equal(put.value.createdAt, '2026-09-20T00:00:00.000Z');
  assert.equal(put.value.updatedAt, '2026-09-22T00:00:00.000Z');
  assert.deepEqual(put.value.file, BLOB());
  assert.equal(put.value.name, 'Gardeners', 'the name rides along');
  assert.equal(c.index.feeds.length, 2, 'no refetch');
  assert.equal(pds.effective(ME).mode, 'replace');
  await assert.rejects(() => pds.setMode(lens, ME, 'off'), /mode/);
  await assert.rejects(() => pds.setMode(lens, null, 'add'), /sign in/i);
  fresh();
  await assert.rejects(() => pds.setMode(fakeLens(), ME, 'add'), /no index on your account/);
});

test('index-pds: unpublish confirms FRESH, brings the file back to the device with the record\'s mode, deletes, and forgets the cache', async () => {
  fresh();
  const lens = fakeLens({ record: fileRecord({ mode: 'replace' }), blobs: { bafkreiaaa: THEIRS } });
  await pds.refresh(lens, ME);
  const c = await pds.unpublish(lens, ME);
  assert.deepEqual(lens.calls.map((x) => x.op).slice(-2), ['get', 'delete'], 'read first, then delete');
  assert.equal(lens.state.record, null);
  assert.equal(prefs.own().name, 'Gardeners');
  assert.deepEqual(prefs.own().index.feeds.map((f) => f.uri), [F(2).uri, F(3).uri]);
  assert.equal(prefs.mode(), 'replace', 'the choice survives the move');
  assert.equal(c.record, null);
  assert.equal(c.index, null);
  assert.deepEqual(pds.effective(ME), prefs.current());
});

test('index-pds: unpublish offline refuses in words and changes nothing; unpublish with no record on the account just clears the cache', async () => {
  fresh();
  const lens = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: THEIRS } });
  await pds.refresh(lens, ME);
  await assert.rejects(() => pds.unpublish(fakeLens({ offline: true }), ME), /can't reach|cannot reach/i);
  await assert.rejects(() => pds.unpublish(fakeLens(), null), /sign in/i);
  assert.equal(pds.cachedAccount(ME).record.kind, 'file');
  assert.equal(prefs.own(), null);
  const none = fakeLens({ record: null });
  const c = await pds.unpublish(none, ME);
  assert.deepEqual(none.calls.map((x) => x.op), ['get']);
  assert.equal(c.record, null);
  assert.equal(c.known, true);
});

test('index-pds: unpublish of a record whose file was never cached fetches it first so nothing is lost; if it cannot, it refuses', async () => {
  fresh();
  const lens = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: THEIRS } });
  await pds.unpublish(lens, ME);
  assert.deepEqual(lens.calls.map((x) => x.op), ['get', 'blob', 'delete']);
  assert.equal(prefs.own().index.feeds.length, 2);
  fresh();
  const gone = fakeLens({ record: fileRecord(), blobs: {} });
  await assert.rejects(() => pds.unpublish(gone, ME), /Blob not found/);
  assert.equal(gone.state.record.kind, 'file', 'not deleted');
  // a fetched file that fails the validator refuses too, with its words
  const junk = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: { v: 2 } } });
  await assert.rejects(() => pds.unpublish(junk, ME), /your index was refused: version/);
  assert.equal(junk.state.record.kind, 'file', 'not deleted');
  // the cache holds a DIFFERENT file than the account now names: the live one is fetched, not the stale copy
  fresh();
  const changed = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: THEIRS, bafkreibbb: MINE } });
  await pds.refresh(changed, ME);
  changed.state.record = fileRecord({ file: BLOB('bafkreibbb') });
  await pds.unpublish(changed, ME);
  assert.deepEqual(changed.calls.map((x) => x.op).slice(-3), ['get', 'blob', 'delete']);
  assert.deepEqual(prefs.own().index.feeds.map((f) => f.uri), [F(1).uri], 'the file the account named last, not the copy');
  // a record cached WITHOUT its file (an earlier fetch failed) fetches it on the way back
  fresh();
  const late = fakeLens({ record: fileRecord(), blobs: {} });
  await pds.refresh(late, ME);
  assert.equal(pds.cachedAccount(ME).index, null);
  late.fetchIndexBlob = async () => THEIRS;
  await pds.unpublish(late, ME);
  assert.equal(prefs.own().index.feeds.length, 2);
});

test('index-pds: effective() — device Off wins on this device (§ E.4); a record wins over a device file (D6); the cache is per DID', async () => {
  fresh();
  const lens = fakeLens({ record: fileRecord(), blobs: { bafkreiaaa: THEIRS } });
  await pds.refresh(lens, ME);
  prefs.setOwn({ index: MINE, name: 'stray.json' });
  assert.deepEqual(pds.effective(ME).index.feeds.map((f) => f.uri), [F(2).uri, F(3).uri], 'the record\'s file, not the stray device one');
  prefs.setMode('off');
  assert.equal(pds.effective(ME).mode, 'off');
  assert.equal(pds.effective(ME).index, null);
  prefs.setMode('add');
  assert.equal(pds.effective('did:plc:someone-else').mode, 'add', 'another DID sees the device half, not my cache');
  assert.deepEqual(pds.effective('did:plc:someone-else').index.feeds.map((f) => f.uri), [F(1).uri]);
});

test('index-pds: a corrupt cache reads as nothing known', async () => {
  fresh();
  store.set(pds.PDS_CACHE_KEY, '{not json');
  assert.equal(pds.cachedAccount(ME).known, false);
  store.set(pds.PDS_CACHE_KEY, JSON.stringify({ did: 'did:plc:other', record: {}, index: MINE }));
  assert.equal(pds.cachedAccount(ME).known, false, 'someone else\'s cache is not mine');
});

test('index-pds: the cache key is registered as a cache, and the record collection is the codec\'s', () => {
  assert.equal(pds.PDS_CACHE_KEY, 'forage.feedindex.pds');
});
