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
import { board, thread } from '../js/selectors.js';
import { shapeLensPost, shapeLensThread, shapeLensFeed, LENS_PERMS, createLens } from '../js/substrates/lens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (n) => JSON.parse(readFileSync(join(root, 'test/fixtures/atproto', `${n}.json`), 'utf8'));

// ---- the shape contract, derived from the memory world ----

function memoryShapes() {
  const log = [
    { id: 'e1', type: 'account.registered', actor: 'u_a', ts: 1000, payload: { handle: 'a' } },
    { id: 'e2', type: 'feed.created', actor: 'u_a', ts: 2000, payload: { id: 'f1', slug: 'g', title: 'G' } },
    { id: 'e3', type: 'post.created', actor: 'u_a', ts: 3000, payload: { id: 'p1', feedId: 'f1', format: 'text', title: 'T', bodyMd: 'B' } },
    { id: 'e4', type: 'comment.created', actor: 'u_a', ts: 4000, payload: { id: 'c1', postId: 'p1', bodyMd: 'C', quiet: true } },
  ];
  const s = log.reduce((st, e) => reduce(st, e), emptyState());
  return {
    post: board(s, null, 'feed:g', 'hot', 'all', 5).posts[0],
    node: thread(s, null, 'p1', 'best', 5).comments[0],
  };
}

const SRC = { feedId: 'lens:whats-hot', feedSlug: 'whats-hot', feedTitle: "What's Hot" };

