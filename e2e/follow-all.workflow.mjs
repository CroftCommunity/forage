// Follow all / Unfollow all on a jumpstart — the first follow graph Forage
// changes for someone (plan 2026-09-14-plan-jumpstart-follow-all, Phase 3).
//
// Hermetic, on the tagsub-pds pattern: the reader's repo of follow records is
// LIVE in the page (localStorage, so it survives every navigation an init
// script re-runs on), and both getList's viewer state and applyWrites answer
// from it. That is the whole claim under test — a follow that the list did not
// reflect on the next read would let a broken round trip pass, and "Try the
// rest" is idempotent ONLY because the re-read sees what landed.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import axePkg from '@axe-core/playwright';
import { FAKE_SIGNED_IN, RESPONSES } from './tagsub.workflow.mjs';

const AxeBuilder = axePkg.default ?? axePkg;

export const PACK = 'at://did:plc:curator/app.bsky.graph.starterpack/3sp';
export const LIST = 'at://did:plc:curator/app.bsky.graph.list/3list';
const ME = 'did:plc:me';

// 105 members, built to stress the plan: me, two I already follow, one I block,
// one muted, one hidden under the guest floor AND a signed-in account with adult content off (porn), and 99 plain — some with long
// names and no avatar. Two getList pages (100 + 5); 99 to follow → chunks of
// 50 + 49; after Follow all, 101 followed → Unfollow all in 50 + 50 + 1.
export const MEMBERS = [
  { did: ME, handle: 'me.test', displayName: 'Me' },
  { did: 'did:plc:f1', handle: 'f1.test', displayName: 'Followed One' },
  { did: 'did:plc:f2', handle: 'f2.test', displayName: null },
  { did: 'did:plc:blk', handle: 'blocked.test', displayName: 'Blocked', blocking: true },
  { did: 'did:plc:mut', handle: 'muted.test', displayName: 'Muted', muted: true },
  { did: 'did:plc:gore', handle: 'labelled.test', displayName: 'Labelled', labels: [{ val: 'porn', src: 'did:plc:labeler', uri: 'at://x', cts: '2026-01-01T00:00:00Z' }] },
  ...Array.from({ length: 99 }, (_, i) => ({ did: `did:plc:p${i}`, handle: `plain-${i}.bsky.social`,
    displayName: i % 7 === 0 ? `A member with a rather long display name number ${i} 🌱` : (i % 3 ? `Member ${i}` : null) })),
];
const PRE_FOLLOWED = [{ rkey: '3pre1', subject: 'did:plc:f1' }, { rkey: '3pre2', subject: 'did:plc:f2' }];

