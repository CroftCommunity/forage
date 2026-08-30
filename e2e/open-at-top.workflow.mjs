// Opening a post from a board lands at the TOP of the thread.
//
// Owner, 2026-08-29: "when I open a post I'm trying to read it from the top
// down" — and the thread opened wherever the board had been scrolled to.
// render() had `window.scrollingReset && window.scrollTo(0, 0)`, and nothing
// ever defined scrollingReset, so no navigation reset the scroll. The rule
// is: a LINK navigation scrolls to the top; a store re-render (a session
// restoring, feeds landing) never moves the reader; and Back leaves the
// position to the browser's own restoration.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const WH = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const post = (r, d, t) => ({ post: {
  uri: `at://${d}/app.bsky.feed.post/${r}`, cid: 'c' + r,
  author: { did: d, handle: d.slice(8) + '.test' },
  record: { text: `hello ${r} — a few words so every row has some height to it`, createdAt: t }, indexedAt: t,
  replyCount: 1, repostCount: 0, likeCount: 7,
} });
const rows = Array.from({ length: 30 }, (_, i) => post(`p${i}`, 'did:plc:aa', `2026-08-26T${String(10 + (i % 12)).padStart(2, '0')}:${String(i).padStart(2, '0')}:00Z`));
const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getFeedGenerator?': { view: { uri: WH, displayName: 'Discover', description: 'trending',
    likeCount: 39382, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
  'getFeed?': { feed: rows },
  'getPostThread': { thread: { post: rows[29].post, replies: [
    { post: post('r1', 'did:plc:bb', '2026-08-26T23:00:00Z').post, replies: [] }] } },
  'getQuotes': { posts: [] },
};

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    await s.page.setViewportSize({ width: 900, height: 600 });
    await s.page.goto(`${s.origin}/f/whats-hot`);
    await s.page.waitForSelector('.postrow');
    const last = s.page.locator('.postrow', { hasText: 'hello p29 ' }).first();
    await last.scrollIntoViewIfNeeded();
    const before = await s.page.evaluate(() => window.scrollY);
    assert.ok(before > 300, `the board must actually be scrolled for this to prove anything (scrollY ${before})`);
    await last.locator('.posttitle a').first().click();
    await s.page.waitForSelector('.comment');
    const after = await s.page.evaluate(() => window.scrollY);
    assert.equal(after, 0, `a post opens at its top, not at the board's scroll offset (scrollY ${after})`);
  } finally { await s.close(); }
}
