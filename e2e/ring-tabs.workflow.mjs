// W — plan 2026-08-28-1: the ring board's kind tabs. The owner's screenshot of
// /r/me showed replies and reposts rendered as indistinguishable plain posts;
// the board now separates Posts · Replies · Reposts in a tab row, a reply
// carries a link to the comment it answers ABOVE its title, and a repost says
// who repeated it (its byline is the original author's).
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

const PARENT_URI = 'at://did:plc:aa/app.bsky.feed.post/parent1';

const post = (rkey, did, ts, text) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did, handle: did.slice(8) + '.test' },
  record: { text, createdAt: ts }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: 0,
});

const PARENT_VIEW = {
  $type: 'app.bsky.feed.defs#postView',
  ...post('parent1', 'did:plc:aa', '2026-08-28T08:00:00Z', 'nice photo of the ridge'),
};

const RESPONSES = {
  describeRepo: { handle: 'me.test' },
  getPreferences: { preferences: [] },
  getMutes: { mutes: [] },
  getBlocks: { blocks: [] },
  getListMutes: { lists: [] },
  getListBlocks: { lists: [] },
  getFollows: { follows: [] },
  getFollowers: { followers: [] },
  getTrendingTopics: { topics: [] },
  getFeedGenerators: { feeds: [] },
  // /r/me: one of each kind — the envelope, exactly as getAuthorFeed sends it
  getAuthorFeed: { feed: [
    { post: post('p1', 'did:plc:me', '2026-08-28T10:00:00Z', 'a plain post') },
    { post: post('r1', 'did:plc:me', '2026-08-28T09:00:00Z', 'my trail answer'),
      reply: { root: PARENT_VIEW, parent: PARENT_VIEW } },
    { post: post('orig1', 'did:plc:aa', '2026-08-01T00:00:00Z', 'the reposted original'),
      reason: { $type: 'app.bsky.feed.defs#reasonRepost',
        by: { did: 'did:plc:me', handle: 'me.test' }, indexedAt: '2026-08-28T11:00:00Z' } },
  ] },
};

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    const { page } = s;
    await page.goto(`${s.origin}/r/me`);
    await page.waitForSelector('[data-ring-tabs]');

    // Three tabs, in the asked-for order, Posts active by default.
    assert.deepEqual(await page.$$eval('[data-ring-tabs] .tab', (bs) => bs.map((b) => b.textContent)),
      ['Posts', 'Replies', 'Reposts']);
    assert.equal(await page.locator('[data-ring-tab="posts"].active[aria-pressed="true"]').count(), 1,
      'Posts is the resting tab');

    // Posts: the plain post alone — no reply, no repost mixed in.
    await page.waitForSelector('text=a plain post');
    assert.equal(await page.locator('.postrow:has-text("my trail answer")').count(), 0,
      'a reply never renders on the Posts tab');
    assert.equal(await page.locator('.postrow:has-text("the reposted original")').count(), 0,
      'a repost never renders on the Posts tab');

    // Replies: the answer, with the comment it answers linked ABOVE it.
    await page.locator('[data-ring-tab="replies"]').click();
    await page.waitForSelector('text=my trail answer');
    assert.equal(await page.locator('.postrow:has-text("a plain post")').count(), 0,
      'and the plain post leaves when the tab narrows to replies');
    const row = page.locator('.postrow', { hasText: 'my trail answer' });
    const ctx = row.locator('[data-reply-context]');
    assert.equal(await ctx.count(), 1, 'the reply carries its parent context');
    const ctxText = await ctx.innerText();
    assert.match(ctxText, /replying to @aa\.test/, `names who is being answered: ${JSON.stringify(ctxText)}`);
    assert.match(ctxText, /nice photo of the ridge/, 'and quotes the comment being replied to');
    const href = await ctx.locator('a').getAttribute('href');
    assert.ok(href.includes(encodeURIComponent(PARENT_URI)),
      `the context LINKS to the parent's thread: ${JSON.stringify(href)}`);
    const rowText = (await row.innerText()).replace(/\s+/g, ' ');
    assert.ok(rowText.indexOf('replying to') < rowText.indexOf('my trail answer'),
      `the parent link sits ABOVE the reply, not after it: ${JSON.stringify(rowText)}`);

    // Reposts: the original author keeps the byline; the byline's truth — that
    // this member merely repeated it — is said above the title.
    await page.locator('[data-ring-tab="reposts"]').click();
    await page.waitForSelector('text=the reposted original');
    const rrow = page.locator('.postrow', { hasText: 'the reposted original' });
    const rtext = (await rrow.innerText()).replace(/\s+/g, ' ');
    assert.match(rtext, /reposted by @me\.test/, `the repost names its reposter: ${JSON.stringify(rtext)}`);
    // The header is the byline now (plan 2026-08-29 post-and-thread, Phase 1):
    // avatar · who · time, no "by" — so the author is read from .who, not prose.
    assert.equal((await rrow.locator('.byline .who').innerText()).trim(), 'aa.test', 'the byline stays the original author');
    assert.equal(await page.locator('.postrow:has-text("a plain post")').count(), 0);

    // And back: the tabs are a filter, not a one-way door.
    await page.locator('[data-ring-tab="posts"]').click();
    await page.waitForSelector('text=a plain post');
    assert.equal(await page.locator('.postrow:has-text("the reposted original")').count(), 0);
  } finally { await s.close(); }
}
