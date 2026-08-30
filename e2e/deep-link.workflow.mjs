// W23 — every comment has an address (plan 2026-08-29-plan-post-and-thread,
// Phase 12, decision 10): the share glyph copies a permalink, and opening one
// renders the WHOLE thread, scrolls to the comment, tints it, expands its
// ancestors, folds its siblings, and says "viewing one comment" with a way
// back. Reddit's shape, not bsky.app's (a reply as head with parents above) —
// the forum framing wants "the thread" to mean one page.
//
// The seeded thread with depth is `comment-tree-collapse` (p_tree in f/grove):
// c_top → c_reply, c_bad, and a chain c_d0 … c_d10 (c_d11 deferred).
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const THREAD = '/f/grove/p/p_tree';
const node = (page, id) => page.locator(`.comment[data-node-id="${id}"]`);
const inViewport = (loc) => loc.evaluate((n) => {
  const r = n.getBoundingClientRect();
  return r.top >= 0 && r.top < window.innerHeight;
});

export async function run() {
  const mem = await scenario('seeded');
  try {
    const { page } = mem;
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: mem.origin });

    // ---- board-cards Phase 4 (decision 2): every POST has a share too ----
    // The owner looked for it on the live site and found it only in the ⋯.
    // Same glyph, same place as a comment's: last on the row's action row,
    // guest or not, copying the post's own address.
    await page.goto(`${mem.origin}/f/grove`);
    await page.waitForSelector('.postrow');
    const rowShare = page.locator('.postrow').first().locator('.actions > button.share');
    assert.equal(await rowShare.count(), 1, 'a post row has one share glyph on its action row');
    assert.equal(await rowShare.getAttribute('aria-label'), 'Copy link to this post');
    assert.ok(await rowShare.evaluate((b) => b === b.parentElement.lastElementChild), 'it is the LAST thing on the row\'s action row');
    assert.equal(await page.locator('.postrow').count(), await page.locator('.postrow .actions > button.share').count(), 'every row, not just the first');
    const rowHref = await page.locator('.postrow').first().locator('.posttitle a').getAttribute('href');
    await rowShare.click();
    await page.waitForSelector('text=Link copied');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${mem.origin}${rowHref}`, 'the post\'s own address');
    // the row's replies pill is a link into the thread, and says how many in words
    const replies = page.locator('.postrow').first().locator('.actions > a.replies');
    assert.equal(await replies.count(), 1, 'the replies pill is on the action row');
    assert.equal(await replies.getAttribute('href'), rowHref, 'and it opens the thread');
    // feed-row v1: the number is what shows; the words are its accessible name
    assert.match(await replies.locator('.n').innerText(), /^\d+$/, 'the cell shows the number');
    assert.match(await replies.getAttribute('aria-label'), /^\d+ comments? — open the thread$/, 'and its name counts in words');

    // ---- 12a: the share glyph, quiet and at the end of the action row ----
    await page.goto(`${mem.origin}${THREAD}`);
    await page.waitForSelector('.comment');
    const share = node(page, 'c_reply').locator(':scope > .comment-body > .comment-actions > button.share');
    assert.equal(await share.count(), 1, 'every comment has one share glyph');
    assert.equal(await share.getAttribute('aria-label'), 'Copy link to this comment');
    assert.ok(await share.evaluate((b) => b === b.parentElement.lastElementChild), 'it is the LAST thing on the action row');
    const quiet = await share.evaluate((b) => parseFloat(getComputedStyle(b).opacity));
    assert.ok(quiet < 1, `at rest it is quiet (opacity ${quiet})`);
    await share.click();
    await page.waitForSelector('text=Link copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(copied, `${mem.origin}${THREAD}?focus=c_reply`, 'the permalink names the thread and the comment');
    // …and the ⋯ menu's Copy link writes the same address
    await node(page, 'c_reply').locator(':scope > .comment-body > .byline button.kebab').click();
    await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${mem.origin}${THREAD}?focus=c_reply`);

    // ---- 12b: opening a permalink lands on the comment, in context ----
    await page.goto(`${mem.origin}${THREAD}?focus=c_d5`);
    await page.waitForSelector('.comment.focused');
    const target = node(page, 'c_d5');
    assert.ok(await target.evaluate((n) => n.classList.contains('focused')), 'the addressed comment is marked');
    assert.equal(await page.locator('.comment.focused').count(), 1, 'and only it');
    assert.ok(await inViewport(target), 'it is scrolled into view');
    // below the sticky masthead, not under it
    const clear = await page.evaluate(() => {
      const m = document.querySelector('.masthead').getBoundingClientRect();
      const t = document.querySelector('.comment.focused').getBoundingClientRect();
      return t.top >= m.bottom;
    });
    assert.ok(clear, 'the focused comment lands below the masthead');
    for (const anc of ['c_d0', 'c_d4']) {
      assert.equal(await node(page, anc).evaluate((n) => n.classList.contains('collapsed')), false, `ancestor ${anc} is expanded`);
    }
    // siblings of the path fold to ⊕ so the addressed branch is what you see
    for (const sib of ['c_top', 'c_bad']) {
      assert.equal(await node(page, sib).evaluate((n) => n.classList.contains('collapsed')), true, `sibling ${sib} is folded`);
    }
    const bar = page.locator('.focus-bar');
    assert.equal(await bar.count(), 1, 'the "viewing one comment" bar is shown');
    assert.match(await bar.innerText(), /viewing one comment/i);
    await bar.locator('a').click();
    await page.waitForFunction(() => !location.search.includes('focus='));
    await page.waitForSelector('.comment');
    assert.equal(await page.locator('.focus-bar').count(), 0, 'the bar is gone on the whole thread');
    assert.equal(await page.locator('.comment.focused').count(), 0);
    assert.equal(await node(page, 'c_top').evaluate((n) => n.classList.contains('collapsed')), false, 'siblings are open again');
    assert.match(page.url(), /sort=/, 'the bar\'s link kept the sort');

    // depth 0: nothing to expand, the bar still shows
    await page.goto(`${mem.origin}${THREAD}?focus=c_bad`);
    await page.waitForSelector('.comment.focused');
    assert.equal(await page.locator('.focus-bar').count(), 1);
    assert.equal(await node(page, 'c_top').evaluate((n) => n.classList.contains('collapsed')), true, 'its siblings fold');

    // an id that is not in this thread: no scroll, the bar says so, the rest renders
    await page.goto(`${mem.origin}${THREAD}?focus=c_nope`);
    await page.waitForSelector('.comment');
    assert.equal(await page.locator('.comment.focused').count(), 0);
    assert.match(await page.locator('.focus-bar').innerText(), /isn.t in this thread/i);
    assert.ok(await page.locator('.comment').count() > 3, 'the thread still renders');
    assert.ok((await mem.consoleErrors()).length === 0, 'a missing id is a warn, never an error');

    // reduced motion: no fade animation on the tint
    const anim = await page.evaluate(async () => {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      return { supported: typeof mql.matches === 'boolean' };
    });
    assert.ok(anim.supported);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${mem.origin}${THREAD}?focus=c_d2`);
    await page.waitForSelector('.comment.focused');
    const animName = await page.locator('.comment.focused').evaluate((n) => getComputedStyle(n).animationName);
    assert.equal(animName, 'none', 'reduced motion: the tint does not animate');
    assert.deepEqual(mem.errors(), []);
  } finally { await mem.close(); }

  // ---- Phase 13: the lens — a reply uri resolves to its thread, focused ----
  const ROOT = 'at://did:plc:aa/app.bsky.feed.post/root';
  const REPLY = 'at://did:plc:bb/app.bsky.feed.post/reply';
  const mk = (id, did, t, extra = {}) => ({ uri: `at://${did}/app.bsky.feed.post/${id}`, cid: 'c' + id,
    author: { did, handle: did.slice(8) + '.test' }, record: { text: 'post ' + id, createdAt: t, ...extra }, indexedAt: t,
    likeCount: 0, replyCount: 0, repostCount: 0 });
  const ref = (uri) => ({ uri, cid: 'c' + uri.split('/').pop() });
  const rootThread = { thread: { post: mk('root', 'did:plc:aa', '2026-08-26T10:00:00Z'), replies: [
    { post: mk('other', 'did:plc:cc', '2026-08-26T10:30:00Z', { reply: { root: ref(ROOT), parent: ref(ROOT) } }), replies: [] },
    { post: mk('reply', 'did:plc:bb', '2026-08-26T11:00:00Z', { reply: { root: ref(ROOT), parent: ref(ROOT) } }), replies: [] },
  ] } };
  const lens = await scenario('first-visit', { mode: 'bluesky', responses: {
    'getTrendingTopics': { topics: [] },
    'getFeed': { feed: [{ post: mk('root', 'did:plc:aa', '2026-08-26T10:00:00Z') }] },
    [`getPostThread?uri=${encodeURIComponent(REPLY)}`]: { thread: { post: rootThread.thread.replies[1].post, replies: [] } },
    [`getPostThread?uri=${encodeURIComponent(ROOT)}`]: rootThread,
    'getQuotes': { posts: [] },
  } });
  try {
    const { page } = lens;
    // a pasted reply uri lands on the ROOT's thread with the reply focused
    await page.goto(`${lens.origin}/p?uri=${encodeURIComponent(REPLY)}`);
    await page.waitForSelector('.comment.focused');
    assert.match(await page.locator('h1').innerText(), /post root/, 'the head is the root, not the reply');
    assert.equal(await page.locator('.comment.focused').getAttribute('data-node-id'), REPLY);
    assert.equal(await page.locator('.focus-bar').count(), 1);
    // the view renders more than once at boot (session restore re-dispatches),
    // so count by SHAPE: every reply fetch was followed by exactly one root fetch
    const fetches = (u) => page.evaluate((needle) => window.__shimHits.filter((h) => h.url.includes('getPostThread') && h.url.includes(needle)).length, encodeURIComponent(u));
    assert.ok(await fetches(REPLY) >= 1);
    assert.equal(await fetches(ROOT), await fetches(REPLY), 'the reply, then its root — one root fetch per reply fetch');
    // the way back is the root's own address
    assert.equal(await page.locator('.focus-bar a').getAttribute('href'), `/p?uri=${encodeURIComponent(ROOT)}`);
    // share on a lens comment writes /p?uri=<root>&focus=<reply>
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: lens.origin });
    await page.locator(`.comment[data-node-id="${REPLY}"] button.share`).click();
    await page.waitForSelector('text=Link copied');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()),
      `${lens.origin}/p?uri=${encodeURIComponent(ROOT)}&focus=${encodeURIComponent(REPLY)}`);
    // board-cards Phase 4: a lens ROW's share writes the post's /p?uri= address,
    // and its repost count sits on the row as a fact (never a write on a row)
    await page.goto(`${lens.origin}/f/whats-hot`);
    await page.waitForSelector('.postrow');
    await page.locator('.postrow .actions > button.share').first().click();
    await page.waitForSelector('text=Link copied');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${lens.origin}/p?uri=${encodeURIComponent(ROOT)}`);
    assert.equal(await page.locator('.postrow .actions [data-repost][data-readonly]').count(), 1, 'the repost count is a read-only fact on the row');
    assert.equal(await page.locator('.postrow .actions button[data-repost]').count(), 0, 'and never a button on a row');
    // an explicit &focus= on the root uri does the same thing with ONE fetch
    await page.goto(`${lens.origin}/p?uri=${encodeURIComponent(ROOT)}&focus=${encodeURIComponent(REPLY)}`);
    await page.waitForSelector('.comment.focused');
    assert.equal(await page.locator('.comment.focused').getAttribute('data-node-id'), REPLY);
    assert.equal(await fetches(REPLY), 0, 'a root uri with &focus= never fetches the reply');
    assert.ok(await fetches(ROOT) >= 1);
    assert.deepEqual(await lens.shimMisses(), []);
    assert.deepEqual(lens.errors(), []);
  } finally { await lens.close(); }
}
