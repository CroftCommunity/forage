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

// ── P5: the EIGHTH lens write — fyi.forage.tagsub ────────────────────────────
// The first record Forage defines for itself that the lens actually writes.
// AGENTS.md lists every write and test/invariants.test.js counts them precisely
// so an eighth has to be argued for; the argument is in
// docs/LEXICON-REGISTER.md § fyi.forage.tagsub, and it is that across the
// official lexicons a subscription always points at a thing that EXISTS — a
// record or an identity — and a hashtag is neither.
//
// Everything the like pair proved has to hold here too: our repo and no other,
// a shape read off the lexicon rather than restated, and a delete bound to one
// exact rkey.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const TAGSUB_LEX = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'lexicons', 'fyi.forage.tagsub.json'), 'utf8'));

function repoSession({ records = [], failWith = null } = {}) {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (failWith) return { ok: false, status: failWith, json: async () => ({ error: 'Boom' }) };
    if (path.includes('listRecords')) {
      return { ok: true, status: 200, json: async () => ({ records }) };
    }
    return { ok: true, status: 200,
      json: async () => ({ uri: 'at://did:plc:me/fyi.forage.tagsub/3tag1', cid: 'tagcid' }) };
  };
  return { session: { did: 'did:plc:me', handle: 'me.test', fetchHandler }, calls };
}

test('saveTagSub writes a record that satisfies the lexicon, into MY repo', async () => {
  const { session, calls } = repoSession();
  const res = await createLens({ session }).saveTagSub('harvest');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].path.startsWith('/xrpc/com.atproto.repo.createRecord'));
  const b = calls[0].body;
  assert.equal(b.repo, 'did:plc:me');
  assert.equal(b.collection, 'fyi.forage.tagsub');
  assert.equal(b.record.$type, 'fyi.forage.tagsub');
  // read the schema, do not restate it — a copy of a schema is a second schema
  for (const req of TAGSUB_LEX.defs.main.record.required) {
    assert.ok(b.record[req] !== undefined, `record carries the required ${req}`);
  }
  assert.equal(b.record.tag, 'harvest');
  assert.match(b.record.createdAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(res.rkey, '3tag1', 'the rkey comes back, because Remove needs it');
});

test('tagSubs lists MY repo and returns tag+rkey pairs', async () => {
  const { session, calls } = repoSession({ records: [
    { uri: 'at://did:plc:me/fyi.forage.tagsub/3aa', value: { tag: 'harvest', createdAt: '2026-08-01T00:00:00.000Z' } },
    { uri: 'at://did:plc:me/fyi.forage.tagsub/3bb', value: { tag: 'mycology', createdAt: '2026-08-02T00:00:00.000Z' } },
  ] });
  const out = await createLens({ session }).tagSubs();
  assert.ok(calls[0].path.startsWith('/xrpc/com.atproto.repo.listRecords'));
  assert.match(calls[0].path, /repo=did%3Aplc%3Ame/, 'the list addresses my repo, not a handle or a guess');
  assert.match(calls[0].path, /collection=fyi\.forage\.tagsub/);
  assert.deepEqual(out, [
    { tag: 'harvest', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' },
    { tag: 'mycology', rkey: '3bb', createdAt: '2026-08-02T00:00:00.000Z' },
  ]);
});

test('removeTagSub deletes the EXACT rkey from my tagsub collection', async () => {
  const { session, calls } = repoSession();
  await createLens({ session }).removeTagSub('3aa');
  assert.ok(calls[0].path.startsWith('/xrpc/com.atproto.repo.deleteRecord'));
  assert.deepEqual(calls[0].body, { repo: 'did:plc:me', collection: 'fyi.forage.tagsub', rkey: '3aa' });
});

test('every tagsub write needs a session, and says so rather than failing at the network', async () => {
  const lens = createLens({ session: null });
  await assert.rejects(() => lens.saveTagSub('harvest'), /sign in/i);
  await assert.rejects(() => lens.removeTagSub('3aa'), /sign in/i);
  await assert.rejects(() => lens.tagSubs(), /sign in/i);
});

// ---- plan 2026-08-29 post-and-thread, Phase 4a: the ⋯ menu's writes ----------
// Phase 0 (D1/D2) probed every one of these live on the test account; the raw
// responses are test/fixtures/atproto/{bookmarks,graph-writes}.json. Bookmarks
// and mutes are PROCEDURES (200 with an empty body, no record); block is a
// RECORD (app.bsky.graph.block); repost is a record (app.bsky.feed.repost).

function procSession() {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    // procedures answer 200 with NO body — exactly what the PDS did in D1/D2
    if (/bookmark|muteActor|unmuteActor|muteThread|unmuteThread/.test(path)) {
      return { ok: true, status: 200, json: async () => { throw new Error('no body'); }, text: async () => '' };
    }
    return { ok: true, status: 200, json: async () => ({ uri: 'at://did:plc:me/app.bsky.graph.block/3blk', cid: 'c' }) };
  };
  return { session: { did: 'did:plc:me', handle: 'me.test', fetchHandler }, calls };
}

