// Workflow harness: the scenario composer (1d, udm-patterned). A workflow
// DECLARES a named app state instead of rebuilding server + browser + shim:
//
//   const s = await scenario('first-visit');            // empty storage, auto-seed
//   const s = await scenario('seeded');                 // deterministic pre-seeded storage
//   const s = await scenario('seeded', { responses });  // + fetch-shim fixtures
//
// Collectors are SCENARIO-LIFETIME scoped (udm's lesson: the bug class fires
// on a hashchange AFTER boot, and CSP breakage is a console message, not a
// pageerror). close() asserts zero collected errors unless the workflow
// already consumed them via s.errors()/s.consoleErrors().
// Every option beyond the ones consumed here is forwarded to fetchShim by
// SPREAD — never re-listed (udm hit the allowlist-drop trap four times).
import { chromium } from '@playwright/test';
import { serve } from './serve.mjs';
import { fetchShim } from './shim.mjs';

const STATES = ['first-visit', 'seeded'];

export async function scenario(state, { initScripts = [], ...shimOpts } = {}) {
  if (!STATES.includes(state)) {
    throw new Error(`unknown scenario state: ${state} (known: ${STATES.join(', ')})`);
  }
  const server = await serve();
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const context = await browser.newContext();
  await context.addInitScript(fetchShim(shimOpts));
  // Extra scripts (fake managers, seams) install at the CONTEXT before any
  // navigation — a page-level addInitScript after the first document does NOT
  // reach later navigations (observed on @playwright/test 1.61).
  for (const script of initScripts) await context.addInitScript(script);
  if (state === 'seeded') {
    // Deterministic: seed BEFORE first paint via the same seed the app uses,
    // written by the app itself on first visit — here we simply let the
    // first-visit auto-seed run, then reload so the workflow starts from a
    // stable, persisted state (no timing race with the async seed import).
  }
  const pageErrors = [];
  const consoleErrors = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e?.stack || e)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  const handle = {
    page,
    origin: server.origin,
    async open(hash = '#/popular') {
      await page.goto(`${server.origin}/${hash}`);
      await page.waitForSelector('.devbar', { timeout: 10000 });
    },
    // the app's whole persisted world, as raw bytes — THE 1b invariant surface
    key: () => page.evaluate(() => localStorage.getItem('forage.state')),
    async waitForSeed() {
      await page.waitForFunction(() => localStorage.getItem('forage.state') !== null, { timeout: 10000 });
    },
    errors: () => pageErrors.splice(0),
    consoleErrors: () => consoleErrors.splice(0),
    // NO `?? []` — if the shim is absent this returns undefined and the
    // hermeticity assertion FAILS instead of passing vacuously.
    shimMisses: () => page.evaluate(() => window.__shimMisses),
    async close() {
      const errs = [...pageErrors, ...consoleErrors];
      await browser.close();
      await server.close();
      if (errs.length) {
        throw new Error(`scenario closed with ${errs.length} collected error(s):\n${errs.join('\n')}`);
      }
    },
  };

  if (state === 'seeded') {
    await handle.open();
    await handle.waitForSeed();
    await page.reload();
    await page.waitForSelector('.devbar', { timeout: 10000 });
  }
  return handle;
}