const REPO_KEY = '__followrepo';
const LOG_KEY = '__applyBodies';
const FAIL_KEY = '__failChunk';
const CALLS_KEY = '__applyCalls';
// (seed, members) — mock-snaps passes its own 150-member stress population
export const LIVE_FOLLOWS = (seed, members = MEMBERS) => `(() => {
  const REPO_KEY = ${JSON.stringify(REPO_KEY)}, LOG_KEY = ${JSON.stringify(LOG_KEY)}, FAIL_KEY = ${JSON.stringify(FAIL_KEY)}, CALLS_KEY = ${JSON.stringify(CALLS_KEY)};
  const MEMBERS = ${JSON.stringify(members)};
  if (localStorage.getItem(REPO_KEY) === null) localStorage.setItem(REPO_KEY, JSON.stringify(${JSON.stringify(seed)}));
  const read = (k, d) => JSON.parse(localStorage.getItem(k) || d);
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const shimmed = window.fetch;
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  window.fetch = (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    if (url.includes('app.bsky.graph.getList?')) {
      const u = new URL(url);
      if (u.searchParams.get('list') !== ${JSON.stringify(LIST)}) return json({ error: 'NotFound' }, 400);
      const limit = Number(u.searchParams.get('limit') || 50);
      const start = Number(u.searchParams.get('cursor') || 0);
      // viewer state is only meaningful with a session: the guest reads the
      // public AppView and gets no viewer block at all
      const authed = url.includes('bsky.social');
      const repo = read(REPO_KEY, '[]');
      const items = MEMBERS.slice(start, start + limit).map((m) => {
        const mine = repo.find((r) => r.subject === m.did);
        const viewer = { muted: !!m.muted, blockedBy: false,
          ...(m.blocking ? { blocking: 'at://did:plc:me/app.bsky.graph.block/3b' } : {}),
          ...(mine ? { following: 'at://did:plc:me/app.bsky.graph.follow/' + mine.rkey } : {}) };
        return { uri: 'at://did:plc:curator/app.bsky.graph.listitem/' + m.did.split(':').pop(),
          subject: { did: m.did, handle: m.handle, displayName: m.displayName, avatar: null, labels: m.labels || [], ...(authed ? { viewer } : {}) } };
      });
      const next = start + limit < MEMBERS.length ? String(start + limit) : undefined;
      return json({ list: { uri: ${JSON.stringify(LIST)}, listItemCount: MEMBERS.length }, items, ...(next ? { cursor: next } : {}) });
    }
    if (url.includes('com.atproto.repo.applyWrites') && body) {
      const n = read(CALLS_KEY, '0') + 1;
      write(CALLS_KEY, n);
      write(LOG_KEY, [...read(LOG_KEY, '[]'), body]);
      if (String(n) === localStorage.getItem(FAIL_KEY)) return json({ error: 'RateLimitExceeded', message: 'Rate Limit Exceeded' }, 429);
      const repo = read(REPO_KEY, '[]');
      const results = body.writes.map((w, i) => {
        if (w.$type.endsWith('#create')) {
          const rkey = '3f' + n + 'x' + i;
          repo.push({ rkey, subject: w.value.subject, via: w.value.via, createdAt: w.value.createdAt, $type: w.value.$type, collection: w.collection, repo: body.repo });
          return { $type: 'com.atproto.repo.applyWrites#createResult', uri: 'at://did:plc:me/app.bsky.graph.follow/' + rkey, cid: 'c' + rkey };
        }
        const at = repo.findIndex((r) => r.rkey === w.rkey);
        if (at >= 0) repo.splice(at, 1);
        return { $type: 'com.atproto.repo.applyWrites#deleteResult' };
      });
      write(REPO_KEY, repo);
      return json({ results });
    }
    return shimmed(input, init);
  };
})();`;

const repoOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), REPO_KEY);
const bodiesOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), LOG_KEY);

export const pack = (extra = {}) => ({ starterPack: { uri: PACK, cid: 'bafysp',
  record: { name: 'Gardeners of the test network', description: 'A jumpstart of test accounts.', feeds: [] },
  creator: { did: 'did:plc:curator', handle: 'curator.test', displayName: 'The Curator' },
  joinedAllTimeCount: 12, joinedWeekCount: 1, list: { uri: LIST, listItemCount: MEMBERS.length }, labels: [], feeds: [],
  listItemsSample: MEMBERS.slice(0, 12).map((m) => ({ subject: { did: m.did, handle: m.handle, displayName: m.displayName, avatar: null } })),
  ...extra } });

// the signed-in account page draws the moderation mirror (tagsub-pds's note):
// declare every read or the journey is not hermetic
export const R = { ...RESPONSES,
  getProfile: { did: ME, handle: 'me.test' },
  getMutes: { mutes: [] }, getBlocks: { blocks: [] }, getListMutes: { lists: [] }, getListBlocks: { lists: [] },
  resolveHandle: { did: 'did:plc:curator' },
  'getStarterPack?': pack(),
  getFeedGenerators: { feeds: [] },
};

const J = '/j/curator.test/3sp';
export const seeded = () => PRE_FOLLOWED.map((r) => ({ ...r, $type: 'app.bsky.graph.follow', collection: 'app.bsky.graph.follow', repo: ME, createdAt: '2026-01-01T00:00:00Z' }));

