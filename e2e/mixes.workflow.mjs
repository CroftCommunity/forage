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

    // 8. the phone: no horizontal overflow, every control at the 44px floor
    // (croft-pwa MOBILE-FIRST; the same check e2e/mobile-fit.workflow.mjs runs
    // on the boards it knows — this page has controls that one never sees)
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of ['/mixes/home', '/m/home', '/mixes']) {
        await page.goto(`${origin}${path}`);
        await page.waitForSelector(path === '/m/home' ? '.postrow' : path === '/mixes' ? '[data-new-mix]' : '[data-mix-row]');
        const { scrollW, innerW, small } = await page.evaluate((floor) => {
          const sel = 'button, select, input[type="checkbox"], input[type="radio"], .ringseg, a.btn, .switch';
          const out = [];
          for (const el of document.querySelectorAll(sel)) {
            if (el.closest('.devbar')) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            // a visually hidden radio is driven by its label — the label is the target
            if (el.matches('input[type="radio"].ringpill-in')) continue;
            if (r.width < floor || r.height < floor) out.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')} ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, small: [...new Set(out)] };
        }, 44);
        assert.ok(scrollW <= innerW + 1, `${path} @${width}: horizontal overflow (${scrollW} > ${innerW})`);
        assert.deepEqual(small, [], `${path} @${width}: tap targets under 44px: ${small.join(', ')}`);
      }
    }
  } finally {
    await broken.close();
  }

  // 9. mixes on the PDS (plan 2026-09-08 mixes-on-the-pds, Phase 4): Save to
  // PDS puts the record at the slug and the mix stays in the sidebar; a switch
  // on a published mix writes through; Remove from PDS deletes the record and
  // the mix is local again. The repo starts holding one published mix
  // (Weekend) so the page shows both halves at once.
  const REPO = { weekend: {
    $type: 'fyi.forage.mix', name: 'Weekend', home: false,
    rows: [{ kind: 'feed', uri: SCIENCE, on: true, weight: 'more' }],
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' } };
  // the mix listing is declared BEFORE the fixture's generic listRecords:
  // routing is first-match by substring, in declaration order
  const pds = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: {
    'listRecords?repo=did%3Aplc%3Ame&collection=fyi.forage.mix': { records: [{ uri: 'at://did:plc:me/fyi.forage.mix/weekend', value: REPO.weekend }] },
    ...RESPONSES,
    'com.atproto.repo.putRecord': { uri: 'at://did:plc:me/fyi.forage.mix/x', cid: 'c' },
    'com.atproto.repo.deleteRecord': {},
  } });
  try {
    const { page, origin } = pds;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/mixes`);
    await page.waitForSelector('[data-mix-list] [data-mix-where="pds"]');
    const listed = await page.$$eval('[data-mix-list] [data-mix-entry]', (ns) => ns.map((n) => [n.dataset.mixEntry, n.querySelector('[data-mix-where]')?.dataset.mixWhere]));
    assert.deepEqual(listed, [['home', 'local'], ['weekend', 'pds']], 'the published mix is listed beside the local Home, and says where it lives');
    assert.equal(await page.locator('.nav [data-nav-item="mix-weekend"]').count(), 1, 'a published mix is a sidebar row');
    // the published mix's board deals its rows
    await page.goto(`${origin}/m/weekend`);
    await page.waitForSelector('.postrow');
    assert.deepEqual([...new Set((await texts(page)).map(sourceOf))], ['science']);
    // a switch on the published mix writes through
    await page.goto(`${origin}/mixes/weekend`);
    await page.waitForSelector('[data-mix-row]');
    assert.equal(await page.locator('[data-mix-pds="remove"]').count(), 1, 'a published mix offers Remove from PDS');
    await page.evaluate(() => { window.__shimHits.length = 0; });
    await page.locator('[data-mix-row="timeline"] [data-mix-on]').click();
    await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('putRecord')));
    const put = await page.evaluate(() => JSON.parse(window.__shimHits.find((h) => h.url.includes('putRecord')).body));
    assert.equal(put.rkey, 'weekend');
    assert.ok(put.record.rows.some((r) => r.kind === 'timeline' && r.on === true), 'the switched-on row is in the record');
    assert.ok(put.record.rows.some((r) => r.kind === 'feed' && r.weight === 'more'), 'and the existing row survived');
    // Save Home to the PDS
    await page.goto(`${origin}/mixes/home`);
    await page.waitForSelector('[data-mix-pds="save"]');
    await page.evaluate(() => { window.__shimHits.length = 0; });
    await page.locator('[data-mix-pds="save"]').click();
    await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('putRecord')));
    const home = await page.evaluate(() => JSON.parse(window.__shimHits.find((h) => h.url.includes('putRecord')).body));
    assert.deepEqual([home.rkey, home.record.home], ['home', true]);
    // Remove Weekend from the PDS: the record is deleted and the mix is local
    await page.goto(`${origin}/mixes/weekend`);
    await page.waitForSelector('[data-mix-pds="remove"]');
    await page.evaluate(() => { window.__shimHits.length = 0; });
    await page.locator('[data-mix-pds="remove"]').click();
    await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('deleteRecord')));
    const del = await page.evaluate(() => JSON.parse(window.__shimHits.find((h) => h.url.includes('deleteRecord')).body));
    assert.deepEqual([del.collection, del.rkey], ['fyi.forage.mix', 'weekend']);
  } finally {
    await pds.close();
  }
}
