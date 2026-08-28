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
import { createLens, sortFeeds, filterFeeds, platforms, likeWindow, feedLiveness, liveFeeds, searchWindow, tidTime, countRecent } from '../js/substrates/lens.js';

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
  assert.equal(f.feedSlug, 'whats-hot');           // OQ1: slug = the feed rkey
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
  const t = await lens.thread(fixture('wide-getPostThread').thread.post.uri, { feedSlug: 'whats-hot', feedTitle: "What's Hot", feedId: 'lens:whats-hot' });
  assert.ok(t.post.id.startsWith('at://'));
  assert.equal(t.perms.canComment, false);
});

test('feeds (the lens Feeds list) resolve from savedFeedsPref + generator views, with human slugs', async () => {
  const lens = createLens({ session: oauthSession([]), transport: makeTransport([]) });
  const feeds = await lens.feeds();
  const feedField = feeds.find((f) => f.kind === 'feed');
  assert.equal(feedField.slug, 'whats-hot', 'the rkey slug is the durable canonical');
  assert.equal(feedField.humanSlug, 'whatshot', 'the display name collapses to a shareable alias');
  assert.equal(feedField.title, "What's Hot");
  assert.equal(feedField.pinned, true);
  assert.ok(feeds.some((f) => f.kind === 'timeline')); // Following, session-only
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

test('feeds dedupe colliding human slugs — first keeps the alias, later ones fall back to canon', async () => {
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
  const feeds = await createLens({ session }).feeds();
  assert.equal(feeds[0].humanSlug, 'art');
  assert.equal(feeds[1].humanSlug, null, 'a collision never silently points at the wrong feed');
});

test('guest refusals carry words: feeds and search need a session', async () => {
  const lens = createLens({ transport: makeTransport([]) });
  await assert.rejects(() => lens.feeds(), /session/);
  await assert.rejects(() => lens.search('gardening'), /session/);
});

test('search with a session returns lens-shaped posts', async () => {
  const lens = createLens({ session: oauthSession([]), transport: makeTransport([]) });
  const res = await lens.search('gardening');
  assert.equal(res.posts.length, 3);
  assert.equal('downs' in res.posts[0], false); // DL-011 retired: no always-zero field
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
  assert.equal(s.feedSlug, 'h:gardening');
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

test('3i: sortWindow — feed keeps the generator order; new is by time; top is by likes within the timeframe', async () => {
  const { sortWindow } = await import('../js/substrates/lens.js');
  const NOW = Date.parse('2026-08-26T12:00:00Z');
  const mk = (id, hoursAgo, likes) => ({ id, createdTs: NOW - hoursAgo * 3600_000, likes });
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

// ---- 3v: a feed URL that survives being pasted ----
//
// Found live on forage.fyi 2026-08-26: /f/<rkey> resolves only while you are
// navigating, because the source registry is in memory AND an rkey alone is
// not resolvable — a feed's identity is at://<did>/app.bsky.feed.generator/
// <rkey>, rkeys are not unique across creators, and no endpoint resolves one
// without a repo. VERIFIED cold and unauthenticated: resolveHandle('bsky.app')
// → did:plc:z72i7hdynmk6r22z27h6tvur, and getFeedGenerator on the assembled
// at-uri returns the feed. So a shareable feed URL must carry the creator.

test('3v: feedPath is the canonical shareable form — creator and rkey, both needed', async () => {
  const { feedPath } = await import('../js/substrates/lens.js');
  assert.equal(feedPath({ creator: 'bsky.app', rkey: 'whats-hot' }), '/f/@bsky.app/whats-hot');
  assert.equal(feedPath({ creator: 'alexismadd.bsky.social', rkey: 'aaaaqhuqm2kdc' }),
    '/f/@alexismadd.bsky.social/aaaaqhuqm2kdc');
  // no creator = no shareable path. Returning the bare rkey form here would
  // hand out exactly the link that does not work.
  assert.equal(feedPath({ rkey: 'whats-hot' }), null);
  assert.equal(feedPath({ creator: '', rkey: 'x' }), null);
  // it can build straight from a feed uri + creator handle
  assert.equal(feedPath({ creator: 'bsky.app', uri: 'at://did:plc:z7/app.bsky.feed.generator/whats-hot' }),
    '/f/@bsky.app/whats-hot');
});

test('3v: parseFeedRoute tells a creator-qualified path from a bare slug', async () => {
  const { parseFeedRoute } = await import('../js/substrates/lens.js');
  assert.deepEqual(parseFeedRoute({ handle: '@bsky.app', rkey: 'whats-hot' }),
    { kind: 'qualified', handle: 'bsky.app', rkey: 'whats-hot' });
  // the @ is required: without it the first segment is ambiguous with a slug
  assert.deepEqual(parseFeedRoute({ handle: 'bsky.app', rkey: 'whats-hot' }),
    { kind: 'qualified', handle: 'bsky.app', rkey: 'whats-hot' }, 'a two-segment path is qualified either way');
  assert.deepEqual(parseFeedRoute({ slug: 'whats-hot' }), { kind: 'slug', slug: 'whats-hot' });
});

test('3v: resolveFeed goes handle → did → feed, cold, with no session', async () => {
  const calls = [];
  const transport = async (path) => {
    calls.push(path);
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (path.includes('resolveHandle')) return json({ did: 'did:plc:z72' });
    if (path.includes('getFeedGenerator')) return json({ view: {
      uri: 'at://did:plc:z72/app.bsky.feed.generator/whats-hot', displayName: "What's Hot",
      description: 'the hot ones', likeCount: 9, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const lens = createLens({ transport }); // NO session — a stranger opening a shared link
  const info = await lens.resolveFeed({ handle: 'bsky.app', rkey: 'whats-hot' });
  assert.equal(info.uri, 'at://did:plc:z72/app.bsky.feed.generator/whats-hot');
  assert.equal(info.title, "What's Hot");
  assert.equal(info.creator, 'bsky.app');
  assert.ok(calls.some((c) => c.includes('resolveHandle')), 'the handle is resolved, never assumed to be a did');
  assert.ok(calls.some((c) => c.includes('getFeedGenerator')));

  // a did in the handle position is already resolved — do not ask again
  calls.length = 0;
  await lens.resolveFeed({ handle: 'did:plc:z72', rkey: 'whats-hot' });
  assert.equal(calls.filter((c) => c.includes('resolveHandle')).length, 0, 'a did needs no resolution');
});

test('3v: a handle that does not resolve fails by NAME, never as a blank board', async () => {
  const transport = async (path) => (path.includes('resolveHandle')
    ? { ok: false, status: 400, json: async () => ({ error: 'InvalidRequest', message: 'Unable to resolve handle' }) }
    : { ok: true, status: 200, json: async () => ({}) });
  await assert.rejects(() => createLens({ transport }).resolveFeed({ handle: 'nope.invalid', rkey: 'x' }),
    /resolve|handle/i);
});

// 3s: Join and Favorite are two different things, exactly as Bluesky models
// them — saved puts a feed in your list, pinned puts it in your top row. Join
// used to force pinned:true, which silently rearranged the official app's tab
// bar for anyone who joined a feed here.

test('3s: joining SAVES without pinning; favoriting pins; unfavoriting keeps you joined', async () => {
  const { withSavedFeed, withPinnedFeed } = await import('../js/substrates/lens.js');
  const URI = 'at://did:plc:x/app.bsky.feed.generator/funny';
  const base = [{ $type: 'app.bsky.actor.defs#savedFeedsPrefV2', items: [] }];

  const joined = withSavedFeed(base, URI, true);
  const item = (prefs) => prefs.find((p) => p.$type.endsWith('savedFeedsPrefV2')).items.find((i) => i.value === URI);
  assert.equal(item(joined).pinned, false, 'joining never touches the top row of the official app');

  const fav = withPinnedFeed(joined, URI, true);
  assert.equal(item(fav).pinned, true);
  assert.equal(item(fav).id, item(joined).id, 'favoriting edits the entry in place — same id, no duplicate');

  const unfav = withPinnedFeed(fav, URI, false);
  assert.equal(item(unfav).pinned, false, 'unfavoriting drops the pin');
  assert.ok(item(unfav), 'and leaves you joined — the two controls are independent');

  // favoriting a feed you have not joined joins it too: a pinned-but-unsaved
  // entry is not a state the official app has
  const cold = withPinnedFeed(base, URI, true);
  assert.equal(item(cold).pinned, true);
  assert.equal(item(cold).type, 'feed');

  // leaving takes the pin with it
  const left = withSavedFeed(fav, URI, false);
  assert.equal(item(left), undefined);
});

test('3j: withSavedFeed adds a feed, removes it, is idempotent, and preserves other prefs', async () => {
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
  assert.deepEqual({ type: entry.type, pinned: entry.pinned }, { type: 'feed', pinned: false }); // 3s: joining ≠ pinning
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

// ---- 4g: adoption signals from Constellation (ADR-004) ----
// The AppView exposes ONE popularity signal for a feed (likeCount, plus the
// windows 4c counts). It exposes nothing about how a feed is recommended, and
// DL-033 records why that gap is permanent. Constellation's backlink index
// answers it — and its rows are time-windowable for free, because an atproto
// rkey is a TID encoding a microsecond timestamp.

test('4g: tidTime decodes an rkey to its creation instant', () => {
  // cross-checked against app.bsky.feed.getLikes createdAt on the SAME record
  // (probe 2026-08-26): the decode landed 0.15s from the server's own value.
  assert.equal(tidTime('3mtyzi64agb2i').toISOString().slice(0, 19), '2026-08-26T19:02:27');
  assert.equal(tidTime('3mtyxzszyhl2i').toISOString().slice(0, 19), '2026-08-26T18:36:32');
  assert.ok(tidTime('3lgwdn7vd722r') < tidTime('3mtyzi64agb2i'), 'TIDs sort chronologically');
});

test('4g: tidTime rejects a malformed rkey rather than inventing a date', () => {
  assert.throws(() => tidTime('not!a!tid'), /not a tid/i);
  assert.throws(() => tidTime(''), /not a tid/i);
});

test('4g: countRecent windows backlink rows by their rkey alone — no extra fetches', () => {
  const now = Date.parse('2026-08-26T20:00:00Z');
  const rows = [
    { rkey: '3mtyzi64agb2i' },   // 2026-08-26 19:02 — ~1h ago
    { rkey: '3mtyxzszyhl2i' },   // 2026-08-26 18:36 — ~1.4h ago
    { rkey: '3lgwdn7vd722r' },   // 2025-01-something — well outside 30d
  ];
  assert.deepEqual(countRecent(rows, now), { d7: 2, d30: 2, total: 3 });
});

test('4g: adoption asks for quotes and starter packs, and windows both', async () => {
  const now = Date.parse('2026-08-26T20:00:00Z');
  const asked = [];
  const transport = async (url) => {
    asked.push(url);
    const coll = new URL(url).searchParams.get('collection');
    return { ok: true, status: 200, json: async () => ({
      total: coll === 'app.bsky.feed.post' ? 4287 : 965,
      linking_records: [{ rkey: '3mtyzi64agb2i' }, { rkey: '3lgwdn7vd722r' }],
    }) };
  };
  const out = await createLens({ transport })
    .adoption('at://did:plc:a/app.bsky.feed.generator/x', { nowMs: now });
  assert.equal(asked.length, 2);
  assert.ok(asked.every((u) => u.includes('constellation.microcosm.blue')));
  assert.ok(asked.some((u) => u.includes('app.bsky.feed.post')), 'quotes');
  assert.ok(asked.some((u) => u.includes('app.bsky.graph.starterpack')), 'starter packs');
  assert.equal(out.quotes.total, 4287);
  assert.equal(out.quotes.d7, 1, 'the ancient row falls outside the window');
  assert.equal(out.packs.total, 965);
});

test('4g: adoption degrades to ABSENT when the host is down — never to zero', async () => {
  const transport = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const out = await createLens({ transport }).adoption('at://did:plc:a/app.bsky.feed.generator/x');
  assert.equal(out, null,
    'a signal we could not fetch must not render as "0 shares" — ADR-004 point 2');
});

test('4g: adoption sends nothing about the viewer — ADR-004 point 4', async () => {
  const seen = [];
  const transport = async (url, init) => {
    seen.push({ url, headers: init?.headers || {} });
    return { ok: true, status: 200, json: async () => ({ total: 0, linking_records: [] }) };
  };
  const session = { did: 'did:plc:me', handle: 'me.test', fetchHandler: async () => { throw new Error('the viewer session must never touch Constellation'); } };
  await createLens({ session, transport }).adoption('at://did:plc:a/app.bsky.feed.generator/x');
  assert.equal(seen.length, 2, 'it went through the plain transport, not the session');
  for (const { url, headers } of seen) {
    assert.ok(!url.includes('did:plc:me'), url);
    assert.ok(!JSON.stringify(headers).includes('did:plc:me'));
    assert.ok(!('authorization' in headers), 'no credentials leave for a third-party host');
    assert.match(headers['user-agent'] || '', /forage/i, 'the operator asks us to identify');
  }
});

// ---- 4f: /f/ boards deepen on a BUDGET, and say which way it ended ----
// A generator has no window lever (getFeedSkeleton takes only limit/cursor —
// DL-032), so the only way to widen a /f/ board's window is to page backwards.
// Measured cost varies by 100x (plan D4): Astronomy covered 24h in 1 page,
// Blacksky reached 3.6h in 40 pages. So the honest shape is a budget plus a
// verdict the UI can read out.

const feedPage = (rkeys, nowMs, hoursAgo, cursor) => ({
  feed: rkeys.map((k, i) => ({ post: {
    uri: `at://did:plc:a/app.bsky.feed.post/${k}`, cid: `c${k}`,
    author: { did: 'did:plc:a', handle: 'a.test' },
    record: { text: k, createdAt: new Date(nowMs - (hoursAgo + i) * 3600_000).toISOString() },
    indexedAt: new Date(nowMs - (hoursAgo + i) * 3600_000).toISOString(),
    likeCount: 1, replyCount: 0,
  } })),
  ...(cursor ? { cursor } : {}),
});

test('4f: deepen stops as soon as the window is COVERED', async () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const pages = [feedPage(['a', 'b'], now, 1, 'p2'), feedPage(['c', 'd'], now, 30, 'p3')];
  let n = 0;
  const transport = async () => ({ ok: true, status: 200, json: async () => pages[n++] });
  const out = await createLens({ transport })
    .deepen({ kind: 'feed', uri: 'at://x' }, { toHours: 24, nowMs: now, maxPages: 8 });
  assert.equal(out.outcome, 'covered');
  assert.equal(out.pages, 2, 'it stops the moment it reaches past the window, not at the budget');
  assert.equal(out.posts.length, 4);
  assert.ok(out.reachedHours >= 24);
});

test('4f: deepen reports EXHAUSTED when the feed simply runs out', async () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const transport = async () => ({ ok: true, status: 200, json: async () => feedPage(['a', 'b'], now, 1) });
  const out = await createLens({ transport })
    .deepen({ kind: 'feed', uri: 'at://x' }, { toHours: 168, nowMs: now, maxPages: 8 });
  assert.equal(out.outcome, 'exhausted', 'the feed has no more to give — that is not a failure');
  assert.equal(out.pages, 1);
});

test('4f: deepen reports BUDGET when the feed posts faster than we can page', async () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  let i = 0;
  const transport = async () => {
    const p = feedPage([`a${i}`, `b${i}`], now, i * 0.1, `cur${i}`);
    i += 1;
    return { ok: true, status: 200, json: async () => p };
  };
  const out = await createLens({ transport })
    .deepen({ kind: 'feed', uri: 'at://x' }, { toHours: 168, nowMs: now, maxPages: 3 });
  assert.equal(out.outcome, 'budget');
  assert.equal(out.pages, 3);
  assert.ok(out.reachedHours < 168, 'and it says how far it actually got');
});

test('4f: deepen de-duplicates posts that repeat across pages', async () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const pages = [feedPage(['a', 'b'], now, 1, 'p2'), feedPage(['b', 'c'], now, 30, undefined)];
  let n = 0;
  const transport = async () => ({ ok: true, status: 200, json: async () => pages[n++] });
  const out = await createLens({ transport })
    .deepen({ kind: 'feed', uri: 'at://x' }, { toHours: 24, nowMs: now, maxPages: 8 });
  assert.equal(out.posts.length, 3, 'a generator may repeat a post across pages; the board must not');
});

// ---- 4e: /h/ boards get a TRUE top window, not a re-sort of what loaded ----
// searchPosts takes sort=top|latest plus since/until SERVER-SIDE (probed with a
// session 2026-08-26, plan D3), so "Top · this week" on a hashtag board is one
// query over the whole corpus. /f/ generator boards have no such lever — the
// asymmetry is real and DL-032 names it.

test('4e: searchWindow maps the board controls onto searchPosts params', () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  assert.deepEqual(searchWindow('new', 'day', now), { sort: 'latest' },
    'newest-first needs no window — a window would hide posts, not order them');
  assert.deepEqual(searchWindow('feed', 'all', now), { sort: 'latest' });
  assert.deepEqual(searchWindow('top', 'all', now), { sort: 'top' },
    'top of all time is the unbounded query');
  assert.deepEqual(searchWindow('top', 'week', now),
    { sort: 'top', since: '2026-08-19T12:00:00.000Z' });
  assert.deepEqual(searchWindow('top', 'day', now),
    { sort: 'top', since: '2026-08-25T12:00:00.000Z' });
  assert.throws(() => searchWindow('top', 'fortnight', now), /unknown timeframe/i);
  assert.throws(() => searchWindow('sideways', 'day', now), /unknown window sort/i);
});

test('4e: a hashtag stream sends the window to the server and says the scope is whole', async () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const seen = [];
  const fetchHandler = async (path) => {
    seen.push(path);
    return { ok: true, status: 200, json: async () => ({ posts: [] }) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } });
  const board = await lens.stream({ kind: 'hashtag', key: 'gardening', sort: 'top', timeframe: 'week', nowMs: now });
  assert.ok(seen[0].includes('sort=top'), seen[0]);
  assert.ok(seen[0].includes('since=2026-08-19'), seen[0]);
  assert.ok(seen[0].includes('tag=gardening'), seen[0]);
  assert.equal(board.wholeCorpus, true,
    'the board must be able to tell the user this ranked everything, not just what loaded');
});

test('4e: a hashtag stream defaults to latest and sends no window', async () => {
  const seen = [];
  const fetchHandler = async (path) => { seen.push(path); return { ok: true, status: 200, json: async () => ({ posts: [] }) }; };
  await createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } })
    .stream({ kind: 'hashtag', key: 'gardening' });
  assert.ok(seen[0].includes('sort=latest'), seen[0]);
  assert.ok(!seen[0].includes('since='), 'no window unless one was asked for');
});

test('4e: a FEED stream carries no server window — the generator has no such lever', async () => {
  const transport = async (url) => {
    assert.ok(!url.includes('sort=top'), 'getFeedSkeleton takes only limit and cursor');
    return { ok: true, status: 200, json: async () => ({ feed: [] }) };
  };
  const board = await createLens({ transport })
    .stream({ kind: 'feed', key: 'at://did:plc:a/app.bsky.feed.generator/x', sort: 'top', timeframe: 'week' });
  assert.notEqual(board.wholeCorpus, true, 'a /f/ board never claims whole-corpus scope');
});

// ---- 4d: liveness — which feeds in a search result actually still work ----
// isOnline/isValid is NOT the signal: across 915 search-result feeds it was
// false ZERO times (plan D6). The observable signal is what getFeed does — and
// its refusals do not say why (D9), so a feed that will not answer is `silent`,
// never `dead`.

test('4d: feedLiveness reads the newest post — live, stale, or empty', () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const at = (h) => ({ post: { indexedAt: new Date(now - h * 3600_000).toISOString() } });
  assert.equal(feedLiveness([at(2)], now), 'live');
  assert.equal(feedLiveness([at(167)], now), 'live', 'inside 7 days is still alive');
  assert.equal(feedLiveness([at(169)], now), 'stale');
  assert.equal(feedLiveness([], now), 'empty', 'it answered, and had nothing to say');
});

test('4d: liveness probes one feed each and calls a refusal SILENT, not dead', async () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const fresh = new Date(now - 3600_000).toISOString();
  const old = new Date(now - 900 * 3600_000).toISOString();
  const transport = async (url) => {
    const feed = new URL(url).searchParams.get('feed');
    assert.ok(url.includes('limit=1'), 'freshness needs exactly one post, not a page');
    if (feed.endsWith('live')) return { ok: true, status: 200, json: async () => ({ feed: [{ post: { indexedAt: fresh } }] }) };
    if (feed.endsWith('stale')) return { ok: true, status: 200, json: async () => ({ feed: [{ post: { indexedAt: old } }] }) };
    if (feed.endsWith('empty')) return { ok: true, status: 200, json: async () => ({ feed: [] }) };
    return { ok: false, status: 502, json: async () => ({ error: 'InternalServerError' }) };
  };
  const uris = ['a/live', 'b/stale', 'c/empty', 'd/down'];
  const out = await createLens({ transport }).liveness(uris, { nowMs: now });
  // by key, not by iteration order — completion order is a scheduling detail
  assert.equal(out.size, 4);
  assert.equal(out.get('a/live'), 'live');
  assert.equal(out.get('b/stale'), 'stale');
  assert.equal(out.get('c/empty'), 'empty');
  assert.equal(out.get('d/down'), 'silent');
});

