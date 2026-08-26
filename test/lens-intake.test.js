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

test('fields (the lens Feeds list) resolve from savedFeedsPref + generator views, with human slugs', async () => {
  const lens = createLens({ session: oauthSession([]), transport: makeTransport([]) });
  const fields = await lens.fields();
  const feedField = fields.find((f) => f.kind === 'feed');
  assert.equal(feedField.slug, 'whats-hot', 'the rkey slug is the durable canonical');
  assert.equal(feedField.humanSlug, 'whatshot', 'the display name collapses to a shareable alias');
  assert.equal(feedField.title, "What's Hot");
  assert.equal(feedField.pinned, true);
  assert.ok(fields.some((f) => f.kind === 'timeline')); // Following, session-only
});

// ---- 3i: human-readable feed slugs (display names are OWNER-EDITABLE
// metadata — the alias is a convenience; the rkey URL is canon) ----

test('slugifyFeedName collapses to a shareable slug; empty/degenerate → null', async () => {
  const { slugifyFeedName } = await import('../js/substrates/lens.js');
  assert.equal(slugifyFeedName('Stand Up Comedy'), 'standupcomedy');
  assert.equal(slugifyFeedName("What's Hot"), 'whatshot');
  assert.equal(slugifyFeedName('  For You! '), 'foryou');
  assert.equal(slugifyFeedName('日本語のみ'), null, 'nothing collapsible → no alias, canon still works');
  assert.equal(slugifyFeedName(''), null);
  assert.equal(slugifyFeedName(undefined), null);
});

test('fields dedupe colliding human slugs — first keeps the alias, later ones fall back to canon', async () => {
  const transport = async (url) => {
    const u = new URL(url);
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (u.pathname.endsWith('getPreferences')) return json({ preferences: [{
      $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
      items: [
        { type: 'feed', value: 'at://did:plc:a/app.bsky.feed.generator/aaa111', pinned: true, id: '1' },
        { type: 'feed', value: 'at://did:plc:b/app.bsky.feed.generator/bbb222', pinned: true, id: '2' },
      ] }] });
    if (u.pathname.endsWith('getFeedGenerators')) return json({ feeds: [
      { uri: 'at://did:plc:a/app.bsky.feed.generator/aaa111', displayName: 'Art' },
      { uri: 'at://did:plc:b/app.bsky.feed.generator/bbb222', displayName: 'ART!' },
    ] });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const session = { did: 'did:plc:me', handle: 'me', fetchHandler: async (p, i) => transport('https://pds.example' + p, i) };
  const fields = await createLens({ session }).fields();
  assert.equal(fields[0].humanSlug, 'art');
  assert.equal(fields[1].humanSlug, null, 'a collision never silently points at the wrong feed');
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

// ---- 3i: window sorts (reddit-style bars, honest about scope) ----

test('3i: sortWindow — feed keeps the generator order; new is by time; top is by score within the timeframe', async () => {
  const { sortWindow } = await import('../js/substrates/lens.js');
  const NOW = Date.parse('2026-08-26T12:00:00Z');
  const mk = (id, hoursAgo, score) => ({ id, createdTs: NOW - hoursAgo * 3600_000, score });
  const posts = [mk('a', 30, 5), mk('b', 1, 2), mk('c', 200, 90), mk('d', 4, 40)];

  assert.deepEqual(sortWindow(posts, 'feed', 'all', NOW).map((p) => p.id), ['a', 'b', 'c', 'd'], 'feed order untouched');
  assert.deepEqual(sortWindow(posts, 'new', 'all', NOW).map((p) => p.id), ['b', 'd', 'a', 'c']);
  assert.deepEqual(sortWindow(posts, 'top', 'all', NOW).map((p) => p.id), ['c', 'd', 'a', 'b']);
  // timeframe filters apply to top: day keeps b(1h) + d(4h) only
  assert.deepEqual(sortWindow(posts, 'top', 'day', NOW).map((p) => p.id), ['d', 'b']);
  assert.deepEqual(sortWindow(posts, 'top', 'week', NOW).map((p) => p.id), ['d', 'a', 'b'], '30h is inside a week');
  // the boundary: exactly 24h old is INSIDE day (>= cutoff)
  const edge = [mk('edge', 24, 1)];
  assert.equal(sortWindow(edge, 'top', 'day', NOW).length, 1);
  assert.equal(sortWindow([mk('out', 24.01, 1)], 'top', 'day', NOW).length, 0);
  // unknown sort refuses with words
  assert.throws(() => sortWindow(posts, 'bestest', 'all', NOW), /bestest/);
});

// ---- 3j: feed discovery, metadata, and join (pin) ----

test('3j: withSavedFeed adds a pinned feed, removes it, is idempotent, and preserves other prefs', async () => {
  const { withSavedFeed } = await import('../js/substrates/lens.js');
  const other = { $type: 'app.bsky.actor.defs#mutedWordsPref', items: [{ value: 'x' }] };
  const saved = { $type: 'app.bsky.actor.defs#savedFeedsPrefV2', items: [
    { type: 'timeline', value: 'following', pinned: true, id: 'tl' },
  ] };
  const URI = 'at://did:plc:a/app.bsky.feed.generator/aaa111';

  const added = withSavedFeed([other, saved], URI, true);
  const addedSaved = added.find((p) => p.$type.endsWith('savedFeedsPrefV2'));
  assert.equal(addedSaved.items.length, 2);
  const entry = addedSaved.items.find((i) => i.value === URI);
  assert.deepEqual({ type: entry.type, pinned: entry.pinned }, { type: 'feed', pinned: true });
  assert.ok(entry.id, 'an id is assigned');
  assert.deepEqual(added.find((p) => p.$type.endsWith('mutedWordsPref')), other, 'other prefs untouched');

  // idempotent: adding twice does not duplicate
  assert.equal(withSavedFeed(added, URI, true).find((p) => p.$type.endsWith('savedFeedsPrefV2')).items.length, 2);

  // removal
  const removed = withSavedFeed(added, URI, false);
  assert.equal(removed.find((p) => p.$type.endsWith('savedFeedsPrefV2')).items.length, 1);
  // removing what is not there is a no-op, not a crash
  assert.equal(withSavedFeed(removed, URI, false).find((p) => p.$type.endsWith('savedFeedsPrefV2')).items.length, 1);
  // no savedFeeds pref at all → one is created
  assert.equal(withSavedFeed([other], URI, true).find((p) => p.$type.endsWith('savedFeedsPrefV2')).items.length, 1);
});

test('3j: feedInfo returns the generator card — avatar, description, creator, likes, and the criteria caveat', async () => {
  const URI = 'at://did:plc:a/app.bsky.feed.generator/aaa111';
  const transport = async (url) => {
    assert.ok(url.includes('app.bsky.feed.getFeedGenerator'));
    return { ok: true, status: 200, json: async () => ({ view: {
      uri: URI, displayName: 'Garden Talk', description: 'Post with #gardening to appear here.',
      avatar: 'https://cdn/av.png', likeCount: 42,
      creator: { did: 'did:plc:a', handle: 'grower.test' },
    }, isOnline: true, isValid: true }) };
  };
  const info = await createLens({ transport }).feedInfo(URI);
  assert.deepEqual(info, {
    uri: URI, title: 'Garden Talk', description: 'Post with #gardening to appear here.',
    avatar: 'https://cdn/av.png', likeCount: 42, creator: 'grower.test', online: true, valid: true,
  });
});

test('3j: discoverFeeds lists popular generators and searches by query; guests get results too', async () => {
  const calls = [];
  const transport = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ feeds: [
      { uri: 'at://did:plc:a/app.bsky.feed.generator/x1', displayName: 'Garden Talk',
        description: 'plants', avatar: 'a.png', likeCount: 9, creator: { handle: 'grower.test' } },
    ] }) };
  };
  const lens = createLens({ transport });
  const all = await lens.discoverFeeds();
  assert.equal(all.length, 1);
  assert.equal(all[0].title, 'Garden Talk');
  assert.ok(calls[0].includes('getPopularFeedGenerators'));
  await lens.discoverFeeds({ query: 'garden' });
  assert.ok(calls[1].includes('query=garden'), 'the query rides through');
});

