// Mixes — plan 2026-09-08, Phase 1: the model.
//
// A mix is rows of { source, on, weight } over the reader's subscriptions.
// Home stores OVERRIDES only, so a subscription made tomorrow is in Home
// tomorrow; a custom mix stores its rows in full and starts empty. Weights are
// one multiplier per row (×½ · ×1 · ×2, decision D1); Off is a switch that
// remembers the weight (D2). Device-local, like the ring (D4).
//
// The module never reaches for the lens or tagsubs: the caller hands it the
// subscriptions, so it can be replayed in a test with no session — the same
// rule the retired ring board learned ("a substrate that reaches for
// localStorage cannot be replayed").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIXES_KEY, HOME, WEIGHTS, DEFAULT_WEIGHT, weightLabel,
  sourceId, sourceFromId, subscriptions,
  mixes, mix, enabledRows, setRow, removeRow, createMix, renameMix, deleteMix, onChange,
  toRecord, fromRecord, MIX_COLLECTION,
} from '../js/mixes.js';

function withStorage(seed = {}, fn) {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  try { return fn(store); } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
}

// The reader's subscriptions, as the caller would hand them over: what
// lens.feeds() returns for saved feeds (timeline included), plus effectiveTags().
const FEEDS = [
  { kind: 'timeline', title: 'Following', slug: 'following' },
  { kind: 'feed', uri: 'at://did:plc:a/app.bsky.feed.generator/funny', title: 'Funny', slug: 'funny' },
  { kind: 'feed', uri: 'at://did:plc:b/app.bsky.feed.generator/science', title: 'Science', slug: 'science' },
  { kind: 'list', uri: 'at://did:plc:c/app.bsky.graph.list/friends', title: 'Friends', slug: 'friends' },
];
const TAGS = ['harvest', 'foraging'];
const SUBS = subscriptions({ feeds: FEEDS, tags: TAGS });
const FUNNY = 'feed:at://did:plc:a/app.bsky.feed.generator/funny';

// ---- source ids ----

test('a source id is stable and round-trips', () => {
  assert.equal(sourceId({ kind: 'timeline' }), 'timeline');
  assert.equal(sourceId({ kind: 'feed', uri: 'at://x/y/z' }), 'feed:at://x/y/z');
  assert.equal(sourceId({ kind: 'list', uri: 'at://x/y/l' }), 'list:at://x/y/l');
  assert.equal(sourceId({ kind: 'hashtag', tag: 'Harvest' }), 'hashtag:harvest', 'tags normalise like tagsubs do');
  for (const s of [{ kind: 'timeline' }, { kind: 'feed', uri: 'at://x/y/z' }, { kind: 'list', uri: 'at://x/y/l' }, { kind: 'hashtag', tag: 'harvest' }]) {
    assert.deepEqual(sourceFromId(sourceId(s)), s);
  }
  assert.throws(() => sourceId({ kind: 'author', actor: 'x' }), /not a mix source/);
});

test('subscriptions() lists every kind the reader has, timeline first, in the order given', () => {
  assert.deepEqual(SUBS.map((s) => s.id), [
    'timeline', FUNNY, 'feed:at://did:plc:b/app.bsky.feed.generator/science',
    'list:at://did:plc:c/app.bsky.graph.list/friends', 'hashtag:harvest', 'hashtag:foraging',
  ]);
  assert.equal(SUBS[0].title, 'Following');
  assert.equal(SUBS.at(-1).title, '#foraging');
  assert.equal(SUBS.at(-1).kind, 'hashtag');
});

// ---- Home ----

test('Home exists with no storage at all: every subscription on, at Normal', () => {
  withStorage({}, () => {
    assert.deepEqual(mixes().map((m) => m.slug), [HOME]);
    const h = mix(HOME, SUBS);
    assert.equal(h.name, 'Home');
    assert.equal(h.home, true);
    assert.equal(h.rows.length, SUBS.length);
    assert.ok(h.rows.every((r) => r.on && r.weight === DEFAULT_WEIGHT && r.subscribed));
  });
});

