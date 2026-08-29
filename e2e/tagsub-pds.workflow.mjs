// W16 — where a hashtag subscription LIVES: this device, or your repo.
//
// P5 of plans/2026-08-28-2-plan-hashtag-discovery.md. Its sibling W9
// (tagsub.workflow.mjs) covers joining and leaving; this one covers the choice
// the owner reframed on 2026-08-29 — local is a DESTINATION, with a privacy
// nothing in a repo can offer, and "PDS Save" is where a reader trades it away
// on purpose.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import axePkg from '@axe-core/playwright';

const AxeBuilder = axePkg.default ?? axePkg;

// The signed-in double and the fixture set are W9's, imported rather than
// copied: two fixture sets for one feature drift, and the drift is invisible
// until one of them starts testing a page the other does not have.
import { FAKE_SIGNED_IN, RESPONSES } from './tagsub.workflow.mjs';

// ── P5: the choice between a subscription nobody can see and one anybody can ──
//
// This is the first Forage record type that reaches a real repo, so the journey
// is not "does the button work" — it is the two things the plan said had to be
// true and that a unit test cannot see:
//
//   1. PDS Save MOVES a tag. It leaves this device and lands in the repo, and
//      the reader is told, in the box, that this makes it public.
//   2. Published means SYNCED. A tag published from another device is already
//      subscribed here — the nav carries it and the board's button says Leave.
//
// The repo is LIVE in the page rather than a static fixture: a create that the
// following list did not reflect would let a broken round trip pass.
const REPO_KEY = '__testrepo';
const LIVE_REPO = (seed) => `(() => {
  const KEY = ${JSON.stringify(REPO_KEY)};
  // The repo lives in localStorage, not on window: an init script re-runs on
  // EVERY navigation, so a window-scoped array silently reset itself to the
  // seed each time the journey changed page — and a test whose fixture forgets
  // the write it is testing fails in a way that looks like the app's fault.
  if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, JSON.stringify(${JSON.stringify(seed)}));
  const read = () => JSON.parse(localStorage.getItem(KEY) || '[]');
  const write = (r) => localStorage.setItem(KEY, JSON.stringify(r));
  let n = 0;
  const shimmed = window.fetch;
  const json = (body) => Promise.resolve(new Response(JSON.stringify(body), {
    status: 200, headers: { 'content-type': 'application/json' } }));
  window.fetch = (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    if (url.includes('listRecords') && url.includes('fyi.forage.tagsub')) {
      // The offline switch lives in localStorage rather than in a page.evaluate
      // patch, for the same reason the repo does: an init script re-runs on
      // every navigation and a window-scoped patch does not survive one.
      if (localStorage.getItem('__offline')) return Promise.reject(new Error('offline'));
      return json({ records: read().map((r) => ({
        uri: 'at://did:plc:me/fyi.forage.tagsub/' + r.rkey, value: { tag: r.tag, createdAt: r.createdAt } })) });
    }
    if (url.includes('createRecord') && body && body.collection === 'fyi.forage.tagsub') {
      const rkey = '3new' + (n += 1);
      const repo = read();
      repo.push({ tag: body.record.tag, rkey, createdAt: body.record.createdAt, $type: body.record.$type, repo: body.repo });
      write(repo);
      return json({ uri: 'at://did:plc:me/fyi.forage.tagsub/' + rkey, cid: 'c' });
    }
    if (url.includes('deleteRecord') && body && body.collection === 'fyi.forage.tagsub') {
      write(read().filter((r) => r.rkey !== body.rkey));
      return json({});
    }
    return shimmed(input, init);
  };
})();`;

const repoOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), REPO_KEY);

// The account page also draws the moderation mirror, which reads the graph. A
// journey that visits /me has to declare those four reads or it is not hermetic
// — and hermeticity here is not pedantry: an undeclared read is a real network
// call waiting to happen on someone else's machine.
const PROFILED = { ...RESPONSES,
  getProfile: { did: 'did:plc:me', handle: 'me.test' },
  getMutes: { mutes: [] }, getBlocks: { blocks: [] },
  getListMutes: { lists: [] }, getListBlocks: { lists: [] } };

