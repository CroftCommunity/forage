// 6b: the wide lens' pure shapers — bsky AppView views into the SAME result
// shapes our selectors emit, so the standing UI renders them unchanged.
// Hermetic over the wide probe fixtures. The shape contract is derived from a
// real memory-world selector result: every key the memory tier emits must be
// present on the lens shape (values may diverge only where the ledger says so).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyState, reduce } from '../js/reducers.js';
import { feed, thread } from '../js/selectors.js';
import { shapeLensPost, shapeLensThread, shapeLensFeed, LENS_PERMS, createLens } from '../js/substrates/lens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (n) => JSON.parse(readFileSync(join(root, 'test/fixtures/atproto', `${n}.json`), 'utf8'));

// ---- the shape contract, derived from the memory world ----

function memoryShapes() {
  const log = [
    { id: 'e1', type: 'account.registered', actor: 'u_a', ts: 1000, payload: { handle: 'a' } },
    { id: 'e2', type: 'field.created', actor: 'u_a', ts: 2000, payload: { id: 'f1', slug: 'g', title: 'G' } },
    { id: 'e3', type: 'post.created', actor: 'u_a', ts: 3000, payload: { id: 'p1', fieldId: 'f1', format: 'text', title: 'T', bodyMd: 'B' } },
    { id: 'e4', type: 'comment.created', actor: 'u_a', ts: 4000, payload: { id: 'c1', postId: 'p1', bodyMd: 'C', quiet: true } },
  ];
  const s = log.reduce((st, e) => reduce(st, e), emptyState());
  return {
    post: feed(s, null, 'field:g', 'hot', 'all', 5).posts[0],
    node: thread(s, null, 'p1', 'best', 5).comments[0],
  };
}

const SRC = { fieldId: 'lens:whats-hot', fieldSlug: 'whats-hot', fieldTitle: "What's Hot" };

test('a lens post carries every key the memory post shape has', () => {
  const bskyPost = fixture('wide-getFeed').feed[0].post;
  const shaped = shapeLensPost(bskyPost, SRC);
  const missing = Object.keys(memoryShapes().post).filter((k) => !(k in shaped));
  assert.deepStrictEqual(missing, [], `lens post missing keys: ${missing}`);
  assert.equal(shaped.id, bskyPost.uri);            // the at-uri IS the lens id
  assert.equal(shaped.ups, bskyPost.likeCount);     // DL: scores are likes-only
  assert.equal(shaped.downs, 0);
  assert.equal(shaped.commentCount, bskyPost.replyCount);
  assert.equal(shaped.author, bskyPost.author.handle);
  assert.equal(shaped.fieldSlug, 'whats-hot');
  assert.equal(typeof shaped.createdSec, 'number');
});

test('a lens thread mirrors the comment-node shape with depth/children/deferred', () => {
  const t = shapeLensThread(fixture('wide-getPostThread'), SRC);
  const nodeKeys = Object.keys(memoryShapes().node).filter((k) => k !== 'children');
  assert.ok(t.post);
  assert.ok(Array.isArray(t.comments));
  assert.equal(t.perms.canModerate, false);
  if (t.comments.length) {
    const missing = nodeKeys.filter((k) => !(k in t.comments[0]));
    assert.deepStrictEqual(missing, [], `lens node missing keys: ${missing}`);
    assert.equal(t.comments[0].depth, 0);
    assert.ok(Array.isArray(t.comments[0].children));
  }
  assert.equal(typeof t.total, 'number');
});

test('a lens feed mirrors the feed result shape, guest perms locked down', () => {
  const f = shapeLensFeed(fixture('wide-getFeed'), SRC, { sort: 'lens' });
  assert.equal(f.posts.length, 3);
  assert.equal(f.scope, 'lens:whats-hot');
  for (const k of ['canPost', 'canComment', 'canVote', 'canModerate', 'canReport']) {
    assert.equal(f.perms[k], false, k);
  }
  assert.equal(f.perms.canView, true);
  assert.deepStrictEqual(LENS_PERMS.canCreateField, false);
});

test('a muted author masks through the SAME masked shape the memory tier uses', () => {
  const bskyPost = structuredClone(fixture('wide-getFeed').feed[0].post);
  bskyPost.author.viewer = { muted: true };
  const shaped = shapeLensPost(bskyPost, SRC);
  assert.equal(shaped.maskedRemoved, true);
  assert.equal(shaped.authorId, null);
  assert.notEqual(shaped.title, undefined);
});

