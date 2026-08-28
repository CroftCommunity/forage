// W8 — E144: the masthead's account controls collapse into one avatar, and
// Preferences move onto the page that avatar opens.
//
// WHY IT IS A DEPENDENCY AND NOT A TIDY-UP: the left nav (V4) put a 44px
// hamburger in a masthead that fits one row only BECAUSE a duplicate link was
// removed to save 52px (2776537, measured 113px -> 61px at 320px). Adding a
// control back overran it, and the mock clipped a real handle to
// "cpettet.bsky.so…". An avatar is ~30px where a handle plus a caret plus a
// Settings link is ~215px, so this is what buys the room back.
//
// The three questions roadmap E144 said a design pass had to answer are the
// three things asserted here: what a signed-OUT bar shows where an avatar
// would be, what accessible name an avatar-only control carries, and whether
// it clears the touch floor.
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

const RESPONSES = {
  describeRepo: { handle: 'cpettet.bsky.social' },
  getPreferences: { preferences: [] },
  getProfile: { did: 'did:plc:me', handle: 'cpettet.bsky.social', displayName: 'Chase' },
  getFollows: { follows: [] },
  getFollowers: { followers: [] },
  getAuthorFeed: { feed: [] },
  getTimeline: { feed: [] },
  getTrendingTopics: { topics: [] },
  getFeedGenerators: { feeds: [] },
};

const widthsOf = (page, sel) => page.$$eval(sel, (els) =>
  els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));

export async function run() {
  // ---- signed IN: one control, named, and the bar fits a phone ----
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    await s.page.setViewportSize({ width: 320, height: 800 });
    await s.page.goto(`${s.origin}/trending`);
    await s.page.waitForSelector('[data-account="1"]');

    // ONE account control, not a handle plus a caret plus a Settings link.
    assert.equal(await s.page.locator('.masthead [data-account="1"]').count(), 1);
    assert.equal(await s.page.locator('.masthead a:has-text("Settings")').count(), 0,
      'Settings is not a separate masthead item any more — it lives behind the avatar');

    // It has a real accessible name. An avatar-only control with none is the
    // `link-name` defect this repo has already shipped once.
    const label = await s.page.locator('[data-account="1"]').getAttribute('aria-label');
    assert.ok(label && /cpettet/.test(label),
      `the avatar names whose account it is: ${JSON.stringify(label)}`);

    // The touch floor, at the width that forced this change.
    const small = (await widthsOf(s.page, '.masthead a, .masthead button'))
      .filter(({ w, h }) => w > 0 && h > 0 && (w < 44 || h < 44));
    assert.deepEqual(small, [], 'every masthead control clears 44px at 320');

    // THE POINT: one row. This is the measurement that made E144 a dependency.
    const rows = await s.page.evaluate(() => {
      const m = document.querySelector('.masthead');
      return { h: Math.round(m.getBoundingClientRect().height) };
    });
    assert.ok(rows.h <= 72, `the masthead stays one row at 320px: ${rows.h}px`);

    // And it opens the merged page.
    await s.page.click('[data-account="1"]');
    await s.page.waitForSelector('h1');
    assert.ok(s.page.url().endsWith('/me'), 'the avatar opens your account page');
    await s.page.waitForSelector('#pref-skin', { timeout: 10000 });

    // /settings is the same page now, not a second one that can drift.
    await s.page.goto(`${s.origin}/settings`);
    await s.page.waitForSelector('#pref-skin');
    assert.ok(s.page.url().endsWith('/me'), 'the old address redirects rather than forking');
  } finally { await s.close(); }

  // ---- signed OUT: a stand-in, and Preferences still reachable ----
  const out = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    await out.page.setViewportSize({ width: 320, height: 800 });
    await out.page.goto(`${out.origin}/`);
    await out.page.waitForSelector('[data-account="1"]');
    const label = await out.page.locator('[data-account="1"]').getAttribute('aria-label');
    assert.match(label || '', /account|preference/i,
      `a guest gets a stand-in that says what it opens: ${JSON.stringify(label)}`);
    // The direct-OAuth entry the owner asked for (3i) is NOT collapsed away.
    assert.equal(await out.page.locator('.masthead a:has-text("Sign in")').count(), 1,
      'signing in is still one press from the bar');

    await out.page.click('[data-account="1"]');
    await out.page.waitForSelector('#pref-skin');
    assert.ok(await out.page.locator('#pref-skin').count() > 0,
      'a guest can still change the skin — hiding a control they CAN use is the opposite rule');
  } finally { await out.close(); }
}
