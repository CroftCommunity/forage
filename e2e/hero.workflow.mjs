// W13 — the emblem hero: the signed-out front door (plan 2026-08-26-3, Phase D).
//
// The lens has never had one. The rook-and-wreath emblem with its sign-in call
// lives in boardView() — in the MEMORY population — while production defaults
// to the lens, so the surface a first-time visitor actually lands on was the
// one surface with no front door on it.
//
// What this pins that "the hero renders" does not:
//   - it is a DOOR. The emblem is branding; the button beside it has to reach
//     the host sheet, or this is a picture with a decoration under it.
//   - dismissal is PERMANENT and device-local. The owner chose never-expires,
//     which is only safe because the sticky masthead landed first — so the
//     reload half is the assertion that matters, not the click half.
//   - HOME ONLY, and never signed in. A hero on every board would be an ad.
//   - it does not eat the screen. The owner asked for prominence and accepted
//     ~42% of a 390px fold; this holds a ceiling so a later change cannot
//     quietly take the rest. The number is a decision, and a decision with no
//     assertion under it is a preference.
//   - the ✕ RESERVES its corner. The rejected side-by-side variant put it on
//     top of the headline when space got tight, which is exactly the shape of
//     defect that ships looking fine on the developer's window.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getPreferences': { preferences: [] },
  'describeRepo': { handle: 'me.test' },
  'getFeed?': { feed: [{ post: {
    uri: 'at://did:plc:aa/app.bsky.feed.post/a', cid: 'ca',
    author: { did: 'did:plc:aa', handle: 'aa.test' },
    record: { text: 'hello', createdAt: '2026-08-26T10:00:00Z' },
    indexedAt: '2026-08-26T10:00:00Z', replyCount: 0, repostCount: 0, likeCount: 2,
  } }] },
  'getPostThread': { thread: { post: {
    uri: 'at://did:plc:aa/app.bsky.feed.post/a', cid: 'ca',
    author: { did: 'did:plc:aa', handle: 'aa.test' },
    record: { text: 'hello', createdAt: '2026-08-26T10:00:00Z' },
    indexedAt: '2026-08-26T10:00:00Z', replyCount: 0, repostCount: 0, likeCount: 2,
  }, replies: [] } },
  'getQuotes': { posts: [] },
};

const SIGNED_IN = `(() => {
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

const HERO = '[data-hero]';

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.goto(`${s.origin}/`);
    await s.page.waitForSelector(HERO);

    // ---- it is the first thing, and it carries the emblem -----------------
    const shape = await s.page.evaluate((sel) => {
      const h = document.querySelector(sel);
      const img = h.querySelector('img');
      const x = h.querySelector('[data-hero-dismiss]');
      const head = h.querySelector('h2, strong, .hero-head');
      const r = (n) => { const b = n.getBoundingClientRect();
        return { top: Math.round(b.top), bottom: Math.round(b.bottom),
          left: Math.round(b.left), right: Math.round(b.right),
          w: Math.round(b.width), h: Math.round(b.height) }; };
      const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return {
        hero: r(h), img: img ? r(img) : null, alt: img?.getAttribute('alt') ?? null,
        x: x ? r(x) : null, xName: x?.getAttribute('aria-label') ?? x?.textContent?.trim() ?? null,
        headOverlapsX: head && x ? overlap(r(head), r(x)) : null,
        fold: window.innerHeight,
        docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      };
    }, HERO);

    assert.ok(shape.img, 'the hero carries the emblem — that is what it is for');
    assert.match(shape.alt ?? '', /forage/i,
      `the emblem is named for a screen reader, not alt="": ${JSON.stringify(shape.alt)}`);
    assert.ok(shape.img.w > shape.hero.w * 0.8,
      `STACKED on a phone: the emblem runs the width of the card (${shape.img.w} of ${shape.hero.w}). ` +
      'The side-by-side variant was built and rejected on sight — at 46% width the rook and wreath stop reading.');

    // The owner accepted ~42% of the fold. This is the ceiling, not the target.
    assert.ok(shape.hero.bottom <= shape.fold * 0.55,
      `the hero leaves the fold usable: ends at ${shape.hero.bottom} of ${shape.fold} ` +
      `(${Math.round(100 * shape.hero.bottom / shape.fold)}%, ceiling 55%). If it needs to shrink, cut a line of copy, not the art.`);
    assert.ok(shape.docScrollW <= shape.innerW + 1,
      `no horizontal overflow at 390px (${shape.docScrollW} > ${shape.innerW})`);

    // ---- the ✕ reserves its corner ---------------------------------------
    assert.ok(shape.x, 'there is a dismiss control');
    assert.ok(shape.xName && /close|dismiss|hide|✕/i.test(shape.xName),
      `the dismiss control has a name: ${JSON.stringify(shape.xName)}`);
    assert.equal(shape.headOverlapsX, false,
      'the ✕ does not sit on top of the headline — it reserves its corner');

    // ---- it is a DOOR ----------------------------------------------------
    await s.page.click(`${HERO} [data-hero-cta]`);
    await s.page.waitForSelector('dialog[data-auth-sheet][open]');
    await s.page.evaluate(() => document.querySelector('dialog[data-auth-sheet]').close());

    // ---- home only -------------------------------------------------------
    await s.page.goto(`${s.origin}/f/whats-hot`);
    await s.page.waitForSelector('.postrow');
    assert.equal(await s.page.locator(HERO).count(), 0, 'no hero on a feed board');

    await s.page.goto(`${s.origin}/p?uri=${encodeURIComponent('at://did:plc:aa/app.bsky.feed.post/a')}`);
    await s.page.waitForSelector('.postrow, .comment, h1');
    assert.equal(await s.page.locator(HERO).count(), 0, 'no hero on a thread');

    // ---- dismissal is immediate, and permanent ---------------------------
    await s.page.goto(`${s.origin}/`);
    await s.page.waitForSelector(HERO);
    await s.page.click(`${HERO} [data-hero-dismiss]`);
    assert.equal(await s.page.locator(HERO).count(), 0,
      'the ✕ removes it now — a control that only takes effect on the next load reads as broken');

    await s.page.reload();
    await s.page.waitForSelector('.masthead');
    await s.page.waitForTimeout(300);
    assert.equal(await s.page.locator(HERO).count(), 0,
      'and it stays gone across a reload — dismissal never expires');

    // The masthead is what makes that safe. If this ever fails, permanent
    // dismissal has become a dead end and Phase D must be reordered, not patched.
    assert.equal(await s.page.locator('.masthead .who a').count() > 0, true,
      'sign-in is still reachable from the masthead after the hero is gone — the reason permanent dismissal is survivable');

    assert.deepEqual(await s.shimMisses(), [], 'the hero reaches no host outside the fenced list');
  } finally { await s.close(); }

  // ---- signed in there is no hero at all --------------------------------
  const inn = await scenario('first-visit', {
    mode: 'bluesky', initScripts: [SIGNED_IN], responses: RESPONSES });
  try {
    await inn.page.goto(`${inn.origin}/`);
    await inn.page.waitForSelector('.masthead');
    await inn.page.waitForTimeout(400);
    assert.equal(await inn.page.locator(HERO).count(), 0,
      'signed in, the front door is behind you');
  } finally { await inn.close(); }
}
