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

  // --- native chrome follows the palette (1B) --------------------------
  // color-scheme drives scrollbars, form controls and the caret. It is a real
  // CSS property, so skinScan rejects it and no skin could set it directly —
  // it is routed through --color-scheme. If that routing breaks, a dark skin
  // renders with light scrollbars, which no token assertion would notice.
  const chrome = await scenario('seeded');
  try {
    const schemeOf = () => chrome.page.evaluate(() =>
      getComputedStyle(document.documentElement).colorScheme);

    await chrome.page.goto(`${chrome.origin}/settings`);
    await chrome.page.waitForSelector('text=Skin');
    assert.match(await schemeOf(), /light/, 'the light default declares light native chrome');

    await chrome.page.locator('.field-row:has-text("Skin") select').selectOption('forage-dark');
    await chrome.page.waitForFunction(() =>
      getComputedStyle(document.documentElement).colorScheme.includes('dark'));
    assert.match(await schemeOf(), /dark/, 'forage-dark drives native chrome dark, not just tokens');

    // and the palette itself actually moved, not only the scheme keyword
    const darkBg = await chrome.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.notEqual(darkBg, 'rgb(248, 244, 236)', 'the dark skin repainted the page ground');

    await chrome.page.reload();
    await chrome.page.waitForSelector('.devbar');
    assert.match(await schemeOf(), /dark/, 'native chrome survives reload with the skin');
  } finally {
    await chrome.close();
  }

  // --- the skin must be applied BEFORE first paint (1D) -----------------
  // Under the old model the boot script set an attribute, which is synchronous.
  // A skin is a <link>, so if js/skins.js were left to inject it, every
  // non-default skin would paint the light palette first and flash.
  //
  // A flash lives between two paints and cannot be asserted directly. Instead:
  // block js/main.js so NO module runs. If the skin still applies, only the
  // inline <head> script can have done it — which is the pre-paint guarantee.
  //
  // Three things this needs, all learned by mutation (2026-08-26). Without any
  // one of them the test passes with the boot script deleted:
  //   1. Service-worker registration must be neutralised — the SW serves
  //      /js/main.js from its SHELL cache, so network interception alone does
  //      not stop the module. STUB it rather than delete it: main.js calls
  //      navigator.serviceWorker.register() and would throw during setup.
  //   2. The block must itself be asserted (nothing renders). Otherwise the
  //      day routing silently stops working, this keeps passing proving nothing.
  //   3. BOTH entry documents must be covered. `/` is index.html; every clean
  //      path is served by 404.html. Testing one leaves the other's boot script
  //      free to be deleted with the suite still green — observed exactly.
  for (const [path, page_] of [['/', 'index.html'], ['/settings', '404.html']]) {
    const boot = await scenario('seeded', {
      initScripts: [
        "try { localStorage.setItem('forage.skin', 'bbs'); } catch {}",
        "try { Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => ({ register: () => new Promise(() => {}), addEventListener() {}, controller: null, ready: new Promise(() => {}) }) }); } catch (e) {}",
      ],
    });
    try {
      await boot.page.context().route((u) => u.pathname.endsWith('/js/main.js'), (r) => r.abort());
      await boot.page.goto(`${boot.origin}${path}`);
      await boot.page.waitForSelector('link#skin-sheet', { state: 'attached' });

      assert.equal(
        await boot.page.evaluate(() => document.getElementById('app')?.children.length ?? -1), 0,
        `${page_}: js/main.js must ACTUALLY be blocked, or this measures the module not the boot script`);

      assert.equal(await boot.page.locator('link#skin-sheet').count(), 1,
        `${page_}: exactly one skin sheet — apply() must ADOPT the boot element, never add a second`);

      assert.match(
        await boot.page.evaluate(() => getComputedStyle(document.body).fontFamily), /mono/i,
        `${page_}: the skin applied with every module blocked, so <head> injected it pre-paint`);

      const noise = boot.consoleErrors();
      assert.ok(noise.every((m) => /Failed to load resource|ERR_FAILED/.test(m)),
        `${page_}: unexpected console errors while blocking main.js: ${noise.join('; ')}`);
    } finally {
      await boot.close();
    }
  }
}