test('a lens post carries every key the memory post shape has', () => {
  const bskyPost = fixture('wide-getFeed').feed[0].post;
  const shaped = shapeLensPost(bskyPost, SRC);
  const missing = Object.keys(memoryShapes().post).filter((k) => !(k in shaped));
  assert.deepStrictEqual(missing, [], `lens post missing keys: ${missing}`);
  assert.equal(shaped.id, bskyPost.uri);            // the at-uri IS the lens id
  assert.equal(shaped.likes, bskyPost.likeCount);   // one number, and it IS the like count
  // The field is ABSENT, not zero. DL-011 retired when both populations
  // dropped downvotes; an always-zero field is what that tolerance excused.
  assert.equal('downs' in shaped, false);
  assert.equal(shaped.commentCount, bskyPost.replyCount);
  assert.equal(shaped.author, bskyPost.author.handle);
  assert.equal(shaped.feedSlug, 'whats-hot');
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

test('a thread reply carries likeUri, so un-liking a comment knows its rkey', () => {
  // The head post carried viewer.like through shapeLensPost from the start;
  // reply nodes were rebuilt by hand in shapeLensThread and dropped it, so the
  // comment stack could like but never unlike (owner, 2026-08-29: "the button
  // for me logged in doesn't work").
  const mk = (rkey, did, like) => ({
    uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'c' + rkey,
    author: { did, handle: did.slice(8) + '.test' },
    record: { text: rkey, createdAt: '2026-08-29T10:00:00Z' }, indexedAt: '2026-08-29T10:00:00Z',
    replyCount: 0, repostCount: 0, likeCount: 1,
    ...(like ? { viewer: { like } } : {}),
  });
  const t = shapeLensThread({ thread: {
    post: mk('root', 'did:plc:op', null),
    replies: [{ post: mk('b', 'did:plc:bb', 'at://did:plc:me/app.bsky.feed.like/3lk'), replies: [] },
      { post: mk('c', 'did:plc:cc', null), replies: [] }],
  } }, SRC);
  const byRkey = Object.fromEntries(t.comments.map((n) => [n.id.split('/').pop(), n]));
  assert.equal(byRkey.b.likeUri, 'at://did:plc:me/app.bsky.feed.like/3lk');
  assert.equal(byRkey.b.myVote, 1);
  assert.equal(byRkey.c.likeUri, null);
  assert.equal(byRkey.c.myVote, 0);
});

test('a lens feed mirrors the feed result shape, guest perms locked down', () => {
  const f = shapeLensFeed(fixture('wide-getFeed'), SRC, { sort: 'lens' });
  assert.equal(f.posts.length, 3);
  assert.equal(f.scope, 'lens:whats-hot');
  for (const k of ['canPost', 'canComment', 'canVote', 'canModerate', 'canReport']) {
    assert.equal(f.perms[k], false, k);
  }
  assert.equal(f.perms.canView, true);
  assert.deepStrictEqual(LENS_PERMS.canCreateFeed, false);
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

const QSRC = { feedId: 'lens:q', feedSlug: 'q', feedTitle: 'Q' };
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
  // 3r: a quote is a cascade ENTRY — a threadViewPost plus its own quotes.
  // With nothing fetched below it, that is just { post }.
  const quotes = [
    { post: qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z') },
    { post: qPost('q2', 'did:plc:aa', '2026-08-25T09:00:00Z') }, // TIE with r1 at 09:00 — did:plc:aa equal, id decides
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

// ---- 3r: quote CASCADES — a quote of a quote of a quote ----
// A repost-with-comment can itself be quoted, and a quote can collect its own
// replies. The topic-centered view has to show that whole continuation, not
// just the first ring of quotes and not just replies to the root.

test('3r: a quote carries its own replies AND its own quotes, interleaved by the same rule', () => {
  const q1 = qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z');
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z'),
    replies: [{ post: qPost('r1', 'did:plc:aa', '2026-08-25T09:00:00Z'), replies: [] }],
  } };
  const t = shapeLensThread(threadResponse, QSRC, { quotes: [
    { post: q1,
      replies: [{ post: qPost('q1r1', 'did:plc:cc', '2026-08-25T12:00:00Z'), replies: [] }],
      quotes: [{ post: qPost('q1q1', 'did:plc:dd', '2026-08-25T11:00:00Z'),
        quotes: [{ post: qPost('q1q1q1', 'did:plc:ee', '2026-08-25T11:30:00Z') }] }] },
  ] });

  const quote = t.comments.find((c) => c.kind === 'quote');
  assert.equal(quote.id.split('/').pop(), 'q1');
  // its subtree interleaves a REPLY and a QUOTE-OF-THE-QUOTE by time
  assert.deepEqual(quote.children.map((c) => `${c.kind}:${c.id.split('/').pop()}`),
    ['quote:q1q1', 'reply:q1r1'], 'one ordering rule the whole way down: (createdTs, authorId, id)');
  // and the cascade keeps going — a quote of a quote of a quote
  assert.deepEqual(quote.children[0].children.map((c) => `${c.kind}:${c.id.split('/').pop()}`),
    ['quote:q1q1q1']);
  assert.equal(quote.children[0].children[0].depth, 2, 'depth counts the whole continuation');
  assert.equal(t.total, 5, 'every rendered node is counted: r1, q1, q1r1, q1q1, q1q1q1');
});

// ---- reply-embeds: a reply's embed is its CONTENT --------------------------
// Owner report, 2026-09-01: a wordless reply whose whole body was a quote of a
// picture post drew a byline over an empty row on forage.fyi. The thread's node
// shape copied a reply's words and dropped its media and its quoted post — the
// views never had them to decline. Pinned at the seam because both surfaces
// that draw a reply read this shape.
const RPIC = (alt) => ({ $type: 'app.bsky.embed.images#view',
  images: [{ thumb: 't.jpg', fullsize: 'f.jpg', alt, aspectRatio: { width: 4, height: 3 } }] });
const RQUOTING = (embeds) => ({ $type: 'app.bsky.embed.record#view',
  record: { $type: 'app.bsky.embed.record#viewRecord', uri: 'at://did:plc:zz/app.bsky.feed.post/orig', cid: 'cid-orig',
    author: { did: 'did:plc:zz', handle: 'zz.test', displayName: 'Zed' },
    value: { text: 'the quoted words' }, ...(embeds ? { embeds } : {}) } });

test('reply-embeds: a reply node carries its own media AND the post it quotes, hydrated', () => {
  const t = shapeLensThread({ thread: {
    post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z'),
    replies: [
      { post: qPost('pic', 'did:plc:aa', '2026-08-25T09:00:00Z', { embed: RPIC('a bog') }), replies: [] },
      { post: qPost('quo', 'did:plc:bb', '2026-08-25T10:00:00Z', { embed: RQUOTING([RPIC('inner')]) }), replies: [] },
      { post: qPost('bare', 'did:plc:cc', '2026-08-25T11:00:00Z'), replies: [] },
    ],
  } }, QSRC);
  const by = (k) => t.comments.find((c) => c.id.endsWith('/' + k));
  assert.equal(by('pic').media.kind, 'images');
  assert.equal(by('pic').media.items[0].alt, 'a bog');
  assert.equal(by('quo').quoted.uri, 'at://did:plc:zz/app.bsky.feed.post/orig');
  assert.equal(by('quo').quoted.media.kind, 'images',
    'the quoted post travels hydrated, media and all — the owner\'s report was exactly this shape');
  assert.equal('media' in by('bare'), false, 'a reply with no embed carries no media key');
  assert.equal('quoted' in by('bare'), false, 'and quotes nothing');
});

test('reply-embeds: a QUOTE node keeps its own media and drops the quoted card', () => {
  const t = shapeLensThread({ thread: {
    post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z'), replies: [],
  } }, QSRC, { quotes: [
    { post: qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z', { embed: RQUOTING() }) },
  ] });
  const q = t.comments.find((c) => c.kind === 'quote');
  assert.equal(q.quoted, undefined,
    'a quote node\'s target is the node directly above it — drawing a card of it would repeat the post the reader is on');
  const withPic = shapeLensThread({ thread: {
    post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z'), replies: [],
  } }, QSRC, { quotes: [
    { post: qPost('q2', 'did:plc:bb', '2026-08-25T10:00:00Z', { embed: { $type: 'app.bsky.embed.recordWithMedia#view',
      media: RPIC('the quoter\'s own picture'), record: { record: RQUOTING().record } } }) },
  ] }).comments.find((c) => c.kind === 'quote');
  assert.equal(withPic.media.items[0].alt, 'the quoter\'s own picture',
    'a quote with a picture OF ITS OWN still shows it — only the card for what it quotes is suppressed');
  assert.equal(withPic.quoted, undefined);
});

test('3r: the cascade is BOUNDED — past the cap a quote says how many it is not showing', async () => {
  const { QUOTE_CASCADE_DEPTH } = await import('../js/substrates/lens.js');
  assert.ok(QUOTE_CASCADE_DEPTH >= 1, 'there is a published cap, not an accidental one');

  // build a chain of quotes one level deeper than the cap allows
  let entry = { post: qPost('deepest', 'did:plc:zz', '2026-08-25T09:00:00Z') };
  for (let d = QUOTE_CASCADE_DEPTH; d >= 0; d -= 1) {
    entry = { post: qPost(`q${d}`, 'did:plc:aa', '2026-08-25T09:00:00Z'), quotes: [entry] };
  }
  const t = shapeLensThread({ thread: { post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z'), replies: [] } },
    QSRC, { quotes: [entry] });

  let node = t.comments[0];
  let depth = 0;
  while (node.children.length) { node = node.children[0]; depth += 1; }
  assert.equal(depth, QUOTE_CASCADE_DEPTH, 'the cascade stops at the cap');
  assert.equal(node.deferred, 1, 'and says plainly that one more quote exists below it');
});

test('3r: a blocked quoter takes their whole branch with them', () => {
  const posture = { blockedDids: new Set(['did:plc:bad']), mutedDids: new Set(), labelerDids: [], contentLabels: new Map(), mutedWords: [] };
  const t = shapeLensThread({ thread: { post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z'), replies: [] } },
    QSRC, { posture, quotes: [
      { post: qPost('bad', 'did:plc:bad', '2026-08-25T09:00:00Z'),
        quotes: [{ post: qPost('under', 'did:plc:ok', '2026-08-25T10:00:00Z') }] },
      { post: qPost('fine', 'did:plc:ok', '2026-08-25T11:00:00Z') },
    ] });
  assert.deepEqual(t.comments.map((c) => c.id.split('/').pop()), ['fine'],
    'the same rule replies already follow — a blocked node never renders, and neither does anything under it');
  assert.equal(t.total, 1);
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
  const t = shapeLensThread(threadResponse, QSRC, { quotes: [{ post: qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z') }] });
  assert.equal(t.comments.find((c) => c.kind === 'quote').depth, 0,
    'a quote OF THE POST is top-level — it answers the post, not a reply');

  // the wall marks quoted material. A reply gets the collapse gutter instead;
  // the two must never appear on the same node or the thread reads as if the
  // reply below belongs to the quote (observed 2026-08-26).
  assert.deepEqual(threadNodeStyle({ kind: 'quote', depth: 0 }), { kind: 'quote', walled: true });
  assert.deepEqual(threadNodeStyle({ kind: 'reply', depth: 0 }), { kind: 'reply', walled: false });
  assert.deepEqual(threadNodeStyle({ kind: 'reply', depth: 3 }), { kind: 'reply', walled: false });
  // 3r: a quote OF a quote is still quoted material, so it is still walled —
  // the wall marks the kind, never the position
  assert.deepEqual(threadNodeStyle({ kind: 'quote', depth: 2 }), { kind: 'quote', walled: true });
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
    // explicitly null, never absent: the quoted author here chose no display
    // name, and "no name" is a state the view reads, not a missing key
    authorName: null,
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

test('3r: thread() expands the cascade OPPORTUNISTICALLY — first paint never waits for it', async () => {
  const json = (d) => ({ ok: true, status: 200, json: async () => d });
  const calls = [];
  const uriOf = (p) => new URLSearchParams(p.split('?')[1] || '').get('uri') || '';
  const transport = async (path) => {
    calls.push(path);
    if (path.includes('getPostThread')) {
      const u = uriOf(path);
      if (u.endsWith('/root')) return json({ thread: { post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z', { quoteCount: 2 }), replies: [] } });
      // the quote's own replies
      return json({ thread: { post: qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z'),
        replies: [{ post: qPost('q1r1', 'did:plc:cc', '2026-08-25T12:00:00Z'), replies: [] }] } });
    }
    if (path.includes('getQuotes')) {
      const u = uriOf(path);
      if (u.endsWith('/root')) {
        return json({ posts: [
          qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z', { replyCount: 1, quoteCount: 1 }),
          qPost('q2', 'did:plc:dd', '2026-08-25T13:00:00Z'), // silent: no replies, no quotes
        ] });
      }
      return json({ posts: [qPost('q1q1', 'did:plc:ee', '2026-08-25T11:00:00Z')] });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me', fetchHandler: transport } });
  const painted = [];
  const first = await lens.thread('at://did:plc:op/app.bsky.feed.post/root', QSRC,
    { onCascade: (t) => painted.push(t) });

  // the first result is the CHEAP one — root thread + its quotes, nothing deeper
  assert.deepEqual(first.comments.map((c) => c.id.split('/').pop()), ['q1', 'q2']);
  assert.deepEqual(first.comments.map((c) => c.children.length), [0, 0]);

  await new Promise((r) => setTimeout(r, 30)); // let the cascade land
  assert.ok(painted.length >= 1, 'the cascade repaints rather than blocking the thread');
  const deep = painted.at(-1);
  const q1 = deep.comments.find((c) => c.id.endsWith('/q1'));
  assert.deepEqual(q1.children.map((c) => `${c.kind}:${c.id.split('/').pop()}`),
    ['quote:q1q1', 'reply:q1r1'], 'the quote grew its own replies AND its own quotes');

  // the budget: q2 announces no replies and no quotes, so we never ask about it
  assert.equal(calls.filter((c) => c.includes(encodeURIComponent('/q2'))).length, 0,
    'replyCount/quoteCount are the budget — a silent quote costs nothing');
});

test('3r: without onCascade, thread() makes exactly the two calls it always made', async () => {
  const json = (d) => ({ ok: true, status: 200, json: async () => d });
  const calls = [];
  const transport = async (path) => {
    calls.push(path);
    if (path.includes('getPostThread')) return json({ thread: { post: qPost('root', 'did:plc:op', '2026-08-25T08:00:00Z'), replies: [] } });
    return json({ posts: [qPost('q1', 'did:plc:bb', '2026-08-25T10:00:00Z', { replyCount: 5, quoteCount: 5 })] });
  };
  await createLens({ session: { did: 'did:plc:me', handle: 'me', fetchHandler: transport } })
    .thread('at://did:plc:op/app.bsky.feed.post/root', QSRC);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls.length, 2, 'the cascade is opt-in — no caller pays for it by accident');
});

// 3u: language rides on the shape, because filtering and annotating are both
// policy over it (see test/lang.test.js for what the API actually publishes).
test('3u: a post carries its declared langs; silence is an empty list, not a guess', () => {
  const withLang = qPost('l1', 'did:plc:a', '2026-08-26T00:00:00Z',
    { record: { text: 'chīsana', createdAt: '2026-08-26T00:00:00Z', langs: ['ja'] } });
  assert.deepEqual(shapeLensPost(withLang, QSRC).langs, ['ja']);
  assert.deepEqual(shapeLensPost(qPost('l2', 'did:plc:a', '2026-08-26T00:00:00Z'), QSRC).langs, [],
    'no langs in the record means we know nothing — never that it is English');
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

// ---- 3i (2026-09-03): the hoist stopped lying about what it hoisted --------
// The owner replied to their own image post and the reply rendered as the
// post's BODY: no name, no time, no permalink, no controls — and the head's
// Delete, the only control on that card, deleted the POST. Two counts said
// different things about the same reply ("1 reply" over "No replies").
//
// The heuristic itself is right and stays: it is the network's own rule,
// app.bsky.unspecced.defs#threadItemPost `opThread` — "a contiguous thread by
// the OP from the thread root" — shipped to every Bluesky user 2026-09-02.
// What was wrong is everything the shape threw away on the way out.

test('3i: the chain follows the OLDEST self-reply, not the order the appview returned', () => {
  // getPostThread RANKS replies; it does not return them oldest-first. The
  // network's rule is explicit about which one continues the thread
  // (packages/bsky/src/data-plane/server/op-thread.ts): "the oldest contiguous
  // line of OP replies from a thread root". Ranking put the LATER self-reply
  // first here, which is how a two-part post renders back to front.
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z'),
    replies: [
      { post: qPost('late', 'did:plc:op', '2026-09-03T11:00:00Z'), replies: [] },
      { post: qPost('first', 'did:plc:op', '2026-09-03T08:01:00Z'), replies: [] },
    ],
  } };
  const t = shapeLensThread(threadResponse, QSRC);
  assert.deepEqual(t.selfThread.map((s) => s.id.split('/').pop()), ['first'],
    'the oldest self-reply continues the post; the later one is a comment');
  assert.deepEqual(t.comments.map((c) => c.id.split('/').pop()), ['late'],
    'and the one that did not continue it is still listed, not swallowed');
});

test('3i: a hoisted part knows which part it is, counting the root as part 1', () => {
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z'),
    replies: [
      { post: qPost('p2', 'did:plc:op', '2026-09-03T08:01:00Z'),
        replies: [{ post: qPost('p3', 'did:plc:op', '2026-09-03T08:02:00Z'), replies: [] }] },
    ],
  } };
  const t = shapeLensThread(threadResponse, QSRC);
  assert.deepEqual(t.selfThread.map((s) => [s.part, s.parts]), [[2, 3], [3, 3]],
    'the badge the network renders: 2/3 then 3/3, the root being 1/3');
  assert.equal(t.parts, 3, 'and the thread says how many parts it has, root included');
});

test('3i: a post with no chain has no parts to number', () => {
  const t = shapeLensThread({ thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z'),
    replies: [{ post: qPost('r1', 'did:plc:aa', '2026-09-03T08:01:00Z'), replies: [] }],
  } }, QSRC);
  assert.deepEqual(t.selfThread, []);
  assert.equal(t.parts, 1, 'the post alone is one part, and a lone part is not a chain');
});

test('3i: a hoisted part carries what a control needs — its author, its time, its cid', () => {
  // Until now the shape was { uri, id, author, text, facets, media, quoted }.
  // A part drawn without a time and a cid cannot show when it was written,
  // cannot be replied to, and cannot delete ITSELF — which is how the head's
  // Delete came to be the only one on the card.
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z'),
    replies: [{ post: qPost('p2', 'did:plc:op', '2026-09-03T11:17:00Z'), replies: [] }],
  } };
  const [part] = shapeLensThread(threadResponse, QSRC).selfThread;
  assert.equal(part.authorId, 'did:plc:op', 'whose it is — a delete is authorized on the did');
  assert.equal(part.cid, 'cid-p2', 'a reply to a part needs its strongRef');
  assert.equal(part.createdTs, Date.parse('2026-09-03T11:17:00Z'),
    'when it was written — the owner\'s part landed 3h17m after the post');
});

test('3i: the head can no longer claim a reply the list does not show', () => {
  // The bug verbatim: replyCount said 1, the list said none. The appview's
  // replyCount counts the hoisted part; the list cannot. A thread now reports
  // the two numbers separately so a view has no way to print a contradiction.
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z', { replyCount: 1 }),
    replies: [{ post: qPost('p2', 'did:plc:op', '2026-09-03T11:17:00Z'), replies: [] }],
  } };
  const t = shapeLensThread(threadResponse, QSRC);
  assert.equal(t.comments.length, 0, 'nothing to list');
  assert.equal(t.replyCount, 0, 'so nothing is claimed — not the appview\'s 1');
  assert.equal(t.parts, 2, 'the reply is accounted for as the post\'s second part');
});

test('3i: a part goes through the SHAPER, so policy can reach it', () => {
  // The hoist read `chain.post.record.text` off the raw appview post, so it
  // was the one path in the thread that skipped shapeLensPost — and every
  // policy that hides a post lives there. `build()` shapes each node and drops
  // on p.hidden; the chain did not, so a muted or label-floored part rendered
  // its words in the post's BODY while the same post would vanish from a list.
  // Found 2026-09-03 against the ring scope on claude/ring-scope, where a
  // scoped-out author's words survived under a head that had been emptied.
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z'),
    replies: [{ post: qPost('p2', 'did:plc:op', '2026-09-03T08:01:00Z',
      { record: { text: 'a part nobody asked to read', createdAt: '2026-09-03T08:01:00Z' } }), replies: [] }],
  } };
  const posture = { blockedDids: new Set(), mutedDids: new Set(), labelPrefs: {},
    mutedWords: [{ value: 'nobody asked', targets: ['content'] }] };
  const t = shapeLensThread(threadResponse, QSRC, { posture });
  assert.deepEqual(t.selfThread, [], 'a part the reader has hidden is not the post\'s body either');
});

test('3i: a muted word takes ONE part, not the rest of the post', () => {
  // Parts share an author, so an author-level policy (ring, mute, block) hides
  // all of a chain or none of it. A muted WORD does not: it lives in one
  // part's text. Owner's rule is that parts 1, 2, 3 are ONE post, so a muted
  // paragraph is a hole in it, not an end to it.
  const chainOf = (...texts) => texts.reduceRight((kid, text, i) => ([{
    post: qPost(`p${i + 2}`, 'did:plc:op', `2026-09-03T08:0${i + 1}:00Z`,
      { record: { text, createdAt: `2026-09-03T08:0${i + 1}:00Z` } }),
    replies: kid,
  }]), [])[0];
  const t = shapeLensThread({ thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z'),
    replies: [chainOf('harmless', 'a spoiler lives here', 'also fine')],
  } }, QSRC, { posture: { blockedDids: new Set(), mutedDids: new Set(), labelPrefs: {},
    mutedWords: [{ value: 'spoiler', targets: ['content'] }] } });
  assert.deepEqual(t.selfThread.map((s) => s.text), ['harmless', 'also fine'],
    'the muted part is withheld and the walk goes on');
  assert.deepEqual(t.selfThread.map((s) => s.part), [2, 4],
    'and the numbers keep telling the truth — 3 is missing, not renumbered away');
  assert.equal(t.parts, 4, 'the post is still in four parts; the reader is seeing three');
});

test('3i: what hangs off a withheld part is not taken down with it', () => {
  // Other people's replies hang off the chain, and they are not the withheld
  // author's to remove — the same reasoning by which a reply under a blocked
  // author already survives.
  const t = shapeLensThread({ thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z'),
    replies: [{ post: qPost('p2', 'did:plc:op', '2026-09-03T08:01:00Z',
        { record: { text: 'hide me please', createdAt: '2026-09-03T08:01:00Z' } }),
      replies: [{ post: qPost('bystander', 'did:plc:bb', '2026-09-03T08:05:00Z'), replies: [] }] }],
  } }, QSRC, { posture: { blockedDids: new Set(), mutedDids: new Set(), labelPrefs: {},
    mutedWords: [{ value: 'hide me', targets: ['content'] }] } });
  assert.deepEqual(t.selfThread, [], 'the part is withheld');
  assert.deepEqual(t.comments.map((c) => c.id.split('/').pop()), ['bystander'],
    'and someone else\'s reply to it still stands, re-rooted');
});

test('3i: the author QUOTING their own post is a quote, never a part', () => {
  // Owner, 2026-09-03: "if a user reposts their own post with comments it's
  // now a repost style comment to be clear, not part of the post head."
  // A quote is a different act from a continuation: the author is talking
  // ABOUT the post, to a new audience, at a new moment — so it reads as a
  // response even when it is their own. The hoist only ever walks `replies`,
  // and this pins that the boundary is deliberate rather than incidental.
  const selfQuote = qPost('sq', 'did:plc:op', '2026-09-03T09:00:00Z', {
    embed: { $type: 'app.bsky.embed.record#view',
      record: { $type: 'app.bsky.embed.record#viewRecord',
        uri: 'at://did:plc:op/app.bsky.feed.post/root', cid: 'cid-root',
        author: { did: 'did:plc:op', handle: 'op.test' },
        value: { text: 'text root', createdAt: '2026-09-03T08:00:00Z' } } } });
  const t = shapeLensThread({ thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z', { quoteCount: 1 }),
    replies: [{ post: qPost('p2', 'did:plc:op', '2026-09-03T08:01:00Z'), replies: [] }],
  } }, QSRC, { quotes: [{ post: selfQuote, replies: [], quotes: [] }] });

  assert.deepEqual(t.selfThread.map((s) => s.id.split('/').pop()), ['p2'],
    'the REPLY continues the post');
  const quote = t.comments.find((c) => c.kind === 'quote');
  assert.ok(quote, 'and the self-quote is a comment, drawn as a quote');
  assert.equal(quote.id.split('/').pop(), 'sq');
  assert.equal(t.parts, 2, 'a self-quote adds no part to the post');
});

test('3i: replies to a hoisted part are counted where they are shown', () => {
  // A reply to a part re-roots as a top-level comment (it has nowhere else to
  // go once its parent became body). It must be counted there too, or the
  // count under-reports the way it used to over-report.
  const threadResponse = { thread: {
    post: qPost('root', 'did:plc:op', '2026-09-03T08:00:00Z', { replyCount: 2 }),
    replies: [
      { post: qPost('p2', 'did:plc:op', '2026-09-03T08:01:00Z'),
        replies: [{ post: qPost('under', 'did:plc:bb', '2026-09-03T08:05:00Z'), replies: [] }] },
      { post: qPost('r1', 'did:plc:aa', '2026-09-03T08:03:00Z'), replies: [] },
    ],
  } };
  const t = shapeLensThread(threadResponse, QSRC);
  assert.equal(t.replyCount, 2, 'the re-rooted reply and the ordinary one, both listed, both counted');
  assert.equal(t.replyCount, t.comments.length, 'the count IS the list, by construction');
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

// ---- board-cards Phase 5a: the shaper carries the embed's aspect ratio ----
// The media stage (decision 4) sizes its frame BEFORE the picture loads, so a
// board never jumps as images arrive. That is only possible if the ratio the
// PDS already sends (`aspectRatio {width,height}` on images#view and, when the
// uploader's client set it, on video#view) reaches the DOM. Absent, zero, or
// not-a-number reads as null — never NaN, never a coerced string.
const IMG = (extra) => ({ thumb: 'https://cdn/t.jpg', fullsize: 'https://cdn/f.jpg', alt: '', ...extra });
const shapeImages = (images) => shapeLensPost(qPost('asp', 'did:plc:a', '2026-08-26T00:00:00Z', {
  record: { text: 'x', createdAt: '2026-08-26T00:00:00Z' },
  embed: { $type: 'app.bsky.embed.images#view', images } }), QSRC).media;

test('5a: an image with aspectRatio shapes to aspect {w,h}; one without shapes to null', () => {
  const m = shapeImages([IMG({ aspectRatio: { width: 1600, height: 900 } }), IMG({})]);
  assert.deepEqual(m.items[0].aspect, { w: 1600, h: 900 });
  assert.equal(m.items[1].aspect, null, 'no aspectRatio on the embed → null, so the stage sizes on load');
});

test('5a: a zero or non-numeric aspectRatio is null, never NaN or a string', () => {
  const m = shapeImages([
    IMG({ aspectRatio: { width: 800, height: 0 } }),
    IMG({ aspectRatio: { width: '800', height: '600' } }), // seen on old records
    IMG({ aspectRatio: { width: 0, height: 600 } }),
  ]);
  assert.deepEqual(m.items.map((i) => i.aspect), [null, null, null]);
});

test('5a: the real fixtures carry the ratio through (D3)', () => {
  const feed = shapeLensFeed(fixture('wide-getFeed'), QSRC);
  const withMedia = feed.posts.filter((p) => p.media?.kind === 'images');
  assert.ok(withMedia.length > 0, 'the wide feed fixture has image posts');
  assert.ok(withMedia.every((p) => p.media.items.every((i) => i.aspect && i.aspect.w > 0 && i.aspect.h > 0)),
    'every image in the fixture reaches the DOM with its ratio');
});

test('5a: a video view shapes its aspect the same way (D2: no fixture carries one, so this is the fixture)', () => {
  const vid = (extra) => shapeLensPost(qPost('vid', 'did:plc:a', '2026-08-26T00:00:00Z', {
    record: { text: 'x', createdAt: '2026-08-26T00:00:00Z' },
    embed: { $type: 'app.bsky.embed.video#view', cid: 'bafy', playlist: 'https://v/p.m3u8', thumbnail: 'https://cdn/v.jpg', ...extra } }), QSRC).media;
  assert.deepEqual(vid({ aspectRatio: { width: 1080, height: 1920 } }).aspect, { w: 1080, h: 1920 });
  assert.equal(vid({}).aspect, null, 'a video with no ratio sizes from its thumbnail on load');
  assert.equal(vid({}).kind, 'video');
});

test('3i: image-only with NO alt falls back to a named placeholder title', () => {
  const p = shapeLensPost(qPost('img2', 'did:plc:a', '2026-08-26T00:00:00Z', {
    record: { text: '', createdAt: '2026-08-26T00:00:00Z' },
    embed: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: '' }] } }), QSRC);
  assert.equal(p.title, '[image]');
  // The placeholder is a FALLBACK name, not content — surfaces that render the
  // media itself (the card board) need to know they may drop it, and surfaces
  // that do not (compact, the thread head) that they must keep it. The shaper
  // says which it is; a view comparing strings to '[image]' would re-derive.
  assert.equal(p.placeholderTitle, true, 'the shaper marks a placeholder title');
});

test('3i: a real title — text or alt — is never marked as a placeholder', () => {
  const fromAlt = shapeLensPost(qPost('img3', 'did:plc:a', '2026-08-26T00:00:00Z', {
    record: { text: '', createdAt: '2026-08-26T00:00:00Z' },
    embed: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: 'a heron' }] } }), QSRC);
  assert.equal(fromAlt.title, 'a heron');
  assert.equal(fromAlt.placeholderTitle, undefined, 'an alt-derived title is real');

  const fromText = shapeLensPost(qPost('t1', 'did:plc:a', '2026-08-26T00:00:00Z', {
    record: { text: 'words', createdAt: '2026-08-26T00:00:00Z' },
    embed: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: '' }] } }), QSRC);
  assert.equal(fromText.placeholderTitle, undefined, 'a text title is real');
});

