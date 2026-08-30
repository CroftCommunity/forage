// W26 — the lens board as board-cards v9 and post-and-thread v20 § A show it,
// under the load the sketches never carried (CroftC MOCKS.md P2, P5). The
// captures in those mocks come from this fixture; each claim here is one the
// Proposed frame makes.
//
// Found by the shipped capture, 2026-08-30: on the phone board a row's byline
// wrapped under a 30-character handle and the ⋯ dropped to a second line — the
// same wrap the comment byline had (mock-alignment), fixed there and not here.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, BOARD_PATH, FEED } from './harness/mock-board.mjs';

const rows = (page) => page.evaluate(() => [...document.querySelectorAll('.postrow')].map((r) => {
  const b = r.querySelector('.byline');
  const who = b.querySelector('.who').getBoundingClientRect();
  const kebab = b.querySelector('.kebab').getBoundingClientRect();
  const time = b.querySelector('[data-time]').getBoundingClientRect();
  const mid = (x) => Math.round(x.top + x.height / 2);
  return {
    who: b.querySelector('.who').textContent,
    sameLine: [kebab, time].every((x) => Math.abs(mid(x) - mid(who)) <= 2),
    whoFits: who.right <= time.left,
    guestDoor: !!r.querySelector('.actions button[data-vote][data-guest]'),
    share: !!r.querySelector('.actions button.share'),
    stage: r.querySelector('.stage')?.dataset.stage ?? null,
    pictures: r.querySelectorAll('.stage').length,
  };
}));

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    const { page } = s;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${s.origin}${BOARD_PATH}`);
    await page.waitForSelector('.postrow');
    const list = await rows(page);
    assert.equal(list.length, FEED.feed.length, 'every fixture row renders');
    for (const r of list) {
      // Claim A (post-and-thread decision 7 on a row): one line, ⋯ on it
      assert.ok(r.sameLine, `${r.who}: the row's byline wrapped — the time or the ⋯ left the line`);
      assert.ok(r.whoFits, `${r.who}: the name runs into the time instead of yielding`);
      // board-cards decisions 1 + 2: a guest's like is a door, and share is on every row
      assert.ok(r.guestDoor, `${r.who}: signed out, the like pill is a button that opens sign-in`);
      assert.ok(r.share, `${r.who}: share on the action row`);
    }
    // board-cards decision D: a picture post stands on a stage, sized from its
    // aspect ratio before any bytes arrive (the images are fenced here) — a
    // portrait as one stage, four pictures as more than one
    const byWho = Object.fromEntries(list.map((r) => [r.who, r]));
    assert.ok(byWho['erislovesgardens.bsky.social']?.stage, 'the portrait post stands on a stage');
    assert.ok(byWho['misterhooperspecial.bsky.social']?.pictures >= 1, 'the four-picture post stands on a stage too');
    assert.equal(byWho['quietcartographer.bsky.social']?.pictures, 0, 'a text post has no stage and no empty frame');
    assert.deepEqual(await s.shimMisses(), []);
    assert.deepEqual(s.errors(), []);
  } finally { await s.close(); }
}
