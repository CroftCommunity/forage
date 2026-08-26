// W1 — the modes journey. Two arcs:
//   1b/1c: a seeded memory world enters the RAM-only bbs STORE mode, the
//   controls pin, the persisted world never moves a byte, exit restores.
//   3h: the PRESENTATION switch — default bluesky home → /mode → choose the
//   memory sandbox (full population swap, seeded) → clear the choice → the
//   domain default takes over again. Populations never mix.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

export async function run() {
  const s = await scenario('seeded');
  const { page } = s;

  const before = await s.key();
  assert.ok(before && before.length > 1000, 'seeded world persisted');
  const postsBefore = await page.locator('.card, article').count();
  assert.ok(postsBefore > 0, 'seeded world renders content');

  // enter bbs via the REAL control
  await page.locator('.devbar select').first().selectOption('bbs');
  await page.waitForSelector('.devbar .tag');
  assert.match(await page.locator('.devbar .tag').first().innerText(), /bbs.*RAM/i, 'the RAM-only badge shows');
  assert.equal(await page.locator('.devbar button:has-text("Seed")').isDisabled(), true, 'Seed pinned');
  assert.equal(await page.locator('.devbar button:has-text("Import")').isDisabled(), true, 'Import pinned');
  assert.equal(await page.locator('.devbar select').nth(1).isDisabled(), true, 'persona pinned');
  assert.equal(await s.key(), before, 'forage.state byte-identical inside bbs mode');

  // exit back to memory
  await page.locator('.devbar select').first().selectOption('memory');
  await page.waitForFunction(() => !document.querySelector('.devbar .tag'));
  assert.equal(await s.key(), before, 'forage.state byte-identical after exit');
  assert.equal(await page.locator('.devbar button:has-text("Seed")').isDisabled(), false, 'Seed back');
  const postsAfter = await page.locator('.card, article').count();
  assert.equal(postsAfter, postsBefore, 'the memory world renders identically after the round-trip');

  // hermeticity: nothing tried to reach the network
  assert.deepEqual(await s.shimMisses(), [], 'no unexpected network calls');
  await s.close(); // asserts zero page/console errors across the whole journey

  // ---- 3h arc: the presentation switch ----
  const p = await scenario('first-visit', { responses: { 'getTrendingTopics': { topics: [] } } });
  await p.page.goto(p.origin);
  await p.page.waitForSelector('text=The Lens'); // domain default: the Bluesky population
  assert.equal(await p.key(), null, 'the bluesky population writes nothing');
  assert.equal(await p.page.locator('.masthead a:has-text("Popular")').count(), 0,
    'no memory chrome in the bluesky masthead');

  // choose the memory sandbox at /mode — a full population swap
  await p.page.goto(`${p.origin}/#/mode`);
  await p.page.waitForSelector('[data-mode-card="memory"]');
  await p.page.locator('[data-mode-card="memory"] button').click();
  await p.page.waitForSelector('.masthead a:has-text("Popular")', { timeout: 10000 });
  await p.waitForSeed();
  assert.equal(await p.page.locator('text=The Lens').count(), 0, 'no bluesky chrome in memory');

  // /mode shows the provenance, and clearing returns to the domain default
  await p.page.goto(`${p.origin}/#/mode`);
  await p.page.waitForSelector('text=your choice on this device');
  await p.page.locator('button:has-text("Clear my choice")').click();
  await p.page.waitForSelector('text=The Lens', { timeout: 10000 });
  assert.equal(await p.page.evaluate(() => localStorage.getItem('forage.mode')), null, 'the choice is gone');
  await p.close();
}