test('3i: video-only with no thumb text gets the placeholder mark too', () => {
  const p = shapeLensPost(qPost('v2', 'did:plc:a', '2026-08-26T00:00:00Z', {
    record: { text: '', createdAt: '2026-08-26T00:00:00Z' },
    embed: { $type: 'app.bsky.embed.video#view', thumbnail: 'https://cdn/vt.jpg', playlist: 'https://cdn/pl.m3u8' } }), QSRC);
  assert.equal(p.title, '[video]');
  assert.equal(p.placeholderTitle, true);
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
  // 4i: the card's TITLE is the only human name an external embed has, and the
  // view needs it — an <a> wrapping a decorative thumbnail has no accessible
  // name without it (link-name, SERIOUS, live on forage.fyi 2026-08-26). The
  // lexicon's app.bsky.embed.external#viewExternal carries uri/title/
  // description/thumb; the shaper was dropping title one layer before the view
  // asked for it, so the fix was reachable only by inventing a name.
  assert.equal(ext.media.title, 'X', 'the external card carries its title through');

  // A card with no title is legal on the wire. The shaper must say so plainly
  // rather than substituting the uri — naming the link is the VIEW's job, and
  // it needs to know the difference between "no title" and a title that
  // happens to look like a url.
  const untitled = shapeLensPost(qPost('e2', 'did:plc:a', '2026-08-26T00:00:00Z', {
    embed: { $type: 'app.bsky.embed.external#view', external: { uri: 'https://x.test/b', thumb: 'https://cdn/e2.jpg' } } }), QSRC);
  assert.equal(untitled.media.kind, 'external');
  assert.equal(untitled.media.title, null, 'absent title is null, never the uri');
});