test('every lens chip has its ledger entry: DL-010..015 present with the right kinds', async () => {
  const { LEDGER } = await import('../ledger/divergence.js');
  const byId = Object.fromEntries(LEDGER.map((e) => [e.id, e]));
  for (const [id, kind] of [['DL-010', 'tolerance'], ['DL-011', 'tolerance'], ['DL-012', 'tolerance'],
    ['DL-013', 'frontier'], ['DL-014', 'frontier'], ['DL-015', 'frontier']]) {
    assert.equal(byId[id]?.kind, kind, id);
    assert.equal(byId[id]?.tier, 'wide', id);
  }
  // and the chips actually reference them (invariant 7's two halves stay joined)
  const { readFileSync: rf } = await import('node:fs');
  const ui = rf(join(root, 'js/ui/lens-views.js'), 'utf8');
  for (const id of ['DL-010', 'DL-011', 'DL-013', 'DL-014', 'DL-015']) {
    assert.ok(ui.includes(id), `lens-views chips reference ${id}`);
  }
});

test('link embeds shape as link posts; plain text shapes as text', () => {
  const post = structuredClone(fixture('wide-getFeed').feed[0].post);
  post.embed = { $type: 'app.bsky.embed.external#view', external: { uri: 'https://example.com/x', title: 'Ext' } };
  const linkShaped = shapeLensPost(post, SRC);
  assert.equal(linkShaped.format, 'link');
  assert.equal(linkShaped.url, 'https://example.com/x');
  delete post.embed;
  assert.equal(shapeLensPost(post, SRC).format, 'text');
});

// ---- 3e: quotes as thread continuation (D7-grounded) ----

const QSRC = { fieldId: 'lens:q', fieldSlug: 'q', fieldTitle: 'Q' };
const qPost = (rkey, did, ts, extra = {}) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did, handle: did.slice(8) + '.test' },
  record: { text: 'text ' + rkey, createdAt: ts }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: 0, ...extra,
});

test('3e: replies and quotes interleave time-ordered as ONE continuation; ties break deterministically', () => {
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z', { quoteCount: 2 }),
    replies: [
      { post: qPost('r1', 'did:plc:aa', '2026-08-25T09:00:00Z'), replies: [] },
      { post: qPost('r2', 'did:plc:cc', '2026-08-25T11:00:00Z'), replies: [] },
    ],
  } };
  const quotes = [
    qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z'),
    qPost('q2', 'did:plc:aa', '2026-08-25T09:00:00Z'), // TIE with r1 at 09:00 — did:plc:aa equal, id decides
  ];
  const t = shapeLensThread(threadResponse, QSRC, { quotes });
  const order = t.comments.map((c) => `${c.kind}:${c.id.split('/').pop()}`);
  assert.deepEqual(order, ['quote:q2', 'reply:r1', 'quote:q1', 'reply:r2'],
    'ascending time; the 09:00 tie (same author) breaks by id — q2 < r1. The rule is (createdTs, authorId, id), pinned.');
  assert.equal(t.quoteCount, 2);
  const q = t.comments.find((c) => c.kind === 'quote');
  assert.equal(q.quoteUri, q.id, 'a quote node opens as its own thread root');
  assert.equal(t.comments.filter((c) => c.kind === 'quote').length, quotes.length,
    'exactly what the appview returned — a detached quote simply is not in the list');
});

// 3q: a quote-response is a top-level thread ON the post — the OG post stays
// the container. That is a rule about DEPTH, so it is pinned here and the view
// reads it rather than deciding for itself.
test('3q: quote nodes are always top-level; threadNodeStyle walls only those', async () => {
  const { threadNodeStyle } = await import('../js/substrates/lens.js');
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z'),
    replies: [{ post: qPost('r1', 'did:plc:aa', '2026-08-25T09:00:00Z'), replies: [] }],
  } };
  const t = shapeLensThread(threadResponse, QSRC, { quotes: [qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z')] });
  for (const c of t.comments.filter((c) => c.kind === 'quote')) {
    assert.equal(c.depth, 0, 'a quote never nests — it responds to the post, not to a reply');
  }

  // the wall marks quoted material. A reply gets the collapse gutter instead;
  // the two must never appear on the same node or the thread reads as if the
  // reply below belongs to the quote (observed 2026-08-26).
  assert.deepEqual(threadNodeStyle({ kind: 'quote', depth: 0 }), { kind: 'quote', walled: true });
  assert.deepEqual(threadNodeStyle({ kind: 'reply', depth: 0 }), { kind: 'reply', walled: false });
  assert.deepEqual(threadNodeStyle({ kind: 'reply', depth: 3 }), { kind: 'reply', walled: false });
  // defensive: if a quote ever arrived nested, it renders as an ordinary reply
  // rather than stacking a second wall inside the gutter
  assert.deepEqual(threadNodeStyle({ kind: 'quote', depth: 2 }), { kind: 'reply', walled: false });
});

test('3e: reply nodes carry kind=reply and nested children keep working', () => {
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z'),
    replies: [{ post: qPost('r1', 'did:plc:aa', '2026-08-25T09:00:00Z'),
      replies: [{ post: qPost('r1a', 'did:plc:bb', '2026-08-25T09:30:00Z'), replies: [] }] }],
  } };
  const t = shapeLensThread(threadResponse, QSRC);
  assert.equal(t.comments[0].kind, 'reply');
  assert.equal(t.comments[0].children[0].kind, 'reply');
  assert.equal(t.quoteCount, 0);
});

