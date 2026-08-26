// W6 — mobile fit (croft-pwa PRACTICES lesson, adopted): NO horizontal
// overflow at 320/360/390 on the surfaces that matter, in BOTH populations.
// Long unbroken tokens and deep comment nesting are the classic culprits —
// the fixtures are built to provoke exactly those.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const WIDTHS = [320, 360, 390];
const LONG_WORD = 'Supercalifragilisticexpialidocious'.repeat(4);
const LONG_URL = 'https://example.com/an/extremely/long/path/segment/that/never/breaks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const post = (rkey, did, ts, text, extra = {}) => ({ post: {
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did, handle: 'averyveryverylonghandle.some-subdomain.bsky.social' },
  record: { text, createdAt: ts }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: 3, ...extra,
} });

async function assertNoOverflow(page, label) {
  const { scrollW, innerW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
  }));
  assert.ok(scrollW <= innerW + 1, `${label}: horizontal overflow (${scrollW} > ${innerW})`);
}

export async function run() {
  // ---- the bluesky population, guest surfaces ----
  // NB: replies must come from a DIFFERENT author than the root — same-author
  // chains hoist into the post body (3i self-threads), leaving no comments.
  const deepReplies = (depth) => depth === 0 ? [] : [{
    post: post(`r${depth}`, `did:plc:r${depth}`, '2026-08-26T10:00:00Z', `deep reply ${LONG_WORD}`).post,
    replies: deepReplies(depth - 1),
  }];
  const b = await scenario('first-visit', {
    responses: {
      'getTrendingTopics': { topics: [{ topic: LONG_WORD, displayName: LONG_WORD, description: LONG_URL, link: '/profile/did:plc:t/feed/x1' }] },
      'getFeed': { feed: [
        post('long1', 'did:plc:aa', '2026-08-26T10:00:00Z', `${LONG_WORD} ${LONG_URL}`),
        post('long2', 'did:plc:aa', '2026-08-26T09:00:00Z', LONG_URL),
      ] },
      'getAuthorFeed': { feed: [post('long1', 'did:plc:aa', '2026-08-26T10:00:00Z', `${LONG_WORD} ${LONG_URL}`)] },
      'getPostThread': { thread: {
        post: post('long1', 'did:plc:aa', '2026-08-26T10:00:00Z', `${LONG_WORD} ${LONG_URL}`).post,
        replies: deepReplies(8),
      } },
      'getQuotes': { posts: [] },
    },
  });
  for (const width of WIDTHS) {
    await b.page.setViewportSize({ width, height: 800 });
    await b.page.goto(`${b.origin}/#/`);
    await b.page.waitForSelector('text=The Lens');
    await assertNoOverflow(b.page, `bluesky home @${width}`);

    await b.page.goto(`${b.origin}/#/f/whats-hot`);
    await b.page.waitForSelector('.postrow');
    await assertNoOverflow(b.page, `feed board (long tokens) @${width}`);

    await b.page.goto(`${b.origin}/#/p?uri=${encodeURIComponent('at://did:plc:aa/app.bsky.feed.post/long1')}`);
    await b.page.waitForSelector('.comment');
    await assertNoOverflow(b.page, `deep thread @${width}`);

    await b.page.goto(`${b.origin}/#/mode`);
    await b.page.waitForSelector('[data-mode-card="memory"]');
    await assertNoOverflow(b.page, `/mode @${width}`);

    await b.page.goto(`${b.origin}/#/settings`);
    await b.page.waitForSelector('text=Theme');
    await assertNoOverflow(b.page, `/settings @${width}`);
  }
  await b.close();

  // ---- the memory population, seeded ----
  const m = await scenario('seeded', {});
  for (const width of WIDTHS) {
    await m.page.setViewportSize({ width, height: 800 });
    await m.page.goto(`${m.origin}/#/popular`);
    await m.page.waitForSelector('.postrow');
    await assertNoOverflow(m.page, `memory popular @${width}`);

    // pick a seeded thread that actually HAS comments (deep nesting is the
    // overflow risk we care about here)
    const threadLink = await m.page.evaluate(() => {
      for (const row of document.querySelectorAll('.postrow')) {
        const link = [...row.querySelectorAll('a')].find((a) => /\d+ comments/.test(a.textContent) && !/^0 /.test(a.textContent));
        if (link) return link.getAttribute('href');
      }
      return null;
    });
    assert.ok(threadLink, 'the seed has a thread with comments');
    await m.page.goto(`${m.origin}/${threadLink}`);
    await m.page.waitForSelector('.comment');
    await assertNoOverflow(m.page, `memory thread @${width}`);
  }
  await m.close();
}
