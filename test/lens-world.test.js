// The World rung's board.
//
// World is the widest rung and it was the only one with NO implementation:
// `ringFeed('world')` threw by design, because in the old dial World was the
// dial's OFF position rather than a query — its "board" was the sources page.
// Under the ladder it is a rung like any other and has to render something.
//
// What it renders follows from what World MEANS (plan 2026-08-26-4, Revision
// 2, owner): not the firehose, but everything in the composition you have
// assembled, unsqueezed. Today that composition is your timeline plus the
// feeds you have saved. So the board is those sources merged — the same
// fan-out shape the member rungs use, over sources instead of authors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLens } from '../js/substrates/lens.js';

const mkPost = (rkey, did, ts) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did, handle: `${did.split(':').pop()}.test` },
  record: { text: rkey, createdAt: ts }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: 1,
});
const json = (d) => ({ ok: true, status: 200, json: async () => d });

const PREFS = {
  preferences: [{
    $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
    items: [
      { id: '1', type: 'feed', value: 'at://did:plc:gen/app.bsky.feed.generator/alpha', pinned: true },
      { id: '2', type: 'feed', value: 'at://did:plc:gen/app.bsky.feed.generator/beta', pinned: false },
    ],
  }],
};

const worldSession = (over = {}) => {
  const calls = [];
  return { calls, session: {
    did: 'did:plc:me', handle: 'me.test',
    fetchHandler: async (path) => {
      calls.push(path);
      if (path.includes('getPreferences')) return json(PREFS);
      if (path.includes('getFeedGenerators')) return json({ feeds: [] });
      if (over.on) { const r = over.on(path); if (r !== undefined) return r; }
      if (path.includes('getTimeline')) return json({ feed: [{ post: mkPost('t1', 'did:plc:tl', '2026-08-28T12:00:00Z') }] });
      if (path.includes('alpha')) return json({ feed: [{ post: mkPost('a1', 'did:plc:aa', '2026-08-28T13:00:00Z') }] });
      if (path.includes('beta')) return json({ feed: [{ post: mkPost('b1', 'did:plc:bb', '2026-08-28T11:00:00Z') }] });
      return json({ feed: [] });
    },
  } };
};

test('World merges the composition — your timeline and every feed you saved', async () => {
  const { session } = worldSession();
  const board = await createLens({ session }).ringFeed('world');
  assert.deepEqual(board.posts.map((p) => p.id.split('/').pop()), ['a1', 't1', 'b1'],
    'newest first across all three sources, not grouped by source');
  assert.equal(board.ring, 'world');
  assert.deepEqual(board.failures, []);
});

test('World is not the firehose — it draws ONLY the composition', async () => {
  const { session, calls } = worldSession();
  await createLens({ session }).ringFeed('world');
  assert.ok(calls.some((c) => c.includes('getTimeline')), 'the timeline is in it');
  assert.ok(calls.some((c) => c.includes('alpha')) && calls.some((c) => c.includes('beta')), 'saved feeds are in it');
  assert.ok(!calls.some((c) => c.includes('searchPosts') || c.includes('getPopular')),
    'nothing global is fetched — the composition IS the boundary');
});

test('one dead source is reported, never fatal — the rest of the board still paints', async () => {
  const { session } = worldSession({ on: (p) => (p.includes('beta') ? { ok: false, status: 502, json: async () => ({}) } : undefined) });
  const board = await createLens({ session }).ringFeed('world');
  assert.deepEqual(board.posts.map((p) => p.id.split('/').pop()), ['a1', 't1']);
  assert.equal(board.failures.length, 1, 'the dead source is named, not swallowed');
  assert.match(board.failures[0], /beta/);
});

test('a composition of nothing is an empty board with no failures, not an error', async () => {
  const calls = [];
  const session = { did: 'did:plc:me', handle: 'me.test', fetchHandler: async (path) => {
    calls.push(path);
    if (path.includes('getPreferences')) return json({ preferences: [] });
    if (path.includes('getFeedGenerators')) return json({ feeds: [] });
    return json({ feed: [] });
  } };
  const board = await createLens({ session }).ringFeed('world');
  assert.deepEqual(board.posts, []);
  assert.deepEqual(board.failures, []);
});

test('World needs a session, because a composition is yours', async () => {
  await assert.rejects(() => createLens({}).ringFeed('world'), /session/i);
});

test('World weaves in your subscribed hashtags alongside feeds and the timeline', async () => {
  const { session, calls } = worldSession({ on: (p) =>
    (p.includes('searchPosts') ? json({ posts: [mkPost('h1', 'did:plc:hh', '2026-08-28T14:00:00Z')] }) : undefined) });
  const board = await createLens({ session }).ringFeed('world', { tags: ['harvest'] });
  assert.deepEqual(board.posts.map((p) => p.id.split('/').pop()), ['h1', 'a1', 't1', 'b1'],
    'the hashtag post interleaves by time like any other source, not appended in a clump');
  assert.ok(calls.some((c) => c.includes('tag=harvest')), 'it asked for the tag it was given');
});

test('a hashtag subscription is not read from storage by the substrate — it is passed in', async () => {
  const { session, calls } = worldSession();
  await createLens({ session }).ringFeed('world');   // no tags argument
  assert.ok(!calls.some((c) => c.includes('searchPosts')),
    'no tags passed means no hashtag fetch: the substrate has no opinion about what you subscribe to');
});
