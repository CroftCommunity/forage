// W26 — the lens board as board-cards v9 and post-and-thread v20 § A show it,
// under the load the sketches never carried (CroftC MOCKS.md P2, P5). The
// captures in those mocks come from this fixture; each claim here is one the
// Proposed frame makes.
//
// Found by the shipped capture, 2026-08-30: on the phone board a row's byline
// wrapped under a 30-character handle and the ⋯ dropped to a second line — the
// same wrap the comment byline had (mock-alignment), fixed there and not here.
//
// Found by the owner's phone, 2026-08-30 (feed-row v1): under "7315 · 270
// comments · 1225" the share arrow wrapped under the row and the dashed like
// box stood two lines tall beside it; the text of a post was set as a bold
// heading; and in compact (the phpBB skin's preference) the picture the thread
// page shows was gone from the feed. Bluesky's own row is the reference: one
// line — replies · reposts · like · share — with the like where the heart is.
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
    // feed-row v1: the action row's shape
    actionOrder: [...r.querySelectorAll('.actions > *')].map((a) =>
      a.matches('.replies') ? 'replies' : a.matches('[data-repost]') ? 'reposts' : a.matches('[data-vote]') ? 'like' : a.matches('.share') ? 'share' : a.className),
    actionsOneLine: (() => { const ms = [...r.querySelectorAll('.actions > *')].map((a) => { const b = a.getBoundingClientRect(); return b.top + b.height / 2; }); return Math.max(...ms) - Math.min(...ms) <= 2; })(),
    likeLeft: Math.round(r.querySelector('.actions [data-vote]')?.getBoundingClientRect().left ?? -1),
    titleWeight: r.querySelector('.posttitle') ? getComputedStyle(r.querySelector('.posttitle')).fontWeight : null,
    compact: r.classList.contains('compact'),
    thumb: !!r.querySelector('img.title-thumb'),
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
      // feed-row v1 claims 1–3: Bluesky's order with the like where the heart is;
      // one line under the widest counts; and every row's like starts at the
      // same x, so the rows read as columns down the board
      assert.deepEqual(r.actionOrder, ['replies', 'reposts', 'like', 'share'], `${r.who}: the action row is replies · reposts · like · share`);
      assert.ok(r.actionsOneLine, `${r.who}: the action row wrapped — its controls do not share one line`);
      // feed-row v1 claim 4: a post's text is text, not a heading
      assert.equal(r.titleWeight, '400', `${r.who}: the post text is set bold (${r.titleWeight}) — it is body text, not a title`);
    }
    assert.equal(new Set(list.map((r) => r.likeLeft)).size, 1,
      `the like does not line up down the board: lefts ${list.map((r) => r.likeLeft).join(', ')}`);
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

  // feed-row v1 claim 5: compact — the phpBB skin's preferred density, and the
  // owner's phone — keeps the picture. Density tightens the row; it does not
  // take the content out of it (the 2026-08-30 phone: no picture in the feed,
  // the picture in the thread). The density is set the way a skin sets it,
  // before first paint.
  const c = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES,
    initScripts: ["try { localStorage.setItem('forage.boardview', 'compact'); } catch {}"] });
  try {
    const { page } = c;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${c.origin}${BOARD_PATH}`);
    await page.waitForSelector('.postrow');
    const list = await rows(page);
    assert.ok(list.every((r) => r.compact), 'every row is compact under the stored preference');
    const byWho = Object.fromEntries(list.map((r) => [r.who, r]));
    assert.ok(byWho['erislovesgardens.bsky.social']?.stage, 'compact: the portrait post still stands on its stage');
    assert.ok(byWho['misterhooperspecial.bsky.social']?.pictures >= 1, 'compact: the four-picture post too');
    assert.ok(list.every((r) => !r.thumb), 'compact: no row swaps its picture for a 40px thumbnail');
    for (const r of list) assert.ok(r.actionsOneLine, `${r.who} (compact): the action row wrapped`);
    assert.deepEqual(await c.shimMisses(), []);
    assert.deepEqual(c.errors(), []);
  } finally { await c.close(); }
}
