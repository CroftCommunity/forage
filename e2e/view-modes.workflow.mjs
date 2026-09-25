// View modes (plan 2026-09-14-plan-clips, Phase 3; invariant 6b): a board
// shown as a reel — clip or gram — and the pill under the ring that chooses it.
//
// What the frames on plans/mocks/clips.html claim, held here:
//   1. the View dropdown stands in the top bar, signed in and out, on every board
//   2. clip mode frames exactly the board's clips, in the board's order, and
//      gram mode exactly its picture posts; nothing else is a frame
//   3. every frame carries the post's own row — the actions a row has — and
//      the media is drawn ONCE (the frame, not the row again)
//   4. exactly one frame is active as the reel scrolls
//   5. choosing Forum on the dropdown returns to the rows and the choice is remembered (the key)
//   6. a board with none of the kind is an honest empty reel with the way back
//   7. with autoplay off, nothing leaves the page for a frame that a row would
//      not have fetched; with it on (the default), the frame on screen mounts a
//      MUTED player and only that frame does; a labeled frame is veiled and
//      never plays
//   8. at a people-scope (Follows) the reel is the scope's people: one ask per
//      member with the mode's filter, a wave at a time, the count line naming
//      the source; reaching the last frame asks for the next wave
//   9. gram shows the alt text a person wrote as the caption
//  10. a Default view setting on the account page, forum unless chosen; a fresh
//      visit opens in the default and the dropdown's choice lasts the visit
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { FAKE_SIGNED_IN } from './harness/mock-thread.mjs';
import { RESPONSES, PEOPLE_RESPONSES, BOARD_PATH, CLIP_URIS, GRAM_URIS, FOL_WAVE_ONE, FOL_WAVE_TWO, LABELED, GRAPH, inMode, defaultMode, inScope, autoplay, HLS_DOUBLE } from './harness/mock-reel.mjs';

const frames = (page) => page.evaluate(() => [...document.querySelectorAll('.reel-item')].map((s) => s.dataset.post));
const active = (page) => page.evaluate(() => [...document.querySelectorAll('.reel-item')].map((s) => s.dataset.active));