test('Home stores overrides only: a subscription made later is in Home, on, without a write', () => {
  withStorage({}, (store) => {
    setRow(HOME, FUNNY, { weight: 2 });
    const later = subscriptions({ feeds: [...FEEDS, { kind: 'feed', uri: 'at://did:plc:d/app.bsky.feed.generator/new', title: 'New', slug: 'new' }], tags: TAGS });
    const h = mix(HOME, later);
    const added = h.rows.find((r) => r.id === 'feed:at://did:plc:d/app.bsky.feed.generator/new');
    assert.deepEqual({ on: added.on, weight: added.weight }, { on: true, weight: DEFAULT_WEIGHT });
    assert.equal(h.rows.find((r) => r.id === FUNNY).weight, 2, 'and the override held');
    const doc = JSON.parse(store[MIXES_KEY]);
    assert.equal(Object.keys(doc.home.overrides).length, 1, 'ONE override stored, not a row per subscription');
  });
});

test('Home cannot be deleted, and cannot be renamed to nothing', () => {
  withStorage({}, () => {
    assert.throws(() => deleteMix(HOME), /Home/);
    assert.throws(() => renameMix(HOME, '   '), /name/);
    renameMix(HOME, 'Front page');
    assert.equal(mix(HOME, SUBS).name, 'Front page');
  });
});

// ---- the switch and the weight ----

test('Off is a switch that remembers the weight', () => {
  withStorage({}, () => {
    setRow(HOME, FUNNY, { weight: 2 });
    setRow(HOME, FUNNY, { on: false });
    let row = mix(HOME, SUBS).rows.find((r) => r.id === FUNNY);
    assert.deepEqual({ on: row.on, weight: row.weight }, { on: false, weight: 2 }, 'off, and still More');
    setRow(HOME, FUNNY, { on: true });
    row = mix(HOME, SUBS).rows.find((r) => r.id === FUNNY);
    assert.deepEqual({ on: row.on, weight: row.weight }, { on: true, weight: 2 }, 'back on at More, not Normal');
  });
});

test('weights are the three notches and nothing else', () => {
  assert.deepEqual([...WEIGHTS], [0.5, 1, 2]);
  assert.deepEqual(WEIGHTS.map(weightLabel), ['Less', 'Normal', 'More']);
  withStorage({}, () => {
    assert.throws(() => setRow(HOME, FUNNY, { weight: 3 }), /weight/);
    assert.throws(() => setRow(HOME, FUNNY, { weight: 0 }), /weight/, 'zero is the switch, not a notch');
  });
});

test('enabledRows is what the substrate fetches: on AND still subscribed, with the weight', () => {
  withStorage({}, () => {
    setRow(HOME, FUNNY, { on: false });
    setRow(HOME, 'hashtag:harvest', { weight: 0.5 });
    const rows = enabledRows(HOME, SUBS);
    assert.ok(!rows.some((r) => r.id === FUNNY), 'off is not fetched');
    assert.equal(rows.find((r) => r.id === 'hashtag:harvest').weight, 0.5);
    assert.deepEqual(rows.find((r) => r.id === 'hashtag:harvest').source, { kind: 'hashtag', tag: 'harvest' });
    assert.equal(rows.length, SUBS.length - 1);
  });
});

// ---- custom mixes ----

test('a new mix starts EMPTY: every subscription listed, every switch off', () => {
  withStorage({}, () => {
    const slug = createMix('Weekend Reads');
    assert.equal(slug, 'weekend-reads');
    assert.deepEqual(mixes().map((m) => m.slug), [HOME, 'weekend-reads'], 'Home first, then in the order made');
    const m = mix(slug, SUBS);
    assert.equal(m.home, false);
    assert.equal(m.rows.length, SUBS.length, 'every subscription is a row');
    assert.ok(m.rows.every((r) => !r.on && r.weight === DEFAULT_WEIGHT));
    assert.deepEqual(enabledRows(slug, SUBS), []);
  });
});

