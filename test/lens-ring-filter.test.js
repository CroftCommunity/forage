// The ring as a DISPLAY SCOPE — plan 2026-09-03.
//
// The ring used to be a board you navigated to, so it touched exactly the
// surface you were standing on. It is now a filter, and the owner's order is
//
//     blocks -> mutes -> ring -> display
//
// which is why every test here is about POSITION as much as effect. The ring is
// the last policy to run and the weakest: anything an earlier one hid stays
// hidden whatever the ring says, and the ring can only ever remove.
//
// It applies site-wide, threads included (owner, 2026-09-03: "yes, it should
// apply site wide"). The one exemption is feeds and hashtags, and it is a
// reader setting rather than a rule — see EXEMPT_KINDS in js/ring-scope.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shapeLensPost, shapeLensFeed, shapeLensThread, buildPosture, withRing, EMPTY_POSTURE,
  createLens, absentStops,
} from '../js/substrates/lens.js';

const ME = 'did:plc:me';
const dids = (n, prefix) => Array.from({ length: n }, (_, i) => `did:plc:${prefix}${i}`);

// Canned paginated graph, as in test/lens-rings.test.js.
function graphSession(pages) {
  const calls = [];
  const fetchHandler = async (path) => {
    const u = new URL('http://x' + path);
    const method = u.pathname.split('/').pop().replace('app.bsky.graph.', '');
    const actor = u.searchParams.get('actor');
    const cursor = parseInt(u.searchParams.get('cursor') ?? '0', 10);
    calls.push({ method, actor, cursor });
    const pageList = pages[`${method}:${actor}`] ?? [[]];
    const page = pageList[cursor] ?? [];
    return { ok: true, status: 200, json: async () => ({
      [method === 'getFollowers' ? 'followers' : 'follows']: page.map((did) => ({ did, handle: did.slice(8) + '.test' })),
      ...(cursor + 1 < pageList.length ? { cursor: String(cursor + 1) } : {}),
    }) };
  };
  return { session: { did: ME, handle: 'me.test', fetchHandler }, calls };
}

const SRC = { feedId: 'lens:x', feedSlug: 'x', feedTitle: 'X' };
const feedSrc = (kind) => ({ ...SRC, feedKind: kind });

let seq = 0;
const mkPost = (did, text = 'hello') => ({
  uri: `at://${did}/app.bsky.feed.post/p${++seq}`, cid: `c${seq}`,
  author: { did, handle: `${did.split(':').pop()}.test` },
  record: { text, createdAt: '2026-09-03T10:00:00Z' },
  indexedAt: '2026-09-03T10:00:00Z', likeCount: 0, replyCount: 0,
});

const IN = 'did:plc:in';
// A SECOND in-ring account, because a reply by the root's own author is hoisted
// into the post body by the self-thread rule and never reaches `comments`. The
// ring is not involved in that; using one did would have tested the hoist.
const IN2 = 'did:plc:in2';
const OUT = 'did:plc:out';
const ring = (members, exemptKinds = []) => withRing(EMPTY_POSTURE, { members, exemptKinds });

// ---- withRing ----

test('withRing is pure and leaves the posture it was given alone', () => {
  const before = buildPosture({}, Date.now());
  const after = withRing(before, { members: [IN], exemptKinds: ['feed'] });
  assert.equal(before.ring, undefined, 'the input posture is not touched');
  assert.notEqual(after, before, 'a new posture comes back');
  assert.ok(after.ring.members instanceof Set, 'members arrive as a Set to test against');
  assert.ok(after.ring.exemptKinds instanceof Set);
  assert.equal(after.mutedWords, before.mutedWords, 'and the rest of the posture rides along');
});

test('a null member list is World — present, and filtering nothing', () => {
  const p = withRing(EMPTY_POSTURE, { members: null });
  assert.equal(p.ring.members, null, 'null is "do not filter"; an empty Set would be "filter to nobody"');
  assert.equal(shapeLensPost(mkPost(OUT), SRC, p).hidden, undefined);
});

test('a posture with no ring at all filters nothing', () => {
  assert.equal(shapeLensPost(mkPost(OUT), SRC, EMPTY_POSTURE).hidden, undefined);
});