// ---- plan 2026-08-29 post-and-thread, Phase 2a: avatars are real ----------
// The lens shaped `avatar` on profiles and feeds and never on a post or a
// thread node, so the byline could only draw initials. Both fields are on
// app.bsky.feed.defs#postView.author (profileViewBasic); the authed-thread
// fixture carries one.
test('2a: a post carries its author avatar, and null — never undefined — when the author has none', () => {
  const root = fixture('wide-authed-thread-liked').thread.post;
  assert.ok(root.author.avatar, 'fixture precondition: the root author has an avatar');
  assert.equal(shapeLensPost(root, SRC).avatar, root.author.avatar);
  const bare = { ...root, author: { did: root.author.did, handle: root.author.handle } };
  assert.strictEqual(shapeLensPost(bare, SRC).avatar, null);
});

test('2a: every thread node carries its own author avatar', () => {
  const root = fixture('wide-authed-thread-liked').thread.post;
  const reply = (id, avatar) => ({ post: {
    uri: `at://did:plc:${id}/app.bsky.feed.post/${id}`, cid: 'c' + id,
    author: { did: `did:plc:${id}`, handle: `${id}.test`, ...(avatar ? { avatar } : {}) },
    record: { text: 'r ' + id, createdAt: '2026-08-29T10:00:00Z' }, indexedAt: '2026-08-29T10:00:00Z',
    likeCount: 0, replyCount: 0,
  }, replies: [] });
  const t = shapeLensThread({ thread: { post: root, replies: [
    reply('aa', 'https://cdn.example/aa.jpg'), reply('bb', null),
  ] } }, SRC);
  assert.equal(t.post.avatar, root.author.avatar, 'the head keeps its picture');
  assert.deepEqual(t.comments.map((c) => c.avatar), ['https://cdn.example/aa.jpg', null]);
});

