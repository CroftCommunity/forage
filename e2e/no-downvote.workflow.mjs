// W14 — there is no downvote (plan 2026-08-27-1, Phase 1).
//
// The owner's call, 2026-08-27: bury is not useful. It was worth different
// amounts in the two populations and neither was enough.
//
//   - On the LENS it could never work. Bluesky has likes and no dislikes,
//     recorded as DL-011: scores are likes-only, downs are always 0. The arrow
//     rendered on every row, refused on click, and signing in would not have
//     unlocked it — a control advertising a capability the network lacks.
//   - In the SANDBOX it worked, and the owner judged the feature not worth its
//     surface area.
//
// Removing it CLOSES a divergence: the two populations now agree about whether
// a downvote is a thing, so DL-011 retires rather than being carried forever.
//
// Why an absence gets its own workflow rather than a line in another one:
// there are TWO vote controls in js/ui/components.js — `voteBox` on a post row
// and `miniVote` on a comment — and fixing one while shipping the other is the
// named risk in the plan. Four combinations (two populations x signed in/out)
// is what makes that mistake visible, and no existing workflow visits all four.
//
// The other half is here on purpose: BOOST still works. A suite that only
// asserts the absence passes against an app that lost voting entirely.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const WH = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const post = (r, d, t) => ({ post: {
  uri: `at://${d}/app.bsky.feed.post/${r}`, cid: 'c' + r,
  author: { did: d, handle: d.slice(8) + '.test' },
  record: { text: 'hello ' + r, createdAt: t }, indexedAt: t,
  replyCount: 1, repostCount: 0, likeCount: 7,
} });

const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getFeedGenerator?': { view: { uri: WH, displayName: 'Discover', description: 'trending',
    likeCount: 39382, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
  'getFeed?': { feed: [post('a', 'did:plc:aa', '2026-08-26T10:00:00Z')] },
  'getPostThread': { thread: {
    post: post('a', 'did:plc:aa', '2026-08-26T10:00:00Z').post,
    replies: [{ post: post('b', 'did:plc:bb', '2026-08-26T11:00:00Z').post, replies: [] }],
  } },
  'getQuotes': { posts: [] },
  'describeRepo': { handle: 'me.test' },
  'getPreferences': { preferences: [] },
};

const FAKE_SIGNED_IN = `(() => {
  const listeners = new Set(); let session = null; let state = 'unknown';
  window.__forageFakeSessionManager = {
    state: () => state, currentSession: () => session,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async restore() {
      session = { did: 'did:plc:me', signOut: async () => {},
        fetchHandler: (p, i) => window.fetch('https://bsky.social' + p, i) };
      state = 'signed-in'; for (const f of listeners) f(state); return session;
    },
    async signIn() {}, async signOut() {},
    fetch(p, i) { return session.fetchHandler(p, i); },
  };
})();`;

// Every way a downvote could still be on the page: the class, the glyph, and
// the aria name. Checking only `.vote.bury` would pass against a control that
// kept the arrow and lost the class.
const downvotes = (page) => page.evaluate(() => ({
  byClass: document.querySelectorAll('[class*="bury"], [data-vote="bury"]').length,
  byGlyph: [...document.querySelectorAll('button')].filter((b) => b.textContent.includes('▼')).length,
  byName: [...document.querySelectorAll('[aria-label], [title]')]
    .filter((n) => /bury|downvote/i.test(`${n.getAttribute('aria-label') ?? ''} ${n.getAttribute('title') ?? ''}`))
    .map((n) => n.tagName.toLowerCase()),
  // Phase 6 (plan 2026-08-29 post-and-thread): ONE vote control, two layouts —
  // the pill on a post, the count-over-arrow stack on a comment. Both are a
  // button[data-vote] with aria-pressed; a guest gets the same element as a
  // read-only span. `.vote.boost` / `.cvote` are gone with the two old
  // implementations that this suite existed to keep in step.
  boosts: document.querySelectorAll('button[data-vote]').length,
  // The owner's vocabulary call, 2026-08-27: a like here is a PROMOTION, not an
  // affection — "Like/Promote", not "like/love". So the word may be "like" and
  // the shape must stay an upward arrow. A heart says the other thing, and a
  // rule with no check decays into prose (PATTERN.md).
  // The /u flag is load-bearing. Without it a character class of astral emoji
  // is a class of SURROGATE HALVES, and 📌 (U+1F4CC) shares its leading
  // surrogate D83D with 💚 and 🖤 — so the pinned-post badge read as a heart.
  // A check that fires on the wrong thing is worse than none: it would have
  // been "fixed" by deleting the pin.
  hearts: [...document.querySelectorAll('*')]
    .filter((n) => !n.children.length && /[♥❤🤍💚🖤]/u.test(n.textContent)).length,
  voteNames: [...new Set([...document.querySelectorAll('button[data-vote]')]
    .map((b) => b.getAttribute('aria-label') ?? b.getAttribute('title') ?? '(unnamed)'))],
  readonlyNames: [...new Set([...document.querySelectorAll('[data-vote][data-readonly]')]
    .map((n) => n.getAttribute('aria-label') ?? '(unnamed)'))],
  // every pressed state is a real boolean, never a class
  pressed: [...document.querySelectorAll('button[data-vote]')].map((b) => b.getAttribute('aria-pressed')),
}));

