// feed-row v4 (owner, 2026-08-30): a reply you started is kept — in this
// browser, keyed by the post you were answering — until you send it or discard
// it. Blank text is no draft; a corrupt entry reads as none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREFIX, keyFor, load, save, clear } from '../js/drafts.js';

const withStore = (fn) => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  try { return fn(map); } finally { delete globalThis.localStorage; }
};
const URI = 'at://did:plc:root/app.bsky.feed.post/root';

test('a draft is kept per post answered, and comes back with when it was saved', () => {
  withStore((map) => {
    assert.equal(PREFIX, 'forage.draft:');
    assert.equal(keyFor(URI), `forage.draft:${URI}`);
    assert.equal(load(URI), null);
    const d = save(URI, 'quiche it is');
    assert.equal(d.text, 'quiche it is'); assert.ok(Date.parse(d.savedAt) > 0);
    assert.deepEqual(load(URI), { text: 'quiche it is', savedAt: d.savedAt });
    assert.equal(load('at://did:plc:other/app.bsky.feed.post/x'), null, 'another post, another draft');
    clear(URI); assert.equal(load(URI), null); assert.equal(map.has(keyFor(URI)), false);
  });
});

test('blank text is no draft, and a corrupt entry reads as none', () => {
  withStore((map) => {
    save(URI, 'something'); assert.equal(save(URI, '   '), null); assert.equal(load(URI), null, 'saving blank clears the draft');
    map.set(keyFor(URI), '{not json'); assert.equal(load(URI), null);
    map.set(keyFor(URI), JSON.stringify({ text: '' })); assert.equal(load(URI), null);
  });
});
