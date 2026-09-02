// Come back to your place in the feed (plan 2026-09-01-plan-feed-position-and-updates,
// phases 0-4). The owner's report: open a post from a scrolled board, press Back,
// and land at the top of a refetched feed.
//
// These are RED on `ddbd947`. The measured failure is not a missing scroll store —
// the browser saves the offset and restores it into a document `render()` has already
// emptied, so it clamps to 0. See the plan's Problem Statement.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, BOARD_PATH } from './harness/mock-board.mjs';
import { FAKE_SIGNED_IN } from './harness/mock-thread.mjs';

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const COUNT = `window.__feedCalls = []; const _f = window.fetch;
  window.fetch = function (u) { try { const s = String(u?.url || u);
    if (s.includes('getFeed?')) window.__feedCalls.push(s); } catch {} return _f.apply(this, arguments); };`;

const open = async (vp) => {
  const s = await scenario('first-visit', { mode: 'bluesky',
    initScripts: [FAKE_SIGNED_IN, COUNT], responses: RESPONSES });
  await s.page.setViewportSize(vp);
  await s.page.goto(`${s.origin}${BOARD_PATH}`);
  await s.page.waitForSelector('.postrow');
  return s;
};
const calls = (s) => s.page.evaluate(() => window.__feedCalls.length);
const rows = (s) => s.page.evaluate(() => document.querySelectorAll('.postrow').length);
const y = (s) => s.page.evaluate(() => window.scrollY);

