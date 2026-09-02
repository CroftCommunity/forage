// The parity claims for plans/mocks/feed-refresh.html — the refresh indicator
// and button on the board's control bar (owner, 2026-09-01: "on the same
// horizontal line as the sort control bar, right aligned over the feed column").
//
// MOCKS.md P5: every promise the Proposed frame makes that a test can hold is
// held here, so approving the frame approves what the gate runs.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, BOARD_PATH, ARRIVALS } from './harness/mock-refresh.mjs';
import { FAKE_SIGNED_IN } from './harness/mock-thread.mjs';

const COUNT = `window.__feedCalls = []; const _f = window.fetch;
  window.fetch = function (u) { try { const s = String(u?.url || u);
    if (s.includes('getFeed?')) window.__feedCalls.push(s); } catch {} return _f.apply(this, arguments); };`;

const board = async (vp) => {
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, COUNT], responses: RESPONSES });
  await s.page.setViewportSize(vp);
  await s.page.goto(`${s.origin}${BOARD_PATH}`);
  await s.page.waitForSelector('.postrow');
  return s;
};
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

export async function run() {
  // ---- R1 (measure): the bar spans the column, so its right end IS the column's
  for (const [name, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const s = await board(vp);
    try {
      const m = await s.page.evaluate(() => {
        const bar = document.querySelector('.sortbar');
        const card = [...document.querySelectorAll('.card')].find((c) => c.querySelector('.postrow'));
        return { barRight: Math.round(bar.getBoundingClientRect().right),
                 cardRight: Math.round(card.getBoundingClientRect().right) };
      });
      assert.ok(Math.abs(m.barRight - m.cardRight) <= 2,
        `R1 ${name}: the control bar must reach the feed column's right edge (bar ${m.barRight}, card ${m.cardRight})`);
    } finally { await s.close(); }
  }

  // ---- R2 (structure): refresh is OUTBOARD of the display dials, last in the bar
  // ---- R3 (measure): it meets the 44px touch floor on the phone
  // ---- R4 (behaviour): at rest it carries no count
  {
    const s = await board(PHONE);
    try {
      const m = await s.page.evaluate(() => {
        const bar = document.querySelector('.sortbar');
        const btn = bar.querySelector('[data-refresh]');
        return { order: [...bar.children].map((c) => c.dataset.sort ? 'sort' : c.dataset.from ? 'from'
                   : c.dataset.density ? 'density' : c.dataset.cardsize ? 'cardsize'
                   : c.dataset.refresh ? 'refresh' : c.className || c.tagName),
                 h: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
                 state: btn?.dataset.state, text: btn?.textContent.trim() };
      });
      assert.equal(m.order[m.order.length - 1], 'refresh', `R2: refresh is the bar's last control (got ${JSON.stringify(m.order)})`);
      assert.ok(m.order.indexOf('refresh') > m.order.indexOf('density'), 'R2: refresh sits outboard of the display dials');
      assert.ok(m.h >= 44, `R3: the refresh control is ${m.h}px on a 390 phone, floor is 44`);
      assert.equal(m.state, 'rest', 'R4: at rest the control is in its resting state');
      assert.ok(!/\d/.test(m.text), `R4: at rest it carries no count (got "${m.text}")`);
    } finally { await s.close(); }
  }

  // ---- R5 (behaviour): a check that finds newer posts ANNOUNCES them and does
  //      not inject them — the row count and the reader's offset both hold still
  {
    const s = await board(DESKTOP);
    try {
      await s.page.evaluate(() => window.scrollTo(0, 200));
      const before = await s.page.evaluate(() => ({
        rows: document.querySelectorAll('.postrow').length, y: window.scrollY }));
      await s.page.evaluate(() => { window.__shimAdvance(); return window.__forageCheckForNew(); });
      await s.page.waitForSelector('[data-refresh][data-state="news"]');
      const after = await s.page.evaluate(() => ({
        rows: document.querySelectorAll('.postrow').length, y: window.scrollY,
        text: document.querySelector('[data-refresh]').textContent.trim(),
        live: document.querySelector('[data-refresh-live]')?.textContent.trim() }));
      assert.equal(after.rows, before.rows, 'R5: nothing is injected — the board holds still until asked');
      assert.equal(after.y, before.y, 'R5: the reader is not moved by the check');
      assert.match(after.text, new RegExp(`\\b${ARRIVALS.length}\\b`), `R5: the count is the number that arrived (got "${after.text}")`);
      assert.match(after.live || '', new RegExp(`\\b${ARRIVALS.length}\\b`), 'R7: the count is announced in a live region');

      // ---- R6 (behaviour): the press prepends and takes the reader to the top
      await s.page.click('[data-refresh]');
      await s.page.waitForFunction((n) => document.querySelectorAll('.postrow').length === n, before.rows + ARRIVALS.length);
      const done = await s.page.evaluate(() => ({ y: window.scrollY, state: document.querySelector('[data-refresh]').dataset.state }));
      assert.equal(done.y, 0, 'R6: accepting new posts takes the reader to the top of them');
      assert.equal(done.state, 'rest', 'R6: once accepted the control is at rest again');
    } finally { await s.close(); }
  }

  // ---- R9 (measure): right-aligned on whatever row it lands on. At 390 the
  //      count state pushes the bar to two rows; `.grow` cannot help there,
  //      because the spacer stays on row one. The first capture caught the
  //      control sitting at the LEFT of row two — the opposite of the ask.
  for (const [name, vp] of [['phone', PHONE], ['desktop', DESKTOP]]) {
    const s = await board(vp);
    try {
      await s.page.evaluate(() => { window.__shimAdvance(); return window.__forageCheckForNew(); });
      await s.page.waitForSelector('[data-refresh][data-state="news"]');
      const m = await s.page.evaluate(() => {
        const btn = document.querySelector('[data-refresh]');
        const card = [...document.querySelectorAll('.card')].find((c) => c.querySelector('.postrow'));
        return { btnRight: Math.round(btn.getBoundingClientRect().right),
                 cardRight: Math.round(card.getBoundingClientRect().right) };
      });
      assert.ok(Math.abs(m.btnRight - m.cardRight) <= 2,
        `R9 ${name}: with a count showing, refresh still ends at the column's right edge (btn ${m.btnRight}, card ${m.cardRight})`);
    } finally { await s.close(); }
  }

  // ---- R10 (behaviour): coming BACK to a board checks on its own. The owner,
  //      2026-09-02, choosing among three candidate triggers: "on return to board".
  //      Until now the press was the only thing that looked, so the indicator half
  //      of the control never lit unless you pressed it.
  {
    const s = await board(DESKTOP);
    try {
      await s.page.evaluate(() => window.scrollTo(0, 400));
      await s.page.waitForTimeout(120);
      const before = await s.page.evaluate(() => ({
        y: window.scrollY, rows: document.querySelectorAll('.postrow').length }));
      // the world changes while the reader is inside a post
      await s.page.locator('.postrow').first().click({ position: { x: 6, y: 6 } });
      await s.page.waitForSelector('.head-byline');
      await s.page.evaluate(() => window.__shimAdvance());
      await s.page.goBack();
      await s.page.waitForSelector('[data-refresh][data-state="news"]', { timeout: 10000 });
      const after = await s.page.evaluate(() => ({
        y: window.scrollY, rows: document.querySelectorAll('.postrow').length,
        text: document.querySelector('[data-refresh]').textContent.trim() }));
      assert.match(after.text, new RegExp(`\\b${ARRIVALS.length}\\b`),
        `R10: the return found what arrived without a press (got "${after.text}")`);
      assert.equal(after.rows, before.rows, 'R10: and still nothing is injected');
      assert.ok(Math.abs(after.y - before.y) <= 4,
        `R10: and the reader is still where they were (was ${before.y}, got ${after.y})`);
    } finally { await s.close(); }
  }

  // ---- R11 (behaviour): a store re-render is not a return. This is the case that
  //      makes the trigger a NAVIGATION and not a mount — render() re-runs on every
  //      store change, and checking on each would ask the network on a timer nobody
  //      chose.
  {
    const s = await board(DESKTOP);
    try {
      await s.page.waitForTimeout(400);
      const before = await s.page.evaluate(() => window.__feedCalls.length);
      await s.page.evaluate(async () => {
        const store = await import('/js/store.js');
        store.setDev?.({ ...store.getDev() });
      });
      await s.page.waitForTimeout(400);
      const after = await s.page.evaluate(() => window.__feedCalls.length);
      assert.equal(after, before, `R11: a store re-render does not check (${before} -> ${after})`);
    } finally { await s.close(); }
  }

  // ---- R8 (behaviour): the bar scrolls away, so a pending count follows the
  //      reader down as a pill — and appears ONLY when there is something to say
  for (const [name, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    const s = await board(vp);
    try {
      await s.page.evaluate(() => window.scrollTo(0, 1200));
      await s.page.waitForTimeout(120);
      assert.equal(await s.page.locator('[data-newspill]').count(), 0,
        `R8 ${name}: no pill while there is nothing to report`);
      await s.page.evaluate(() => { window.__shimAdvance(); return window.__forageCheckForNew(); });
      await s.page.waitForSelector('[data-newspill]');
      const pill = await s.page.evaluate(() => {
        const p = document.querySelector('[data-newspill]');
        const r = p.getBoundingClientRect();
        return { h: Math.round(r.height), onScreen: r.top >= 0 && r.bottom <= window.innerHeight,
                 barVisible: document.querySelector('.sortbar').getBoundingClientRect().bottom > 0 };
      });
      assert.equal(pill.barVisible, false, `R8 ${name}: the premise — the bar really has scrolled away`);
      assert.ok(pill.onScreen, `R8 ${name}: the pill is in view`);
      assert.ok(pill.h >= 44, `R8 ${name}: the pill is ${pill.h}px, floor is 44`);
      // back up to the bar and the pill stands down — one voice at a time
      await s.page.evaluate(() => window.scrollTo(0, 0));
      await s.page.waitForTimeout(150);
      assert.equal(await s.page.locator('[data-newspill]').count(), 0,
        `R8 ${name}: with the bar back in view the pill stands down`);
    } finally { await s.close(); }
  }
}
