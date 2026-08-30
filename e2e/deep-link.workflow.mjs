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
}