export async function run() {
  // ---- a local subscription, made public on purpose ----
  const a = await scenario('first-visit', { mode: 'bluesky',
    initScripts: [FAKE_SIGNED_IN, LIVE_REPO([])], responses: PROFILED });
  try {
    const { page } = a;
    await page.goto(`${a.origin}/h/harvest`);
    await page.waitForSelector('[data-tagsub="harvest"]');
    await page.click('[data-tagsub="harvest"]');
    await page.waitForSelector('.nav [data-nav-item="tag-harvest"]');

    await page.goto(`${a.origin}/me`);
    await page.waitForSelector('[data-tagsub-row="harvest"]');
    const row = page.locator('[data-tagsub-row="harvest"]');
    assert.match(await row.innerText(), /Local only/, 'a joined tag starts on this device — local is a destination');
    assert.match(await row.innerText(), /PDS Save/);

    // The sentence the whole section exists for. "PDS Save" does not carry
    // "public" on its own, so the box has to say it where the decision is made.
    const panel = await page.locator('[data-tagsub-panel="1"]').innerText();
    assert.match(panel, /visible to anyone/i, 'publicness is stated in words, not implied by the word PDS');
    assert.match(panel, /never leave/i, 'and so is what staying local means');

    await page.click('[data-tagsub-row="harvest"] [data-pds="save"]');
    await page.waitForSelector('[data-tagsub-row="harvest"] [data-pds="remove"]');
    assert.match(await page.locator('[data-tagsub-row="harvest"]').innerText(), /Saved to PDS/);

    // MOVED, not copied: the record exists and the device entry is gone. A copy
    // would leave two truths and a row whose status is a guess.
    const repo = await repoOf(page);
    assert.deepEqual(repo.map((r) => r.tag), ['harvest'], 'the record is in the repo');
    assert.equal(repo[0].$type, 'fyi.forage.tagsub', 'and it is a tagsub record');
    assert.equal(repo[0].repo, 'did:plc:me', 'addressed to MY repo and no other');
    assert.ok(!Number.isNaN(Date.parse(repo[0].createdAt)), 'carrying a real datetime');
    const local = await page.evaluate(() => JSON.parse(localStorage.getItem('forage.tagsubs')));
    assert.deepEqual(local, [], 'and no longer on the device');

    // The subscription did not lapse while changing homes — this is the whole
    // claim of "published means synced", seen from the reader's side.
    await page.goto(`${a.origin}/h/harvest`);
    await page.waitForSelector('.nav [data-nav-item="tag-harvest"]');
    assert.equal((await page.locator('[data-tagsub="harvest"]').innerText()).trim(), 'Leave',
      'still subscribed, now publicly');

    // Remove from PDS brings it back to this device rather than dropping it —
    // the button says what it does and does no more than it says.
    await page.goto(`${a.origin}/me`);
    await page.waitForSelector('[data-tagsub-row="harvest"] [data-pds="remove"]');
    await page.click('[data-tagsub-row="harvest"] [data-pds="remove"]');
    await page.waitForSelector('[data-tagsub-row="harvest"] [data-pds="save"]');
    assert.deepEqual(await repoOf(page), [], 'the record is gone from the repo');
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('forage.tagsubs')).map((r) => r.tag)),
      ['harvest'], 'and it fell back to local-only on the device that pressed it');
    assert.deepEqual(await a.shimMisses(), [], 'hermetic');
  } finally { await a.close(); }

  // ---- a tag published from ANOTHER device is already mine here ----
  const b = await scenario('first-visit', { mode: 'bluesky',
    initScripts: [FAKE_SIGNED_IN, LIVE_REPO([{ tag: 'mycology', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' }])],
    responses: PROFILED });
  try {
    const { page } = b;
    await page.goto(`${b.origin}/me`);
    await page.waitForSelector('[data-tagsub-row="mycology"]');
    assert.match(await page.locator('[data-tagsub-row="mycology"]').innerText(), /Saved to PDS/);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('forage.tagsubs') || '[]')), [],
      'nothing was copied onto this device — the repo is the set');

    // It is a real subscription here, not a listing on a settings page.
    await page.waitForSelector('.nav [data-nav-item="tag-mycology"]');
    await page.goto(`${b.origin}/h/mycology`);
    await page.waitForSelector('[data-tagsub="mycology"]');
    assert.equal((await page.locator('[data-tagsub="mycology"]').innerText()).trim(), 'Leave',
      'offering to Join a tag you already publish would be a lie the reader can see');

    // And Leave means it: the record goes, rather than a local copy that was
    // never there.
    await page.click('[data-tagsub="mycology"]');
    await page.waitForSelector('.nav [data-nav-item="tag-mycology"]', { state: 'detached' });
    assert.deepEqual(await repoOf(page), [], 'Leave deleted the record');
  } finally { await b.close(); }

  // ---- the panel itself, on a phone and through axe ----
  //
  // The two standing gates (mobile-fit, a11y-skins) reach /me SIGNED OUT, where
  // this panel has one disabled button and no rows. Signed in it is a list of
  // real controls, so the checks come to it rather than the other way round —
  // a gate that measures the empty version of a screen is measuring nothing.
  const d = await scenario('first-visit', { mode: 'bluesky',
    initScripts: [FAKE_SIGNED_IN, LIVE_REPO([
      { tag: 'mycology', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' }])],
    responses: PROFILED });
  try {
    const { page } = d;
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto(`${d.origin}/me`);
    await page.waitForSelector('[data-tagsub-row="mycology"]');
    await page.evaluate(() => { document.querySelector('[data-tagsub-panel="1"]').scrollIntoView(); });

    const small = await page.$$eval('[data-tagsub-panel="1"] button, [data-tagsub-panel="1"] a',
      (els) => els.map((e) => e.getBoundingClientRect())
        .filter((r) => (r.width || r.height) && (r.width < 44 || r.height < 44))
        .map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`));
    assert.deepEqual(small, [], `tap targets under 44px in the subscription panel: ${small.join(', ')}`);

    const { scrollW, innerW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
    assert.ok(scrollW <= innerW + 1, `the panel pushes the page sideways at 320px (${scrollW} > ${innerW})`);

    const res = await new AxeBuilder({ page }).include('[data-tagsub-panel="1"]')
      .withTags(['wcag2a', 'wcag2aa']).analyze();
    assert.deepEqual(res.violations.map((v) => `${v.id}: ${v.nodes.length}`), [],
      'the panel is a row of controls in a colour pairing nothing else on the page has');
  } finally { await d.close(); }

  // ---- offline: the last known set, labelled, and no writes aimed at it ----
  // The plan refused to paper over the one cost of publishing: it needs the
  // network. So the failure mode is stated rather than shown as an empty list,
  // and the buttons are off — a cache is a display fallback, never the thing a
  // create or a delete is pointed at.
  const c = await scenario('first-visit', { mode: 'bluesky',
    initScripts: [FAKE_SIGNED_IN, LIVE_REPO([{ tag: 'mycology', rkey: '3aa', createdAt: '2026-08-01T00:00:00.000Z' }])],
    responses: PROFILED });
  try {
    const { page } = c;
    await page.goto(`${c.origin}/me`);
    await page.waitForSelector('[data-tagsub-row="mycology"]');   // cache warmed
    await page.evaluate(() => localStorage.setItem('__offline', '1'));
    await page.goto(`${c.origin}/me`);
    await page.waitForSelector('[data-tagsub-stale="1"]');
    const stale = await page.locator('[data-tagsub-stale="1"]').innerText();
    assert.match(stale, /last set/i, 'it says the list is remembered, not read');
    assert.match(stale, /off until/i, 'and that the controls are off, with why');
    assert.match(await page.locator('[data-tagsub-row="mycology"]').innerText(), /Saved to PDS/,
      'stale-but-true beats a blank list — an empty box would be a lie about your account');
    assert.equal(await page.locator('[data-tagsub-row="mycology"] [data-pds="remove"]').isDisabled(), true,
      'and nothing can be aimed at a set Forage cannot currently see');
  } finally { await c.close(); }
}
