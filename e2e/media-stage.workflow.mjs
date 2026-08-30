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
] };

// The stage's cap for the CURRENT size, as the stylesheet resolves it.
const capOf = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stage-cap')));

const stageOf = (page, rkey) => page.locator(`.postrow:has(a[href*="${rkey}"]) .stage`).first();

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
    assert.equal(await page.locator('.postrow:has(a[href*="/text"]) .stage').count(), 0, 'a text-only post has no stage element at all');

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
}