// ---- Phase 13 (plan 2026-08-29 post-and-thread, decision 10): a reply uri resolves ----
// /p?uri=<reply> used to open the reply as an orphan root. Now thread() notices
// the fetched head is itself a reply (record.reply.root), refetches from the
// ROOT, and returns focus = the reply — so the page is the whole thread, landed
// on that comment.
function threadTransport(map) {
  const calls = [];
  const transport = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const key = `${u.pathname.split('.').pop()}?${decodeURIComponent(u.searchParams.get('uri') || '')}`;
    const hit = map[key] ?? (u.pathname.endsWith('getQuotes') ? { posts: [] } : null);
    if (!hit) return { ok: false, status: 404, json: async () => ({ error: 'NotFound' }) };
    return { ok: true, status: 200, json: async () => hit };
  };
  return { transport, calls, threads: () => calls.filter((c) => c.includes('getPostThread')) };
}
const mkPost = (id, extra = {}) => ({ uri: `at://did:plc:a/app.bsky.feed.post/${id}`, cid: 'c' + id,
  author: { did: 'did:plc:a', handle: 'a.test' }, record: { text: id, createdAt: '2026-08-29T10:00:00Z', ...extra },
  indexedAt: '2026-08-29T10:00:00Z', likeCount: 0, replyCount: 0 });
