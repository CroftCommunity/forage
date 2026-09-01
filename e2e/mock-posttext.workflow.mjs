// W-posttext — the post's own WORDS as the mock draws them
// (plans/mocks/post-text.html; CroftC MOCKS.md P5: every promise a Proposed
// frame makes that a test can hold is held by a test that runs in the gate, so
// approving the frame approves what the gate runs).
//
// Found on 2026-09-01: the owner put forage.fyi beside bsky.app on a VGC post
// about digital ownership and said ours "is much less readable". Measured on
// the deployed tree the same hour, the whole 280-character record was one
// <h1> at ui-serif 26px/600 with `white-space: normal` and no facet markup:
// the author's two blank lines were gone, the article's url was inert text
// that broke mid-token at 390px, and on a phone the link card — the thing the
// post is about — sat below the fold.
//
// Each claim below is one the mock makes and the shipped tree broke. The
// fixture is the one the mock's pictures are captured from, so the picture and
// the claim cannot drift apart.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, FAKE_SIGNED_IN, THREAD_PATH, BOARD_PATH, NODE_IDS, NEWS } from './harness/mock-newspost.mjs';

const PHONE = { width: 390, height: 844 };

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    const { page } = s;
    await page.setViewportSize(PHONE);
    await page.goto(`${s.origin}${THREAD_PATH}`);
    await page.waitForSelector('.comment');

    // ---- claim 1 (look): the head's words are WORDS, not a headline ---------
    // The `format === 'link'` exemption withheld the body treatment from every
    // Bluesky news post, because such a post's "title" IS its text.
    const head = page.locator('h1.posttext').first();
    assert.equal(await head.count(), 1, 'the head renders the post as body text, not as a bare heading');
    const look = await head.evaluate((h) => { const c = getComputedStyle(h);
      return { size: parseFloat(c.fontSize), weight: c.fontWeight, family: c.fontFamily, ws: c.whiteSpace,
        wrap: c.overflowWrap, bodyFamily: getComputedStyle(document.body).fontFamily }; });
    assert.ok(look.size <= 21, `the head's words are at most 21px, not a 26px headline (got ${look.size}px)`);
    assert.equal(look.weight, '400', 'at body weight');
    assert.equal(look.family, look.bodyFamily, 'in the body face — a serif display face made 280 characters a headline');

    // ---- claim 2 (structure): the author's line structure survives ----------
    // 30% of live posts carry a \n (a 60-post sample of f/whats-hot, 2026-09-01).
    assert.equal(look.ws, 'pre-wrap', 'the head keeps the newlines the author wrote');
    const blocks = await head.evaluate((h) => h.textContent.split(/\n{2,}/).length);
    assert.equal(blocks, 2, 'this record is two blocks of prose once the card’s own url is trimmed');
    // and they are really drawn apart, not merely present in the text
    const gap = await head.evaluate((h) => {
      const r = document.createRange(); const t = h.firstChild;
      const i = h.textContent.indexOf('\n\n');
      r.setStart(t, 0); r.setEnd(t, i); const a = r.getBoundingClientRect();
      r.setStart(t, i + 2); r.setEnd(t, h.textContent.length); const b = r.getBoundingClientRect();
      return Math.round(b.top - a.bottom);
    });
    assert.ok(gap >= 10, `the two blocks are drawn apart (${gap}px between them)`);

    // ---- claim 3 (structure): the trailing url the card already is is gone --
    const headText = await head.textContent();
    assert.ok(!headText.includes('videogameschronicle.com/news/sony-sa'),
      'the raw url is not printed directly above the card that carries it in full');
    assert.ok(headText.includes('"obtaining ownership" of it.'), 'and nothing the author wrote is cut');

    // ---- claim 4 (measure): nothing the head draws overflows the phone ------
    // The url token was 43 characters and broke mid-word at 390px.
    // Two checks, because neither alone is honest (CroftC MOBILE-FIRST: a
    // scrollWidth check cannot fail under overflow-x: clip, and a per-element
    // rect check false-positives on anything a clipping ancestor already cuts —
    // the media stage's blurred backdrop is drawn wider than its frame on purpose).
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const clipped = (e) => { for (let a = e.parentElement; a; a = a.parentElement) {
        const o = getComputedStyle(a); if (o.overflowX !== 'visible' || o.overflow !== 'visible') return true; } return false; };
      return [...document.querySelectorAll('#main *')]
        .filter((e) => e.getBoundingClientRect().right > w + 1 && !clipped(e))
        .map((e) => e.className || e.tagName);
    });
    assert.deepEqual(overflow, [], `nothing unclipped runs past 390px (${overflow.join(', ')})`);
    const scroll = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    assert.ok(scroll.w <= scroll.c, `the page does not scroll sideways (${scroll.w} > ${scroll.c})`);

    // ---- claim 5 (structure): the card is the link, and it is reachable -----
    const card = page.locator('[data-extcard]').first();
    assert.equal(await card.count(), 1, 'the external card renders on the thread head');
    assert.equal(await card.locator('[data-ext-host]').textContent(), 'videogameschronicle.com');
    // the card's top within one phone screen of the top of the post: the whole
    // point of the change is that the reader reaches the article without scrolling
    const cardTop = await card.evaluate((c) => Math.round(c.getBoundingClientRect().top + window.scrollY));
    assert.ok(cardTop < 844, `the card is on the first screen (its top is at ${cardTop}px)`);

    // ---- claim 6 (structure): a reply's links, tags and mentions are live ---
    // A thread node's shape carried no facets at all, so every one was dead text.
    const r1 = page.locator(`.comment[data-node-id="${NODE_IDS[0]}"] > .comment-body > .comment-text`);
    const kinds = await r1.evaluate((t) => [...t.querySelectorAll('a')].map((a) => a.getAttribute('href')));
    assert.equal(kinds.length, 3, `the reply's link, mention and #tag are all anchors (got ${kinds.length})`);
    assert.ok(kinds.some((h) => h.startsWith('https://www.courtlistener.com/')), 'the link opens the article, not the truncated display text');
    assert.ok(kinds.some((h) => h.startsWith('https://bsky.app/profile/')), 'the @mention goes to the profile, out on bsky.app');
    assert.ok(kinds.some((h) => h.startsWith('/h/')), 'the #tag opens as a board here');
    // a reply keeps its own blank line too (it did, through mdLite — the head
    // was the surface out of step, and both go through one renderer now)
    const r2ws = await page.locator(`.comment[data-node-id="${NODE_IDS[1]}"] > .comment-body > .comment-text`)
      .evaluate((t) => ({ ws: getComputedStyle(t).whiteSpace, blocks: t.textContent.split(/\n{2,}/).length }));
    assert.equal(r2ws.blocks, 2, 'the reply keeps the blank line its author wrote');
    assert.equal(r2ws.ws, 'pre-wrap');

    // ---- claim 7 (structure): a link with no thumbnail still has a card -----
    await page.goto(`${s.origin}${BOARD_PATH}`);
    await page.waitForSelector('.postrow');
    const nothumb = page.locator('[data-extcard][data-nothumb]').first();
    assert.equal(await nothumb.count(), 1, 'an external embed with no og:image renders its card without a stage');
    assert.equal(await nothumb.locator('[data-ext-title]').textContent(), 'Statement on In re Sony Digital Purchases');
    assert.equal(await nothumb.locator('.stage').count(), 0, 'and no empty stage above it');

    // ---- claim 8 (structure): the row agrees with the head -----------------
    const row = page.locator('.postrow').first();
    const rowText = await row.locator('.posttitle').textContent();
    assert.ok(!rowText.includes('videogameschronicle.com/news/sony-sa'), 'the row trims the card’s url the same way the head does');
    assert.equal(await row.locator('.posttitle').evaluate((t) => getComputedStyle(t).whiteSpace), 'pre-wrap',
      'and keeps the same line structure');

    // ---- claim 9 (measure): the head's counts sit on the Reply line --------
    // v2, the owner on the v1 frames (2026-09-01): "can we move the reply count,
    // repost count and upvote count down to the line where the reply button is
    // now?" The counts had their own row directly under the words, so the head
    // put a rule of numbers between the post and the card it is about. They
    // belong with the one control that answers them.
    await page.goto(`${s.origin}${THREAD_PATH}`);
    await page.waitForSelector('.comment');
    const foot = await page.evaluate(() => {
      const head = document.querySelector('#main .card');
      const row = head.querySelector('.head-actions');
      if (!row) return { row: false };
      const mid = (e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); };
      const replies = row.querySelector('.postmeta');
      const repost = row.querySelector('[data-repost], .repost');
      const like = row.querySelector('.vote');
      const reply = row.querySelector('a.reply-right, .reply-right');
      const media = head.querySelector('[data-extcard]');
      const kids = [...head.children];
      return {
        row: true, hasAll: !!(replies && repost && like && reply),
        sameLine: [repost, like, reply].filter(Boolean).every((e) => Math.abs(mid(e) - mid(replies)) <= 2),
        replyLast: reply ? Math.round(reply.getBoundingClientRect().right) >= Math.round(like.getBoundingClientRect().right) : false,
        belowCard: media ? row.getBoundingClientRect().top > media.getBoundingClientRect().bottom : null,
        rowIsLast: kids.indexOf(row.closest('#main .card > div > *') || row) >= 0,
        separateReplyRow: !!head.querySelector('.head-reply'),
      };
    });
    assert.ok(foot.row, 'the head keeps one action row');
    assert.ok(foot.hasAll, 'the reply count, the ⟳ figure, the like and Reply are all on it');
    assert.ok(foot.sameLine, 'and they share one line');
    assert.ok(foot.replyLast, 'Reply is at the right end of it');
    assert.equal(foot.belowCard, true, 'the row is BELOW the card now — the counts no longer split the post from what it is about');
    assert.equal(foot.separateReplyRow, false, 'and Reply no longer has a row of its own');

    s.consoleErrors(); s.errors(); // the fixture's pictures are data URIs; nothing is fenced away here
    return { ok: true, claims: 9 };
  } finally {
    await s.close();
  }
}
