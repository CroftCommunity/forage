import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, FAKE_SIGNED_IN, THREAD_PATH } from './harness/mock-thread.mjs';

// Beta features → rings from the data servers (plan 2026-09-08-plan-beta-pds-walker, P5).
// The AppView says the root's author is NOT a mutual (getFollowers: []); the data servers
// say they follow the reader back. With the switch OFF the thread pill mutes Mutuals; with
// it ON, Mutuals is live — the walker decided the ring, and the shim's hit log shows the
// PDS calls and no getFollowers call.
const ROOT_DID = 'did:plc:root';
const ME = 'did:plc:me';
const PDS = 'https://pds.host.bsky.network';
const BETA_ON = `(() => { try { localStorage.setItem('forage.beta.pdswalker', '1'); } catch {} })();`;
const RING_AT_MUTUALS = `(() => { try { localStorage.setItem('forage.ringscope', 'fol'); } catch {} })();`;

const didDoc = (did) => ({ id: did, service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: PDS }] });
const follows = (subjects) => ({ records: subjects.map((subject, i) => ({ uri: `at://x/app.bsky.graph.follow/${i}`, cid: 'c', value: { $type: 'app.bsky.graph.follow', subject, createdAt: '2026-09-01T00:00:00Z' } })) });
const responses = {
  // the data servers (walker): me follows root; root follows me back
  [`plc.directory/${ME}`]: didDoc(ME),
  [`plc.directory/${ROOT_DID}`]: didDoc(ROOT_DID),
  'getLatestCommit?did=did%3Aplc%3Ame': { cid: 'c', rev: '3muzvzlycuh2v' },
  'getLatestCommit?did=did%3Aplc%3Aroot': { cid: 'c', rev: '3muzvzlycuh2r' },
  'listRecords?repo=did%3Aplc%3Ame': follows([ROOT_DID]),
  'listRecords?repo=did%3Aplc%3Aroot': follows([ME]),
  // the AppView: the same follow, but nobody follows the reader back
  ...RESPONSES,
  'getFollows': { follows: [{ did: ROOT_DID, handle: 'quietcartographer.bsky.social' }] },
  'getFollowers': { followers: [] },
};
const root = process.env.ROOT;

export async function run() {
  // 1. the switch: on /me under Beta features, off by default, persists
  const me = await scenario('first-visit', { mode: 'bluesky', root, initScripts: [FAKE_SIGNED_IN], responses });
  try {
    const { page } = me;
    await page.goto(`${me.origin}/me`);
    await page.waitForSelector('[data-beta]');
    await page.locator('[data-beta] > summary').click();
    const sw = page.locator('#pref-pdswalker');
    assert.equal(await sw.count(), 1, 'the pds-walker switch lives under Beta features');
    assert.equal(await sw.getAttribute('aria-checked'), 'false', 'a beta is opt-in');
    await sw.click();
    assert.equal(await sw.getAttribute('aria-checked'), 'true');
    await page.reload();
    await page.waitForSelector('[data-beta]');
    await page.locator('[data-beta] > summary').click();
    assert.equal(await page.locator('#pref-pdswalker').getAttribute('aria-checked'), 'true', 'the switch persists on this device');
  } finally {
    await me.close();
  }

  // 2. off: the AppView decides — Mutuals muted (nobody follows the reader back)
  const off = await scenario('first-visit', { mode: 'bluesky', root, initScripts: [FAKE_SIGNED_IN, RING_AT_MUTUALS], responses });
  try {
    const { page } = off;
    await page.goto(`${off.origin}${THREAD_PATH}`);
    await page.waitForSelector('[data-thread-ring] input[data-scope="mut"]:disabled', { timeout: 10000 });
    const hits = await page.evaluate(() => window.__shimHits.map((h) => h.url));
    assert.ok(hits.some((u) => u.includes('getFollowers')), 'the AppView was asked for followers');
    assert.ok(!hits.some((u) => u.includes('listRecords')), 'no data server was walked');
  } finally {
    await off.close();
  }

  // 3. on: the data servers decide — Mutuals live (root follows the reader back)
  const on = await scenario('first-visit', { mode: 'bluesky', root, initScripts: [FAKE_SIGNED_IN, RING_AT_MUTUALS, BETA_ON], responses });
  try {
    const { page } = on;
    await page.goto(`${on.origin}${THREAD_PATH}`);
    await page.waitForSelector('[data-thread-ring] input[data-scope="mut"]:not(:disabled)', { timeout: 15000 });
    const pill = page.locator('[data-thread-ring]');
    assert.equal(await pill.locator('input[data-scope="mut"]').isDisabled(), false, 'the walker learned that root follows the reader back, so Mutuals is live');
    assert.equal(await pill.locator('input[data-scope="fol"]').isDisabled(), false);
    const hits = await page.evaluate(() => window.__shimHits.map((h) => h.url));
    assert.ok(hits.some((u) => u.includes('listRecords?repo=did%3Aplc%3Aroot')), 'the data servers were walked (root listed)');
    assert.ok(!hits.some((u) => u.includes('getFollowers')), 'and the AppView was NOT asked for followers');
    const misses = await page.evaluate(() => window.__shimMisses);
    assert.deepEqual(misses.filter((m) => /plc\.directory|host\.bsky\.network/.test(String(m.url ?? m))), [], 'every data-server call had a fixture');
  } finally {
    await on.close();
  }
}