const ROOT = 'at://did:plc:a/app.bsky.feed.post/root';
const REPLY = 'at://did:plc:a/app.bsky.feed.post/reply';
const DEEP = 'at://did:plc:a/app.bsky.feed.post/deep';
const ref = (uri) => ({ uri, cid: 'c' + uri.split('/').pop() });
const rootThread = { thread: { post: mkPost('root'), replies: [
  { post: mkPost('reply', { reply: { root: ref(ROOT), parent: ref(ROOT) } }), replies: [
    { post: mkPost('deep', { reply: { root: ref(ROOT), parent: ref(REPLY) } }), replies: [] } ] } ] } };

test('13: a root uri is ONE getPostThread and no focus', async () => {
  const { transport, threads } = threadTransport({ [`getPostThread?${ROOT}`]: rootThread });
  const t = await createLens({ transport }).thread(ROOT, SRC);
  assert.equal(threads().length, 1);
  assert.equal(t.focus, undefined);
  assert.equal(t.post.id, ROOT);
});

test('13: a depth-1 reply uri refetches from root and focuses the reply', async () => {
  const { transport, threads } = threadTransport({
    [`getPostThread?${REPLY}`]: { thread: { post: rootThread.thread.replies[0].post, replies: [] } },
    [`getPostThread?${ROOT}`]: rootThread,
  });
  const t = await createLens({ transport }).thread(REPLY, SRC);
  assert.equal(threads().length, 2, 'the reply, then its root');
  assert.ok(threads()[1].includes(encodeURIComponent(ROOT)), 'the second fetch is the ROOT');
  assert.equal(t.post.id, ROOT, 'the page is the whole thread');
  assert.equal(t.focus, REPLY);
});

test('13: a depth-2 reply refetches the ROOT, not its parent', async () => {
  const { transport, threads } = threadTransport({
    [`getPostThread?${DEEP}`]: { thread: { post: rootThread.thread.replies[0].replies[0].post, replies: [] } },
    [`getPostThread?${ROOT}`]: rootThread,
  });
  const t = await createLens({ transport }).thread(DEEP, SRC);
  assert.equal(threads().length, 2);
  assert.ok(threads()[1].includes(encodeURIComponent(ROOT)) && !threads()[1].includes(encodeURIComponent(REPLY)));
  assert.equal(t.focus, DEEP);
});

test('13: the root fetch failing names the root uri, never a blank page', async () => {
  const { transport } = threadTransport({
    [`getPostThread?${REPLY}`]: { thread: { post: rootThread.thread.replies[0].post, replies: [] } },
  });
  await assert.rejects(() => createLens({ transport }).thread(REPLY, SRC), (e) => e.message.includes('root') && e.message.includes('404'));
});

// quote-embed (owner, 2026-09-01, against
// at://did:plc:wwdyx35lrdd23ruchgfsyl25/app.bsky.feed.post/3muhq4vkfes2r): a
// quote of a VIDEO post rendered as words alone — the feed row showed nothing
// of the quoted post and the post page showed its text with no video. The
// AppView hands the whole thing over: #viewRecord carries `embeds[]`, already
// hydrated (`app.bsky.embed.video#view` with playlist, thumbnail and
// aspectRatio), and the lens was dropping it on the floor.
const quoting = (record) => qPost('quoter', 'did:plc:aa', '2026-09-01T15:25:00Z', {
  embed: { $type: 'app.bsky.embed.record#view', record },
});
const viewRecord = (extra = {}) => ({
  $type: 'app.bsky.embed.record#viewRecord',
  uri: 'at://did:plc:orig/app.bsky.feed.post/orig1', cid: 'oc',
  author: { did: 'did:plc:orig', handle: 'orig.test' },
  value: { text: 'the original words', createdAt: '2026-09-01T14:50:00Z' },
  ...extra,
});

test('quote-embed: the quoted post’s video comes through as quoted.media', () => {
  const p = shapeLensPost(quoting(viewRecord({ embeds: [
    { $type: 'app.bsky.embed.video#view', cid: 'vc', playlist: 'https://video/pl.m3u8',
      thumbnail: 'https://video/t.jpg', aspectRatio: { width: 1280, height: 720 } },
  ] })), QSRC);
  assert.deepEqual(p.quoted.media, {
    kind: 'video', thumb: 'https://video/t.jpg', playlist: 'https://video/pl.m3u8',
    aspect: { w: 1280, h: 720 },
  });
});

test('quote-embed: pictures and link cards come through the same door', () => {
  const pics = shapeLensPost(quoting(viewRecord({ embeds: [
    { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: 'a bog' }] },
  ] })), QSRC);
  assert.equal(pics.quoted.media.kind, 'images');
  assert.equal(pics.quoted.media.items[0].alt, 'a bog');

  const ext = shapeLensPost(quoting(viewRecord({ embeds: [
    { $type: 'app.bsky.embed.external#view', external: { uri: 'https://x.test/a', title: 'X', thumb: 'https://cdn/e.jpg' } },
  ] })), QSRC);
  assert.equal(ext.quoted.media.kind, 'external');
  assert.equal(ext.quoted.media.uri, 'https://x.test/a');
});