test('World is UNRINGED, not unfiltered — every earlier policy still applies', () => {
  // Owner, 2026-09-03: "no lack of all filters — still blocks, moderation etc,
  // just not ring filtered". World is the ring declining to narrow, and nothing
  // more. It is the last policy in the order that goes quiet, not all of them.
  const now = Date.now();
  const world = withRing(buildPosture({
    mutes: [{ did: OUT }],
    preferences: [{
      $type: 'app.bsky.actor.defs#mutedWordsPref',
      items: [{ value: 'spoiler', targets: ['content'] }],
    }],
  }, now), { members: null });

  assert.equal(shapeLensPost(mkPost(OUT), SRC, world).hidden, true, 'a muted account is still hidden at World');
  assert.equal(shapeLensPost(mkPost(IN, 'a spoiler'), SRC, world).hidden, true, 'a muted word still bites at World');

  const blocked = withRing(buildPosture({ blocks: [{ did: OUT }] }, now), { members: null });
  assert.equal(shapeLensFeed({ feed: [{ post: mkPost(OUT) }] }, SRC, {}, blocked).posts.length, 0,
    'a blocked account never renders at World either');

  assert.equal(shapeLensPost(mkPost(IN), SRC, world).hidden, undefined,
    'and an ordinary post rides through, which is the only thing World changes');
});

// ---- the filter ----

test('inside the ring renders; outside the ring is absent', () => {
  const p = ring([IN]);
  const inside = shapeLensPost(mkPost(IN), SRC, p);
  assert.equal(inside.hidden, undefined);
  assert.equal(inside.body, 'hello');

  const outside = shapeLensPost(mkPost(OUT), SRC, p);
  assert.equal(outside.hidden, true);
});

test('the ring hides ABSENTLY — it never announces what it withheld', () => {
  // Owner, 2026-08-26, on mutes: a row saying what it withheld defeats the
  // withholding twice. A ring is the reader's own instruction about what they
  // want to see, so it earns the same treatment and no wording of its own.
  const out = shapeLensPost(mkPost(OUT, 'a secret'), SRC, ring([IN]));
  assert.equal(out.body, '');
  assert.equal(out.title, '');
  assert.equal(out.author, null);
  assert.equal(out.authorId, null);
  const blob = JSON.stringify(out).toLowerCase();
  assert.ok(!blob.includes('ring'), 'no ring wording reaches a shaped post');
  assert.ok(!blob.includes('a secret'), 'and neither does the text it hid');
});

// ---- position in the order ----

test('mutes beat the ring: a muted author INSIDE the ring stays hidden', () => {
  const posture = withRing(
    { ...buildPosture({ mutes: [{ did: IN }] }, Date.now()) },
    { members: [IN] },
  );
  assert.equal(shapeLensPost(mkPost(IN), SRC, posture).hidden, true,
    'the ring can only ever remove — it never restores what an earlier policy hid');
});

test('blocks beat the ring: a blocked author is gone before the ring is consulted', () => {
  const posture = withRing(buildPosture({ blocks: [{ did: IN }] }, Date.now()), { members: [IN] });
  const board = shapeLensFeed({ feed: [{ post: mkPost(IN) }] }, SRC, {}, posture);
  assert.equal(board.posts.length, 0, 'filtered pre-shape, ring membership irrelevant');
});

test('a muted WORD beats the ring too', () => {
  const base = buildPosture({ preferences: [{
    $type: 'app.bsky.actor.defs#mutedWordsPref',
    items: [{ value: 'spoiler', targets: ['content'] }],
  }] }, Date.now());
  const posture = withRing(base, { members: [IN] });
  assert.equal(shapeLensPost(mkPost(IN, 'a spoiler'), SRC, posture).hidden, true);
});

// ---- boards ----

test('a board drops out-of-ring posts from the list, not just from the render', () => {
  const board = shapeLensFeed(
    { feed: [{ post: mkPost(IN) }, { post: mkPost(OUT) }] }, SRC, {}, ring([IN]),
  );
  assert.deepEqual(board.posts.map((p) => p.authorId), [IN]);
});

