// W5 — accessibility, per skin.
//
// WHY THIS EXISTS, stated plainly because it was learned the hard way: the unit
// suite checks the token PAIRS someone thought to enumerate (a dark skin's
// --text on its --bg). A skin sets colours; the browser renders combinations
// nobody enumerated — muted text on an even row, a nav link on the nav strip,
// the wordmark on a filled band. Those are the ones that break.
//
// When this was first run against the shipped skins it found 28 violations
// across two of them, including three classes no token test could have caught:
//
//   - `usenet` was rendering its DARK palette while registered as light. Its
//     old `:root:not([data-theme="light"])` block began matching
//     unconditionally when the theme axis retired. The 1F contrast invariant
//     skipped it precisely BECAUSE it was declared light — the suite was green
//     against the declaration, and the declaration was the thing that was wrong.
//   - `phpbb` carried prosilver's band #4688CE, which is 3.70:1 under white.
//     That clears the 3.0 bar for large/bold UI, but the masthead nav links on
//     it are normal 14px text, where 4.5 applies. The threshold was right; the
//     role it was applied to was wrong.
//   - `.wordmark` used --brand, so ANY skin filling the band broke the site
//     name (1.38:1). That is a gap in the chrome vocabulary, not a colour
//     choice, and it is why --band-brand exists.
//
// Hermetic: the shim-backed harness, no network, safe for push CI.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { SKINS } from '../js/skins.js';
import axePkg from '@axe-core/playwright';

const AxeBuilder = axePkg.default ?? axePkg;

// Surfaces chosen for DENSITY of distinct component/background pairings rather
// than for importance: the feed is where rows, chips, meta, tabs and the band
// all meet, which is where combinations go wrong.
// Two passes, because surface violations and skin violations are different
// animals. A markup defect (an unnamed link, a missing label) lives on ONE
// surface and shows in every skin; a palette defect shows on every surface in
// ONE skin. Scanning the cross product is 7 x 16 axe runs for no extra signal.
//
// So: EVERY surface on the default skin, and every skin on a representative
// few. The gap this closes was found by a peer's live audit — the tier scanned
// three surfaces while croft-pwa/docs/ACCESSIBILITY.md says every page, and two
// SERIOUS violations sat on /u/:handle, gate-blocking under this workflow's own
// filter and green only because the surface was never loaded. Which is the
// failure this whole suite exists to prevent, committed by the suite itself.
const SURFACES = ['/popular', '/settings'];

// Every route reachable without credentials, in the population that owns it.
// Probed 2026-08-26: all of these render under the hermetic harness.
const MEMORY_SWEEP = [
  '/popular', '/home', '/all', '/settings', '/frontiers', '/about',
  '/f/gardening', '/h/harvest', '/u/sage', '/search?q=compost',
  '/saved', '/notifications',
];
const LENS_SWEEP = ['/', '/feeds', '/me', '/mode', '/u/sage.bsky.social', '/h/harvest'];

// A seat, for the surfaces that only exist for someone logged in.
const SWEEP_PERSONA = 'u_fern';

// The memory surfaces above are NOT what a first-time visitor sees. Production
// defaults to the Bluesky lens view at `/`, and scanning only the memory
// population left that surface unscanned — a live scan after deploy found a
// contrast failure there that this suite had called clean. Same population
// split the app takes seriously everywhere else; the a11y tier has to take it
// seriously too.
const LENS_SURFACES = ['/'];

// No rules are excluded. `link-in-text-block` used to be, with a note that it
// failed on the DEFAULT skin (2.32:1) because Forage sets
// `a { text-decoration: none }` app-wide — a product styling decision rather
// than a skin defect. The owner made that call on 2026-08-26: underline links
// in prose. css/app.css now does, the exclusion is gone, and the rule is
// enforced for every skin like any other.
const EXCLUDED_RULES = [];

export async function run() {
  const failures = [];

  // ONE browser per population, not one per skin. This used to open a fresh
  // scenario for each of the seven skins in each of two populations — fourteen
  // chromium launches and fourteen servers, before the next workflow in the
  // sequential runner even started. The skin is applied by the pre-paint boot
  // script from localStorage, so switching it is a setItem plus a reload, which
  // exercises exactly the same path a returning visitor takes.
  const populations = [
    { name: 'memory', state: 'seeded', mode: undefined, paths: SURFACES },
    { name: 'lens', state: 'first-visit', mode: 'bluesky', paths: LENS_SURFACES },
  ];

  for (const pop of populations) {
    const s = await scenario(pop.state, pop.mode ? { mode: pop.mode } : {});
    try {
      for (const id of Object.keys(SKINS)) {
        for (const path of pop.paths) {
          await s.page.goto(`${s.origin}${path}`);
          await s.page.evaluate((skin) => localStorage.setItem('forage.skin', skin), id);
          await s.page.reload();
          await s.page.waitForSelector('.masthead');
          // Non-default skins load a sheet; wait for it, or axe measures the
          // unskinned page and reports a pass belonging to another palette.
          if (SKINS[id].file) await s.page.waitForSelector('link#skin-sheet', { state: 'attached' });

          const res = await new AxeBuilder({ page: s.page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

          for (const v of res.violations) {
            if (EXCLUDED_RULES.includes(v.id)) continue;
            for (const node of v.nodes) {
              failures.push(`${id} (${pop.name}) ${path}  ${v.id}  ${node.target.join(' ')}\n      ` +
                (node.any?.[0]?.message ?? v.help).replace(/\s+/g, ' ').slice(0, 150));
            }
          }
        }
      }
    } finally {
      await s.close();
    }
  }

  // ---- the surface sweep: every page, one skin ------------------------
  const sweep = async (label, state, opts, paths, persona) => {
    const s = await scenario(state, opts);
    try {
      if (persona) {
        await s.page.goto(`${s.origin}/popular`);
        await s.page.waitForSelector('.devbar');
        await s.page.locator('.devbar select[title="Active persona"]').selectOption(persona);
        await s.page.waitForFunction(() => !!document.querySelector('.masthead .who a[href^="/u/"]'));
      }
      for (const path of paths) {
        await s.page.goto(`${s.origin}${path}`);
        await s.page.waitForSelector('.masthead');
        const res = await new AxeBuilder({ page: s.page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        for (const v of res.violations) {
          if (EXCLUDED_RULES.includes(v.id)) continue;
          for (const node of v.nodes) {
            failures.push(`${label} ${path}  ${v.id}  ${node.target.join(' ')}\n      ` +
              (node.any?.[0]?.message ?? v.help).replace(/\s+/g, ' ').slice(0, 150));
          }
        }
      }
    } finally {
      await s.close();
    }
  };

  await sweep('sweep(memory)', 'seeded', {}, MEMORY_SWEEP, SWEEP_PERSONA);
  await sweep('sweep(lens)', 'first-visit', { mode: 'bluesky' }, LENS_SWEEP);

  assert.deepEqual(failures, [],
    `axe found ${failures.length} accessibility violation(s):\n  ${failures.join('\n  ')}`);
}