test('4a-i: bookmark(uri, cid, true|false) is the create/delete PROCEDURE pair — no record, and an empty 200 is success', async () => {
  const { session, calls } = procSession();
  const lens = createLens({ session });
  await lens.bookmark('at://did:plc:a/app.bsky.feed.post/p', 'cid1', true);
  await lens.bookmark('at://did:plc:a/app.bsky.feed.post/p', 'cid1', false);
  assert.deepEqual(calls.map((c) => [c.path, c.method, c.body]), [
    ['/xrpc/app.bsky.bookmark.createBookmark', 'POST', { uri: 'at://did:plc:a/app.bsky.feed.post/p', cid: 'cid1' }],
    ['/xrpc/app.bsky.bookmark.deleteBookmark', 'POST', { uri: 'at://did:plc:a/app.bsky.feed.post/p' }],
  ]);
});

test('4a-i: a post shapes `saved` from viewer.bookmarked — the bookmark IS the save', () => {
  const on = shapeLensPost({ uri: 'at://d/p/1', cid: 'c1', author: { did: 'd', handle: 'h' },
    record: { text: 't', createdAt: '2026-08-25T00:00:00Z' }, viewer: { bookmarked: true } }, SRC);
  const off = shapeLensPost({ uri: 'at://d/p/1', cid: 'c1', author: { did: 'd', handle: 'h' },
    record: { text: 't', createdAt: '2026-08-25T00:00:00Z' }, viewer: {} }, SRC);
  assert.equal(on.saved, true);
  assert.equal(off.saved, false);
});

test('4a-ii: muteActor / muteThread are procedure pairs, keyed on the same subject both ways', async () => {
  const { session, calls } = procSession();
  const lens = createLens({ session });
  await lens.muteActor('did:plc:x', true);
  await lens.muteActor('did:plc:x', false);
  await lens.muteThread('at://did:plc:a/app.bsky.feed.post/root', true);
  await lens.muteThread('at://did:plc:a/app.bsky.feed.post/root', false);
  assert.deepEqual(calls.map((c) => [c.path, c.body]), [
    ['/xrpc/app.bsky.graph.muteActor', { actor: 'did:plc:x' }],
    ['/xrpc/app.bsky.graph.unmuteActor', { actor: 'did:plc:x' }],
    ['/xrpc/app.bsky.graph.muteThread', { root: 'at://did:plc:a/app.bsky.feed.post/root' }],
    ['/xrpc/app.bsky.graph.unmuteThread', { root: 'at://did:plc:a/app.bsky.feed.post/root' }],
  ]);
  assert.ok(calls.every((c) => c.method === 'POST'));
});