test('a ring nobody is in paints an empty board rather than an error', () => {
  // The honestly-empty board is the whole point of the feature, and the owner
  // named it: "a feed may look empty if no one you are following is active,
  // that's intended".
  const board = shapeLensFeed({ feed: [{ post: mkPost(OUT) }] }, SRC, {}, ring([]));
  assert.deepEqual(board.posts, []);
});

// ---- the feeds/hashtags exemption ----

test('an exempt kind arrives whole, however far outside the ring its authors are', () => {
  for (const kind of ['feed', 'hashtag']) {
    const p = ring([IN], ['feed', 'hashtag']);
    assert.equal(shapeLensPost(mkPost(OUT), feedSrc(kind), p).hidden, undefined, `${kind} is exempt`);
  }
});

test('with the exemption off, a feed is scoped like everything else', () => {
  const p = ring([IN], []);
  assert.equal(shapeLensPost(mkPost(OUT), feedSrc('feed'), p).hidden, true);
  assert.equal(shapeLensPost(mkPost(OUT), feedSrc('hashtag'), p).hidden, true);
});

test('a board with no kind is never exempt — the exemption names kinds, not absence', () => {
  const p = ring([IN], ['feed', 'hashtag']);
  assert.equal(shapeLensPost(mkPost(OUT), SRC, p).hidden, true);
});

// ---- threads ----

test('the ring reaches a thread: an out-of-ring reply drops, subtree included', () => {
  const thread = {
    thread: {
      post: mkPost(IN, 'the root'),
      replies: [
        { post: mkPost(OUT, 'outside'), replies: [{ post: mkPost(IN2, 'a grandchild inside'), replies: [] }] },
        { post: mkPost(IN2, 'inside'), replies: [] },
      ],
    },
  };
  const shaped = shapeLensThread(thread, SRC, { posture: ring([IN, IN2]) });
  const bodies = shaped.comments.map((c) => c.body);
  assert.deepEqual(bodies, ['inside'], 'the out-of-ring reply is gone');
  const blob = JSON.stringify(shaped);
  assert.ok(!blob.includes('a grandchild inside'),
    'and its subtree with it, the same way a blocked branch already goes');
});

test('the ring reaches the quote cascade too: an out-of-ring quoter is absent, not a [removed] stub', () => {
  // Owner, 2026-09-04, at Follows on a Bluesky Team post: "it looks like the
  // posts were deleted". Replies from outside the ring were dropped; QUOTES
  // from outside it were shaped, found hidden, and built into nodes anyway —
  // so every stranger who quoted the post drew as a `[removed]` byline over an
  // empty body. Same rule as a reply: absent, subtree included.
  const thread = { thread: { post: mkPost(IN, 'the root'), replies: [] } };
  const quotes = [
    { post: mkPost(OUT, 'a stranger quoting'), replies: [{ post: mkPost(IN2, 'a friend under the stranger'), replies: [] }] },
    { post: mkPost(IN2, 'a friend quoting'), replies: [] },
  ];
  const shaped = shapeLensThread(thread, SRC, { quotes, posture: ring([IN, IN2]) });
  assert.deepEqual(shaped.comments.map((c) => c.body), ['a friend quoting']);
  assert.ok(!shaped.comments.some((c) => c.maskedRemoved), 'no stub stands where the stranger was');
  assert.equal(shaped.total, 1, 'and the count is what is drawn');
  assert.ok(!JSON.stringify(shaped).includes('a friend under the stranger'),
    'the subtree goes with it, as it does under an out-of-ring reply');
});

test('a thread whose ROOT is outside the ring shapes as hidden rather than blank', () => {
  // Reachable by direct link, search or a notification. The view needs to be
  // able to tell "your ring hid this" from "this post does not exist", so the
  // signal has to survive shaping.
  const shaped = shapeLensThread({ thread: { post: mkPost(OUT), replies: [] } }, SRC, { posture: ring([IN]) });
  assert.equal(shaped.post.hidden, true);
});

// ---- the punch-hole: a thread on a post from inside the ring ----
//
// Owner, 2026-09-04: at Mutuals "this is the whole universe. Like there are
// only mutuals and mutuals' activities" — with "this one kind of other punch
// hole just for practicality": on a post from someone IN the ring, the replies
// from outside it show, because a post you cannot see the answers to is hard
// to interact with. It is a reader setting (`opensThreads`), on by default,
// and it rides the ring spec so a thread override keeps it.

