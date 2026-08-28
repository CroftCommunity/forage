// W7 — the left navigation, as a running system.
//
// This is the browser-level half of V4 (invariant 6b). It exists because the
// thing it replaced died of a defect no unit test could have seen: the strip's
// right half was a tab AND a menu opener, so switching views always opened a
// menu. That was found by clicking it. So the assertions here are about
// CLICKING — does one press do exactly one thing — rather than about markup.
//
// Three properties, none of which axe or a unit test can reach:
//   1. signed out, the ring section is ABSENT (not greyed) and says why once
//   2. one press on a rung switches the board AND moves the current marker
//   3. at 390px the nav is a DRAWER: absent until asked for, and dismissable
//      by scrim and by Escape — behaviour we own, because the drawer is ours
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

const post = (rkey, did, ts) => ({ post: {
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did, handle: did.slice(8) + '.test' },
  record: { text: `post ${rkey}`, createdAt: ts }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: 2,
} });

const RESPONSES = {
  describeRepo: { handle: 'me.test' },
  getPreferences: { preferences: [] },
  getFollows: { follows: [{ did: 'did:plc:aa', handle: 'aa.test' }] },
  getFollowers: { followers: [{ did: 'did:plc:aa', handle: 'aa.test' }] },
  getAuthorFeed: { feed: [post('r1', 'did:plc:aa', '2026-08-28T10:00:00Z')] },
  getTimeline: { feed: [post('t1', 'did:plc:aa', '2026-08-28T10:00:00Z')] },
  getTrendingTopics: { topics: [] },
  getFeedGenerators: { feeds: [] },
};

export async function run() {
  // ---- 1. the guest surface: absent, not greyed ----
  const guest = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    await guest.page.goto(`${guest.origin}/`);
    await guest.page.waitForSelector('[data-nav="1"]');
    const secs = await guest.page.$$eval('.navsec', (n) => n.map((e) => e.textContent.trim().toLowerCase()));
    assert.ok(!secs.includes('your ring'),
      'a guest gets NO ring section — hiding three of four rungs would leave one, which reads as broken');
    assert.equal(await guest.page.locator('[data-nav-item="mut"]').count(), 0,
      'and no rung rows at all, greyed or otherwise');
    const note = await guest.page.locator('.navnote').innerText();
    assert.match(note, /follow graph/i, 'the absence is explained once, in words');
    // Feeds ARE readable signed out, so they stay.
    assert.ok(await guest.page.locator('[data-nav-item="whats-hot"]').count() > 0,
      'what a guest CAN read is kept');
  } finally { await guest.close(); }

  // ---- 2. one press, one thing ----
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    await s.page.goto(`${s.origin}/r/mut`);
    await s.page.waitForSelector('[data-nav-item="fol"]');
    assert.equal(await s.page.locator('[data-nav-item="mut"][aria-current="page"]').count(), 1,
      'the nav marks where you are');

    await s.page.click('[data-nav-item="hop"]');
    await s.page.waitForSelector('[data-nav-item="hop"][aria-current="page"]');
    assert.match(await s.page.locator('h1').first().innerText(), /one hop out/i,
      'the board switched');
    assert.equal(await s.page.locator('[data-nav-item="mut"][aria-current="page"]').count(), 0,
      'and the old marker moved rather than accumulating');
    assert.ok(s.page.url().endsWith('/r/hop'), 'a rung is a real address, so it is shareable and reloadable');

    // The defect that killed the strip: pressing a nav row must not also open
    // something. Nothing else may appear as a side effect of navigating.
    assert.equal(await s.page.locator('.navscrim:visible').count(), 0,
      'switching boards opens nothing you did not ask for');

    // ---- 3. tap targets, at the floor the gate enforces ----
    await s.page.setViewportSize({ width: 390, height: 800 });
    await s.page.goto(`${s.origin}/r/mut`);
    await s.page.waitForSelector('.navburger');
    const small = await s.page.$$eval('.navburger, [data-nav-item]', (els) => els
      .map((e) => ({ t: (e.textContent || '').trim().slice(0, 24), r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44))
      .map(({ t, r }) => `${t} ${Math.round(r.width)}x${Math.round(r.height)}`));
    assert.deepEqual(small, [], 'every nav control clears the 44px touch floor');

    // ---- 4. the drawer is ours, so its behaviour is ours to prove ----
    assert.equal(await s.page.locator('[data-nav="1"]:visible').count(), 0,
      'at 390 the nav costs nothing until asked for — this is why it beat the strip');
    await s.page.click('.navburger');
    await s.page.waitForSelector('[data-nav="1"]:visible');
    assert.equal(await s.page.locator('.navburger[aria-expanded="true"]').count(), 1,
      'and it says so to a screen reader');

    // Click to the RIGHT of the 262px drawer. The scrim spans the viewport and
    // sits behind the drawer, so its centre is under the panel — a default
    // click there is intercepted by the nav, exactly as a real thumb would be.
    // The dismissable area is the part a reader can actually reach.
    await s.page.click('.navscrim', { position: { x: 330, y: 300 } });
    await s.page.waitForSelector('[data-nav="1"]:visible', { state: 'hidden' });

    await s.page.click('.navburger');
    await s.page.waitForSelector('[data-nav="1"]:visible');
    await s.page.keyboard.press('Escape');
    await s.page.waitForSelector('[data-nav="1"]:visible', { state: 'hidden' });

    // Navigating from inside the drawer closes it behind you.
    await s.page.click('.navburger');
    await s.page.waitForSelector('[data-nav="1"]:visible');
    await s.page.click('[data-nav-item="fol"]');
    await s.page.waitForSelector('[data-nav="1"]:visible', { state: 'hidden' });
    assert.ok(s.page.url().endsWith('/r/fol'), 'and it actually navigated');
  } finally { await s.close(); }
}