async function assertNone(page, label, { expectBoosts }) {
  const seen = await downvotes(page);
  assert.equal(seen.byClass, 0, `${label}: a bury-classed control still renders`);
  assert.equal(seen.byGlyph, 0, `${label}: a ▼ button still renders`);
  assert.deepEqual(seen.byName, [], `${label}: something is still NAMED bury/downvote`);
  if (expectBoosts) {
    assert.ok(seen.boosts > 0,
      `${label}: the like control must survive — an absence-only suite passes against an app that lost voting entirely`);
  }
  assert.equal(seen.hearts, 0, `${label}: no heart glyph anywhere — the arrow promotes, it does not react`);
  for (const n of seen.voteNames) {
    assert.match(n, /^Like$/, `${label}: the vote control is named "Like", not ${JSON.stringify(n)}`);
  }
  for (const n of seen.readonlyNames) {
    assert.match(n, /^\d+ likes?$/, `${label}: the read-only count names itself in likes: ${JSON.stringify(n)}`);
  }
  for (const p of seen.pressed) {
    assert.ok(p === 'true' || p === 'false', `${label}: aria-pressed is a boolean on every vote: ${JSON.stringify(p)}`);
  }
}

export async function run() {
  // ---------- the lens, signed OUT ----------
  const out = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    await out.page.goto(`${out.origin}/f/whats-hot`);
    await out.page.waitForSelector('.postrow');
    // Signed out the guest surface hides vote controls entirely (W11), so this
    // asserts the absence without expecting a boost.
    await assertNone(out.page, 'lens board, signed out', { expectBoosts: false });

    await out.page.goto(`${out.origin}/p?uri=${encodeURIComponent('at://did:plc:aa/app.bsky.feed.post/a')}`);
    await out.page.waitForSelector('.comment, .postrow');
    await assertNone(out.page, 'lens thread, signed out', { expectBoosts: false });
  } finally { await out.close(); }

  // ---------- the lens, signed IN ----------
  const inn = await scenario('first-visit', {
    mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    await inn.page.goto(`${inn.origin}/f/whats-hot`);
    await inn.page.waitForSelector('button[data-vote]');
    await assertNone(inn.page, 'lens board, signed in', { expectBoosts: true });

    await inn.page.goto(`${inn.origin}/p?uri=${encodeURIComponent('at://did:plc:aa/app.bsky.feed.post/a')}`);
    await inn.page.waitForSelector('.comment');
    await assertNone(inn.page, 'lens thread, signed in', { expectBoosts: true });
  } finally { await inn.close(); }

  // ---------- the sandbox, signed OUT and IN ----------
  // This is the population where bury actually WORKED, so it is the one where
  // removing it is a product change rather than the retirement of a dead
  // control.
  // Phase 7 (plan 2026-08-29 post-and-thread, decision 6): a like BUZZES —
  // navigator.vibrate(12) exactly once per like-on, zero per like-off, and the
  // settings switch stops it. Stubbed at the context so every page sees it.
  const VIBRATE_STUB = `Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (ms) => { (window.__buzz ||= []).push(ms); return true; } });`;
  const mem = await scenario('seeded', { initScripts: [VIBRATE_STUB] });
  try {
    const { page } = mem;
    const buzzes = () => page.evaluate(() => window.__buzz || []);
    await page.goto(`${mem.origin}/popular`);
    await page.waitForSelector('.postrow');
    await assertNone(page, 'sandbox board, logged out', { expectBoosts: false });

    await page.waitForSelector('.devbar');
    await page.locator('.devbar select[title="Active persona"]').selectOption('u_fern');
    await page.waitForFunction(() => !!document.querySelector('button[data-vote]'));
    await assertNone(page, 'sandbox board, logged in', { expectBoosts: true });

    // …and boost still round-trips through the store. The optimistic paint is
    // the part the removal could plausibly break: it used to toggle two classes
    // and now toggles one.
    const first = page.locator('button[data-vote]').first();
    const scoreOf = () => page.evaluate(() =>
      document.querySelector('button[data-vote] .n')?.textContent.trim() ?? null);
    const before = await scoreOf();
    assert.equal(await first.getAttribute('aria-pressed'), 'false');
    await first.click();
    await page.waitForFunction((b) =>
      (document.querySelector('button[data-vote] .n')?.textContent.trim() ?? null) !== b, before);
    // the count moves by exactly one, not just "changed"
    assert.equal(Number(await scoreOf()), Number(before) + 1, 'boosting moves the score by one');
    assert.equal(await first.getAttribute('aria-pressed'), 'true', 'and the control says it is pressed');
    await page.locator('button[data-vote][aria-pressed="true"]').first().click();
    await page.waitForFunction((b) =>
      (document.querySelector('button[data-vote] .n')?.textContent.trim() ?? null) === b, before);
    assert.equal(await scoreOf(), before, 'and un-boosting puts it back — the toggle still toggles');
    assert.equal(await first.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await buzzes(), [12], 'one like-on = one 12ms buzz; the like-off added none');

    // A comment carries the SECOND vote control, and it is the one easiest to
    // miss — `miniVote` is a separate implementation of the same idea.
    //
    // The thread has to be one that actually HAS replies. Navigating to the
    // first post on the board found an empty thread, which rendered fine and
    // asserted nothing about comments: a passing absence check over a page with
    // no comment on it is exactly the shape of coverage this plan warns about.
    const threadHref = await page.evaluate(() =>
      [...document.querySelectorAll('.postrow')]
        .filter((r) => !/\b0 comments\b/.test(r.innerText))
        .map((r) => r.querySelector('.posttitle a')?.getAttribute('href'))
        .find(Boolean) ?? null);
    assert.ok(threadHref, 'the seeded board must offer a thread WITH replies, or the comment control goes unchecked');
    await page.goto(`${mem.origin}${threadHref}`);
    await page.waitForSelector('.comment');
    await assertNone(page, 'sandbox thread, logged in', { expectBoosts: true });
    // the comment's stack is the SAME control: count over arrow, one button,
    // toggling the same way (Phase 6 edges)
    // queried by selector every time: the store's notify re-renders the thread,
    // so a handle taken before the click is detached after it
    const SEL = '.comment button[data-vote]';
    const stackN = () => page.evaluate((s) => document.querySelector(s)?.querySelector('.n').textContent.trim(), SEL);
    const n0 = Number(await stackN());
    await page.locator(SEL).first().click();
    await page.waitForFunction(([s, n]) => document.querySelector(s)?.querySelector('.n').textContent.trim() !== String(n), [SEL, n0]);
    assert.equal(Number(await stackN()), n0 + 1, 'a comment like counts up by one');
    assert.equal(await page.locator(SEL).first().getAttribute('aria-pressed'), 'true');
    await page.locator(SEL).first().click();
    await page.waitForFunction(([s, n]) => document.querySelector(s)?.querySelector('.n').textContent.trim() === String(n), [SEL, n0]);
    assert.equal(await page.locator(SEL).first().getAttribute('aria-pressed'), 'false', 'and back');
    // the stub is per document, so the count restarted at the navigation
    assert.deepEqual(await buzzes(), [12], 'the comment like buzzed once too, and its un-like did not');
    // the switch: off on /settings, and the next like is silent
    await page.goto(`${mem.origin}/settings`);
    await page.waitForSelector('#pref-haptics');
    assert.equal(await page.locator('#pref-haptics').getAttribute('aria-checked'), 'true', 'default on');
    await page.locator('#pref-haptics').click();
    assert.equal(await page.locator('#pref-haptics').getAttribute('aria-checked'), 'false');
    assert.equal(await page.evaluate(() => localStorage.getItem('forage.haptics')), 'off');
    await page.goto(`${mem.origin}${threadHref}`);
    await page.waitForSelector(SEL);
    await page.locator(SEL).first().click();
    await page.waitForFunction(([s]) => document.querySelector(s)?.getAttribute('aria-pressed') === 'true', [SEL]);
    assert.deepEqual(await buzzes(), [], 'switched off: a like still likes, and does not buzz');
    await page.locator(SEL).first().click(); // leave the seed as we found it
    await page.waitForFunction(([s]) => document.querySelector(s)?.getAttribute('aria-pressed') === 'false', [SEL]);
    // a REFUSED write: the dev bar's Fail Next arms one simulated failure in
    // the write path, and the flip must revert to the ORIGINAL count — not
    // stay one off, not show a stale pressed state
    await page.locator('.devbar button', { hasText: /^Fail Next/ }).click();
    const untouched = await stackN();
    await page.locator(SEL).first().click();
    await page.waitForSelector('text=Vote failed');
    assert.equal(await stackN(), untouched, 'a refused vote reverts to the original count, not one off');
    assert.equal(await page.locator(SEL).first().getAttribute('aria-pressed'), 'false');

    // ---- Phase 2: Controversial is gone from BOTH sort lists ----------
    // Two of them exist: the board's and the one for comments inside a thread.
    // The plan's phase list named only the first; the second was found by
    // grepping, which is the argument for asserting over both rather than over
    // the one the plan happened to mention.
    const threadTabs = await page.evaluate(() =>
      [...document.querySelectorAll('.tabs .tab')].map((t) => t.textContent.trim()));
    // Phase 10 (plan 2026-08-29 post-and-thread, decision 9): Best is retired; Hot leads
    assert.deepEqual(threadTabs, ['Hot', 'Top', 'New'],
      `a thread offers three comment sorts, Hot first, and neither Best nor Controversial: ${JSON.stringify(threadTabs)}`);

    await page.goto(`${mem.origin}/popular`);
    await page.waitForSelector('.postrow');
    const boardTabs = await page.evaluate(() =>
      [...document.querySelectorAll('.tabs .tab')].map((t) => t.textContent.trim()));
    assert.deepEqual(boardTabs, ['Hot', 'New', 'Top', 'Rising'],
      `the board offers four sorts and Controversial is not one: ${JSON.stringify(boardTabs)}`);

    // …and each remaining sort still renders a board. A sort list that lost a
    // member and quietly broke its neighbours would pass the assertion above.
    for (const sort of ['hot', 'new', 'top', 'rising']) {
      await page.goto(`${mem.origin}/popular?sort=${sort}`);
      await page.waitForSelector('.tabs .tab');
      const active = await page.evaluate(() =>
        document.querySelector('.tabs .tab.active')?.textContent.trim() ?? null);
      assert.equal(active?.toLowerCase(), sort, `?sort=${sort} selects its own tab`);
    }

    // The edge that reaches a PERSON: a link someone shared before this change.
    // It must land on a working board, not strand them on a sort that no longer
    // exists. The engine's unknown-sort fallback is what carries this, and
    // nothing pinned that this particular name reaches it.
    await page.goto(`${mem.origin}/popular?sort=controversial`);
    await page.waitForSelector('.postrow');
    const stranded = await page.evaluate(() => ({
      rows: document.querySelectorAll('.postrow').length,
      tabs: [...document.querySelectorAll('.tabs .tab')].map((t) => t.textContent.trim()),
      active: document.querySelector('.tabs .tab.active')?.textContent.trim() ?? null,
    }));
    assert.ok(stranded.rows > 0, 'an old ?sort=controversial link still shows posts');
    assert.ok(!stranded.tabs.includes('Controversial'),
      'and it does not resurrect the tab to match the url');
  } finally { await mem.close(); }
}
