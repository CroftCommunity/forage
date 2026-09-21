// View modes (plan 2026-09-14-plan-clips, owner 2026-09-16): a board can be
// shown as FORUM (rows, today), CLIP (video-centred, one clip per screen) or
// GRAM (picture-centred). One device-local preference, read by the nav pill
// and by the board renderer, on the ring-scope tenet: every read is a repair,
// every write refuses by name.
//
// The reader-facing word is "mode"; the code says "view" because js/mode.js
// already means which POPULATION the app is (D8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODES, MODE_IDS, DEFAULT_MODE, KEY, active, set, onChange, ofKind, viewPill } from '../js/view-mode.js';

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

const fakeEl = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids: kids.flat().filter((k) => k != null && k !== false) });
const walk = (n, out = []) => { if (n && n.tag) { out.push(n); (n.kids || []).forEach((k) => walk(k, out)); } return out; };
const inputs = (pill) => walk(pill).filter((n) => n.tag === 'input');

test('three modes, forum first and the default; the key is forage.view', () => {
  assert.deepEqual(MODE_IDS, ['forum', 'clip', 'gram']);
  assert.equal(DEFAULT_MODE, 'forum');
  assert.equal(KEY, 'forage.view');
  for (const m of MODES) { assert.ok(m.label && m.blurb, `${m.id} has a label and a blurb`); }
});

test('a stored mode is read back; garbage and a missing key read as forum', () => {
  withStorage({}, () => assert.equal(active(), 'forum'));
  withStorage({ 'forage.view': 'gram' }, () => assert.equal(active(), 'gram'));
  withStorage({ 'forage.view': 'reels' }, () => assert.equal(active(), 'forum'));
});

test('set writes the key and notifies; an unknown mode refuses by name', () => {
  withStorage({}, (store) => {
    const seen = [];
    const off = onChange((m) => seen.push(m));
    set('clip');
    assert.equal(store['forage.view'], 'clip');
    assert.deepEqual(seen, ['clip']);
    off();
    assert.throws(() => set('shorts'), /shorts/);
  });
});

test('with no storage at all (private mode throws) reads fall to forum and writes do not throw', () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  try {
    assert.equal(active(), 'forum');
    assert.doesNotThrow(() => set('gram'));
  } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
});

// The kind filter is over the SHAPED post's media, which the lens already
// produces for every embed — no new fetch shape and no new field.
const posts = [
  { id: 'a', media: { kind: 'video' } },
  { id: 'b', media: { kind: 'images', items: [{}] } },
  { id: 'c' },
  { id: 'd', media: { kind: 'external' } },
  { id: 'e', media: { kind: 'gif' } },
  { id: 'f', media: { kind: 'video' }, maskedRemoved: true },
];
test('ofKind: forum is every post; clip is the videos; gram is the picture posts AND GIF cards (D9); a removed post is never a frame', () => {
  assert.deepEqual(ofKind(posts, 'forum').map((p) => p.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(ofKind(posts, 'clip').map((p) => p.id), ['a']);
  assert.deepEqual(ofKind(posts, 'gram').map((p) => p.id), ['b', 'e']);
  assert.throws(() => ofKind(posts, 'shorts'), /shorts/);
});

test('the pill is one radio group with a segment per mode, the active one checked', () => {
  withStorage({ 'forage.view': 'clip' }, () => {
    const pill = viewPill(fakeEl, { onPicked() {} });
    assert.equal(pill.attrs['data-view-pill'], '1');
    assert.equal(pill.attrs.role, 'radiogroup');
    assert.deepEqual(inputs(pill).map((i) => i.attrs['data-view']), ['forum', 'clip', 'gram']);
    const checked = inputs(pill).filter((i) => i.attrs.checked);
    assert.equal(checked.length, 1);
    assert.equal(checked[0].attrs['data-view'], 'clip');
    const names = new Set(inputs(pill).map((i) => i.attrs.name));
    assert.equal(names.size, 1, 'one group');
  });
});

test('two pills on one page are two radio groups, and the block variant wears the nav dressing', () => {
  withStorage({}, () => {
    const a = inputs(viewPill(fakeEl, { onPicked() {} }))[0].attrs.name;
    const b = inputs(viewPill(fakeEl, { onPicked() {} }))[0].attrs.name;
    assert.notEqual(a, b);
    const block = viewPill(fakeEl, { block: true, onPicked() {} });
    assert.match(block.attrs.class, /ringpill-block/);
  });
});

test('picking a segment reports the mode and writes nothing itself (the caller decides)', () => {
  withStorage({}, (store) => {
    const picked = [];
    const pill = viewPill(fakeEl, { onPicked: (id) => picked.push(id) });
    inputs(pill).find((i) => i.attrs['data-view'] === 'gram').attrs.onchange();
    assert.deepEqual(picked, ['gram']);
    assert.equal(store['forage.view'], undefined);
  });
});
