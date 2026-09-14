// phone-feed-edge — the phone row is a stream, edge to edge (board-cards decision 11,
// plans/mocks/phone-feed-edge.html v2, owner-approved 2026-09-14).
//
// The owner's finding, from the Samsung: "each post on mobile naturally takes up side
// to side for best visibility … that negative side space makes a poor use of space …
// each post is not quite distinct enough from each other". The frame's claims, each
// measured here at 390 over the lens board fixture, so the picture the owner approved
// is the tree the gate runs:
//   1. the posts' surface meets the screen edge — no gutter, no tile border;
//   2. a row's text starts 12px in (was 46);
//   3. a BARE picture's stage runs the full viewport width, square-edged (a stage inside
//      a quote card or a link card keeps that card's frame — decision 2);
//   4. between two posts: one 3px rule (the stream's seam), no gap of ground;
//   5. the four actions sit in equal cells, centred, at one size and weight;
//   6. nothing overflows sideways — and the check is not void (overflow-x is not clip);
//   7. the desktop column is untouched: at 1280 the posts' card still has its border.
// Run against main it is RED on 1–5 (FORAGE_ROOT=<main checkout> to prove it).
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, BOARD_PATH } from './harness/mock-board.mjs';

const rootOpt = process.env.FORAGE_ROOT ? { root: process.env.FORAGE_ROOT } : {};

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES, ...rootOpt });
  try {
    const { page } = s;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${s.origin}${BOARD_PATH}`);
    await page.waitForSelector('.postrow', { timeout: 15000 });
    await page.evaluate(() => document.fonts?.ready);

    const m = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.postrow')];
      const card = rows[0].closest('.card');
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, w: r.width, right: r.right }; };
      const cs = (el) => getComputedStyle(el);
      const topStage = rows.map((r) => [...r.querySelectorAll('.stage')].find((st) => !st.closest('.quoted, [data-quoted], .extcard'))).find(Boolean);
      const second = rows[1];
      const actions = [...rows[0].querySelector('.actions').children];
      return {
        vw: innerWidth,
        card: { ...box(card), border: cs(card).borderLeftWidth, pad: cs(card).paddingLeft, bg: cs(card).backgroundColor },
        byline: box(rows[0].querySelector('.byline')),
        stage: topStage ? { ...box(topStage), radius: cs(topStage).borderRadius, borderL: cs(topStage).borderLeftWidth } : null,
        seam: { borderTop: cs(second).borderTopWidth, gapAbove: second.getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom },
        actions: actions.map((a) => ({ ...box(a), justify: cs(a).justifyContent, font: cs(a).fontSize + '/' + cs(a).fontWeight })),
        overflowX: cs(document.documentElement).overflowX + '/' + cs(document.body).overflowX,
        scrollW: document.scrollingElement.scrollWidth,
      };
    });

    // 1. edge to edge, no tile
    assert.ok(m.card.x <= 0.5 && m.card.right >= m.vw - 0.5, `posts' surface spans the viewport (x ${m.card.x}, right ${m.card.right} of ${m.vw})`);
    assert.equal(m.card.border, '0px', 'no tile border');
    assert.equal(m.card.pad, '0px', 'no tile padding');
    // 2. text at 12px
    assert.ok(Math.abs(m.byline.x - 12) <= 1, `a row's text starts 12px in (got ${m.byline.x})`);
    // 3. the stage bleeds
    assert.ok(m.stage, 'the fixture has a bare picture stage');
    assert.ok(m.stage.x <= 0.5 && m.stage.right >= m.vw - 0.5, `a bare picture's stage runs the full width (x ${m.stage.x}, right ${m.stage.right})`);
    assert.equal(m.stage.radius, '0px', 'square-edged');
    // 4. the seam: a 3px rule, no gap
    assert.equal(m.seam.borderTop, '3px', `3px rule between posts (got ${m.seam.borderTop})`);
    assert.ok(Math.abs(m.seam.gapAbove) < 0.5, `no band of ground between posts (gap ${m.seam.gapAbove})`);
    // 5. four across: equal cells, centred, one size and weight
    assert.equal(m.actions.length, 4, 'four actions');
    const widths = m.actions.map((a) => Math.round(a.w));
    assert.ok(Math.max(...widths) - Math.min(...widths) <= 1, `equal cells (${widths.join(',')})`);
    assert.ok(m.actions.every((a) => a.justify === 'center'), `each control centred (${m.actions.map((a) => a.justify).join(',')})`);
    assert.equal(new Set(m.actions.map((a) => a.font)).size, 1, `one size and weight (${m.actions.map((a) => a.font).join(',')})`);
    assert.equal(m.actions[0].font, '14px/500', 'the size and weight the mock names');
    // 6. no sideways overflow, and the check can fail
    assert.ok(!m.overflowX.includes('clip'), `overflow-x is not clip (${m.overflowX}) — a clipped page cannot fail a scrollWidth check`);
    assert.ok(m.scrollW <= m.vw, `no horizontal overflow (scrollWidth ${m.scrollW} vs ${m.vw})`);

    // 7. desktop untouched
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(150);
    const d = await page.evaluate(() => { const card = document.querySelector('.postrow').closest('.card'); const cs = getComputedStyle(card); return { x: card.getBoundingClientRect().x, border: cs.borderLeftWidth, pad: cs.paddingLeft }; });
    assert.equal(d.border, '1px', 'at 1280 the posts\' card keeps its border');
    assert.equal(d.pad, '16px', 'at 1280 the posts\' card keeps its padding');
    assert.ok(d.x > 100, `at 1280 the column is centred, not at the edge (x ${d.x})`);
  } finally {
    await s.close();
  }
}