test('quote-embed: a quoted post that itself quotes-with-media gives up its media half', () => {
  const p = shapeLensPost(quoting(viewRecord({ embeds: [
    { $type: 'app.bsky.embed.recordWithMedia#view',
      media: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 't', fullsize: 'f', alt: 'inner' }] },
      record: { record: viewRecord() } },
  ] })), QSRC);
  assert.equal(p.quoted.media.kind, 'images');
  assert.equal(p.quoted.media.items[0].alt, 'inner');
});

test('quote-embed: a quoted post with no embed carries no media key at all', () => {
  const p = shapeLensPost(quoting(viewRecord()), QSRC);
  assert.equal('media' in p.quoted, false);
  assert.equal(p.quoted.excerpt, 'the original words');
});

// A quote whose target is gone is a REAL state the feed now renders, so it has
// to say so in words. Before this the shaper keyed only on `uri` — which
// #viewNotFound, #viewBlocked and #viewDetached all carry — and produced a card
// reading "[unknown]" over an empty excerpt. On the post page that was one bad
// card; in the feed row it is one on every such post.
test('quote-embed: notFound, blocked and detached are named, not drawn as an empty card', () => {
  const cases = [
    [{ $type: 'app.bsky.embed.record#viewNotFound', uri: 'at://x/y/z', notFound: true }, 'notFound'],
    [{ $type: 'app.bsky.embed.record#viewBlocked', uri: 'at://x/y/z', blocked: true, author: { did: 'did:plc:b' } }, 'blocked'],
    [{ $type: 'app.bsky.embed.record#viewDetached', uri: 'at://x/y/z', detached: true }, 'detached'],
  ];
  for (const [record, why] of cases) {
    const p = shapeLensPost(quoting(record), QSRC);
    assert.equal(p.quoted.unavailable, why, `${why} should say so`);
    assert.equal(p.quoted.uri, 'at://x/y/z');
    assert.equal('excerpt' in p.quoted, false, `${why} has no words to excerpt`);
  }
});

// A quote of a FEED, a LIST or a starter pack is not a quote of a post: those
// views carry a uri and no `value`, and the old check let them through as a
// post card with an empty excerpt.
test('quote-embed: an embedded feed generator is not treated as a quoted post', () => {
  const p = shapeLensPost(quoting({ $type: 'app.bsky.feed.defs#generatorView',
    uri: 'at://x/app.bsky.feed.generator/g', displayName: 'Discover', creator: { handle: 'bsky.app' } }), QSRC);
  assert.equal(p.quoted, undefined);
});

// quote-embed (owner, 2026-09-01, on the v1 mock's § A frame): "the name in the
// quote box … should be the human readable alias name". Every other byline in
// the app names people by the name they chose and keeps the handle for the
// tooltip and the accessible name (feed-row v2, js/ui/components.js whoNode);
// the quote card was the one surface printing a raw handle at people. The null
// is feed-row v2's rule too — a blank display name is NOT a name, so the view
// falls back to the handle instead of printing nothing.
test('quote-embed: the quoted author carries the name they chose, null when they have none', () => {
  const named = shapeLensPost(quoting(viewRecord({
    author: { did: 'did:plc:orig', handle: 'orig.test', displayName: 'The Frost Warning' } })), QSRC);
  assert.equal(named.quoted.authorName, 'The Frost Warning');
  assert.equal(named.quoted.author, 'orig.test', 'the handle stays: it is the identity, the name is the label');

  for (const author of [
    { did: 'did:plc:orig', handle: 'orig.test' },                  // never set one
    { did: 'did:plc:orig', handle: 'orig.test', displayName: '' }, // set it to nothing
    { did: 'did:plc:orig', handle: 'orig.test', displayName: '   ' }, // set it to whitespace
  ]) {
    const p = shapeLensPost(quoting(viewRecord({ author })), QSRC);
    assert.equal(p.quoted.authorName, null, `${JSON.stringify(author.displayName)} is not a name`);
  }
});

// ---- gif-embeds phase 1: a GIF is its own kind ----------------------------
// Bluesky's GIF button attaches the animation as an ordinary external embed,
// so the lens drew a frozen JPEG with a link out (owner, 2026-09-02, on two
// klipy posts). The kind is decided in mediaOf — the ONE door every surface
// comes through — so a feed row, a reply node and a QUOTED post all inherit it.
const KLIPY_GIF = 'https://static.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/61/56/RiZHW3kybKsT6j.gif?hh=415&ww=498&mp4=8pcPaPB1Eow6fc&webm=0Ds0ULMJw0vWjEZ6NMLN';

const extPost = (rkey, external) => qPost(rkey, 'did:plc:a', '2026-09-02T00:00:00Z', {
  embed: { $type: 'app.bsky.embed.external#view', external } });

test('gif-embeds: a klipy external embed shapes as kind "gif", carrying what plays', () => {
  const p = shapeLensPost(extPost('g1', { uri: KLIPY_GIF, title: 'Warrior Nun Ava Running Through Water',
    description: 'ALT: Warrior Nun Ava Running Through Water', thumb: 'https://cdn/gt.jpg' }), QSRC);
  assert.equal(p.media.kind, 'gif', 'not "external" — a still card cannot be made to move');
  assert.equal(p.media.player, 'video');
  assert.deepEqual(p.media.aspect, { w: 498, h: 415 }, 'hh/ww size the stage before anything loads');
  assert.deepEqual(p.media.sources.map((s) => s.type), ['video/webm', 'video/mp4']);
  // the card keeps its identity (D8): the owner asked for a player, not for the
  // card to lose its name
  assert.equal(p.media.uri, KLIPY_GIF);
  assert.equal(p.media.title, 'Warrior Nun Ava Running Through Water');
  assert.equal(p.media.thumb, 'https://cdn/gt.jpg', 'the poster, and the paused frame');
  // the ALT: prefix is parsed HERE so no view has to know about Bluesky's hack
  assert.equal(p.media.alt, 'Warrior Nun Ava Running Through Water');
  assert.equal(p.media.altAuthored, false, 'all-caps ALT: = auto-filled from the title');
  assert.equal(p.format, 'link', 'still a link post — only the media changed');
});

test('gif-embeds: "Alt:" marks alt a person actually wrote', () => {
  const p = shapeLensPost(extPost('g2', { uri: KLIPY_GIF, title: 'Give Up Im Done',
    description: 'Alt: a woman collapsing dramatically onto a sofa', thumb: 'https://cdn/g2.jpg' }), QSRC);
  assert.equal(p.media.alt, 'a woman collapsing dramatically onto a sofa');
  assert.equal(p.media.altAuthored, true);
});