export async function run() {
  // ---- P0: ONE fetch per board navigation. render() re-mounts on every store
  //      change and each mount re-fetches; measured 3x on arrival.
  {
    const s = await open(DESKTOP);
    try {
      await s.page.waitForTimeout(400);
      const n = await calls(s);
      assert.equal(n, 1, `P0: a board navigation fetches its feed once, not ${n} times`);
    } finally { await s.close(); }
  }

  // ---- P1/P2: Back returns you to your place, and does not refetch
  for (const [name, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const s = await open(vp);
    try {
      const last = s.page.locator('.postrow').last();
      await last.scrollIntoViewIfNeeded();
      await s.page.waitForTimeout(150);
      const before = await y(s);
      assert.ok(before > 300, `premise ${name}: the board must really be scrolled (got ${before})`);
      const beforeCalls = await calls(s);
      await last.click({ position: { x: 6, y: 6 } });
      await s.page.waitForSelector('.head-byline');
      assert.equal(await y(s), 0, `${name}: the post still opens at its top (open-at-top holds)`);
      await s.page.goBack();
      await s.page.waitForSelector('.postrow');
      await s.page.waitForTimeout(250);
      const after = await y(s);
      assert.ok(Math.abs(after - before) <= 4,
        `P1 ${name}: Back returns you to where you were (was ${before}, came back to ${after})`);
      const afterCalls = await calls(s);
      assert.equal(afterCalls, beforeCalls, `P2 ${name}: Back restores, it does not refetch (${beforeCalls} -> ${afterCalls})`);
    } finally { await s.close(); }
  }

  // ---- P3: the deep board — More-paged posts survive the round trip
  {
    const s = await open(DESKTOP);
    try {
      const first = await rows(s);
      const more = s.page.locator('button', { hasText: /^More$/ });
      if (await more.count()) {
        await more.first().click();
        await s.page.waitForFunction((n) => document.querySelectorAll('.postrow').length > n, first);
      }
      const deep = await rows(s);
      await s.page.locator('.postrow').last().scrollIntoViewIfNeeded();
      await s.page.waitForTimeout(150);
      const before = await y(s);
      await s.page.locator('.postrow').last().click({ position: { x: 6, y: 6 } });
      await s.page.waitForSelector('.head-byline');
      await s.page.goBack();
      await s.page.waitForSelector('.postrow');
      await s.page.waitForTimeout(250);
      assert.equal(await rows(s), deep, `P3: the pages you loaded survive Back (${deep} rows before)`);
      assert.ok(Math.abs(await y(s) - before) <= 4, `P3: and your place in them survives too`);
    } finally { await s.close(); }
  }

  // ---- P4: board to board and back, by LINK. This arrives on a FRESH history
  //      entry, which the browser holds no offset for at all — so it is the case
  //      that proves we own the restore rather than leaning on the browser.
  {
    const s = await open(DESKTOP);
    try {
      await s.page.locator('.postrow').last().scrollIntoViewIfNeeded();
      await s.page.waitForTimeout(150);
      const before = await y(s);
      assert.ok(before > 300, `premise: the board must really be scrolled (got ${before})`);

      await s.page.click('#navhost a[href="/feeds"]');       // away, by a real link
      await s.page.waitForTimeout(400);
      assert.equal(await y(s), 0, 'premise: a link to a board you have not read opens at its top');

      // back, by a real link — injected because the nav carries no /f/ link, but
      // it goes through interceptLinks exactly as any in-app anchor does
      await s.page.evaluate((p) => {
        const a = document.createElement('a');
        a.href = p; a.id = 'back-by-link'; a.textContent = 'back';
        document.getElementById('main').prepend(a);
      }, BOARD_PATH);
      await s.page.click('#back-by-link');
      await s.page.waitForSelector('.postrow');
      await s.page.waitForTimeout(300);
      const after = await y(s);
      assert.ok(Math.abs(after - before) <= 4,
        `P4: returning to a board you were reading puts you back (was ${before}, got ${after})`);
    } finally { await s.close(); }
  }

  // ---- P5: a store re-render must not move the reader. This is the case that
  //      cannot be inferred from the URL — a background fetch landing looks
  //      exactly like a re-click on the current link.
  {
    const s = await open(DESKTOP);
    try {
      await s.page.locator('.postrow').last().scrollIntoViewIfNeeded();
      await s.page.waitForTimeout(150);
      const before = await y(s);
      await s.page.evaluate(() => window.dispatchEvent(new Event('forage:poke')));
      await s.page.evaluate(async () => {
        const store = await import('/js/store.js');
        store.setDev?.({ ...store.getDev() });
      });
      await s.page.waitForTimeout(300);
      assert.equal(await y(s), before, 'P5: a store change repaints without moving the reader');
    } finally { await s.close(); }
  }

  // ---- P6: tapping the link for the board you are ALREADY on goes to the top.
  //      Phase 3 makes an ordinary link to a board you were reading restore you,
  //      so without this rule that press would do nothing — on the one control a
  //      reader reaches for when they want out of where they are.
  {
    const s = await open(DESKTOP);
    try {
      await s.page.locator('.postrow').last().scrollIntoViewIfNeeded();
      await s.page.waitForTimeout(150);
      assert.ok(await y(s) > 300, 'premise: the board is scrolled');
      // an anchor to the path we are on — the shape of a nav entry for the
      // current board, and the same road through interceptLinks
      await s.page.evaluate((p) => {
        const a = document.createElement('a');
        a.href = p; a.id = 'same-board'; a.textContent = 'here';
        document.getElementById('main').prepend(a);
      }, BOARD_PATH);
      await s.page.click('#same-board');
      await s.page.waitForTimeout(300);
      assert.equal(await y(s), 0, 'P6: the link for the board you are on takes you to the top');
    } finally { await s.close(); }
  }

  // ---- P7: the record is capped by POSTS, and a board still in use survives
  {
    const s = await open(DESKTOP);
    try {
      const st = await s.page.evaluate(async () => (await import('/js/board-cache.js')).stats());
      assert.ok(st.posts > 0 && st.posts <= st.budget, `P7: the record holds this board (${JSON.stringify(st)})`);
      assert.equal(st.boards, 1, 'P7: one board read, one record');
    } finally { await s.close(); }
  }
}
