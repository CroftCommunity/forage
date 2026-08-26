// 3c: boost = like — the lens' FIRST write (DL-013), OAuth-bound. The write
// pair is exactly app.bsky.feed.like create + delete (D1-pinned shapes);
// test/invariants.test.js narrows the no-write-path proof to precisely this
// pair in the same commit. Hermetic over a recording session fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLens, shapeLensPost } from '../js/substrates/lens.js';

const SRC = { feedId: 'lens:x', feedSlug: 'x', feedTitle: 'X' };

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

// ---- Phase 2: delete your own post ----
// 3w made Forage able to write and not to unwrite. That is a bad property for
// a forum and a worse one for trust: a client that can post but not remove is
// asking for more faith than it earns. The guard matters more than the button —
// a delete that can reach another repo is a different capability wearing this
// one's name.

test('phase 2: canDelete is true only for YOUR OWN post, and only with a session', async () => {
  const { canDelete } = await import('../js/substrates/lens.js');
  const mine = { id: 'at://did:plc:me/app.bsky.feed.post/p1', authorId: 'did:plc:me' };
  const theirs = { id: 'at://did:plc:you/app.bsky.feed.post/p2', authorId: 'did:plc:you' };
  const session = { did: 'did:plc:me' };

  assert.equal(canDelete(mine, session), true);
  assert.equal(canDelete(theirs, session), false, 'never offer to delete someone else’s post');
  assert.equal(canDelete(mine, null), false, 'no session, no delete');
  // a masked or muted shape has authorId null — it must not match a null did
  assert.equal(canDelete({ id: 'at://x/y/z', authorId: null }, { did: null }), false,
    'null must never equal null into a delete');
  assert.equal(canDelete({ id: 'at://x/y/z', authorId: null }, session), false);
  // the at-uri has to agree with the author: a shape claiming to be ours while
  // its uri points at another repo is not ours
  assert.equal(canDelete({ id: 'at://did:plc:you/app.bsky.feed.post/p3', authorId: 'did:plc:me' }, session), false,
    'the uri is the authority, not the label');
});

test('phase 2: deletePost removes MY post, and refuses a uri outside my repo', async () => {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, body: init.body ? JSON.parse(init.body) : null });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });

  await lens.deletePost('at://did:plc:me/app.bsky.feed.post/3abc');
  const del = calls.find((c) => c.path.includes('deleteRecord'));
  assert.ok(del, 'deleteRecord called');
  assert.deepEqual(del.body, { repo: 'did:plc:me', collection: 'app.bsky.feed.post', rkey: '3abc' });

  // the guard: even called directly, it will not touch another repo
  await assert.rejects(() => lens.deletePost('at://did:plc:someoneelse/app.bsky.feed.post/3xyz'),
    /your own|own repo|not yours/i);
  // and it will not delete a non-post record through the post path
  await assert.rejects(() => lens.deletePost('at://did:plc:me/app.bsky.feed.like/3like'),
    /post/i);
  assert.equal(calls.filter((c) => c.path.includes('deleteRecord')).length, 1,
    'exactly one delete reached the network — the refusals never called out');
});

test('phase 2: deletePost refuses without a session, and refuses a malformed uri', async () => {
  await assert.rejects(() => createLens({}).deletePost('at://did:plc:me/app.bsky.feed.post/x'), /session|sign/i);
  const fetchHandler = async () => ({ ok: true, status: 200, json: async () => ({}) });
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  for (const bad of ['', 'not-a-uri', 'at://did:plc:me', 'https://bsky.app/profile/x/post/y']) {
    await assert.rejects(() => lens.deletePost(bad), /uri|post/i, `${JSON.stringify(bad)} is not a post uri`);
  }
});

// ---- Phase 3.2: the upload path ----

test('3.2: uploadImage sends the bytes and returns the blob ref', async () => {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, ctype: init.headers?.['content-type'], body: init.body });
    return { ok: true, status: 200, json: async () => ({ blob: {
      $type: 'blob', ref: { $link: 'bafkreiabc' }, mimeType: 'image/png', size: 268 } }) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  const file = new File([new Uint8Array(268)], 'x.png', { type: 'image/png' });
  const b = await lens.uploadImage(file);

  assert.deepEqual(b, { $type: 'blob', ref: { $link: 'bafkreiabc' }, mimeType: 'image/png', size: 268 });
  const up = calls.find((c) => c.path.includes('uploadBlob'));
  assert.ok(up, 'uploadBlob called');
  assert.equal(up.ctype, 'image/png', 'the file’s own type is sent — the PDS sniffs anyway, but lying is pointless');
  assert.ok(up.body instanceof Blob || up.body instanceof ArrayBuffer || ArrayBuffer.isView(up.body),
    'the raw bytes go up, not JSON');
});

test('3.2: uploadImage refuses an oversized file BEFORE spending the upload', async () => {
  const calls = [];
  const fetchHandler = async (path) => { calls.push(path); return { ok: true, status: 200, json: async () => ({}) }; };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  // finding C: the PDS accepts this upload with a 200 and only fails at
  // createRecord, so the check has to be here or the user waits for nothing
  const big = new File([new Uint8Array(2100928)], 'big.png', { type: 'image/png' });
  await assert.rejects(() => lens.uploadImage(big), /2100928|too (big|large)/i);
  assert.equal(calls.length, 0, 'nothing was uploaded — that is the point');

  const notAnImage = new File([new Uint8Array(10)], 'x.pdf', { type: 'application/pdf' });
  await assert.rejects(() => lens.uploadImage(notAnImage), /image/i);
  assert.equal(calls.length, 0);
});

test('3.2: uploadImage refuses without a session', async () => {
  const file = new File([new Uint8Array(4)], 'x.png', { type: 'image/png' });
  await assert.rejects(() => createLens({}).uploadImage(file), /session|sign/i);
});

test('3.2: publish carries images through to the record', async () => {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, body: init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null });
    return { ok: true, status: 200, json: async () => ({ uri: 'at://x/y/z', cid: 'c' }) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  const b = { $type: 'blob', ref: { $link: 'bafkreiabc' }, mimeType: 'image/png', size: 268 };
  await lens.publish({ text: 'look', images: [{ blob: b, alt: 'a description' }], navLang: 'en' });
  const rec = calls.find((c) => c.path.includes('createRecord')).body.record;
  assert.equal(rec.embed.$type, 'app.bsky.embed.images');
  assert.deepEqual(rec.embed.images[0].image, b);
  assert.equal(rec.embed.images[0].alt, 'a description');
});
