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

// ---- 3w: publish — the lens starts writing posts ----
// Until now the lens wrote exactly one kind of record (its own likes). This is
// the second kind, and it is the one that turns Forage from a reader into a
// forum. It stays narrow on purpose: our own repo, one collection, a record
// built by the pure composer, and nothing implicit.

test('3w: publish writes MY post to MY repo, with the composer\'s record verbatim', async () => {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, body: init.body ? JSON.parse(init.body) : null });
    return { ok: true, status: 200, json: async () => ({ uri: 'at://did:plc:me/app.bsky.feed.post/3new', cid: 'cid-new' }) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  const res = await lens.publish({ text: 'planting #garlic', langs: ['en'] });

  assert.equal(res.uri, 'at://did:plc:me/app.bsky.feed.post/3new');
  assert.equal(res.cid, 'cid-new');
  const put = calls.find((c) => c.path.includes('createRecord'));
  assert.ok(put, 'createRecord called');
  assert.equal(put.body.repo, 'did:plc:me', 'our own repo — the lens never writes to anyone else\'s');
  assert.equal(put.body.collection, 'app.bsky.feed.post');
  assert.equal(put.body.record.$type, 'app.bsky.feed.post');
  assert.equal(put.body.record.text, 'planting #garlic');
  assert.equal(put.body.record.facets.length, 1, 'the hashtag is faceted, so the network can index it');
  assert.equal(put.body.record.facets[0].features[0].tag, 'garlic');
  assert.ok(put.body.record.createdAt, 'a timestamp the lexicon requires');
});

test('3w: publish refuses without a session, and refuses a post the composer rejects', async () => {
  await assert.rejects(() => createLens({}).publish({ text: 'hello' }), /session|sign/i);

  const fetchHandler = async () => ({ ok: true, status: 200, json: async () => ({}) });
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  await assert.rejects(() => lens.publish({ text: '   ' }), /empty|nothing/i);
  await assert.rejects(() => lens.publish({ text: 'x'.repeat(301) }), /too long/i);
});

test('3w: a board tag is added to the text — as a facet, not as a promise we cannot keep', async () => {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push(init.body ? JSON.parse(init.body) : null);
    return { ok: true, status: 200, json: async () => ({ uri: 'at://x/y/z', cid: 'c' }) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  await lens.publish({ text: 'first tomato', tag: 'gardening' });
  const rec = calls[0].record;
  assert.equal(rec.text, 'first tomato #gardening', 'the board\'s tag joins the text');
  assert.equal(rec.facets[0].features[0].tag, 'gardening');
  // and it is not doubled when the writer already tagged it
  calls.length = 0;
  await lens.publish({ text: 'second #gardening tomato', tag: 'gardening' });
  assert.equal(calls[0].record.text, 'second #gardening tomato');
});

test('3w: a reply names its root and parent, so it threads where it was written', async () => {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push(init.body ? JSON.parse(init.body) : null);
    return { ok: true, status: 200, json: async () => ({ uri: 'at://x/y/z', cid: 'c' }) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  const parent = { uri: 'at://did:plc:a/app.bsky.feed.post/p1', cid: 'cid-p1' };
  const root = { uri: 'at://did:plc:a/app.bsky.feed.post/r0', cid: 'cid-r0' };
  await lens.publish({ text: 'agreed', replyTo: { root, parent } });
  assert.deepEqual(calls[0].record.reply, { root, parent });
});

test('phase-1 finding: publish passes the browser language through to the record', async () => {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push(init.body ? JSON.parse(init.body) : null);
    return { ok: true, status: 200, json: async () => ({ uri: 'at://x/y/z', cid: 'c' }) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  await lens.publish({ text: 'hello', navLang: 'pt-BR' });
  assert.deepEqual(calls[0].record.langs, ['pt'], 'the post says what language it is in');
});
