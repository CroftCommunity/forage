// W4 — the skins journey (4a/4b): pick a skin in Settings, it applies
// instantly, persists across reload, follows you across modes/views, and
// default restores today's look exactly (no link element at all).
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

export async function run() {
  const s = await scenario('seeded', { responses: { 'getTrendingTopics': { topics: [] } } });
  const { page } = s;

  const fontOf = () => page.evaluate(() => getComputedStyle(document.body).fontFamily);
  const linkCount = () => page.locator('link#skin-sheet').count();

  await page.goto(`${s.origin}/#/settings`);
  await page.waitForSelector('text=Skin');
  const before = await fontOf();
  assert.equal(await linkCount(), 0, 'default = no skin sheet');

  // pick the BBS skin — the terminal takes over
  await page.locator('.field-row:has-text("Skin") select').selectOption('bbs');
  await page.waitForFunction(() => document.getElementById('skin-sheet'));
  await page.waitForFunction((prev) => getComputedStyle(document.body).fontFamily !== prev, before);
  assert.match(await fontOf(), /mono/i, 'the BBS skin is monospace');

  // it persists across reload…
  await page.reload();
  await page.waitForSelector('.devbar');
  assert.match(await fontOf(), /mono/i, 'the skin survives reload (device-local)');

  // …and follows into the Bluesky view (skins × modes are independent axes)
  await page.goto(`${s.origin}/#/lens`);
  await page.waitForSelector('text=The Lens');
  assert.match(await fontOf(), /mono/i, 'the BBS skin dresses the Bluesky view too');

  // back to default: the look is exactly today's (no sheet at all)
  await page.goto(`${s.origin}/#/settings`);
  await page.waitForSelector('text=Skin');
  await page.locator('.field-row:has-text("Skin") select').selectOption('default');
  await page.waitForFunction(() => !document.getElementById('skin-sheet'));
  assert.equal(await fontOf(), before, 'default restores the exact original font stack');

  assert.deepEqual(await s.shimMisses(), [], 'skins are pure CSS — no network');
  await s.close();
}
