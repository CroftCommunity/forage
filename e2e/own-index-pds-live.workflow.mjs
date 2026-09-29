// Your discovery index on the atmo provider account, Phase 5 (LIVE=1) — does
// a REAL PDS take the whole path through the production substrate: the shipped
// index up as a JSON blob, a fyi.forage.feedindex record at `self` naming it,
// the record and the blob read back — the blob UNAUTHENTICATED with an Origin,
// the way a browser on another device reads it — then the same key switched to
// a link at Forage's own file, then removed? Every other proof is a shim; only
// the network proves the blob is public once a record names it and gone once
// none does (the plan's probe said so on 2026-09-21; this keeps it said).
//
// It drives lens.uploadIndex / saveIndexRecord / indexRecord / fetchIndexBlob /
// fetchIndexUrl / removeIndexRecord — the app's own doors — never raw XRPC
// (tagsub-pds-live's rule). Writes to the STANDING TEST ACCOUNT only, refuses
// any other DID, and undoes itself: read-back-empty is the last assertion, so
// a failed cleanup is a failed test, not litter. Claim
// `testbed--forage-test-account` first (CroftC/.claude/TESTBED.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLens } from '../js/substrates/lens.js';
import { toRecord, fromRecord, FEEDINDEX_COLLECTION } from '../js/feed-index-record.js';
import { validateIndex } from '../js/feed-index.js';
export const live = true;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDS = 'https://bsky.social';
const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';
const FORAGE_LINK = 'https://forage.fyi/data/feed-index.json';

function creds() {
  const candidates = [join(root, '..', '.env'), join(root, '..', '..', '..', '.env')];
  const path = candidates.find((p) => { try { readFileSync(p); return true; } catch { return false; } });
  assert.ok(path, 'CroftC/.env not found beside this checkout — see CroftC/.claude/TESTBED.md');
  const env = Object.fromEntries(readFileSync(path, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  assert.ok(env.test_user1 && env.test_pass1, 'CroftC/.env has no test_user1/test_pass1');
  return { identifier: env.test_user1, password: env.test_pass1 };
}
async function liveSession() {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds()), signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  assert.ok(data.accessJwt, `createSession failed: ${res.status} ${data.error || ''}`);
  assert.equal(data.did, TEST_DID, `refusing to write: signed in as ${data.did}, not the registered test account`);
  return {
    did: data.did, handle: data.handle,
    fetchHandler: (path, init = {}) => fetch(`${PDS}${path}`, {
      ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${data.accessJwt}` },
      signal: AbortSignal.timeout(60000),
    }),
  };
}

export async function run() {
  const session = await liveSession();
  const lens = createLens({ session });
  const text = readFileSync(join(root, 'data', 'feed-index.json'), 'utf8');
  const index = JSON.parse(text);
  assert.equal(validateIndex(index).ok, true, 'the shipped index validates before it goes anywhere');

  // leftover from an interrupted run? clear it first, so the proof starts clean
  if (await lens.indexRecord()) await lens.removeIndexRecord();

  // ---- the file: up as a blob, named by a record at self, read back both ways ----
  const t0 = Date.now();
  const blob = await lens.uploadIndex(text);
  assert.equal(blob.mimeType, 'application/json', 'the PDS kept the declared type (no sniff for JSON)');
  assert.equal(blob.size, Buffer.byteLength(text), 'the size the PDS measured is the file');
  console.log(`  uploadIndex: ${blob.size} bytes as ${blob.mimeType} in ${Date.now() - t0} ms, cid ${blob.ref.$link}`);
  const record = toRecord({ kind: 'file', blob, mode: 'add', name: 'Live proof — the shipped index' });
  await lens.saveIndexRecord(record);
  const got = await lens.indexRecord();
  assert.ok(got, 'the record is at self');
  const back = fromRecord(got.value);
  assert.equal(back.kind, 'file');
  assert.equal(back.blob.ref.$link, blob.ref.$link, 'the record names the blob that went up');
  assert.equal(got.value.$type, FEEDINDEX_COLLECTION);
  console.log(`  saveIndexRecord: at self, validated on the way back`);
  // through the app's door, authed
  const fetched = await lens.fetchIndexBlob(blob.ref.$link);
  assert.equal(validateIndex(fetched).ok, true);
  assert.equal(fetched.feeds.length, index.feeds.length, 'the file came back whole');
  // and the way ANOTHER browser reads it: no auth, with an Origin header, CORS open
  const anon = await fetch(`${PDS}/xrpc/com.atproto.sync.getBlob?did=${TEST_DID}&cid=${blob.ref.$link}`, { headers: { Origin: 'https://forage.fyi' }, signal: AbortSignal.timeout(60000) });
  assert.equal(anon.status, 200, 'public once a record names it');
  assert.equal(anon.headers.get('access-control-allow-origin'), '*', 'a browser on forage.fyi may read it');
  assert.match(anon.headers.get('content-type') || '', /application\/json/);
  const anonText = await anon.text();
  assert.equal(anonText, text, 'byte-equal to what went up');
  console.log(`  getBlob unauthenticated with Origin: 200, ACAO *, ${anonText.length} chars, byte-equal`);

  // ---- the same key switched to a link at Forage's own file: fetched, validated, put in place ----
  const viaLink = await lens.fetchIndexUrl(FORAGE_LINK);
  assert.equal(validateIndex(viaLink).ok, true, 'Forage\'s own file is a valid link target (E7: CORS open)');
  await lens.saveIndexRecord(toRecord({ kind: 'url', url: FORAGE_LINK, mode: 'replace', createdAt: record.createdAt }));
  const asLink = fromRecord((await lens.indexRecord()).value);
  assert.equal(asLink.kind, 'url');
  assert.equal(asLink.url, FORAGE_LINK);
  assert.equal(asLink.createdAt, record.createdAt, 'createdAt survived the switch');
  assert.equal(asLink.blob, null);
  console.log(`  switched to a link: one record, kind url, createdAt kept`);
  // the blob the record no longer names is gone from the PDS (probe 2026-09-21: immediately)
  const orphan = await fetch(`${PDS}/xrpc/com.atproto.sync.getBlob?did=${TEST_DID}&cid=${blob.ref.$link}`, { signal: AbortSignal.timeout(60000) });
  assert.notEqual(orphan.status, 200, `the dereferenced blob is no longer served (HTTP ${orphan.status})`);
  console.log(`  the old blob: HTTP ${orphan.status} — the PDS did the housekeeping`);

  // ---- undo, and the read-back-empty is the last word ----
  await lens.removeIndexRecord();
  assert.equal(await lens.indexRecord(), null, 'the record is gone — a failed cleanup is a failed test');
  console.log('  removed: read-back empty');
}