const openRing = (members, opensThreads = true) => withRing(EMPTY_POSTURE, { members, opensThreads });
const mixedThread = (rootDid) => ({
  thread: {
    post: mkPost(rootDid, 'the root'),
    replies: [
      { post: mkPost(OUT, 'a stranger answers'), replies: [{ post: mkPost(OUT, 'another stranger, deeper'), replies: [] }] },
      { post: mkPost(IN2, 'a friend answers'), replies: [] },
    ],
  },
});
const mixedQuotes = () => [{ post: mkPost(OUT, 'a stranger quotes'), replies: [] }];

test('withRing carries opensThreads, off unless asked', () => {
  assert.equal(withRing(EMPTY_POSTURE, { members: [IN] }).ring.opensThreads, false);
  assert.equal(openRing([IN]).ring.opensThreads, true);
});

test('a post from INSIDE the ring shows every reply and quote, whoever wrote them', () => {
  const shaped = shapeLensThread(mixedThread(IN), SRC, { quotes: mixedQuotes(), posture: openRing([IN, IN2]) });
  assert.deepEqual(shaped.comments.map((c) => c.body).sort(),
    ['a friend answers', 'a stranger answers', 'a stranger quotes']);
  assert.ok(JSON.stringify(shaped).includes('another stranger, deeper'), 'the whole thread, not just direct replies');
});

test('a post from OUTSIDE the ring stays hidden — the punch-hole opens threads, it does not admit posts', () => {
  const shaped = shapeLensThread(mixedThread(OUT), SRC, { quotes: mixedQuotes(), posture: openRing([IN, IN2]) });
  assert.equal(shaped.post.hidden, true);
  assert.equal(shaped.post.hiddenReason, 'scope');
});

test('with the punch-hole off, an in-ring post shows only in-ring replies', () => {
  const shaped = shapeLensThread(mixedThread(IN), SRC, { quotes: mixedQuotes(), posture: openRing([IN, IN2], false) });
  assert.deepEqual(shaped.comments.map((c) => c.body), ['a friend answers']);
});

test('the punch-hole opens the RING only — a muted stranger stays muted under a friend', () => {
  const posture = withRing(
    { ...EMPTY_POSTURE, mutedDids: new Set([OUT]) },
    { members: [IN, IN2], opensThreads: true });
  const shaped = shapeLensThread(mixedThread(IN), SRC, { quotes: mixedQuotes(), posture });
  assert.deepEqual(shaped.comments.map((c) => c.body), ['a friend answers']);
});

test('at World the punch-hole is moot, and changes nothing', () => {
  // A third author for the root, so the self-thread hoist (a reply by the root's
  // own author is body, not a comment) stays out of the count.
  const on = shapeLensThread(mixedThread('did:plc:third'), SRC, { quotes: mixedQuotes(), posture: openRing(null, true) });
  const off = shapeLensThread(mixedThread('did:plc:third'), SRC, { quotes: mixedQuotes(), posture: openRing(null, false) });
  assert.equal(on.post.hidden, undefined);
  assert.deepEqual(on.comments.map((c) => c.body).sort(), ['a friend answers', 'a stranger answers', 'a stranger quotes']);
  assert.deepEqual(on.comments.map((c) => c.body).sort(), off.comments.map((c) => c.body).sort());
});

// ---- the substrate's uncapped path ----
//
// scopeMembersFor() feeds the filter and is not capped, because filtering
// issues no requests. It had a capped sibling, ringMembers(), which fed the
// merged ring board's one-request-per-member fan-out; that board was retired
// with /r/<rung> on 2026-09-03 and the cap went with it.

test('scopeMembersFor returns every member — the cap is a fan-out bound, not a filter bound', async () => {
  const many = dids(35, 'f');
  const { session } = graphSession({
    [`getFollows:${ME}`]: [many],
    [`getFollowers:${ME}`]: [many],
  });
  const lens = createLens({ session });
  const { members, overflow } = await lens.scopeMembersFor('fol');
  assert.equal(members.length, many.length + 1, 'me plus all of them');
  assert.equal(overflow, undefined);
});

