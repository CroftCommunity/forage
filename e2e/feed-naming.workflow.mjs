// W8 — what the app CALLS a feed (4h).
//
// Owner report, 2026-08-26: the guest sidebar showed `f/whats-hot` — a record
// key — where every other surface in the app shows a display name. Behind it
// sat a second bug: the name it would have shown, `"What's Hot"`, is one
// Bluesky retired. Probed the same day against the live network:
//
//   at://did:plc:z72i7…/app.bsky.feed.generator/whats-hot
//     displayName : "Discover"           service did : did:web:discover.bsky.app
//
// Two rules, deliberately different, both asserted here:
//   - a FEED is named by its DISPLAY NAME (the network's, resolved where we
//     already have it; the hardcoded string is a labelled FALLBACK, not a name)
//   - an AUTHOR board is named by its HANDLE (unique and stable, unlike an
//     account's display name) — `f/bsky.app` was already right
//
// The rkey stays the route in both cases: /f/whats-hot has been shared.
//
// Hermetic. The live-network counterpart — does our fallback still match what
// Bluesky reports? — is curated-names-live.workflow.mjs, LIVE=1 only.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const WHATS_HOT = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

export async function run() {
  const s = await scenario('first-visit', {
    responses: {
      'getTrendingTopics': { topics: [] },
      // DELIBERATELY not the hardcoded fallback. The board <h1> must show THIS,
      // which is only possible if it reads the resolved info rather than the
      // registry entry — a fixture equal to the fallback would pass either way.
      'getFeedGenerator?': { view: { uri: WHATS_HOT, displayName: 'Discover (from the network)',
        description: 'Trending content from your personal network', likeCount: 39382,
        creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
      'getFeed?': { feed: [] },
      'getPopularFeedGenerators': { feeds: [
        { uri: WHATS_HOT, displayName: 'Discover (from the network)', description: 'trending',
          likeCount: 39382, creator: { handle: 'bsky.app' }, did: 'did:web:discover.bsky.app' }] },
    },
  });
  const { page } = s;

  try {
    await page.goto(`${s.origin}/`);
    await page.waitForSelector('.masthead');

    // --- the guest sidebar names the feed, not the record key ---------------
    const feedLink = page.locator('a[href="/f/whats-hot"]').first();
    await feedLink.waitFor();
    // V4: the sidebar became the left nav, and a nav row carries an icon
    // alongside the label. The RULE is unchanged and is what is asserted: the
    // row shows the feed's NAME and never its record key. Matching on
    // containment rather than on the exact string keeps this about naming
    // instead of about markup.
    const feedText = (await feedLink.innerText()).trim();
    assert.ok(feedText.includes('Discover'), `the nav names the feed: ${JSON.stringify(feedText)}`);
    assert.ok(!feedText.includes('whats-hot'),
      `and never its record key — a key is a route, not a name: ${JSON.stringify(feedText)}`);

    // …and the AUTHOR board keeps its handle. Different rule, same row.
    const authorLink = page.locator('a[href="/f/bsky.app"]').first();
    await authorLink.waitFor();
    const authorText = (await authorLink.innerText()).trim();
    assert.ok(authorText.includes('Bluesky'),
      `an author board is named the same way a feed is: ${JSON.stringify(authorText)}`);
    assert.ok(!authorText.includes('bsky.app'),
      `the handle stays the route, not the label: ${JSON.stringify(authorText)}`);

    // No surface anywhere on the signed-out home may still show the raw rkey.
    const home = await page.locator('body').innerText();
    assert.ok(!/f\/whats-hot/.test(home),
      `no visible label may be the record key — found it in:\n${home.slice(0, 400)}`);
    assert.ok(!/What's Hot/.test(home),
      'the retired name must be gone from the UI entirely');

    // --- the board heading uses the RESOLVED name --------------------------
    await page.goto(`${s.origin}/f/whats-hot`);
    await page.waitForSelector('h1');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('network'));
    assert.equal((await page.locator('h1').first().innerText()).trim(), 'Discover (from the network)',
      'the board heading shows what the network reports, not what we hardcoded');

    // --- and our own page stops competing for the word ----------------------
    // Rendering the feed's real name puts "Discover" on a page called
    // "Discover feeds", which reads as though the page is about that feed.
    await page.goto(`${s.origin}/feeds`);
    await page.waitForSelector('h1');
    assert.equal((await page.locator('h1').first().innerText()).trim(), 'Browse feeds',
      'our page is named for what it does, so the feed can keep its own name');
  } finally {
    await s.close();
  }
}
