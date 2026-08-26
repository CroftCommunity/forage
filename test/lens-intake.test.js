// 6c→2c: lens intake — transport-injected AppView readers (ADR-002). Guest
// mode reads public.api.bsky.app unauthenticated; a session is the OAUTH shape
// ({ did, handle, fetchHandler }) and every authed read flows through the
// DPoP-bound fetchHandler with RELATIVE /xrpc paths — the lens never builds an
// authorization header itself. Search and personal surfaces refuse without a
// session, with words (they render as frontier chips, never dead buttons).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLens } from '../js/substrates/lens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (n) => JSON.parse(readFileSync(join(root, 'test/fixtures/atproto', `${n}.json`), 'utf8'));

const WHATS_HOT = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

function makeTransport(log) {
  return async (url, init = {}) => {
    const u = new URL(url);
    log.push({ host: u.host, path: u.pathname, params: u.searchParams, auth: init.headers?.authorization || null });
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (u.pathname.endsWith('getFeed') || u.pathname.endsWith('getAuthorFeed') || u.pathname.endsWith('getListFeed')) return json(fixture('wide-getFeed'));
    if (u.pathname.endsWith('getPostThread')) return json(fixture('wide-getPostThread'));
    if (u.pathname.endsWith('getPreferences')) return json({ preferences: [{
      $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
      items: [
        { type: 'feed', value: WHATS_HOT, pinned: true, id: '1' },
        { type: 'timeline', value: 'following', pinned: true, id: '2' },
      ] }] });
    if (u.pathname.endsWith('getFeedGenerators')) return json({ feeds: [
      { uri: WHATS_HOT, displayName: "What's Hot", likeCount: 12345 }] });
    if (u.pathname.endsWith('searchPosts')) return json({ posts: fixture('wide-getFeed').feed.map((i) => i.post) });
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

// The OAuth session fake: the manager's DPoP fetch — takes a RELATIVE
// /xrpc path, returns Response-likes off the same fixture table.
function makeSessionFetch(log) {
  const transport = makeTransport(log.raw = []);
  return async (path, init = {}) => {
    if (!path.startsWith('/xrpc/')) throw new Error('fetchHandler expects a relative /xrpc path, got ' + path);
    log.push({ path });
    return transport('https://pds.example' + path, init);
  };
}
const oauthSession = (log) => ({ did: 'did:plc:me', handle: 'me.bsky.social', fetchHandler: makeSessionFetch(log) });

test('guest: feed source reads public.api.bsky.app with no auth header', async () => {
  const log = [];
  const lens = createLens({ transport: makeTransport(log) });
  const f = await lens.feed({ kind: 'feed', uri: WHATS_HOT });
  assert.equal(f.posts.length, 3);
  assert.equal(f.fieldSlug, 'whats-hot');           // OQ1: slug = the feed rkey
  assert.equal(log[0].host, 'public.api.bsky.app');
  assert.equal(log[0].auth, null);
});

test('author and list sources dispatch to their own XRPC methods', async () => {
  const log = [];
  const lens = createLens({ transport: makeTransport(log) });
  await lens.feed({ kind: 'author', actor: 'bsky.app' });
  await lens.feed({ kind: 'list', uri: 'at://did:plc:x/app.bsky.graph.list/mylist' });
  assert.ok(log[0].path.endsWith('app.bsky.feed.getAuthorFeed'));
  assert.ok(log[1].path.endsWith('app.bsky.feed.getListFeed'));
});

test('a session routes through the DPoP fetchHandler with a relative /xrpc path — no header building', async () => {
  const log = [];
  const lens = createLens({ session: oauthSession(log), transport: makeTransport([]) });
  await lens.feed({ kind: 'feed', uri: WHATS_HOT });
  assert.equal(log.length, 1, 'the read went through the session fetch, not the transport');
  assert.ok(log[0].path.startsWith('/xrpc/app.bsky.feed.getFeed'), log[0].path);
  assert.equal(log.raw[0].auth, null, 'the lens NEVER builds an authorization header — DPoP is the library\'s job');
});

test('thread reads shape through to the standing thread contract', async () => {
  const lens = createLens({ transport: makeTransport([]) });
  const t = await lens.thread(fixture('wide-getPostThread').thread.post.uri, { fieldSlug: 'whats-hot', fieldTitle: "What's Hot", fieldId: 'lens:whats-hot' });
  assert.ok(t.post.id.startsWith('at://'));
  assert.equal(t.perms.canComment, false);
});

test('fields (the lens Fields list) resolve from savedFeedsPref + generator views', async () => {
  const lens = createLens({ session: oauthSession([]), transport: makeTransport([]) });
  const fields = await lens.fields();
  const feedField = fields.find((f) => f.kind === 'feed');
  assert.equal(feedField.slug, 'whats-hot');
  assert.equal(feedField.title, "What's Hot");
  assert.equal(feedField.pinned, true);
  assert.ok(fields.some((f) => f.kind === 'timeline')); // Following, session-only
});

test('guest refusals carry words: fields and search need a session', async () => {
  const lens = createLens({ transport: makeTransport([]) });
  await assert.rejects(() => lens.fields(), /session/);
  await assert.rejects(() => lens.search('gardening'), /session/);
});

test('search with a session returns lens-shaped posts', async () => {
  const lens = createLens({ session: oauthSession([]), transport: makeTransport([]) });
  const res = await lens.search('gardening');
  assert.equal(res.posts.length, 3);
  assert.equal(res.posts[0].downs, 0);
});

test('2c scan: no app-password path survives anywhere in the lens', () => {
  for (const f of ['js/substrates/lens.js', 'js/ui/lens-views.js']) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.ok(!src.includes('createSession'), f + ' still calls createSession');
    assert.ok(!src.includes('accessJwt'), f + ' still handles accessJwt');
    assert.ok(!/app.?password/i.test(src), f + ' still mentions app passwords');
  }
});

// ---- 3g: content streams — one abstraction, two keys ----

test('3g: stream() dispatches by kind — feed reaches getFeed, unknown refuses with words', async () => {
  const log = [];
  const lens = createLens({ transport: makeTransport(log) });
  const f = await lens.stream({ kind: 'feed', key: WHATS_HOT });
  assert.equal(f.posts.length, 3);
  assert.ok(log[0].path.endsWith('getFeed'));
  await assert.rejects(() => lens.stream({ kind: 'firehose', key: 'x' }), (e) => {
    assert.match(e.message, /firehose/);
    assert.match(e.message, /feed.*hashtag|hashtag.*feed/);
    return true;
  });
});

test('3g: hashtag streams are session-gated with words; signed in they search by tag', async () => {
  await assert.rejects(() => createLens({ transport: makeTransport([]) }).stream({ kind: 'hashtag', key: 'gardening' }), /session|sign/i);
  const log = [];
  const lens = createLens({ session: oauthSession(log), transport: makeTransport([]) });
  const s = await lens.stream({ kind: 'hashtag', key: 'gardening' });
  assert.equal(s.posts.length, 3);
  assert.ok(log.some((c) => c.path.includes('searchPosts') && c.path.includes('tag=gardening')));
  assert.equal(s.fieldSlug, 'h:gardening');
});

test('3g: trending maps unspecced topics to FEED-stream descriptors (link → at-uri)', async () => {
  const transport = async (url) => ({ ok: true, status: 200, json: async () => ({ topics: [
    { topic: 'Big News', displayName: 'Big News', description: 'd',
      link: '/profile/did:plc:trends/feed/abc123' },
    { topic: 'Weird', displayName: 'Weird', description: 'w', link: '/search?q=weird' }, // not a feed link
  ] }) });
  const t = await createLens({ transport }).trending();
  assert.equal(t.length, 2);
  assert.equal(t[0].feedUri, 'at://did:plc:trends/app.bsky.feed.generator/abc123');
  assert.equal(t[0].displayName, 'Big News');
  assert.equal(t[1].feedUri, null, 'a non-feed link keeps the topic, without a board');
});
