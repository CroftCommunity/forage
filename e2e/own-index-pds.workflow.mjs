// Your discovery index on the atmo provider account (plan 2026-09-21
// own-index-on-the-pds, Phase 5): the settings surface, the record, the blob
// and the link — hermetic. The reader's repo slot for fyi.forage.feedindex,
// the blobs it names and the link hosts are LIVE in the page (localStorage,
// so they survive every navigation an init script re-runs on): a put must be
// read back by the next getRecord, an uploaded blob must be served by the next
// getBlob, or a broken round trip would pass. Every write and read is logged
// so the assertions are about bodies, not clicks.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import axePkg from '@axe-core/playwright';
import { FAKE_SIGNED_IN } from './tagsub.workflow.mjs';
import { R } from './follow-all.workflow.mjs';

const AxeBuilder = axePkg.default ?? axePkg;
const REPO_KEY = '__indexrepo';
const BLOBFAIL_KEY = '__blobfail';
const LINK = 'https://gardeners.example/index.json';
const CLOSED = 'https://closed.example/index.json';

// her index: two feeds and three jumpstarts, uris sorted (the validator's rule)
export const MINE = { v: 1,
  feeds: [
    { uri: 'at://did:plc:g1/app.bsky.feed.generator/pnw-gardens', name: 'PNW Gardens', desc: 'gardening in the wet', creator: 'g1.test', platform: null, band: 2, tags: ['topic:gardening'] },
    { uri: 'at://did:plc:g2/app.bsky.feed.generator/seed-swap', name: 'Seed Swap', desc: '', creator: 'g2.test', platform: 'skyfeed.me', band: 1, tags: [] },
  ],
  jumpstarts: [
    { uri: 'at://did:plc:g1/app.bsky.graph.starterpack/3gard', name: 'Gardeners of the PNW', desc: 'the people', creator: 'g1.test', members: 44, band: 1, tags: [] },
    { uri: 'at://did:plc:g2/app.bsky.graph.starterpack/3seed', name: 'Seed savers', desc: '', creator: 'g2.test', members: 12, band: 0, tags: [] },
    { uri: 'at://did:plc:g3/app.bsky.graph.starterpack/3tool', name: 'Tool libraries', desc: '', creator: 'g3.test', members: 9, band: 0, tags: [] },
  ],
  edges: [['at://did:plc:g1/app.bsky.graph.starterpack/3gard', 'at://did:plc:g1/app.bsky.feed.generator/pnw-gardens']],
  providers: [{ handle: 'g1.test', kind: 'curator', tags: [] }],
};
const BIG_LINK_INDEX = { ...MINE, feeds: [{ ...MINE.feeds[0], name: 'From the link' }, MINE.feeds[1]] };

