// W-gif — the GIF player and its two settings as the mock draws them
// (plans/mocks/gif-embeds.html; CroftC MOCKS.md P5: every promise a Proposed
// frame makes that a test can hold is held by a test that runs in the gate, so
// approving the frame approves what the gate runs).
//
// Reported by the owner 2026-09-02, twice, on their own klipy posts: the GIF
// was a frozen JPEG with a link out, and its card printed the same eight words
// twice because Bluesky writes "ALT: <the GIF's own title>" into the external
// description. Both records are in the fixture verbatim, so the pictures the
// mock shows and the claims below come from one population.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, FAKE_SIGNED_IN, THREAD_PATH, BOARD_PATH, NODE_IDS, KLIPY_LANDSCAPE } from './harness/mock-gif.mjs';

const PHONE = { width: 390, height: 844 };
const REPLY = (i) => `.comment[data-node-id="${NODE_IDS[i]}"]`;

export async function run() {
  // ---- defaults: autoplay on (no reduced-motion in the harness), alt hidden --
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    const { page } = s;
    await page.setViewportSize(PHONE);
    await page.goto(`${s.origin}${THREAD_PATH}`);
    await page.waitForSelector('.comment');

    // ---- claim 1 (structure): the reported reply is a PLAYER, not a still ---
    const card = page.locator(`${REPLY(0)} [data-gifcard]`);
    assert.equal(await card.count(), 1, 'the reported reply draws a GIF card');
    const stage = card.locator('.stage[data-stage="gif"]');
    assert.equal(await stage.getAttribute('data-gif'), 'video',
      'a klipy record plays klipy\'s video, not the 8.8 MB .gif');
    assert.equal(await card.locator('[data-gifplay]').count(), 1, 'it carries a play/pause control');

    // ---- claim 2 (structure): D3 — the origin host, never a third party -----
    const srcs = await stage.locator('video source').evaluateAll((n) => n.map((s) => s.getAttribute('src')));
    assert.equal(srcs.length, 2, `webm and mp4 are both offered (got ${srcs.length})`);
    assert.ok(srcs[0].endsWith('.webm'), 'webm first — a browser takes the first it supports, and it is smaller');
    for (const src of srcs) {
      assert.equal(new URL(src).hostname, 'static.klipy.com',
        `the video comes from the host already in the record, not a proxy (${src})`);
    }
    // the slugs are the record's own, swapped into the same directory
    assert.ok(srcs.some((u) => u.includes('0Ds0ULMJw0vWjEZ6NMLN.webm')), 'the webm= slug names the webm');
    assert.ok(srcs.some((u) => u.includes('8pcPaPB1Eow6fc.mp4')), 'the mp4= slug names the mp4');

    // ---- claim 3 (measure): hh/ww size the stage BEFORE anything loads ------
    // Nothing is fetched in this harness (every off-origin request is fenced),
    // so a stage with the right ratio here proves it came from the record.
    const ratio = await stage.evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), declared: n.style.getPropertyValue('--aspect').trim() };
    });
    assert.equal(ratio.declared, '498 / 415', 'the landscape GIF declares its true ratio');
    assert.ok(Math.abs(ratio.w / ratio.h - 498 / 415) < 0.02,
      `the frame is that shape on screen (${ratio.w}x${ratio.h})`);

    // ---- claim 4 (behaviour): the overlay actually toggles ------------------
    const toggle = card.locator('[data-gifplay]');
    assert.equal(await stage.getAttribute('data-playing'), 'true', 'autoplay on: it starts playing');
    assert.equal(await toggle.getAttribute('aria-label'), 'Pause GIF',
      'the control says what pressing it DOES, not what state it is in');
    await toggle.click();
    assert.equal(await stage.getAttribute('data-playing'), 'false', 'a press pauses it');
    assert.equal(await toggle.getAttribute('aria-label'), 'Play GIF', 'and the control renames itself');
    await toggle.click();
    assert.equal(await stage.getAttribute('data-playing'), 'true', 'a second press plays it again — a GIF has to go BACK');

    // ---- claim 5 (measure): the whole surface is the control ---------------
    const covers = await card.evaluate((c) => {
      const st = c.querySelector('.stage'), btn = c.querySelector('[data-gifplay]');
      const a = st.getBoundingClientRect(), b = btn.getBoundingClientRect();
      return { dw: Math.abs(a.width - b.width), dh: Math.abs(a.height - b.height), h: Math.round(b.height) };
    });
    assert.ok(covers.dw < 2 && covers.dh < 2, 'the button is the stage, not a small target in it');
    assert.ok(covers.h >= 44, `and it clears the 44px touch floor (${covers.h}px)`);

    // ---- claim 6 (structure): alt is HIDDEN by default, everywhere ---------
    assert.equal(await page.locator('[data-alt-text]').count(), 0,
      'nothing prints alt text until the reader asks for it');
    // ...but the accessible name is written anyway (D7)
    const label = await stage.locator('video').getAttribute('aria-label');
    assert.equal(label, 'Warrior Nun Ava Running Through Water',
      'the GIF is still NAMED for a screen reader, with Bluesky\'s prefix stripped');

    // ---- claim 7 (structure): the second rung — a .gif with no video form --
    const tenor = page.locator(`${REPLY(3)} [data-gifcard] .stage[data-stage="gif"]`);
    assert.equal(await tenor.getAttribute('data-gif'), 'image',
      'a tenor .gif animates as an image: no video url is invented for it');
    const isrc = await tenor.locator('img.stage-gif').getAttribute('src');
    assert.ok(isrc.startsWith('https://media.tenor.com/'),
      `it plays the record's OWN uri, nothing constructed (${isrc})`);

    // ---- claim 8 (look): the kind is said out loud -------------------------
    assert.equal(await card.locator('.stage-badge').textContent(), 'GIF',
      'a paused GIF and a photo are otherwise the same picture');

    s.consoleErrors(); s.errors();
  } finally { await s.close(); }

  // ---- autoplay OFF: the state a reduced-motion reader gets for free -------
  const off = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES,
    initScripts: [FAKE_SIGNED_IN, "try { localStorage.setItem('forage.gifautoplay','off'); } catch {}"] });
  try {
    const { page } = off;
    await page.setViewportSize(PHONE);
    await page.goto(`${off.origin}${THREAD_PATH}`);
    await page.waitForSelector('.comment');
    const stage = page.locator(`${REPLY(0)} .stage[data-stage="gif"]`);
    assert.equal(await stage.getAttribute('data-playing'), 'false', 'autoplay off: it waits');
    assert.equal(await stage.locator('[data-gifplay]').getAttribute('aria-label'), 'Play GIF');

    // ---- claim 9 (behaviour): OFF FETCHES NOTHING --------------------------
    // The promise the mock makes in words. preload="none" and no poster-side
    // download; the owner's GIF is 8.8 MB, so this is the claim that matters
    // most to somebody on a phone.
    assert.equal(await stage.locator('video').getAttribute('preload'), 'none',
      'nothing is downloaded until the press');
    // and the press still works from a cold start
    await stage.locator('[data-gifplay]').click();
    assert.equal(await stage.getAttribute('data-playing'), 'true', 'the press starts it');

    off.consoleErrors(); off.errors();
  } finally { await off.close(); }

  // ---- alt text ON: what the switch buys, and what it must NOT touch -------
  const alt = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES,
    initScripts: [FAKE_SIGNED_IN, "try { localStorage.setItem('forage.alttext','on'); } catch {}"] });
  try {
    const { page } = alt;
    await page.setViewportSize(PHONE);
    await page.goto(`${alt.origin}${THREAD_PATH}`);
    await page.waitForSelector('.comment');

    // ---- claim 10 (structure): alt appears, WITHOUT Bluesky's prefix -------
    const authored = page.locator(`${REPLY(2)} [data-gifcard] [data-alt-text]`);
    assert.equal(await authored.count(), 1, 'a GIF whose author wrote alt shows it');
    const text = (await authored.textContent()).trim();
    assert.ok(text.startsWith('a golden retriever'),
      `the prefix is stripped, not printed (${JSON.stringify(text.slice(0, 24))})`);
    assert.ok(!/^Alt:/i.test(text), 'the reader never sees Bluesky\'s "Alt: " hack');

    // ---- claim 11 (structure): the auto-filled duplicate comes back too ----
    // Switching it on has a cost and the mock says so; this is that cost,
    // asserted rather than merely drawn.
    const dup = (await page.locator(`${REPLY(0)} [data-gifcard] [data-alt-text]`).textContent()).trim();
    assert.equal(dup, 'Warrior Nun Ava Running Through Water');

    alt.consoleErrors(); alt.errors();
  } finally { await alt.close(); }

  // ---- THE CONTROL: a news card's og:description is not alt text -----------
  // Run in BOTH states on the board, because the failure this catches is the
  // rule being implemented as "hide the description".
  for (const [state, prefs] of [['off', []], ['on', ["try { localStorage.setItem('forage.alttext','on'); } catch {}"]]]) {
    const b = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES, initScripts: prefs });
    try {
      const { page } = b;
      await page.setViewportSize(PHONE);
      await page.goto(`${b.origin}${BOARD_PATH}`);
      await page.waitForSelector('.postrow');

      // ---- claim 12 (structure) -------------------------------------------
      const news = page.locator('.postrow:has([data-ext-host]) [data-extcard]:not([data-gifcard])').first();
      const desc = await news.locator('.ext-desc').first().textContent();
      assert.ok(desc.includes('not plausible'),
        `an article summary shows with alt text ${state} — it is page content, not alt (saw ${JSON.stringify(desc.slice(0, 40))})`);
      // and the GIF rows on the same board are players either way
      assert.ok(await page.locator('[data-gifcard] [data-gifplay]').count() >= 3,
        'every GIF row on the board is a player');

      b.consoleErrors(); b.errors();
    } finally { await b.close(); }
  }
}