test('4d: liveFeeds keeps live feeds and anything not yet probed, and counts what it dropped', () => {
  const feeds = [{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }, { uri: 'd' }, { uri: 'e' }];
  const states = new Map([['a', 'live'], ['b', 'stale'], ['c', 'silent'], ['d', 'empty']]);
  const { kept, stale, silent, empty } = liveFeeds(feeds, states);
  assert.deepEqual(kept.map((f) => f.uri), ['a', 'e'],
    'e has not been probed yet, so it is not hidden on the strength of no evidence');
  assert.equal(stale, 1);
  assert.equal(silent, 1);
  assert.equal(empty, 1);
});

// ---- 4c: Rising — time-windowed like counts, one request per feed ----
// app.bsky.feed.getLikes accepts a FEED GENERATOR uri and returns likes
// newest-first with timestamps (probed 2026-08-26, plan D2). So the windows are
// OURS, counted here: there is no time-bucketed aggregate anywhere in the API,
// only the cumulative likeCount. Two measured bounds shape this:
//   - a 24h window is nearly signal-free (9 of 117 feeds had >=2 likes), so it
//     is not offered;
//   - the page caps at 100, so a count that fills the page is a FLOOR, not a
//     number, and must say so.

test('4c: likeWindow counts 7d and 30d off one page, using indexedAt', () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const at = (h) => ({ indexedAt: new Date(now - h * 3600_000).toISOString() });
  const w = likeWindow([at(1), at(20), at(100), at(400), at(900)], now);
  assert.equal(w.d7, 3, 'three inside 168h');
  assert.equal(w.d30, 4, 'four inside 720h');
  assert.equal(w.capped, false);
});