// (seed) — the repo slot, the blobs it can serve, the link hosts
export const LIVE_INDEX = ({ record = null, blobs = {} } = {}) => `(() => {
  const K = ${JSON.stringify(REPO_KEY)}, BLOBFAIL = ${JSON.stringify(BLOBFAIL_KEY)};
  if (localStorage.getItem(K) === null) localStorage.setItem(K, JSON.stringify({ record: ${JSON.stringify(record)}, blobs: ${JSON.stringify(blobs)}, hits: [] }));
  const LINKS = { ${JSON.stringify(LINK)}: ${JSON.stringify(BIG_LINK_INDEX)} };
  const read = () => JSON.parse(localStorage.getItem(K));
  const write = (v) => localStorage.setItem(K, JSON.stringify(v));
  const hit = (op, extra) => { const r = read(); r.hits.push({ op, ...extra }); write(r); return r; };
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const shimmed = window.fetch;
  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
    if (url.includes('com.atproto.repo.getRecord?') && url.includes('fyi.forage.feedindex')) {
      const r = hit('get');
      return r.record ? json({ uri: 'at://did:plc:me/fyi.forage.feedindex/self', cid: 'c' + r.hits.length, value: r.record })
        : json({ error: 'RecordNotFound', message: 'Could not locate record' }, 400);
    }
    if (url.includes('com.atproto.repo.putRecord')) {
      const body = JSON.parse(init.body); const r = hit('put', { body }); r.record = body.record; write(r);
      return json({ uri: 'at://did:plc:me/fyi.forage.feedindex/self', cid: 'c' + r.hits.length });
    }
    if (url.includes('com.atproto.repo.deleteRecord')) {
      const body = JSON.parse(init.body); const r = hit('delete', { body }); r.record = null; write(r); return json({});
    }
    if (url.includes('com.atproto.repo.uploadBlob')) {
      const raw = init.body;
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw instanceof Blob ? new Uint8Array(await raw.arrayBuffer()) : raw);
      const r = hit('upload', { ctype: init.headers && init.headers['content-type'], text });
      const cid = 'bafkreiup' + r.hits.length; r.blobs[cid] = text; write(r);
      return json({ blob: { $type: 'blob', ref: { $link: cid }, mimeType: 'application/json', size: new TextEncoder().encode(text).length } });
    }
    if (url.includes('com.atproto.sync.getBlob?')) {
      const cid = new URL(url).searchParams.get('cid'); const r = hit('blob', { cid });
      if (localStorage.getItem(BLOBFAIL)) return json({ error: 'InternalServerError', message: 'Internal Server Error' }, 500);
      const t = r.blobs[cid];
      return t === undefined ? json({ error: 'InvalidRequest', message: 'Blob not found' }, 400)
        : Promise.resolve(new Response(t, { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    if (host === 'gardeners.example' || host === 'closed.example') {
      hit('link', { url });
      if (host === 'closed.example') throw new TypeError('Failed to fetch');
      if (url in LINKS) return Promise.resolve(new Response(JSON.stringify(LINKS[url]), { status: 200, headers: { 'content-type': 'application/json' } }));
      return json({ error: 'NotFound' }, 404);
    }
    return shimmed(input, init);
  };
})();`;

const repoOf = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), REPO_KEY);
const hitsOf = async (page) => (await repoOf(page))?.hits || [];
const deviceOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('forage.feedindex') || 'null'));
// seeded ONCE: an init script re-runs on every navigation, and an unconditional
// seed rewrote the device half under the journey (caught 2026-09-21)
const DEVICE_FILE = `try { if (localStorage.getItem('forage.feedindex') === null) localStorage.setItem('forage.feedindex', ${JSON.stringify(JSON.stringify({ mode: 'add', own: { index: MINE, name: 'mine.json', generatedAt: '2026-09-20T00:00:00.000Z' } }))}); } catch {}`;
export const OWN_R = { ...R, 'listRecords?repo=did%3Aplc%3Ame&collection=fyi.forage.tagsub': { records: [] }, getStarterPacks: { starterPacks: [] }, 'searchStarterPacks': { starterPacks: [] }, getTrendingTopics: { topics: [] },
  getPopularFeedGenerators: { feeds: [] }, getFeedGenerators: { __echoFeeds: { displayName: 'hydrated', likeCount: 7, creator: { handle: 'h.test' }, labels: [] } } };

async function openAdvanced(page, origin) {
  await page.goto(`${origin}/me`);
  await page.waitForSelector('[data-advanced]');
  await page.evaluate(() => { document.querySelector('[data-advanced]').open = true; });
  await page.waitForSelector('[data-index-status]');
}
// textContent, not innerText: a rerender closes the Advanced disclosure again and
// innerText of an unrendered element is '' — reopen() is what the actions need
const statusText = (page) => page.evaluate(() => document.querySelector('[data-index-status]')?.textContent || '');
const errText = (page) => page.evaluate(() => document.querySelector('[data-feedindex-errors]')?.textContent || '');
const sectionText = (page) => page.evaluate(() => document.querySelector('[data-feedindex-section]')?.textContent || '');
const reopen = (page) => page.evaluate(() => { const d = document.querySelector('[data-advanced]'); if (d) d.open = true; });
async function mineOnJumpstarts(page, origin) {
  await page.goto(`${origin}/jumpstarts`);
  await page.waitForSelector('[data-jumpstart], #main .empty', { timeout: 15000 });
  return page.locator('[data-jumpstart] [data-provenance="mine"]').count();
}

