// W9 — subscribing to a hashtag, end to end.
//
// A hashtag subscription is presented and woven in EXACTLY like a feed (owner,
// 2026-08-28: "in the end it's just weaving streams of posts together"), so
// this journey follows the same path a reader would: open a tag board, join
// it, and find it has become part of the app rather than a page you visited.
//
// Stored on the device today but shaped as a `fyi.forage.tagsub` record, so the
// move to a repo is a loop of createRecord. The unit test asserts that shape
// against the lexicon file; this asserts the shape is actually what reaches
// storage, which is the half a unit test cannot see.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

export const FAKE_SIGNED_IN = `(() => {
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

// Posts carry their tags as FACETS, which is where both the gold chips and the
// tag statistics read them from. A fixture post on a #harvest board that
// carried no facet would be a post nobody tagged — which is not the case under
// test and left /hashtags with nothing to count.
const post = (rkey, did, ts, tags = []) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did, handle: did.slice(8) + '.test' },
  record: { text: `post ${rkey}`, createdAt: ts,
    facets: tags.map((t) => ({ features: [{ $type: 'app.bsky.richtext.facet#tag', tag: t }] })) }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: 3,
});

export const RESPONSES = {
  describeRepo: { handle: 'me.test' },
  getPreferences: { preferences: [] },
  getFollows: { follows: [] },
  getFollowers: { followers: [] },
  getAuthorFeed: { feed: [] },
  getTimeline: { feed: [{ post: post('t1', 'did:plc:tl', '2026-08-28T09:00:00Z') }] },
  searchPosts: { posts: [post('h1', 'did:plc:hh', '2026-08-28T15:00:00Z', ['harvest', 'baking'])] },
  getTrendingTopics: { topics: [
    { topic: 'x1', displayName: 'A trend', link: '/profile/did:plc:gen/feed/one' },
  ] },
  'getFeed?': { feed: [{ post: post('tr1', 'did:plc:tt', '2026-08-28T16:00:00Z', ['mycology']) }] },
  getFeedGenerators: { feeds: [] },
};

export async function run() {
  // ---- logged out: the search CONTROL is absent, not refusing ----
  //
  // searchPosts is 403 to a logged-out reader (DL-014, re-probed 2026-08-29,
  // plain and with tag=). Offering an input that takes a query and only THEN
  // says it cannot help is the shape the owner rejected for the ring dial:
  // "putting a bunch of pop up landmines, even if it's our own pop up, is a
  // bad plan." So the control goes and the explanation stays — the same
  // treatment ringDial got in 49cf873.
  const out = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    await out.page.goto(`${out.origin}/hashtags`);
    await out.page.waitForSelector('[data-trending-tags="1"]');
    assert.equal(await out.page.locator('[data-tag-search="1"]').count(), 0,
      'no search box to type into when the answer is always 403');
    assert.equal(await out.page.locator('button:has-text("Search")').count(), 0,
      'and no button to press');
    const copy = await out.page.locator('body').innerText();
    assert.match(copy, /Find a hashtag/i, 'the capability is still named, so a reader knows it exists');
    assert.match(copy, /account/i, 'and what unlocks it is said once, in words');
    // Trending and Loaded are PUBLIC and must not be collateral damage.
    assert.ok(await out.page.locator('[data-trending-tags="1"]').count() > 0,
      'trending works logged out — verified against the live API 2026-08-29');
    assert.ok(await out.page.locator('[data-loaded-tags="1"]').count() > 0,
      'and so does what you have loaded: feed boards are public');
  } finally { await out.close(); }

  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    const { page } = s;

    // Not subscribed: the nav has no Hashtags section to speak of.
    await page.goto(`${s.origin}/h/harvest`);
    await page.waitForSelector('[data-tagsub="harvest"]');
    const before = await page.$$eval('.navsec', (n) => n.map((e) => e.textContent.trim().toLowerCase()));
    assert.ok(!before.includes('hashtags'),
      'a section with nothing in it is not drawn — an empty promise reads as a broken feature');

    // Join, with the same verb a feed uses.
    assert.equal((await page.locator('[data-tagsub="harvest"]').innerText()).trim(), 'Join');
    await page.click('[data-tagsub="harvest"]');
    await page.waitForSelector('.nav [data-nav-item="tag-harvest"]');
    assert.equal((await page.locator('[data-tagsub="harvest"]').innerText()).trim(), 'Leave',
      'the control says what pressing it again would do');

    // WHAT REACHED STORAGE is the migration guarantee: a valid tagsub record
    // and nothing else. A stray local-only field is precisely what would not
    // move to a repo later.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('forage.tagsubs')));
    assert.equal(stored.length, 1);
    assert.deepEqual(Object.keys(stored[0]).sort(), ['createdAt', 'tag']);
    assert.equal(stored[0].tag, 'harvest', 'stored bare — the # is punctuation');
    assert.ok(!Number.isNaN(Date.parse(stored[0].createdAt)), 'createdAt is a real datetime');

    // It survives a reload, which is the whole reason it is stored.
    await page.reload();
    await page.waitForSelector('.nav [data-nav-item="tag-harvest"]');

    // And it is woven into World alongside the timeline — not a separate list.
    await page.goto(`${s.origin}/r/world`);
    await page.waitForSelector('.postrow');
    const ids = await page.$$eval('.postrow .posttitle a, .postrow a', (as) => as.map((a) => a.textContent));
    const text = await page.locator('body').innerText();
    assert.ok(text.includes('post h1'), 'the subscribed hashtag contributes posts to World');
    assert.ok(text.includes('post t1'), 'alongside the timeline');
    assert.ok(text.indexOf('post h1') < text.indexOf('post t1'),
      'interleaved newest-first across sources, not appended in a clump');

    // Leaving removes it everywhere, which is what deleting the record will mean.
    await page.goto(`${s.origin}/h/harvest`);
    await page.waitForSelector('[data-tagsub="harvest"]');
    await page.click('[data-tagsub="harvest"]');
    await page.waitForSelector('.nav [data-nav-item="tag-harvest"]', { state: 'detached' });
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('forage.tagsubs')));
    assert.deepEqual(after, [], 'unsubscribing removes the record rather than flagging it');

    // ---- browsing hashtags: what I have seen, and what a search turns up ----
    // Reading a board is what feeds the first list; there is no other source,
    // because Bluesky publishes no hashtag ranking (getTrends returns feeds).
    await page.goto(`${s.origin}/h/harvest`);
    await page.waitForSelector('.postrow');
    await page.goto(`${s.origin}/hashtags`);
    await page.waitForSelector('[data-browse-tag]');
    const seenTags = await page.$$eval('[data-loaded-tags="1"] [data-browse-tag]', (a) => a.map((e) => e.getAttribute('data-browse-tag')));
    assert.ok(seenTags.includes('harvest'),
      `a tag carried by a post I just read shows up as seen: ${JSON.stringify(seenTags)}`);

    // The page must not imply it is ranking the network.
    const copy = await page.locator('body').innerText();
    assert.match(copy, /your reading, not the network/i,
      'the sample is stated — a ranked list with no stated sample reads as authoritative');
    assert.match(copy, /Not scrolling — loading/i,
      'and says precisely what "loaded" counts, since "seen" was the confusing word');

    // TRENDING is derived from the trending FEEDS — Bluesky publishes no
    // hashtag ranking — and the section says what it sampled rather than
    // implying a chart.
    await page.waitForSelector('[data-trending-tags="1"]');
    const trendText = await page.locator('[data-trending-tags="1"]').innerText();
    assert.match(trendText, /barometer of the network, not a chart/i,
      'the claim is bounded in the copy');
    assert.match(trendText, /across \d+ trending feed/i,
      'and the sample is stated: which posts, from how many feeds');
    assert.match(trendText, /mycology/,
      'a tag from a trending feed appears, and it is one I have never read');

    // THE COLLISION RULE, end to end: polling did not add it to MY statistics.
    const loadedTags = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('forage.tagstats') || '{}')));
    assert.ok(!loadedTags.includes('mycology'),
      'a tag that is only trending has not entered "hashtags loaded" — one list is what I read, the other is what is happening');

    // Filtering narrows the list without changing what is stored.
    // Scoped to the LOADED list: the page carries three now, and the filter
    // belongs to one of them. The unscoped version demanded that trending's
    // tags match a filter that was never applied to them.
    await page.fill('[data-tag-filter="1"]', 'harv');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-loaded-tags="1"] [data-browse-tag]')]
        .every((e) => e.getAttribute('data-browse-tag').includes('harv')));
    assert.match(await page.locator('body').innerText(), /of \d+ hashtags? match/i,
      'and says how many of how many, rather than silently hiding the rest');
    await page.fill('[data-tag-filter="1"]', '');
    await page.waitForFunction(() => document.querySelectorAll('[data-loaded-tags="1"] [data-browse-tag]').length > 0);

    // The sort bar reorders the list rather than just lighting up.
    const order = () => page.$$eval('[data-loaded-tags="1"] [data-browse-tag]', (a) => a.map((e) => e.getAttribute('data-browse-tag')));
    await page.waitForSelector('[data-tag-sort="1"] [data-sort="alpha"]');
    const byCount = await order();
    await page.click('[data-tag-sort="1"] [data-sort="alpha"]');
    await page.waitForSelector('[data-sort="alpha"][aria-pressed="true"]');
    const byAlpha = await order();
    assert.deepEqual(byAlpha, [...byAlpha].sort(), 'A–Z actually sorts alphabetically');
    assert.ok(byAlpha.length === byCount.length, 'and shows the same tags, reordered');
    await page.click('[data-tag-sort="1"] [data-sort="count"]');
    await page.waitForSelector('[data-sort="count"][aria-pressed="true"]');

    // Joining works from here too, not only from the board.
    await page.click('[data-tagsub="harvest"]');
    await page.waitForSelector('.nav [data-nav-item="tag-harvest"]');

    // Search reaches PAST what I have read: it reports the tags on real posts.
    await page.fill('[data-tag-search="1"]', 'baking');
    await page.click('button:has-text("Search")');
    // Wait on the RESULT, not on a clock: the search is a network round-trip
    // and a fixed pause is how a suite starts failing on a slow machine.
    await page.waitForFunction(() => /on \d+ of \d+ result/i.test(document.body.innerText), null, { timeout: 15000 });
    const body = await page.locator('body').innerText();
    assert.match(body, /on \d+ of \d+ result/i,
      'search states its own sample — results, a different denominator from your boards');
    assert.match(body, /#baking/,
      'and it surfaces a tag I had never read: it reaches past the local cache');
    // ---- the cloud is a representation, not a replacement (P4) ----
    await page.goto(`${s.origin}/hashtags`);
    await page.waitForSelector('[data-view-mode="trending"]');
    assert.equal(await page.locator('[data-view-mode="trending"] [data-mode="list"][aria-pressed="true"]').count(), 1,
      'the LIST is the default — it is the representation with the numbers in it');

    await page.click('[data-view-mode="trending"] [data-mode="cloud"]');
    await page.waitForSelector('[data-tagcloud="1"]');
    const cloudTags = await page.$$eval('[data-tagcloud="1"] a', (as) => as.map((a) => ({
      label: a.getAttribute('aria-label'),
      px: parseFloat(getComputedStyle(a).fontSize),
    })));
    assert.ok(cloudTags.length > 0, 'the cloud has tags in it');
    for (const t of cloudTags) {
      // The floor exists because a cloud's small end is where its data hides.
      assert.ok(t.px >= 13, `no tag below the app's smallest text: saw ${t.px}px`);
      // For a screen reader the font size does not exist, so the count has to
      // be somewhere it can be read. Same information, both ways of reading.
      assert.match(t.label || '', /\d+ posts?/, `each tag names its count: ${t.label}`);
    }

    await page.click('[data-view-mode="trending"] [data-mode="list"]');
    await page.waitForSelector('[data-trending-tags="1"] [data-browse-tag]');
    assert.equal(await page.locator('[data-tagcloud="1"]').count(), 0, 'and back again');

    // ---- a section's own page (P2/P3) ----
    await page.goto(`${s.origin}/hashtags`);
    await page.waitForSelector('[data-see-all="trending"]');
    await page.click('[data-see-all="trending"]');
    await page.waitForSelector('[data-back-to-hashtags="1"]');
    assert.ok(page.url().endsWith('/hashtags/trending'), 'a section has its own address');
    assert.equal(await page.locator('[data-loaded-tags="1"]').count(), 0,
      'and shows ONE section — the other two are not on it');
    assert.equal(await page.locator('[data-see-all="trending"]').count(), 0,
      'no "see all" on the page that already shows all — that links to where you are');
    await page.click('[data-back-to-hashtags="1"]');
    await page.waitForSelector('[data-loaded-tags="1"]');

    // A direct request for a section beats the display preference: you asked
    // for it by name, and the setting decides the OVERVIEW, not the address.
    await page.goto(`${s.origin}/me`);
    await page.click('[data-advanced="1"] summary');
    await page.uncheck('[data-section="trending"]');
    await page.goto(`${s.origin}/hashtags`);
    await page.waitForSelector('[data-loaded-tags="1"]');
    assert.equal(await page.locator('[data-trending-tags="1"]').count(), 0, 'gone from the overview');
    await page.goto(`${s.origin}/hashtags/trending`);
    await page.waitForSelector('[data-trending-tags="1"]');
    await page.goto(`${s.origin}/me`);
    await page.click('[data-advanced="1"] summary');
    await page.check('[data-section="trending"]');

    // ---- Advanced: the reader composes the page ----
    await page.goto(`${s.origin}/me`);
    await page.waitForSelector('[data-advanced="1"]');
    // Collapsed by default: a setting most readers never need must not cost
    // every reader attention on the page they came to for their skin.
    assert.equal(await page.locator('[data-advanced="1"]').evaluate((d) => d.open), false,
      'Advanced starts closed');
    assert.equal(await page.locator('[data-section="trending"]:visible').count(), 0,
      'and its contents are genuinely hidden, not merely styled small');

    await page.click('[data-advanced="1"] summary');
    await page.waitForSelector('[data-section="trending"]:visible');
    assert.equal(await page.locator('[data-section="trending"]').isChecked(), true, 'all on by default');

    await page.uncheck('[data-section="trending"]');
    await page.goto(`${s.origin}/hashtags`);
    await page.waitForSelector('[data-loaded-tags="1"]');
    assert.equal(await page.locator('[data-trending-tags="1"]').count(), 0,
      'the section is gone from the page, not just collapsed on it');

    // Unchecking every one is allowed, and the page explains itself rather than
    // the setting refusing the last click.
    await page.goto(`${s.origin}/me`);
    await page.click('[data-advanced="1"] summary');
    await page.uncheck('[data-section="search"]');
    await page.uncheck('[data-section="loaded"]');
    await page.goto(`${s.origin}/hashtags`);
    await page.waitForSelector('a[href="/me"]:has-text("Open settings")');
    assert.match(await page.locator('body').innerText(), /Every section is switched off/i,
      'an empty page a reader chose says so, and offers the way back');

    // And it comes back.
    await page.goto(`${s.origin}/me`);
    await page.click('[data-advanced="1"] summary');
    await page.check('[data-section="trending"]');
    await page.goto(`${s.origin}/hashtags`);
    await page.waitForSelector('[data-trending-tags="1"]');
  } finally { await s.close(); }
}