test('4c: a full page is a FLOOR — capped says so rather than reporting a number', () => {
  const now = Date.parse('2026-08-26T12:00:00Z');
  const likes = Array.from({ length: 100 }, () => ({ indexedAt: new Date(now - 3600_000).toISOString() }));
  const w = likeWindow(likes, now);
  assert.equal(w.d7, 100);
  assert.equal(w.capped, true, 'the 101st like exists but this page cannot see it');
});

test('4c: an empty like list is zero, not an error', () => {
  const w = likeWindow([], Date.parse('2026-08-26T12:00:00Z'));
  assert.deepEqual({ ...w }, { d7: 0, d30: 0, capped: false });
});

test('4c: risingSort orders by the window and keeps unmeasured feeds last', () => {
  const feeds = [
    { uri: 'a', likeCount: 999 },
    { uri: 'b', likeCount: 1 },
    { uri: 'c', likeCount: 50 },
  ];
  const windows = new Map([['a', { d7: 2, d30: 9 }], ['b', { d7: 30, d30: 40 }]]);
  assert.deepEqual(sortFeeds(feeds, 'rising7', windows).map((f) => f.uri), ['b', 'a', 'c'],
    'c has no measurement yet, so it waits at the back rather than claiming zero');
  assert.deepEqual(sortFeeds(feeds, 'rising30', windows).map((f) => f.uri), ['b', 'a', 'c']);
});