test('4a-ii: block() is a RECORD in my repo; unblock() deletes that exact rkey; blocking yourself is refused before any request', async () => {
  const { session, calls } = procSession();
  const lens = createLens({ session });
  const res = await lens.block('did:plc:x');
  assert.equal(res.blockUri, 'at://did:plc:me/app.bsky.graph.block/3blk');
  assert.equal(calls[0].path, '/xrpc/com.atproto.repo.createRecord');
  assert.equal(calls[0].body.repo, 'did:plc:me');
  assert.equal(calls[0].body.collection, 'app.bsky.graph.block');
  assert.equal(calls[0].body.record.$type, 'app.bsky.graph.block');
  assert.equal(calls[0].body.record.subject, 'did:plc:x');
  assert.ok(calls[0].body.record.createdAt);
  await lens.unblock('at://did:plc:me/app.bsky.graph.block/3blk');
  assert.equal(calls[1].path, '/xrpc/com.atproto.repo.deleteRecord');
  assert.deepEqual(calls[1].body, { repo: 'did:plc:me', collection: 'app.bsky.graph.block', rkey: '3blk' });
  await assert.rejects(() => lens.block('did:plc:me'), /yourself/);
  await assert.rejects(() => lens.unblock('at://did:plc:other/app.bsky.graph.block/3blk'), /outside|not yours|other/i);
  assert.equal(calls.length, 2, 'the refusals sent nothing');
});

test('4a-iii (O6): repost() / unrepost() are the like pair\'s shape on app.bsky.feed.repost; a post shapes repostUri from viewer.repost', async () => {
  const { session, calls } = procSession();
  const lens = createLens({ session });
  const r = await lens.repost('at://did:plc:a/app.bsky.feed.post/p', 'cid1');
  assert.equal(r.repostUri, 'at://did:plc:me/app.bsky.graph.block/3blk'); // whatever the fake returns as uri
  assert.equal(calls[0].body.collection, 'app.bsky.feed.repost');
  assert.deepEqual(calls[0].body.record.subject, { uri: 'at://did:plc:a/app.bsky.feed.post/p', cid: 'cid1' });
  await lens.unrepost('at://did:plc:me/app.bsky.feed.repost/3rp');
  assert.deepEqual(calls[1].body, { repo: 'did:plc:me', collection: 'app.bsky.feed.repost', rkey: '3rp' });
  const shaped = shapeLensPost({ uri: 'at://d/p/1', cid: 'c1', author: { did: 'd', handle: 'h' },
    record: { text: 't', createdAt: '2026-08-25T00:00:00Z' }, repostCount: 4,
    viewer: { repost: 'at://did:plc:me/app.bsky.feed.repost/3rp' } }, SRC);
  assert.equal(shaped.repostUri, 'at://did:plc:me/app.bsky.feed.repost/3rp');
  assert.equal(shaped.repostCount, 4);
});

test('4a: every one of these rejects with words on a non-2xx, so the menu can say so', async () => {
  const { session } = writerSession({ failWith: 403 });
  const lens = createLens({ session });
  for (const [name, fn] of [
    ['bookmark', () => lens.bookmark('at://a/b/c', 'c', true)],
    ['muteActor', () => lens.muteActor('did:plc:x', true)],
    ['muteThread', () => lens.muteThread('at://a/b/c', true)],
    ['block', () => lens.block('did:plc:x')],
    ['repost', () => lens.repost('at://a/b/c', 'c')],
  ]) await assert.rejects(fn, /403/, `${name} names the status`);
});

