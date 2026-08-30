// W22 — do a REAL PDS and AppView accept the ⋯ menu's writes, through the
// production substrate? (LIVE=1) — plan 2026-08-29 post-and-thread, Phase 4a-iv,
// the promoted Phase 0 D1/D2 probe.
//
// Every other proof of these writes is a shim. A shim proves the SHAPE of a
// request; only the network proves the server accepts it — and bookmarks and
// mutes are procedures that answer 200 with an EMPTY body, which is exactly
// the kind of thing a fake gets subtly wrong.
//
// It drives `createLens(...).bookmark()` and friends rather than re-issuing
// XRPC by hand: a live test that re-implements the call it is testing proves
// the network works and nothing about the app (tagsub-pds-live's rule).
//
// live = true, so it NEVER runs in push CI; the runner SKIP-reports it loudly.
// Credentials come from CroftC/.env and are never printed. It writes to the
// STANDING TEST ACCOUNT and refuses any other DID; every write is undone in the
// same run and the undo's read-back is the last assertion — a failed cleanup is
// a failed test, not litter. Claim `testbed--forage-test-account` first
// (CroftC/.claude/TESTBED.md).
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
// Subjects: the second test account (mute/block), and a public post — neither
// test account holds a post of its own (Phase 0 finding).
const OTHER_HANDLE = 'bobzmudacroft.bsky.social';
const SUBJECT_POST = 'at://did:plc:dvz3bhpjo4yrlqtoohbqa5bl/app.bsky.feed.post/3mttlbetsbc27';

function creds() {
  // forage/ sits one level under CroftC/; a worktree sits three (Phase 0 finding)
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

export async function run() {
  const session = await liveSession();
  const lens = createLens({ session });
  const get = async (path, q) => {
    const r = await session.fetchHandler(`/xrpc/${path}?${new URLSearchParams(q)}`);
    assert.ok(r.ok, `${path} ${r.status}`);
    return r.json();
  };
  const other = (await get('com.atproto.identity.resolveHandle', { handle: OTHER_HANDLE })).did;
  const [cid] = [(await get('app.bsky.feed.getPosts', { uris: SUBJECT_POST })).posts[0].cid];

  // ---- bookmark: on, listed, off, gone ----
  await lens.bookmark(SUBJECT_POST, cid, true);
  let marks = (await get('app.bsky.bookmark.getBookmarks', { limit: 50 })).bookmarks.map((b) => b.subject.uri);
  assert.ok(marks.includes(SUBJECT_POST), 'the bookmark is listed');
  await lens.bookmark(SUBJECT_POST, cid, false);
  marks = (await get('app.bsky.bookmark.getBookmarks', { limit: 50 })).bookmarks.map((b) => b.subject.uri);
  assert.ok(!marks.includes(SUBJECT_POST), 'and gone again');

  // ---- mute account: on, listed, off, gone ----
  await lens.muteActor(other, true);
  let mutes = (await get('app.bsky.graph.getMutes', { limit: 100 })).mutes.map((u) => u.did);
  assert.ok(mutes.includes(other), 'the mute is listed');
  await lens.muteActor(other, false);
  mutes = (await get('app.bsky.graph.getMutes', { limit: 100 })).mutes.map((u) => u.did);
  assert.ok(!mutes.includes(other), 'and lifted');

  // ---- mute thread: viewer.threadMuted flips both ways ----
  await lens.muteThread(SUBJECT_POST, true);
  let v = (await get('app.bsky.feed.getPostThread', { uri: SUBJECT_POST, depth: 0 })).thread.post.viewer;
  assert.equal(v.threadMuted, true, 'the thread reads as muted');
  await lens.muteThread(SUBJECT_POST, false);
  v = (await get('app.bsky.feed.getPostThread', { uri: SUBJECT_POST, depth: 0 })).thread.post.viewer;
  assert.equal(v.threadMuted, false, 'and unmuted');

  // ---- block: a record, listed with its uri, deleted, gone ----
  const { blockUri } = await lens.block(other);
  let blocks = (await get('app.bsky.graph.getBlocks', { limit: 100 })).blocks;
  assert.equal(blocks.find((u) => u.did === other)?.viewer?.blocking, blockUri, 'getBlocks carries the record uri');
  await lens.unblock(blockUri);
  blocks = (await get('app.bsky.graph.getBlocks', { limit: 100 })).blocks.map((u) => u.did);
  assert.ok(!blocks.includes(other), 'and the block is gone');

  // ---- repost (O6): viewer.repost flips both ways ----
  // The record lands on the PDS at once; the AppView indexes it a moment
  // later (observed 2026-08-29: undefined on the immediate read, present a
  // second on). Polled, and undone in `finally` so a failed read never leaves a
  // stray repost on the account — the first run of this suite did exactly that.
  const { repostUri } = await lens.repost(SUBJECT_POST, cid);
  try {
    let seen;
    for (let i = 0; i < 20 && seen !== repostUri; i++) {
      await new Promise((r) => setTimeout(r, 500));
      seen = (await get('app.bsky.feed.getPosts', { uris: SUBJECT_POST })).posts[0].viewer?.repost;
    }
    assert.equal(seen, repostUri, 'the post reads as reposted by me (within 10s of indexing)');
  } finally {
    await lens.unrepost(repostUri);
  }
  const mine = await get('com.atproto.repo.listRecords', { repo: TEST_DID, collection: 'app.bsky.feed.repost', limit: 50 });
  assert.deepEqual(mine.records, [], 'no repost record remains in the test account — the last line is the cleanup');
}
