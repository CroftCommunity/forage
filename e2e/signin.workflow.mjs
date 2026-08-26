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
        items: [{ type: 'feed', value: WHATS_HOT, pinned: true, id: '1' },
                { type: 'timeline', value: 'following', pinned: true, id: '2' }] }] },
      'getFeedGenerators': { feeds: [{ uri: WHATS_HOT, displayName: "What's Hot", likeCount: 1 }] },
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
  await page.goto(`${s.origin}/#/`);
  await page.waitForSelector('text=Sign in with Bluesky');
  assert.equal(await page.locator('input[type="password"]').count(), 0, 'no password field exists anymore');

  // the masthead Sign in control REACHES the card (focuses the handle input)
  await page.locator('.masthead .who a:has-text("Sign in")').click();
  await page.waitForFunction(() => document.activeElement?.id === 'signin-handle');

  // sign in: handle → button → (redirect-in-miniature) → signed-in identity
  await page.locator('input[placeholder="you.bsky.social"]').fill('wtest.bsky.social');
  await page.locator('button:has-text("Sign in with Bluesky")').click();
  await page.waitForSelector('text=@wtest.bsky.social', { timeout: 10000 });

  // the personal surface opens: saved feeds become Fields in the sidebar
  await page.waitForSelector('a[href="#/f/whatshot"]');
  await page.waitForSelector('a[href="#/f/following"]');

  // sign out returns to the signed-out card
  await page.locator('button:has-text("Sign out")').click();
  await page.waitForSelector('text=Sign in with Bluesky');

  assert.deepEqual(await s.shimMisses(), [], 'every network read had a fixture');
  await s.close();
}
