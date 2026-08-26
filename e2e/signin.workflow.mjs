// W2 — the sign-in journey (2b/2c behavior at the workflow level). The fake
// session manager sits at the SAME seam production uses (initSession's
// harness hook) and mimics the real flow's shape: signIn stamps a marker and
// reloads (the authorize redirect), the next boot's restore() finds the
// session, sign-out clears it. Network reads flow through the fetch shim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario } from './harness/scenario.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (n) => JSON.parse(readFileSync(join(root, 'test/fixtures/atproto', `${n}.json`), 'utf8'));

const WHATS_HOT = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const AFTER_DARK = 'at://did:plc:x/app.bsky.feed.generator/afterdark';

const FAKE_MANAGER = `(() => {
  const KEY = 'w2.signed-in';
  let state = 'unknown';
  let session = null;
  const listeners = new Set();
  const set = (s) => { state = s; for (const fn of listeners) fn(s); };
  const mkSession = () => ({
    did: 'did:plc:w2test',
    signOut: async () => {},
    fetchHandler: (p, i) => window.fetch('https://bsky.social' + p, i),
  });
  window.__forageFakeSessionManager = {
    state: () => state,
    currentSession: () => session,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async restore() {
      if (sessionStorage.getItem(KEY)) { session = mkSession(); set('signed-in'); return session; }
      session = null; set('signed-out'); return null;
    },
    async signIn(handle) {
      set('pending');
      sessionStorage.setItem(KEY, handle);
      location.reload(); // the authorize redirect, in miniature
      return new Promise(() => {});
    },
    async signOut() { sessionStorage.removeItem(KEY); session = null; set('signed-out'); },
    fetch(p, i) {
      if (!session) return Promise.reject(new Error('signed out'));
      return session.fetchHandler(p, i);
    },
  };
})();`;

