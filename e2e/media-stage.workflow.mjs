// W24 — the media stage (plan 2026-08-29-plan-board-cards, decision 4). The
// owner's second finding on the live site: card rows were "clunky and half
// empty" — a 220px-capped inline image in a tile of negative space. Reddit's
// answer is a STAGE: a card-wide frame, height capped, the picture centred and
// contain-fit, a blurred copy of itself as the backdrop, black bands for video.
//
// The load-bearing claim is that the frame is sized BEFORE the picture loads,
// from the ratio the PDS already sends (Phase 5a) — so a board never jumps as
// images arrive. This suite ABORTS every image request to prove it: a stage
// with a height in that state can only have got it from the shaped ratio.
//
// Phase 5c: the card size (1–4, default 4) replaces the drag slider and sets
// the cap; Phase 6: more than one picture (a carousel, or a grid up to the
// "pictures shown at once" setting).
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const T = '2026-08-26T10:00:00Z';
const img = (n, aspectRatio) => ({ thumb: `https://cdn.test/${n}-thumb.jpg`, fullsize: `https://cdn.test/${n}.jpg`, alt: `picture ${n}`, ...(aspectRatio ? { aspectRatio } : {}) });
const post = (rkey, text, embed) => ({ post: {
  uri: `at://did:plc:aa/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did: 'did:plc:aa', handle: 'aa.test' },
  record: { text, createdAt: T }, indexedAt: T,
  replyCount: 0, repostCount: 0, likeCount: 1, ...(embed ? { embed } : {}),
} });
const images = (...list) => ({ $type: 'app.bsky.embed.images#view', images: list });
const FEED = { feed: [
  post('portrait', 'a tall one', images(img('p', { width: 1080, height: 1920 }))),
  post('landscape', 'a wide-ish one', images(img('l', { width: 1600, height: 1200 }))),
  post('wide', 'a very wide one', images(img('w', { width: 1920, height: 1080 }))),
  post('video', 'a video', { $type: 'app.bsky.embed.video#view', cid: 'bafyv', playlist: 'https://cdn.test/v.m3u8', thumbnail: 'https://cdn.test/v-thumb.jpg', aspectRatio: { width: 1920, height: 1080 } }),
  post('noaspect', 'an old record with no ratio', images(img('n'))),
  post('text', 'a text-only post'),
  // Phase 6 (decision 5): more than one picture
  post('four', 'four pictures', images(img('4a', { width: 1600, height: 1200 }), img('4b', { width: 1080, height: 1920 }), img('4c', { width: 1920, height: 1080 }), img('4d', { width: 1200, height: 1200 }))),
  post('two', 'two pictures', images(img('2a', { width: 1600, height: 1200 }), img('2b', { width: 1600, height: 1200 }))),
  post('three', 'three pictures', images(img('3a', { width: 1600, height: 1200 }), img('3b', { width: 1600, height: 1200 }), img('3c', { width: 1600, height: 1200 }))),
] };

// The stage's cap for the CURRENT size, as the stylesheet resolves it.
const capOf = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stage-cap')));

// a row by its rkey: the thread link is /p?uri=<encoded at-uri>, so the rkey
// arrives as %2F<rkey> — a bare "/<rkey>" matches nothing
const row = (rkey) => `.postrow:has(a[href*="%2F${rkey}"])`;
const stageOf = (page, rkey) => page.locator(`${row(rkey)} .stage`).first();

const geometry = (loc) => loc.evaluate((st) => {
  const s = st.getBoundingClientRect(), p = st.parentElement.getBoundingClientRect();
  const fore = st.querySelector('img.stage-fore')?.getBoundingClientRect();
  return { w: s.width, h: s.height, right: s.right, parentW: p.width, parentRight: p.right,
    foreCenter: fore ? fore.left + fore.width / 2 : null, stageCenter: s.left + s.width / 2,
    back: !!st.querySelector('.stage-back'), aspect: st.getAttribute('data-aspect') };
});

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', responses: { 'getFeed': FEED, 'getTrendingTopics': { topics: [] } } });
  try {
    const { page } = s;
    // no picture ever decodes — an empty body answers every image, so an img
    // has no natural size and a sized stage proves the ratio reached the DOM
    // (an abort would log a resource error the harness collects as a failure)
    await page.route('**/*.jpg', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(0) }));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${s.origin}/f/whats-hot`);
    await page.waitForSelector('.stage');

    assert.equal(await page.locator('.media-strip img').count(), 0, 'the inline strip is gone from image posts');
    assert.equal(await page.locator(`${row('text')} .stage`).count(), 0, 'a text-only post has no stage element at all');

    const cap = await capOf(page);
    assert.ok(cap >= 500 && cap <= 540, `size 4 on the laptop caps the stage at ~520px (${cap})`);

    for (const rkey of ['portrait', 'landscape', 'wide', 'video']) {
      const g = await geometry(stageOf(page, rkey));
      assert.ok(g.h > 0, `${rkey}: the stage is sized before (here: without) the picture loading`);
      assert.ok(Math.abs(g.w - g.parentW) <= 1, `${rkey}: the stage is the card's inner width (${g.w} vs ${g.parentW})`);
      assert.ok(g.h <= cap + 1, `${rkey}: the stage never exceeds the cap (${g.h} > ${cap})`);
      assert.ok(Math.abs(g.foreCenter - g.stageCenter) <= 1, `${rkey}: the picture is centred`);
      assert.equal(g.back, rkey !== 'video', `${rkey}: a blurred backdrop for pictures, black bands for video`);
    }
    const portrait = await geometry(stageOf(page, 'portrait'));
    assert.ok(Math.abs(portrait.h - cap) <= 1, `a portrait picture fills the cap (${portrait.h} vs ${cap})`);
    const wide = await geometry(stageOf(page, 'wide'));
    assert.ok(wide.h < cap - 20, `a wide picture makes the stage SHORTER than the cap (${wide.h} < ${cap})`);
    assert.ok(Math.abs(wide.h - wide.w * 1080 / 1920) <= 2, `…exactly width / ratio (${wide.h} for ${wide.w} wide)`);

    // no ratio on the embed: the cap is the height, and the stage says it will size on load
    const none = await geometry(stageOf(page, 'noaspect'));
    assert.equal(none.aspect, 'none', 'a stage with no ratio says so');
    assert.ok(Math.abs(none.h - cap) <= 1, `…and takes the cap as its height until the picture says otherwise (${none.h})`);

    // the fore picture is contain-fit; the backdrop is the picture again, blurred
    const fit = await stageOf(page, 'portrait').evaluate((st) => ({
      fore: getComputedStyle(st.querySelector('img.stage-fore')).objectFit,
      backFilter: getComputedStyle(st.querySelector('.stage-back')).filter,
      backSrc: st.querySelector('.stage-back').getAttribute('src'), foreSrc: st.querySelector('img.stage-fore').getAttribute('src'),
    }));
    assert.equal(fit.fore, 'contain');
    assert.match(fit.backFilter, /blur\(/, 'the backdrop is blurred');
    assert.equal(fit.backSrc, fit.foreSrc, 'the backdrop IS the picture');

    // prefers-reduced-transparency (and D1's fallback) drops the blur for a flat band.
    // Playwright cannot emulate that media feature, so the branch is asserted as
    // WRITTEN: a media rule naming it that hides the backdrop.
    const flat = await page.evaluate(() => {
      const rules = [];
      for (const sheet of document.styleSheets) { try { for (const r of sheet.cssRules) if (r.media && /prefers-reduced-transparency/.test(r.media.mediaText)) rules.push([...r.cssRules].map((x) => x.cssText).join(' ')); } catch {} }
      return rules.join(' ');
    });
    assert.match(flat, /\.stage-back[^{]*\{[^}]*display:\s*none/, 'reduced transparency: no blurred backdrop, a flat band instead');

    // the stage never exceeds the card by a pixel at any width
    for (const width of [320, 360, 390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(50);
      for (const rkey of ['portrait', 'wide', 'video']) {
        const g = await geometry(stageOf(page, rkey));
        assert.ok(g.right <= g.parentRight + 1, `${rkey} @${width}: the stage overflows the card (${g.right} > ${g.parentRight})`);
        assert.ok(g.h <= (await capOf(page)) + 1, `${rkey} @${width}: within the cap`);
      }
    }

    // size 1 on a phone: the smallest stage; size 4 on the laptop: the tallest (decision 7)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem('forage.cardsize', '1'));
    await page.reload();
    await page.waitForSelector('.stage');
    const small = await geometry(stageOf(page, 'portrait'));
    assert.ok(small.h <= 180, `size 1 on a phone: the stage is at most 180px (${small.h})`);
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-cardsize')), '1', 'the size is on the root');

    // (no shimMisses check: the board's constellation lookups are not this
    // suite's subject and have no fixture here)
    assert.deepEqual(s.errors(), []);
  } finally { await s.close(); }

  // ---- Phase 6 (decision 5): more than one picture --------------------------
  // One advanced setting, "pictures shown at once" 1–4 (default 1). Up to that
  // many stand in Bluesky's grid; more than that fold into ONE stage as a
  // carousel — dots, edge arrows, swipe, arrow keys, and a live region that
  // says "picture 2 of 4". Setting 4 is never a carousel (Bluesky caps at 4).
  const m = await scenario('first-visit', { mode: 'bluesky', responses: { 'getFeed': FEED, 'getTrendingTopics': { topics: [] } } });
  try {
    const { page } = m;
    await page.route('**/*.jpg', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(0) }));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${m.origin}/f/whats-hot`);
    await page.waitForSelector('.stage');
    const four = page.locator(row('four'));

    // default 1: the four-picture post is ONE stage, a carousel
    assert.equal(await page.evaluate(() => localStorage.getItem('forage.pictures')), null, 'nothing stored: the default is 1');
    const car = four.locator('.stage.carousel');
    assert.equal(await car.count(), 1, 'a four-picture post at setting 1 is one carousel stage');
    assert.equal(await four.locator('.stage').count(), 1, '…and no other stage');
    assert.equal(await car.locator('[data-slide]').count(), 4, 'four slides');
    const visible = () => car.locator('[data-slide]').evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); const p = e.closest('.stage').getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1 && r.width > 0; }).length);
    assert.equal(await visible(), 1, 'one slide in view');
    assert.equal(await car.locator('.dots [data-dot]').count(), 4, 'four dots');
    const live = car.locator('[aria-live]');
    assert.equal(await live.count(), 1, 'a live region');
    assert.equal((await live.innerText()).trim(), 'picture 1 of 4');
    const alts = await car.locator('[data-slide] img.stage-fore').evaluateAll((els) => els.map((e) => e.getAttribute('alt')));
    assert.deepEqual(alts, ['picture 4a', 'picture 4b', 'picture 4c', 'picture 4d'], 'each slide keeps its own alt');
    const counter = car.locator('.stage-counter');
    assert.equal(await counter.getAttribute('aria-hidden'), 'true', 'the n / m counter is decorative; the live region carries the words');
    assert.match((await counter.innerText()).trim(), /^1\s*\/\s*4$/);

    // the arrows move it
    await car.locator('button.stage-next').click();
    await page.waitForFunction(() => document.querySelector('.stage.carousel [aria-live]')?.textContent.trim() === 'picture 2 of 4');
    assert.equal(await car.locator('.dots [data-dot][aria-current="true"]').getAttribute('data-dot'), '2');
    await car.locator('button.stage-prev').click();
    await page.waitForFunction(() => document.querySelector('.stage.carousel [aria-live]')?.textContent.trim() === 'picture 1 of 4');
    // → and ← keys move it when the stage has focus
    await car.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.stage.carousel [aria-live]')?.textContent.trim() === 'picture 2 of 4');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('.stage.carousel [aria-live]')?.textContent.trim() === 'picture 1 of 4');
    // a swipe moves it (pointer events, which a finger and a mouse both send —
    // the harness context has no hasTouch, so Playwright's touchscreen is not
    // available here; the handler is proven, the feel is the Samsung's)
    const box = await car.boundingBox();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.stage.carousel [aria-live]')?.textContent.trim() === 'picture 2 of 4');
    // the track animates (250ms); count once it has settled
    await page.waitForFunction((sel) => [...document.querySelectorAll(`${sel} .stage.carousel [data-slide]`)].filter((e) => {
      const r = e.getBoundingClientRect(); const p = e.closest('.stage').getBoundingClientRect();
      return r.left >= p.left - 1 && r.right <= p.right + 1 && r.width > 0; }).length === 1, row('four'));
    assert.equal(await visible(), 1, 'still one slide in view after a swipe');
    assert.equal(await car.locator('[data-slide="2"]').evaluate((e) => { const r = e.getBoundingClientRect(); const p = e.closest('.stage').getBoundingClientRect(); return r.left >= p.left - 1 && r.right <= p.right + 1; }), true, 'and it is the second');
    // the carousel is the card's width and within the cap, like any stage
    const cg = await geometry(car);
    assert.ok(Math.abs(cg.w - cg.parentW) <= 1 && cg.h <= (await capOf(page)) + 1, 'the carousel is a stage: card-wide, capped');

    // setting 4: all four in a grid, and never a carousel
    await page.evaluate(() => localStorage.setItem('forage.pictures', '4'));
    await page.reload();
    await page.waitForSelector('.stage');
    assert.equal(await four.locator('.stage.carousel').count(), 0, 'setting 4: no carousel anywhere');
    const grid4 = four.locator('.stage-grid[data-count="4"]');
    assert.equal(await grid4.count(), 1);
    assert.equal(await grid4.locator('img.stage-fore').count(), 4, 'four pictures in the 4-grid');
    // exactly N shown for count ≤ N — never a one-slide carousel
    assert.equal(await page.locator(`${row('two')} .stage-grid[data-count="2"] img.stage-fore`).count(), 2);
    assert.equal(await page.locator(`${row('three')} .stage-grid[data-count="3"] img.stage-fore`).count(), 3);
    assert.equal(await page.locator(`${row('portrait')} .stage.carousel, ${row('portrait')} .stage-grid`).count(), 0, 'one picture is one plain stage');
    // the grid never exceeds the card
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(50);
      const g = await grid4.evaluate((n) => { const r = n.getBoundingClientRect(), p = n.parentElement.getBoundingClientRect(); return r.right <= p.right + 1; });
      assert.ok(g, `the 4-grid stays inside the card @${width}`);
    }

    // setting 2 with the four-picture post: two in the grid? No — MORE than
    // the setting folds into a carousel; the setting is the grid's ceiling
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => localStorage.setItem('forage.pictures', '2'));
    await page.reload();
    await page.waitForSelector('.stage');
    assert.equal(await four.locator('.stage.carousel [data-slide]').count(), 4, 'four pictures at setting 2 → a carousel of four');
    assert.equal(await page.locator(`${row('two')} .stage-grid[data-count="2"] img.stage-fore`).count(), 2, 'two pictures at setting 2 → the 2-grid');
    assert.equal(await page.locator(`${row('three')} .stage.carousel [data-slide]`).count(), 3, 'three at setting 2 → a carousel of three');

    // the setting has a row in Settings, and a bad stored value reads as 1
    await page.evaluate(() => localStorage.setItem('forage.pictures', '9'));
    await page.goto(`${m.origin}/settings`);
    await page.waitForSelector('#pref-pictures');
    assert.equal(await page.locator('#pref-pictures [role="radio"][aria-checked="true"]').getAttribute('data-notch'), '1', 'garbage reads as the default');
    await page.locator('#pref-pictures [data-notch="3"]').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('forage.pictures')), '3');
    assert.deepEqual(m.errors(), []);
  } finally { await m.close(); }
}
