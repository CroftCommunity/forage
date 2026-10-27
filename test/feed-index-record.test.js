// The codec for fyi.forage.feedindex (plan 2026-09-21 own-index-on-the-pds,
// Phase 1): the record the reader's OWN index source travels as — the file as a
// blob, or an https link — and the two rules the lexicon cannot say: exactly
// one of file/url, matching `kind`; and https only. Pure: no network, no
// storage, and the words of every refusal are the product.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDINDEX_COLLECTION, FEEDINDEX_RKEY, INDEX_BYTES_MAX, toRecord, fromRecord, indexUrlProblem,
} from '../js/feed-index-record.js';
import { FEEDINDEX_RECORD } from '../js/lexicons.js';

const BLOB = { $type: 'blob', ref: { $link: 'bafkreickuvtsju23dhiawuufk2e5pk3kqsyhvxfzqasdjxagnuwbj4ua6i' }, mimeType: 'application/json', size: 1074115 };
const NOW = '2026-09-21T10:00:00.000Z';

test('feed-index-record: the collection, the key, and the one ceiling come from the lexicon', () => {
  assert.equal(FEEDINDEX_COLLECTION, 'fyi.forage.feedindex');
  assert.equal(FEEDINDEX_RKEY, 'self');
  assert.equal(INDEX_BYTES_MAX, FEEDINDEX_RECORD.properties.file.maxSize, 'one number, read from the schema, not restated');
  assert.equal(INDEX_BYTES_MAX, 2_000_000);
});

test('feed-index-record: a file record round-trips, with $type, createdAt kept and updatedAt moved', () => {
  const r = toRecord({ kind: 'file', blob: BLOB, mode: 'add', name: 'Gardeners of the PNW', now: NOW });
  assert.equal(r.$type, 'fyi.forage.feedindex');
  assert.deepEqual(r.file, BLOB);
  assert.equal('url' in r, false, 'a file record carries no url key at all');
  assert.equal(r.createdAt, NOW);
  assert.equal(r.updatedAt, NOW);
  const later = toRecord({ kind: 'file', blob: BLOB, mode: 'replace', name: 'Gardeners', createdAt: NOW, now: '2026-09-22T00:00:00.000Z' });
  assert.equal(later.createdAt, NOW, 'an edit keeps the birth date');
  assert.equal(later.updatedAt, '2026-09-22T00:00:00.000Z');
  assert.deepEqual(fromRecord(r), { kind: 'file', blob: BLOB, url: null, mode: 'add', name: 'Gardeners of the PNW', createdAt: NOW, updatedAt: NOW });
});

test('feed-index-record: a url record round-trips, and the blob side is null', () => {
  const r = toRecord({ kind: 'url', url: 'https://gardeners.example/index.json', mode: 'replace', now: NOW });
  assert.equal('file' in r, false);
  assert.equal('name' in r, false, 'no name is no field, not an empty string');
  assert.deepEqual(fromRecord(r), { kind: 'url', blob: null, url: 'https://gardeners.example/index.json', mode: 'replace', name: null, createdAt: NOW, updatedAt: NOW });
});

test('feed-index-record: exactly one of file / url, and it must be the one `kind` names', () => {
  assert.throws(() => toRecord({ kind: 'file', url: 'https://x.example/i.json', mode: 'add', now: NOW }), /kind is file.*no file/);
  assert.throws(() => toRecord({ kind: 'url', blob: BLOB, mode: 'add', now: NOW }), /kind is url.*no url/);
  assert.throws(() => toRecord({ kind: 'file', blob: BLOB, url: 'https://x.example/i.json', mode: 'add', now: NOW }), /both/);
  // and on the way IN — another client may write anything
  const base = { $type: 'fyi.forage.feedindex', mode: 'add', createdAt: NOW, updatedAt: NOW };
  assert.throws(() => fromRecord({ ...base, kind: 'file', url: 'https://x.example/i.json' }), /kind is file.*no file/);
  assert.throws(() => fromRecord({ ...base, kind: 'url', file: BLOB }), /kind is url.*no url/);
  assert.throws(() => fromRecord({ ...base, kind: 'file', file: BLOB, url: 'https://x.example/i.json' }), /both/);
  assert.throws(() => fromRecord({ ...base, kind: 'file' }), /no file/);
});

test('feed-index-record: https only — the rule the lexicon cannot carry, enforced both ways with words', () => {
  assert.equal(indexUrlProblem('https://gardeners.example/index.json'), null);
  assert.equal(indexUrlProblem('http://gardeners.example/index.json'), 'only https links are fetched — http://gardeners.example/index.json is http');
  assert.match(indexUrlProblem(undefined), /^"" is not a link/);
  assert.match(indexUrlProblem(null), /^"" is not a link/);
  assert.match(indexUrlProblem('ftp://gardeners.example/index.json'), /https/);
  assert.match(indexUrlProblem('gardeners.example/index.json'), /not a link|https/);
  assert.match(indexUrlProblem(''), /not a link|https/);
  assert.throws(() => toRecord({ kind: 'url', url: 'http://gardeners.example/index.json', mode: 'add', now: NOW }), /https/);
  const rec = { $type: 'fyi.forage.feedindex', kind: 'url', url: 'http://gardeners.example/index.json', mode: 'add', createdAt: NOW, updatedAt: NOW };
  assert.throws(() => fromRecord(rec), /https/, 'a record written by another client with an http link is refused on the way in');
});

test('feed-index-record: the schema is consulted — a malformed record is refused with the field named', () => {
  assert.throws(() => toRecord({ kind: 'file', blob: { ...BLOB, size: INDEX_BYTES_MAX + 1 }, mode: 'add', now: NOW }), /file.*2000000/);
  assert.throws(() => toRecord({ kind: 'file', blob: { ...BLOB, mimeType: 'text/plain' }, mode: 'add', now: NOW }), /file.*application\/json/);
  assert.throws(() => toRecord({ kind: 'file', blob: BLOB, mode: 'off', now: NOW }), /mode/);
  assert.throws(() => toRecord({ kind: 'file', blob: BLOB, mode: 'add', name: 'x'.repeat(81), now: NOW }), /name/);
  assert.throws(() => fromRecord({ $type: 'fyi.forage.feedindex', kind: 'file', file: BLOB, mode: 'add' }), /createdAt: required.*; updatedAt: required/, 'every problem is listed, separated');
  assert.throws(() => fromRecord(null), /object/);
  assert.throws(() => fromRecord('a string'), /object/);
});

test('feed-index-record: unknown fields ride through fromRecord untouched — records are open', () => {
  const rec = { $type: 'fyi.forage.feedindex', kind: 'url', url: 'https://x.example/i.json', mode: 'add', createdAt: NOW, updatedAt: NOW, fromANewerClient: true };
  assert.equal(fromRecord(rec).url, 'https://x.example/i.json');
});
