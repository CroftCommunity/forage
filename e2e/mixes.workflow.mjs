// W41 — Mixes (plan 2026-09-08, Phases 4–7): the Home board, the sidebar, the
// Mixes page, and Home as the door. Written RED before any view existed.
//
// Claims, each one the plan makes:
//   1. Home deals every subscription: timeline, both feeds, the hashtag — a
//      few of each in turn, funny first only because ids tie and 'feed:' sorts
//      before 'hashtag:' and 'timeline' (equal weights at Normal).
//   2. A weight is a share of the deal: More on Science → 4 of the first 7.
//   3. Off is not fetched: switch Funny off, and getFeed for it never fires.
//   4. Under Top a weight is a score: Science at More (×2) puts science post 1
//      (10 × 2 = 20) above harvest post 4 (13), which beat it unweighted; and
//      under New the info line says weights are ignored.
//   5. A failed source is named on the board, and the board still paints.
//   6. A new mix appears in the sidebar and paints only its rows.
//   7. A first-time reader lands on /m/home.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, FAKE_SIGNED_IN, FUNNY, SCIENCE } from './harness/mock-mix.mjs';

const texts = (page) => page.$$eval('.postrow .posttitle', (ns) => ns.map((n) => n.textContent.trim()));
const sourceOf = (t) => t.split(' ')[0];

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    const { page, origin } = s;
    await page.setViewportSize({ width: 1280, height: 900 });

    // 7. the door
    await page.goto(`${origin}/`);
    await page.waitForSelector('.postrow');
    assert.equal(new URL(page.url()).pathname, '/m/home', 'a first-time signed-in reader lands on Home');

    // 1. the deal at Normal everywhere: 2 per round, feed:funny, feed:science, hashtag, timeline
    let seen = await texts(page);
    assert.deepEqual(seen.slice(0, 8).map(sourceOf), ['funny', 'funny', 'science', 'science', 'harvest', 'harvest', 'following', 'following']);
    assert.equal(seen.length, 6 + 8 + 6 + 4, 'every post from every source, once');
    const info = await page.locator('[data-mix-info]').innerText();
    assert.match(info, /4 sources/);
    // the sidebar
    assert.equal(await page.locator('.nav [data-nav-item="mix-home"]').count(), 1, 'Home is a sidebar row');
    assert.equal(await page.locator('.nav [data-nav-item="mix-home"]').getAttribute('aria-current'), 'page');
    assert.equal(await page.locator('.nav [data-nav-item="mixes"]').count(), 1, 'and the Mixes page is in the browse cluster');

    // 2 + 3. the Mixes page: Science to More, Funny off
    await page.goto(`${origin}/mixes/home`);
    await page.waitForSelector('[data-mix-row]');
    const rows = await page.$$eval('[data-mix-row]', (ns) => ns.map((n) => n.dataset.mixRow));
    assert.deepEqual(rows, ['timeline', `feed:${FUNNY}`, `feed:${SCIENCE}`, 'hashtag:harvest'], 'one row per subscription, timeline first');
    await page.locator(`[data-mix-row="feed:${SCIENCE}"] label[for$="-w2"]`).click();
    await page.locator(`[data-mix-row="feed:${FUNNY}"] [data-mix-on]`).click();
    assert.equal(await page.locator(`[data-mix-row="feed:${FUNNY}"] [data-mix-on]`).getAttribute('aria-checked'), 'false');
    await page.evaluate(() => { window.__shimHits.length = 0; });
    await page.goto(`${origin}/m/home`);
    await page.waitForSelector('.postrow');
    seen = await texts(page);
    assert.deepEqual(seen.slice(0, 7).map(sourceOf), ['science', 'science', 'science', 'science', 'harvest', 'harvest', 'following'], 'More deals 4 of the first 7');
    assert.ok(!seen.some((t) => t.startsWith('funny')), 'Funny is gone');
    const hits = await page.evaluate(() => window.__shimHits.map((h) => h.url));
    // getFeedGenerators names every saved feed on load; the BOARD fetch is getFeed
    assert.ok(!hits.some((u) => u.includes('getFeed?feed=' + encodeURIComponent(FUNNY))), 'and was never fetched');
    assert.ok(hits.some((u) => u.includes('getFeed?feed=' + encodeURIComponent(SCIENCE))), 'the others were');
    assert.ok(hits.some((u) => u.includes('getTimeline')));

    // 4. under Top the weight is a score; under New it is nothing, and the board says so
    await page.selectOption('[data-sort]', 'top');
    seen = await texts(page);
    assert.equal(seen[0], 'science post 1', `Top: 10 likes × 2 = 20 beats harvest's 13 (got ${seen[0]})`);
    await page.selectOption('[data-sort]', 'new');
    assert.match(await page.locator('[data-mix-info]').innerText(), /New ignores weights/);
    await page.selectOption('[data-sort]', 'feed');

    // 5 is a second scenario below: the shim's routes are fixed at launch
  } finally {
    await s.close();
  }

  const broken = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN],
    responses: { ...RESPONSES, 'searchPosts': { __status: 502 } } });
  try {
    const { page, origin } = broken;
    await page.goto(`${origin}/m/home`);
    await page.waitForSelector('.postrow');
    const info = await page.locator('[data-mix-info]').innerText();
    assert.match(info, /1 of 4 did not answer/, `the failure is counted (${info})`);
    assert.match(info, /#harvest/, 'and named');
    const seen = await texts(page);
    assert.ok(seen.length >= 6 + 8 + 6, 'the rest painted');

    // 6. a new mix: made on /mixes, two rows on, in the sidebar, paints those two
    await page.goto(`${origin}/mixes`);
    await page.waitForSelector('[data-new-mix]');
    await page.locator('[data-new-mix] input').fill('Weekend Reads');
    await page.locator('[data-new-mix] button').click();
    await page.waitForSelector('[data-mix-row]');
    assert.equal(new URL(page.url()).pathname, '/mixes/weekend-reads', 'creating a mix opens its rows');
    const ons = await page.$$eval('[data-mix-row] [data-mix-on]', (ns) => ns.map((n) => n.getAttribute('aria-checked')));
    assert.deepEqual(ons, ['false', 'false', 'false', 'false'], 'a new mix starts with everything off');
    await page.locator(`[data-mix-row="feed:${SCIENCE}"] [data-mix-on]`).click();
    await page.locator('[data-mix-row="timeline"] [data-mix-on]').click();
    assert.equal(await page.locator('.nav [data-nav-item="mix-weekend-reads"]').count(), 1, 'the new mix is a sidebar row');
    await page.locator('.nav [data-nav-item="mix-weekend-reads"]').click();
    await page.waitForSelector('.postrow');
    assert.equal(new URL(page.url()).pathname, '/m/weekend-reads');
    const two = await texts(page);
    assert.deepEqual([...new Set(two.map(sourceOf))].sort(), ['following', 'science'], 'only its two rows');
    assert.match(await page.locator('[data-mix-info]').innerText(), /2 sources/);
    // an empty mix is an invitation, not a blank
    await page.goto(`${origin}/mixes`);
    await page.locator('[data-new-mix] input').fill('Empty');
    await page.locator('[data-new-mix] button').click();
    await page.waitForSelector('[data-mix-row]');
    await page.goto(`${origin}/m/empty`);
    await page.waitForSelector('.empty');
    assert.match(await page.locator('.empty').innerText(), /Nothing is in this mix yet/);
    assert.equal(await page.locator('.empty a[href="/mixes/empty"]').count(), 1, 'with the next step');
  } finally {
    await broken.close();
  }
}
