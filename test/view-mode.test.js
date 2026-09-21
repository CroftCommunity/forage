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
import { MODES, MODE_IDS, DEFAULT_MODE, KEY, active, set, onChange, ofKind, viewSelect } from '../js/view-mode.js';

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

// D7, decided 2026-09-21 (owner): "not really a gradient … basically a content
// type filter and formatting and it's one at a time" — so not the ring pill's
// segmented control but a dropdown, the sort bar's own dressing, in the top bar.
const options = (sel) => walk(sel).filter((n) => n.tag === 'option');

test('the control is one select with an option per mode, the active one selected', () => {
  withStorage({ 'forage.view': 'clip' }, () => {
    const sel = viewSelect(fakeEl, { onPicked() {} });
    assert.equal(sel.tag, 'select');
    assert.equal(sel.attrs['data-view-select'], '1');
    assert.match(sel.attrs.class, /pillsel/, 'the sort bar\'s dressing');
    assert.ok(sel.attrs['aria-label'], 'named for a screen reader');
    assert.deepEqual(options(sel).map((o) => o.attrs.value), ['forum', 'clip', 'gram']);
    assert.deepEqual(options(sel).map((o) => o.kids.join('')), ['Forum', 'Clip', 'Gram']);
    assert.deepEqual(options(sel).filter((o) => o.attrs.selected).map((o) => o.attrs.value), ['clip']);
  });
});

test('choosing reports the mode and writes nothing itself (the caller decides)', () => {
  withStorage({}, (store) => {
    const picked = [];
    const sel = viewSelect(fakeEl, { onPicked: (id) => picked.push(id) });
    sel.attrs.onchange({ target: { value: 'gram' } });
    assert.deepEqual(picked, ['gram']);
    assert.equal(store['forage.view'], undefined);
  });
});
