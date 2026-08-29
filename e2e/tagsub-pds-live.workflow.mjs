// W17 — does a REAL PDS accept, serve and delete a fyi.forage.tagsub? (LIVE=1)
//
// This exists because every other substrate in the gate is one we wrote. A shim
// proves the shape of a record; only the network proves a PDS ACCEPTS it, and
// `fyi.forage.tagsub` is a collection no PDS had ever seen from this app. The
// plan and TODO.md both carried that as owed; this is the thing that closes it.
//
// It drives the PRODUCTION code — `createLens(...).saveTagSub()` and friends —
// rather than re-issuing the requests by hand. A live test that re-implements
// the call it is testing proves the network works and nothing about the app.
//
// live = true, so it NEVER runs in push CI; the runner SKIP-reports it loudly.
// Credentials come from CroftC/.env and are never printed. It writes to the
// STANDING TEST ACCOUNT and refuses to run against any other DID — a live write
// test that could reach the owner's own repo is one typo from litter in it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLens } from '../js/substrates/lens.js';

export const live = true;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDS = 'https://bsky.social';

// The one account this may write to (CroftC/.claude/TESTBED.md).
const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';

// A tag the account would plausibly hold, so a failed cleanup leaves something
// meaningful rather than litter.
const TAG = 'forage';

function creds() {
  const path = join(root, '..', '.env');
  const raw = readFileSync(path, 'utf8');
  const env = Object.fromEntries(raw.split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  assert.ok(env.test_user1 && env.test_pass1,
    'CroftC/.env has no test_user1/test_pass1 — see CroftC/.claude/TESTBED.md');
  return { identifier: env.test_user1, password: env.test_pass1 };
}

// The OAuth session shape js/auth/session.js hands the lens: { did, handle,
// fetchHandler } over RELATIVE /xrpc paths. Built here from an app password
// because a headless OAuth handshake is a different test (see the note at the
// foot of this file) — the SUBSTRATE under test is identical either way.
async function liveSession() {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds()), signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  assert.ok(data.accessJwt, `createSession failed: ${res.status} ${data.error || ''} — creds may have rotated`);
  assert.equal(data.did, TEST_DID,
    `refusing to write: signed in as ${data.did}, not the registered test account`);
  return {
    did: data.did, handle: data.handle,
    fetchHandler: (path, init = {}) => fetch(`${PDS}${path}`, {
      ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${data.accessJwt}` },
      signal: AbortSignal.timeout(20000),
    }),
  };
}

const listUnauth = async (did) => {
  const res = await fetch(
    `${PDS}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=fyi.forage.tagsub&limit=100`,
    { signal: AbortSignal.timeout(20000) });
  return { status: res.status, json: await res.json() };
};

export async function run() {
  const session = await liveSession();
  const lens = createLens({ session });
  const LEX = JSON.parse(readFileSync(join(root, 'lexicons', 'fyi.forage.tagsub.json'), 'utf8'));

  // Start clean, and end clean. A leftover from a crashed run would make the
  // next run's counts meaningless.
  const sweep = async () => {
    for (const r of await lens.tagSubs()) await lens.removeTagSub(r.rkey);
  };
  await sweep();

  try {
    // ---- the claim: a real PDS accepts a collection it has never seen ----
    const { rkey } = await lens.saveTagSub(TAG);
    assert.ok(rkey, 'the create returned an rkey');

    const listed = await lens.tagSubs();
    assert.deepEqual(listed.map((r) => r.tag), [TAG], 'and lists it straight back');
    assert.equal(listed[0].rkey, rkey, 'as the same record we just wrote');
    for (const req of LEX.defs.main.record.required) {
      assert.ok(listed[0][req] !== undefined, `the round trip preserved the required ${req}`);
    }

    // ---- the claim the UI makes in words: "visible to anyone" ----
    // The account page says PDS-saved tags are readable by anyone, like your
    // follows. That is a promise about someone else's server, so it is measured
    // here rather than assumed: no authorization header at all.
    const open = await listUnauth(session.did);
    assert.equal(open.status, 200, 'an unauthenticated reader gets an answer');
    assert.deepEqual((open.json.records || []).map((r) => r.value.tag), [TAG],
      'and the answer is the tag — the box is telling the truth about publicity');

    // ---- THE PDS DOES NOT VALIDATE OUR LEXICON ----
    // Measured 2026-08-29: a fyi.forage.tagsub record with NEITHER required
    // field was accepted with a 200. `required` in our lexicon file binds US and
    // nobody else, which makes the wellFormed() filter in js/tagsubs-pds.js
    // load-bearing rather than defensive: anything can put a malformed record in
    // a repo we then read. This assertion is written to FAIL if that ever
    // changes, because the day a PDS starts validating is a day our filter's
    // justification changes.
    const junk = await session.fetchHandler('/xrpc/com.atproto.repo.createRecord', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo: session.did, collection: 'fyi.forage.tagsub',
        record: { $type: 'fyi.forage.tagsub' } }),
    });
    assert.equal(junk.status, 200,
      'the PDS still accepts a record missing every required field — if this now refuses, '
      + 'update js/tagsubs-pds.js: the filter was justified by this being unenforced');
    const junkRkey = String((await junk.json()).uri).split('/').pop();

    // Our reader must survive what the server let through.
    const withJunk = await lens.tagSubs();
    assert.equal(withJunk.length, 2, 'the lens reports both records, malformed one included');
    const { refreshPublished } = await import('../js/tagsubs-pds.js');
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const shown = await refreshPublished(lens, session.did);
    delete globalThis.localStorage;
    assert.deepEqual(shown.records.map((r) => r.tag), [TAG],
      'and the published set drops it — a row with no tag has no working control');

    await lens.removeTagSub(junkRkey);

    // ---- absence IS the deletion ----
    await lens.removeTagSub(rkey);
    assert.deepEqual(await lens.tagSubs(), [], 'the record is gone from the repo');
    assert.deepEqual((await listUnauth(session.did)).json.records, [],
      'and gone for everyone else too — there is no tombstone because there is nothing left');

    // Deleting an rkey that is not there answers 200, not 404 (measured
    // 2026-08-29). That is why unpublishTag treats "already gone" as the end
    // state the reader asked for rather than an error.
    await lens.removeTagSub(rkey);
  } finally {
    await sweep();
  }
}

// NOT COVERED HERE, deliberately: the browser OAuth handshake. This builds the
// session from an app password, so what it proves is that the LENS SUBSTRATE and
// a real PDS agree about fyi.forage.tagsub. Whether js/auth/session.js can
// obtain a DPoP-bound session from bsky.social in a real browser is a separate
// claim with a separate failure mode, and no test in this repo covers it yet.