test('4c: likeWindows fans out one getLikes per feed and tolerates a feed that fails', async () => {
  const calls = [];
  const now = Date.parse('2026-08-26T12:00:00Z');
  const transport = async (url) => {
    const uri = new URL(url).searchParams.get('uri');
    calls.push(uri);
    if (uri.endsWith('boom')) return { ok: false, status: 502, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ likes: [
      { indexedAt: new Date(now - 3600_000).toISOString() },
      { indexedAt: new Date(now - 400 * 3600_000).toISOString() },
    ] }) };
  };
  const lens = createLens({ transport });
  const seen = [];
  const windows = await lens.likeWindows(
    ['at://x/app.bsky.feed.generator/one', 'at://x/app.bsky.feed.generator/boom'],
    { nowMs: now, onWindow: (uri, w) => seen.push([uri, w.d7]) },
  );
  assert.equal(calls.length, 2, 'one request per feed');
  assert.ok(calls.every((u) => u.includes('app.bsky.feed.generator')));
  assert.equal(windows.get('at://x/app.bsky.feed.generator/one').d7, 1);
  assert.equal(windows.has('at://x/app.bsky.feed.generator/boom'), false,
    'a feed that fails to answer is UNMEASURED, never a silent zero');
  assert.deepEqual(seen, [['at://x/app.bsky.feed.generator/one', 1]],
    'each measurement is announced as it lands, so the board can paint progressively');
});

