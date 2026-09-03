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
    assert.equal(await guest.page.locator('[data-ring-bar]').count(), 0,
      'nor the ring pill the rungs became — same rule, new surface');
    // replaceChildren(null) appends the TEXT "null" rather than skipping the
    // argument, so a chrome slot that renders conditionally can print the word
    // to the page. That shipped for the length of one commit in 2026-09-03 and
    // no assertion in three tiers saw it — they all check that things ARE
    // present, never that nothing extra is.
    const strayChrome = await guest.page.evaluate(() => [...document.getElementById('masthost').childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()));
    assert.deepEqual(strayChrome, [], 'the masthead host carries no stray text nodes');

    const note = await guest.page.locator('.navnote').innerText();
    assert.match(note, /follow graph/i, 'the absence is explained once, in words');
    // Feeds ARE readable signed out, so they stay.
    assert.ok(await guest.page.locator('[data-nav-item="whats-hot"]').count() > 0,
      'what a guest CAN read is kept');

    // ---- 1b. v11 (owner, 2026-09-01): what the Feeds section holds ----
    // "remove Bluesky from the default feed on the left under Discovery … and
    // put Trending in its place". Trending MOVED — it is not a second copy of
    // the row that used to sit below the rule, so a check that only counted
    // rows would have missed the duplicate this had to avoid.
    const groups = await guest.page.$eval('[data-nav="1"]', (n) => {
      const out = []; let cur = null;
      for (const kid of n.children) {
        if (kid.classList.contains('navsec')) { cur = { section: kid.textContent.trim(), items: [] }; out.push(cur); continue; }
        if (kid.tagName === 'HR') { cur = { section: '—', items: [] }; out.push(cur); continue; }
        if (kid.dataset.navItem) (cur ??= (out.push({ section: '', items: [] }), out.at(-1))).items.push(kid.dataset.navItem);
      }
      return out;
    });
    assert.deepEqual(groups.map((g) => [g.section, g.items]),
      [['Feeds', ['whats-hot', 'directory']], ['—', ['feeds', 'hashtags']]],
      `a guest's nav: Discover then Trending under Feeds, then the browse surfaces (${JSON.stringify(groups)})`);
    assert.equal(await guest.page.locator('[data-nav-item="directory"]').count(), 1,
      'Trending appears ONCE — it moved up, it was not copied');
    assert.equal(await guest.page.locator('[data-nav-item="bsky.app"]').count(), 0,
      'and bsky.app is no longer a default board on the left');
  } finally { await guest.close(); }

  // ---- 2. one press, one thing ----
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
  try {
    // The rung rows used to carry this. Plan 2026-09-03 took the ring off the
    // nav — it is a scope now, not five destinations — so the property ("one
    // press, one thing; the marker MOVES rather than accumulating") is checked
    // on the rows that remain. It was never a fact about rings.
    // Trending and Browse-all-feeds, because nav.js renders those two
    // unconditionally — a feed row depends on what the fixture's account has
    // saved, and using one made this assert on the fixture rather than on the
    // nav.
    await s.page.goto(`${s.origin}/trending`);
    await s.page.waitForSelector('[data-nav-item="directory"][aria-current="page"]');
    assert.equal(await s.page.locator('[data-nav-item="directory"][aria-current="page"]').count(), 1,
      'the nav marks where you are');

    await s.page.click('[data-nav-item="feeds"]');
    await s.page.waitForSelector('[data-nav-item="feeds"][aria-current="page"]');
    assert.equal(await s.page.locator('[data-nav-item="directory"][aria-current="page"]').count(), 0,
      'and the old marker moved rather than accumulating');
    assert.ok(s.page.url().endsWith('/feeds'), 'a board is a real address, so it is shareable and reloadable');

    // The defect that killed the strip: pressing a nav row must not also open
    // something. Nothing else may appear as a side effect of navigating.
    assert.equal(await s.page.locator('.navscrim:visible').count(), 0,
      'switching boards opens nothing you did not ask for');

    // ---- 2b. narrowing the window does not leave the sidebar open as a drawer ----
    // The nav is visible at desktop width by design. Shrink the window past
    // the breakpoint and it becomes the fixed drawer — which must then be
    // CLOSED, with no scrim, until the burger is pressed. Observed by the
    // owner (2026-08-29): the drawer sat open over the column, undimmed,
    // with the burger claiming it was shut.
    assert.equal(await s.page.locator('[data-nav="1"]:visible').count(), 1, 'wide: the nav is a sidebar');
    await s.page.setViewportSize({ width: 390, height: 800 });
    await s.page.waitForSelector('[data-nav="1"]:visible', { state: 'hidden' });
    assert.equal(await s.page.locator('.navscrim:visible').count(), 0, 'no scrim either — nothing is open');
    assert.equal(await s.page.locator('.navburger[aria-expanded="false"]').count(), 1,
      'and the burger agrees with what is on screen');

    // ---- 3. tap targets, at the floor the gate enforces ----
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
    await s.page.click('[data-nav-item="directory"]');
    await s.page.waitForSelector('[data-nav="1"]:visible', { state: 'hidden' });
    assert.ok(s.page.url().endsWith('/trending'), 'and it actually navigated');
  } finally { await s.close(); }

  // ---- 5. v11: the centre column scrolls on its own (owner: "can we make the
  // center column scroll independently like reddit.com?") ----
  // The claim is not "the rails have position: sticky" — it is that scrolling
  // the page moves the column and leaves the rails where they are. So the check
  // scrolls and measures both, which is also the only form of it that survives
  // someone changing HOW it is done.
  // A GUEST at `/`, deliberately: a ring board returns no rail at all and
  // `#side` is then hidden, whose rect reads (0,0,0,0) — a measurement that
  // looks like "pinned to the very top" and is really "not there". The home
  // page draws both columns for a signed-out reader.
  const scr = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    await scr.page.setViewportSize({ width: 1280, height: 700 });
    await scr.page.goto(`${scr.origin}/`);
    await scr.page.waitForSelector('[data-nav="1"]');
    await scr.page.waitForSelector('#side .card');
    // enough content below the fold to have somewhere to scroll to
    await scr.page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '3000px';
      document.getElementById('main').append(filler);
    });
    const at = () => scr.page.evaluate(() => ({
      y: window.scrollY,
      nav: Math.round(document.querySelector('.nav').getBoundingClientRect().top),
      side: Math.round(document.getElementById('side').getBoundingClientRect().top),
      main: Math.round(document.getElementById('main').getBoundingClientRect().top),
      mast: Math.round(document.querySelector('.masthead').getBoundingClientRect().height),
    }));
    const top = await at();
    await scr.page.evaluate(() => window.scrollTo(0, 900));
    await scr.page.waitForFunction(() => window.scrollY > 800);
    const down = await at();
    assert.equal(down.y, 900, 'the page itself is still the scroller — window.scrollTo means what it meant');
    assert.ok(down.main < top.main - 800, `the column moved with the scroll (${top.main} → ${down.main})`);
    assert.equal(down.nav, down.side, 'both rails pin to the same line');
    assert.ok(down.nav >= 0 && down.nav <= top.mast + 24,
      `and they stay under the masthead instead of scrolling away (${down.nav}, masthead ${top.mast})`);
    // the pinned line is the masthead's REAL height — --masthead-h is a
    // measured constant, and a masthead that grew would slide under it
    const stuck = await scr.page.evaluate(() => ({
      declared: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--masthead-h')),
      real: document.querySelector('.masthead').getBoundingClientRect().height,
    }));
    assert.ok(Math.abs(stuck.declared - stuck.real) <= 2,
      `--masthead-h (${stuck.declared}) tracks the masthead's real height (${stuck.real})`);
    // a rail taller than the viewport scrolls INSIDE itself rather than being clipped
    const room = await scr.page.evaluate(() => {
      const n = document.querySelector('.nav');
      n.append(Object.assign(document.createElement('div'), { style: 'height:2000px' }));
      const host = document.getElementById('navhost');
      return { scrollable: host.scrollHeight > host.clientHeight + 4, overflow: getComputedStyle(host).overflowY };
    });
    assert.equal(room.overflow, 'auto', 'an over-tall rail gets its own scrollbar');
    assert.ok(room.scrollable, 'and is not simply clipped');
    // narrow: the rails fold back into the flow, so nothing may stay pinned
    await scr.page.setViewportSize({ width: 700, height: 700 });
    const narrow = await scr.page.evaluate(() => [
      getComputedStyle(document.getElementById('navhost')).position,
      getComputedStyle(document.getElementById('side')).position,
    ]);
    assert.deepEqual(narrow, ['static', 'static'],
      'below the fold-in widths a stacked column is pinned to nothing — so it is not pinned');
  } finally { await scr.close(); }
}
