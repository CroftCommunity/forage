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
const LENS_SWEEP = ['/', '/feeds', '/me', '/mode', '/u/sage.bsky.social', '/h/harvest', '/hashtags'];

// 4i: THE FIXTURE IS THE COVERAGE. Expanding the sweep from 3 surfaces to 16
// found nothing new, and that was not luck — a probe for `a > img` with no text
// across every surface returned zero, because the hermetic fixtures render no
// media at all. Scanning more routes cannot see a code path no fixture
// exercises, and `mediaNode` was that code path: it shipped an unnamed link
// (link-name, SERIOUS) that was live on forage.fyi/u/bsky.app while every
// route in this file was green.
//
// So the lens sweep carries media now. Both shapes that can produce an unnamed
// link are here on purpose:
//   - an EXTERNAL card, whose thumbnail is decorative (alt='') and whose link
//     is named from the card's title
//   - an IMAGE the author never described (alt=''), where the honest name
//     describes what the link DOES, because inventing a description of a
//     picture nobody has described makes a screen reader worse while turning
//     this gate green
const mediaPost = (rkey, embed) => ({ post: {
  uri: `at://did:plc:sage/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`,
  author: { did: 'did:plc:sage', handle: 'sage.bsky.social', displayName: 'Sage' },
  record: { text: `post ${rkey}`, createdAt: '2026-08-26T00:00:00Z' },
  indexedAt: '2026-08-26T00:00:00Z', replyCount: 0, repostCount: 0, likeCount: 1,
  embed,
} });

const MEDIA_FEED = { feed: [
  mediaPost('ext', { $type: 'app.bsky.embed.external#view',
    external: { uri: 'https://example.test/article', title: 'A foraging guide',
      description: 'seasonal', thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } }),
  // An external card with NO title — legal on the wire, and the branch that
  // names the link by its host instead. Without this row that fallback is
  // unexecuted code wearing a passing suite.
  mediaPost('bare', { $type: 'app.bsky.embed.external#view',
    external: { uri: 'https://untitled.test/thing',
      thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } }),
  mediaPost('img', { $type: 'app.bsky.embed.images#view',
    images: [{ thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      fullsize: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: '' }] }),
] };

const LENS_MEDIA = { responses: {
  'getAuthorFeed': MEDIA_FEED,
  'getFeed': MEDIA_FEED,
  'getProfile': { did: 'did:plc:sage', handle: 'sage.bsky.social', displayName: 'Sage' },
  'getTrendingTopics': { topics: [] },
} };

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

// WHAT THIS GATE CANNOT FIND, BY CONSTRUCTION — read this before concluding the
// app is clean because the sweep is green.
//
// Both scans below filter to ['wcag2a', 'wcag2aa']. That is deliberate and
// matches the workspace standard (croft-pwa/docs/ACCESSIBILITY.md: serious and
// critical block, "a gate that fires on cosmetic findings gets muted"). The
// consequence is that every axe rule tagged BEST-PRACTICE is invisible here, no
// matter how many surfaces we add — the coverage axis and the rule axis are
// independent, and only one of them was widened in 2c4b28d.
//
// A live unfiltered scan of the deployed site on 2026-08-26 found three such
// classes that this gate had never reported and never could: no landmarks
// anywhere (js/main.js renders div#main, not <main>; no skip link ->
// landmark-one-main + region on every route), /feeds sort selects labelled by
// `title` alone (label-title-only), and no h1 on the signed-out /h/:tag
// (page-has-heading-one). Whether to adopt any of them is an OWNER decision,
// open as roadmap E145 — not drift, and not something to quietly widen here.
//
// To re-run that audit (it is the only way to see this class):
//   Playwright + @axe-core/playwright against the DEPLOYED origin,
//   serviceWorkers: 'block'      -- so you grade the first-hit DOM, not the
//                                   service-worker-upgraded one a bot never gets
//   AxeBuilder(...).analyze()    -- NO .withTags(), which is the whole point
//   waitUntil: 'networkidle' + ~1200ms settle
//   plus a geometry pass over a/button/input/select/summary/[role=button]
//   for anything under 44px in either dimension (the touch floor).
//
// Re-measure against the CURRENT deployed build every time. A v38 measurement
// does not settle a v40 question, and three of that survey's four findings were
// closed within hours of being reported.

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
    // W12: the host sheet is a MODAL, which is a foreground/background pairing
    // that exists on no other surface and therefore on no other skin's scan.
    // Its ground is --card over a --scrim, and both are new. A palette that
    // reads on a card in the flow of a page is not thereby proven to read on a
    // card floating over a dimmed one, so the sheet is scanned OPEN on every
    // skin, not once on the default.
    { name: 'lens', state: 'first-visit', mode: 'bluesky', paths: LENS_SURFACES, sheet: true },
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

          const scan = async (label) => {
            const res = await new AxeBuilder({ page: s.page })
              .withTags(['wcag2a', 'wcag2aa'])
              .analyze();
            for (const v of res.violations) {
              if (EXCLUDED_RULES.includes(v.id)) continue;
              for (const node of v.nodes) {
                failures.push(`${id} (${pop.name}) ${label}  ${v.id}  ${node.target.join(' ')}\n      ` +
                  (node.any?.[0]?.message ?? v.help).replace(/\s+/g, ' ').slice(0, 150));
              }
            }
          };

          await scan(path);

          if (pop.sheet) {
            await s.page.waitForSelector('[data-open-auth-sheet]');
            await s.page.click('[data-open-auth-sheet]');
            await s.page.waitForSelector('dialog[data-auth-sheet][open]');
            await scan(`${path} (sheet open)`);
            await s.page.evaluate(() => document.querySelector('dialog[data-auth-sheet]')?.close());
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
  await sweep('sweep(lens)', 'first-visit', { mode: 'bluesky', ...LENS_MEDIA }, LENS_SWEEP);

  assert.deepEqual(failures, [],
    `axe found ${failures.length} accessibility violation(s):\n  ${failures.join('\n  ')}`);
}
