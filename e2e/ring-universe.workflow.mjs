// W40 — the ring as the whole universe on a thread (owner, 2026-09-04).
//
// Three claims the unit tier cannot hold, because they live in the view:
//   1. the punch-hole: signed in at Follows, following the root's author and
//      nobody else, the thread shows EVERY reply and quote — strangers included
//      — and nothing reads "[removed]";
//   2. with the punch-hole off, the same thread shows the head alone: the
//      strangers are absent, not stubbed;
//   3. the thread pill mutes Mutuals (nobody on the thread is a mutual) with a
//      reason on hover, and leaves Follows live (the root's author is one).
// And the setting is on /me Advanced, checked by default.
//
// Watched RED against main (`ROOT=../../../forage`) before it went green here.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, FAKE_SIGNED_IN, THREAD_PATH, NODE_IDS } from './harness/mock-thread.mjs';

const ROOT_DID = 'did:plc:root';
const RING_AT_FOLLOWS = `(() => { try { localStorage.setItem('forage.ringscope', 'fol'); } catch {} })();`;
const PUNCH_HOLE_OFF = `(() => { try { localStorage.setItem('forage.ringopenthreads', '0'); } catch {} })();`;

// The reader follows the root's author and nobody follows the reader back:
// Follows = { me, root }, Mutuals = { me }.
const responses = {
  ...RESPONSES,
  'getFollows': { follows: [{ did: ROOT_DID, handle: 'quietcartographer.bsky.social' }] },
  'getFollowers': { followers: [] },
};
const root = process.env.ROOT;

export async function run() {
  // 1. the punch-hole, on by default
  const open = await scenario('first-visit', { mode: 'bluesky', root, initScripts: [FAKE_SIGNED_IN, RING_AT_FOLLOWS], responses });
  try {
    const { page } = open;
    await page.goto(`${open.origin}${THREAD_PATH}`);
    await page.waitForSelector('.comment[data-kind="quote"]');
    const ids = await page.$$eval('.comment', (cs) => cs.map((c) => c.dataset.nodeId));
    assert.deepEqual(ids.sort(), [...NODE_IDS].sort(),
      'a post from someone in the ring shows every reply and quote, strangers included');
    const text = await page.locator('#main').innerText();
    assert.ok(!text.includes('[removed]'), 'and nothing pretends anyone was deleted');

    // 3. the pill: Mutuals muted with a reason, Follows live
    const pill = page.locator('[data-thread-ring]');
    assert.equal(await pill.count(), 1, 'the thread carries its own pill');
    // The muting lands AFTER the paint, when the members walk resolves — the
    // thread never waits for it (the cascade must not either).
    await page.waitForSelector('[data-thread-ring] input[data-scope="mut"]:disabled', { timeout: 10000 });
    const mut = pill.locator('input[data-scope="mut"]');
    assert.equal(await mut.isDisabled(), true, 'nobody on this thread is a mutual, so Mutuals is muted');
    const mutTitle = await pill.locator('label[for$="-mut"]').getAttribute('title');
    assert.match(mutTitle || '', /on this thread/i, `the hover says why (got ${JSON.stringify(mutTitle)})`);
    assert.equal(await pill.locator('input[data-scope="fol"]').isDisabled(), false, 'the root\'s author is a follow, so Follows is live');
    assert.equal(await pill.locator('input[data-scope="world"]').isDisabled(), false, 'World is never muted');
  } finally {
    await open.close();
  }

  // 2. the punch-hole, off: the universe is airtight
  const shut = await scenario('first-visit', { mode: 'bluesky', root, initScripts: [FAKE_SIGNED_IN, RING_AT_FOLLOWS, PUNCH_HOLE_OFF], responses });
  try {
    const { page } = shut;
    await page.goto(`${shut.origin}${THREAD_PATH}`);
    await page.waitForSelector('.posttext, .empty');
    assert.equal(await page.locator('.comment').count(), 0, 'with the punch-hole off, only the ring is on the thread — and that is the head alone');
    const text = await page.locator('#main').innerText();
    assert.ok(!text.includes('[removed]'), 'absent, not stubbed');
    assert.ok(!/Outside your ring/.test(text), 'the head itself is inside the ring and renders');
  } finally {
    await shut.close();
  }

  // 4. the setting, on /me Advanced, checked by default
  const me = await scenario('first-visit', { mode: 'bluesky', root, initScripts: [FAKE_SIGNED_IN], responses });
  try {
    const { page } = me;
    await page.goto(`${me.origin}/me`);
    await page.waitForSelector('[data-advanced]');
    await page.locator('[data-advanced] > summary').click();
    const box = page.locator('#pref-ringopen');
    assert.equal(await box.count(), 1, 'the punch-hole is a setting beside the ring stops');
    assert.equal(await box.isChecked(), true, 'on by default');
  } finally {
    await me.close();
  }
}
