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
  voteArrows: document.querySelectorAll('.vote.boost, .cvote').length,
  scores: [...document.querySelectorAll('.votebox')].map((v) => v.textContent.replace(/[▲▼\s]/g, '')).filter(Boolean),
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
    assert.equal(board.voteArrows, 0, 'no vote arrows for a guest');
    assert.ok(board.scores.length && board.scores.some((s) => s.length),
      `the SCORE survives — the arrow is an action, the number is a fact: ${JSON.stringify(board.scores)}`);
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
    assert.equal(board.favorite, 1, 'signed in, the favorite star is back');
  } finally { await inn.close(); }
}