export async function run() {
  // ---- 1. signed in, a file on this browser: keep it as the file, then as a link, then bring it back ----
  {
    const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, LIVE_INDEX(), DEVICE_FILE], responses: OWN_R });
    try {
      const { page, origin } = s;
      await page.setViewportSize({ width: 1280, height: 900 });
      await openAdvanced(page, origin);
      assert.equal(await page.locator('[data-feedindex-where]').inputValue(), 'browser');
      assert.equal(await page.locator('[data-feedindex-mode]').inputValue(), 'add');
      assert.match(await statusText(page), /Your file: mine\.json, 2 feeds, 3 jumpstarts — on this browser only\./);
      assert.equal(await page.locator('[data-feedindex-guest]').count(), 0);
      assert.equal(await page.locator('[data-index-status]').getAttribute('data-index-kept'), 'browser');

      // → the file: upload as JSON, put at self, the device copy dropped only after
      await page.selectOption('[data-feedindex-where]', 'account-file');
      await page.waitForFunction(() => document.querySelector('[data-index-status]')?.dataset.indexKept === 'account-file', null, { timeout: 15000 });
      await reopen(page);
      let hits = await hitsOf(page);
      assert.deepEqual(hits.map((h) => h.op), ['get', 'upload', 'put'], 'the record read at sign-in, then upload, then put');
      assert.equal(hits[1].ctype, 'application/json');
      assert.equal(hits[1].text, JSON.stringify(MINE), 'the bytes that went up are her index, as JSON');
      const put = hits[2].body;
      assert.deepEqual([put.repo, put.collection, put.rkey], ['did:plc:me', 'fyi.forage.feedindex', 'self']);
      assert.equal(put.record.kind, 'file');
      assert.equal(put.record.mode, 'add');
      assert.equal(put.record.name, 'mine.json');
      assert.equal(put.record.file.ref.$link, 'bafkreiup2');
      assert.equal(put.record.file.mimeType, 'application/json');
      assert.equal((await deviceOf(page)).own, undefined, 'the device half no longer holds the file');
      assert.match(await statusText(page), /Yours: mine\.json — kept on your atmo provider account as the file/);
      assert.equal(await page.locator('[data-feedindex-where]').inputValue(), 'account-file');
      assert.equal(await page.locator('[data-feedindex-refresh]').count(), 1, 'a kept index can be refreshed');

      // a new visit on THIS browser: the copy that went up is the cache, so the record is re-read and nothing is refetched
      assert.equal(await mineOnJumpstarts(page, origin), 3, 'her three jumpstarts, marked as hers');
      hits = await hitsOf(page);
      assert.equal(hits.at(-1).op, 'get', 'the record re-read');
      assert.equal(hits.filter((h) => h.op === 'blob').length, 0, 'the file just published is not fetched again (D5)');
      // her PHONE: no cache — the record is read, the blob fetched, and browse starts from hers
      await page.evaluate(() => localStorage.removeItem('forage.feedindex.pds'));
      assert.equal(await mineOnJumpstarts(page, origin), 3, 'on a new browser, hers');
      hits = await hitsOf(page);
      assert.deepEqual(hits.slice(-2).map((h) => h.op), ['get', 'blob'], 'read the record, fetched the file it names');
      assert.equal(hits.at(-1).cid, 'bafkreiup2');

      // → a link: http refused before any fetch; a closed host named; then the real one
      await openAdvanced(page, origin);
      await page.selectOption('[data-feedindex-where]', 'account-link');
      await page.waitForSelector('[data-feedindex-url]:visible');
      const before = (await hitsOf(page)).length;
      await page.fill('[data-feedindex-url]', 'http://gardeners.example/index.json');
      await page.click('[data-feedindex-keep-link]');
      await page.waitForFunction(() => /https/.test(document.querySelector('[data-feedindex-errors]')?.textContent || ''));
      assert.equal((await hitsOf(page)).length, before, 'an http link costs no request');
      await page.fill('[data-feedindex-url]', CLOSED);
      await page.click('[data-feedindex-keep-link]');
      await page.waitForFunction(() => /closed\.example/.test(document.querySelector('[data-feedindex-errors]')?.textContent || ''));
      assert.match(await errText(page), /cross-origin|CORS/);
      hits = await hitsOf(page);
      assert.equal(hits.at(-1).op, 'link');
      assert.equal(hits.filter((h) => h.op === 'put').length, 1, 'the closed host was never published');
      await page.fill('[data-feedindex-url]', LINK);
      await page.click('[data-feedindex-keep-link]');
      await page.waitForFunction(() => document.querySelector('[data-index-status]')?.dataset.indexKept === 'account-link', null, { timeout: 15000 });
      await reopen(page);
      hits = await hitsOf(page);
      assert.deepEqual(hits.slice(-2).map((h) => h.op), ['link', 'put'], 'fetched and validated BEFORE the put');
      const linkPut = hits.at(-1).body.record;
      assert.equal(linkPut.kind, 'url');
      assert.equal(linkPut.url, LINK);
      assert.equal('file' in linkPut, false);
      assert.equal(linkPut.createdAt, put.record.createdAt, 'a switch from file to link keeps the birth date');
      assert.match(await statusText(page), /kept on your atmo provider account as a link \(https:\/\/gardeners\.example\/index\.json\)/);
      assert.equal(await errText(page), '');
      // Refresh fetches the link again
      await page.click('[data-feedindex-refresh]');
      // Refresh re-reads the record first, then the link — wait for the second
      await page.waitForFunction((n) => { const h = JSON.parse(localStorage.getItem('__indexrepo')).hits; return h.length > n + 1 && h.at(-1).op === 'link'; }, hits.length);
      await reopen(page);
      assert.deepEqual((await hitsOf(page)).slice(-2).map((h) => h.op), ['get', 'link']);
      // browse now reads the link's file
      await page.goto(`${origin}/feeds`);
      await page.waitForSelector('[data-feed-controls]');
      await page.waitForFunction(() => document.body.innerText.includes('From the link'), null, { timeout: 15000 });

      // → Replace, on the record: a put in place, nothing refetched
      await openAdvanced(page, origin);
      const n0 = (await hitsOf(page)).length;
      await page.selectOption('[data-feedindex-mode]', 'replace');
      await page.waitForFunction((n) => JSON.parse(localStorage.getItem('__indexrepo')).hits.length > n, n0);
      await page.waitForFunction(() => document.querySelector('[data-feedindex-mode]')?.value === 'replace' && !document.querySelector('[data-feedindex-mode]').disabled);
      await reopen(page);
      hits = await hitsOf(page);
      assert.equal(hits.at(-1).op, 'put');
      assert.equal(hits.at(-1).body.record.mode, 'replace');
      assert.equal(hits.at(-1).body.record.url, LINK, 'the link is untouched');
      assert.equal(hits.filter((h) => h.op === 'link').length, 3, 'no refetch for a mode change');

      // → this browser only: confirmed fresh, deleted, the file comes back with the mode
      await page.selectOption('[data-feedindex-where]', 'browser');
      await page.waitForFunction(() => document.querySelector('[data-index-status]')?.dataset.indexKept === 'browser', null, { timeout: 15000 });
      await reopen(page);
      hits = await hitsOf(page);
      assert.deepEqual(hits.slice(-2).map((h) => h.op), ['get', 'delete'], 'read first, then delete');
      assert.deepEqual(hits.at(-1).body, { repo: 'did:plc:me', collection: 'fyi.forage.feedindex', rkey: 'self' });
      const dev = await deviceOf(page);
      assert.equal(dev.mode, 'replace', 'the choice survived the move');
      assert.equal(dev.own.name, LINK, 'a link with no name comes back named by its link');
      assert.equal(dev.own.index.feeds[0].name, 'From the link');
      assert.match(await statusText(page), /on this browser only/);
      assert.equal(await page.locator('[data-feedindex-refresh]').count(), 0);

      // → Off on this device
      await page.selectOption('[data-feedindex-mode]', 'off');
      await page.waitForFunction(() => /index is off/.test(document.querySelector('[data-index-status]')?.textContent || ''));
      await reopen(page);
      assert.equal(await mineOnJumpstarts(page, origin), 0, 'off is off');
      // the section never says null or undefined
      await openAdvanced(page, origin);
      assert.doesNotMatch(await sectionText(page), /\b(null|undefined)\b/);
      assert.deepEqual(await s.shimMisses(), []);
    } finally { await s.close(); }
  }

  // ---- 2. a record on the account whose file cannot be fetched: Forage's for this load, the record untouched ----
  {
    const REC = { $type: 'fyi.forage.feedindex', kind: 'file', mode: 'add', name: 'Gardeners',
      file: { $type: 'blob', ref: { $link: 'bafkreigone' }, mimeType: 'application/json', size: 60 },
      createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z' };
    const s = await scenario('first-visit', { mode: 'bluesky',
      initScripts: [FAKE_SIGNED_IN, LIVE_INDEX({ record: REC, blobs: { bafkreigone: JSON.stringify(MINE) } }), `try { localStorage.setItem(${JSON.stringify(BLOBFAIL_KEY)}, '1'); } catch {}`],
      responses: OWN_R });
    try {
      const { page, origin } = s;
      await page.setViewportSize({ width: 390, height: 844 });
      await openAdvanced(page, origin);
      const text = await statusText(page);
      assert.match(text, /Yours: Gardeners — kept on your atmo provider account as the file/);
      assert.match(text, /could not be fetched \(.*500.*\) — Forage's until it can/i);
      assert.equal(await page.locator('[data-feedindex-where]').inputValue(), 'account-file', 'the choice is still hers');
      assert.equal(await page.locator('[data-feedindex-mode]').inputValue(), 'add');
      let hits = await hitsOf(page);
      assert.deepEqual(hits.filter((h) => h.op === 'put' || h.op === 'delete'), [], 'nothing was written over a failed fetch');
      assert.equal(await mineOnJumpstarts(page, origin), 0, 'Forage\'s index for this load');
      // the tap floor and no sideways scroll, on the phone
      await openAdvanced(page, origin);
      const short = await page.$$eval('[data-feedindex-section] select, [data-feedindex-section] button, [data-feedindex-section] input',
        (ns) => ns.filter((n) => n.offsetParent !== null).map((n) => [n.dataset.feedindexWhere ? 'where' : n.dataset.feedindexMode ? 'mode' : n.tagName, n.getBoundingClientRect().height]).filter(([, h]) => h < 44));
      assert.deepEqual(short, [], `every visible control meets the 44px floor at 390: ${JSON.stringify(short)}`);
      const wide = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter((n) => n.getBoundingClientRect().right > window.innerWidth + 1 && n.offsetParent !== null)
        .map((n) => `${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${n.className ? '.' + String(n.className).split(' ').join('.') : ''} right=${Math.round(n.getBoundingClientRect().right)}`).slice(0, 12));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no sideways scroll — wider than the phone: ${JSON.stringify(wide)}`);
      // scoped to the section: the account page carries four findings that predate
      // this plan (heading order under Advanced, no main landmark, regions) — filed
      // in TODO.md § Small, 2026-09-21 — and the file picker's missing label was
      // this section's own, fixed the same day
      const axe = await new AxeBuilder({ page }).include('[data-feedindex-section]').analyze();
      assert.deepEqual(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`), [], JSON.stringify(axe.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]), null, 1));
      // the network comes back: Refresh fetches it, the words go, browse starts from hers
      await page.evaluate((k) => localStorage.removeItem(k), BLOBFAIL_KEY);
      await page.click('[data-feedindex-refresh]');
      await page.waitForFunction(() => !/could not be fetched/.test(document.querySelector('[data-index-status]')?.textContent || ''), null, { timeout: 15000 });
      await reopen(page);
      hits = await hitsOf(page);
      assert.equal(hits.at(-1).op, 'blob');
      assert.equal(await mineOnJumpstarts(page, origin), 3);
      assert.deepEqual(await s.shimMisses(), []);
    } finally { await s.close(); }
  }

  // ---- 3. a guest: the device half as before, and the sentence instead of the dial ----
  {
    const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [DEVICE_FILE], responses: OWN_R });
    try {
      const { page, origin } = s;
      await page.setViewportSize({ width: 390, height: 844 });
      await openAdvanced(page, origin);
      assert.equal(await page.locator('[data-feedindex-where]').count(), 0);
      assert.match(await page.locator('[data-feedindex-guest]').innerText(), /Sign in to keep it on your atmo provider account/);
      assert.match(await statusText(page), /on this browser only/);
      assert.equal(await page.locator('[data-feedindex-mode]').inputValue(), 'add');
      assert.doesNotMatch(await sectionText(page), /\b(null|undefined)\b/);
      assert.deepEqual(await s.shimMisses(), []);
    } finally { await s.close(); }
  }
}
