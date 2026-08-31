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
    who: b.querySelector('.who').dataset.handle, // feed-row v2: the text is the chosen name; the handle is data
    shown: b.querySelector('.who').textContent.trim(),
    whoTitle: b.querySelector('.who').getAttribute('title') || '',
    mark: b.querySelector('.provider-mark')?.getAttribute('title') ?? null,
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
    // feed-row v2 claims 9–10: the chosen name shows, the handle stays one hover
    // away, and the mark names the provider — on every row, one line still
    const NAMES = Object.fromEntries(FEED.feed.map((i) => [i.post.author.handle, i.post.author.displayName ?? null]));
    for (const r of list) {
      const want = NAMES[r.who] ?? r.who;
      assert.ok(r.shown.startsWith(want), `${r.who}: the byline shows "${r.shown}", not the chosen name "${want}"`);
      if (NAMES[r.who]) assert.ok(r.whoTitle.includes(`@${r.who}`), `${r.who}: the handle is not in the name's tooltip ("${r.whoTitle}")`);
      assert.match(r.mark ?? '', /bsky\.social/, `${r.who}: no provider mark naming bsky.social (${r.mark})`);
    }
    // feed-row v4 claim 16 (owner: "what's this content about? … we can just
    // remove that"): the divergence-ledger chips (DL-010, DL-011) are not on a
    // reader's board — the ledger and /frontiers keep them
    assert.equal(await page.locator('#main .frontier-chip').count(), 0, 'no frontier chips over a reader’s board');
    // feed-row v7 claim 23 (owner: "I don't like where the f/whats-hot is … it's
    // just the same thing on every single post"): on a lens board every row's
    // feed IS the board, so the line under each row is gone — and no empty
    // meta line is left behind
    assert.equal(await page.locator('.postrow .postmeta a[href^="/f/"], .postrow .postmeta a[href^="/u/"]').count(), 0, 'no feed line under a lens row');
    assert.equal(await page.locator('.postrow .postmeta:empty').count(), 0, 'and no empty meta line where it was');
    // v9 (owner: "neither repost nor comment icon show the hand"): the replies link is a
    // control and says so with the pointer; the repost glyph is a COUNT on a row (O2) and does not
    const cursors = await page.$eval('.postrow .actions', (a) => ({ replies: getComputedStyle(a.querySelector('.replies')).cursor, repost: getComputedStyle(a.querySelector('[data-repost]')).cursor, like: getComputedStyle(a.querySelector('[data-vote]')).cursor }));
    assert.equal(cursors.replies, 'pointer', 'the replies link shows the hand');
    assert.equal(cursors.like, 'pointer', 'the like shows the hand');
    assert.notEqual(cursors.repost, 'pointer', 'the repost count does not pretend to be a control');
    assert.equal(await page.locator('.postrow', { hasText: /\bnull\b|\bundefined\b/ }).count(), 0, 'no row prints a stringified null or undefined (Element.append does that to a null child — the v7 frame)');
    // feed-row v5 claim 17 (owner: 'change "Feed order" to "Default"'): the sort's
    // first choice — the order the feed's own generator hands us — is called Default
    assert.equal(await page.locator('#main .sortbar select').first().locator('option').first().innerText(), 'Default', 'the sort’s first choice is "Default"');
    // feed-row v7 claim 22 (owner: '"123 likes curated by @bsky.app" > description …
    // a bit of a highlight outline … make bsky.app a link out'): one line — likes,
    // then the curator as a link out to bsky.app — the description quoted under
    // it, and the card outlined
    const fh = await page.$eval('#main [data-feed-header]', (c) => ({
      line: [c.querySelector('[data-feed-likes]'), c.querySelector('[data-feed-curator]')].map((e) => e?.textContent.replace(/\s+/g, ' ').trim() ?? null).join(' | '),
      // v8 (owner: "right align the Curated by"): likes at the left edge, the curator at the right edge of the same line
      ...((() => { const l = c.querySelector('[data-feed-likes]'), r = c.querySelector('[data-feed-curator]'), row = c.querySelector('[data-feed-line]');
        if (!l || !r || !row) return { aligned: false };
        const lb = l.getBoundingClientRect(), rb = r.getBoundingClientRect(), rw = row.getBoundingClientRect();
        return { aligned: Math.round(lb.left - rw.left) <= 1 && Math.round(rw.right - rb.right) <= 1 && Math.abs((lb.top + lb.height / 2) - (rb.top + rb.height / 2)) <= 3 }; })()),
      link: c.querySelector('[data-feed-line] a')?.getAttribute('href') ?? null,
      blank: c.querySelector('[data-feed-line] a')?.getAttribute('target') ?? null,
      blurb: c.querySelector('[data-feed-blurb]')?.textContent.trim() ?? null,
      highlight: c.classList.contains('highlight'), shadow: getComputedStyle(c).boxShadow,
    }));
    assert.equal(fh.line, '39.4k likes | Curated by @bsky.app', `the card's first line, likes then curator (${fh.line})`);
    assert.ok(fh.aligned, 'likes sit at the left edge and the curator at the right edge of one line');
    assert.equal(fh.link, 'https://bsky.app/profile/bsky.app', 'the curator links out to bsky.app');
    assert.equal(fh.blank, '_blank', 'in a new tab — it leaves Forage');
    assert.equal(fh.blurb, 'trending', 'the description sits under it, quoted');
    assert.ok(fh.highlight && fh.shadow !== 'none', `the card carries a highlight outline (class ${fh.highlight}, shadow ${fh.shadow})`);
    // feed-row v10 claim 27 (owner: "we give a mouseover underline … bsky and reddit
    // both give a subtle highlight to the moused over card and that's a better
    // model"): under the pointer the ROW lights — with the skin's own --row-hover,
    // so a skin's value reaches the row — and its text does not underline; a
    // control on the lit row still shows a hover of its own; the row the pointer
    // left is back at rest
    await page.setViewportSize({ width: 1280, height: 900 });
    const lit = await (async () => {
      const row = page.locator('.postrow').nth(1);
      await row.scrollIntoViewIfNeeded();
      const rest = await row.evaluate((r) => getComputedStyle(r).backgroundColor);
      await row.locator('.posttitle').hover(); // v13: the text is text, not a link — the pointer rests on it
      const on = await row.evaluate((r) => {
        const probe = document.createElement('div'); probe.style.background = 'var(--row-hover)'; document.body.append(probe);
        const want = getComputedStyle(probe).backgroundColor; probe.remove();
        return { bg: getComputedStyle(r).backgroundColor, want, underline: getComputedStyle(r.querySelector('.posttitle')).textDecorationLine };
      });
      await row.locator('.actions [data-vote]').hover();
      const control = await row.evaluate((r) => ({ row: getComputedStyle(r).backgroundColor, like: getComputedStyle(r.querySelector('.actions [data-vote]')).backgroundColor }));
      await page.mouse.move(0, 0);
      const after = await row.evaluate((r) => getComputedStyle(r).backgroundColor);
      return { rest, on, control, after };
    })();
    assert.notEqual(lit.on.bg, lit.rest, `the row under the pointer is not lit (${lit.on.bg} at rest and under the pointer)`);
    assert.equal(lit.on.bg, lit.on.want, `the lit row paints ${lit.on.bg}, not the skin's --row-hover ${lit.on.want}`);
    assert.equal(lit.on.underline, 'none', `the row's text underlines under the pointer (${lit.on.underline}) — the row lights instead`);
    assert.notEqual(lit.control.like, lit.control.row, 'the like on a lit row shows no hover of its own');
    assert.equal(lit.after, lit.rest, 'the row the pointer left is not back at rest');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(new Set(list.map((r) => r.likeLeft)).size, 1,
      `the like does not line up down the board: lefts ${list.map((r) => r.likeLeft).join(', ')}`);
    // board-cards decision D: a picture post stands on a stage, sized from its
    // aspect ratio before any bytes arrive (the images are fenced here) — a
    // portrait as one stage, four pictures as more than one
    const byWho = Object.fromEntries(list.map((r) => [r.who, r]));
    assert.ok(byWho['erislovesgardens.bsky.social']?.stage, 'the portrait post stands on a stage');
    assert.ok(byWho['misterhooperspecial.bsky.social']?.pictures >= 1, 'the four-picture post stands on a stage too');
    assert.equal(byWho['quietcartographer.bsky.social']?.pictures, 0, 'a text post has no stage and no empty frame');
    // ---- feed-row v13 (plan 2026-08-30-plan-feed-row-pointer-reply-quotes, E and H–K) ----
    const rowOf = (handle) => page.locator('.postrow').filter({ has: page.locator(`.who[data-handle="${handle}"]`) }).first();
    // K (owner: "bump the size up on the top left author attribution too"): the
    // chosen name reads at the post text's size — bsky.app's byline is the post's size
    const sizes = await page.evaluate(() => { const r = document.querySelector('.postrow'); return { who: parseFloat(getComputedStyle(r.querySelector('.byline .who')).fontSize), text: parseFloat(getComputedStyle(r.querySelector('.posttitle')).fontSize) }; });
    assert.ok(sizes.who >= sizes.text, `the byline's name is smaller than the post text (${sizes.who}px < ${sizes.text}px)`);
    // E, option 1 (owner: "I don't love how we extract every hashtag and present it
    // under and have it in the original"): no chip row; the tags stay in the
    // text as links; the ROW opens its thread (bsky.app's card), a tag opens its board
    assert.equal(await page.locator('.postrow .tag').count(), 0, 'no hashtag chips under a row — the tags are in the text');
    const portrait = rowOf('erislovesgardens.bsky.social');
    assert.equal(await portrait.locator('.posttext a[data-tag="bog"]').getAttribute('href'), '/h/bog', 'a #tag in the row’s text is a link to its board');
    assert.equal(await portrait.locator('.posttext a[href^="/h/"]').count(), 4, 'all four tags, in place');
    await portrait.scrollIntoViewIfNeeded();
    const padding = await portrait.evaluate((r) => { const b = r.getBoundingClientRect(); const cs = getComputedStyle(r); return { x: b.left + parseFloat(cs.paddingLeft) / 2, y: b.top + parseFloat(cs.paddingTop) / 2 }; });
    await page.mouse.click(padding.x, padding.y);
    await page.waitForFunction(() => location.pathname !== '/f/whats-hot');
    await page.waitForSelector('#main .head-actions', { timeout: 15000 }); // the thread head has rendered
    assert.ok(decodeURIComponent(page.url()).includes('/portrait'), `a press on the row’s own ground opens its thread (${page.url()})`);
    await page.goBack(); await page.waitForSelector('.postrow');
    await rowOf('erislovesgardens.bsky.social').locator('.posttext a[data-tag="bog"]').click(); // Playwright scrolls a locator into view itself
    await page.waitForFunction(() => location.pathname.startsWith('/h/'));
    assert.equal(new URL(page.url()).pathname, '/h/bog', 'a press on a tag opens the tag’s board, not the thread');
    await page.goBack(); await page.waitForSelector('.postrow');
    // J (owner: a link to a book — "the image should be centered? can we improve that?"):
    // the external card stands its picture on a stage, centred, with the title
    // and the host under it
    const bookCard = rowOf('briarpatchradio.bsky.social').locator('[data-extcard]');
    assert.equal(await bookCard.count(), 1, 'a link post carries an external card');
    const bookGeo = await bookCard.evaluate((c) => { const st = c.querySelector('.stage'); const img = c.querySelector('.stage img.stage-fore'); if (!st || !img) return { stage: !!st, img: !!img };
      const s = st.getBoundingClientRect(), r = img.getBoundingClientRect(); const ratio = img.naturalWidth / img.naturalHeight; const drawnW = Math.min(r.width, r.height * ratio); const left = (r.width - drawnW) / 2;
      return { stage: true, img: true, centred: Math.abs((s.left + left) - (s.right - left - drawnW)) <= 2 && left > 20, title: c.querySelector('[data-ext-title]')?.textContent.trim(), host: c.querySelector('[data-ext-host]')?.textContent.trim() }; });
    assert.ok(bookGeo.stage && bookGeo.img, `the book’s picture stands on a stage (stage ${bookGeo.stage}, picture ${bookGeo.img})`);
    assert.ok(bookGeo.centred, 'the portrait cover is centred in its frame, not pinned to an edge');
    assert.equal(bookGeo.title, 'The Bog Book', 'the card names the link');
    assert.equal(bookGeo.host, 'example.org', 'and its host');
    // H (owner: "this youtube video should be playable in place and should be
    // clearly a youtube video"): the card says YouTube; nothing from YouTube
    // loads until the press; the press swaps in the player, and stays on Forage
    const yt = rowOf('grickle.bsky.social').locator('[data-extcard]');
    assert.equal(await yt.getAttribute('data-provider'), 'youtube', 'the card knows it is YouTube');
    assert.match(await yt.locator('[data-ext-provider]').textContent(), /YouTube/, 'and says so');
    assert.equal(await yt.locator('iframe').count(), 0, 'no player, and nothing from YouTube, before the press');
    await yt.locator('button[data-play]').click();
    assert.match(await yt.locator('iframe').getAttribute('src'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/dok0rJSo8ug\b/, 'the press embeds the video (nocookie), in place');
    assert.equal(new URL(page.url()).pathname, '/f/whats-hot', 'and Forage is still the page');
    // I (owner: "this video seems to open directly on bluesky instead of playing
    // the content"): a native video plays in place — a button, not a link out;
    // the press mounts a <video> with the poster and the playlist; still on Forage
    const clip = rowOf('tiredactor.bsky.social').locator('.stage[data-stage="video"]');
    assert.equal(await clip.count(), 1, 'the clip stands on a video stage');
    assert.equal(await clip.locator('a[href*="bsky.app"]').count(), 0, 'the stage no longer links out to bsky.app');
    assert.equal(await clip.locator('video').count(), 0, 'no <video> before the press');
    await clip.locator('button[data-play]').click();
    const v = clip.locator('video');
    assert.equal(await v.count(), 1, 'the press mounts the player');
    assert.match(await v.getAttribute('data-playlist'), /^https:\/\/video\.cdn\.test\/clip\/playlist\.m3u8$/, 'on the post’s playlist');
    assert.ok((await v.getAttribute('poster') || '').startsWith('data:image/svg'), 'with the thumbnail as its poster');
    assert.equal(new URL(page.url()).pathname, '/f/whats-hot', 'and Forage is still the page');
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

  // feed-row v2 claim 11: the mark is the reader's to switch off (Settings →
  // Provider mark); off, no row carries one and the byline is otherwise the same
  const m = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES,
    initScripts: ["try { localStorage.setItem('forage.providermark', 'off'); } catch {}"] });
  try {
    const { page } = m;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${m.origin}${BOARD_PATH}`);
    await page.waitForSelector('.postrow');
    const list = await rows(page);
    assert.ok(list.every((r) => r.mark === null), 'with the setting off, no row shows a provider mark');
    assert.ok(list.every((r) => r.sameLine), 'and the byline still holds one line');
    assert.deepEqual(m.errors(), []);
  } finally { await m.close(); }
}
