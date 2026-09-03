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

// Phase C: the shape of the tree under a given pair of settings. Returns the
// depths that flatten and the depths that fold, read off the rendered DOM —
// never off the module that wrote them, or the check would be the setting
// agreeing with itself.
const shapeUnder = async (flatten, fold) => {
  const seed = `try{localStorage.setItem('forage.threadflatten','${flatten}');localStorage.setItem('forage.threadfold','${fold}');}catch{}`;
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, seed], responses: RESPONSES });
  try {
    await s.page.setViewportSize({ width: 390, height: 900 });
    await s.page.goto(`${s.origin}${THREAD_PATH}`);
    await s.page.waitForSelector('.comment[data-kind="quote"]');
    const out = await s.page.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-flatten'),
      // a folded subtree has a zero-sized box, so only VISIBLE levels are read
      flattens: [...document.querySelectorAll('.comment')].filter((c) => {
        const k = c.querySelector(':scope > .kids > .comment');
        return k && k.getBoundingClientRect().width > 0
          && Math.round(k.getBoundingClientRect().left) === Math.round(c.getBoundingClientRect().left);
      }).map((c) => Number(c.dataset.depth)).sort((a, b) => a - b),
      folds: [...document.querySelectorAll('.comment.deep')].map((c) => Number(c.dataset.depth)).sort((a, b) => a - b),
    }));
    s.errors(); s.consoleErrors();
    return out;
  } finally { await s.close(); }
};

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

  // ---- Phase C: both numbers are the reader's ------------------------------
  // Owner, 2026-09-03: "the settings should be adjustable for the user in
  // advanced on their profile". Read off the DOM at 390px, so each claim is
  // about what the reader SEES and not about what the preference module says.
  const auto = await shapeUnder('auto', '5');
  assert.equal(auto.attr, 'auto', 'the default is written onto the root explicitly, never left unset');
  assert.equal(auto.flattens[0], 2, 'auto on a phone: the first two levels keep their indent');
  assert.equal(auto.folds[0], 5, 'and the fold arrives at 5');

  // The whole feature off is main's thread again. This is the claim that makes
  // the setting a real one: a reader who dislikes both mechanisms can have the
  // tree they had, not a milder version of ours.
  const off = await shapeUnder('off', 'off');
  assert.deepEqual(off.flattens, [], 'flatten off: every reply keeps its indent, at every depth');
  assert.deepEqual(off.folds, [], 'fold never: nothing arrives folded, at any depth');

  const early = await shapeUnder('1', '3');
  assert.equal(early.flattens[0], 1, 'after level 1: the flattening starts one level in');
  assert.equal(early.folds[0], 3, 'and the fold at 3');
  const late = await shapeUnder('6', '8');
  assert.equal(late.flattens[0], 6, 'after level 6: five levels of indent survive');
  assert.equal(late.folds[0], 8, 'and the fold at 8');

  // The dials exist where the owner asked for them, carry the stored choice,
  // and meet the tap floor. Under the ADVANCED disclosure, which is closed by
  // default — so they are opened before being measured, exactly as a reader would.
  const seed = "try{localStorage.setItem('forage.threadfold','8');}catch{}";
  const p = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, seed], responses: RESPONSES });
  try {
    await p.page.setViewportSize({ width: 390, height: 900 });
    await p.page.goto(`${p.origin}/me`);
    await p.page.waitForSelector('[data-advanced]');
    await p.page.locator('[data-advanced] summary').click();
    const flat = p.page.locator('[data-threadflatten]');
    const fold = p.page.locator('[data-threadfold]');
    assert.equal(await flat.inputValue(), 'auto', 'the flatten dial opens on the stored choice');
    assert.equal(await fold.inputValue(), '8', 'and so does the fold dial');
    for (const [name, loc] of [['flatten', flat], ['fold', fold]]) {
      assert.ok((await loc.boundingBox()).height >= 44, `the ${name} dial meets the phone tap floor`);
    }
    await flat.selectOption('off');
    assert.equal(await p.page.evaluate(() => document.documentElement.getAttribute('data-flatten')), 'off',
      'choosing writes the root attribute the stylesheet reads, with no reload');
    await p.page.reload();
    await p.page.waitForSelector('[data-advanced]');
    assert.equal(await p.page.evaluate(() => document.documentElement.getAttribute('data-flatten')), 'off',
      'and it survives a reload — applied at boot, before first paint of a thread');
    p.errors(); p.consoleErrors();
  } finally { await p.close(); }
}