test('scopeMembersFor: World needs no graph at all', async () => {
  const { session, calls } = graphSession({});
  const lens = createLens({ session });
  assert.deepEqual(await lens.scopeMembersFor('world'), { members: null });
  assert.equal(calls.length, 0, 'the default scope costs nothing, which is why it is the default');
});

test('scopeMembersFor refuses an unknown scope, and refuses without a session', async () => {
  const { session } = graphSession({});
  await assert.rejects(() => createLens({ session }).scopeMembersFor('following'), /unknown rung/i);
  await assert.rejects(() => createLens({}).scopeMembersFor('fol'), /needs a session/i);
});

test('forgetRings drops the filter set too — a new account is a new graph', async () => {
  const { session, calls } = graphSession({
    [`getFollows:${ME}`]: [['did:plc:a']], [`getFollowers:${ME}`]: [['did:plc:a']],
  });
  const lens = createLens({ session });
  await lens.scopeMembersFor('fol');
  const first = calls.length;
  lens.forgetRings();
  await lens.scopeMembersFor('fol');
  assert.ok(calls.length > first, 're-walked rather than serving another account the last one');
});

// ---- applying a scope to the live posture ----
//
// The ring has to ride the SAME posture object the boards already read, or the
// shape layer would need a second argument threaded through eleven call sites.
// It also has to survive a moderation reload: loadPosture() replaces the
// posture wholesale, and a reader whose mutes refreshed must not silently find
// themselves back at World.

const postSession = (pages, graph = {}) => {
  const g = graphSession(graph);
  const fetchHandler = async (path, init) => {
    if (path.includes('app.bsky.graph.getFollow')) return g.session.fetchHandler(path, init);
    const name = path.split('?')[0].split('/').pop();
    return { ok: true, status: 200, json: async () => pages[name] ?? {} };
  };
  return { session: { did: ME, handle: 'me.test', fetchHandler }, calls: g.calls };
};

const MOD = {
  'app.bsky.actor.getPreferences': { preferences: [] },
  'app.bsky.graph.getMutes': { mutes: [{ did: 'did:plc:muted' }] },
  'app.bsky.graph.getBlocks': { blocks: [] },
  'app.bsky.graph.getListMutes': { lists: [] },
  'app.bsky.graph.getListBlocks': { lists: [] },
};

test('applyScope puts the ring on the posture the boards already read', async () => {
  const { session } = postSession(MOD, {
    [`getFollows:${ME}`]: [['did:plc:a']], [`getFollowers:${ME}`]: [['did:plc:a']],
  });
  const lens = createLens({ session });
  await lens.applyScope('fol', { exemptKinds: ['feed'] });
  const p = lens.posture();
  assert.ok(p.ring.members.has('did:plc:a'));
  assert.ok(p.ring.members.has(ME), 'the ladder is cumulative from me outward');
  assert.ok(p.ring.exemptKinds.has('feed'));
});

test('applyScope("world") un-narrows without disturbing anything else', async () => {
  const { session } = postSession(MOD, {
    [`getFollows:${ME}`]: [['did:plc:a']], [`getFollowers:${ME}`]: [['did:plc:a']],
  });
  const lens = createLens({ session });
  await lens.loadPosture();
  await lens.applyScope('fol');
  await lens.applyScope('world');
  const p = lens.posture();
  assert.equal(p.ring.members, null);
  assert.ok(p.mutedDids.has('did:plc:muted'), 'World is unringed, not unmoderated');
});

test('a moderation reload does NOT quietly drop the reader out of their scope', async () => {
  const { session } = postSession(MOD, {
    [`getFollows:${ME}`]: [['did:plc:a']], [`getFollowers:${ME}`]: [['did:plc:a']],
  });
  const lens = createLens({ session });
  await lens.applyScope('fol', { exemptKinds: ['feed', 'hashtag'] });
  await lens.loadPosture();                       // e.g. the reader muted a word on bsky.app
  const p = lens.posture();
  assert.ok(p.ring.members?.has('did:plc:a'), 'still scoped to follows');
  assert.ok(p.ring.exemptKinds.has('hashtag'), 'and still exempting what it was');
  assert.ok(p.mutedDids.has('did:plc:muted'), 'with the fresh moderation applied');
});