export async function run() {
  // ---- a guest: the button is the door, and the confirm page explains it ----
  {
    const g = await scenario('first-visit', { mode: 'bluesky', initScripts: [LIVE_FOLLOWS([])], responses: R });
    try {
      const { page } = g;
      await page.goto(`${g.origin}${J}`);
      await page.waitForSelector('[data-jumpstart-head]');
      const btn = page.locator('[data-jumpstart-follow-all]');
      assert.equal(await btn.count(), 1);
      assert.match(await btn.innerText(), /Follow everyone in it/);
      assert.equal(await page.locator('[data-jumpstart-unfollow-all]').count(), 0, 'a guest follows nobody, so there is nothing to unfollow');
      const out = await page.locator('[data-jumpstart-out]').locator('..').innerText();
      assert.doesNotMatch(out, /Forage does not change your follows/, 'the old sentence is gone — Forage now can');
      await btn.click();
      await page.waitForSelector('dialog[data-auth-sheet][open]');
      await page.evaluate(() => document.querySelector('dialog[data-auth-sheet]').close());

      // the confirm page is readable signed out: the list, the plan, the door
      await page.goto(`${g.origin}${J}/follow`);
      await page.waitForSelector('[data-follow-all-page="follow"]');
      assert.match(await page.locator('h1').innerText(), /Follow 104 people/, 'a guest is nobody\'s "me"; the guest floor hides the labelled member');
      assert.equal(await page.locator('[data-follow-row]').count(), 104);
      assert.equal(await page.locator('[data-follow-all-commit]').count(), 0, 'no commit button for a guest');
      assert.equal(await page.locator('[data-follow-all-door]').count(), 1);
      assert.match(await page.locator('[data-follow-all-plan]').innerText(), /sign in/i);
      await page.click('[data-follow-all-door]');
      await page.waitForSelector('dialog[data-auth-sheet][open]');
      assert.deepEqual(await repoOf(page), [], 'nothing was written');
      assert.deepEqual(await g.shimMisses(), [], 'hermetic');
    } finally { await g.close(); }
  }

  // ---- signed in: the plan, the two chunks, the rows flipping, the mirror ----
  {
    const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, LIVE_FOLLOWS(seeded())], responses: R });
    try {
      const { page } = s;
      await page.goto(`${s.origin}${J}`);
      await page.waitForSelector('[data-jumpstart-head]');
      assert.equal(await page.locator(`[data-jumpstart-follow-all][href="${J}/follow"]`).count(), 1, 'signed in, the button is a link to the confirm page');
      await page.waitForSelector('[data-jumpstart-unfollow-all]');
      assert.equal(await page.locator(`[data-jumpstart-unfollow-all][href="${J}/unfollow"]`).count(), 1, 'she already follows two on the list, so Unfollow all is offered');

      await page.click('[data-jumpstart-follow-all]');
      await page.waitForSelector('[data-follow-all-page="follow"] [data-follow-all-commit]');
      assert.match(await page.locator('h1').innerText(), /Follow 99 people/);
      const plan = await page.locator('[data-follow-all-plan]').innerText();
      assert.match(plan, /99 follow records/);
      assert.match(plan, /batches of 50/);
      assert.match(plan, /Already following 2/);
      assert.match(plan, /you\b/, 'me, counted');
      assert.match(plan, /1 blocked/);
      assert.match(plan, /1 muted/);
      assert.match(plan, /1 hidden/);
      assert.equal(await page.locator('[data-follow-row]').count(), 99, 'the rows are the people about to be followed');
      assert.match(await page.locator('[data-follow-all-page]').innerText(), /what the network calls a starter pack/, 'the gloss, once');
      // the tap floor is a PHONE rule (css/app.css, max-width 480): at 390 wide
      // every row and the button are at least 44px tall
      await page.setViewportSize({ width: 390, height: 844 });
      const short = await page.evaluate(() => [...document.querySelectorAll('[data-follow-row], [data-follow-all-commit]')]
        .map((n) => n.getBoundingClientRect().height).filter((h) => h < 44).length);
      assert.equal(short, 0, 'nothing on the page is under the 44px tap floor');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.equal(overflow, false, 'a long display name wraps; the page never scrolls sideways');
      await page.setViewportSize({ width: 1280, height: 900 });
      const axe = await new AxeBuilder({ page }).include('[data-follow-all-page]').withTags(['wcag2a', 'wcag2aa']).analyze();
      assert.deepEqual(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`), [], 'the confirm page scans clean');
      assert.match(await page.locator('[data-follow-all-commit]').innerText(), /Follow 99 people/);

      await page.click('[data-follow-all-commit]');
      await page.waitForSelector('[data-follow-all-result]');
      // EXACT: the first mock capture showed "Followed 144 people.nullnull" — a
      // regex match had let two stringified nulls through
      assert.equal((await page.locator('[data-follow-all-result]').innerText()).trim(), 'Followed 99 people.');
      const bodies = await bodiesOf(page);
      assert.deepEqual(bodies.map((b) => b.writes.length), [50, 49], 'two applyWrites calls, the official client\'s chunk');
      assert.ok(bodies.every((b) => b.repo === ME), 'every call addresses MY repo');
      assert.ok(bodies.flatMap((b) => b.writes).every((w) => w.$type === 'com.atproto.repo.applyWrites#create' && w.collection === 'app.bsky.graph.follow' && w.rkey === undefined));
      const repo = await repoOf(page);
      assert.equal(repo.length, 101, 'the two she had plus ninety-nine');
      const written = repo.filter((r) => !r.rkey.startsWith('3pre'));
      assert.ok(written.every((r) => r.via && r.via.uri === PACK && r.via.cid === 'bafysp'), 'every follow says which jumpstart it came through (D2)');
      assert.ok(!written.some((r) => [ME, 'did:plc:f1', 'did:plc:f2', 'did:plc:blk', 'did:plc:mut', 'did:plc:gore'].includes(r.subject)), 'nobody skipped was followed');
      assert.equal(await page.locator('[data-follow-row][data-follow-state="following"]').count(), 99, 'the rows say Following without a refetch');
      assert.equal(await page.locator('[data-follow-all-commit]').count(), 0, 'the button is gone — the work is done');
      assert.equal(await page.locator('[data-follow-all-progress]').getAttribute('aria-live'), 'polite');

      // ---- Unfollow all: the mirror — the list is the unit (D4) ----
      await page.goto(`${s.origin}${J}/unfollow`);
      await page.waitForSelector('[data-follow-all-page="unfollow"] [data-follow-all-commit]');
      assert.match(await page.locator('h1').innerText(), /Unfollow 101 people/, 'the two she followed long before the jumpstart are on the list too');
      const uplan = await page.locator('[data-follow-all-plan]').innerText();
      assert.match(uplan, /101 follow records/);
      assert.match(uplan, /4 on the list you do not follow/);
      assert.equal(await page.locator('[data-follow-row]').count(), 101, 'every name is shown — nothing is hidden');
      assert.equal(await page.locator('[data-follow-row="did:plc:f1"]').count(), 1);
      await page.evaluate((k) => localStorage.removeItem(k), LOG_KEY);
      await page.click('[data-follow-all-commit]');
      await page.waitForSelector('[data-follow-all-result]');
      assert.equal((await page.locator('[data-follow-all-result]').innerText()).trim(), 'Unfollowed 101 people.');
      const ub = await bodiesOf(page);
      assert.deepEqual(ub.map((b) => b.writes.length), [50, 50, 1]);
      assert.ok(ub.flatMap((b) => b.writes).every((w) => w.$type === 'com.atproto.repo.applyWrites#delete' && w.collection === 'app.bsky.graph.follow' && typeof w.rkey === 'string'));
      assert.ok(ub.flatMap((b) => b.writes).some((w) => w.rkey === '3pre1'), 'the old follow\'s exact rkey, read from the list\'s viewer state');
      assert.deepEqual(await repoOf(page), [], 'the repo holds no follow of anyone on the list');

      await page.goto(`${s.origin}${J}`);
      await page.waitForSelector('[data-jumpstart-head]');
      await page.waitForSelector('[data-jumpstart-members-live]');
      assert.equal(await page.locator('[data-jumpstart-unfollow-all]').count(), 0, 'nothing left to unfollow, so the button is not offered');
      assert.deepEqual(await s.shimMisses(), [], 'hermetic');
    } finally { await s.close(); }
  }

  // ---- a failed second chunk: stop, say how far, Try the rest re-reads ----
  {
    const f = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, LIVE_FOLLOWS(seeded())], responses: R });
    try {
      const { page } = f;
      await page.goto(`${f.origin}${J}/follow`);
      await page.waitForSelector('[data-follow-all-commit]');
      await page.evaluate((k) => localStorage.setItem(k, '2'), FAIL_KEY);
      await page.click('[data-follow-all-commit]');
      await page.waitForSelector('[data-follow-all-result]');
      const res = await page.locator('[data-follow-all-result]').innerText();
      assert.match(res, /Followed 50 of 99/, 'the count so far');
      assert.match(res, /did not go through/);
      assert.match(res, /budget/i, 'a 429 is explained as the account\'s write budget');
      assert.doesNotMatch(res, /null|undefined/, 'nothing stringified into the sentence');
      assert.equal((await repoOf(page)).length, 52, 'the first chunk landed whole');
      assert.equal(await page.locator('[data-follow-row][data-follow-state="following"]').count(), 50, 'the fifty that landed say so');
      assert.equal(await page.locator('[data-follow-all-retry]').count(), 1);
      // the budget comes back; Try the rest re-reads the list — the fifty now
      // carry viewer.following and are skipped, so nothing is followed twice
      await page.evaluate((k) => localStorage.removeItem(k), FAIL_KEY);
      await page.click('[data-follow-all-retry]');
      await page.waitForSelector('[data-follow-all-commit]');
      assert.match(await page.locator('h1').innerText(), /Follow 49 people/);
      assert.match(await page.locator('[data-follow-all-plan]').innerText(), /Already following 52/);
      await page.click('[data-follow-all-commit]');
      await page.waitForSelector('[data-follow-all-result]');
      assert.match(await page.locator('[data-follow-all-result]').innerText(), /Followed 49 people/);
      const repo = await repoOf(page);
      assert.equal(repo.length, 101);
      assert.equal(new Set(repo.map((r) => r.subject)).size, 101, 'no member was followed twice');
      assert.deepEqual(await f.shimMisses(), [], 'hermetic');
    } finally { await f.close(); }
  }

  // ---- the empty states: a hidden jumpstart, and one that names no list ----
  {
    const h = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, LIVE_FOLLOWS(seeded())],
      responses: { ...R, 'getStarterPack?': pack({ labels: [{ val: 'porn', src: 'did:plc:labeler', uri: 'at://x', cts: '2026-01-01T00:00:00Z' }] }) } });
    try {
      await h.page.goto(`${h.origin}${J}/follow`);
      await h.page.waitForSelector('[data-follow-all-page] .empty');
      assert.match(await h.page.locator('.empty').innerText(), /hidden/i);
      assert.equal(await h.page.locator('[data-follow-all-commit]').count(), 0);
      assert.deepEqual(await h.shimMisses(), []);
    } finally { await h.close(); }
    const n = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, LIVE_FOLLOWS(seeded())],
      responses: { ...R, 'getStarterPack?': pack({ list: undefined }) } });
    try {
      await n.page.goto(`${n.origin}${J}/unfollow`);
      await n.page.waitForSelector('[data-follow-all-page] .empty');
      assert.match(await n.page.locator('.empty').innerText(), /no list/i);
      assert.deepEqual(await n.shimMisses(), []);
    } finally { await n.close(); }
  }
}