// ---- 4b: sorts and filters over the browse corpus (T0 — no new requests) ----
// The popular corpus is BOUNDED: 117 feeds in 2 requests, 0.62s, then
// cursor:null (probed 2026-08-26, plan D1). So browse mode holds the whole
// thing and orders it here. Search mode is the opposite — an unbounded index —
// so it stays one page and keeps the server's relevance order.

test('4b: sortFeeds orders by the T0 dimensions and refuses an unknown sort', () => {
  const f = (title, likeCount, indexedAt) => ({ title, likeCount, indexedAt });
  const feeds = [f('b', 10, '2024-01-01T00:00:00Z'), f('a', 30, '2023-01-01T00:00:00Z'), f('c', 20, '2025-01-01T00:00:00Z')];
  assert.deepEqual(sortFeeds(feeds, 'popular').map((x) => x.title), ['b', 'a', 'c'],
    'popular is the AppView\'s own order, untouched — we do not re-rank what we did not rank');
  assert.deepEqual(sortFeeds(feeds, 'likes').map((x) => x.title), ['a', 'c', 'b']);
  assert.deepEqual(sortFeeds(feeds, 'new').map((x) => x.title), ['c', 'b', 'a']);
  assert.deepEqual(sortFeeds(feeds, 'old').map((x) => x.title), ['a', 'b', 'c']);
  assert.throws(() => sortFeeds(feeds, 'rising'), /unknown feed sort/i);
});