test('gif-embeds: a .gif with no verified video form plays as an image on its own uri', () => {
  // giphy: no probed video rewrite, so the record's own uri animates. klipy
  // and tenor both have one (js/gif.js) and take the cheaper rung.
  const uri = 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif';
  const p = shapeLensPost(extPost('g3', { uri, title: 'T', description: '', thumb: 'https://cdn/g3.jpg' }), QSRC);
  assert.equal(p.media.kind, 'gif');
  assert.equal(p.media.player, 'image');
  assert.equal(p.media.src, uri, 'the record\'s own uri — nothing constructed (External APIs)');
  assert.equal(p.media.aspect, null);
  assert.equal(p.media.sources, undefined);
});

test('gif-embeds: an ordinary link card is untouched', () => {
  const p = shapeLensPost(extPost('g4', { uri: 'https://www.videogameschronicle.com/news/a/',
    title: 'Sony says a thing', description: 'The publisher confirmed on Tuesday…', thumb: 'https://cdn/n.jpg' }), QSRC);
  assert.equal(p.media.kind, 'external');
  assert.equal(p.media.description, 'The publisher confirmed on Tuesday…',
    'og:description is page content, never governed by the alt-text setting');
  assert.equal(p.media.alt, undefined, 'a link card has no alt to hide');
});

test('gif-embeds: a GIF a post QUOTES comes out the same door', () => {
  const p = shapeLensPost(qPost('g5', 'did:plc:a', '2026-09-02T00:00:00Z', {
    embed: { $type: 'app.bsky.embed.record#view', record: {
      $type: 'app.bsky.embed.record#viewRecord', uri: 'at://did:plc:b/app.bsky.feed.post/q1',
      author: { handle: 'b.test' }, value: { text: 'quoted words' },
      embeds: [{ $type: 'app.bsky.embed.external#view', external: {
        uri: KLIPY_GIF, title: 'W', description: 'ALT: W', thumb: 'https://cdn/qg.jpg' } }] } } }), QSRC);
  assert.equal(p.quoted.media.kind, 'gif');
  assert.equal(p.quoted.media.player, 'video');
});

// ---- the self-thread continuation carries its embeds --------------------
// Found 2026-09-02 while building gif-embeds: forage hoists an unbroken
// same-author reply chain into the head as the post's BODY (forum shape), but
// the shape it built was { uri, text, facets } — no media, no quote. So an
// author who answered their own post with a picture, a clip, a link card or a
// GIF had the words rendered and the embed silently dropped.
//
// Same family as the quote-embed drop fixed 2026-09-01 ("a quote of a video
// read as words alone"), and the same fix: everything comes out mediaOf's one
// door, including the parts that get hoisted.
const selfKlipy = 'https://static.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/61/56/RiZHW3kybKsT6j.gif?hh=415&ww=498&mp4=8pcPaPB1Eow6fc&webm=0Ds0ULMJw0vWjEZ6NMLN';

// the author replying to themselves, 1/3 -> 2/3 -> 3/3, each part carrying
// something the old shape threw away
// threads shape through .thread(), which fetches; a minimal transport that
// answers getPostThread and an empty getQuotes is all this needs
const selfThreadOf = async (threadPayload) => {
  const transport = async (path) => {
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (path.includes('getPostThread')) return json(threadPayload);
    if (path.includes('getQuotes')) return json({ posts: [] });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return createLens({ session: { did: 'did:plc:me', handle: 'me', fetchHandler: transport } })
    .thread('at://did:plc:op/app.bsky.feed.post/root', QSRC);
};

const selfThreadResponse = () => ({ thread: {
  post: qPost('root', 'did:plc:op', '2026-09-02T08:00:00Z'),
  replies: [
    { post: qPost('p2', 'did:plc:op', '2026-09-02T08:01:00Z', {
        embed: { $type: 'app.bsky.embed.images#view',
          images: [{ thumb: 'https://cdn/t.jpg', fullsize: 'https://cdn/f.jpg', alt: 'a chart',
            aspectRatio: { width: 1600, height: 900 } }] } }),
      replies: [
        { post: qPost('p3', 'did:plc:op', '2026-09-02T08:02:00Z', {
            embed: { $type: 'app.bsky.embed.external#view',
              external: { uri: selfKlipy, title: 'W', description: 'ALT: W', thumb: 'https://cdn/g.jpg' } } }),
          replies: [] },
        // a reply by someone ELSE under a hoisted part re-roots as a comment
        { post: qPost('other', 'did:plc:bb', '2026-09-02T08:03:00Z'), replies: [] },
      ] },
  ] } });

test('self-thread: a hoisted part keeps its picture, and its GIF', async () => {
  const t = await selfThreadOf(selfThreadResponse());
  assert.equal(t.selfThread.length, 2, 'both parts of the chain hoist');

  const [p2, p3] = t.selfThread;
  assert.equal(p2.media?.kind, 'images', 'part 2 carried a picture and it survives');
  assert.equal(p2.media.items[0].alt, 'a chart');
  assert.deepEqual(p2.media.items[0].aspect, { w: 1600, h: 900 },
    'with the ratio, so the stage is sized before it loads');

  assert.equal(p3.media?.kind, 'gif', 'part 3 carried a GIF and it survives');
  assert.equal(p3.media.player, 'video');

  // the words are untouched — this adds to the shape, it does not replace it
  assert.equal(p2.text, 'text p2');
  assert.ok(Array.isArray(p2.facets));
});

test('self-thread: a hoisted part carries who and where, so its media can link out', async () => {
  // mediaNode builds a bsky.app link for a video from `author` + `id`; a part
  // with neither would render a link to "undefined/post/undefined".
  const t = await selfThreadOf(selfThreadResponse());
  const [p2] = t.selfThread;
  assert.equal(p2.author, 'op.test');
  assert.equal(p2.id, 'at://did:plc:op/app.bsky.feed.post/p2');
});

test('self-thread: a hoisted part keeps what it QUOTES too', async () => {
  const t = await selfThreadOf({ thread: {
    post: qPost('root', 'did:plc:op', '2026-09-02T08:00:00Z'),
    replies: [{ post: qPost('p2', 'did:plc:op', '2026-09-02T08:01:00Z', {
      embed: { $type: 'app.bsky.embed.record#view', record: {
        $type: 'app.bsky.embed.record#viewRecord', uri: 'at://did:plc:q/app.bsky.feed.post/q1',
        author: { handle: 'q.test' }, value: { text: 'the quoted words' } } } }), replies: [] }] } });
  assert.equal(t.selfThread[0].quoted?.excerpt, 'the quoted words',
    'a self-thread part that quotes somebody still shows who');
});

test('self-thread: a part with no embed is unchanged — media is absent, not null-shaped', async () => {
  const t = await selfThreadOf({ thread: {
    post: qPost('root', 'did:plc:op', '2026-09-02T08:00:00Z'),
    replies: [{ post: qPost('p2', 'did:plc:op', '2026-09-02T08:01:00Z'), replies: [] }] } });
  assert.equal(t.selfThread[0].media, undefined);
  assert.equal(t.selfThread[0].quoted, undefined,
    'absent, like the head\'s — the view checks truthiness, and a null-shaped quote would render an empty card');
});
