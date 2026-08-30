// W25 — the thread as the approved mock draws it, under the load the mock
// never carried (plans/mocks/post-and-thread.html v18, section C; CroftC
// MOCKS.md — the Proposed frame is a capture of THIS tree, so what the owner
// approves is what this workflow holds).
//
// Found on forage.fyi, 2026-08-30, in two phone screenshots: a real handle plus
// "⟳ quoted this" wrapped the byline to three lines and pushed ⋯ down with it;
// no comment offered Reply, though the thread head did and the write exists
// (AGENTS.md § the lens writes). The mock could not have shown either — its
// names were five characters and its Reply was drawn in. Each claim below is
// one the mock makes and the shipped tree broke.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, FAKE_SIGNED_IN, THREAD_PATH, NODE_IDS, ROOT } from './harness/mock-thread.mjs';

const bylineRows = (page) => page.evaluate(() => [...document.querySelectorAll('.comment')].map((c) => {
  const b = c.querySelector(':scope > .comment-body > .byline');
  const who = b.querySelector('.who').getBoundingClientRect();
  const kebab = b.querySelector('.kebab').getBoundingClientRect();
  const extra = b.querySelector('.kind')?.getBoundingClientRect() ?? null;
  const time = b.querySelector('[data-time]').getBoundingClientRect();
  const mid = (r) => Math.round(r.top + r.height / 2);
  return {
    id: c.dataset.nodeId, who: b.querySelector('.who').textContent,
    // one line means every part shares the name's vertical centre
    sameLine: [kebab, time, extra].filter(Boolean).every((r) => Math.abs(mid(r) - mid(who)) <= 2),
    whoFits: who.right <= (extra ?? time).left, // the name yields (ellipsis), never overlaps
    kebabRight: Math.round(kebab.right), bodyRight: Math.round(c.querySelector(':scope > .comment-body > .comment-text').getBoundingClientRect().right),
  };
}));

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    const { page } = s;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${s.origin}${THREAD_PATH}`);
    await page.waitForSelector('.comment[data-kind="quote"]'); // the cascade landed
    const ids = await page.$$eval('.comment', (cs) => cs.map((c) => c.dataset.nodeId));
    assert.deepEqual(ids.sort(), [...NODE_IDS].sort(), 'every node in the fixture renders, quote included');

    // feed-row v1 claim 6: the post's text at the head is text — one step up
    // from the body (20px), body weight — not a 26px serif heading. The
    // owner's phone (2026-08-30): a four-line post filled the screen above
    // its picture.
    const head = await page.$eval('#main h1', (h) => { const c = getComputedStyle(h); return { weight: c.fontWeight, size: parseFloat(c.fontSize) }; });
    assert.equal(head.weight, '400', `the head's text is set bold (${head.weight}) — a post's text is not a heading`);
    assert.ok(head.size <= 20, `the head's text is ${head.size}px — 20px is the step up from the body`);

    // Claim A (decision 7): the byline is ONE line at 390 with a real handle —
    // name · (⟳ quoted this ·) time, and ⋯ in the corner, on that line.
    const rows = await bylineRows(page);
    for (const r of rows) {
      assert.ok(r.sameLine, `${r.who}: byline parts are not on one line (the time, the ⋯, or "quoted this" wrapped)`);
      assert.ok(r.whoFits, `${r.who}: the name runs into what follows it instead of yielding`);
      assert.ok(Math.abs(r.kebabRight - r.bodyRight) <= 4, `${r.who}: ⋯ is not in the top-right corner (kebab right ${r.kebabRight}, body right ${r.bodyRight})`);
    }

    // Claim C (decision 2's row, as drawn): signed in, EVERY comment offers
    // Reply on its action row — replies and quotes alike — and pressing one
    // opens a composer whose reply names THAT node as the parent.
    const replyless = await page.$$eval('.comment', (cs) => cs
      .filter((c) => !c.querySelector(':scope > .comment-body > .comment-actions button.reply'))
      .map((c) => c.dataset.nodeId));
    assert.deepEqual(replyless, [], 'every comment carries Reply on its action row');
    const target = NODE_IDS[2]; // d3, three deep
    await page.locator(`.comment[data-node-id="${target}"] > .comment-body > .comment-actions button.reply`).click();
    const composer = page.locator(`.comment[data-node-id="${target}"] [data-composer]`);
    assert.equal(await composer.count(), 1, 'the composer opens under the comment you answered');
    await composer.locator('textarea').fill('quiche it is');
    await composer.locator('button.primary').click();
    await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('createRecord') && (h.body || '').includes('app.bsky.feed.post')));
    const body = await page.evaluate(() => JSON.parse(window.__shimHits.findLast((h) => h.url.includes('createRecord')).body));
    assert.equal(body.record.reply.parent.uri, target, 'the reply names the comment as its parent');
    assert.equal(body.record.reply.root.uri, ROOT, 'and the post as its root');

    // Claim B (decision 1, as amended 2026-08-29 in c8af809): the vote stack sits
    // in the avatar column at the vertical middle of the body, a BUTTON when
    // signed in, and the quote's stack is no different from a reply's.
    const stacks = await page.$$eval('.comment', (cs) => cs.map((c) => {
      const st = c.querySelector(':scope > .comment-body > button.avvote');
      const av = c.querySelector(':scope > .avcol .av').getBoundingClientRect();
      const text = c.querySelector(':scope > .comment-body > .comment-text').getBoundingClientRect();
      const acts = c.querySelector(':scope > .comment-body > .comment-actions').getBoundingClientRect();
      const r = st?.getBoundingClientRect();
      return { id: c.dataset.nodeId, isButton: !!st, inColumn: r ? Math.abs((r.left + r.right) / 2 - (av.left + av.right) / 2) <= 2 : false,
        middle: r ? Math.abs((r.top + r.bottom) / 2 - (text.top + acts.bottom) / 2) <= 6 : false };
    }));
    for (const st of stacks) {
      assert.ok(st.isButton, `${st.id}: signed in, the stack is a button`);
      assert.ok(st.inColumn, `${st.id}: the stack is centred in the avatar column`);
      assert.ok(st.middle, `${st.id}: the stack sits at the vertical middle of the body`);
    }
    // Claim F (decision 10, mock v19 § F): a deep link lands on ITS comment and
    // stays there — the quote cascade repaints the list after the first paint,
    // and the focus must survive that repaint (found by the shipped capture,
    // 2026-08-30: the bar said "Viewing one comment" over a thread with no
    // focused comment; e2e/deep-link never saw it because its fixture has no quotes).
    await page.goto(`${s.origin}${THREAD_PATH}&focus=${encodeURIComponent(NODE_IDS[2])}`);
    await page.waitForSelector('.comment[data-kind="quote"]'); // the cascade has repainted
    await page.waitForTimeout(300);
    const focused = await page.$$eval('.comment.focused', (cs) => cs.map((c) => c.dataset.nodeId));
    assert.deepEqual(focused, [NODE_IDS[2]], 'after the cascade repaint, the deep-linked comment is still the focused one');
    assert.equal(await page.locator('.focus-bar').count(), 1, 'and the bar over it says so, once');
    assert.deepEqual(await s.shimMisses(), []);
    assert.deepEqual(s.errors(), []);
  } finally { await s.close(); }
}
