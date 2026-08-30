// W7 — board density is one preference, and it holds in BOTH populations.
//
// The app already shipped a card/compact dial, but only the Bluesky board read
// it: js/ui/views.js never passed `compact` to postRow, so a sandbox board was
// always roomy no matter what the reader had chosen. Same localStorage key,
// half the app honouring it.
//
// The single-key claim (both populations reading one preference through one
// module) is a code fact, so it is asserted in test/board-density.test.js
// rather than here — the lens home does not render the board toolbar at all,
// which is what an earlier version of this file got wrong.
//
// This also unblocks DL-028 without granting skins any structural power. A skin
// that wants a dense board can prefer an EXISTING density rather than being
// handed layout properties — it picks from a menu the app controls, so it still
// cannot hide anything the reader cannot already toggle back.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const rowsAreCompact = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.postrow')].length > 0 &&
  [...document.querySelectorAll('.postrow')].every((r) => r.classList.contains('compact')));

// The class is not the point — the DENSITY is. An earlier version of this file
// asserted only the class name and passed while compact rows were 78px tall
// and still rendering body previews, i.e. barely denser than card. Measure the
// thing the reader actually gets.
const medianRowHeight = (page) => page.evaluate(() => {
  const hs = [...document.querySelectorAll('.postrow')]
    .map((r) => r.getBoundingClientRect().height).sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)] ?? 0;
});

export async function run() {
  // ---- the sandbox board honours the preference ------------------------
  // Set the preference the way a reader does — once — rather than via an
  // initScript, which re-applies on EVERY navigation and would silently
  // reinstate compact under the persistence check below.
  const mem = await scenario('seeded');
  try {
    await mem.page.goto(`${mem.origin}/popular`);
    await mem.page.waitForSelector('.postrow');
    await mem.page.evaluate(() => localStorage.setItem('forage.boardview', 'compact'));
    await mem.page.reload();
    await mem.page.waitForSelector('.postrow');
    assert.ok(await rowsAreCompact(mem.page),
      'the sandbox board renders compact rows when the reader has chosen compact');
    const compactH = await medianRowHeight(mem.page);

    // and the control is reachable from the board itself, not only from the
    // other population's toolbar
    const dial = mem.page.locator('#main select[data-density]');
    assert.equal(await dial.count(), 1, 'the sandbox board offers the density dial');
    // Phase 11: the dial sits beside the sort bar, in the same row
    assert.equal(await mem.page.locator('#main .sortbar select[data-sort]').count(), 1, 'the sort bar is there beside it');
    await dial.selectOption('card');
    await mem.page.waitForFunction(() =>
      [...document.querySelectorAll('.postrow')].some((r) => !r.classList.contains('compact')));
    assert.equal(await rowsAreCompact(mem.page), false, 'switching back to card widens the rows');
    const cardH = await medianRowHeight(mem.page);
    assert.ok(cardH > compactH * 1.25,
      `compact must be materially denser, not just differently classed: ` +
      `compact ${Math.round(compactH)}px vs card ${Math.round(cardH)}px`);

    // the choice is device-local and survives a reload, like skin and mode
    await mem.page.reload();
    await mem.page.waitForSelector('.postrow');
    assert.equal(await rowsAreCompact(mem.page), false, 'the card choice persisted');
  } finally {
    await mem.close();
  }

  // ---- DL-028: a skin may PREFER a density, and never more than prefer -----
  // The classic board should READ as a board on first sight, without the reader
  // having to find the dial. But the moment they do use it, their choice has to
  // win — otherwise a skin is not suggesting a density, it is taking one.
  const pref = await scenario('seeded');
  try {
    const { page } = pref;
    await page.goto(`${pref.origin}/settings`);
    await page.waitForSelector('text=Skin');
    // No density has ever been chosen in this scenario — that is the point.
    assert.equal(await page.evaluate(() => localStorage.getItem('forage.boardview')), null,
      'starting from a reader who has never touched the dial');

    await page.locator('.field-row:has-text("Skin") select').selectOption('phpbb');
    await page.waitForFunction(() =>
      document.getElementById('skin-sheet')?.getAttribute('href')?.includes('phpbb'));

    await page.goto(`${pref.origin}/popular`);
    await page.waitForSelector('.postrow');
    assert.ok(await rowsAreCompact(page),
      'the classic board arrives dense, because the skin prefers compact');
    assert.equal(await page.evaluate(() => localStorage.getItem('forage.boardview')), null,
      'and it did so WITHOUT writing a choice on the reader\'s behalf');

    // The reader disagrees. That has to stick.
    await page.locator('#main select[data-density]').selectOption('card');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.postrow')].some((r) => !r.classList.contains('compact')));
    assert.equal(await rowsAreCompact(page), false, 'the reader overrode the skin');

    await page.reload();
    await page.waitForSelector('.postrow');
    assert.equal(await rowsAreCompact(page), false,
      'and the override survives a reload on a compact-preferring skin');

    // …including across a PALETTE change within the same family. Reached
    // through the toggle, because `phpbb-dark` is a skin id and the picker
    // carries family ids now (plan 2026-08-26-2 Phase 1).
    //
    // This assertion changed meaning with that phase and is worth stating: the
    // preference used to sit on each SKIN, so the two phpBB entries carried
    // `compact` independently and could have disagreed — which would have meant
    // this toggle silently re-laying-out the board. It lives on the FAMILY now,
    // so both sides are necessarily the same value and the only thing that can
    // move density is the reader.
    await page.locator('.themetoggle').first().click();
    await page.waitForFunction(() =>
      document.getElementById('skin-sheet')?.getAttribute('href')?.includes('phpbb-dark'));
    await page.goto(`${pref.origin}/popular`);
    await page.waitForSelector('.postrow');
    assert.equal(await rowsAreCompact(page), false,
      'the other side of the family prefers compact too, and still loses to the reader');
  } finally {
    await pref.close();
  }
}
