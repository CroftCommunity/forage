// Follow all / Unfollow all against a REAL PDS and AppView (LIVE=1) — plan
// 2026-09-14-plan-jumpstart-follow-all, Phase 4.
//
// The hermetic journey proves the SHAPE of every request; only the network
// proves a PDS accepts fifty creates in one applyWrites, mints their rkeys,
// keeps `via` on each record, and that the AppView then reports them back as
// the list's viewer state — which is what "Try the rest" and Unfollow all both
// read. It drives the lens' own methods, never re-issuing XRPC by hand
// (lens-writes-live's rule).
//
// live = true: never in push CI; the runner SKIP-reports it. Credentials come
// from CroftC/.env and are never printed. Writes go to the STANDING TEST
// ACCOUNT and no other DID, against the jumpstart made for exactly this (O1,
// `scripts/make-test-jumpstart.mjs`; registered in CroftC/.claude/TESTBED.md).
// Every follow it writes is undone in the same run, the read-back of the undo
// is the last assertion, and anyone the account already followed on the list
// is followed again at the end. Claim `testbed--forage-test-account` first.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLens } from '../js/substrates/lens.js';
import { planFollows } from '../js/follow-all.js';

export const live = true;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDS = 'https://bsky.social';
const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';
// O1: "Croft test accounts", in the test account's own repo; members are the
// two other test accounts (the curator is dropped by the recipe).
const PACK = `at://${TEST_DID}/app.bsky.graph.starterpack/3mvjo6hs4vg22`;
const FOLLOW = 'app.bsky.graph.follow';

function creds() {
  const candidates = [join(root, '..', '.env'), join(root, '..', '..', '..', '.env')];
  const path = candidates.find((p) => { try { readFileSync(p); return true; } catch { return false; } });
  assert.ok(path, 'CroftC/.env not found beside this checkout — see CroftC/.claude/TESTBED.md');
  const env = Object.fromEntries(readFileSync(path, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  assert.ok(env.test_user1 && env.test_pass1, 'CroftC/.env has no test_user1/test_pass1 — see CroftC/.claude/TESTBED.md');
  return { identifier: env.test_user1, password: env.test_pass1 };
}

async function liveSession() {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds()), signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  assert.ok(data.accessJwt, `createSession failed: ${res.status} ${data.error || ''} — creds may have rotated`);
  assert.equal(data.did, TEST_DID, `refusing to write: signed in as ${data.did}, not the registered test account`);
  return {
    did: data.did, handle: data.handle,
    fetchHandler: (path, init = {}) => fetch(`${PDS}${path}`, {
      ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${data.accessJwt}` },
      signal: AbortSignal.timeout(20000),
    }),
  };
}

// The AppView indexes a repo write a moment after the PDS commits it (observed
// on reposts, 2026-08-29): poll the list until its viewer state agrees.
async function untilList(lens, listUri, ok, what) {
  let members;
  for (let i = 0; i < 30; i++) {
    members = await lens.listMembers(listUri);
    if (ok(members)) return members;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.fail(`${what} — the AppView did not reflect it within 15 s: ${JSON.stringify(members.map((m) => [m.handle, m.followingUri]))}`);
}

export async function run() {
  const session = await liveSession();
  const lens = createLens({ session });
  const myFollows = async () => {
    const r = await session.fetchHandler(`/xrpc/com.atproto.repo.listRecords?${new URLSearchParams({ repo: TEST_DID, collection: FOLLOW, limit: '100' })}`);
    assert.ok(r.ok, `listRecords ${r.status}`);
    return (await r.json()).records;
  };

  const j = await lens.jumpstart(PACK);
  assert.equal(j.creatorDid, TEST_DID, 'the live-proof jumpstart is the test account\'s own');
  assert.ok(j.cid && j.listUri, 'the jumpstart carries a cid (for `via`) and a list');
  const before = await lens.listMembers(j.listUri);
  assert.equal(before.length, 2, `two members (the recipe drops the curator): ${before.map((m) => m.handle)}`);
  const memberDids = before.map((m) => m.did).sort();
  // anyone already followed is skipped by the plan, so start from nobody — and
  // remember them, to put back at the end
  const restore = before.filter((m) => m.followingUri).map((m) => m.did);
  if (restore.length) await lens.unfollowAll(before.filter((m) => m.followingUri).map((m) => m.followingUri));
  const clean = await untilList(lens, j.listUri, (ms) => ms.every((m) => !m.followingUri), 'nobody on the list followed');

  let followed = new Map();
  try {
    // ---- Follow all: two creates in ONE applyWrites, each carrying via ----
    const plan = planFollows(clean, { myDid: session.did });
    assert.deepEqual(plan.follow.map((m) => m.did).sort(), memberDids, 'the plan follows both members');
    assert.equal(plan.counts.me, 0, 'the curator is not on its own list');
    followed = await lens.followAll(plan.follow.map((m) => m.did), { via: { uri: j.uri, cid: j.cid } });
    assert.equal(followed.size, 2, 'a uri came back for each');
    // the REPO holds them, as written — the PDS, not the AppView
    const records = await myFollows();
    for (const [did, uri] of followed) {
      const rec = records.find((r) => r.uri === uri);
      assert.ok(rec, `the PDS lists the follow of ${did} at ${uri}`);
      assert.equal(rec.value.subject, did);
      assert.deepEqual(rec.value.via, { uri: j.uri, cid: j.cid }, 'the record says which jumpstart it came through (D2)');
    }
    // the AppView reflects them as the list's viewer state — what Try the rest
    // and Unfollow all read
    const after = await untilList(lens, j.listUri,
      (ms) => ms.every((m) => m.followingUri === followed.get(m.did)), 'both members read as followed, at the minted uris');

    // ---- Unfollow all: the mirror, off the list's viewer state (D4) ----
    const n = await lens.unfollowAll(after.map((m) => m.followingUri));
    assert.equal(n, 2);
    followed = new Map();
  } finally {
    // a failed read must not leave the test account following anyone through
    // this run: delete whatever this run created and did not already remove
    if (followed.size) await lens.unfollowAll([...followed.values()]).catch(() => {});
  }
  const left = (await myFollows()).filter((r) => memberDids.includes(r.value.subject));
  assert.deepEqual(left, [], 'no follow of either member remains in the test account — the undo is the last assertion');

  // put back whatever the account followed before this run, and prove it
  for (const did of restore) await lens.follow(did);
  if (restore.length) {
    await untilList(lens, j.listUri, (ms) => restore.every((d) => ms.find((m) => m.did === d)?.followingUri), 'the pre-existing follows are restored');
  }
}