test('4b: sortFeeds does not mutate its input', () => {
  const feeds = [{ title: 'b', likeCount: 1 }, { title: 'a', likeCount: 9 }];
  sortFeeds(feeds, 'likes');
  assert.deepEqual(feeds.map((f) => f.title), ['b', 'a']);
});

test('4b: filterFeeds narrows by builder platform and by video mode', () => {
  const feeds = [
    { title: 'sky', platform: 'skyfeed.me', video: false },
    { title: 'graze', platform: 'api.graze.social', video: false },
    { title: 'vid', platform: 'skyfeed.me', video: true },
  ];
  assert.deepEqual(filterFeeds(feeds, { platform: 'skyfeed.me' }).map((f) => f.title), ['sky', 'vid']);
  assert.deepEqual(filterFeeds(feeds, { video: true }).map((f) => f.title), ['vid']);
  assert.deepEqual(filterFeeds(feeds, { platform: 'skyfeed.me', video: true }).map((f) => f.title), ['vid']);
  assert.deepEqual(filterFeeds(feeds, {}).length, 3, 'no filter is not a filter');
});

test('4b: platforms() counts the builder platforms present, most first', () => {
  const feeds = [{ platform: 'skyfeed.me' }, { platform: 'api.graze.social' }, { platform: 'skyfeed.me' }];
  assert.deepEqual(platforms(feeds), [
    { host: 'skyfeed.me', count: 2 }, { host: 'api.graze.social', count: 1 },
  ]);
});

test('4b: browse mode pages the WHOLE corpus; a query stays one page', async () => {
  const calls = [];
  const page = (n, cursor) => ({ feeds: Array.from({ length: n }, (_, i) => ({
    uri: `at://did:plc:a/app.bsky.feed.generator/f${cursor || 0}-${i}`, displayName: `f${i}`,
    did: 'did:web:skyfeed.me', likeCount: i, indexedAt: '2025-01-01T00:00:00Z', labels: [],
  })), ...(cursor ? { cursor } : {}) });
  const transport = async (url) => {
    calls.push(url);
    const c = new URL(url).searchParams.get('cursor');
    return { ok: true, status: 200, json: async () => (c ? page(17, undefined) : page(100, '9884')) };
  };
  const lens = createLens({ transport });
  const all = await lens.discoverFeeds();
  assert.equal(all.length, 117, 'both pages, because the corpus is bounded and small');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('cursor=9884'));

  calls.length = 0;
  const found = await lens.discoverFeeds({ query: 'cats' });
  assert.equal(calls.length, 1, 'search is an unbounded index — one page, server order');
  assert.equal(found.length, 100);
});

