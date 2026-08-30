// feed-row v2 (owner, 2026-08-30): the byline shows the name a person chose,
// and a small mark says which atmo provider they post from — a mark the reader
// can switch off. One device-local key, the rail's shape: only the word 'off'
// turns it off. The provider is read from the HANDLE (a `*.bsky.social` handle
// is a bsky.social account); a custom-domain handle names no provider without
// a DID-document lookup, so it gets the generic atmosphere mark, never a guess.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, enabled, set, clear, providerOf } from '../js/provider-mark.js';

const withStore = (fn) => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  try { return fn(map); } finally { delete globalThis.localStorage; }
};

test('the mark is on by default; only the word off turns it off', () => {
  withStore((map) => {
    assert.equal(KEY, 'forage.providermark');
    assert.equal(enabled(), true);
    set(false); assert.equal(map.get(KEY), 'off'); assert.equal(enabled(), false);
    set(true); assert.equal(map.get(KEY), 'on'); assert.equal(enabled(), true);
    for (const junk of ['', 'no', 'false', '0', 'OFF ']) { map.set(KEY, junk); assert.equal(enabled(), true, JSON.stringify(junk)); }
    clear(); assert.equal(map.has(KEY), false);
  });
});

test('a bsky.social handle is a bsky.social account; anything else is the atmosphere, not a guess', () => {
  assert.deepEqual(providerOf('quietcartographer.bsky.social'), { id: 'bsky', label: 'Bluesky', host: 'bsky.social' });
  assert.deepEqual(providerOf('Averyveryverylonghandle.BSKY.social'), { id: 'bsky', label: 'Bluesky', host: 'bsky.social' });
  assert.deepEqual(providerOf('pds.ls'), { id: 'atmo', label: 'the atmosphere', host: null });
  assert.deepEqual(providerOf('someone.northsky.social'), { id: 'atmo', label: 'the atmosphere', host: null });
  assert.deepEqual(providerOf('notbsky.social'), { id: 'atmo', label: 'the atmosphere', host: null });
  assert.equal(providerOf(null), null);
  assert.equal(providerOf(''), null);
  assert.equal(providerOf('[unknown]'), null);
});