test('3j: pinFeed/unpinFeed write through putPreferences and refuse without a session', async () => {
  const URI = 'at://did:plc:a/app.bsky.feed.generator/aaa111';
  await assert.rejects(() => createLens({}).pinFeed(URI), /session|sign/i);

  const calls = [];
  const fetchHandler = async (path, init = {}) => {
    calls.push({ path, body: init.body ? JSON.parse(init.body) : null });
    if (path.includes('getPreferences')) {
      return { ok: true, status: 200, json: async () => ({ preferences: [
        { $type: 'app.bsky.actor.defs#savedFeedsPrefV2', items: [] }] }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me', fetchHandler } });
  await lens.pinFeed(URI);
  const put = calls.find((c) => c.path.includes('putPreferences'));
  assert.ok(put, 'putPreferences called');
  const savedPref = put.body.preferences.find((p) => p.$type.endsWith('savedFeedsPrefV2'));
  assert.equal(savedPref.items[0].value, URI);
  assert.equal(savedPref.items[0].pinned, true);
});

// ---- 3k: user profiles (persistent /u/<handle> URLs) ----

test('3k: profile() shapes the bsky profile card — avatar, banner, counts, bio, verification', async () => {
  const transport = async (url) => {
    assert.ok(url.includes('app.bsky.actor.getProfile'));
    assert.ok(url.includes('actor=chase523.bsky.social'));
    return { ok: true, status: 200, json: async () => ({
      did: 'did:plc:me', handle: 'chase523.bsky.social', displayName: 'Chase (523)',
      avatar: 'https://cdn/av.png', banner: 'https://cdn/bn.png',
      description: 'He/Him\n\nTo be a loving human being is enough.',
      followersCount: 34, followsCount: 102, postsCount: 266,
      verification: { verifiedStatus: 'valid', trustedVerifierStatus: 'none' },
    }) };
  };
  const p = await createLens({ transport }).profile('chase523.bsky.social');
  assert.deepEqual(p, {
    did: 'did:plc:me', handle: 'chase523.bsky.social', displayName: 'Chase (523)',
    avatar: 'https://cdn/av.png', banner: 'https://cdn/bn.png',
    description: 'He/Him\n\nTo be a loving human being is enough.',
    followers: 34, following: 102, posts: 266, verified: 'valid',
  });
});

test('3k: a bare profile (no avatar/banner/bio) degrades to nulls, never crashes', async () => {
  const transport = async () => ({ ok: true, status: 200, json: async () => ({ did: 'd', handle: 'bare.test' }) });
  const p = await createLens({ transport }).profile('bare.test');
  assert.equal(p.displayName, 'bare.test', 'the handle stands in for a missing display name');
  assert.equal(p.avatar, null);
  assert.equal(p.followers, 0);
  assert.equal(p.verified, null);
});
