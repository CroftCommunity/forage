// lens.reel() — the people-scope reel (plan 2026-09-14-plan-clips, D1 (a)):
// the scope's members are the source list; each is asked for its author feed
// with the mode's filter, a wave at a time; the answers are dealt round-robin
// across people so one prolific poster does not own the reel; the result is
// feed-shaped so the board's More and repaint need nothing new.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLens } from '../js/substrates/lens.js';

const ME = 'did:plc:me';
const clipPost = (did, rkey) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`,
  author: { did, handle: `${did.split(':').pop()}.test` },
  record: { text: `clip ${rkey}`, createdAt: '2026-09-08T10:00:00Z' }, indexedAt: '2026-09-08T10:00:00Z',
  likeCount: 1, replyCount: 0, repostCount: 0,
  embed: { $type: 'app.bsky.embed.video#view', cid: `v-${rkey}`, playlist: `https://video.cdn.test/${rkey}/p.m3u8`, aspectRatio: { width: 9, height: 16 } },
});
const textPost = (did, rkey) => ({ ...clipPost(did, rkey), embed: undefined });
const page = (posts, cursor) => ({ feed: posts.map((p) => ({ post: p })), ...(cursor ? { cursor } : {}) });

const MOD = {
  'app.bsky.actor.getPreferences': { preferences: [] },
  'app.bsky.graph.getMutes': { mutes: [] }, 'app.bsky.graph.getBlocks': { blocks: [] },
  'app.bsky.graph.getListMutes': { lists: [] }, 'app.bsky.graph.getListBlocks': { lists: [] },
};
function reelSession(authorFeeds, graph) {
  const calls = [];
  const fetchHandler = async (path) => {
    const u = new URL('http://x' + path);
    const name = u.pathname.split('/').pop();
    const q = Object.fromEntries(u.searchParams);
    calls.push({ name, q });
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    if (name === 'app.bsky.graph.getFollows') return ok({ follows: graph.follows.map((did) => ({ did })) });
    if (name === 'app.bsky.graph.getFollowers') return ok({ followers: graph.followers.map((did) => ({ did })) });
    if (name === 'app.bsky.feed.getAuthorFeed') {
      const r = authorFeeds[q.actor];
      if (r === 'hang') return new Promise(() => {});
      if (r instanceof Error) throw r;
      return ok(typeof r === 'function' ? r(q) : (r || page([])));
    }
    if (MOD[name]) return ok(MOD[name]);
    return { ok: false, status: 404, json: async () => ({ error: 'NotFound' }) };
  };
  return { session: { did: ME, handle: 'me.test', fetchHandler }, calls };
}
const GRAPH = { follows: ['did:plc:a', 'did:plc:b', 'did:plc:c', 'did:plc:d'], followers: ['did:plc:a', 'did:plc:b'] };

test('world is refused — the board itself is the source there', async () => {
  const { session } = reelSession({}, GRAPH);
  await assert.rejects(createLens({ session }).reel('clip', 'world'), /world/);
});

// Every rung contains ME (js/rings.js: the chain starts at 'me'), so a Follows
// fan-out asks the reader's own feed too — their own clips belong in their reel.
test('fol: every member of the scope is asked — me included — with the mode’s filter, a wave at a time; only frames come back, dealt across people', async () => {
  const feeds = {
    'did:plc:a': page([clipPost('did:plc:a', 'a1'), clipPost('did:plc:a', 'a2'), clipPost('did:plc:a', 'a3')], 'a-next'),
    'did:plc:b': page([clipPost('did:plc:b', 'b1')]),
    'did:plc:c': page([textPost('did:plc:c', 'c1')]),  // the filter is the network's; the client narrows again
    'did:plc:d': page([]),
  };
  const { session, calls } = reelSession(feeds, GRAPH);
  const lens = createLens({ session });
  const r = await lens.reel('clip', 'fol', { waveSize: 8 });
  const asks = calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed');
  assert.deepEqual(asks.map((c) => c.q.actor).sort(), [ME, 'did:plc:a', 'did:plc:b', 'did:plc:c', 'did:plc:d'].sort());
  assert.ok(asks.every((c) => c.q.filter === 'posts_with_video'), 'the video filter rides every ask');
  assert.deepEqual(r.posts.map((p) => p.id.split('/').pop()), ['a1', 'b1', 'a2', 'a3'], 'dealt round-robin: a, b, a, a');
  assert.equal(r.feedKind, 'reel');
  assert.equal(r.members, 5, 'how many people the scope names (me among them)');
  assert.deepEqual(r.posters.sort(), ['did:plc:a', 'did:plc:b'], 'who answered with a frame — for the register');
  assert.equal(typeof r.cursor, 'string', 'everyone was asked in one wave, but a answered with frames and has more: the reel can page');
});