// ---- the thread override ----
//
// Owner, 2026-09-03: a pill at the top of a thread that "just overrides the
// thread". Transient by construction — the override is an argument to one call,
// so leaving the thread cannot fail to drop it. The site-wide scope is never
// written, which is the whole difference between this and the masthead pill.

const THREAD = (rootDid, replyDid) => ({
  thread: {
    post: {
      uri: `at://${rootDid}/app.bsky.feed.post/root`, cid: 'cr',
      author: { did: rootDid, handle: 'root.test' },
      record: { text: 'the root', createdAt: '2026-09-03T10:00:00Z' },
      indexedAt: '2026-09-03T10:00:00Z',
    },
    replies: [{
      post: {
        uri: `at://${replyDid}/app.bsky.feed.post/kid`, cid: 'ck',
        author: { did: replyDid, handle: 'kid.test' },
        record: { text: 'from outside', createdAt: '2026-09-03T11:00:00Z' },
        indexedAt: '2026-09-03T11:00:00Z',
      },
      replies: [],
    }],
  },
});

const threadLens = async () => {
  const { session } = postSession({
    ...MOD,
    'app.bsky.feed.getPostThread': THREAD(ME, OUT),
    'app.bsky.feed.getQuotes': { posts: [] },
  }, { [`getFollows:${ME}`]: [[]], [`getFollowers:${ME}`]: [[]] });
  const lens = createLens({ session });
  await lens.applyScope('fol');          // ME only: OUT is outside it
  return lens;
};

test('without an override, a thread obeys the site-wide scope', async () => {
  const lens = await threadLens();
  const t = await lens.thread(`at://${ME}/app.bsky.feed.post/root`, SRC);
  assert.deepEqual(t.comments.map((c) => c.body), [], 'the out-of-ring reply is scoped away');
});

test('an override widens THIS thread and writes nothing', async () => {
  const lens = await threadLens();
  const before = lens.posture().ring.members;
  const t = await lens.thread(`at://${ME}/app.bsky.feed.post/root`, SRC, { ringOverride: 'world' });
  assert.deepEqual(t.comments.map((c) => c.body), ['from outside'], 'World here shows the reply');
  assert.equal(lens.posture().ring.members, before,
    'and the site-wide scope is exactly what it was — the override never touched it');

  const after = await lens.thread(`at://${ME}/app.bsky.feed.post/root`, SRC);
  assert.deepEqual(after.comments.map((c) => c.body), [], 'the next thread is scoped again');
});

test('applyScope carries the punch-hole onto the posture, and an override keeps it', async () => {
  const { session } = postSession({
    ...MOD,
    'app.bsky.feed.getPostThread': THREAD(ME, OUT),
    'app.bsky.feed.getQuotes': { posts: [] },
  }, { [`getFollows:${ME}`]: [[]], [`getFollowers:${ME}`]: [[]] });
  const lens = createLens({ session });
  await lens.loadPosture();
  await lens.applyScope('fol', { opensThreads: true });
  assert.equal(lens.posture().ring.opensThreads, true);
  const t = await lens.thread(`at://${ME}/app.bsky.feed.post/root`, SRC);
  assert.deepEqual(t.comments.map((c) => c.body), ['from outside'], 'my own post: the stranger shows');
  const o = await lens.thread(`at://${ME}/app.bsky.feed.post/root`, SRC, { ringOverride: 'mut' });
  assert.deepEqual(o.comments.map((c) => c.body), ['from outside'], 'and still shows under an override');
  await lens.loadPosture();
  assert.equal(lens.posture().ring.opensThreads, true, 'a moderation reload keeps it');
});