test('3e: inbound quoted context — an embed record#view becomes post.quoted', () => {
  const p = shapeLensPost(qPost('quoter', 'did:plc:aa', '2026-08-25T10:00:00Z', {
    embed: { $type: 'app.bsky.embed.record#view', record: {
      $type: 'app.bsky.embed.record#viewRecord',
      uri: 'at://did:plc:orig/app.bsky.feed.post/orig1', cid: 'oc',
      author: { did: 'did:plc:orig', handle: 'orig.test' },
      value: { text: 'the original words', createdAt: '2026-08-25T09:00:00Z' },
    } },
  }), QSRC);
  assert.deepEqual(p.quoted, {
    uri: 'at://did:plc:orig/app.bsky.feed.post/orig1',
    author: 'orig.test',
    excerpt: 'the original words',
  });
});

test('3e: thread() fetches quotes alongside; a quotes failure degrades to the honest count', async () => {
  const mk = (quotesFail) => async (path) => {
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (path.includes('getPostThread')) return json({ thread: { post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z', { quoteCount: 3 }), replies: [{ post: qPost('r1', 'did:plc:aa', '2026-08-25T09:00:00Z'), replies: [] }] } });
    if (path.includes('getQuotes')) {
      if (quotesFail) return { ok: false, status: 500, json: async () => ({}) };
      return json({ posts: [qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z')] });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const session = (fail) => ({ did: 'did:plc:me', handle: 'me', fetchHandler: mk(fail) });

  const ok = await createLens({ session: session(false) }).thread('at://did:plc:op/app.bsky.feed.post/root', QSRC);
  assert.deepEqual(ok.comments.map((c) => c.kind), ['reply', 'quote']);
  assert.equal(ok.quotesFailed, undefined);

  const degraded = await createLens({ session: session(true) }).thread('at://did:plc:op/app.bsky.feed.post/root', QSRC);
  assert.deepEqual(degraded.comments.map((c) => c.kind), ['reply'], 'replies still render');
  assert.equal(degraded.quotesFailed, true, 'the failure is named, not silent');
  assert.equal(degraded.quoteCount, 3, 'the honest count survives for the chip');
});

// ---- 3i (2026-08-26 iteration): title/body, self-threads ----

test('3i: a plain text post does NOT duplicate its text as a preview (title carries it; 300/300 synergy)', () => {
  const p = shapeLensPost(qPost('t1', 'did:plc:a', '2026-08-26T00:00:00Z'), QSRC);
  assert.equal(p.title, 'text t1');
  assert.equal(p.preview, '', 'rows show no preview when the content IS the title');
  assert.equal(p.body, 'text t1', 'body survives for thread/comment rendering');
});

test('3i: the poster self-thread (1/3, 2/3, 3/3) hoists into the post body; others stay comments', () => {
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-08-26T08:00:00Z', { record: { text: 'part one 1/3', createdAt: '2026-08-26T08:00:00Z' } }),
    replies: [
      { post: qPost('p2', 'did:plc:op', '2026-08-26T08:01:00Z', { record: { text: 'part two 2/3', createdAt: '2026-08-26T08:01:00Z' } }),
        replies: [
          { post: qPost('p3', 'did:plc:op', '2026-08-26T08:02:00Z', { record: { text: 'part three 3/3', createdAt: '2026-08-26T08:02:00Z' } }),
            replies: [{ post: qPost('r2', 'did:plc:bb', '2026-08-26T08:05:00Z'), replies: [] }] },
        ] },
      { post: qPost('r1', 'did:plc:aa', '2026-08-26T08:03:00Z'), replies: [] },
    ],
  } };
  const t = shapeLensThread(threadResponse, QSRC);
  assert.deepEqual(t.selfThread.map((s) => s.text), ['part two 2/3', 'part three 3/3'],
    'the same-author reply chain becomes the body continuation, in order');
  const ids = t.comments.map((c) => c.id.split('/').pop());
  assert.ok(!ids.includes('p2') && !ids.includes('p3'), 'hoisted parts are not comments');
  assert.ok(ids.includes('r1'), 'another author replying to the root stays a comment');
  assert.ok(ids.includes('r2'), 'a reply to a hoisted part stays a comment (re-rooted)');
});

test('3i: a same-author reply that BREAKS the chain (replies to someone else) is not hoisted', () => {
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-08-26T08:00:00Z'),
    replies: [
      { post: qPost('r1', 'did:plc:aa', '2026-08-26T08:01:00Z'),
        replies: [{ post: qPost('opback', 'did:plc:op', '2026-08-26T08:02:00Z'), replies: [] }] },
    ],
  } };
  const t = shapeLensThread(threadResponse, QSRC);
  assert.deepEqual(t.selfThread, [], 'the OP replying to a commenter is a comment, not body');
  assert.equal(t.comments.length, 1);
  assert.equal(t.comments[0].children.length, 1);
});

// ---- 3i: media embeds (card mode renders images; compact does not) ----

test('3i: an images embed becomes post.media with thumbs+alts; an image-only post titles from alt', () => {
  const p = shapeLensPost(qPost('img1', 'did:plc:a', '2026-08-26T00:00:00Z', {
    record: { text: '', createdAt: '2026-08-26T00:00:00Z' },
    embed: { $type: 'app.bsky.embed.images#view', images: [
      { thumb: 'https://cdn/th1.jpg', fullsize: 'https://cdn/f1.jpg', alt: 'a heron mid-strike' },
      { thumb: 'https://cdn/th2.jpg', fullsize: 'https://cdn/f2.jpg', alt: '' },
    ] } }), QSRC);
  assert.equal(p.media.kind, 'images');
  assert.equal(p.media.items.length, 2);
  assert.equal(p.media.items[0].thumb, 'https://cdn/th1.jpg');
  assert.equal(p.media.items[0].full, 'https://cdn/f1.jpg');
  assert.equal(p.title, 'a heron mid-strike', 'an image-only post titles from its alt text');
});

test('3i: image-only with NO alt falls back to a named placeholder title', () => {
  const p = shapeLensPost(qPost('img2', 'did:plc:a', '2026-08-26T00:00:00Z', {
    record: { text: '', createdAt: '2026-08-26T00:00:00Z' },
    embed: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: '' }] } }), QSRC);
  assert.equal(p.title, '[image]');
});

test('3i: video and recordWithMedia surface their media; external thumbs ride along', () => {
  const vid = shapeLensPost(qPost('v1', 'did:plc:a', '2026-08-26T00:00:00Z', {
    embed: { $type: 'app.bsky.embed.video#view', thumbnail: 'https://cdn/vt.jpg', playlist: 'https://cdn/pl.m3u8' } }), QSRC);
  assert.equal(vid.media.kind, 'video');
  assert.equal(vid.media.thumb, 'https://cdn/vt.jpg');

  const rwm = shapeLensPost(qPost('rw1', 'did:plc:a', '2026-08-26T00:00:00Z', {
    embed: { $type: 'app.bsky.embed.recordWithMedia#view',
      media: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: 'combo' }] },
      record: { record: { $type: 'app.bsky.embed.record#viewRecord', uri: 'at://x/y/z', author: { handle: 'q' }, value: { text: 'quoted' } } } } }), QSRC);
  assert.equal(rwm.media.kind, 'images');
  assert.ok(rwm.quoted, 'the quoted half still surfaces');

  const ext = shapeLensPost(qPost('e1', 'did:plc:a', '2026-08-26T00:00:00Z', {
    embed: { $type: 'app.bsky.embed.external#view', external: { uri: 'https://x.test/a', title: 'X', thumb: 'https://cdn/et.jpg' } } }), QSRC);
  assert.equal(ext.media.kind, 'external');
  assert.equal(ext.media.thumb, 'https://cdn/et.jpg');
  assert.equal(ext.format, 'link');
});
