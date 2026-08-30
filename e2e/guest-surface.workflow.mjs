// W11 — what a signed-out visitor is SHOWN (polish plan phase 3).
//
// The rule, owner 2026-08-27: a guest is never shown a control they cannot
// use. Not disabled-with-words — ABSENT. The gated version was specified for
// weeks and rejected once described out loud: a control whose behaviour is
// "summon a login you did not ask for" is a landmine even when the login is
// ours, and six of them across every surface is a minefield.
//
// Three things this asserts that "remove the button" does not cover:
//   - the ring card signed out is PROSE, not a one-option dial. Hiding three of
//     four settings leaves a control with nothing to choose, which reads as
//     broken rather than clean.
//   - the SCORE survives. The arrow is an action you cannot take; the number is
//     a fact, and it is how you tell a busy thread from a quiet one. Read
//     literally, "hide the vote control" takes the score with it and makes
//     every post look identical.
//   - signed IN, all of it comes back. A suite that only checks the absent
//     direction passes against an app that hides them from everyone.
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

const seen = (page) => page.evaluate(() => ({
  // V4: the dial is gone and the ladder lives in the left nav, so "is a rung
  // offered to a guest?" is now a question about nav rows. The PROPERTY this
  // workflow asserts is unchanged — a guest is shown no rung at all, and is
  // told once why — only the surface it lives on moved.
  ringButtons: [...document.querySelectorAll('.nav [data-nav-item]')]
    .map((b) => b.getAttribute('data-nav-item'))
    .filter((id) => ['me', 'mut', 'fol', 'hop', 'world'].includes(id)),
  ringCardAnywhere: document.querySelector('.navnote')?.innerText?.replace(/\n+/g, ' ')
    ?? [...document.querySelectorAll('.card')].map((c) => c.innerText.replace(/\n+/g, ' ')).find((t) => /ring/i.test(t)) ?? null,
  favorite: document.querySelectorAll('[data-feed-favorite]').length,
  joinLeave: [...document.querySelectorAll('button')].filter((b) => /^(Join|Leave)$/.test(b.textContent.trim())).length,
  // board-cards Phase 3 (decision 1): one vote control — a LIVE button when you
  // can vote, and for a guest the same pill as a DOOR: `button[data-vote]
  // [data-guest]`, a person glyph and no arrow, named with the count and
  // "sign in to like", whose tap opens the sign-in sheet. The read-only span
  // it replaces looked exactly like the live pill and ignored the touch —
  // the owner's first finding on the live site.
  voteArrows: document.querySelectorAll('button[data-vote]:not([data-guest])').length,
  guestDoors: [...document.querySelectorAll('button[data-vote][data-guest]')].map((b) => ({
    name: b.getAttribute('aria-label'), title: b.getAttribute('title'),
    arrow: b.textContent.includes('\u25B2'), glyph: !!b.querySelector('svg'),
    pressed: b.getAttribute('aria-pressed'),
  })),
  scores: [...document.querySelectorAll('button[data-vote][data-guest] .n')].map((v) => v.textContent.trim()).filter(Boolean),
}));