test('4b: a discovered feed carries its T0 dimensions', async () => {
  const transport = async () => ({ ok: true, status: 200, json: async () => ({ feeds: [
    { uri: 'at://did:plc:a/app.bsky.feed.generator/x1', displayName: 'Reels', description: 'v',
      did: 'did:web:api.graze.social', likeCount: 7, indexedAt: '2025-03-04T05:06:07Z',
      contentMode: 'app.bsky.feed.defs#contentModeVideo', acceptsInteractions: true,
      creator: { did: 'did:plc:c', handle: 'maker.test' }, labels: [] },
  ] }) });
  const [f] = await createLens({ transport }).discoverFeeds({ query: 'x' });
  assert.equal(f.platform, 'api.graze.social', 'the service DID is the builder platform');
  assert.equal(f.video, true);
  assert.equal(f.indexedAt, '2025-03-04T05:06:07Z');
  assert.equal(f.acceptsInteractions, true);
  assert.equal(f.creatorDid, 'did:plc:c');
});

test('4a: discovery applies the account posture to FEEDS — adult-labelled feeds do not surface for a guest', async () => {
  const transport = async () => ({ ok: true, status: 200, json: async () => ({ feeds: [
    { uri: 'at://did:plc:a/app.bsky.feed.generator/clean', displayName: 'Garden Talk',
      description: 'plants', likeCount: 9, creator: { handle: 'grower.test' }, labels: [] },
    { uri: 'at://did:plc:a/app.bsky.feed.generator/adult', displayName: 'NSFW Feed',
      description: 'x', likeCount: 99, creator: { handle: 'x.test' }, labels: [{ val: 'porn' }] },
    { uri: 'at://did:plc:a/app.bsky.feed.generator/gore', displayName: 'Graphic Feed',
      description: 'y', likeCount: 5, creator: { handle: 'y.test' }, labels: [{ val: 'graphic-media' }] },
  ] }) });
  // A guest has no preferences to mirror, so adult content is OFF (4a).
  const feeds = await createLens({ transport }).discoverFeeds();
  // OQ5 DECIDED (owner, 2026-08-26): a logged-out visitor gets the strictest
  // stance, so `graphic-media` is on the guest floor and goes too. Before the
  // decision this test asserted the opposite — that a non-adult label with no
  // pref against it passed through. It no longer does.
  assert.deepEqual(feeds.map((f) => f.title), ['Garden Talk'],
    'a guest sees neither the adult feed nor the graphic one');
  assert.equal(feeds[0].warnLabels, undefined, 'and what remains is not veiled');
});