// ---- Phase 4b: the lens menu's remaining writes and the local hide ----------
test('4b (O5): muteWord() appends a mutedWord to mutedWordsPref by read-modify-write — the THIRD putPreferences', async () => {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (path.includes('getPreferences')) return { ok: true, status: 200, json: async () => ({ preferences: [
      { $type: 'app.bsky.actor.defs#adultContentPref', enabled: false },
      { $type: 'app.bsky.actor.defs#mutedWordsPref', items: [{ value: 'old', targets: ['content'] }] },
    ] }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  await lens.muteWord('#spoilers');
  const put = calls.find((c) => c.path.includes('putPreferences'));
  assert.ok(put, 'putPreferences was sent');
  const pref = put.body.preferences.find((p) => p.$type === 'app.bsky.actor.defs#mutedWordsPref');
  assert.deepEqual(pref.items.map((i) => i.value), ['old', 'spoilers'], 'a leading # is a tag mute, stored bare');
  assert.deepEqual(pref.items[1].targets, ['tag']);
  assert.equal(pref.items[1].actorTarget, 'all');
  assert.ok(put.body.preferences.some((p) => p.$type === 'app.bsky.actor.defs#adultContentPref'), 'nothing else in the blob is disturbed');
  await lens.muteWord('rain');
  const put2 = calls.filter((c) => c.path.includes('putPreferences')).at(-1);
  const pref2 = put2.body.preferences.find((p) => p.$type === 'app.bsky.actor.defs#mutedWordsPref');
  assert.deepEqual(pref2.items.at(-1), { value: 'rain', targets: ['content', 'tag'], actorTarget: 'all' }, 'a plain word mutes text and tags');
});

test('4b: muteWord() with no mutedWordsPref yet creates one; a duplicate is not appended twice', async () => {
  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, body: init.body ? JSON.parse(init.body) : null });
    if (path.includes('getPreferences')) return { ok: true, status: 200, json: async () => ({ preferences: [
      { $type: 'app.bsky.actor.defs#mutedWordsPref', items: [{ value: 'rain', targets: ['content', 'tag'] }] },
    ] }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  await lens.muteWord('rain');
  assert.equal(calls.filter((c) => c.path.includes('putPreferences')).length, 0, 'already muted: nothing written');
  const fresh = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler: async (path, init = {}) => {
    calls.push({ path, body: init.body ? JSON.parse(init.body) : null });
    if (path.includes('getPreferences')) return { ok: true, status: 200, json: async () => ({ preferences: [] }) };
    return { ok: true, status: 200, json: async () => ({}) };
  } } });
  await fresh.muteWord('snow');
  const put = calls.filter((c) => c.path.includes('putPreferences')).at(-1);
  assert.deepEqual(put.body.preferences, [{ $type: 'app.bsky.actor.defs#mutedWordsPref', items: [{ value: 'snow', targets: ['content', 'tag'], actorTarget: 'all' }] }]);
});

test('4b: report() files com.atproto.moderation.createReport with a strongRef subject and a known reasonType', async () => {
  const { session, calls } = procSession();
  const lens = createLens({ session });
  await lens.report({ uri: 'at://did:plc:a/app.bsky.feed.post/p', cid: 'c1' }, 'spam', 'sells watches');
  assert.equal(calls[0].path, '/xrpc/com.atproto.moderation.createReport');
  assert.deepEqual(calls[0].body, {
    reasonType: 'com.atproto.moderation.defs#reasonSpam', reason: 'sells watches',
    subject: { $type: 'com.atproto.repo.strongRef', uri: 'at://did:plc:a/app.bsky.feed.post/p', cid: 'c1' },
  });
  await assert.rejects(() => lens.report({ uri: 'at://a/b/c', cid: 'c' }, 'not-a-reason', ''), /reason/);
  assert.equal(calls.length, 1, 'an unknown reason sends nothing');
  for (const [key, type] of [['rude', 'reasonRude'], ['violation', 'reasonViolation'], ['misleading', 'reasonMisleading'], ['sexual', 'reasonSexual'], ['other', 'reasonOther']]) {
    await lens.report({ uri: 'at://a/b/c', cid: 'c' }, key, '');
    assert.equal(calls.at(-1).body.reasonType, `com.atproto.moderation.defs#${type}`);
  }
});

test('4b: hide(uri, on) is LOCAL — no request — and the shape layer hides the post from then on', async () => {
  const { session, calls } = procSession();
  const lens = createLens({ session, hiddenUris: new Set(['at://d/p/already']) });
  const post = (id) => ({ uri: `at://d/p/${id}`, cid: 'c', author: { did: 'd', handle: 'h' }, record: { text: 't', createdAt: '2026-08-25T00:00:00Z' } });
  assert.equal(shapeLensPost(post('already'), SRC, lens.posture()).hidden, true, 'a uri handed in at creation is hidden');
  assert.equal(shapeLensPost(post('x'), SRC, lens.posture()).hidden, undefined);
  const set = lens.hide('at://d/p/x', true);
  assert.equal(shapeLensPost(post('x'), SRC, lens.posture()).hidden, true);
  assert.ok(set.has('at://d/p/x'), 'the caller gets the set back to persist');
  lens.hide('at://d/p/x', false);
  assert.equal(shapeLensPost(post('x'), SRC, lens.posture()).hidden, undefined);
  assert.equal(calls.length, 0, 'hiding never reaches the network');
});
