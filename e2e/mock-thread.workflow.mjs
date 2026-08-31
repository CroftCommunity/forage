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
    // v11: the frame caught the word "null" above every comment's byline — a null
    // child handed to Element.append stringifies (the v7 board frame had the same)
    // (a text-node walk, not hasText: the stray "null" abuts the next text —
    // "nullA Very…" — so a word boundary never finds it; measured 2026-08-30)
    const strays = await page.evaluate(() => { const w = document.createTreeWalker(document.querySelector('#main'), NodeFilter.SHOW_TEXT); const out = []; let n;
      while ((n = w.nextNode())) { const t = n.textContent.trim(); if ((t === 'null' || t === 'undefined') && n.parentElement.closest('.comment')) out.push(n.parentElement.className); } return out; });
    assert.deepEqual(strays, [], `a comment prints a stringified null or undefined (in ${strays.join(', ')})`);
    // feed-row v11 decision 24 (owner, 2026-08-30: "I only want the pronounced left
    // side quote bar on the actual repost, not on all of its comments — they can
    // thread just like a normal comment"): the wall covers the quote's own rows
    // — byline, text, action row — and stops before its replies, which thread
    // beneath it like any reply
    const wallGeo = await page.locator('.comment[data-kind="quote"][data-depth="0"]').first().evaluate((q) => { // the plain thread page — on the deep-link page this node is folded and its rows are 0px // the plain thread page: on the deep-link page this node is folded and its rows are 0px
      const wall = q.querySelector(':scope > .wall'); const kid = q.querySelector(':scope > .kids > .comment');
      const text = q.querySelector(':scope > .comment-body > .comment-text');
      if (!wall) return { wall: false, border: parseFloat(getComputedStyle(q).borderLeftWidth) };
      const w = wall.getBoundingClientRect(), t = text?.getBoundingClientRect();
      return { wall: true, width: w.width, coversText: t ? w.top <= t.top && w.bottom >= t.bottom : null,
        stopsBeforeKids: kid ? w.bottom <= kid.getBoundingClientRect().top + 1 : null, hasKid: !!kid };
    });
    assert.ok(wallGeo.wall, `the quote draws its wall as its own element (a ${wallGeo.border}px border on the node runs down its replies)`);
    assert.ok(wallGeo.width >= 2, `the wall is pronounced (${wallGeo.width}px)`);
    assert.ok(wallGeo.coversText, `the wall covers the quote’s own text ${JSON.stringify(wallGeo)}`);
    assert.ok(wallGeo.hasKid, 'the fixture quote has a reply, so the claim has something to fail under');
    assert.ok(wallGeo.stopsBeforeKids, 'the wall runs down the quote’s replies');

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

    // Claim B — as re-decided by the owner 2026-08-31 (feed-row v9: "move away
    // from the upvote in the thread line and put it in the middle of the comment
    // at the bottom similar to other places"): the like is a pill on the
    // comment's ACTION ROW, in the cell before share (third of four under a
    // comment with children, the middle one otherwise), a BUTTON when signed
    // in; nothing sits in the avatar column but the avatar and the rail. The
    // row is one line, and its cells line up like a post row's.
    const stacks = await page.$$eval('.comment', (cs) => cs.map((c) => {
      const acts = c.querySelector(':scope > .comment-body > .comment-actions');
      const kids = [...acts.children].map((k) => k.matches('[data-fold]') ? 'fold' : k.matches('.reply') ? 'reply' : k.matches('[data-vote]') ? 'like' : k.matches('.share') ? 'share' : k.matches('[data-repost]') ? 'repost' : k.className);
      const like = acts.querySelector('button[data-vote]');
      const mids = [...acts.children].map((k) => { const r = k.getBoundingClientRect(); return r.top + r.height / 2; });
      return { id: c.dataset.nodeId, kids, isButton: !!like, inColumn: !!c.querySelector(':scope > .comment-body > .avvote, :scope > .avcol [data-vote]'),
        oneLine: Math.max(...mids) - Math.min(...mids) <= 2 };
    }));
    for (const st of stacks) {
      assert.ok(st.isButton, `${st.id}: signed in, the like on the action row is a button`);
      assert.equal(st.inColumn, false, `${st.id}: nothing votes from the avatar column any more`);
      const li = st.kids.indexOf('like'), sh = st.kids.indexOf('share');
      assert.ok(li >= 0 && sh === li + 1, `${st.id}: the like sits right before share (${st.kids.join(' · ')})`);
      assert.ok(st.kids.indexOf('reply') < li, `${st.id}: Reply comes before the like (${st.kids.join(' · ')})`);
      assert.ok(st.oneLine, `${st.id}: the action row wrapped`);
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
    // (v4's claim that Reply sits at the right end of the like's row is superseded by v11 decision 23, below)
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
    // feed-row v11 decision 23 (owner, 2026-08-30, a thread whose post carried a
    // continuation and a quote under its like row: "move the reply button to the
    // bottom of this top post comments page section … just reply alone, like
    // should be top towards the right"): Reply is the LAST thing in the head —
    // under the picture, the continuation and the quote — right-aligned; the like
    // row stays under the text with the like at its right end. The fixture's post
    // carries a picture so there is something to be under (P2: a load the claim
    // can fail under; on main Reply sat on the like row, above the picture).
    const order = await page.evaluate(() => {
      const a = document.querySelector('#main [data-reply-open]'); const col = document.querySelector('#main .head-actions').parentElement;
      const kids = [...col.children]; const stage = col.querySelector('.stage'); const row = col.querySelector('.head-actions');
      const holder = kids.find((k) => k.contains(a));
      const cs = getComputedStyle(col); const right = col.getBoundingClientRect().right - parseFloat(cs.paddingRight);
      const pill = row.querySelector('[data-vote]'); const rr = row.getBoundingClientRect(), rp = pill.getBoundingClientRect();
      return { stage: !!stage, last: kids.indexOf(holder) === kids.length - 1, onLikeRow: row.contains(a),
        underStage: stage ? a.getBoundingClientRect().top >= stage.getBoundingClientRect().bottom : null,
        rightGap: Math.round(right - a.getBoundingClientRect().right), likeRightGap: Math.round(rr.right - rp.right),
        after: kids.slice(kids.indexOf(holder) + 1).map((k) => k.className || k.tagName) };
    });
    assert.ok(order.stage, 'the fixture post carries a picture, so there is something for Reply to be under');
    assert.equal(order.onLikeRow, false, 'Reply is still on the like row');
    assert.ok(order.last, `Reply is not the last thing in the head — ${order.after.join(' · ')} follow it`);
    assert.ok(order.underStage, 'Reply sits under the picture, not between the text and it');
    assert.ok(order.rightGap <= 4, `Reply is not at the right edge of the head (gap ${order.rightGap}px)`);
    assert.ok(order.likeRightGap <= 4, `the like is not at the right end of its row (gap ${order.likeRightGap}px)`);
    // feed-row v12 decision 25 (owner, 2026-08-30: "the same button for us should
    // just popup with a dialogue that allows us to add commentary or not and if
    // we hit post without then it's just a plain repost"): ⟳ on every node — the
    // head's like row and every comment's action row — shows reposts + quotes
    // (bsky.app's figure) and opens a sheet; Post with nothing writes a plain
    // repost of that node; Post with words writes a quote post embedding it (no
    // reply field — it is a top-level post of mine); a node I reposted offers
    // Remove repost, which deletes the record
    const rp = await page.evaluate(() => {
      const q = document.querySelector('.comment[data-kind="quote"][data-depth="0"]');
      const btn = q?.querySelector(':scope > .comment-body > .comment-actions > [data-repost]');
      return { everyComment: [...document.querySelectorAll('.comment')].every((c) => c.querySelector(':scope > .comment-body > .comment-actions > button[data-repost]')),
        head: !!document.querySelector('#main .head-actions button[data-repost]'),
        quoteFigure: btn?.querySelector('.n')?.textContent ?? null, popup: btn?.getAttribute('aria-haspopup') ?? null };
    });
    assert.ok(rp.everyComment, 'every comment carries ⟳ as a button on its action row');
    assert.ok(rp.head, 'and so does the head’s like row');
    assert.equal(rp.quoteFigure, '3', `the quote’s ⟳ reads reposts + quotes, 2 + 1 (got ${rp.quoteFigure})`);
    assert.equal(rp.popup, 'dialog', '⟳ says it opens a dialog');
    const qnodeId = NODE_IDS[5];
    const qRepost = page.locator(`.comment[data-node-id="${qnodeId}"] > .comment-body > .comment-actions > [data-repost]`);
    await qRepost.click();
    const sheet = page.locator('dialog[data-repost-sheet]');
    assert.equal(await sheet.count(), 1, '⟳ opens the repost sheet');
    assert.equal(await sheet.locator('textarea').count(), 1, 'with a box for words');
    assert.equal(await sheet.locator('[data-repost-remove]').count(), 0, 'no Remove repost — I have not reposted this');
    await sheet.locator('[data-repost-post]').click();
    await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('createRecord') && (h.body || '').includes('app.bsky.feed.repost')));
    const repostBody = await page.evaluate(() => JSON.parse(window.__shimHits.findLast((h) => h.url.includes('createRecord')).body));
    assert.equal(repostBody.record.subject.uri, qnodeId, 'Post with nothing is a plain repost of that node');
    await page.waitForSelector('dialog[data-repost-sheet]', { state: 'detached', timeout: 5000 }); // the sheet closes on Post (after the write returns)
    assert.equal(await qRepost.getAttribute('aria-pressed'), 'true', 'the button reads pressed — mine now');
    assert.equal(await qRepost.locator('.n').textContent(), '4', 'and the figure moved up by one');
    await qRepost.click();
    assert.equal(await page.locator('dialog[data-repost-sheet] [data-repost-remove]').count(), 1, 'reposted already: the sheet offers Remove repost');
    await page.locator('dialog[data-repost-sheet] [data-repost-remove]').click();
    await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('deleteRecord') && (h.body || '').includes('app.bsky.feed.repost')));
    await page.waitForSelector('dialog[data-repost-sheet]', { state: 'detached', timeout: 5000 });
    assert.equal(await qRepost.getAttribute('aria-pressed'), 'false', 'removed: not mine any more');
    assert.equal(await qRepost.locator('.n').textContent(), '3', 'and the figure is back');
    const leafId = NODE_IDS[4];
    await page.locator(`.comment[data-node-id="${leafId}"] > .comment-body > .comment-actions > [data-repost]`).click();
    await page.locator('dialog[data-repost-sheet] textarea').fill('a treat unit is a treat unit');
    await page.locator('dialog[data-repost-sheet] [data-repost-post]').click();
    await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('createRecord') && (h.body || '').includes('app.bsky.embed.record')));
    const quoteBody = await page.evaluate(() => JSON.parse(window.__shimHits.findLast((h) => h.url.includes('createRecord')).body));
    assert.equal(quoteBody.collection, 'app.bsky.feed.post', 'Post with words is a post of mine');
    assert.equal(quoteBody.record.text, 'a treat unit is a treat unit');
    assert.equal(quoteBody.record.embed?.$type, 'app.bsky.embed.record', 'that embeds the node — a quote post');
    assert.equal(quoteBody.record.embed?.record?.uri, leafId, 'the node I pressed ⟳ on');
    assert.equal(quoteBody.record.reply, undefined, 'and is not a reply');
    const pillH = await page.$eval('#main .head-actions [data-vote]', (b) => b.getBoundingClientRect().height);
    assert.ok(pillH <= 44, `the like pill was squeezed onto two lines by the row (height ${Math.round(pillH)}px)`);
    await headReply.click();
    await page.waitForSelector('[data-reply-target]');
    assert.ok((await page.locator('[data-reply-target]').innerText()).includes('Pneumatic Pie Tube'), 'the post being answered is on the page, above the box');
    const tb = await page.$eval('[data-reply-target] .byline', (b) => { const w = b.querySelector('.who').getBoundingClientRect(), k = b.querySelector('.kebab').getBoundingClientRect(); return Math.abs((w.top + w.height / 2) - (k.top + k.height / 2)); });
    assert.ok(tb <= 4, `the answered post's ⋯ left its byline (${Math.round(tb)}px off the line)`);
    const pageBox = page.locator('[data-composer]:not([data-quick])');
    assert.equal(await pageBox.count(), 1, 'one box, the page’s');
    // feed-row v6 claims 19–21 (owner: "a 300char count thing like in bsky,
    // bottom right … image, gif, emoji selectors like at the bottom left"):
    // the count (with its ring) sits right, the three tools sit left; the
    // emoji palette inserts at the caret; an image needs alt text before Send
    const bar = await pageBox.evaluate((b) => {
      const box = b.getBoundingClientRect(); const mid = box.left + box.width / 2;
      const x = (sel) => { const e = b.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.left + r.width / 2; };
      return { mid, count: x('[data-count]'), ring: !!b.querySelector('[data-count-ring]'), img: x('[data-attach-image]'), gif: x('[data-attach-gif]'), emoji: x('[data-emoji]'),
        gifAccept: b.querySelector('[data-image-input="gif"]')?.getAttribute('accept') ?? null, countText: b.querySelector('[data-count]')?.textContent.trim() };
    });
    assert.ok(bar.count !== null && bar.count > bar.mid && bar.ring, `the count sits bottom-right with its ring (x ${Math.round(bar.count ?? -1)} vs mid ${Math.round(bar.mid)})`);
    assert.equal(bar.countText, '300', 'an empty box has 300 left');
    for (const [k, v] of Object.entries({ img: bar.img, gif: bar.gif, emoji: bar.emoji })) assert.ok(v !== null && v < bar.mid, `${k} selector sits bottom-left (x ${v})`);
    assert.equal(bar.gifAccept, 'image/gif', 'the GIF selector takes a .gif from the device');
    await pageBox.locator('[data-emoji]').click();
    await pageBox.locator('[data-emoji-palette] button').first().click();
    const firstEmoji = await pageBox.locator('textarea').inputValue();
    assert.ok(firstEmoji.length > 0 && /\p{Extended_Pictographic}/u.test(firstEmoji), `the palette inserted an emoji (${JSON.stringify(firstEmoji)})`);
    assert.equal(await pageBox.locator('[data-count]').innerText(), '299', 'one emoji is one grapheme off the count');
    await pageBox.locator('[data-image-input="image"]').setInputFiles({ name: 'one.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
    await pageBox.locator('[data-image-alt]').waitFor();
    assert.equal(await pageBox.locator('[data-send]').isDisabled(), true, 'an image without alt text cannot be sent');
    await pageBox.locator('[data-image-alt]').fill('one pixel');
    assert.equal(await pageBox.locator('[data-send]').isDisabled(), false, 'described, it can');
    await pageBox.locator('[data-image-remove]').click();
    await pageBox.locator('textarea').fill('a draft, not yet sent');
    assert.equal(await pageBox.locator('[data-count]').innerText(), '279', 'the count follows the text');
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
