// 3t: the image-size slider. Card mode shows media, and how big media should
// be is a per-eye, per-screen judgement — a 220px cap is right for a phone and
// small on a 27" display. Device-local like the presentation mode: it is a
// viewing preference, not account state, so it never touches the Bluesky
// account and never syncs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_SCALE, stored, active, set, clear, cssValue } from '../js/media-scale.js';

const withStore = (fn) => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  try { return fn(map); } finally { delete globalThis.localStorage; }
};

test('3t: the scale has published bounds and a default inside them', () => {
  assert.ok(MEDIA_SCALE.min < MEDIA_SCALE.default && MEDIA_SCALE.default < MEDIA_SCALE.max);
  assert.equal(MEDIA_SCALE.default, 220, 'the cap that shipped stays the default — nobody wakes up to a different board');
  assert.ok(MEDIA_SCALE.step >= 1);
});

test('3t: with nothing stored the board looks exactly as it always did', () => {
  withStore(() => {
    assert.equal(stored(), null);
    assert.equal(active(), MEDIA_SCALE.default);
    assert.equal(cssValue(), '220px');
  });
});

test('3t: a choice persists, and reads back as itself', () => {
  withStore((map) => {
    set(400);
    assert.equal(map.get('forage.mediascale'), '400');
    assert.equal(stored(), 400);
    assert.equal(active(), 400);
    assert.equal(cssValue(), '400px');
    clear();
    assert.equal(stored(), null, 'clearing returns the board to the default');
    assert.equal(active(), MEDIA_SCALE.default);
  });
});

test('3t: garbage reads as no choice; a number out of range is CLAMPED, not discarded', () => {
  withStore((map) => {
    // not a number at all — the preference is absent, and the board is default
    for (const junk of ['', 'wide', 'NaN', '{}']) {
      map.set('forage.mediascale', junk);
      assert.equal(stored(), null, `${JSON.stringify(junk)} is not a scale`);
      assert.equal(active(), MEDIA_SCALE.default);
    }
    // a number IS a choice — it just may predate the current bounds, so it is
    // pulled into range rather than thrown away (the user did pick "small")
    map.set('forage.mediascale', String(MEDIA_SCALE.max + 5000));
    assert.equal(active(), MEDIA_SCALE.max, 'clamped to the published ceiling');
    map.set('forage.mediascale', '-40');
    assert.equal(active(), MEDIA_SCALE.min, 'clamped to the floor, not reset to the default');
  });
});

test('3t: set refuses a value that is not a number at all', () => {
  withStore(() => {
    assert.throws(() => set('big'), /scale/i);
    assert.throws(() => set(NaN), /scale/i);
  });
});

test('3t: a storage that throws (private mode) still yields a working board', () => {
  const boom = () => { throw new Error('denied'); };
  globalThis.localStorage = { getItem: boom, setItem: boom, removeItem: boom };
  try {
    assert.equal(active(), MEDIA_SCALE.default);
    assert.doesNotThrow(() => set(300));
    assert.doesNotThrow(() => clear());
  } finally { delete globalThis.localStorage; }
});
