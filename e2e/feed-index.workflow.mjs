// The feed index on /feeds (plan 2026-09-08-plan-feed-index-and-jumpstarts,
// Phase 2). Three journeys, hermetic:
//
//   1. the index that ships with the app widens browse — rows say whose they
//      are ("in the index", "Bluesky lists it"), an index row's count reads
//      "loading…" and then arrives by hydration, and the count line names
//      the index's age;
//   2. the index MISSING (a 404 for the file) — the page is the live list
//      alone, and says so in words;
//   3. the index MALFORMED — refused with the validator's words, live list
//      shown, never garbage.
//
// The AppView is shimmed as always; the index is same-origin, so cases 2 and
// 3 route the file at the PAGE (a page route wins over the harness's context
// fence), which is the one way to make a real file absent or wrong for a test.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const POP = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const responses = {
  'getTrendingTopics': { topics: [] },
  'getPopularFeedGenerators': { feeds: [{ uri: POP, displayName: 'Discover', description: 'trending', likeCount: 39382,
    creator: { handle: 'bsky.app' }, did: 'did:web:discover.bsky.app' }] },
  // hydration answers every index row it is asked about with a count of 777
  'getFeedGenerators': { __echoFeeds: { displayName: 'hydrated', likeCount: 777, creator: { handle: 'h.test' }, labels: [] } },
  // one fresh post, so the popular row reads LIVE — the default "Hide inactive"
  // (feed-row v11 decision 26) hides an empty feed, which would hide the one
  // Bluesky-listed row these journeys count on
  'getFeed?': { feed: [{ post: { uri: 'at://did:plc:a/app.bsky.feed.post/p1', cid: 'bafyp1', indexedAt: new Date().toISOString(),
    record: { $type: 'app.bsky.feed.post', text: 'still alive', createdAt: new Date().toISOString() },
    author: { did: 'did:plc:a', handle: 'alive.test', displayName: 'Alive' }, likeCount: 1, replyCount: 0, repostCount: 0 } }] },
  'getFeedGenerator?': { view: { uri: POP, displayName: 'Discover', creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
};

async function open(s, path = '/feeds') {
  await s.page.goto(`${s.origin}${path}`);
  await s.page.waitForSelector('[data-feed-controls]');
}

export async function run() {
  // ---- 1. the shipped index widens browse ----------------------------------
  {
    const s = await scenario('first-visit', { responses });
    try {
      await open(s);
      const cards = s.page.locator('[data-discover-feed]');
      await cards.first().waitFor();
      // the harness fixture (e2e/harness/fixtures/feed-index.json): 11 feeds,
      // one of them the popular row itself, one labelled adult — so a guest
      // sees the popular row (marked "both") plus 9 index-only rows
      const n = await cards.count();
      assert.equal(n, 10, `the popular row plus the index, minus the labelled row: ${n} cards`);
      const fromIndex = await s.page.locator('[data-provenance="index"]').count();
      assert.equal(fromIndex, 9, `index-only rows are marked: ${fromIndex}`);
      assert.equal(await s.page.locator('[data-provenance="both"]').count(), 1, 'the row in BOTH the popular list and the index says so');
      const titles = await s.page.locator('[data-discover-feed] a[href*="/f/"]').allTextContents();
      assert.ok(!titles.includes('Late Hours'), 'the file\'s adult label hides the row for a guest (DL-040: a hint applied on first paint)');
      assert.ok(titles.includes('Notícias do Brasil') && titles.includes('日本の写真'), 'the language rescue rows are there');
      const line = await s.page.locator('.xs.muted', { hasText: 'from the index' }).first().innerText();
      assert.match(line, /Plus 9 from the index \(built 2026-09-09\)\./, line);
      assert.match(line, /^All 1 feeds? Bluesky lists as popular\./, 'the Bluesky-listed count keeps its own sentence');
      // hydration lands: an index row now shows a real count
      await s.page.waitForFunction(() => document.body.innerText.includes('777 likes'), null, { timeout: 15000 });
      // search: the index answers first, instantly, offline
      await s.page.fill('[data-feed-search]', 'index');
      await s.page.press('[data-feed-search]', 'Enter');
      await s.page.waitForFunction(() => /from the index first/.test(document.body.innerText), null, { timeout: 10000 });
      const found = await s.page.locator('[data-discover-feed] a[href*="/f/"]').allTextContents();
      assert.ok(found.includes('Index News') && found.indexOf('Index News') < found.indexOf('Index Games'), `band-ranked: news (4) before games (1): ${JSON.stringify(found)}`);
    } finally { await s.close(); }
  }

  // ---- 2. the index missing --------------------------------------------------
  // Through the shim, not a page route (see scenario.mjs: the service worker
  // hides the request from page.route). A shimmed 404 is not a network 404,
  // so the harness's console fence stays quiet — it exists for asset 404s.
  {
    const s = await scenario('first-visit', { responses: { ...responses, '/data/feed-index.json': { __status: 404 } } });
    try {
      await open(s);
      await s.page.locator('[data-discover-feed]').first().waitFor();
      assert.equal(await s.page.locator('[data-discover-feed]').count(), 1, 'the live list alone');
      const line = await s.page.locator('.xs.muted', { hasText: 'did not load' }).first().innerText();
      assert.match(line, /The index did not load — this is the live list alone/);
    } finally { await s.close(); }
  }

  // ---- 3. the index malformed ------------------------------------------------
  {
    const s = await scenario('first-visit', { responses: { ...responses,
      '/data/feed-index.json': { v: 1, feeds: [{ uri: 'nope', name: '', creator: '', band: 7, tags: [] }], jumpstarts: [], edges: [], providers: [] } } });
    try {
      await open(s);
      await s.page.locator('[data-discover-feed]').first().waitFor();
      assert.equal(await s.page.locator('[data-discover-feed]').count(), 1, 'the live list alone — never garbage');
      const line = await s.page.locator('.xs.muted', { hasText: 'refused' }).first().innerText();
      assert.match(line, /The index was refused \(feeds\[0\]/, line);
    } finally { await s.close(); }
  }
}