test('a custom mix stores its rows in full: a subscription made later is NOT in it', () => {
  withStorage({}, () => {
    const slug = createMix('Weekend');
    setRow(slug, FUNNY, { on: true, weight: 2 });
    const later = subscriptions({ feeds: [...FEEDS, { kind: 'feed', uri: 'at://did:plc:d/app.bsky.feed.generator/new', title: 'New', slug: 'new' }], tags: TAGS });
    const m = mix(slug, later);
    assert.equal(m.rows.find((r) => r.id.endsWith('/new')).on, false, 'listed, off');
    assert.deepEqual(enabledRows(slug, later).map((r) => r.id), [FUNNY]);
  });
});

test('creating a mix refuses an empty name and a slug already taken, by name', () => {
  withStorage({}, () => {
    assert.throws(() => createMix(''), /name/);
    assert.throws(() => createMix('Home'), /home/i, 'the Home slug is reserved');
    createMix('Weekend');
    assert.throws(() => createMix('weekend'), /weekend/);
    assert.throws(() => setRow('nope', FUNNY, { on: true }), /nope/);
  });
});

test('rename and delete', () => {
  withStorage({}, () => {
    const slug = createMix('Weekend');
    renameMix(slug, 'Sunday');
    assert.equal(mix(slug, SUBS).name, 'Sunday');
    assert.equal(mix(slug, SUBS).slug, slug, 'renaming keeps the slug — it is the address');
    deleteMix(slug);
    assert.deepEqual(mixes().map((m) => m.slug), [HOME]);
    assert.throws(() => mix(slug, SUBS), /weekend/);
  });
});

// ---- repair on read ----

test('a row for a subscription the reader has since dropped is kept, marked, and never fetched', () => {
  withStorage({}, () => {
    const slug = createMix('Weekend');
    setRow(slug, 'hashtag:foraging', { on: true });
    setRow(HOME, 'hashtag:foraging', { weight: 2 });
    const fewer = subscriptions({ feeds: FEEDS, tags: ['harvest'] });
    for (const s of [slug, HOME]) {
      const gone = mix(s, fewer).rows.find((r) => r.id === 'hashtag:foraging');
      assert.equal(gone.subscribed, false, `${s}: the row survives so the reader can see and remove it`);
      assert.ok(!enabledRows(s, fewer).some((r) => r.id === 'hashtag:foraging'), `${s}: but it is not fetched`);
    }
    assert.equal(mix(slug, fewer).rows.at(-1).id, 'hashtag:foraging', 'unsubscribed rows list last');
    assert.equal(mix(slug, fewer).rows.at(-1).title, '#foraging', 'and keep a readable name, not the raw id');
    setRow(HOME, 'feed:at://did:plc:z/app.bsky.feed.generator/gone-feed', { weight: 2 });
    assert.equal(mix(HOME, fewer).rows.at(-1).title, 'gone-feed');
  });
});

test('removeRow forgets a stored row — the way to clear an unsubscribed one from the page', () => {
  withStorage({}, () => {
    setRow(HOME, 'hashtag:foraging', { weight: 2 });
    const fewer = subscriptions({ feeds: FEEDS, tags: ['harvest'] });
    assert.equal(mix(HOME, fewer).rows.some((r) => r.id === 'hashtag:foraging'), true);
    removeRow(HOME, 'hashtag:foraging');
    assert.equal(mix(HOME, fewer).rows.some((r) => r.id === 'hashtag:foraging'), false);
    // on a LIVE subscription it is a reset to the mix's default, not a hole
    setRow(HOME, FUNNY, { on: false, weight: 0.5 });
    removeRow(HOME, FUNNY);
    const row = mix(HOME, SUBS).rows.find((r) => r.id === FUNNY);
    assert.deepEqual({ on: row.on, weight: row.weight }, { on: true, weight: DEFAULT_WEIGHT });
    assert.throws(() => removeRow('nope', FUNNY), /nope/);
  });
});

test('corrupt or foreign storage reads as Home alone and never throws', () => {
  for (const seed of ['{not json', '[]', JSON.stringify({ mixes: 'nope' }), JSON.stringify({ home: { overrides: { [FUNNY]: { weight: 7, on: 'yes' } } } })]) {
    withStorage({ [MIXES_KEY]: seed }, () => {
      assert.deepEqual(mixes().map((m) => m.slug), [HOME]);
      const row = mix(HOME, SUBS).rows.find((r) => r.id === FUNNY);
      assert.ok(WEIGHTS.includes(row.weight), `a stored weight off the notches is clamped (got ${row.weight})`);
      assert.equal(typeof row.on, 'boolean');
    });
  }
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.deepEqual(mixes().map((m) => m.slug), [HOME]);
    assert.equal(mix(HOME, SUBS).rows.length, SUBS.length);
  } finally { if (saved !== undefined) globalThis.localStorage = saved; }
});