export async function run() {
  // ---- 1. the pill under the ring, signed out ------------------------------
  const guest = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  await guest.page.setViewportSize({ width: 1280, height: 900 });
  await guest.page.goto(`${guest.origin}${BOARD_PATH}`);
  await guest.page.waitForSelector('.postrow', { timeout: 15000 });
  // D7 (owner, 2026-09-21): a dropdown in the top bar — the sort bar's dressing —
  // not a pill in the nav; the ring pill stays alone in the nav
  const sel = guest.page.locator('.masthead select[data-view-select]');
  assert.equal(await sel.count(), 1, 'guest: the View dropdown is in the top bar');
  // and the bar is still ONE ROW at phone widths with it (4j's measurement: 61px
  // one row, 113px two — the v5 capture at 390px showed two). A GUEST at 320px
  // wraps on main already (the Sign in link is the 44px the bar does not have),
  // so the guest claim is 360 and 390; the signed-in bar is measured at all three
  // further down.
  for (const w of [360, 390]) {
    await guest.page.setViewportSize({ width: w, height: 844 });
    await guest.page.waitForTimeout(150);
    const h = await guest.page.evaluate(() => document.querySelector('.masthead').getBoundingClientRect().height);
    assert.ok(h <= 66, `the top bar is one row at ${w}px with the View dropdown in it (${h}px)`);
    const sw = await guest.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    assert.ok(sw, `no horizontal overflow at ${w}px`);
  }
  await guest.page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await guest.page.locator('nav.nav [data-view-pill], nav.nav [data-view-select]').count(), 0, 'and not in the nav');
  assert.deepEqual(await sel.evaluate((s) => [...s.options].map((o) => o.textContent)), ['Forum', 'Clip', 'Gram']);
  assert.equal(await sel.evaluate((s) => s.disabled), false, 'guest: live');
  // choosing Clip repaints the board as a reel, no navigation
  await sel.selectOption('clip');
  await guest.page.waitForSelector('.reel[data-reel="clip"]', { timeout: 10000 });
  assert.deepEqual(await frames(guest.page), CLIP_URIS, 'guest clip reel: the board’s clips, in the board’s order');
  assert.equal(await guest.page.evaluate(() => sessionStorage.getItem('forage.view')), 'clip', 'the choice is written — for this visit');
  assert.equal(await guest.page.evaluate(() => localStorage.getItem('forage.viewdefault')), null, 'and does not become the default');
  await guest.close();

  // ---- 2–5. signed in, arriving in clip mode -------------------------------
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, inMode('clip'), autoplay(false), HLS_DOUBLE], responses: RESPONSES });
  await s.page.setViewportSize({ width: 390, height: 844 });
  await s.page.goto(`${s.origin}${BOARD_PATH}`);
  await s.page.waitForSelector('.reel[data-reel="clip"]', { timeout: 15000 });
  assert.deepEqual(await frames(s.page), CLIP_URIS, 'clip reel: exactly the clips');
  // the signed-in bar is one row at every phone width with the dropdown in it
  for (const w of [320, 360, 390]) {
    await s.page.setViewportSize({ width: w, height: 844 });
    await s.page.waitForTimeout(150);
    const h = await s.page.evaluate(() => document.querySelector('.masthead').getBoundingClientRect().height);
    assert.ok(h <= 66, `signed in, the top bar is one row at ${w}px with the View dropdown in it (${h}px)`);
  }
  await s.page.setViewportSize({ width: 390, height: 844 });
  await s.page.waitForTimeout(150);
  // arriving in a mode lands ON the reel: its top sits under the masthead, and
  // the first frame's row — the actions — is on screen, not below the fold
  await s.page.waitForFunction(() => Math.abs(document.querySelector('.reel').getBoundingClientRect().top - 61) < 2, null, { timeout: 5000 });
  const fold = await s.page.evaluate(() => ({ h: innerHeight, rowBottom: document.querySelector('.reel-item .reel-row').getBoundingClientRect().bottom }));
  assert.ok(fold.rowBottom <= fold.h + 1, `the first frame's row is on screen (${fold.rowBottom} vs ${fold.h})`);
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
  // 7 (autoplay off): no player was mounted and the playlist host was never asked
  assert.equal(await s.page.locator('.reel-item video').count(), 0, 'autoplay off: no <video> before a press');
  assert.deepEqual(await s.page.evaluate(() => window.__hlsSources), [], 'autoplay off: no playlist asked for');
  assert.deepEqual(s.blockedExternals().filter((u) => u.includes('video.cdn.test')), [], 'no playlist is fetched for a frame before a press');
  // 5: Forum on the dropdown returns to rows and remembers; the reel carries no exit of its own
  assert.equal(await s.page.locator('.reel-exit').count(), 0, 'no exit on the reel — the dropdown is always on screen');
  assert.equal(await s.page.locator('.masthead select[data-view-select]').evaluate((x) => x.value), 'clip', 'the dropdown shows the mode');
  await s.page.locator('.masthead select[data-view-select]').selectOption('forum');
  await s.page.waitForSelector('.postrow', { timeout: 10000 });
  assert.equal(await s.page.locator('.reel').count(), 0, 'Forum: the rows are back');
  assert.equal(await s.page.evaluate(() => sessionStorage.getItem('forage.view')), 'forum');
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
  // 9: the alt a person wrote is the caption in gram, whatever the alt-text setting (D10)
  assert.equal(await g.page.evaluate(() => localStorage.getItem('forage.alttext')), null, 'the alt-text setting is at its default (hidden on rows)');
  assert.ok(await g.page.locator('.reel-item .reel-stage .stages').count() >= 1, 'a gram frame carries the alt caption under the picture');
  await g.close();

  // ---- 6. a board with no clips is an honest empty reel ---------------------
  const textOnly = { feed: RESPONSES.getFeed.feed.filter((it) => !it.post.embed) };
  const e = await scenario('first-visit', { mode: 'bluesky', initScripts: [inMode('clip')], responses: { ...RESPONSES, 'getFeed?': textOnly, 'getFeed': textOnly } });
  await e.page.setViewportSize({ width: 390, height: 844 });
  await e.page.goto(`${e.origin}${BOARD_PATH}`);
  await e.page.waitForSelector('.reel-empty', { timeout: 15000 });
  assert.match(await e.page.locator('.reel-empty').textContent(), /No clips in the loaded posts/);
  assert.equal(await e.page.locator('.masthead select[data-view-select]').count(), 1, 'the way back is still on screen');
  await e.close();

  // ---- 7 (autoplay on, the default): the frame on screen plays, muted; the veil never does
  // the fixture board is a FEED, and feeds are exempt from the ring by default
  // (a feed opened by name arrives whole) — so this reader turned the exemption
  // off, which is what makes Follows scope the feed and its reel the people
  const unexempt = `try { localStorage.setItem('forage.ringexempt', '0'); } catch {}`;
  const a = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, inMode('clip'), inScope('fol'), unexempt, HLS_DOUBLE], responses: PEOPLE_RESPONSES });
  await a.page.setViewportSize({ width: 390, height: 844 });
  await a.page.goto(`${a.origin}${BOARD_PATH}`);
  await a.page.waitForSelector('.reel[data-reel="clip"]', { timeout: 15000 });
  // 8: the people-scope reel — the first wave, dealt across people
  assert.deepEqual(await frames(a.page), FOL_WAVE_ONE, 'Follows: the scope\u2019s people, one frame per person per round');
  assert.match(await a.page.locator('.reel-count').textContent(), /^5 clips from 11 people you follow · \d+ loaded posts$/, 'the count line names the source (ten follows and me)');
  const asks = () => a.page.evaluate(() => window.__shimHits.filter((h) => h.url.includes('getAuthorFeed')).map((h) => new URL(h.url).searchParams.get('actor')));
  const wave1 = await asks();
  assert.equal(wave1.length, 8, 'one wave: eight asks, not eleven');
  assert.ok(await a.page.evaluate(() => window.__shimHits.filter((h) => h.url.includes('getAuthorFeed')).every((h) => h.url.includes('filter=posts_with_video'))), 'every ask carries the video filter');
  assert.ok([7, 8, 9].every((i) => !wave1.includes(GRAPH.follows[i])), 'the eighth, ninth and tenth follows wait for the next wave');
  // 7: the active frame mounted a muted player; only it
  await a.page.waitForSelector('.reel-item[data-active="1"] video[data-muted="1"]', { timeout: 5000 });
  assert.equal(await a.page.locator('.reel-item video').count(), 1, 'exactly one player on the page');
  assert.equal(await a.page.evaluate(() => document.querySelector('.reel-item[data-active="1"] video').muted), true, 'muted');
  // 2026-09-25 device findings (owner: "fix both"): an ended clip LOOPS while it is the
  // frame on screen — never advances, the reader moves the reel — and the count line
  // stands on its own chip so it reads over a bright frame, not only over a dark one
  assert.equal(await a.page.evaluate(() => document.querySelector('.reel-item[data-active="1"] video').loop), true, 'the active clip loops');
  const chip = await a.page.evaluate(() => { const c = getComputedStyle(document.querySelector('.reel-count')); return { bg: c.backgroundColor, shadow: c.textShadow }; });
  assert.match(chip.bg, /rgba\(0, 0, 0, 0\.[5-9]\d*\)|rgb\(0, 0, 0\)/, `the count line has a dark chip behind it (${chip.bg})`);
  assert.notEqual(chip.shadow, 'none', 'and a text shadow');
  assert.deepEqual(await a.page.evaluate(() => window.__hlsSources.length), 1, 'the active frame\u2019s playlist, and no other');
  // the labeled frame is veiled and does not play when it becomes active
  const veilIndex = FOL_WAVE_ONE.indexOf(LABELED.uri);
  assert.ok(veilIndex > 0);
  await a.page.evaluate((i) => { const r = document.querySelector('.reel'); r.scrollTop = r.clientHeight * i; }, veilIndex);
  await a.page.waitForFunction((uri) => document.querySelector(`.reel-item[data-post="${uri}"]`)?.dataset.active === '1', LABELED.uri, { timeout: 5000 });
  const veil = a.page.locator(`.reel-item[data-post="${LABELED.uri}"] .reel-veil`);
  assert.equal(await veil.count(), 1, 'the labeled frame is veiled');
  assert.equal(await veil.evaluate((d) => d.open), false, 'closed until pressed');
  assert.match(await veil.locator('summary').textContent(), /graphic-media/);
  assert.equal(await a.page.locator(`.reel-item[data-post="${LABELED.uri}"] video`).count(), 0, 'and it never mounted a player');
  assert.equal(await a.page.evaluate(() => [...document.querySelectorAll('.reel-item video')].every((v) => v.paused || v.closest('[data-active="1"]'))), true, 'the frame that left is at rest');
  // 8: reaching the last frame is the ask for the next wave — the three unasked follows
  await a.page.evaluate((i) => { const r = document.querySelector('.reel'); r.scrollTop = r.clientHeight * i; }, FOL_WAVE_ONE.length - 1);
  await a.page.waitForFunction((n) => document.querySelectorAll('.reel-item').length === n, FOL_WAVE_ONE.length + FOL_WAVE_TWO.length, { timeout: 10000 });
  assert.deepEqual(await frames(a.page), [...FOL_WAVE_ONE, ...FOL_WAVE_TWO], 'the second wave appended, the first untouched');
  const wave2 = (await asks()).slice(wave1.length);
  assert.deepEqual(wave2.sort(), [GRAPH.follows[7], GRAPH.follows[8], GRAPH.follows[9]].sort(), 'the next wave asked exactly the three unasked follows (nobody had a cursor to continue)');
  assert.ok((await a.page.evaluate(() => localStorage.getItem('forage.media-posters'))).includes(GRAPH.follows[0]), 'who answered with a frame is remembered on this device');
  await a.close();

  // ---- 10. the default (owner, 2026-09-21): a setting on the account page ----
  const d = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, defaultMode('gram')], responses: RESPONSES });
  await d.page.setViewportSize({ width: 390, height: 844 });
  await d.page.goto(`${d.origin}${BOARD_PATH}`);
  await d.page.waitForSelector('.reel[data-reel="gram"]', { timeout: 15000 });
  assert.equal(await d.page.locator('.masthead select[data-view-select]').evaluate((x) => x.value), 'gram', 'a fresh visit opens in the default, and the dropdown says so');
  await d.page.goto(`${d.origin}/me`);
  const pref = d.page.locator('select[data-view-default]');
  await pref.waitFor({ timeout: 15000 });
  assert.equal(await pref.evaluate((x) => x.value), 'gram', 'the account page shows the default');
  await pref.selectOption('forum');
  assert.equal(await d.page.evaluate(() => localStorage.getItem('forage.viewdefault')), 'forum', 'choosing writes the device preference');
  await d.close();
  // and with nothing chosen anywhere, forum
  const f = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  await f.page.goto(`${f.origin}/me`);
  await f.page.locator('select[data-view-default]').waitFor({ timeout: 15000 });
  assert.equal(await f.page.locator('select[data-view-default]').evaluate((x) => x.value), 'forum', 'forum by default');
  await f.close();
}
