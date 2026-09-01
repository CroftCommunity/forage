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

// ---- failure diagnostics ------------------------------------------------
// A workflow that dies mid-run throws before its finally block, so by the time
// the runner prints the stack, the scenario is gone and with it every clue.
// Live scenarios register here and the runner asks them what was outstanding.
//
// Written for a specific unsolved failure: twice in a session, a `page.goto`
// against this harness's own localhost server timed out waiting for `load` —
// once in signin, once in bluesky-view. It reproduces at roughly 1 in 8 full
// suite runs, never in 72 isolated navigations, and never under six
// deliberately concurrent suite runs. Two hypotheses (a fixed sleep before a
// no-op assertion; machine contention) were proposed and both were refuted by
// measurement. What was missing was never a theory — it was the state at the
// moment it hung. This captures that, so the next occurrence is evidence.
const LIVE = new Set();

export async function diagnoseLive() {
  if (!LIVE.size) return '';
  const out = [];
  for (const s of LIVE) {
    const pend = [...s.pending.values()];
    out.push(`  scenario diagnostics (${s.state}${s.presentation ? `/${s.presentation}` : ''}) @ ${s.origin}`);
    out.push(`    url: ${(() => { try { return s.page.url(); } catch { return '(page gone)'; } })()}`);
    out.push(`    outstanding requests (${pend.length}):`);
    for (const u of pend.slice(0, 12)) out.push(`      ${u.replace(s.origin, '')}`);
    if (pend.length > 12) out.push(`      … ${pend.length - 12} more`);
    // The service worker is the prime suspect this exists to convict or clear:
    // sw.js calls skipWaiting() + clients.claim(), and install runs
    // cache.addAll over the whole SHELL. A worker taking over mid-navigation is
    // exactly the kind of event a wait cannot see coming.
    try {
      const sw = await Promise.race([
        s.page.evaluate(async () => {
          const reg = await navigator.serviceWorker?.getRegistration?.();
          return {
            controlled: !!navigator.serviceWorker?.controller,
            installing: !!reg?.installing, waiting: !!reg?.waiting, active: !!reg?.active,
            readyState: document.readyState,
          };
        }),
        new Promise((r) => setTimeout(() => r('(evaluate timed out — page is wedged)'), 3000)),
      ]);
      out.push(`    service worker: ${typeof sw === 'string' ? sw : JSON.stringify(sw)}`);
    } catch (e) {
      out.push(`    service worker: (unavailable: ${String(e.message).slice(0, 60)})`);
    }
  }
  return out.join('\n');
}

export async function scenario(state, { initScripts = [], mode, root, ...shimOpts } = {}) {
  if (!STATES.includes(state)) {
    throw new Error(`unknown scenario state: ${state} (known: ${STATES.join(', ')})`);
  }
  // 3h: the presentation mode is a declared part of the scenario. 'seeded'
  // implies the memory population (seeding only happens there); 'first-visit'
  // defaults to the domain default (bluesky) unless the workflow says.
  const presentation = mode ?? (state === 'seeded' ? 'memory' : null);
  if (presentation) initScripts = [`try { localStorage.setItem('forage.mode', '${presentation}'); } catch {}`, ...initScripts];
  const server = await serve({ root }); // root: another checkout to serve (mock-snaps' CURRENT capture)
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
  // ---- the network fence (2026-09-01) --------------------------------------
  // e2e/harness/shim.mjs fences window.fetch. Nothing fenced the rest: an
  // <img>, a <video>'s playlist, an <iframe>, a stylesheet or a font all load
  // straight past it, so a "hermetic" workflow really did reach the network.
  //
  // Found through a flake — mock-board.workflow.mjs failed ~1 run in 5 on
  // `net::ERR_NAME_NOT_RESOLVED` for https://video.cdn.test/clip/playlist.m3u8,
  // the fixture's own video, whose Play press is a deliberate assertion. The
  // host is RFC 2606 reserved so it never resolves, which was the intent; but
  // the browser still asked, and whether the resolver's refusal arrived before
  // close() decided the run. The flake was the cheap half of the bug. The other
  // half: a resolver that ANSWERS — a captive portal, a wildcard DNS provider,
  // an ISP that hijacks unknown names (this laptop's does) — would have served
  // real bytes into a test that reports itself hermetic.
  //
  // So every request is routed and anything off the harness's own origin is
  // refused HERE, before it becomes a DNS lookup, and recorded so it can be
  // asserted on rather than merely not happening. Aborting would reproduce the
  // same console error; an empty 200 is silent and is what a fenced host should
  // look like from inside the page. No live workflow uses this harness (all
  // four LIVE=1 ones drive the network directly), so nothing legitimate loses
  // its network here.
  const blockedExternals = [];
  await context.route('**/*', async (route, request) => {
    const url = request.url();
    if (url.startsWith(server.origin) || /^(data|blob|about):/.test(url)) return route.continue();
    blockedExternals.push(url);
    await route.fulfill({ status: 204, body: '', headers: { 'content-type': 'text/plain' } });
  });
  const page = await context.newPage();
  // Outstanding requests, for diagnoseLive(). A navigation that never fires
  // `load` is almost always one subresource that never settles; naming it is
  // the difference between a diagnosis and another re-run.
  const pending = new Map();
  page.on('request', (r) => pending.set(r, r.url()));
  page.on('requestfinished', (r) => pending.delete(r));
  page.on('requestfailed', (r) => pending.delete(r));
  page.on('pageerror', (e) => pageErrors.push(String(e?.stack || e)));
  // 3n: a clean-path deep link is served by 404.html with a 404 STATUS — that
  // is GitHub Pages' real behavior (the service worker upgrades it to 200 once
  // installed) and the browser logs it as a resource error. Track those exact
  // responses so their console noise can be ignored; ASSET 404s still fail the
  // scenario, which is the case worth catching.
  let shellFallbacks = 0;
  page.on('response', (r) => {
    if (r.status() !== 404) return;
    const p = new URL(r.url()).pathname;
    if (r.url().startsWith(server.origin) && !/\.[a-z0-9]+$/i.test(p)) shellFallbacks++;
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text()) && shellFallbacks > 0) { shellFallbacks--; return; }
    consoleErrors.push(m.text());
  });

  const diag = { page, pending, origin: server.origin, state, presentation };
  LIVE.add(diag);

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
    // Every request the fence refused. A workflow can assert on what the page
    // TRIED to fetch from the network — which is a stronger statement than
    // "no error was logged", and the reason the fence records instead of
    // silently dropping.
    blockedExternals: () => [...blockedExternals],
    async close() {
      LIVE.delete(diag);
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
