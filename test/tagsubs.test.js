// Subscribed hashtags, stored locally in the shape they will be stored
// REMOTELY, so the eventual move to a PDS is a loop and not a reshaping.
//
// The owner's framing (2026-08-28): start local, "from the premise of we're
// gonna end up wanting to store this in a PDS as a lexicon and that way we can
// iterate fast… and we can still move forward and make that changeover
// seamless". So the contract under test is not "does localStorage work" — it
// is "is what we store already a valid fyi.forage.tagsub record". The test
// reads the lexicon file rather than restating its fields, because a copy of a
// schema is a second schema that drifts.
//
// One record per subscription, unsubscribing = the record deleted. That is the
// house style (fyi.forage.save, fyi.forage.membership both say so) and it is
// the atproto-native shape: two devices disagreeing cannot clobber each other,
// where one list-record would be last-write-wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAGSUBS_KEY, tagSubs, subscribeTag, unsubscribeTag, isSubscribed, onChange } from '../js/tagsubs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEX = JSON.parse(readFileSync(join(root, 'lexicons', 'fyi.forage.tagsub.json'), 'utf8'));

const withStorage = (seed, fn) => {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try { return fn(store); }
  finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
};

test('what we store locally is already a valid fyi.forage.tagsub record', () => {
  withStorage({}, () => {
    subscribeTag('harvest', { createdAt: '2026-08-28T10:00:00.000Z' });
    const [rec] = tagSubs();
    // Read the required fields FROM the lexicon — restating them here would be
    // a second schema, and the point of this test is that there is only one.
    for (const field of LEX.defs.main.record.required) {
      assert.ok(rec[field] !== undefined, `a stored sub carries the lexicon's required "${field}"`);
    }
    assert.deepEqual(Object.keys(rec).sort(), LEX.defs.main.record.required.slice().sort(),
      'and carries NOTHING else — an extra local-only field is the thing that would not migrate');
  });
});

test('no storage is no subscriptions, not an error', () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.deepEqual(tagSubs(), []);
    assert.equal(isSubscribed('harvest'), false);
    subscribeTag('harvest');           // must not throw
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
});

test('subscribing is idempotent and normalises how people actually type a tag', () => {
  withStorage({}, () => {
    for (const typed of ['harvest', '#harvest', ' Harvest ', '#HARVEST']) {
      subscribeTag(typed, { createdAt: '2026-08-28T10:00:00.000Z' });
    }
    assert.equal(tagSubs().length, 1, 'four spellings of one tag is one subscription');
    assert.equal(tagSubs()[0].tag, 'harvest', 'stored bare and lowercase — the # is punctuation, not the name');
    assert.ok(isSubscribed('#Harvest'), 'and asking is normalised the same way');
  });
});

test('unsubscribing removes the record, which is what deleting it will mean remotely', () => {
  withStorage({}, () => {
    subscribeTag('harvest', { createdAt: '2026-08-28T10:00:00.000Z' });
    subscribeTag('foraging', { createdAt: '2026-08-28T11:00:00.000Z' });
    unsubscribeTag('#Harvest');
    assert.deepEqual(tagSubs().map((r) => r.tag), ['foraging']);
    assert.equal(isSubscribed('harvest'), false);
  });
});

test('order is newest-added first — the timestamp the record already carries', () => {
  withStorage({}, () => {
    subscribeTag('oldest', { createdAt: '2026-08-01T00:00:00.000Z' });
    subscribeTag('newest', { createdAt: '2026-08-28T00:00:00.000Z' });
    subscribeTag('middle', { createdAt: '2026-08-14T00:00:00.000Z' });
    assert.deepEqual(tagSubs().map((r) => r.tag), ['newest', 'middle', 'oldest'],
      'no stored ordering is needed: createdAt is in the record for its own sake');
  });
});

test('junk is refused rather than stored — an unsubscribable subscription is worse than none', () => {
  withStorage({}, () => {
    subscribeTag('harvest', { createdAt: '2026-08-28T10:00:00.000Z' });
    for (const junk of ['', '   ', '#', '##', null, undefined, 42, {}, []]) subscribeTag(junk);
    assert.deepEqual(tagSubs().map((r) => r.tag), ['harvest'], 'nothing junk got in');
  });
});

test('listeners hear subscribe and unsubscribe, so the nav can redraw itself', () => {
  withStorage({}, () => {
    const seen = [];
    const off = onChange(() => seen.push(tagSubs().map((r) => r.tag)));
    try {
      subscribeTag('harvest', { createdAt: '2026-08-28T10:00:00.000Z' });
      unsubscribeTag('harvest');
      assert.deepEqual(seen, [['harvest'], []]);
    } finally { off(); }
  });
});

test('a corrupt store reads as empty rather than throwing the nav off the page', () => {
  withStorage({ [TAGSUBS_KEY]: 'not json' }, () => assert.deepEqual(tagSubs(), []));
  withStorage({ [TAGSUBS_KEY]: '{"not":"an array"}' }, () => assert.deepEqual(tagSubs(), []));
});