test('an override keeps the reader moderation and their exemptions', async () => {
  const { session } = postSession({
    ...MOD,
    'app.bsky.graph.getMutes': { mutes: [{ did: OUT }] },
    'app.bsky.feed.getPostThread': THREAD(ME, OUT),
    'app.bsky.feed.getQuotes': { posts: [] },
  }, { [`getFollows:${ME}`]: [[]], [`getFollowers:${ME}`]: [[]] });
  const lens = createLens({ session });
  await lens.loadPosture();
  await lens.applyScope('fol', { exemptKinds: ['feed'] });
  const t = await lens.thread(`at://${ME}/app.bsky.feed.post/root`, SRC, { ringOverride: 'world' });
  assert.deepEqual(t.comments.map((c) => c.body), [],
    'widening the ring does not un-mute anyone — World is unringed, not unmoderated');
  assert.ok(lens.posture().ring.exemptKinds.has('feed'), 'and the exemption survived the override');
});

test('your OWN posts never vanish from your own thread, however tight the ring', async () => {
  // Raised by croftc-ba (2026-09-03) against their signed-in-as-the-poster
  // fixture: if the ring scopes thread replies through p.hidden, can a reader
  // narrow themselves out of their own conversation?
  //
  // No — and the reason is structural rather than a special case. Every rung is
  // a cumulative union starting at `me` (js/rings.js `chain`), so the reader's
  // own DID is in the tightest ring there is. Pinned here because "it follows
  // from the ladder" is exactly the kind of guarantee a later refactor of the
  // ladder would take away silently.
  const { session } = postSession({
    ...MOD,
    'app.bsky.feed.getPostThread': THREAD(ME, ME),
    'app.bsky.feed.getQuotes': { posts: [] },
  }, { [`getFollows:${ME}`]: [[]], [`getFollowers:${ME}`]: [[]] });
  const lens = createLens({ session });
  await lens.applyScope('me');                     // the tightest rung there is
  const t = await lens.thread(`at://${ME}/app.bsky.feed.post/root`, SRC);
  assert.equal(t.post.hidden, undefined, 'the poster can see their own post');
  // The reply is by the root's own author, so the self-thread rule hoists it
  // into the body rather than the comment list. Either way it must be PRESENT.
  assert.ok(JSON.stringify(t).includes('from outside'),
    'and their own reply survives, wherever the thread shape puts it');
});

test('the tightest ring still hides everyone else', async () => {
  const lens = createLens({ session: postSession({
    ...MOD,
    'app.bsky.feed.getPostThread': THREAD(ME, OUT),
    'app.bsky.feed.getQuotes': { posts: [] },
  }, { [`getFollows:${ME}`]: [[]], [`getFollowers:${ME}`]: [[]] }).session });
  await lens.applyScope('me');
  const t = await lens.thread(`at://${ME}/app.bsky.feed.post/root`, SRC);
  assert.ok(!JSON.stringify(t.comments).includes('from outside'),
    'me means me — the previous test is a guarantee about you, not a hole');
});

// ---- the self-thread hoist ----
//
// Reported by croftc-ba, 2026-09-03, against this branch alone. The hoist that
// turns an author's replies to their own post into the post's BODY reads
// `chain.post.record.text` off the RAW appview post — it is the one path in
// shapeLensThread that does not go through shapeLensPost, so no policy in the
// shape layer runs on it. build() was always fine: it shapes every node and
// drops on p.hidden.
//
// So the head obeyed the ring and the words underneath it did not. The ring is
// the first policy narrow enough to make this visible, but it is not the cause
// — muted words and label floors leak through the same hole, which is why the
// fix shapes the part rather than special-casing the ring.

const selfChain = (rootDid, parts) => ({
  thread: {
    post: {
      uri: `at://${rootDid}/app.bsky.feed.post/root`, cid: 'cr',
      author: { did: rootDid, handle: 'op.test' },
      record: { text: 'the head', createdAt: '2026-09-03T10:00:00Z' },
      indexedAt: '2026-09-03T10:00:00Z',
    },
    replies: parts.reduceRight((kids, text, i) => [{
      post: {
        uri: `at://${rootDid}/app.bsky.feed.post/p${i}`, cid: `cp${i}`,
        author: { did: rootDid, handle: 'op.test' },
        record: { text, createdAt: `2026-09-03T1${i + 1}:00:00Z` },
        indexedAt: `2026-09-03T1${i + 1}:00:00Z`,
      },
      replies: kids,
    }], []),
  },
});

