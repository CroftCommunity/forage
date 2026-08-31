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
      // Phase 4b: Save is Bluesky's bookmark procedure — an empty 200
      'app.bsky.bookmark.': {},
      // Phase 2 (plan 2026-08-29 post-and-thread): sign-in reads the profile once for the masthead picture
      'getProfile?actor=did%3Aplc%3Ame': { did: 'did:plc:me', handle: 'me.test', displayName: 'Me' },
      'getPreferences': { preferences: [{ $type: 'app.bsky.actor.defs#mutedWordsPref',
        items: [{ value: 'kryptonite', targets: ['content'], actorTarget: 'all' }] }] },
      'getFeedGenerator?': { view: { uri: 'at://did:plc:trends/app.bsky.feed.generator/meadow1',
        displayName: 'Meadow Fest', description: 'Post with #meadow to be considered.',
        likeCount: 7, creator: { handle: 'curator.test' } }, isOnline: true, isValid: true },
      'getTrendingTopics': { topics: [
        { topic: 'Meadow Fest', displayName: 'Meadow Fest', description: 'campers assemble',
          link: '/profile/did:plc:trends/feed/meadow1' } ] },
      'resolveHandle': { did: 'did:plc:trends' }, // 3v: a shared link resolves handle → did
      'getMutes': { mutes: [] },
      'getBlocks': { blocks: [] },
      'getListMutes': { lists: [] },
      'getListBlocks': { lists: [] },

      'getFollows?actor=did%3Aplc%3Ame': { follows: [{ did: 'did:plc:aa' }, { did: 'did:plc:bb' }] },
      'getFollowers': { followers: [{ did: 'did:plc:aa' }, { did: 'did:plc:bb' }] },
      'getAuthorFeed?actor=did%3Aplc%3Aaa': { feed: [post('a1', 'did:plc:aa', '2026-08-25T10:00:00Z')] },
      // the /u/<handle> author board (feed-row v1): the profile and its feed by HANDLE
      'getProfile?actor=aa.test': { did: 'did:plc:aa', handle: 'aa.test', displayName: 'aa', followersCount: 1, followsCount: 1, postsCount: 1 },
      'getAuthorFeed?actor=aa.test': { feed: [post('a1', 'did:plc:aa', '2026-08-25T10:00:00Z')] },
      'getAuthorFeed?actor=did%3Aplc%3Abb': { feed: [
        // replyCount 1 against likeCount 2 is deliberate: it puts a SINGULAR and
        // a PLURAL count on the same row, which is what makes the assertion
        // below able to fail in both directions.
        { post: { ...post('b1', 'did:plc:bb', '2026-08-25T11:00:00Z').post, replyCount: 1,
          record: { text: 'post b1 #camp', createdAt: '2026-08-25T11:00:00Z',
            facets: [{ index: { byteStart: 8, byteEnd: 13 },
              features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'camp' }] }] } } },
        { post: { ...post('b2', 'did:plc:bb', '2026-08-25T09:00:00Z').post,
          record: { text: 'my kryptonite take', createdAt: '2026-08-25T09:00:00Z' } } },
      ] },
      'com.atproto.repo.createRecord': { uri: 'at://did:plc:me/app.bsky.feed.like/3w3like', cid: 'lc' },
      'com.atproto.repo.deleteRecord': {},
      'uploadBlob': { blob: { $type: 'blob', ref: { $link: 'bafkreiJOURNEYBLOB' }, mimeType: 'image/png', size: 95 } },
      // 4e: the /h/ toolbar RE-QUERIES rather than re-sorting, so the shim
      // answers the windowed query differently. First match wins, so the
      // top-of-week key precedes the plain one.
      // The server's order is deliberately NOT likeCount-descending — that is
      // what Bluesky's `top` actually looks like (a probe returned 152, 113,
      // 1478, 122, 168 likes in that order). If the board re-sorted this
      // locally, `topB` would jump to the front and the journey would catch it.
      // 4g: this journey opens feed boards, so the card's adoption read needs a
      // fixture like any other. Constellation is fenced in the shim (hermetic).
      'constellation.microcosm.blue/links?target=': { total: 0, linking_records: [] },
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
        // an image-only post whose author wrote NO alt: its title is the
        // '[image]' placeholder, which no surface prints where it can show
        // the image instead — card renders the media, compact a title-thumb
        // (live on forage.fyi 2026-08-28)
        { post: { ...post('tp4', 'did:plc:cc', '2026-08-25T15:40:00Z').post,
          record: { text: '', createdAt: '2026-08-25T15:40:00Z' },
          embed: { $type: 'app.bsky.embed.images#view', images: [
            { thumb: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', fullsize: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', alt: '' } ] } } },
      ] },
      // the no-alt image post opened as a THREAD: the head renders the media
      // itself, so the '[image]' placeholder heading must not print there
      // either (first-match-wins: specific keys precede the generic ones)
      'getPostThread?uri=at%3A%2F%2Fdid%3Aplc%3Acc%2Fapp.bsky.feed.post%2Ftp4': { thread: {
        post: { ...post('tp4', 'did:plc:cc', '2026-08-25T15:40:00Z').post,
          record: { text: '', createdAt: '2026-08-25T15:40:00Z' },
          embed: { $type: 'app.bsky.embed.images#view', images: [
            { thumb: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', fullsize: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', alt: '' } ] } },
        replies: [],
      } },
      'getQuotes?uri=at%3A%2F%2Fdid%3Aplc%3Acc%2Fapp.bsky.feed.post%2Ftp4': { posts: [] },
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
      // phase 2: a post of MY OWN, so delete can be exercised (routing is
      // first-match-wins, so this specific key precedes the generic one)
      'getPostThread?uri=at%3A%2F%2Fdid%3Aplc%3Ame%2Fapp.bsky.feed.post%2Fmine': { thread: {
        post: { ...post('mine', 'did:plc:me', '2026-08-25T16:00:00Z').post,
          record: { text: 'a post of my own', createdAt: '2026-08-25T16:00:00Z' } },
        replies: [],
      } },
      'com.atproto.repo.deleteRecord': {},
      'getPostThread': { thread: {
        post: { ...post('b1', 'did:plc:bb', '2026-08-25T11:00:00Z').post, quoteCount: 1 },
        replies: [
          { post: { ...post('bpart2', 'did:plc:bb', '2026-08-25T11:05:00Z').post,
            record: { text: 'the continuation 2/2', createdAt: '2026-08-25T11:05:00Z' } }, replies: [] },
          // Phase 8: reply1 has a child, so a fold has something to hide
          { post: post('reply1', 'did:plc:aa', '2026-08-25T11:30:00Z').post, replies: [
            { post: { ...post('reply1a', 'did:plc:bb', '2026-08-25T11:35:00Z').post,
              record: { text: 'a reply to reply1', createdAt: '2026-08-25T11:35:00Z' } }, replies: [] },
          ] },
          { post: { ...post('myreply', 'did:plc:me', '2026-08-25T11:45:00Z').post,
            record: { text: 'a reply of my own', createdAt: '2026-08-25T11:45:00Z' } }, replies: [] },
        ],
      } },
      'getQuotes': { posts: [
        { ...post('quote1', 'did:plc:cc', '2026-08-25T12:00:00Z').post, replyCount: 1, quoteCount: 1 } ] },
    },
  });
  const { page } = s;

  // 3b segment: signed-in → pick My mutuals in the nav → the merged board renders.
  // V4: the dial became the left nav, so the gesture is a nav row rather than a
  // dial button. The property under test is the BOARD, not the control.
  await page.goto(`${s.origin}/`);
  // E144: the masthead shows a named account control instead of the handle
  // as text. Same signal — 'this session is signed in' — new surface.
  await page.waitForSelector('[data-account="1"][aria-label*="me.test"]');
  await page.waitForSelector('.nav [data-nav-item="mut"]');
  await page.locator('.nav [data-nav-item="mut"]').first().click();
  await page.waitForSelector('text=post b1');
  await page.waitForSelector('text=post a1');
  const text = await page.locator('main, body').first().innerText();
  assert.ok(text.indexOf('post b1') < text.indexOf('post a1'), 'newest first across members (11:00 before 10:00)');

  // 3x: the ring is computed ONCE. Dialing away and back must not re-walk the
  // follow graph — mutuals+1 is one getFollows per mutual, and paying that on
  // every visit is the difference between instant and several seconds.
  const graphCalls = () => page.evaluate(() => window.__shimHits
    .filter((h) => /getFollows|getFollowers/.test(h.url)).length);
  const afterFirstDial = await graphCalls();
  assert.ok(afterFirstDial > 0, 'the first dial did read the graph');
  await page.locator('.nav [data-nav-item="world"]').first().click();
  // wait for the World dial to have SETTLED rather than sleeping at it: a fixed
  // delay before an assertion that nothing happened can only be too short or
  // wasteful, and under load it is the former (croftc-e2's observation).
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 15000 });
  await page.locator('.nav [data-nav-item="mut"]').first().click();
  await page.waitForSelector('text=post b1');
  assert.equal(await graphCalls(), afterFirstDial,
    'dialing back re-used the remembered ring — no new graph reads');

  // Counts read as English. "1 comments" shipped and stayed because five call
  // sites each interpolated a number beside a hardcoded plural noun and no
  // assertion looked at a rendered one. js/util.js `plural` is the single home
  // now; this is the check that it is actually REACHED, which a unit test on
  // the helper cannot tell you. Asserted before the boost, because boosting
  // moves the like count.
  // feed-row v1: the words live in the replies control's accessible NAME (the
  // visible cell is the glyph and the number), so that is where the plural is
  // read — the row's visible text no longer carries it.
  const row = page.locator('.postrow', { hasText: 'post b1' });
  const rowText = (await row.innerText()).replace(/\s+/g, ' ');
  const repliesName = await row.locator('.actions a.replies').getAttribute('aria-label');
  assert.match(repliesName, /\b1 comment\b(?!s)/, `one reply is "1 comment": ${repliesName}`);
  // ZERO is the other direction, and the one a naive `n > 1` check gets wrong.
  // (Likes are not asserted here: on a ROW the count is the votebox number, not
  // a worded string — the worded form lives on the lens meta lines.)
  const zeroName = await page.locator('.postrow', { hasText: 'post a1' }).locator('.actions a.replies').getAttribute('aria-label');
  assert.match(zeroName, /\b0 comments\b/, `no replies is "0 comments", never "0 comment": ${zeroName}`);

  // 3c segment: boost the top post — a REAL like write, optimistically painted
  const scoreBefore = await row.locator('[data-vote] .n').innerText();
  await row.locator('button[data-vote]').click();
  await page.waitForFunction((prev) => {
    const r = [...document.querySelectorAll('.postrow')].find((x) => x.innerText.includes('post b1'));
    return r && r.querySelector('[data-vote] .n').innerText !== prev;
  }, scoreBefore);
  assert.ok(await row.locator('button[data-vote][aria-pressed="true"]').count(), 'boost paints on');
  const hits = await page.evaluate(() => window.__shimHits.filter((h) => h.url.includes('createRecord')));
  assert.equal(hits.length, 1, 'exactly one like create hit the wire');
  const body = JSON.parse(hits[0].body);
  assert.equal(body.collection, 'app.bsky.feed.like');
  assert.equal(body.repo, 'did:plc:me');
  assert.equal(body.record.subject.uri, 'at://did:plc:bb/app.bsky.feed.post/b1');
  assert.equal(body.record.subject.cid, 'cid-b1');

  // unboost: the exact rkey dies
  await row.locator('button[data-vote]').click();
  await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('deleteRecord')));
  const del = await page.evaluate(() => JSON.parse(window.__shimHits.find((h) => h.url.includes('deleteRecord')).body));
  assert.deepEqual(del, { repo: 'did:plc:me', collection: 'app.bsky.feed.like', rkey: '3w3like' });

  // 3f segment: the account-side muted word removes the post from the board.
  // OWNER, 2026-08-26: this used to assert a visible "[muted — matches your
  // muted words]" row. That defeated the mute twice over — the row still cost a
  // line of attention AND announced what was being withheld. A mute is
  // rendering guidance meaning "do not show me this"; absent is the only
  // rendering that honours it.
  assert.equal(await page.locator('text=kryptonite').count(), 0, 'the muted text never renders');
  const boardText = await page.locator('body').innerText();
  assert.ok(!/muted/i.test(boardText),
    'and the board says nothing about a mute — naming it is still a tell');
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
  // Phase 9 (plan 2026-08-29 post-and-thread, decision 5): a quote is a
  // COMMENT with a wall — the byline says what it is, the body reads at
  // comment scale, it carries the vote stack and a repost control, and the
  // "open its thread" link is gone (the ⋯ has Open on bsky.app; decision 10
  // gives it an address).
  // Phase 11c: the lens thread carries the sort bar; New puts the latest
  // top-level reply first (client-side — the thread is loaded whole)
  assert.equal(await page.locator('.card .sortbar select[data-sort]').count(), 1, 'the thread has a sort bar');
  await page.locator('.card .sortbar select[data-sort]').selectOption('new');
  await page.waitForFunction(() => document.querySelector('.card .sortbar select[data-sort]')?.value === 'new');
  const newOrder = await page.$$eval('.card > .comment', (els) => els.map((e) => e.getAttribute('data-node-id').split('/').pop()));
  assert.equal(newOrder[0], 'quote1', `New: the latest top-level node first: ${JSON.stringify(newOrder)}`);
  await page.locator('.card .sortbar select[data-sort]').selectOption('hot');
  const qByline = qnode.locator(':scope > .comment-body > .byline');
  assert.match((await qByline.innerText()).replace(/\s+/g, ' '), /quoted this/, 'the byline names the kind');
  assert.match(await qnode.locator(':scope > .comment-body > .comment-text').innerText(), /post quote1/, 'the quote body renders in the thread');
  assert.equal(await qnode.locator('a:has-text("open its thread")').count(), 0, 'no "open its thread" — the ⋯ carries Open on bsky.app');
  assert.equal(await qnode.locator(':scope > .comment-body > [data-vote]').count(), 1, 'the quote carries the vote stack');
  const repostBtn = qnode.locator(':scope > .comment-body > .comment-actions > [data-repost]');
  assert.equal(await repostBtn.count(), 1, 'and a repost control — the glyph alone, no word');
  assert.equal(await repostBtn.getAttribute('aria-pressed'), 'false');
  assert.match(await repostBtn.getAttribute('aria-label'), /^Repost$/, 'named for a screen reader');
  assert.equal(await qnode.locator(':scope > .avcol > .av').count(), 1, 'the avatar heads its column like any comment');

  // 3q: the quote is WALLED — a left rule — so it reads as a top-level thread
  // on the post instead of blending into the replies beneath it.
  //
  // Phase 8 (plan 2026-08-29 post-and-thread, decision 2): the collapse
  // GUTTER is retired. The grammar now: a comment WITH replies carries one ⊖
  // (button[data-fold]) on its action row and a rail (.avcol > .line) under
  // its avatar; a reply without children carries neither; a walled quote
  // carries neither. Each child draws its own elbow (a ::before). Folding
  // hides .kids and the button says how many it hid.
  const chrome = (n) => ({
    wall: parseFloat(getComputedStyle(n).borderLeftWidth),
    folds: n.querySelectorAll(':scope > .comment-body > .comment-actions > [data-fold]').length,
    rails: n.querySelectorAll(':scope > .avcol > .line').length,
    elbow: getComputedStyle(n, '::before').content !== 'none',
    gutters: n.querySelectorAll('.gutter').length,
    kids: n.querySelectorAll(':scope > .kids > *').length,
  });
  const qbox = await qnode.evaluate(chrome);
  assert.ok(qbox.wall >= 2, `the quote carries a left wall (got ${qbox.wall}px)`);
  // Phase 9 made the quote a comment, so decision 2 applies to it too: a fold
  // and a rail iff it has replies of its own, never a gutter
  assert.equal(qbox.folds, qbox.kids ? 1 : 0, `a quote folds iff it has children (${qbox.kids})`);
  assert.equal(qbox.rails, qbox.folds, 'and the rail comes with the fold');
  assert.equal(qbox.gutters, 0, 'the gutter is gone everywhere');
  const leaf = await page.locator('.comment[data-node-id$="/myreply"]').evaluate(chrome);
  assert.equal(leaf.wall, 0, 'a reply is NOT walled');
  assert.equal(leaf.folds, 0, 'a reply with no children has no fold');
  assert.equal(leaf.rails, 0, 'and no rail');
  assert.equal(leaf.elbow, false, 'a depth-0 reply has no elbow');
  const parent = page.locator('.comment[data-node-id$="/reply1"]');
  const parentChrome = await parent.evaluate(chrome);
  assert.equal(parentChrome.folds, 1, 'a reply with children has exactly one fold');
  assert.equal(parentChrome.rails, 1, 'and a rail under its avatar');
  const child = await page.locator('.comment[data-node-id$="/reply1a"]').evaluate(chrome);
  assert.equal(child.elbow, true, 'a nested reply draws its elbow off the rail');
  assert.equal(await parent.locator(':scope > .avcol > .line').evaluate((n) => getComputedStyle(n).pointerEvents), 'none',
    'the rail is a drawing, not a target');

  // …and the fold actually FOLDS. Behavioural coverage of the collapse has
  // existed since 2026-08-27; retiring the gutter must not leave less.
  const fold = parent.locator(':scope > .comment-body > .comment-actions > [data-fold]');
  const kidsShown = () => parent.locator(':scope > .kids').isVisible();
  assert.equal(await kidsShown(), true, 'a reply starts open — nothing folds on its own now');
  assert.equal(await fold.getAttribute('aria-expanded'), 'true');
  await fold.click();
  assert.equal(await kidsShown(), false, 'clicking ⊖ folds the replies');
  assert.equal(await fold.getAttribute('aria-expanded'), 'false');
  assert.match((await fold.innerText()).replace(/\s+/g, ' '), /1 reply hidden/, 'and says how much it hid');
  assert.equal(await page.locator('.comment[data-node-id$="/myreply"] > .comment-body > .comment-text').first().isVisible(), true,
    'folding one comment leaves its siblings alone');
  await fold.click();
  assert.equal(await kidsShown(), true, 'clicking it again unfolds — a one-way collapse is a trap');
  // and the body is styled at all — .cmeta/.cbody had no rules, so the node
  // used to render as default body text (2026-08-26)
  const qFont = await qnode.locator(':scope > .comment-body > .comment-text').evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
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

  // 3w: a thread takes replies. The reply threads onto the post it answers —
  // parent is what you clicked, root is the top of the thread — and both refs
  // carry a cid, which the lexicon requires and a broken ref would not.
  await page.waitForSelector('[data-reply-open]');
  await page.locator('[data-reply-open]').first().click(); // feed-row v4: a link to the /reply page
  await page.waitForSelector('[data-composer]');
  await page.locator('[data-composer] textarea').fill('mine came up early too');
  await page.locator('[data-composer] [data-send]').click();
  await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('createRecord')
    && JSON.parse(h.body).collection === 'app.bsky.feed.post'));
  const reply = await page.evaluate(() => JSON.parse(window.__shimHits
    .filter((h) => h.url.includes('createRecord')).at(-1).body));
  assert.equal(reply.record.text, 'mine came up early too');
  assert.ok(reply.record.reply.root.uri.endsWith('/b1'), 'the thread root is the post being read');
  assert.ok(reply.record.reply.root.cid, 'root carries a cid');
  assert.ok(reply.record.reply.parent.cid, 'so does parent');
  // the reply refetches the thread, so wait for it to come back before
  // anything else reads the DOM — a rerender mid-read detaches the nodes
  // under a running query (this flaked before the segment moved here).
  await page.waitForSelector('[data-kind="quote"][data-depth="0"]', { timeout: 15000 });

  // Phase 2: you can remove what you wrote — and only what you wrote. This
  // thread's head is did:plc:bb's, so the head carries no delete; the reply
  // that is mine does. (A reply to my OWN post cannot test this: 3i hoists a
  // same-author reply into the post body, so it never becomes a comment.)
  // This thread is still SETTLING when we get here: the 3w reply above triggers
  // a refetch, and the quote cascade repaints the comment list again when it
  // lands. waitForSelector is not enough — it can see the control and have it
  // swapped out before .count() runs, which is exactly how this failed in CI
  // (0 !== 1) after passing locally many times. So wait for the whole SHAPE we
  // are about to assert, and let the asserts be confirmations that cannot race.
  // Wait and read in ONE operation. This race has now been narrowed twice and
  // closed neither time: first the wait was made atomic but three .count()
  // round-trips followed it; then those became one evaluate, and the node
  // itself vanished between the wait resolving and the evaluate running
  // (-1 !== 1, the null sentinel). Any gap at all between observing and
  // asserting is the race, however small.
  //
  // So waitForFunction RETURNS the shape, and the assertions run on that
  // returned value. The snapshot asserted is by construction the snapshot that
  // satisfied the condition — there is no interval left for a repaint to fit
  // into. The thread genuinely keeps repainting (the reply refetches, the quote
  // cascade repaints again when it lands); a test cannot out-wait that, it can
  // only stop leaving a seam.
  const shapeHandle = await page.waitForFunction(() => {
    const mine = document.querySelector('.comment[data-node-id$="/myreply"]');
    const theirs = document.querySelector('.comment[data-node-id$="/reply1"]');
    if (!mine || !theirs) return null;
    const shape = {
      head: document.querySelectorAll('.card > [data-delete-post]').length,
      mine: mine.querySelectorAll('[data-delete-post]').length,
      theirs: theirs.querySelectorAll('[data-delete-post]').length,
    };
    // Return the shape only once it is the settled one; returning early would
    // reintroduce exactly the seam this closes.
    return (shape.head === 0 && shape.mine === 1 && shape.theirs === 0) ? shape : null;
  }, null, { timeout: 20000 }).catch((e) => {
    throw new Error(`delete controls never settled to (head 0, mine 1, theirs 0): ${e.message}`);
  });
  const deleteShape = await shapeHandle.jsonValue();

  assert.equal(deleteShape.head, 0, 'no delete control on a post that is not yours');
  assert.equal(deleteShape.mine, 1, 'your own reply can be deleted');
  assert.equal(deleteShape.theirs, 0, 'someone else\u2019s reply cannot');
  await page.locator('.comment[data-node-id$="/myreply"] [data-delete-post]').click();
  await page.locator('.comment[data-node-id$="/myreply"] [data-delete-post][data-armed="1"]').click();
  await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('deleteRecord')
    && JSON.parse(h.body).rkey === 'myreply'));
  await page.waitForSelector('text=You deleted this reply.');

  // Phase 4b (plan 2026-08-29 post-and-thread, decision 3): the ⋯ on someone
  // else's reply carries the whole decided list, in order, destructive last.
  const menuLabels = () => page.$$eval('[role="menu"] [role="menuitem"] > span:first-child', (els) => els.map((e) => e.textContent.trim()));
  const theirsKebab = page.locator('.comment[data-node-id$="/reply1"] > .comment-body > .byline button.kebab');
  await theirsKebab.click();
  await page.waitForTimeout(150);
  assert.deepEqual(await menuLabels(), ['Copy text', 'Copy link', 'Open on bsky.app', 'Save',
    'Mute thread', 'Mute words & tags', 'Hide for me', 'Mute account', 'Block account', 'Report']);
  // Save IS the bookmark procedure (4a-i) — the shim records the call
  await page.getByRole('menuitem', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('app.bsky.bookmark.createBookmark')
    && JSON.parse(h.body).uri.endsWith('/reply1')));
  // Hide is local, and it holds across a reload — the shape layer reads it
  await theirsKebab.click();
  await page.waitForTimeout(150);
  await page.getByRole('menuitem', { name: 'Hide for me', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.comment[data-node-id$="/reply1"]'));
  await page.reload();
  await page.waitForSelector('.comment');
  assert.equal(await page.locator('.comment[data-node-id$="/reply1"]').count(), 0, 'a hidden reply stays hidden after a reload');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('forage.hidden') || '[]').length), 1);

  await page.goto(`${s.origin}/p?uri=${encodeURIComponent('at://did:plc:me/app.bsky.feed.post/mine')}`);
  await page.waitForSelector('text=a post of my own');
  await page.waitForSelector('[data-delete-post]');

  // deleting is irreversible, so it takes two deliberate clicks rather than a
  // blocking confirm() dialog (which would freeze the whole app)
  await page.locator('[data-delete-post]').click();
  await page.waitForSelector('[data-delete-post][data-armed="1"]');
  assert.match(await page.locator('[data-delete-post]').innerText(), /really|sure|confirm/i,
    'the second click is clearly a different act from the first');
  await page.locator('[data-delete-post]').click();
  await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('deleteRecord')));
  const deletedBody = await page.evaluate(() => JSON.parse(window.__shimHits
    .filter((h) => h.url.includes('deleteRecord')).at(-1).body));
  assert.deepEqual(deletedBody, { repo: 'did:plc:me', collection: 'app.bsky.feed.post', rkey: 'mine' });
  // and the thread says the post is gone rather than silently navigating away
  await page.waitForSelector('text=This post was deleted');

  // …and the facet #tag in a board post is a doorway into /h/
  await page.goto(`${s.origin}/`);
  await page.locator('.nav [data-nav-item="mut"]').first().click();
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

  // 3w: and now the promise is KEPT — the compose button opens a real composer
  // and the post it writes carries the board's tag as a byte-indexed facet.
  const composeBtn = page.locator('[data-affordance="targetable"] [data-compose]');
  assert.equal(await composeBtn.isDisabled(), false, 'the compose button is live now, not a stub');
  await composeBtn.click();
  await page.waitForSelector('[data-composer]');
  await page.locator('[data-composer] textarea').fill('first tomato of the year');
  // 24 typed + 6 for the " #camp" the board adds = 30 of 300. The counter
  // counts what will be SENT, not what was typed — otherwise it lies by
  // exactly the length of the tag.
  assert.match(await page.locator('[data-composer] [data-remaining]').innerText(), /^270 left$/,
    'the counter includes the tag the board is about to add');
  await page.locator('[data-composer] button:has-text("Post")').click();
  await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('createRecord')
    && JSON.parse(h.body).collection === 'app.bsky.feed.post'));
  const wrote = await page.evaluate(() => JSON.parse(window.__shimHits
    .filter((h) => h.url.includes('createRecord')).at(-1).body));
  assert.equal(wrote.collection, 'app.bsky.feed.post');
  assert.equal(wrote.record.text, 'first tomato of the year #camp', 'the board tag joins the text');
  assert.equal(wrote.record.facets[0].features[0].tag, 'camp', 'and is faceted so the network indexes it');
  await page.waitForSelector('text=Posted', { timeout: 10000 });

  // Phase 3: an image post. Alt text is REQUIRED (the server refuses a missing
  // one outright), and the ORDER matters — upload first, then reference the
  // blob the upload returned. A createRecord naming a blob that was never
  // uploaded is exactly the failure this pins.
  await composeBtn.click();
  await page.waitForSelector('[data-composer]');
  await page.locator('[data-composer] textarea').fill('look at this');
  await page.locator('[data-composer] input[type="file"]').setInputFiles({
    name: 'tomato.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  });
  await page.waitForSelector('[data-composer] [data-image-alt]');
  assert.equal(await page.locator('[data-composer] button:has-text("Post")').isDisabled(), true,
    'an image with no alt text cannot be posted — the server would refuse it and blind readers deserve better');
  await page.locator('[data-composer] [data-image-alt]').fill('a small red tomato');
  assert.equal(await page.locator('[data-composer] button:has-text("Post")').isDisabled(), false);
  await page.locator('[data-composer] button:has-text("Post")').click();
  await page.waitForFunction(() => window.__shimHits.some((h) => h.url.includes('createRecord')
    && JSON.parse(h.body).record.embed));
  const order = await page.evaluate(() => window.__shimHits
    .map((h, i) => ({ i, kind: h.url.includes('uploadBlob') ? 'upload' : h.url.includes('createRecord') ? 'create' : null }))
    .filter((x) => x.kind));
  const lastUpload = order.filter((x) => x.kind === 'upload').at(-1);
  const lastCreate = order.filter((x) => x.kind === 'create').at(-1);
  assert.ok(lastUpload && lastUpload.i < lastCreate.i, 'the blob is uploaded BEFORE the record references it');
  const imgPost = await page.evaluate(() => JSON.parse(window.__shimHits
    .filter((h) => h.url.includes('createRecord')).at(-1).body));
  assert.equal(imgPost.record.embed.$type, 'app.bsky.embed.images');
  assert.equal(imgPost.record.embed.images[0].image.ref.$link, 'bafkreiJOURNEYBLOB',
    'the record references the blob the upload returned, not one we invented');
  assert.equal(imgPost.record.embed.images[0].alt, 'a small red tomato');
  const upHit = await page.evaluate(() => window.__shimHits.filter((h) => h.url.includes('uploadBlob')).at(-1));
  assert.equal(upHit.binary?.type, 'image/png', 'the raw bytes went up with the file’s own type');

  // over-limit text is refused BEFORE the network, and says why
  await composeBtn.click();
  await page.waitForSelector('[data-composer]');
  await page.locator('[data-composer] textarea').fill('x'.repeat(305));
  assert.equal(await page.locator('[data-composer] button:has-text("Post")').isDisabled(), true,
    'you cannot send a post the lexicon would reject');
  // 305 typed + 6 for " #camp" = 311, i.e. 11 over — and it SAYS over rather
  // than clamping, because clamping hides that words are being cut
  assert.match(await page.locator('[data-composer] [data-remaining]').innerText(), /^11 over$/,
    'the counter reports the overage, tag included');
  await page.locator('[data-composer] button:has-text("Cancel")').click();
  await page.waitForSelector('[data-composer]', { state: 'detached' });

  // 3g segment: the trending rail (world ring) opens a topic as a FEED board
  await page.goto(`${s.origin}/`);
  // The trending rail lives on the DIRECTORY, which has its own address now —
  // '/' is the landing and redirects a signed-in reader to their board.
  await page.locator('.nav [data-nav-item="directory"]').first().click();
  await page.waitForSelector('[data-trending] a:has-text("Meadow Fest")');
  await page.locator('[data-trending] a:has-text("Meadow Fest")').click();
  await page.waitForSelector('text=post tp1');

  // 3m: a FEED promises nothing — curator + verbatim description, no compose
  // 3p: and it is ONE box, which never restates the <h1> above it
  await page.waitForSelector('[data-affordance="curated"]');
  await page.waitForSelector('text=Curated by @curator.test');
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

  // board-cards decision 7: the card SIZE — four notches, 4 as drawn — replaced
  // the 3t drag slider (which on a phone moved in visible jumps). It rides on
  // the sort row as the same pill as its neighbours, in card AND compact (it
  // scales padding and title, not only the stage), and a change resizes the
  // board through one root attribute — no refetch, no repaint of the rows.
  await page.waitForSelector('[data-board-toolbar] select[data-size]');
  assert.equal(await page.locator('[data-board-toolbar] [data-media-scale]').count(), 0, 'the slider is gone');
  assert.ok(await page.locator('[data-board-toolbar] select[data-size]').evaluate((n) => n.classList.contains('pillsel')), 'the size dial is a pill like its neighbours');
  assert.deepEqual(await page.locator('[data-board-toolbar] select[data-size]').evaluate((n) => [...n.options].map((o) => o.value)), ['1', '2', '3', '4']);
  const stageH = () => page.locator('.stage').first().evaluate((n) => n.getBoundingClientRect().height);
  const beforeH = await stageH();
  await page.locator('[data-board-toolbar] select[data-size]').selectOption('1');
  await page.waitForFunction(() => document.documentElement.getAttribute('data-cardsize') === '1');
  const smallH = await stageH();
  assert.ok(smallH < beforeH, `size 1 lowers the stage (${beforeH}px → ${smallH}px)`);
  await page.locator('[data-board-toolbar] select[data-size]').selectOption('4');
  await page.waitForFunction(() => document.documentElement.getAttribute('data-cardsize') === '4');
  assert.ok(await stageH() > smallH, 'size 4 raises it again');
  // it is remembered on this device (a trending board is not restorable by URL
  // — its source registry is in-memory — so the preference itself is the check)
  assert.equal(await page.evaluate(() => localStorage.getItem('forage.cardsize')), '4');
  assert.equal(await page.evaluate(() => localStorage.getItem('forage.mediascale')), null, 'nothing writes the retired key');
  // and it stays in compact view: the size is about the card, not the media
  await page.locator('[data-board-toolbar] select[data-density]').selectOption('compact');
  await page.waitForSelector('.postrow.compact');
  assert.equal(await page.locator('[data-board-toolbar] select[data-size]').count(), 1, 'the size dial stays in compact');
  await page.locator('[data-board-toolbar] select[data-density]').selectOption('card');
  await page.waitForSelector('.stage');

  // board-cards Phase 7: the right rail is lensSidebar restyled — the same
  // curated sources a guest was always offered, now beside the column with the
  // sign-in card first and Trending last; and it is a setting (Side panel).
  // (signed in here, so the Feeds card lists the ACCOUNT's saved feeds, which
  // land async — the card and its browse link are the invariant; the guest's
  // curated list is guest-surface's to pin)
  assert.ok(await page.locator('#side .card a[href="/feeds"]').count() >= 1, 'the rail carries the Feeds card');
  const railOrder = await page.$$eval('#side .card', (cs) => cs.map((c) => c.querySelector('h2')?.textContent.trim() ?? c.getAttribute('data-trending') ?? '?'));
  assert.equal(railOrder.at(-1), 'Trending', `Trending is the last card on the rail: ${JSON.stringify(railOrder)}`);
  // (the Side panel switch itself is guest-surface's: a trending board is not
  // restorable by URL, so leaving it for /settings cannot come back)

  // 3u, revised 2026-08-30 (owner: "default to the browser language"): with
  // nothing chosen the filter follows the browser — this runner reads en-US —
  // so the Japanese post is hidden, and the board SAYS it hid one. A silent
  // filter is a lie. Choosing "every language" is a choice that sticks: the
  // post comes back, ANNOTATED, and a reload does not re-seed the browser.
  assert.equal(await page.evaluate(() => localStorage.getItem('forage.langs')), null, 'nothing chosen yet');
  await page.waitForSelector('text=宇宙の力に立ち向かう', { state: 'detached' });
  await page.waitForSelector('[data-lang-hidden]');
  assert.match(await page.locator('[data-lang-hidden]').innerText(), /1 post/,
    'the board says what the browser-default filter removed');
  await page.evaluate(() => localStorage.setItem('forage.langs', ''));
  await page.locator('[data-board-toolbar] select').first().selectOption('new');
  await page.waitForSelector('text=宇宙の力に立ち向かう');
  await page.waitForSelector('[data-lang-chip="ja"]');
  assert.equal(await page.locator('[data-lang-chip]').count(), 1, 'only the foreign post is annotated');
  assert.equal(await page.locator('[data-lang-hidden]').count(), 0, 'and nothing is hidden');
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

  // 3i segment: media renders in Card (on a STAGE since board-cards Phase 5);
  // image-only titles from alt; Compact drops it
  await page.waitForSelector('.stage img.stage-fore');
  await page.waitForSelector('text=a test image post');
  // The no-alt image post (tp4): its media renders, so the '[image]'
  // placeholder title must NOT print above it — the image is the content.
  assert.ok(await page.locator('.stage img.stage-fore').count() >= 2,
    'the no-alt image post still renders its image in card mode');
  assert.equal(await page.locator('.posttitle', { hasText: '[image]' }).count(), 0,
    'card mode never prints the literal [image] placeholder above a rendered image');
  await page.locator('[data-board-toolbar] select[data-density]').selectOption('compact');
  await page.waitForSelector('.postrow.compact');
  // feed-row v1 (2026-08-30): compact KEEPS the picture — density tightens the
  // row, it does not take the content out of it (the owner's phone ran the
  // phpBB skin, which prefers compact, and saw no pictures in the feed). The
  // placeholder still never prints, and the 40px title-thumb is gone with the
  // rule it served.
  assert.ok(await page.locator('.postrow.compact .stage img.stage-fore').count() >= 2,
    'compact rows still render the image posts on their stage');
  assert.equal(await page.locator('.posttitle', { hasText: '[image]' }).count(), 0,
    'compact never prints the literal [image] either — the picture is there');
  assert.equal(await page.locator('img.title-thumb').count(), 0,
    'no row swaps its picture for a thumbnail');
  await page.locator('[data-board-toolbar] select[data-density]').selectOption('card');
  await page.waitForSelector('.postrow:not(.compact) .stage img.stage-fore');

  // The same post opened as a THREAD: the head shows the image itself (until
  // now an image post's thread page rendered no image at all), and with the
  // media on the page the placeholder heading drops.
  await page.goto(`${s.origin}/p?uri=${encodeURIComponent('at://did:plc:cc/app.bsky.feed.post/tp4')}`);
  await page.waitForSelector('.stage img.stage-fore');
  assert.equal(await page.locator('h1', { hasText: '[image]' }).count(), 0,
    'the thread head never prints the literal [image] above the rendered image');

  // 3v: a SHARED feed link, opened COLD — a fresh navigation with no prior
  // in-app state, exactly like pasting the URL to someone else. The failure
  // found live on forage.fyi was that /f/<rkey> cannot resolve, because an
  // rkey has no did. The creator-qualified path can.
  await page.goto(`${s.origin}/f/@curator.test/meadow1`);
  await page.waitForSelector('[data-feed-header]', { timeout: 15000 });
  await page.waitForSelector('text=Curated by @curator.test');
  assert.equal(await page.locator('text=Unknown lens Feed').count(), 0,
    'a pasted feed link resolves for someone who has never opened the app');
  assert.deepEqual(await s.shimMisses(), [], 'every network read had a fixture');

  // feed-row v1: an author board's row links back to the author board, and
  // says whose it is — `f/pds.ls` linked /f/pds.ls, which nothing resolves
  // ("Unknown feed": the owner, forage.fyi, 2026-08-30).
  await page.goto(`${s.origin}/u/aa.test`);
  await page.waitForSelector('.postrow');
  const crumb = page.locator('.postrow .postmeta a').first();
  assert.equal(await crumb.getAttribute('href'), '/u/aa.test', 'an author board\'s breadcrumb opens the author board');
  assert.equal(await crumb.innerText(), '@aa.test', 'and names the author, not a feed');

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
