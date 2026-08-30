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
    // feed-row v4 claim 15 (owner: "a simple text box to drop down with a send or
    // cancel"): under a comment the box is the QUICK one — textarea, Send,
    // Cancel, nothing else; Cancel folds it and keeps what was typed as a draft
    assert.equal(await composer.getAttribute('data-quick'), '1', 'the box under a comment is the quick box');
    assert.equal(await composer.locator('[data-attach-image]').count(), 0, 'no image strip on the quick box');
    assert.equal(await composer.locator('[data-send]').count(), 1, 'Send');
    assert.equal(await composer.locator('[data-cancel]').count(), 1, 'Cancel');
    await composer.locator('textarea').fill('half a thought');
    await composer.locator('[data-cancel]').click();
    assert.equal(await page.locator(`.comment[data-node-id="${target}"] [data-composer]`).count(), 0, 'Cancel folds the box');
    assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null')?.text, `forage.draft:${target}`), 'half a thought', 'and keeps the words as a draft');
    await page.locator(`.comment[data-node-id="${target}"] > .comment-body > .comment-actions button.reply`).click();
    assert.equal(await composer.locator('textarea').inputValue(), 'half a thought', 'reopened, the draft is back');
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

    // feed-row v4 claims 12–14 (owner: "put reply on the right side, and when I
    // hit reply I want to be on a new page with the text input box and the
    // comment I am replying to above it"): the head's Reply is a LINK at the
    // right end of the like's row; the page shows the post above the box; a
    // draft is kept in this browser across a reload and cleared on send.
    await page.goto(`${s.origin}${THREAD_PATH}`);
    await page.waitForSelector('#main [data-reply-open]');
    const headReply = page.locator('#main [data-reply-open]');
    assert.equal(await headReply.evaluate((a) => a.tagName), 'A', 'the head’s Reply is a link to a page, not a button that unfolds');
    assert.ok((await headReply.getAttribute('href')).startsWith('/reply?uri='), 'and it opens /reply');
    const geo = await page.evaluate(() => {
      const a = document.querySelector('#main [data-reply-open]'); const row = a.parentElement; const pill = row.querySelector('[data-vote]');
      const ra = a.getBoundingClientRect(), rr = row.getBoundingClientRect(), rp = pill.getBoundingClientRect();
      return { rightGap: Math.round(rr.right - ra.right), sameLine: Math.abs((ra.top + ra.height / 2) - (rp.top + rp.height / 2)) <= 4 };
    });
    assert.ok(geo.rightGap <= 4, `Reply is not at the right end of its row (gap ${geo.rightGap}px)`);
    assert.ok(geo.sameLine, 'Reply shares the line with the like pill');
    // feed-row v6 (owner: "move the name here to the human display name in the top
    // left and put the f/threads content on the top right"): the head opens with
    // a byline — avatar, the chosen name, the mark, the time — and the board's
    // breadcrumb sits at the right end of that same line; the like row no
    // longer carries the author
    const hb = await page.evaluate(() => {
      const card = document.querySelector('#main .card'); const cs = getComputedStyle(card); const cr = card.getBoundingClientRect();
      const left = cr.left + parseFloat(cs.paddingLeft), right = cr.right - parseFloat(cs.paddingRight);
      const who = card.querySelector('.head-byline .who'); const crumb = card.querySelector('.head-byline .head-crumb');
      if (!who || !crumb) return { who: !!who, crumb: !!crumb };
      const w = who.getBoundingClientRect(), c = crumb.getBoundingClientRect(), av = card.querySelector('.head-byline .av')?.getBoundingClientRect();
      const kebab = card.querySelector('.head-byline .kebab').getBoundingClientRect(); // the ⋯ keeps the corner (post-and-thread decision 7)
      const text = card.querySelector('h1').getBoundingClientRect();
      return { who: true, crumb: true, shown: who.textContent.trim(), handle: who.dataset.handle,
        avLeftGap: av ? Math.round(av.left - left) : null, crumbRightGap: Math.round(kebab.left - c.right), kebabRightGap: Math.round(right - kebab.right),
        sameLine: Math.abs((w.top + w.height / 2) - (c.top + c.height / 2)) <= 3, aboveText: c.bottom <= text.top,
        authorInLikeRow: !!card.querySelector('.head-actions a[href^="/u/"]') };
    });
    assert.ok(hb.who && hb.crumb, `the head opens with a byline and carries the breadcrumb (who ${hb.who}, crumb ${hb.crumb})`);
    assert.equal(hb.shown, 'The Quiet Cartographer', 'the head shows the chosen name');
    assert.equal(hb.handle, 'quietcartographer.bsky.social', 'the handle rides as data (and the tooltip)');
    assert.ok(hb.avLeftGap !== null && hb.avLeftGap <= 2, `the byline starts at the card's left edge (avatar ${hb.avLeftGap}px in)`);
    assert.ok(hb.crumbRightGap <= 10 && hb.kebabRightGap <= 2, `f/thread is not right-aligned beside the ⋯ (${hb.crumbRightGap}px from the ⋯, ⋯ ${hb.kebabRightGap}px from the edge)`);
    assert.ok(hb.sameLine && hb.aboveText, 'name and breadcrumb share the top line, above the text');
    assert.equal(hb.authorInLikeRow, false, 'the like row no longer repeats the author');
    const pillH = await page.$eval('#main .head-actions [data-vote]', (b) => b.getBoundingClientRect().height);
    assert.ok(pillH <= 44, `the like pill was squeezed onto two lines by the row (height ${Math.round(pillH)}px)`);
    await headReply.click();
    await page.waitForSelector('[data-reply-target]');
    assert.ok((await page.locator('[data-reply-target]').innerText()).includes('Pneumatic Pie Tube'), 'the post being answered is on the page, above the box');
    const tb = await page.$eval('[data-reply-target] .byline', (b) => { const w = b.querySelector('.who').getBoundingClientRect(), k = b.querySelector('.kebab').getBoundingClientRect(); return Math.abs((w.top + w.height / 2) - (k.top + k.height / 2)); });
    assert.ok(tb <= 4, `the answered post's ⋯ left its byline (${Math.round(tb)}px off the line)`);
    const pageBox = page.locator('[data-composer]:not([data-quick])');
    assert.equal(await pageBox.count(), 1, 'one box, the page’s');
    await pageBox.locator('textarea').fill('a draft, not yet sent');
    await page.waitForFunction((k) => !!localStorage.getItem(k), `forage.draft:${ROOT}`);
    await page.reload();
    await page.waitForSelector('[data-composer] textarea');
    assert.equal(await page.locator('[data-composer] textarea').inputValue(), 'a draft, not yet sent', 'the draft came back after a reload');
    assert.match(await page.locator('[data-draft-status]').innerText(), /Draft saved in this browser/);
    const before = await page.evaluate(() => window.__shimHits.filter((h) => h.url.includes('createRecord')).length);
    await page.locator('[data-composer] [data-send]').click();
    await page.waitForFunction((n) => window.__shimHits.filter((h) => h.url.includes('createRecord')).length > n, before);
    const sent = await page.evaluate(() => JSON.parse(window.__shimHits.filter((h) => h.url.includes('createRecord')).at(-1).body));
    assert.equal(sent.record.text, 'a draft, not yet sent');
    assert.equal(sent.record.reply.parent.uri, ROOT, 'replying to the post: parent is the post');
    assert.equal(sent.record.reply.root.uri, ROOT);
    await page.waitForFunction((k) => !localStorage.getItem(k), `forage.draft:${ROOT}`);
    await page.waitForSelector('.comment'); // sent, and back on the thread
    assert.deepEqual(await s.shimMisses(), []);
    assert.deepEqual(s.errors(), []);
  } finally { await s.close(); }
}
