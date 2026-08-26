// W3 — the Bluesky-view journey. GROWS a segment per phase-3 unit:
//   3b: signed-in ring dial → merged mutuals board
//   3c: boost = like (optimistic flip; the write's exact shape asserted)
//   3e: a thread where a reply AND a quote are one continuation
//   3f: the account's muted word masks in the board; a verified author ✓
//   3g: the trending rail opens a topic board; a facet #tag opens /h/
//   3d: the front-door arc — a first visit lands on the lens and writes
//       NOTHING to forage.state; the first memory-route visit seeds.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const FAKE_SIGNED_IN = `(() => {
  const mkSession = () => ({
    did: 'did:plc:me',
    signOut: async () => {},
    fetchHandler: (p, i) => window.fetch('https://bsky.social' + p, i),
  });
  let session = null; let state = 'unknown';
  const listeners = new Set();
  window.__forageFakeSessionManager = {
    state: () => state,
    currentSession: () => session,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async restore() { session = mkSession(); state = 'signed-in'; for (const f of listeners) f(state); return session; },
    async signIn() {}, async signOut() { session = null; state = 'signed-out'; },
    fetch(p, i) { return session.fetchHandler(p, i); },
  };
})();`;

const post = (rkey, did, ts) => ({ post: {
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did, handle: did.slice(8) + '.test', displayName: rkey,
    ...(did === 'did:plc:aa' ? { verification: { verifiedStatus: 'valid', trustedVerifierStatus: 'none' } } : {}) },
  record: { text: `post ${rkey}`, createdAt: ts }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: 2,
} });

export async function run() {
  const s = await scenario('seeded', {
    initScripts: [FAKE_SIGNED_IN],
    responses: {
      'describeRepo': { handle: 'me.test' },
      'getPreferences': { preferences: [{ $type: 'app.bsky.actor.defs#mutedWordsPref',
        items: [{ value: 'kryptonite', targets: ['content'], actorTarget: 'all' }] }] },
      'getTrendingTopics': { topics: [
        { topic: 'Meadow Fest', displayName: 'Meadow Fest', description: 'campers assemble',
          link: '/profile/did:plc:trends/feed/meadow1' } ] },
      'getMutes': { mutes: [] },
      'getBlocks': { blocks: [] },
      'getListMutes': { lists: [] },
      'getListBlocks': { lists: [] },

      'getFollows?actor=did%3Aplc%3Ame': { follows: [{ did: 'did:plc:aa' }, { did: 'did:plc:bb' }] },
      'getFollowers': { followers: [{ did: 'did:plc:aa' }, { did: 'did:plc:bb' }] },
      'getAuthorFeed?actor=did%3Aplc%3Aaa': { feed: [post('a1', 'did:plc:aa', '2026-08-25T10:00:00Z')] },
      'getAuthorFeed?actor=did%3Aplc%3Abb': { feed: [
        { post: { ...post('b1', 'did:plc:bb', '2026-08-25T11:00:00Z').post,
          record: { text: 'post b1 #camp', createdAt: '2026-08-25T11:00:00Z',
            facets: [{ index: { byteStart: 8, byteEnd: 13 },
              features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'camp' }] }] } } },
        { post: { ...post('b2', 'did:plc:bb', '2026-08-25T09:00:00Z').post,
          record: { text: 'my kryptonite take', createdAt: '2026-08-25T09:00:00Z' } } },
      ] },
      'com.atproto.repo.createRecord': { uri: 'at://did:plc:me/app.bsky.feed.like/3w3like', cid: 'lc' },
      'com.atproto.repo.deleteRecord': {},
      'searchPosts': { posts: [post('tagged1', 'did:plc:cc', '2026-08-25T13:00:00Z').post] },
      'getAuthorFeed?actor=did%3Aplc%3Atrends': { feed: [post('trendpost', 'did:plc:cc', '2026-08-25T14:00:00Z')] },
      'getFeed': { feed: [post('trendpost', 'did:plc:cc', '2026-08-25T14:00:00Z')] },
      'getPostThread': { thread: {
        post: { ...post('b1', 'did:plc:bb', '2026-08-25T11:00:00Z').post, quoteCount: 1 },
        replies: [{ post: post('reply1', 'did:plc:aa', '2026-08-25T11:30:00Z').post, replies: [] }],
      } },
      'getQuotes': { posts: [post('quote1', 'did:plc:cc', '2026-08-25T12:00:00Z').post] },
    },
  });
  const { page } = s;

  // 3b segment: signed-in → dial to Mutuals → the merged board renders
  await page.goto(`${s.origin}/#/lens`);
  await page.waitForSelector('text=@me.test');
  await page.waitForSelector('[data-ring-dial]');
  await page.locator('[data-ring-dial] button:has-text("Mutuals")').first().click();
  await page.waitForSelector('text=post b1');
  await page.waitForSelector('text=post a1');
  const text = await page.locator('main, body').first().innerText();
  assert.ok(text.indexOf('post b1') < text.indexOf('post a1'), 'newest first across members (11:00 before 10:00)');

  // 3c segment: boost the top post — a REAL like write, optimistically painted
  const row = page.locator('.postrow', { hasText: 'post b1' });
  const scoreBefore = await row.locator('.score').innerText();
  await row.locator('button.boost').click();
  await page.waitForFunction((prev) => {
    const r = [...document.querySelectorAll('.postrow')].find((x) => x.innerText.includes('post b1'));
    return r && r.querySelector('.score').innerText !== prev;
  }, scoreBefore);
  assert.ok(await row.locator('button.boost.on').count(), 'boost paints on');
  const hits = await page.evaluate(() => window.__shimHits.filter((h) => h.url.includes('createRecord')));
  assert.equal(hits.length, 1, 'exactly one like create hit the wire');
  const body = JSON.parse(hits[0].body);
  assert.equal(body.collection, 'app.bsky.feed.like');
  assert.equal(body.repo, 'did:plc:me');
  assert.equal(body.record.subject.uri, 'at://did:plc:bb/app.bsky.feed.post/b1');
  assert.equal(body.record.subject.cid, 'cid-b1');

  // unboost: the exact rkey dies
  await row.locator('button.boost').click();
  await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('deleteRecord')));
  const del = await page.evaluate(() => JSON.parse(window.__shimHits.find((h) => h.url.includes('deleteRecord')).body));
  assert.deepEqual(del, { repo: 'did:plc:me', collection: 'app.bsky.feed.like', rkey: '3w3like' });

  // 3f segment: the account-side muted word masks IN THE BOARD; ✓ renders
  await page.waitForSelector('text=[muted — matches your muted words]');
  assert.equal(await page.locator('text=kryptonite').count(), 0, 'the muted text never renders');
  assert.ok(await page.locator('.postrow:has-text("post a1") span[title="Verified on Bluesky"]').count(),
    'the verified author carries the checkmark');

  // 3e segment: open b1's thread — reply and quote are ONE continuation
  await page.locator('.postrow', { hasText: 'post b1' }).locator('a[href*="/lens/p?uri="]').first().click();
  await page.waitForSelector('text=post reply1');
  await page.waitForSelector('[data-kind="quote"]');
  const qnode = page.locator('[data-kind="quote"]');
  assert.match(await qnode.innerText(), /❝/, 'the quote marker distinguishes the kind');
  assert.match(await qnode.innerText(), /post quote1/, 'the quote body renders in the thread');
  assert.ok(await qnode.locator('a:has-text("open its thread")').count(), 'a quote opens as its own room');

  // 3g segment: back home on the WORLD ring — the trending rail is live
  await page.goto(`${s.origin}/#/lens`);
  await page.locator('[data-ring-dial] button:has-text("World")').first().click();
  await page.waitForSelector('[data-trending] a:has-text("Meadow Fest")');
  await page.locator('[data-trending] a:has-text("Meadow Fest")').click();
  await page.waitForSelector('text=post trendpost');

  // …and the facet #tag in a board post is a doorway into /h/
  await page.goto(`${s.origin}/#/lens`);
  await page.locator('[data-ring-dial] button:has-text("Mutuals")').first().click();
  await page.waitForSelector('a[data-tag="camp"]');
  await page.locator('a[data-tag="camp"]').first().click();
  await page.waitForSelector('h1:has-text("#camp")');
  await page.waitForSelector('text=post tagged1');

  assert.deepEqual(await s.shimMisses(), [], 'every network read had a fixture');
  await s.close();

  // 3d segment: the front door, from a truly first visit
  const fd = await scenario('first-visit', {
    responses: { 'getTrendingTopics': { topics: [] } },
  });
  await fd.page.goto(fd.origin); // no hash at all — the true front door
  await fd.page.waitForFunction(() => location.hash.startsWith('#/lens'), null, { timeout: 10000 });
  await fd.page.waitForSelector('text=The Lens');
  assert.equal(await fd.key(), null, 'the lens front door writes NOTHING to forage.state (the named check)');
  // first MEMORY-route visit seeds — a deliberate entry into the sandbox
  await fd.page.goto(`${fd.origin}/#/popular`);
  await fd.page.reload(); // boot runs the seed guard on a memory route
  await fd.waitForSeed();
  assert.ok((await fd.key()).length > 1000, 'the memory entry seeds the sandbox');
  await fd.close();
}
