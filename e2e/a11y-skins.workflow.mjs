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
const SURFACES = ['/popular', '/settings'];

export async function run() {
  const failures = [];

  for (const id of Object.keys(SKINS)) {
    const s = await scenario('seeded', {
      initScripts: [`try { localStorage.setItem('forage.skin', ${JSON.stringify(id)}); } catch {}`],
    });
    try {
      for (const path of SURFACES) {
        await s.page.goto(`${s.origin}${path}`);
        await s.page.waitForSelector('.masthead');
        // The skin sheet is injected pre-paint for non-default skins; wait for
        // it so axe never measures the unskinned page and reports a pass that
        // belongs to a different palette.
        if (SKINS[id].file) await s.page.waitForSelector('link#skin-sheet', { state: 'attached' });

        const res = await new AxeBuilder({ page: s.page })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze();

        for (const v of res.violations) {
          for (const node of v.nodes) {
            failures.push(`${id} ${path}  ${v.id}  ${node.target.join(' ')}\n      ` +
              (node.any?.[0]?.message ?? v.help).replace(/\s+/g, ' ').slice(0, 150));
          }
        }
      }
    } finally {
      await s.close();
    }
  }

  assert.deepEqual(failures, [],
    `axe found ${failures.length} accessibility violation(s):\n  ${failures.join('\n  ')}`);
}
