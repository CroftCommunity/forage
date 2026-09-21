// View modes (plan 2026-09-14-plan-clips, Phase 3; invariant 6b): a board
// shown as a reel — clip or gram — and the pill under the ring that chooses it.
//
// What the frames on plans/mocks/clips.html claim, held here:
//   1. the View pill stands under the ring pill in the nav, signed in and out
//   2. clip mode frames exactly the board's clips, in the board's order, and
//      gram mode exactly its picture posts; nothing else is a frame
//   3. every frame carries the post's own row — the actions a row has — and
//      the media is drawn ONCE (the frame, not the row again)
//   4. exactly one frame is active as the reel scrolls
//   5. the exit returns to the rows and the choice is remembered (the key)
//   6. a board with none of the kind is an honest empty reel with the way back
//   7. nothing leaves the page for a frame that a row would not have fetched
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { FAKE_SIGNED_IN } from './harness/mock-thread.mjs';
import { RESPONSES, BOARD_PATH, CLIP_URIS, GRAM_URIS, inMode } from './harness/mock-reel.mjs';

const frames = (page) => page.evaluate(() => [...document.querySelectorAll('.reel-item')].map((s) => s.dataset.post));
const active = (page) => page.evaluate(() => [...document.querySelectorAll('.reel-item')].map((s) => s.dataset.active));

export async function run() {
  // ---- 1. the pill under the ring, signed out ------------------------------
  const guest = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  await guest.page.setViewportSize({ width: 1280, height: 900 });
  await guest.page.goto(`${guest.origin}${BOARD_PATH}`);
  await guest.page.waitForSelector('.postrow', { timeout: 15000 });
  const order = await guest.page.evaluate(() => [...document.querySelectorAll('nav.nav [data-ring-pill], nav.nav [data-view-pill]')].map((n) => n.dataset.ringPill ? 'ring' : 'view'));
  assert.deepEqual(order, ['ring', 'view'], 'guest nav: the view pill follows the ring pill');
  const liveSegs = await guest.page.evaluate(() => [...document.querySelectorAll('nav.nav [data-view-pill] input')].filter((i) => !i.disabled).length);
  assert.equal(liveSegs, 3, 'guest: every mode is selectable');
  // picking Clip on the pill repaints the board as a reel, no navigation
  await guest.page.locator('nav.nav [data-view-pill] label[for$="-clip"]').click();
  await guest.page.waitForSelector('.reel[data-reel="clip"]', { timeout: 10000 });
  assert.deepEqual(await frames(guest.page), CLIP_URIS, 'guest clip reel: the board’s clips, in the board’s order');
  assert.equal(await guest.page.evaluate(() => localStorage.getItem('forage.view')), 'clip', 'the choice is written');
  await guest.close();

  // ---- 2–5. signed in, arriving in clip mode -------------------------------
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, inMode('clip')], responses: RESPONSES });
  await s.page.setViewportSize({ width: 390, height: 844 });
  await s.page.goto(`${s.origin}${BOARD_PATH}`);
  await s.page.waitForSelector('.reel[data-reel="clip"]', { timeout: 15000 });
  assert.deepEqual(await frames(s.page), CLIP_URIS, 'clip reel: exactly the clips');
  // 3: each frame = one stage above, one compact row with the actions below, no second picture in the row
  const shape = await s.page.evaluate(() => [...document.querySelectorAll('.reel-item')].map((it) => ({
    stages: it.querySelectorAll('.reel-stage [data-stage="video"]').length,
    rowStages: it.querySelectorAll('.reel-row [data-stage]').length,
    actions: it.querySelectorAll('.reel-row .postrow .actions').length,
    compact: !!it.querySelector('.reel-row .postrow.compact'),
  })));
  for (const f of shape) assert.deepEqual(f, { stages: 1, rowStages: 0, actions: 1, compact: true }, `a frame is one stage over one compact row with its actions: ${JSON.stringify(f)}`);
  // the count line is honest about the loaded window
  assert.match(await s.page.locator('.reel-count').textContent(), /^3 clips of \d+ loaded posts$/);
  // 4: one active frame, and it follows the scroll
  await s.page.waitForFunction(() => document.querySelectorAll('.reel-item[data-active="1"]').length === 1, null, { timeout: 5000 });
  assert.deepEqual(await active(s.page), ['1', '0', '0'], 'the first frame is active on arrival');
  await s.page.evaluate(() => { const r = document.querySelector('.reel'); r.scrollTop = r.clientHeight * 1; });
  await s.page.waitForFunction(() => document.querySelector('.reel-item:nth-of-type(2)')?.dataset.active === '1', null, { timeout: 5000 });
  assert.deepEqual(await active(s.page), ['0', '1', '0'], 'scrolling one screen moves the active frame');
  // 7: the frames fetched nothing a row would not — the fenced playlist host was never asked
  assert.deepEqual(s.blockedExternals().filter((u) => u.includes('video.cdn.test')), [], 'no playlist is fetched for a frame before a press');
  // 5: the exit returns to rows and remembers
  await s.page.locator('.reel-exit').click();
  await s.page.waitForSelector('.postrow', { timeout: 10000 });
  assert.equal(await s.page.locator('.reel').count(), 0, 'Forum: the rows are back');
  assert.equal(await s.page.evaluate(() => localStorage.getItem('forage.view')), 'forum');
  const checked = await s.page.evaluate(() => document.querySelector('nav.nav [data-view-pill] input:checked')?.dataset.view);
  assert.equal(checked, 'forum', 'the nav pill agrees');
  await s.close();

  // ---- 2. gram mode: the picture posts, the carousel intact -----------------
  const g = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, inMode('gram')], responses: RESPONSES });
  await g.page.setViewportSize({ width: 390, height: 844 });
  await g.page.goto(`${g.origin}${BOARD_PATH}`);
  await g.page.waitForSelector('.reel[data-reel="gram"]', { timeout: 15000 });
  assert.deepEqual(await frames(g.page), GRAM_URIS, 'gram reel: exactly the picture posts');
  const gramShape = await g.page.evaluate(() => [...document.querySelectorAll('.reel-item')].map((it) => ({
    stage: it.querySelectorAll('.reel-stage .stage[data-stage="images"]').length,
    carousel: !!it.querySelector('.reel-stage .stage.carousel'),
  })));
  assert.deepEqual(gramShape, [{ stage: 1, carousel: false }, { stage: 1, carousel: true }], 'a single picture is a stage; four fold into the carousel, as on a row');
  assert.match(await g.page.locator('.reel-count').textContent(), /^2 picture posts of \d+ loaded posts$/);
  await g.close();

  // ---- 6. a board with no clips is an honest empty reel ---------------------
  const textOnly = { feed: RESPONSES.getFeed.feed.filter((it) => !it.post.embed) };
  const e = await scenario('first-visit', { mode: 'bluesky', initScripts: [inMode('clip')], responses: { ...RESPONSES, 'getFeed?': textOnly, 'getFeed': textOnly } });
  await e.page.setViewportSize({ width: 390, height: 844 });
  await e.page.goto(`${e.origin}${BOARD_PATH}`);
  await e.page.waitForSelector('.reel-empty', { timeout: 15000 });
  assert.match(await e.page.locator('.reel-empty').textContent(), /No clips in the loaded posts/);
  assert.equal(await e.page.locator('.reel-exit').count(), 1, 'the way back is still there');
  await e.close();
}