export async function run() {
  const s = await scenario('first-visit', {
    initScripts: [FAKE_MANAGER],
    responses: {
      'describeRepo': { did: 'did:plc:w2test', handle: 'wtest.bsky.social', didDoc: {}, collections: [] },
      'getPreferences': { preferences: [{ $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
        items: [{ type: 'feed', value: WHATS_HOT, pinned: false, id: '1' }, // 3s: joined, not favorited
                // 4a: joined BEFORE adult content was off — membership is not
                // consent, so it must still leave the sidebar.
                { type: 'feed', value: AFTER_DARK, pinned: true, id: '3' },
                { type: 'timeline', value: 'following', pinned: true, id: '2' }] }] },
      'getFeedGenerators': { feeds: [
        { uri: WHATS_HOT, displayName: "What's Hot", likeCount: 1, labels: [] },
        { uri: AFTER_DARK, displayName: 'After Dark', likeCount: 999, labels: [{ val: 'porn' }] }] },
      'getPopularFeedGenerators': { feeds: [
        { uri: 'at://did:plc:g/app.bsky.feed.generator/gardentalk', displayName: 'Garden Talk',
          description: 'Post with #gardening to appear here.', likeCount: 12, creator: { handle: 'grower.test' } },
        // 4a: this account carries NO adultContentPref, which the lexicon says
        // means adult content is off. The feed must not appear in discovery
        // and its board must refuse — with no Forage-side toggle to re-reveal.
        { uri: AFTER_DARK, displayName: 'After Dark',
          description: 'adult stuff', likeCount: 999, creator: { handle: 'x.test' },
          labels: [{ val: 'porn' }] } ] },
      'getFeedGenerator?feed=at%3A%2F%2Fdid%3Aplc%3Ax': { view: { uri: 'at://did:plc:x/app.bsky.feed.generator/afterdark',
        displayName: 'After Dark', description: 'adult stuff', likeCount: 999,
        creator: { handle: 'x.test' }, labels: [{ val: 'porn' }] }, isOnline: true, isValid: true },
      'getFeedGenerator?': { view: { uri: WHATS_HOT, displayName: "What's Hot", description: 'the hot stuff',
        likeCount: 99, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
      'putPreferences': {},
      'getProfile': { did: 'did:plc:w2test', handle: 'wtest.bsky.social', displayName: 'W Tester',
        avatar: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', description: 'a test bio', followersCount: 5, followsCount: 7, postsCount: 9 },
      'getTrendingTopics': { topics: [
        { topic: 'Meadow Fest', displayName: 'Meadow Fest', description: 'campers assemble',
          link: '/profile/did:plc:trends/feed/meadow1' } ] },
      'getMutes': { mutes: [] },
      'getBlocks': { blocks: [] },
      'getListMutes': { lists: [] },
      'getListBlocks': { lists: [] },

      'getFeed': fixture('wide-getFeed'),
    },
  });
  const { page } = s;

  // signed-out: the OAuth card, no app-password field anywhere
  await page.goto(`${s.origin}/`);
  await page.waitForSelector('text=Sign in with Bluesky');
  assert.equal(await page.locator('input[type="password"]').count(), 0, 'no password field exists anymore');

  // card path: handle → button → (redirect-in-miniature) → signed-in identity
  await page.locator('input[placeholder="you.bsky.social"]').fill('wtest.bsky.social');
  await page.locator('button:has-text("Sign in with Bluesky")').click();
  await page.waitForSelector('.masthead a[title="Your Forage profile"]', { timeout: 10000 });

  // the personal surface opens: saved feeds in the sidebar; the identity and
  // moderation mirror live on /me, NOT the front page
  await page.waitForSelector('a[href="/f/whats-hot"]');
  await page.waitForSelector('a[href="/f/following"]');
  assert.equal(await page.locator('#side [data-moderation-panel]').count(), 0, 'moderation lives on /me now');

  // the masthead @handle IS the profile link
  await page.goto(`${s.origin}/`);
  await page.locator('.masthead a[title="Your Forage profile"]').click();
  await page.waitForSelector('text=@wtest.bsky.social');
  await page.waitForSelector('[data-moderation-panel]');

  // 3u: content languages live here, and the page says plainly that Bluesky
  // has no account-level language preference for us to honour (verified: no
  // lang def in app.bsky.actor.defs — DL-026).
  await page.waitForSelector('[data-lang-panel]');
  const langText = await page.locator('[data-lang-panel]').innerText();
  assert.match(langText, /Forage only|this device/i, 'the limitation is stated, not papered over');
  await page.locator('[data-lang-panel] input[value="ja"]').check();
  await page.waitForFunction(() => localStorage.getItem('forage.langs') === 'ja');
  await page.locator('[data-lang-panel] button:has-text("Show every language")').click();
  await page.waitForFunction(() => localStorage.getItem('forage.langs') === null);
  await page.waitForSelector('text=Muted words');
  // 3k: the account menu — this account listed active, add + sign out present
  await page.waitForSelector('[data-account-menu]');
  await page.waitForSelector('[data-switch-did] , button:has-text("(active)")');
  await page.waitForSelector('button:has-text("+ Add another account")');

  // 3j: feed discovery — /feeds lists generators, searchable, each linkable
  await page.goto(`${s.origin}/feeds`);
  await page.waitForSelector('[data-discover-feed]');
  await page.waitForSelector('text=Garden Talk');
  await page.waitForSelector('text=Post with #gardening to appear here.');
  await page.locator('[data-feed-search]').fill('garden');
  await page.locator('button:has-text("Search")').click();
  await page.waitForSelector('text=Garden Talk');

  // 4a: the adult-labelled generator is absent from discovery entirely — the
  // account never enabled adult content, so the posture hides it in the shape
  // layer and no component ever sees it. There is deliberately NO toggle here.
  assert.equal(await page.locator('text=After Dark').count(), 0,
    'an adult-labelled feed does not surface for an account with adult content off');
  assert.equal(await page.locator('[data-discover-feed]').count(), 1, 'exactly the clean feed remains');
  assert.equal(await page.locator('input[type="checkbox"]:near(:text("adult"))').count(), 0,
    'discovery offers no adult toggle of its own — the account setting is the only source of truth');

  // 4a: it is gone from the sidebar too, even though the account JOINED it —
  // membership does not override the account's moderation setting.
  assert.equal(await page.locator('.side >> text=After Dark').count(), 0,
    'a joined adult feed does not appear in Fields');

  // 4a: and its board never paints. The slug never registers (nothing that can
  // reach it survives the posture), so a direct URL lands on the unknown-source
  // state rather than leaking the feed's content or name.
  await page.goto(`${s.origin}/f/afterdark`);
  await page.waitForSelector('text=Unknown lens Field');
  assert.equal(await page.locator('[data-board-toolbar]').count(), 0, 'no board painted');
  assert.equal(await page.locator('text=adult stuff').count(), 0, 'no description leaks either');

  // 3j: a feed board carries its header card, and Join writes preferences
  await page.goto(`${s.origin}/f/whats-hot`);
  await page.waitForSelector('[data-feed-header]');
  await page.waitForSelector('text=Curated by @bsky.app.');
  // 3s: Favorite is its own control — pinning is the top row of the official
  // app, joining is the list. Forage must not conflate them.
  const star = page.locator('[data-feed-favorite]');
  assert.equal(await star.count(), 1, 'the feed page offers a favorite');
  assert.equal(await star.getAttribute('aria-pressed'), 'false', 'a joined-but-unpinned feed is not a favorite');
  await star.click();
  await page.waitForFunction(() => window.__shimHits.filter((h) => h.url.includes('putPreferences')).length >= 1);
  const favBody = JSON.parse(await page.evaluate(() =>
    window.__shimHits.filter((h) => h.url.includes('putPreferences')).at(-1).body));
  const favPref = favBody.preferences.find((p) => p.$type.includes('savedFeedsPrefV2'));
  assert.equal(favPref.items.find((i) => i.value.includes('whats-hot')).pinned, true,
    'favoriting pins the entry — and leaves it saved');
  await page.waitForSelector('[data-feed-favorite][aria-pressed="true"]');

  const joinBtn = page.locator('[data-feed-header] button.btn.sm:not([data-feed-favorite])');
  assert.equal(await joinBtn.innerText(), 'Leave', 'an already-saved feed offers Leave');
  await joinBtn.click();
  // .at(-1): the favorite above already wrote once — read the LATEST write
  await page.waitForFunction(() => window.__shimHits.filter((h) => h.url.includes('putPreferences')).length >= 2);
  const putBody = await page.evaluate(() => JSON.parse(window.__shimHits.filter((h) => h.url.includes('putPreferences')).at(-1).body));
  const savedPref = putBody.preferences.find((p) => p.$type.includes('savedFeedsPrefV2'));
  assert.ok(!savedPref.items.some((i) => i.value.includes('whats-hot')), 'leaving removed it from saved feeds');

  // sign out lives on the profile now — go there, then out
  await page.goto(`${s.origin}/me`);
  await page.waitForSelector('button:has-text("Sign out")');
  await page.locator('button:has-text("Sign out")').click();
  await page.waitForSelector('text=Sign in with Bluesky', { timeout: 10000 });

  // the masthead direct path: no local form — straight to the entryway (the
  // fake manager stamps and reloads, same shape as the real redirect)
  await page.locator('.masthead .who a:has-text("Sign in")').click();
  await page.waitForSelector('.masthead a[title="Your Forage profile"]', { timeout: 10000 });

  assert.deepEqual(await s.shimMisses(), [], 'every network read had a fixture');
  await s.close();
}
