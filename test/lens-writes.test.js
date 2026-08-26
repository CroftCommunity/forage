// 3c: boost = like — the lens' FIRST write (DL-013), OAuth-bound. The write
// pair is exactly app.bsky.feed.like create + delete (D1-pinned shapes);
// test/invariants.test.js narrows the no-write-path proof to precisely this
// pair in the same commit. Hermetic over a recording session fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLens, shapeLensPost } from '../js/substrates/lens.js';

const SRC = { fieldId: 'lens:x', fieldSlug: 'x', fieldTitle: 'X' };

function writerSession({ failWith } = {}) {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (failWith) return { ok: false, status: failWith, json: async () => ({ error: 'Boom' }) };
    return { ok: true, status: 200, json: async () => ({ uri: 'at://did:plc:me/app.bsky.feed.like/3xyz', cid: 'likecid' }) };
  };
  return { session: { did: 'did:plc:me', handle: 'me.test', fetchHandler }, calls };
}

test('shapes carry cid and likeUri (authed viewer.like → the exact at-uri; absent → null)', () => {
  const liked = shapeLensPost({ uri: 'at://d/p/1', cid: 'c1', author: { did: 'd', handle: 'h' },
    record: { text: 't', createdAt: '2026-08-25T00:00:00Z' }, likeCount: 2,
    viewer: { like: 'at://did:plc:me/app.bsky.feed.like/3aaa' } }, SRC);
  assert.equal(liked.cid, 'c1');
  assert.equal(liked.likeUri, 'at://did:plc:me/app.bsky.feed.like/3aaa');
  assert.equal(liked.myVote, 1);
  const unliked = shapeLensPost({ uri: 'at://d/p/1', cid: 'c1', author: { did: 'd', handle: 'h' },
    record: { text: 't', createdAt: '2026-08-25T00:00:00Z' }, likeCount: 2 }, SRC);
  assert.equal(unliked.likeUri, null);
});

test('like() sends the D1-pinned record shape to createRecord in MY repo and returns the like uri', async () => {
  const { session, calls } = writerSession();
  const res = await createLens({ session }).like('at://did:plc:author/app.bsky.feed.post/3post', 'postcid');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.ok(calls[0].path.startsWith('/xrpc/com.atproto.repo.createRecord'));
  const b = calls[0].body;
  assert.equal(b.repo, 'did:plc:me');
  assert.equal(b.collection, 'app.bsky.feed.like');
  assert.equal(b.record.$type, 'app.bsky.feed.like');
  assert.deepEqual(b.record.subject, { uri: 'at://did:plc:author/app.bsky.feed.post/3post', cid: 'postcid' });
  assert.ok(b.record.createdAt, 'createdAt present');
  assert.equal(res.likeUri, 'at://did:plc:me/app.bsky.feed.like/3xyz');
});

test('unlike() deletes the EXACT rkey from my like collection', async () => {
  const { session, calls } = writerSession();
  await createLens({ session }).unlike('at://did:plc:me/app.bsky.feed.like/3xyz');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].path.startsWith('/xrpc/com.atproto.repo.deleteRecord'));
  assert.deepEqual(calls[0].body, { repo: 'did:plc:me', collection: 'app.bsky.feed.like', rkey: '3xyz' });
});

test('failures throw with words (the UI restores the pre-flip state on this signal)', async () => {
  const { session } = writerSession({ failWith: 500 });
  await assert.rejects(() => createLens({ session }).like('at://x/y/z', 'c'), /like.*500|500.*like/i);
  await assert.rejects(() => createLens({ session }).unlike('at://did:plc:me/app.bsky.feed.like/3xyz'), /unlike.*500|500.*unlike/i);
});

test('writes refuse without a session, with words', async () => {
  await assert.rejects(() => createLens({}).like('at://x/y/z', 'c'), /session|sign/i);
  await assert.rejects(() => createLens({}).unlike('at://x/y/z'), /session|sign/i);
});
