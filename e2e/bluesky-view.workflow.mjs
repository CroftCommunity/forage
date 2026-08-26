// W3 — the Bluesky-view journey. GROWS a segment per phase-3 unit:
//   3b: signed-in ring dial → merged mutuals board
//   3c: boost = like (optimistic flip; the write's exact shape asserted)
//   3e: a thread where a reply AND a quote are one continuation
//   3f: the account's muted word masks in the board; a verified author ✓
//   3g: the trending rail opens a topic board; a facet #tag opens /h/
//   3d: the front-door arc — a first visit lands on the lens and writes
//       NOTHING to forage.state; the first memory-route visit seeds.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const FAKE_SIGNED_IN = `(() => {
  const mkSession = () => ({
    did: 'did:plc:me',
    signOut: async () => {},
    fetchHandler: (p, i) => window.fetch('https://bsky.social' + p, i),
  });
  let session = null; let state = 'unknown';
  const listeners = new Set();
  window.__forageFakeSessionManager = {
    state: () => state,
    currentSession: () => session,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async restore() { session = mkSession(); state = 'signed-in'; for (const f of listeners) f(state); return session; },
    async signIn() {}, async signOut() { session = null; state = 'signed-out'; },
    fetch(p, i) { return session.fetchHandler(p, i); },
  };
})();`;

const post = (rkey, did, ts) => ({ post: {
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did, handle: did.slice(8) + '.test', displayName: rkey,
    ...(did === 'did:plc:aa' ? { verification: { verifiedStatus: 'valid', trustedVerifierStatus: 'none' } } : {}) },
  record: { text: `post ${rkey}`, createdAt: ts }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: 2,
} });

const withLikes = (p, likeCount) => ({ ...p, likeCount });

export async function run() {
  const s = await scenario('first-visit', {
    initScripts: [FAKE_SIGNED_IN],
    responses: {
      'describeRepo': { handle: 'me.test' },
      'getPreferences': { preferences: [{ $type: 'app.bsky.actor.defs#mutedWordsPref',
        items: [{ value: 'kryptonite', targets: ['content'], actorTarget: 'all' }] }] },
      'getFeedGenerator?': { view: { uri: 'at://did:plc:trends/app.bsky.feed.generator/meadow1',
        displayName: 'Meadow Fest', description: 'Post with #meadow to be considered.',
        likeCount: 7, creator: { handle: 'curator.test' } }, isOnline: true, isValid: true },
      'getTrendingTopics': { topics: [
        { topic: 'Meadow Fest', displayName: 'Meadow Fest', description: 'campers assemble',
          link: '/profile/did:plc:trends/feed/meadow1' } ] },
      'getMutes': { mutes: [] },
      'getBlocks': { blocks: [] },
      'getListMutes': { lists: [] },
      'getListBlocks': { lists: [] },

      'getFollows?actor=did%3Aplc%3Ame': { follows: [{ did: 'did:plc:aa' }, { did: 'did:plc:bb' }] },
      'getFollowers': { followers: [{ did: 'did:plc:aa' }, { did: 'did:plc:bb' }] },
      'getAuthorFeed?actor=did%3Aplc%3Aaa': { feed: [post('a1', 'did:plc:aa', '2026-08-25T10:00:00Z')] },
      'getAuthorFeed?actor=did%3Aplc%3Abb': { feed: [
        { post: { ...post('b1', 'did:plc:bb', '2026-08-25T11:00:00Z').post,
          record: { text: 'post b1 #camp', createdAt: '2026-08-25T11:00:00Z',
            facets: [{ index: { byteStart: 8, byteEnd: 13 },
              features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'camp' }] }] } } },
        { post: { ...post('b2', 'did:plc:bb', '2026-08-25T09:00:00Z').post,
          record: { text: 'my kryptonite take', createdAt: '2026-08-25T09:00:00Z' } } },
      ] },
      'com.atproto.repo.createRecord': { uri: 'at://did:plc:me/app.bsky.feed.like/3w3like', cid: 'lc' },
      'com.atproto.repo.deleteRecord': {},
      // 4e: the /h/ toolbar RE-QUERIES rather than re-sorting, so the shim
      // answers the windowed query differently. First match wins, so the
      // top-of-week key precedes the plain one.
      // The server's order is deliberately NOT likeCount-descending — that is
      // what Bluesky's `top` actually looks like (a probe returned 152, 113,
      // 1478, 122, 168 likes in that order). If the board re-sorted this
      // locally, `topB` would jump to the front and the journey would catch it.
      'searchPosts?q=%23camp&tag=camp&limit=30&sort=top&since=': { posts: [
        withLikes(post('topA', 'did:plc:cc', '2026-08-20T13:00:00Z').post, 152),
        withLikes(post('topB', 'did:plc:cc', '2026-08-21T13:00:00Z').post, 1478),
        withLikes(post('topC', 'did:plc:cc', '2026-08-22T13:00:00Z').post, 113),
      ] },
      'searchPosts': { posts: [post('tagged1', 'did:plc:cc', '2026-08-25T13:00:00Z').post] },
      'getAuthorFeed?actor=did%3Aplc%3Atrends': { feed: [post('trendpost', 'did:plc:cc', '2026-08-25T14:00:00Z')] },
      'getFeed': { feed: [
        { post: { ...post('tp1', 'did:plc:cc', '2026-08-25T12:00:00Z').post, likeCount: 50 } },
        { post: { ...post('tp2', 'did:plc:cc', '2026-08-25T15:00:00Z').post, likeCount: 2 } },
        // 3u: a post that DECLARES a language other than the reader's
        { post: { ...post('tpja', 'did:plc:cc', '2026-08-25T15:10:00Z').post,
          record: { text: '宇宙の力に立ち向かう', createdAt: '2026-08-25T15:10:00Z', langs: ['ja'] } } },
        { post: { ...post('tp3', 'did:plc:cc', '2026-08-25T15:30:00Z').post,
          record: { text: '', createdAt: '2026-08-25T15:30:00Z' },
          embed: { $type: 'app.bsky.embed.images#view', images: [
            { thumb: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', fullsize: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', alt: 'a test image post' } ] } } },
      ] },
      // 3r: the cascade fixture. Routing is first-match-wins by substring, so
      // quote1's own thread/quotes must be declared BEFORE the generic keys.
      'getPostThread?uri=at%3A%2F%2Fdid%3Aplc%3Acc%2Fapp.bsky.feed.post%2Fquote1': { thread: {
        post: post('quote1', 'did:plc:cc', '2026-08-25T12:00:00Z').post,
        replies: [{ post: { ...post('q1reply', 'did:plc:aa', '2026-08-25T12:30:00Z').post,
          record: { text: 'replying to the quote', createdAt: '2026-08-25T12:30:00Z' } }, replies: [] }],
      } },
      'getQuotes?uri=at%3A%2F%2Fdid%3Aplc%3Acc%2Fapp.bsky.feed.post%2Fquote1': { posts: [
        { ...post('quote2', 'did:plc:bb', '2026-08-25T13:00:00Z').post,
          record: { text: 'quoting the quote', createdAt: '2026-08-25T13:00:00Z' } } ] },
      'getPostThread': { thread: {
        post: { ...post('b1', 'did:plc:bb', '2026-08-25T11:00:00Z').post, quoteCount: 1 },
        replies: [
          { post: { ...post('bpart2', 'did:plc:bb', '2026-08-25T11:05:00Z').post,
            record: { text: 'the continuation 2/2', createdAt: '2026-08-25T11:05:00Z' } }, replies: [] },
          { post: post('reply1', 'did:plc:aa', '2026-08-25T11:30:00Z').post, replies: [] },
        ],
      } },
      'getQuotes': { posts: [
        { ...post('quote1', 'did:plc:cc', '2026-08-25T12:00:00Z').post, replyCount: 1, quoteCount: 1 } ] },
    },
  });
  const { page } = s;

  // 3b segment: signed-in → dial to Mutuals → the merged board renders
  await page.goto(`${s.origin}/`);
  await page.waitForSelector('text=@me.test');
  await page.waitForSelector('[data-ring-dial]');
  await page.locator('[data-ring-dial] button:has-text("Mutuals")').first().click();
  await page.waitForSelector('text=post b1');
  await page.waitForSelector('text=post a1');
  const text = await page.locator('main, body').first().innerText();
  assert.ok(text.indexOf('post b1') < text.indexOf('post a1'), 'newest first across members (11:00 before 10:00)');

  // 3c segment: boost the top post — a REAL like write, optimistically painted
  const row = page.locator('.postrow', { hasText: 'post b1' });
  const scoreBefore = await row.locator('.score').innerText();
  await row.locator('button.boost').click();
  await page.waitForFunction((prev) => {
    const r = [...document.querySelectorAll('.postrow')].find((x) => x.innerText.includes('post b1'));
    return r && r.querySelector('.score').innerText !== prev;
  }, scoreBefore);
  assert.ok(await row.locator('button.boost.on').count(), 'boost paints on');
  const hits = await page.evaluate(() => window.__shimHits.filter((h) => h.url.includes('createRecord')));
  assert.equal(hits.length, 1, 'exactly one like create hit the wire');
  const body = JSON.parse(hits[0].body);
  assert.equal(body.collection, 'app.bsky.feed.like');
  assert.equal(body.repo, 'did:plc:me');
  assert.equal(body.record.subject.uri, 'at://did:plc:bb/app.bsky.feed.post/b1');
  assert.equal(body.record.subject.cid, 'cid-b1');

  // unboost: the exact rkey dies
  await row.locator('button.boost').click();
  await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('deleteRecord')));
  const del = await page.evaluate(() => JSON.parse(window.__shimHits.find((h) => h.url.includes('deleteRecord')).body));
  assert.deepEqual(del, { repo: 'did:plc:me', collection: 'app.bsky.feed.like', rkey: '3w3like' });

  // 3f segment: the account-side muted word masks IN THE BOARD; ✓ renders
  await page.waitForSelector('text=[muted — matches your muted words]');
  assert.equal(await page.locator('text=kryptonite').count(), 0, 'the muted text never renders');
  assert.ok(await page.locator('.postrow:has-text("post a1") span[title="Verified on Bluesky"]').count(),
    'the verified author carries the checkmark');

  // 3e segment: open b1's thread — reply and quote are ONE continuation;
  // 3i: the poster's own 2/2 reads as the BODY, not a comment
  await page.locator('.postrow', { hasText: 'post b1' }).locator('a[href*="/p?uri="]').first().click();
  await page.waitForSelector('text=the continuation 2/2');
  assert.equal(await page.locator('.comment', { hasText: 'the continuation 2/2' }).count(), 0,
    'the self-thread part is body, never a comment');
  await page.waitForSelector('text=post reply1');
  await page.waitForSelector('[data-kind="quote"]');
  const qnode = page.locator('[data-kind="quote"][data-depth="0"]');
  assert.match(await qnode.innerText(), /❝/, 'the quote marker distinguishes the kind');
  assert.match(await qnode.innerText(), /post quote1/, 'the quote body renders in the thread');
  assert.ok(await qnode.locator('a:has-text("open its thread")').count(), 'a quote opens as its own room');

  // 3q: the quote is WALLED — a left rule and its own tinted block — so it
  // reads as a top-level thread on the post instead of blending into the
  // replies beneath it. The replies keep the collapse gutter; never both.
  const qbox = await qnode.evaluate((n) => {
    const cs = getComputedStyle(n);
    // :scope > — a quote's own chrome. Its nested replies (3r) legitimately
    // carry gutters of their own; what must never happen is one node wearing
    // both grammars.
    return { wall: parseFloat(cs.borderLeftWidth), bg: cs.backgroundColor, gutters: n.querySelectorAll(':scope > .gutter').length };
  });
  assert.ok(qbox.wall >= 2, `the quote carries a left wall (got ${qbox.wall}px)`);
  assert.equal(qbox.gutters, 0, 'a walled quote has no collapse gutter — the two grammars stay distinct');
  const replyBox = await page.locator('.card > .comment:not([data-kind="quote"])').first()
    .evaluate((n) => ({ wall: parseFloat(getComputedStyle(n).borderLeftWidth), gutters: n.querySelectorAll(':scope > .gutter').length }));
  assert.equal(replyBox.wall, 0, 'a reply is NOT walled');
  assert.ok(replyBox.gutters >= 1, 'a reply keeps its collapse gutter');
  // and the body is styled at all — .cmeta/.cbody had no rules, so the node
  // used to render as default body text (2026-08-26)
  const qFont = await qnode.locator(':scope > .quote-body').evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
  const rootFont = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  assert.ok(qFont < rootFont, `the quote body reads at comment scale (${qFont}px < ${rootFont}px)`);

  // 3r: the CASCADE. A quote collects replies of its own and can itself be
  // quoted; it lands after the first paint, so the thread never waits for it.
  await page.waitForSelector('text=replying to the quote');
  await page.waitForSelector('text=quoting the quote');
  const cascade = await page.locator('[data-kind="quote"][data-depth="0"]').evaluate((n) => ({
    nestedQuotes: n.querySelectorAll('[data-kind="quote"]').length,
    nestedReplies: n.querySelectorAll('.comment:not([data-kind="quote"])').length,
  }));
  assert.equal(cascade.nestedQuotes, 1, 'the quote-of-the-quote nests INSIDE the quote it answers');
  assert.equal(cascade.nestedReplies, 1, 'and so does the reply to the quote');
  const nested = page.locator('[data-kind="quote"][data-depth="1"]');
  assert.ok(await nested.evaluate((n) => parseFloat(getComputedStyle(n).borderLeftWidth) >= 2),
    'a wall nests inside a wall — the grammar holds at every depth');

  // …and the facet #tag in a board post is a doorway into /h/
  await page.goto(`${s.origin}/`);
  await page.locator('[data-ring-dial] button:has-text("Mutuals")').first().click();
  await page.waitForSelector('a[data-tag="camp"]');
  await page.locator('a[data-tag="camp"]').first().click();
  await page.waitForSelector('h1:has-text("#camp")');
  await page.waitForSelector('text=post tagged1');

  // 4e: "Top · this week" on a hashtag board is a REAL query, not a re-sort of
  // what loaded — searchPosts takes sort and since server-side. The board
  // refetches and the loaded-window caveat is gone, because it would be a lie.
  await page.locator('[data-board-toolbar] select').first().selectOption('top');
  await page.locator('[data-board-toolbar] select').nth(1).selectOption('week');
  await page.waitForSelector('text=post topA');
  // the SERVER's order stands: re-sorting locally would put topB (1478 likes)
  // first, which is exactly the mutation this assertion exists to catch
  const bodies = await page.locator('[data-board="hashtag"]').innerText();
  assert.ok(bodies.indexOf('topA') < bodies.indexOf('topB'),
    'the board renders Bluesky\'s ranking, not a local likeCount sort');
  assert.ok(bodies.indexOf('topB') < bodies.indexOf('topC'), 'and it is the server order end to end');
  await page.waitForSelector('[data-whole-corpus]:has-text("ranked every #camp post")');
  assert.equal(await page.locator('text=Sorted within the loaded posts').count(), 0,
    'the /f/ caveat must not follow a server-ranked board');
  await page.waitForSelector('text=weighs engagement, not likes alone');

  await page.locator('[data-board-toolbar] select').first().selectOption('feed');
  await page.waitForSelector('text=post tagged1');

  // 3m: the affordance split — a hashtag PROMISES a deterministic way in
  await page.waitForSelector('[data-affordance="targetable"]');
  await page.waitForSelector('text=Anyone can post here.');
  await page.waitForSelector('text=Include #camp in your post');

  // 3g segment: the trending rail (world ring) opens a topic as a FEED board
  await page.goto(`${s.origin}/`);
  await page.locator('[data-ring-dial] button:has-text("World")').first().click();
  await page.waitForSelector('[data-trending] a:has-text("Meadow Fest")');
  await page.locator('[data-trending] a:has-text("Meadow Fest")').click();
  await page.waitForSelector('text=post tp1');

  // 3m: a FEED promises nothing — curator + verbatim description, no compose
  // 3p: and it is ONE box, which never restates the <h1> above it
  await page.waitForSelector('[data-affordance="curated"]');
  await page.waitForSelector('text=Curated by @curator.test.');
  await page.waitForSelector('[data-feed-blurb="feed"]:has-text("Post with #meadow to be considered.")');
  assert.equal(await page.locator('[data-affordance="curated"] [data-compose]').count(), 0,
    'no post-to button on a feed — it would be a lie (DL-025)');
  assert.equal(await page.locator('[data-feed-header]').count(), 1, 'one header box, not two');
  const feedTitle = await page.locator('h1').first().innerText();
  assert.equal(await page.locator('[data-feed-header]').innerText().then((t) => t.includes(feedTitle)), false,
    'the card never repeats the title the heading already carries');
  assert.match(await page.locator('[data-feed-header] button:not([data-feed-favorite])').innerText(), /Join|Leave/,
    'Join/Leave rides on the headline row');
  assert.equal(await page.locator('[data-feed-header] [data-feed-favorite]').count(), 1,
    '3s: and the favorite star rides beside it');

  // 3t: the image-size slider. It rides on the sort row, belongs to CARD view
  // only (compact shows no media, so a media control there is a lie), and a
  // drag resizes the board without refetching or repainting it.
  await page.waitForSelector('[data-board-toolbar] [data-media-scale]');
  const beforeH = await page.locator('.media-strip img').first()
    .evaluate((n) => parseFloat(getComputedStyle(n).maxHeight));
  await page.locator('[data-board-toolbar] [data-media-scale]').fill('440');
  await page.locator('[data-board-toolbar] [data-media-scale]').dispatchEvent('input');
  await page.waitForFunction(() => {
    const img = document.querySelector('.media-strip img');
    return img && parseFloat(getComputedStyle(img).maxHeight) > 400;
  });
  const afterH = await page.locator('.media-strip img').first()
    .evaluate((n) => parseFloat(getComputedStyle(n).maxHeight));
  assert.ok(afterH > beforeH, `the slider grows the preview (${beforeH}px → ${afterH}px)`);
  // it is remembered on this device (a trending board is not restorable by URL
  // — its source registry is in-memory — so the preference itself is the check)
  assert.equal(await page.evaluate(() => localStorage.getItem('forage.mediascale')), '440');
  // and compact view hides it, because compact has no media to size
  await page.locator('[data-board-toolbar] select').last().selectOption('compact');
  await page.waitForSelector('[data-board-toolbar] [data-media-scale]', { state: 'hidden' });
  await page.locator('[data-board-toolbar] select').last().selectOption('card');
  await page.waitForSelector('[data-board-toolbar] [data-media-scale]');

  // 3u: a post declaring a language you do not read is ANNOTATED, not hidden,
  // until you say otherwise. Then the filter hides it and SAYS it did — a
  // silent filter is a lie.
  await page.waitForSelector('text=宇宙の力に立ち向かう');
  await page.waitForSelector('[data-lang-chip="ja"]');
  assert.equal(await page.locator('[data-lang-chip]').count(), 1, 'only the foreign post is annotated');
  await page.evaluate(() => localStorage.setItem('forage.langs', 'en'));
  await page.locator('[data-board-toolbar] select').first().selectOption('new');
  await page.waitForSelector('text=宇宙の力に立ち向かう', { state: 'detached' });
  await page.waitForSelector('[data-lang-hidden]');
  assert.match(await page.locator('[data-lang-hidden]').innerText(), /1 post/,
    'the board says what the language filter removed');
  await page.evaluate(() => localStorage.removeItem('forage.langs'));
  await page.locator('[data-board-toolbar] select').first().selectOption('feed');
  await page.waitForSelector('text=宇宙の力に立ち向かう');

  // 3i segment: the board toolbar — window sorts, honestly scoped
  await page.waitForSelector('[data-board-toolbar]');
  let btext = await page.locator('.card', { hasText: 'post tp1' }).first().innerText();
  assert.ok(btext.indexOf('post tp1') < btext.indexOf('post tp2'), 'feed order = the generator order');
  await page.locator('[data-board-toolbar] select').first().selectOption('new');
  await page.waitForSelector('text=Sorted within the loaded posts');
  btext = await page.locator('.card', { hasText: 'post tp1' }).first().innerText();
  assert.ok(btext.indexOf('post tp2') < btext.indexOf('post tp1'), 'New re-sorts the window by time');
  await page.locator('[data-board-toolbar] select').first().selectOption('top');
  // All time, deliberately: these fixtures carry absolute dates and Top's
  // timeframe filter reads the wall clock — comparing scores under "Today"
  // would be flaky by construction.
  await page.locator('[data-board-toolbar] select').nth(1).selectOption('all');
  await page.waitForTimeout(100);
  btext = await page.locator('.card', { hasText: 'post tp1' }).first().innerText();
  assert.ok(btext.indexOf('post tp1') < btext.indexOf('post tp2'), 'Top re-sorts by score');
  await page.locator('[data-board-toolbar] select').first().selectOption('feed');

  // 3i segment: media renders in Card; image-only titles from alt; Compact drops it
  await page.waitForSelector('.media-strip img');
  await page.waitForSelector('text=a test image post');
  await page.locator('[data-board-toolbar] select').nth(2).selectOption('compact');
  await page.waitForFunction(() => !document.querySelector('.media-strip'));
  assert.ok(await page.locator('.postrow.compact').count() > 0, 'compact rows are compact');
  await page.locator('[data-board-toolbar] select').nth(2).selectOption('card');
  await page.waitForSelector('.media-strip img');

  assert.deepEqual(await s.shimMisses(), [], 'every network read had a fixture');
  await s.close();

  // 3d/3h segment: the front door, from a truly first visit — and the
  // populations are EXCLUSIVE: a memory route in the bluesky population gates
  const fd = await scenario('first-visit', {
    responses: { 'getTrendingTopics': { topics: [] } },
  });
  await fd.page.goto(fd.origin); // no hash at all — the true front door
  await fd.page.waitForFunction(() => location.pathname === '/', null, { timeout: 10000 });
  await fd.page.waitForSelector('text=The Lens');
  assert.equal(await fd.key(), null, 'the bluesky front door writes NOTHING to forage.state (the named check)');
  await fd.page.goto(`${fd.origin}/popular`);
  await fd.page.waitForSelector('text=That page lives in the Memory sandbox');
  assert.equal(await fd.key(), null, 'gated — and still nothing written');
  await fd.close();
}
