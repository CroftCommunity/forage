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
