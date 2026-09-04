// W29 — share a Bluesky post to Forage and land on its thread.
//
// The owner, 2026-09-04, with the Bluesky app's share sheet open on a post:
// "share with Forage as a target when it's installed as a PWA, and have that
// same content open in Forage … I could share the number one straight to Forage
// and then just read it as one plain post."
//
// WHAT THIS CAN AND CANNOT DRIVE. Playwright cannot open Android's share sheet,
// and no browser automation can — the sheet is an OS surface. What the browser
// actually does when a share is picked IS driveable, because the Web Share
// Target spec says exactly what it is: for `method: "GET"` the browser
// "serializes entries using the urlencoded serializer and appends the result to
// the URL's query component" and navigates the installed app there. So a
// navigation to `/share?text=<url>` is not an approximation of the share — it is
// the share, minus the picking. The half that cannot be driven is asserted
// statically instead: the manifest really declares the target, with the params
// the spec names.
//
// THE PAYLOAD IS IN `text`, NOT `url`, and that is the case that matters.
// Chrome's own documentation: "on Android, the `url` field will be empty
// because it's not supported in Android's share system. Instead, URLs will
// often appear in the `text` field." A version of this journey that only
// exercised `url=` would pass against an app that has never worked on a phone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario } from './harness/scenario.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const DID = 'did:plc:aa';
const RKEY = '3lxabcd2xyz';
const URI = `at://${DID}/app.bsky.feed.post/${RKEY}`;

// The head of a numbered thread, with the author's own 2/2 under it — the exact
// shape the owner described ("that 1/2/3 thing"), so this journey proves the
// destination as well as the door.
const author = { did: DID, handle: 'leahmcelrath.test', displayName: 'Leah' };
const mk = (rkey, text, reply) => ({
  uri: `at://${DID}/app.bsky.feed.post/${rkey}`, cid: 'c' + rkey, author,
  record: { text, createdAt: '2026-09-03T10:00:00Z', ...(reply ? { reply } : {}) },
  indexedAt: '2026-09-03T10:00:00Z', replyCount: 1, repostCount: 0, likeCount: 4,
});

const RESPONSES = {
  // 3v's resolver, now shared with the share target: handle -> did.
  'resolveHandle': { did: DID },
  'getPostThread': { thread: {
    post: mk(RKEY, 'When Gloria Steinem co-founded Ms. Magazine in 1972 1/2'),
    replies: [{ post: mk('part2', '“Ms.” was an assertion of individual identity 2/2', {
      root: { uri: URI, cid: 'c' + RKEY }, parent: { uri: URI, cid: 'c' + RKEY } }), replies: [] }],
  } },
  'getQuotes': { posts: [] },
  'getTrendingTopics': { topics: [] },
  'getPreferences': { preferences: [] },
  'getFeedGenerator?': { view: { uri: 'at://did:plc:x/app.bsky.feed.generator/whats-hot',
    displayName: 'Discover', description: 'trending', likeCount: 1, creator: { handle: 'bsky.app' } },
    isOnline: true, isValid: true },
  'getFeed?': { feed: [] },
  'getProfile': { did: DID, handle: 'leahmcelrath.test', displayName: 'Leah',
    followersCount: 1, followsCount: 1, postsCount: 2 },
  'getAuthorFeed': { feed: [] },
  'searchPosts': { posts: [] },
};

const shared = (origin, params) =>
  `${origin}/share?${new URLSearchParams(params)}`;

