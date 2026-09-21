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
import { MODES, MODE_IDS, DEFAULT_MODE, KEY, DEFAULT_KEY, active, set, defaultMode, setDefault, onChange, ofKind, viewSelect } from '../js/view-mode.js';

// Two stores (owner, 2026-09-21: "add a 'default' setting for it in the user
// settings and have it be 'forum' by default"): the DEFAULT is a device
// preference (localStorage, forage.viewdefault); the LIVE choice on the top
// bar's dropdown lasts the visit (sessionStorage, forage.view). `seed` is the
// local store, `session` the session store.
function withStorage(seed = {}, fn, session = {}) {
  const store = { ...seed }; const sess = { ...session };
  const saved = globalThis.localStorage; const savedS = globalThis.sessionStorage;
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  globalThis.sessionStorage = { getItem: (k) => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); }, removeItem: (k) => { delete sess[k]; } };
  try { return fn(store, sess); } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
    if (savedS === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = savedS;
  }
}

const fakeEl = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids: kids.flat().filter((k) => k != null && k !== false) });
const walk = (n, out = []) => { if (n && n.tag) { out.push(n); (n.kids || []).forEach((k) => walk(k, out)); } return out; };
const inputs = (pill) => walk(pill).filter((n) => n.tag === 'input');

test('three modes, forum first and the default; the live key is forage.view, the default key forage.viewdefault', () => {
  assert.deepEqual(MODE_IDS, ['forum', 'clip', 'gram']);
  assert.equal(DEFAULT_MODE, 'forum');
  assert.equal(KEY, 'forage.view');
  assert.equal(DEFAULT_KEY, 'forage.viewdefault');
  for (const m of MODES) { assert.ok(m.label && m.blurb, `${m.id} has a label and a blurb`); }
});

test('nothing chosen anywhere reads as forum; the default is a device preference; the live choice wins for the visit', () => {
  withStorage({}, () => { assert.equal(defaultMode(), 'forum'); assert.equal(active(), 'forum'); });
  withStorage({ 'forage.viewdefault': 'gram' }, () => { assert.equal(defaultMode(), 'gram'); assert.equal(active(), 'gram', 'a fresh visit opens in the default'); });
  withStorage({ 'forage.viewdefault': 'gram' }, () => assert.equal(active(), 'clip', 'the visit\'s own choice wins'), { 'forage.view': 'clip' });
  withStorage({ 'forage.viewdefault': 'reels' }, () => assert.equal(active(), 'forum', 'garbage reads as forum'), { 'forage.view': 'shorts' });
});

test('set writes the LIVE key (this visit) and notifies; setDefault writes the device preference; an unknown mode refuses by name', () => {
  withStorage({}, (store, sess) => {
    const seen = [];
    const off = onChange((m) => seen.push(m));
    set('clip');
    assert.equal(sess['forage.view'], 'clip');
    assert.equal(store['forage.view'], undefined, 'the live choice does not touch the device store');
    assert.deepEqual(seen, ['clip']);
    setDefault('gram');
    assert.equal(store['forage.viewdefault'], 'gram');
    assert.equal(active(), 'clip', 'changing the default does not change this visit');
    off();
    assert.throws(() => set('shorts'), /shorts/);
    assert.throws(() => setDefault('shorts'), /shorts/);
  });
});

test('with no storage at all (private mode throws) reads fall to forum and writes do not throw', () => {
  const saved = globalThis.localStorage; const savedS = globalThis.sessionStorage;
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  globalThis.localStorage = denied; globalThis.sessionStorage = denied;
  try {
    assert.equal(active(), 'forum');
    assert.doesNotThrow(() => set('gram'));
    assert.doesNotThrow(() => setDefault('gram'));
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
    if (savedS === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = savedS;
  }
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
  withStorage({}, () => {
    const sel = viewSelect(fakeEl, { onPicked() {} });
    assert.equal(sel.tag, 'select');
    assert.equal(sel.attrs['data-view-select'], '1');
    assert.match(sel.attrs.class, /pillsel/, 'the sort bar\'s dressing');
    assert.ok(sel.attrs['aria-label'], 'named for a screen reader');
    assert.deepEqual(options(sel).map((o) => o.attrs.value), ['forum', 'clip', 'gram']);
    assert.deepEqual(options(sel).map((o) => o.kids.join('')), ['Forum', 'Clip', 'Gram']);
    assert.deepEqual(options(sel).filter((o) => o.attrs.selected).map((o) => o.attrs.value), ['clip']);
  }, { 'forage.view': 'clip' });
});

test('the settings control picks the DEFAULT, forum unless chosen, and writes the device preference', () => {
  withStorage({}, (store) => {
    const sel = viewSelect(fakeEl, { which: 'default', onPicked: (id) => setDefault(id) });
    assert.equal(sel.attrs['data-view-default'], '1');
    assert.deepEqual(options(sel).filter((o) => o.attrs.selected).map((o) => o.attrs.value), ['forum']);
    sel.attrs.onchange({ target: { value: 'clip' } });
    assert.equal(store['forage.viewdefault'], 'clip');
  });
});

test('choosing reports the mode and writes nothing itself (the caller decides)', () => {
  withStorage({}, (store) => {
    const picked = [];
    const sel = viewSelect(fakeEl, { onPicked: (id) => picked.push(id) });
    sel.attrs.onchange({ target: { value: 'gram' } });
    assert.deepEqual(picked, ['gram']);
    assert.equal(store['forage.view'], undefined);
    assert.equal(store['forage.viewdefault'], undefined);
  });
});
