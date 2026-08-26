// W1 — the mode round-trip journey (1b/1c behavior at the workflow level):
// a seeded memory world enters the RAM-only bbs mode, the controls pin, the
// persisted world never moves a byte, and exit restores everything.
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
}