export async function run() {
  // ---- the half no browser can drive: the declaration itself ----
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  const st = manifest.share_target;
  assert.ok(st, 'manifest.webmanifest declares a share_target — without it the OS never offers Forage');
  assert.equal(st.action, '/share', 'the action is the route js/main.js registers');
  assert.equal(st.method, 'GET',
    'GET, per the spec: "use GET requests when the target drafts a message for user approval"');
  // All three params are named even though Android fills only one, because
  // which one it fills is the platform's choice and not ours.
  assert.deepEqual(st.params, { title: 'title', text: 'text', url: 'url' });
  // The action must be within the manifest's scope (spec, §manifest members).
  assert.ok(st.action.startsWith('/'), 'the action is in scope (scope is the origin root)');

  const s = await scenario('first-visit', { responses: RESPONSES });
  try {
    const { page, origin } = s;

    // ---- 1. the Android payload: a bsky.app post URL arriving in `text` ----
    await page.goto(shared(origin, { text: `https://bsky.app/profile/leahmcelrath.test/post/${RKEY}` }));
    await page.waitForSelector('.posttext');
    assert.equal(new URL(page.url()).pathname, '/p', 'it lands on the thread route');
    assert.equal(new URL(page.url()).searchParams.get('uri'), URI,
      'with the at-uri built from the resolved did — the share carried a handle, /p speaks at-uris');
    const head = await page.locator('h1.posttext').first().innerText();
    assert.match(head, /Gloria Steinem/, 'the shared post is the head of the page');
    // The owner's actual ask: the 1/2 · 2/2 chain reads as ONE post, not as a
    // reply underneath it. shapeLensThread already did this; the share target
    // is what finally makes it reachable from the Bluesky app.
    const body = await page.locator('[data-share-resolving], .card').first().innerText();
    assert.match(body, /assertion of individual identity/,
      'the author\'s own continuation is hoisted into the post, read as one plain post');

    // ---- 2. /share does not survive in the history (D3) ----
    // Left in it, Back from the thread would land on /share, which would resolve
    // forward again — an inescapable loop.
    await page.goBack();
    assert.notEqual(new URL(page.url()).pathname, '/share',
      'Back from the thread never returns to the doorway');

    // ---- 3. a did in the handle position needs no lookup ----
    // social-app's makeProfileLink hands out a did whenever the author's handle
    // is invalid, so this shape is ordinary, and resolving a did AS a handle is
    // a guaranteed 400.
    await page.evaluate(() => { window.__shimHits.length = 0; });
    await page.goto(shared(origin, { text: `https://bsky.app/profile/${DID}/post/${RKEY}` }));
    await page.waitForSelector('.posttext');
    assert.equal(new URL(page.url()).searchParams.get('uri'), URI, 'same destination');
    const resolves = await page.evaluate(() =>
      window.__shimHits.filter((h) => h.url.includes('resolveHandle')).length);
    assert.equal(resolves, 0, 'and no resolveHandle was asked for — the did was already the answer');

    // ---- 4. the spec-shaped payload, and a link inside a sentence ----
    await page.goto(shared(origin, { url: `https://bsky.app/profile/leahmcelrath.test/post/${RKEY}` }));
    await page.waitForSelector('.posttext');
    assert.equal(new URL(page.url()).searchParams.get('uri'), URI, '`url` works too, per the spec');
    await page.goto(shared(origin, { text: `look at this https://bsky.app/profile/leahmcelrath.test/post/${RKEY} !` }));
    await page.waitForSelector('.posttext');
    assert.equal(new URL(page.url()).searchParams.get('uri'), URI,
      'a link wrapped in words still resolves, and the trailing "!" is not part of the rkey');

    // ---- 5. any client of the same family, not just bsky.app ----
    // Blacksky (blacksky.community), deer.social and every other social-app
    // descendant share its route table, so the PATH is the identity and the
    // host is not checked.
    await page.goto(shared(origin, { text: `https://blacksky.community/profile/leahmcelrath.test/post/${RKEY}` }));
    await page.waitForSelector('.posttext');
    assert.equal(new URL(page.url()).searchParams.get('uri'), URI, 'a Blacksky link opens the same thread');

    // ---- 6. an at:// uri needs no network at all ----
    await page.goto(shared(origin, { text: URI }));
    await page.waitForSelector('.posttext');
    assert.equal(new URL(page.url()).searchParams.get('uri'), URI);

    // ---- 7. the other three shapes land on their own boards ----
    // These land SYNCHRONOUSLY — no handle to resolve — so the assertion is on
    // the address, not on a board's content: what is being tested here is the
    // translation, and each destination has a journey of its own already.
    const landsOn = async (payload, path, why) => {
      await page.goto(shared(origin, { text: payload }));
      await page.waitForFunction(() => location.pathname !== '/share');
      assert.equal(new URL(page.url()).pathname, path, why);
    };
    await landsOn('https://bsky.app/profile/leahmcelrath.test', '/u/leahmcelrath.test',
      'a profile link opens the account');
    await landsOn('https://bsky.app/hashtag/gardening', '/h/gardening',
      'a hashtag link opens the hashtag board');
    await landsOn('https://bsky.app/profile/curator.test/feed/whats-hot', '/f/@curator.test/whats-hot',
      'a feed link becomes the shareable creator-qualified form (3v)');

    // ---- 8. an unrecognised share keeps what arrived ----
    // By the time a share fails the reader has already left the app it came
    // from. Swallowing the payload would leave them with nothing at all.
    await page.goto(shared(origin, { text: 'https://example.com/news/story' }));
    await page.waitForSelector('[data-share-unreadable]');
    const payload = await page.locator('[data-share-payload]').innerText();
    assert.equal(payload, 'https://example.com/news/story', 'the shared text is shown back');
    const out = page.locator('[data-share-unreadable] a[target="_blank"]');
    assert.equal(await out.getAttribute('href'), 'https://example.com/news/story', 'and is a real link out');
    assert.match(await out.getAttribute('rel'), /noopener/,
      'rel is not decoration on a link the payload chose');
    assert.equal(new URL(page.url()).pathname, '/share',
      'a share with nowhere to go stays on the doorway rather than redirecting somewhere arbitrary');

    // a share carrying no link at all is the same page, without the link out
    await page.goto(shared(origin, { text: 'just some words' }));
    await page.waitForSelector('[data-share-unreadable]');
    assert.equal(await page.locator('[data-share-unreadable] a[target="_blank"]').count(), 0);

    // ---- 9. the memory sandbox gates with words, never a silent redirect ----
    await page.evaluate(() => localStorage.setItem('forage.mode', 'memory'));
    await page.goto(shared(origin, { text: `https://bsky.app/profile/leahmcelrath.test/post/${RKEY}` }));
    await page.waitForSelector('.empty');
    assert.match(await page.locator('.empty h2').innerText(), /Bluesky view/,
      'populations do not mix, and the doorway says so');
    await page.evaluate(() => localStorage.setItem('forage.mode', 'bluesky'));
  } finally {
    await s.close();
  }

  // ---- 10. a thread whose head your RING hides says so, instead of [removed] ----
  // Every shared post arrives by direct link and most are from strangers, so
  // this is the share target's most likely failure mode — and until now it
  // rendered as a byline reading "[removed]" over an empty heading, which reads
  // as a broken app rather than a working policy.
  const ringed = await scenario('first-visit', {
    responses: {
      ...RESPONSES,
      // A signed-in reader whose follow graph is EMPTY: nobody is inside a ring
      // set to Follows, so the shared post's author is outside it. The posture
      // reads are the ones loadPosture makes on session entry.
      'getFollows': { follows: [] },
      'getFollowers': { followers: [] },
      'getMutes': { mutes: [] },
      'getBlocks': { blocks: [] },
      'getListMutes': { lists: [] },
      'getListBlocks': { lists: [] },
      'describeRepo': { handle: 'me.test' },
    },
    initScripts: [`(() => {
      const listeners = new Set(); let session = null; let state = 'unknown';
      window.__forageFakeSessionManager = {
        state: () => state, currentSession: () => session,
        onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
        async restore() {
          session = { did: 'did:plc:me', signOut: async () => {},
            fetchHandler: (p, i) => window.fetch('https://bsky.social' + p, i) };
          state = 'signed-in'; for (const f of listeners) f(state); return session;
        },
        async signIn() {}, async signOut() {},
        fetch(p, i) { return session.fetchHandler(p, i); },
      };
      // The reader's ring, set to their follows — and the shared post's author
      // is not one of them (getFollows below returns nobody).
      try { localStorage.setItem('forage.ringscope', 'fol'); } catch {}
    })();`],
  });
  try {
    const { page, origin } = ringed;
    await page.goto(shared(origin, { text: `https://bsky.app/profile/leahmcelrath.test/post/${RKEY}` }));
    await page.waitForSelector('.empty, .posttext');
    assert.equal(new URL(page.url()).pathname, '/p', 'the share still lands on the thread');
    const words = await page.locator('.empty').first().innerText();
    assert.match(words, /Outside your ring/, 'and the page names the reason rather than showing "[removed]"');
    assert.ok(!words.includes('[removed]'), 'nothing pretends the post was deleted');
    // The control that undoes it is ON the page — a ring the reader can widen
    // for this thread alone, not three pages away in settings.
    assert.equal(await page.locator('[data-thread-ring]').count(), 1,
      'the thread\'s own ring pill is right there');
  } finally {
    await ringed.close();
  }
}
