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

  await page.goto(`${s.origin}/settings`);
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

  // …and follows across surfaces (skins ride the shell, not a population)
  await page.goto(`${s.origin}/about`);
  await page.waitForSelector('.masthead');
  assert.match(await fontOf(), /mono/i, 'the BBS skin dresses every surface');

  // back to default: the look is exactly today's (no sheet at all)
  await page.goto(`${s.origin}/settings`);
  await page.waitForSelector('text=Skin');
  await page.locator('.field-row:has-text("Skin") select').selectOption('default');
  await page.waitForFunction(() => !document.getElementById('skin-sheet'));
  assert.equal(await fontOf(), before, 'default restores the exact original font stack');

  // 3o: Settings answers "which build am I looking at?"
  await page.waitForSelector('[data-version]');
  await page.waitForFunction(() => document.querySelector('[data-version]')?.getAttribute('data-version') !== 'pending',
    null, { timeout: 10000 });
  const vtext = await page.locator('[data-version]').innerText();
  assert.match(vtext, /forage-v\d+/, `the version row names a build: ${vtext}`);

  assert.deepEqual(await s.shimMisses(), [], 'skins are pure CSS — no network');
  await s.close();

  // --- 1D: the skin must be applied BEFORE first paint -------------------
  // Under the old model the boot script set an attribute, which is synchronous.
  // A skin is a <link>, so if js/skins.js were left to inject it, every
  // non-default skin would paint the light palette first and flash.
  //
  // The decisive test: block js/main.js entirely. No module runs. If the skin
  // still applies, only the inline <head> script can have done it — which is
  // exactly the pre-paint guarantee. A flash is otherwise near-impossible to
  // assert, since it lives between two paints.
  const boot = await scenario('seeded', {
    initScripts: ["try { localStorage.setItem('forage.skin', 'bbs'); } catch {}"],
  });
  try {
    await boot.page.route('**/js/main.js', (r) => r.abort());
    await boot.page.goto(`${boot.origin}/settings`);
    await boot.page.waitForSelector('link#skin-sheet', { state: 'attached' });

    assert.equal(await boot.page.locator('link#skin-sheet').count(), 1,
      'exactly one skin sheet — apply() must ADOPT the boot script\'s element, not add a second');

    const bootFont = await boot.page.evaluate(() => getComputedStyle(document.body).fontFamily);
    assert.match(bootFont, /mono/i,
      'the skin applied with js/main.js blocked, so the inline boot script injected it pre-paint');
  } finally {
    await boot.close();
  }
}