test('a scoped-out author does not leak through the self-thread hoist', () => {
  const shaped = shapeLensThread(selfChain(OUT, ['part one', 'part two']), SRC, { posture: ring([IN]) });
  assert.equal(shaped.post.hidden, true, 'the head is scoped out');
  assert.equal(shaped.post.body, '', 'and emptied');
  const blob = JSON.stringify(shaped);
  assert.ok(!blob.includes('part one'), 'the hoisted words go with it');
  assert.ok(!blob.includes('part two'), 'every part, not just the first');
});

test('the hoist honours a muted word PER PART, not per author', () => {
  // The case that makes shaping each part better than stopping the chain: the
  // parts share an author, so an author-level policy hides all or none — but a
  // muted word lives in one part's text and must take only that part.
  const posture = buildPosture({ preferences: [{
    $type: 'app.bsky.actor.defs#mutedWordsPref',
    items: [{ value: 'spoiler', targets: ['content'] }],
  }] }, Date.now());
  const shaped = shapeLensThread(selfChain(IN, ['harmless', 'a spoiler', 'also fine']), SRC, { posture });
  const texts = (shaped.selfThread || []).map((x) => x.text);
  assert.deepEqual(texts, ['harmless', 'also fine'], 'the muted part is withheld and the rest survive');
});

test('a visible reply under a hidden part still reaches the thread', () => {
  // Why the walk continues past a hidden part rather than breaking: replies by
  // OTHER people hang off the chain, and they are not the hidden author's to
  // take down with them.
  const resp = selfChain(OUT, ['hidden part']);
  resp.thread.replies[0].replies.push({
    post: {
      uri: `at://${IN}/app.bsky.feed.post/kid`, cid: 'ck',
      author: { did: IN, handle: 'in.test' },
      record: { text: 'a visible answer', createdAt: '2026-09-03T13:00:00Z' },
      indexedAt: '2026-09-03T13:00:00Z',
    },
    replies: [],
  });
  const shaped = shapeLensThread(resp, SRC, { posture: ring([IN]) });
  assert.ok(JSON.stringify(shaped.comments).includes('a visible answer'),
    'the reply survives its hidden parent, as a reply under a blocked author already does');
});

// ---- which stops have nobody on this thread ----
//
// The thread pill mutes a stop nobody on the thread belongs to (owner,
// 2026-09-04: "otherwise what's the point?"). Two halves: the shaper reports
// the authors on the thread, BEFORE any policy — a stop is "empty" when nobody
// on the thread is in it, and a friend you muted is still on the thread — and
// absentStops() intersects that with each stop's members.

test('a shaped thread reports every author on it, root, replies and quotes, before any policy', () => {
  const thread = {
    thread: {
      post: mkPost(IN, 'root'),
      replies: [{ post: mkPost(OUT, 'stranger'), replies: [{ post: mkPost('did:plc:deep', 'deep'), replies: [] }] }],
    },
  };
  const quotes = [{ post: mkPost('did:plc:quoter', 'q'), replies: [] }];
  const shaped = shapeLensThread(thread, SRC, { quotes, posture: ring([IN]) });
  assert.deepEqual([...shaped.authors].sort(), [IN, OUT, 'did:plc:deep', 'did:plc:quoter'].sort(),
    'hidden authors count: the question is who is on the thread, not who is drawn');
});

test('absentStops names the stops with nobody on the thread, and never World', () => {
  const members = { mut: new Set([IN]), fol: new Set([IN, IN2]), world: null };
  assert.deepEqual(absentStops(new Set([IN2, OUT]), members), ['mut']);
  assert.deepEqual(absentStops(new Set([OUT]), members), ['mut', 'fol']);
  assert.deepEqual(absentStops(new Set([IN]), members), []);
  assert.deepEqual(absentStops(new Set(), members), ['mut', 'fol'], 'an empty thread is empty for every stop');
});

test('the substrate thread carries its authors through', async () => {
  const lens = await threadLens();
  const t = await lens.thread(`at://${ME}/app.bsky.feed.post/root`, SRC);
  assert.deepEqual([...t.authors].sort(), [ME, OUT].sort());
});
