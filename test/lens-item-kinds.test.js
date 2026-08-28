// Ring-board kind tabs (plan 2026-08-28-1): an author-feed item is an ENVELOPE
// — { post, reply?, reason? } — and shaping used to read only item.post, so a
// reply rendered as a post with its conversation unreachable and a repost
// rendered as a post BY its original author. feedItemMeta is the pure
// classification; shapeLensFeed spreads it onto every shaped post.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedItemMeta, shapeLensFeed } from '../js/substrates/lens.js';

const SRC = { feedId: 'lens:ring:me', feedSlug: 'ring:me', feedTitle: 'Just me' };

const mkPost = (over = {}) => ({
  uri: 'at://did:plc:me/app.bsky.feed.post/p1', cid: 'cid-p1',
  author: { did: 'did:plc:me', handle: 'me.test' },
  record: { text: 'hello', createdAt: '2026-08-28T10:00:00Z' },
  indexedAt: '2026-08-28T10:00:00Z', replyCount: 0, likeCount: 0,
  ...over,
});

const PARENT_VIEW = {
  $type: 'app.bsky.feed.defs#postView',
  uri: 'at://did:plc:aa/app.bsky.feed.post/parent1', cid: 'cid-parent1',
  author: { did: 'did:plc:aa', handle: 'aa.test' },
  record: { text: 'the comment being replied to', createdAt: '2026-08-28T09:00:00Z' },
};

test('a bare item is a post — no reply target, no repost byline', () => {
  assert.deepEqual(feedItemMeta({ post: mkPost() }), { itemKind: 'post' });
});

test('a reasonRepost item is a repost, and says who reposted it', () => {
  const meta = feedItemMeta({ post: mkPost(), reason: {
    $type: 'app.bsky.feed.defs#reasonRepost',
    by: { did: 'did:plc:me', handle: 'me.test' }, indexedAt: '2026-08-28T12:00:00Z',
  } });
  assert.equal(meta.itemKind, 'repost');
  assert.equal(meta.repostBy, 'me.test');
});

test('a reply item carries its parent: uri to link, author and excerpt to say who', () => {
  const meta = feedItemMeta({ post: mkPost(), reply: { root: PARENT_VIEW, parent: PARENT_VIEW } });
  assert.equal(meta.itemKind, 'reply');
  assert.deepEqual(meta.replyTo, {
    uri: PARENT_VIEW.uri, author: 'aa.test',
    excerpt: 'the comment being replied to',
  });
});

test('a parent that is notFound/blocked still links by uri — no author, no excerpt', () => {
  const meta = feedItemMeta({ post: mkPost(), reply: {
    parent: { $type: 'app.bsky.feed.defs#notFoundPost', uri: PARENT_VIEW.uri, notFound: true },
  } });
  assert.equal(meta.itemKind, 'reply');
  assert.deepEqual(meta.replyTo, { uri: PARENT_VIEW.uri, author: null, excerpt: '' });
});

test('a bare post whose RECORD says reply classifies as one (search-style wrapping)', () => {
  const meta = feedItemMeta({ post: mkPost({ record: {
    text: 'answering', createdAt: '2026-08-28T10:00:00Z',
    reply: { root: { uri: PARENT_VIEW.uri, cid: 'x' }, parent: { uri: PARENT_VIEW.uri, cid: 'x' } },
  } }) });
  assert.equal(meta.itemKind, 'reply');
  assert.deepEqual(meta.replyTo, { uri: PARENT_VIEW.uri, author: null, excerpt: '' });
});

test('a long parent is excerpted, never dumped whole', () => {
  const long = 'x'.repeat(500);
  const meta = feedItemMeta({ post: mkPost(), reply: {
    parent: { ...PARENT_VIEW, record: { text: long } },
  } });
  assert.ok(meta.replyTo.excerpt.length <= 200, `got ${meta.replyTo.excerpt.length}`);
});

test('shapeLensFeed spreads the meta onto every shaped post', () => {
  const feed = { feed: [
    { post: mkPost() },
    { post: mkPost({ uri: 'at://did:plc:me/app.bsky.feed.post/p2' }),
      reply: { parent: PARENT_VIEW } },
    { post: mkPost({ uri: 'at://did:plc:aa/app.bsky.feed.post/orig1',
      author: { did: 'did:plc:aa', handle: 'aa.test' } }),
      reason: { $type: 'app.bsky.feed.defs#reasonRepost',
        by: { did: 'did:plc:me', handle: 'me.test' }, indexedAt: '2026-08-28T12:00:00Z' } },
  ] };
  const shaped = shapeLensFeed(feed, SRC);
  assert.deepEqual(shaped.posts.map((p) => p.itemKind), ['post', 'reply', 'repost']);
  assert.equal(shaped.posts[1].replyTo.uri, PARENT_VIEW.uri);
  assert.equal(shaped.posts[2].repostBy, 'me.test');
});
