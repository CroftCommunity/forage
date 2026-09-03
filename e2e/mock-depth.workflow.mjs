// W-depth — the thread-depth mock's claims (plans/mocks/thread-depth.html;
// CroftC MOCKS.md P5: what a Proposed frame promises, a check holds, so
// approving the frame approves what the gate runs).
//
// Owner, 2026-09-02, with a screenshot of forage.fyi seven levels deep: "we
// have deep nested threads not collapsed by default … it can get a little hard
// to follow and read". Two mechanisms answer it and they answer different
// halves — Phase A buys back the WIDTH the indent was spending, Phase B bounds
// the SCROLL. Each claim below is one the mock's frames make.
//
// The population is e2e/harness/mock-deepthread.mjs, the same tree the frames
// were captured from: a quote carrying a twelve-deep chain in which every rung
// has exactly one reply, beside a two-child branch that is not a chain.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, FAKE_SIGNED_IN, THREAD_PATH, SPINE_URIS, BRANCH_URI } from './harness/mock-deepthread.mjs';

// The geometry of one comment: where its own box starts, where the box of the
// replies under it starts, and how wide its words are allowed to be.
const boxes = (page, id) => page.evaluate((nid) => {
  const c = document.querySelector(`.comment[data-node-id="${CSS.escape(nid)}"]`);
  if (!c) return null;
  const kid = c.querySelector(':scope > .kids > .comment');
  const text = c.querySelector(':scope > .comment-body > .comment-text');
  const r = (e) => (e ? { left: Math.round(e.getBoundingClientRect().left), width: Math.round(e.getBoundingClientRect().width) } : null);
  return { depth: Number(c.dataset.depth), chain: c.classList.contains('chain'), deep: c.classList.contains('deep'),
    folded: c.classList.contains('folded'), self: r(c), kid: r(kid), text: r(text),
    bar: r(c.querySelector(':scope > .kids > .deep-bar')) };
}, id);

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    const { page } = s;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${s.origin}${THREAD_PATH}`);
    await page.waitForSelector('.comment[data-kind="quote"]'); // the quote cascade landed

    // ---- Phase A: a chain of single replies stops indenting -----------------
    // The phone threshold is parent depth >= 2 (css/app.css). Depth 1 still
    // indents; depth 2 and below do not. Asserting BOTH sides, because a rule
    // that flattens everything would pass a one-sided check and lose the shape
    // of the first two levels, which is where a thread is actually read.
    const d1 = await boxes(page, SPINE_URIS[0]);
    assert.equal(d1.depth, 1, 'the quote is depth 0, so its reply is depth 1');
    assert.ok(d1.chain, 'every rung of this spine has exactly one reply');
    assert.ok(d1.kid.left > d1.self.left, `depth 1 still indents its reply (${d1.self.left} -> ${d1.kid.left})`);
    // Depths 2 to 4 — as far down as the tree ARRIVES open once Phase B has a
    // say. The rest of the spine is checked below, after the fold is opened:
    // a folded comment has a zero-sized box, and measuring one is how this
    // check first went red against a rule that was working.
    for (const [i, uri] of SPINE_URIS.slice(1, 4).entries()) {
      const b = await boxes(page, uri);
      assert.equal(b.kid.left, b.self.left, `depth ${i + 2}: a single reply gets no new indent`);
    }

    // A BRANCH is not a chain: two replies under one comment keep their indent,
    // because there the indent is saying something true.
    const branch = await boxes(page, BRANCH_URI);
    assert.equal(branch.chain, false, 'a comment with two replies is not a chain');
    assert.ok(branch.kid.left > branch.self.left, 'a branch still indents');

    // What the flattening buys, as a number: the words at the deepest rendered
    // rung. Measured on main at 390px, the same node's text column is 158px —
    // about twenty characters a line — and every level costs another 14px
    // (depth 1: 284px, depth 5: 228px, depth 10: 158px). The Current capture
    // shows what that buys at depth 9's 172px: a display name truncated to
    // "Thes…" and a two-digit like count broken across two lines.
    // ---- Phase B: the depth the thread arrives open to ----------------------
    // Nothing shallower than the budget is touched — an ordinary three- or
    // four-deep conversation never meets this rule.
    for (const uri of SPINE_URIS.slice(0, 4)) {
      const b = await boxes(page, uri);
      assert.equal(b.deep, false, `depth ${b.depth} is shallower than the budget and arrives open`);
    }
    const fold = await boxes(page, SPINE_URIS[4]);
    assert.equal(fold.depth, 5, 'the budget bites at depth 5');
    assert.ok(fold.deep && fold.folded, 'its replies arrive folded');
    assert.ok(fold.bar, 'behind one bar');
    const bar = page.locator(`.comment[data-node-id="${SPINE_URIS[4]}"] > .kids > .deep-bar`);
    assert.match(await bar.innerText(), /\b6 replies\b/, 'the bar says how many are under it, not how many are direct');
    assert.ok((await bar.boundingBox()).height >= 44, 'the bar meets the phone tap floor (MOBILE-FIRST)');
    assert.equal(await page.locator(`.comment[data-node-id="${SPINE_URIS[5]}"]`).isVisible(), false, 'the folded reply is rendered but not shown');

    // The bar opens the BRANCH, not one rung. Before this was true the first
    // capture showed a reader answering "show me the rest of this" getting one
    // reply and another button, once per level, all the way down.
    await bar.click();
    await page.waitForSelector(`.comment[data-node-id="${SPINE_URIS[9]}"]`, { state: 'visible' });
    assert.equal(await page.locator(`.comment[data-node-id="${SPINE_URIS[4]}"] .deep-bar`).count(), 0,
      'one press, and no bar is left under it');

    // Phase A holds all the way down, now that the boxes exist to measure.
    for (const [i, uri] of SPINE_URIS.slice(4, 9).entries()) {
      const b = await boxes(page, uri);
      assert.equal(b.kid.left, b.self.left, `depth ${i + 5}: still no new indent, opened`);
    }

    const deepest = await boxes(page, SPINE_URIS[9]);
    assert.equal(deepest.depth, 10, 'the tree renders ten levels; the eleventh is the continuation stub');
    assert.ok(deepest.text.width >= 270, `the deepest reply keeps its column (${deepest.text.width}px of 390; main measures 158px at this node)`);

    // ---- the cost Phase B could have had, and does not ----------------------
    // A folded subtree is rendered and hidden, never skipped, so a shared
    // permalink into it still lands. Skipping the render would have made
    // focusComment fall through to "That comment isn't in this thread".
    await page.goto(`${s.origin}${THREAD_PATH}&focus=${encodeURIComponent(SPINE_URIS[8])}`);
    const target = page.locator(`.comment[data-node-id="${SPINE_URIS[8]}"]`);
    await target.waitFor({ state: 'visible' });
    assert.ok(await target.evaluate((e) => e.classList.contains('focused')),
      'a permalink into a deep-folded subtree lands on its target, unfolding the path to it');
    // Not asserted here, on purpose: the FOCUS BAR's wording. It is built once,
    // before the quote cascade arrives, and the repaint's second focusComment
    // call has its return value discarded (js/ui/lens-views.js onCascade) — so
    // any permalink into a cascade node reads "That comment isn't in this
    // thread" over a comment it did find, unfold and highlight. Reproduced
    // identically on main at depth 3 (2026-09-03), so it is not this branch's
    // and not this branch's to fix quietly; it is filed in TODO.md.

    assert.deepEqual(await s.shimMisses(), []);
    assert.deepEqual(s.errors(), []);
  } finally { await s.close(); }
}