test('4a: a JOINED adult feed drops out of the Feeds list too — one rule on every feed surface', async () => {
  const ADULT = 'at://did:plc:x/app.bsky.feed.generator/afterdark';
  const CLEAN = 'at://did:plc:g/app.bsky.feed.generator/gardentalk';
  const fetchHandler = async (path) => {
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (path.includes('getPreferences')) return json({ preferences: [{
      $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
      items: [{ type: 'feed', value: CLEAN, pinned: true, id: '1' },
              { type: 'feed', value: ADULT, pinned: true, id: '2' },
              { type: 'timeline', value: 'following', pinned: true, id: '3' }] }] });
    if (path.includes('getFeedGenerators')) return json({ feeds: [
      { uri: CLEAN, displayName: 'Garden Talk', labels: [] },
      { uri: ADULT, displayName: 'After Dark', labels: [{ val: 'porn' }] }] });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const feeds = await createLens({ session: { did: 'did:plc:me', handle: 'me.test', fetchHandler } }).feeds();
  assert.deepEqual(feeds.map((f) => f.title), ['Garden Talk', 'Following'],
    'the adult feed is gone from the sidebar; joining it earlier does not override the account setting');
});

test('4a: feedInfo carries the label verdict so a board header can veil its own feed', async () => {
  const URI = 'at://did:plc:a/app.bsky.feed.generator/aaa111';
  const transport = async () => ({ ok: true, status: 200, json: async () => ({ view: {
    uri: URI, displayName: 'Graphic Feed', description: 'y', likeCount: 1,
    creator: { handle: 'y.test' }, labels: [{ val: 'porn' }],
  }, isOnline: true, isValid: true }) });
  const info = await createLens({ transport }).feedInfo(URI);
  assert.equal(info.hidden, true, 'adult-off means the board itself is a refusal, not a render');
});

test('3j/3s: joinFeed and favoriteFeed write through putPreferences and refuse without a session', async () => {
  const URI = 'at://did:plc:a/app.bsky.feed.generator/aaa111';
  await assert.rejects(() => createLens({}).joinFeed(URI), /session|sign/i);
  await assert.rejects(() => createLens({}).favoriteFeed(URI, true), /session|sign/i);

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
  await lens.joinFeed(URI);
  const put = calls.find((c) => c.path.includes('putPreferences'));
  assert.ok(put, 'putPreferences called');
  const savedPref = put.body.preferences.find((p) => p.$type.endsWith('savedFeedsPrefV2'));
  assert.equal(savedPref.items[0].value, URI);
  assert.equal(savedPref.items[0].pinned, false, 'joining leaves the official tab bar alone');

  // 3s: favoriting is its own write, and it pins the entry in place
  calls.length = 0;
  await lens.favoriteFeed(URI, true);
  const fav = calls.find((c) => c.path.includes('putPreferences'));
  const favPref = fav.body.preferences.find((p) => p.$type.endsWith('savedFeedsPrefV2'));
  assert.equal(favPref.items[0].pinned, true);
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

// ---- 3m: the affordance split — hashtags are targetable, feeds are not ----

test('3m: affordanceFor(hashtag) promises a DETERMINISTIC way in; feeds promise nothing of the sort', async () => {
  const { affordanceFor } = await import('../js/substrates/lens.js');

  const tag = affordanceFor({ kind: 'hashtag', key: 'gardening' });
  assert.equal(tag.targetable, true);
  assert.match(tag.headline, /anyone can post/i);
  assert.match(tag.detail, /#gardening/, 'the literal tag is the instruction');
  assert.equal(tag.composeLabel, 'Post to #gardening');

  const feed = affordanceFor({ kind: 'feed', info: { title: 'Garden Talk', creator: 'grower.test', description: 'Post with #gardening to appear here.' } });
  assert.equal(feed.targetable, false, 'a feed decides for itself — we never promise entry');
  assert.match(feed.headline, /curated by @grower\.test/i);
  assert.equal(feed.composeLabel, null, 'no post-to button: it would be a lie (DL-025)');
  assert.equal(feed.detail, 'Post with #gardening to appear here.', 'the description is rendered VERBATIM — it is the only inclusion rule that exists');
  // a feed with no description says so plainly rather than inventing guidance
  const bare = affordanceFor({ kind: 'feed', info: { title: 'X', creator: 'a.test', description: '' } });
  assert.match(bare.detail, /does not say|no description/i);
  assert.equal(bare.targetable, false);
});

// ---- 3p: ONE box above a feed board ----

test('3p: feedCardModel never restates the feed title — the <h1> above it already does', async () => {
  const { feedCardModel } = await import('../js/substrates/lens.js');

  const info = { uri: 'at://did:x/app.bsky.feed.generator/funny', title: 'Funny', creator: 'alexismadd.bsky.social',
    likeCount: 16, avatar: 'https://cdn.test/a.png',
    description: 'Just funny stuff. Add to feed by tagging #funny, #lol, #comedy, or #standup' };
  const m = feedCardModel(info);

  // the dupe observed 2026-08-26: the card said "Funny" under a heading that
  // already said "Funny", and then a SECOND box repeated the description.
  assert.equal(m.title, undefined, 'the card carries no title feed at all — it cannot drift back');
  assert.doesNotMatch(m.headline, /Funny/, 'the headline says who curates, not what it is called');
  assert.equal(m.headline, 'Curated by @alexismadd.bsky.social.');
  assert.equal(m.avatar, 'https://cdn.test/a.png', 'the logo stays — it is the one thing worth the space');
  assert.equal(m.likeCount, 16);
  assert.equal(m.blurb, info.description, 'the feed’s own words, verbatim (DL-025)');
  assert.equal(m.blurbIsOwnWords, true, 'quotable: this text came FROM the feed');
});

test('3p: a feed with no description still gets one box, and the blurb is ours — not quotable', async () => {
  const { feedCardModel } = await import('../js/substrates/lens.js');
  const m = feedCardModel({ uri: 'at://x/y/z', title: 'X', creator: 'a.test', likeCount: 0, description: '' });
  assert.equal(m.blurbIsOwnWords, false, 'we must not quote OUR fallback as if the feed said it');
  assert.match(m.blurb, /does not say/i);
  assert.equal(m.avatar, null);
});

// --- 4h: what a compact `f/…` link calls a source ---------------------------
// Reported by the owner 2026-08-26: the guest sidebar showed `f/whats-hot` — a
// record key — where every other surface shows a display name.
//
// The rule is the same for every kind of source: show the NAME, fall back to
// the slug. An earlier draft special-cased author boards to their handle on
// the grounds that handles are unique and stable where display names are
// neither. The owner overruled it (2026-08-26): a person reading a sidebar
// wants the name, and the handle is still the route, the href and the title
// attribute. The argument was about identifiers; the sidebar is about reading.
test('4h: a FEED source is named by its display name, not its record key', async () => {
  const { sourceLabel } = await import('../js/substrates/lens.js');
  assert.equal(sourceLabel({ slug: 'whats-hot', title: 'Discover', kind: 'feed' }), 'Discover');
});

test('4h: an AUTHOR source is named the same way — by its display name, not its handle', async () => {
  const { sourceLabel } = await import('../js/substrates/lens.js');
  assert.equal(sourceLabel({ slug: 'bsky.app', title: 'Bluesky', kind: 'author' }), 'Bluesky');
});

test('4h: no name of any kind falls back to the slug — the same fallback the network paths use', async () => {
  const { sourceLabel } = await import('../js/substrates/lens.js');
  assert.equal(sourceLabel({ slug: 'afterdark', title: '', kind: 'feed' }), 'afterdark');
  assert.equal(sourceLabel({ slug: 'nobody.test', kind: 'author' }), 'nobody.test');
});

test('4h: an entry with neither a name nor a slug fails loudly, showing what it got', async () => {
  const { sourceLabel } = await import('../js/substrates/lens.js');
  assert.throws(() => sourceLabel({ kind: 'feed' }), /sourceLabel/);
});