test('a wave is bounded, and the cursor carries the rest: the next call asks the continuation first, then the unasked', async () => {
  const feeds = {
    'did:plc:a': (q) => (q.cursor ? page([clipPost('did:plc:a', 'a2')]) : page([clipPost('did:plc:a', 'a1')], 'a-next')),
    'did:plc:b': page([clipPost('did:plc:b', 'b1')]),
    'did:plc:c': page([clipPost('did:plc:c', 'c1')]),
    'did:plc:d': page([clipPost('did:plc:d', 'd1')]),
  };
  const { session, calls } = reelSession(feeds, GRAPH);
  const lens = createLens({ session });
  // the scope order is me, a, b, c, d (the chain), so wave one is me and a
  const one = await lens.reel('clip', 'fol', { waveSize: 2 });
  assert.deepEqual(calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed').map((c) => c.q.actor), [ME, 'did:plc:a']);
  assert.deepEqual(one.posts.map((p) => p.id.split('/').pop()), ['a1']);
  assert.equal(typeof one.cursor, 'string', 'more to ask');
  calls.length = 0;
  const two = await lens.reel('clip', 'fol', { waveSize: 2, cursor: one.cursor });
  const asked = calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed').map((c) => [c.q.actor, c.q.cursor || null]);
  assert.deepEqual(asked, [['did:plc:a', 'a-next'], ['did:plc:b', null]], 'a continues with its cursor, then b is fresh');
  assert.deepEqual(two.posts.map((p) => p.id.split('/').pop()), ['a2', 'b1']);
  const three = await lens.reel('clip', 'fol', { waveSize: 2, cursor: two.cursor });
  assert.deepEqual(three.posts.map((p) => p.id.split('/').pop()), ['c1', 'd1']);
  assert.equal(three.cursor, null, 'everyone asked, nobody left with a cursor');
});

test('a member who answered with no frames is not asked again, even with a cursor', async () => {
  const feeds = {
    'did:plc:a': page([textPost('did:plc:a', 'a1')], 'a-next'),
    'did:plc:b': page([clipPost('did:plc:b', 'b1')]),
  };
  const { session, calls } = reelSession(feeds, { follows: ['did:plc:a', 'did:plc:b'], followers: [] });
  const lens = createLens({ session });
  const one = await lens.reel('clip', 'fol', { waveSize: 2 }); // me, a
  assert.equal(typeof one.cursor, 'string', 'b is still unasked');
  const two = await lens.reel('clip', 'fol', { waveSize: 2, cursor: one.cursor });
  assert.deepEqual(calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed').map((c) => c.q.actor), [ME, 'did:plc:a', 'did:plc:b'], 'a is asked once — its cursor was dropped with its empty answer');
  assert.equal(two.cursor, null);
});

test('known posters are asked first', async () => {
  const feeds = Object.fromEntries(GRAPH.follows.map((d) => [d, page([clipPost(d, d.split(':').pop() + '1')])]));
  const { session, calls } = reelSession(feeds, GRAPH);
  await createLens({ session }).reel('clip', 'fol', { waveSize: 2, known: ['did:plc:d'] });
  assert.deepEqual(calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed').map((c) => c.q.actor), ['did:plc:d', ME], 'd is known, so d leads; then the scope order (me first)');
});

test('gram asks with the media filter and keeps picture posts (and GIF cards), not clips', async () => {
  const pic = { ...clipPost('did:plc:a', 'p1'), embed: { $type: 'app.bsky.embed.images#view', images: [{ thumb: 'https://cdn.test/t.jpg', fullsize: 'https://cdn.test/f.jpg', alt: 'a bog', aspectRatio: { width: 4, height: 3 } }] } };
  const feeds = { 'did:plc:a': page([pic, clipPost('did:plc:a', 'v1')]) };
  const { session, calls } = reelSession(feeds, { follows: ['did:plc:a'], followers: [] });
  const r = await createLens({ session }).reel('gram', 'fol');
  assert.ok(calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed').every((c) => c.q.filter === 'posts_with_media'));
  assert.deepEqual(r.posts.map((p) => p.id.split('/').pop()), ['p1']);
});

test('a member that hangs or fails is reported with words and the wave paints what answered', async () => {
  const feeds = { 'did:plc:a': 'hang', 'did:plc:b': new Error('boom'), 'did:plc:c': page([clipPost('did:plc:c', 'c1')]) };
  const { session } = reelSession(feeds, { follows: ['did:plc:a', 'did:plc:b', 'did:plc:c'], followers: [] });
  const r = await createLens({ session }).reel('clip', 'fol', { timeoutMs: 30 });
  assert.deepEqual(r.posts.map((p) => p.id.split('/').pop()), ['c1']);
  assert.deepEqual(r.failures.map((f) => f.did).sort(), ['did:plc:a', 'did:plc:b']);
  assert.ok(r.failures.every((f) => typeof f.error === 'string' && f.error.length));
});

test('mut narrows to the mutuals; me is just me', async () => {
  const feeds = Object.fromEntries([...GRAPH.follows, ME].map((d) => [d, page([clipPost(d, d.split(':').pop() + '1')])]));
  const { session, calls } = reelSession(feeds, GRAPH);
  const lens = createLens({ session });
  await lens.reel('clip', 'mut');
  assert.deepEqual(calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed').map((c) => c.q.actor).sort(), [ME, 'did:plc:a', 'did:plc:b'].sort());
  calls.length = 0;
  await lens.reel('clip', 'me');
  assert.deepEqual(calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed').map((c) => c.q.actor), [ME]);
});

test('hop: the reel asks at most HOP_CAP people across every wave, and reports the pool beside the whole', async () => {
  // 2 mutuals whose follows are 300 people each (600 hop members + the follows + me)
  const hopA = Array.from({ length: 300 }, (_, i) => `did:plc:ha${i}`);
  const hopB = Array.from({ length: 300 }, (_, i) => `did:plc:hb${i}`);
  const feeds = {};
  const calls = [];
  const fetchHandler = async (path) => {
    const u = new URL('http://x' + path); const name = u.pathname.split('/').pop(); const q = Object.fromEntries(u.searchParams);
    calls.push({ name, q });
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    if (name === 'app.bsky.graph.getFollows') {
      if (q.actor === ME) return ok({ follows: [{ did: 'did:plc:a' }, { did: 'did:plc:b' }] });
      if (q.actor === 'did:plc:a') return ok({ follows: hopA.map((did) => ({ did })) });
      if (q.actor === 'did:plc:b') return ok({ follows: hopB.map((did) => ({ did })) });
      return ok({ follows: [] });
    }
    if (name === 'app.bsky.graph.getFollowers') return ok({ followers: [{ did: 'did:plc:a' }, { did: 'did:plc:b' }] });
    if (name === 'app.bsky.feed.getAuthorFeed') return ok(page([]));
    if (MOD[name]) return ok(MOD[name]);
    return { ok: false, status: 404, json: async () => ({ error: 'NotFound' }) };
  };
  const lens = createLens({ session: { did: ME, handle: 'me.test', fetchHandler } });
  let cursor = null; let asked = 0; let last = null;
  for (let i = 0; i < 200; i++) {
    const r = await lens.reel('clip', 'hop', { waveSize: 8, cursor });
    asked += r.asked; last = r; cursor = r.cursor;
    if (!cursor) break;
  }
  assert.ok(last.members > 600, `the whole scope is counted (${last.members})`);
  assert.equal(last.pool, 300, 'the pool is the cap');
  assert.equal(asked, 300, 'and no more people than the cap were ever asked');
});
// Phase 6 (owner, 2026-09-25): the seam. `createLens({ postsSource })` — when given, each
// member of a wave is asked through it (the data servers) and the AppView's author feed is
// not called; `null` from it falls through to the AppView, member by member.
const pdsView = (did, rkey) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`, viaPds: true,
  author: { did, handle: `${did.split(':').pop()}.member.test`, displayName: null, avatar: null },
  record: { text: `pds clip ${rkey}`, createdAt: '2026-09-08T10:00:00Z' }, indexedAt: '2026-09-08T10:00:00Z',
  embed: { $type: 'app.bsky.embed.video#view', cid: `v-${rkey}`, playlist: `https://video.bsky.app/watch/${did}/v-${rkey}/playlist.m3u8`, thumbnail: `https://video.bsky.app/watch/${did}/v-${rkey}/thumbnail.jpg` },
});

test('a postsSource answers the wave from the data servers; the AppView author feed is not asked; the result says via pds and whether counts were hydrated', async () => {
  const { session, calls } = reelSession({}, { follows: ['did:plc:a', 'did:plc:b'], followers: [] });
  const asked = [];
  const postsSource = async ({ did, filter, cursor, limit }) => {
    asked.push({ did, filter, cursor, limit });
    if (did === ME) return { feed: [], cursor: null };
    return { feed: [{ post: pdsView(did, `${did.slice(-1)}1`) }], cursor: null };
  };
  const lens = createLens({ session, postsSource });
  const r = await lens.reel('clip', 'fol');
  assert.deepEqual(asked.map((a) => a.did).sort(), [ME, 'did:plc:a', 'did:plc:b'].sort());
  assert.ok(asked.every((a) => a.filter === 'posts_with_video'));
  assert.equal(calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed').length, 0, 'the AppView author feed was never asked');
  assert.deepEqual(r.posts.map((p) => p.id.split('/').pop()), ['a1', 'b1']);
  assert.equal(r.via, 'pds');
  assert.equal(typeof r.hydrated, 'boolean');
  assert.equal(r.posts[0].media.kind, 'video', 'the derived playlist shapes like any other clip');
  assert.equal(r.posts[0].media.playlist, 'https://video.bsky.app/watch/did:plc:a/v-a1/playlist.m3u8');
});

test('counts and labels are hydrated from the AppView when it answers (getPosts, 25 a call); when it does not, hydrated is false and nothing is invented', async () => {
  const { session, calls } = reelSession({}, { follows: ['did:plc:a'], followers: [] });
  const postsSource = async ({ did }) => (did === ME ? { feed: [], cursor: null } : { feed: [{ post: pdsView(did, 'a1') }], cursor: null });
  // the shim answers getPosts with counts + a label
  const withPosts = (routes) => ({ ...session, fetchHandler: async (path) => {
    if (path.includes('app.bsky.feed.getPosts')) {
      const u = new URL('http://x' + path); const uris = u.searchParams.getAll('uris');
      calls.push({ name: 'app.bsky.feed.getPosts', q: { uris } });
      if (routes.fail) return { ok: false, status: 502, json: async () => ({ error: 'down' }) };
      return { ok: true, status: 200, json: async () => ({ posts: uris.map((uri) => ({ ...pdsView('did:plc:a', 'a1'), uri, likeCount: 42, replyCount: 3, repostCount: 1, labels: [{ val: 'test-label', src: 'did:plc:l', uri, cts: '2026-09-01T00:00:00Z' }] })) }) };
    }
    return session.fetchHandler(path);
  } });
  const r = await createLens({ session: withPosts({}), postsSource }).reel('clip', 'fol');
  assert.equal(r.hydrated, true);
  assert.deepEqual(calls.filter((c) => c.name === 'app.bsky.feed.getPosts').map((c) => c.q.uris), [['at://did:plc:a/app.bsky.feed.post/a1']]);
  assert.equal(r.posts[0].likes, 42);
  assert.equal(r.posts[0].commentCount, 3);
  calls.length = 0;
  const down = await createLens({ session: withPosts({ fail: true }), postsSource }).reel('clip', 'fol');
  assert.equal(down.hydrated, false);
  assert.equal(down.posts.length, 1, 'the frame is still there');
  assert.equal(down.posts[0].countsKnown, false, 'and says its counts are not known');
});

test('a postsSource answering null for a member falls through to the AppView for that member alone', async () => {
  const feeds = { 'did:plc:b': page([clipPost('did:plc:b', 'b1')]) };
  const { session, calls } = reelSession(feeds, { follows: ['did:plc:a', 'did:plc:b'], followers: [] });
  const postsSource = async ({ did }) => (did === 'did:plc:a' ? { feed: [{ post: pdsView(did, 'a1') }], cursor: null } : null);
  const r = await createLens({ session, postsSource }).reel('clip', 'fol');
  assert.deepEqual(calls.filter((c) => c.name === 'app.bsky.feed.getAuthorFeed').map((c) => c.q.actor).sort(), [ME, 'did:plc:b'].sort());
  assert.deepEqual(r.posts.map((p) => p.id.split('/').pop()).sort(), ['a1', 'b1']);
  assert.equal(r.via, 'mixed');
});