export async function run() {
  // ---------- signed OUT ----------
  const out = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    await out.page.goto(`${out.origin}/`);
    await out.page.waitForSelector('.masthead');
    await out.page.waitForTimeout(400);
    const home = await seen(out.page);

    assert.deepEqual(home.ringButtons, [],
      `a guest is shown no ring buttons at all — a one-option dial is not "clean", it is broken. Saw: ${JSON.stringify(home.ringButtons)}`);
    assert.ok(home.ringCardAnywhere && /account|sign in|follow graph/i.test(home.ringCardAnywhere),
      `the absence must still be EXPLAINED once, in words: ${JSON.stringify(home.ringCardAnywhere)}`);

    await out.page.goto(`${out.origin}/f/whats-hot`);
    await out.page.waitForSelector('.postrow');
    await out.page.waitForTimeout(300);
    const board = await seen(out.page);

    assert.equal(board.favorite, 0, 'no favorite star for a guest');
    assert.equal(board.joinLeave, 0, 'no Join/Leave for a guest');
    assert.equal(board.voteArrows, 0, 'no live vote arrows for a guest');
    assert.ok(board.scores.length && board.scores.some((s) => s.length),
      `the SCORE survives — the arrow is an action, the number is a fact: ${JSON.stringify(board.scores)}`);
    const rows = await out.page.locator('.postrow').count();
    assert.equal(board.guestDoors.length, rows, `every row carries the guest's door (${board.guestDoors.length} of ${rows})`);
    for (const d of board.guestDoors) {
      assert.match(d.name, /^\d[\d,.]*[km]? likes? — sign in to like$/, `the door is named with the count and the way in: ${JSON.stringify(d.name)}`);
      assert.equal(d.title, 'Sign in to like', 'the tooltip says the one thing');
      assert.equal(d.arrow, false, 'no arrow — the arrow is an action a guest cannot take');
      assert.equal(d.glyph, true, 'a person glyph instead');
      assert.equal(d.pressed, null, 'it is a door, not a toggle: no aria-pressed');
    }
    // tapping the door opens the sign-in sheet, and the count does not move
    const countBefore = board.scores[0];
    await out.page.locator('button[data-vote][data-guest]').first().click();
    await out.page.waitForSelector('dialog.authsheet[open]');
    assert.equal(await out.page.locator('button[data-vote][data-guest] .n').first().textContent(), countBefore, 'the count is unchanged after the tap');
    await out.page.keyboard.press('Escape');
    await out.page.waitForFunction(() => !document.querySelector('dialog.authsheet[open]'));
    // Phase 4b (plan 2026-08-29 post-and-thread): the ⋯ shows a guest the
    // three things a guest can do, and never a Save it cannot perform —
    // and (board-cards decision 8) a last group with ONE item that says why
    // the rest is missing and opens the sheet.
    await out.page.locator('.postrow .byline button.kebab').first().click();
    await out.page.waitForTimeout(150);
    assert.deepEqual(await out.page.$$eval('[role="menu"] [role="menuitem"] > span:first-child', (els) => els.map((e) => e.textContent.trim())),
      ['Copy text', 'Copy link', 'Open on bsky.app', 'Sign in to like, save and reply'], 'a guest\'s lens menu');
    assert.equal(await out.page.locator('[role="menu"] .msep').count(), 1, 'the door sits behind a rule');
    await out.page.locator('[role="menuitem"]:has-text("Sign in to like, save and reply")').click();
    await out.page.waitForSelector('dialog.authsheet[open]');
    await out.page.keyboard.press('Escape');
    await out.page.waitForFunction(() => !document.querySelector('dialog.authsheet[open]'));
  } finally { await out.close(); }

  // ---------- signed IN: all of it comes back ----------
  const inn = await scenario('first-visit', {
    mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    await inn.page.goto(`${inn.origin}/`);
    await inn.page.waitForSelector('.nav [data-nav-item="mut"]');
    const home = await seen(inn.page);
    assert.ok(home.ringButtons.length >= 4,
      `signed in the ladder is offered in full: ${JSON.stringify(home.ringButtons)}`);

    await inn.page.goto(`${inn.origin}/f/whats-hot`);
    await inn.page.waitForSelector('.postrow');
    await inn.page.waitForTimeout(300);
    const board = await seen(inn.page);
    assert.ok(board.voteArrows > 0, 'signed in, the boost arrow is back');
    assert.equal(board.guestDoors.length, 0, 'signed in, no guest door anywhere');
    assert.equal(board.favorite, 1, 'signed in, the favorite star is back');
    await inn.page.locator('.postrow .byline button.kebab').first().click();
    await inn.page.waitForTimeout(150);
    const items = await inn.page.$$eval('[role="menu"] [role="menuitem"] > span:first-child', (els) => els.map((e) => e.textContent.trim()));
    assert.ok(items.includes('Save') && items.includes('Report'), `signed in, the menu is the full list: ${JSON.stringify(items)}`);
    assert.ok(!items.some((i) => /^Sign in/.test(i)), 'signed in, no Sign in item');
    await inn.page.keyboard.press('Escape');
  } finally { await inn.close(); }
}
