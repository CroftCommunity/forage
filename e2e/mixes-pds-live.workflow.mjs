// Mixes on the PDS, Phase 5 (LIVE=1) — does a REAL PDS accept fyi.forage.mix
// through the production substrate, and does it come back as the record we
// wrote? Every other proof is a shim; only the network proves the server
// accepts a putRecord at a slug key, and that our validator accepts what the
// server hands back.
//
// It drives lens.saveMix / mixRecords / removeMix — the app's own doors —
// never raw XRPC (tagsub-pds-live's rule). Writes to the STANDING TEST
// ACCOUNT only, refuses any other DID, and undoes itself: the read-back-empty
// is the last assertion, so a failed cleanup is a failed test, not litter.
// Claim `testbed--forage-test-account` first (CroftC/.claude/TESTBED.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLens } from '../js/substrates/lens.js';
import { fromRecord } from '../js/mixes.js';
export const live = true;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDS = 'https://bsky.social';
const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';
const SLUG = 'live-proof-weekend';

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
      signal: AbortSignal.timeout(20000),
    }),
  };
}

export async function run() {
  const session = await liveSession();
  const lens = createLens({ session });
  const record = {
    $type: 'fyi.forage.mix', name: 'Live proof (weekend)', home: false,
    rows: [
      { kind: 'timeline', on: true, weight: 'normal' },
      { kind: 'feed', uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot', on: true, weight: 'more' },
      { kind: 'hashtag', tag: 'harvest', on: false, weight: 'less' },
    ],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  // leftover from an interrupted run? clear it first, so the proof starts clean
  const before = (await lens.mixRecords()).filter((r) => r.rkey === SLUG);
  for (const r of before) await lens.removeMix(r.rkey);

  // ---- put at the slug, read back, validate, put AGAIN at the same slug ----
  await lens.saveMix(SLUG, record);
  let mine = (await lens.mixRecords()).filter((r) => r.rkey === SLUG);
  assert.equal(mine.length, 1, 'the record is listed at its slug');
  const back = fromRecord(mine[0].value, { rkey: SLUG });
  assert.equal(back.name, record.name);
  assert.deepEqual(back.rows['hashtag:harvest'], { on: false, weight: 0.5 }, 'the words came back as the multiplier');
  assert.equal(mine[0].value.$type, 'fyi.forage.mix');
  console.log(`  put ${SLUG}: listed, validated, rows ${Object.keys(back.rows).length}`);

  await lens.saveMix(SLUG, { ...record, name: 'Live proof (renamed)', updatedAt: new Date().toISOString() });
  mine = (await lens.mixRecords()).filter((r) => r.rkey === SLUG);
  assert.equal(mine.length, 1, 'a second put at the slug is the SAME record, not a second one (D1)');
  assert.equal(mine[0].value.name, 'Live proof (renamed)');
  assert.equal(mine[0].value.createdAt, record.createdAt, 'createdAt survived the replace');
  console.log('  put again: one record, renamed, createdAt kept');

  // ---- undo, and the read-back-empty is the last word ----
  await lens.removeMix(SLUG);
  const after = (await lens.mixRecords()).filter((r) => r.rkey === SLUG);
  assert.deepEqual(after, [], 'the record is gone — a failed cleanup is a failed test');
  console.log('  removed: read-back empty');
}