test('every write notifies, with the list of mixes', () => {
  withStorage({}, () => {
    const seen = [];
    const off = onChange((s) => seen.push(s));
    try {
      const slug = createMix('Weekend');
      setRow(slug, FUNNY, { on: true });
      renameMix(slug, 'Sunday');
      setRow(HOME, FUNNY, { weight: 2 });
      deleteMix(slug);
      assert.equal(seen.length, 5);
      assert.deepEqual(seen.at(-1).mixes.map((m) => m.slug), [HOME]);
    } finally { off(); }
  });
});

// ---- the record codec (plan 2026-09-08 mixes-on-the-pds, Phase 1) ----
//
// toRecord() is what publishMix sends; fromRecord() is what a published mix
// becomes on read — validated against lexicons/fyi.forage.mix.json first,
// because a PDS accepts anything (W17). Weights are words on the wire (D4).

test('the collection is pinned by name', () => {
  assert.equal(MIX_COLLECTION, 'fyi.forage.mix');
});

test('a custom mix round-trips through its record, weights as words', () => {
  withStorage({}, () => {
    const slug = createMix('Weekend Reads');
    setRow(slug, FUNNY, { on: true, weight: 2 });
    setRow(slug, 'hashtag:harvest', { on: true, weight: 0.5 });
    const rec = toRecord(slug, '2026-09-08T12:00:00.000Z');
    assert.equal(rec.$type, 'fyi.forage.mix');
    assert.deepEqual({ name: rec.name, home: rec.home }, { name: 'Weekend Reads', home: false });
    assert.deepEqual(rec.rows, [
      { kind: 'feed', uri: FUNNY.slice('feed:'.length), on: true, weight: 'more' },
      { kind: 'hashtag', tag: 'harvest', on: true, weight: 'less' },
    ], 'only STORED rows travel — a custom mix is its rows');
    assert.equal(rec.updatedAt, '2026-09-08T12:00:00.000Z');
    const back = fromRecord(rec, { rkey: slug });
    assert.deepEqual(back, { slug, name: 'Weekend Reads', home: false,
      rows: { [FUNNY]: { on: true, weight: 2 }, 'hashtag:harvest': { on: true, weight: 0.5 } } });
  });
});

test('Home travels as its overrides only, flagged home', () => {
  withStorage({}, () => {
    setRow(HOME, 'timeline', { on: false });
    const rec = toRecord(HOME, '2026-09-08T12:00:00.000Z');
    assert.equal(rec.home, true);
    assert.deepEqual(rec.rows, [{ kind: 'timeline', on: false, weight: 'normal' }]);
    assert.deepEqual(fromRecord(rec, { rkey: HOME }).rows, { timeline: { on: false, weight: 1 } });
  });
});

test('a record that fails the schema is refused with words, never repaired', () => {
  assert.throws(() => fromRecord({ $type: 'fyi.forage.mix', name: 'x', home: false, rows: [{ kind: 'author', on: true, weight: 'normal' }], createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z' }, { rkey: 'x' }), /kind/);
  assert.throws(() => fromRecord({ name: 'x' }, { rkey: 'x' }), /rows/);
  assert.throws(() => toRecord('nope'), /nope/);
});

test('createdAt is kept across an update; a first record gets it from the clock', () => {
  withStorage({}, () => {
    const slug = createMix('W');
    const first = toRecord(slug, '2026-09-08T12:00:00.000Z');
    assert.equal(first.createdAt, '2026-09-08T12:00:00.000Z');
    const second = toRecord(slug, '2026-09-09T12:00:00.000Z', { createdAt: first.createdAt });
    assert.deepEqual([second.createdAt, second.updatedAt], ['2026-09-08T12:00:00.000Z', '2026-09-09T12:00:00.000Z']);
  });
});
