// W4 — the skins journey (4a/4b): pick a style in Settings, it applies
// instantly, persists across reload, follows you across modes/views, and
// Forage-in-light restores today's look exactly (no link element at all).
//
// REWORKED for the family-shaped picker (plan 2026-08-26-2 Phase 1). The select
// now carries FAMILY ids, and the two namespaces overlap: `bbs`, `usenet` and
// `phpbb` are each a skin id AND a family id. So `selectOption('bbs')` passed
// before this change and passes after it FOR A DIFFERENT REASON — which is
// exactly the shape of assertion that survives a rewrite while proving nothing.
// Every assertion below reads the resolved `link#skin-sheet` href or the
// computed paint, never the select value — except the one that is deliberately
// about the select value, which is the feature itself.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { FAMILIES, SKINS } from '../js/skins.js';

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

  // Back to Forage — and this is where the family model shows itself. Classic
  // BBS is DARK, so picking Forage from there lands on forage-dark, NOT on the
  // light default: the palette carries across families and the style is what
  // you chose. Under the old flat picker, `selectOption('default')` jumped both
  // axes at once and nobody could see that it had.
  await page.goto(`${s.origin}/settings`);
  await page.waitForSelector('text=Skin');
  await page.locator('.field-row:has-text("Skin") select').selectOption('forage');
  await page.waitForFunction(() =>
    document.getElementById('skin-sheet')?.getAttribute('href')?.includes('forage-dark'));
  assert.equal(await page.evaluate(() => localStorage.getItem('forage.skin')), 'forage-dark',
    'picking a style keeps the palette you were in');

  // and the light side of that same family IS the no-sheet default
  await page.locator('.themetoggle').first().click();
  await page.waitForFunction(() => !document.getElementById('skin-sheet'));
  assert.equal(await fontOf(), before, 'Forage in light restores the exact original font stack');
  assert.equal(await linkCount(), 0, 'and it is still the no-sheet case');

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

    // Dark is reached through the TOGGLE now — `forage-dark` is a skin id and
    // no longer a value this select carries.
    await chrome.page.locator('.themetoggle').first().click();
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

  // --- the picker is FAMILY-shaped (plan 2026-08-26-2 Phase 1) -----------
  // The whole feature in one journey: you choose a STYLE and the ☾/☀ toggle
  // chooses the side, so moving between light and dark no longer costs you your
  // place in the list.
  const fam = await scenario('seeded');
  try {
    const { page } = fam;
    const sel = () => page.locator('.field-row:has-text("Skin") select');
    const sheet = () => page.evaluate(() =>
      document.getElementById('skin-sheet')?.getAttribute('href') ?? null);

    await page.goto(`${fam.origin}/settings`);
    await page.waitForSelector('text=Skin');

    // one row per FAMILY, not one per skin
    const rows = await page.locator('.field-row:has-text("Skin") select option').count();
    assert.equal(rows, Object.keys(FAMILIES).length,
      `the picker lists ${Object.keys(FAMILIES).length} styles, not ${Object.keys(SKINS).length} skins (saw ${rows})`);
    assert.equal(await page.locator('.field-row:has-text("Skin") select optgroup').count(), 0,
      'and it is a flat list — the Light/Dark optgroups were the old shape of this problem');

    // pick a style from LIGHT -> the light member
    await sel().selectOption('usenet');
    await page.waitForFunction(() => document.getElementById('skin-sheet'));
    assert.match(await sheet(), /\/skins\/usenet\.css$/, 'picking Usenet gray in light lands on its light member');

    // toggle -> the dark member, AND THE PICKER STILL READS THE SAME STYLE.
    // That second half is the feature. The first half passed on the old code.
    await page.locator('.themetoggle').first().click();
    await page.waitForFunction(() =>
      document.getElementById('skin-sheet')?.getAttribute('href')?.includes('usenet-dark'));
    assert.match(await sheet(), /\/skins\/usenet-dark\.css$/, 'the toggle moves to the family\'s dark side');
    assert.equal(await sel().inputValue(), 'usenet',
      'and the picker still shows Usenet gray — under the flat list, toggling moved your selection to a different row');

    // pick another style while DARK -> its dark member. Both directions, or a
    // hardcoded palette would pass.
    await sel().selectOption('forage');
    await page.waitForFunction(() =>
      document.getElementById('skin-sheet')?.getAttribute('href')?.includes('forage-dark'));
    assert.equal(await page.evaluate(() => localStorage.getItem('forage.skin')), 'forage-dark',
      'the palette carries ACROSS families — not back to the light default');

    // a sole-palette family says so in its own row, and disables the toggle
    const bbsLabel = await page.locator('.field-row:has-text("Skin") select option[value="bbs"]').innerText();
    assert.match(bbsLabel, /dark only/i, `the row itself says the family ships one palette: ${bbsLabel}`);
    await sel().selectOption('bbs');
    await page.waitForFunction(() =>
      document.getElementById('skin-sheet')?.getAttribute('href')?.includes('bbs'));
    assert.match(await sheet(), /\/skins\/bbs\.css$/, 'Classic BBS resolves to its only member');
    assert.equal(await page.locator('.themetoggle').first().isDisabled(), true,
      'and the toggle has nowhere to go');

    // Choosing it from LIGHT is a legal answer, not a refusal. Getting back to
    // light takes two steps and the reason is the feature working: from a
    // dark-only family the toggle is dead, so you pick a two-sided style first
    // — which keeps you in DARK — and only then can you toggle.
    await sel().selectOption('forage');
    await page.waitForFunction(() =>
      document.getElementById('skin-sheet')?.getAttribute('href')?.includes('forage-dark'));
    await page.locator('.themetoggle').first().click();
    await page.waitForFunction(() => !document.getElementById('skin-sheet'));
    await sel().selectOption('bbs');
    await page.waitForFunction(() => document.getElementById('skin-sheet'));
    assert.match(await sheet(), /\/skins\/bbs\.css$/,
      'picked from LIGHT, a dark-only family still lands on its dark member rather than refusing');

    // Reload: BOTH the style and the palette survive, from one stored id. We
    // are on Classic BBS and therefore in dark, so picking Usenet gray lands on
    // its dark member without touching the toggle — which is the carry-across
    // asserted a third time, from a dark-ONLY origin this time.
    await sel().selectOption('usenet');
    await page.waitForFunction(() =>
      document.getElementById('skin-sheet')?.getAttribute('href')?.includes('usenet-dark'));
    await page.reload();
    await page.waitForSelector('text=Skin');
    assert.match(await sheet(), /\/skins\/usenet-dark\.css$/, 'the palette survives reload');
    assert.equal(await sel().inputValue(), 'usenet', 'and so does the style, from ONE stored key');
    assert.equal(await page.evaluate(() => localStorage.getItem('forage.skin')), 'usenet-dark',
      'one key, still a concrete skin id — the pre-paint boot scripts read this and were not touched');
  } finally {
    await fam.close();
  }

  // --- the toggle swaps to the SIBLING, and says so when there isn't one (1E)
  // The collapse's whole user-facing bargain: light/dark stops being a second
  // axis, so the upper-right control now moves between a skin and its paired
  // opposite. On a skin that ships one palette there is nowhere to go, and the
  // control must LOOK unavailable rather than sit there doing nothing — a dead
  // button is the failure this asserts against.
  const tog = await scenario('seeded');
  try {
    const { page } = tog;
    const toggle = () => page.locator('.themetoggle').first();
    const bgOf = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const schemeOf = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

    await page.goto(`${tog.origin}/popular`);
    await page.waitForSelector('.masthead');
    const lightBg = await bgOf();
    assert.match(await schemeOf(), /light/, 'starts on the light default');
    assert.equal(await toggle().isDisabled(), false, 'the light default HAS a sibling, so the toggle is live');

    // light -> dark, through the pairing
    await toggle().click();
    await page.waitForFunction(() =>
      getComputedStyle(document.documentElement).colorScheme.includes('dark'));
    assert.notEqual(await bgOf(), lightBg, 'the toggle actually repainted the page');
    assert.equal(await page.evaluate(() => localStorage.getItem('forage.skin')), 'forage-dark',
      'the toggle records a SKIN choice — one key, not a second theme axis');

    // and it survives reload, because it is an ordinary skin preference
    await page.reload();
    await page.waitForSelector('.masthead');
    assert.match(await schemeOf(), /dark/, 'the toggled palette persists like any skin');

    // dark -> light, back through the same pairing
    await toggle().click();
    await page.waitForFunction(() =>
      getComputedStyle(document.documentElement).colorScheme.includes('light'));
    assert.equal(await bgOf(), lightBg, 'toggling back restores the exact light ground');

    // a single-palette skin has nowhere to toggle to, and shows it
    await page.goto(`${tog.origin}/settings`);
    await page.waitForSelector('text=Skin');
    await page.locator('.field-row:has-text("Skin") select').selectOption('bbs');
    await page.waitForFunction(() => document.getElementById('skin-sheet'));
    assert.equal(await toggle().isDisabled(), true,
      'bbs ships one palette — the toggle must read as unavailable, not merely inert');
    const title = await toggle().getAttribute('title');
    assert.match(title ?? '', /one palette/i, `the disabled toggle explains itself: ${title}`);
  } finally {
    await tog.close();
  }

  // --- the chrome vocabulary must be INERT by default (Phase 2) ----------
  // 15 new tokens now sit between app.css and every rule that paints chrome.
  // Each default is a passthrough to what the rule used before, so the default
  // skin has to render exactly as it did. Unit tests can check the declared
  // strings; only a browser can confirm the CASCADE actually resolves to the
  // same paint. A wrong passthrough is a site-wide visual regression that no
  // token assertion would catch.
  const inert = await scenario('seeded');
  try {
    const { page } = inert;
    await page.goto(`${inert.origin}/popular`);
    await page.waitForSelector('.masthead');

    const seen = await page.evaluate(() => {
      const cs = (sel) => {
        const n = document.querySelector(sel);
        return n ? getComputedStyle(n) : null;
      };
      const mast = cs('.masthead');
      const card = cs('.card');
      const row = cs('.postrow');
      const tabs = cs('.tabs');
      return {
        mastBg: mast?.backgroundColor ?? null,
        cardBg: card?.backgroundColor ?? null,
        cardShadow: card?.boxShadow ?? null,
        rowBg: row?.backgroundColor ?? null,
        tabsBg: tabs?.backgroundColor ?? null,
      };
    });

    assert.equal(seen.mastBg, seen.cardBg,
      '--band-fill must resolve to the card surface, as the masthead used directly before');
    assert.equal(seen.cardShadow, 'none', '--card-shadow must be flat by default; bevels are a skin choice');
    assert.equal(seen.rowBg, 'rgba(0, 0, 0, 0)', '--row-odd/--row-even must be transparent: rows are unstriped by default');
    if (seen.tabsBg !== null) {
      assert.equal(seen.tabsBg, 'rgba(0, 0, 0, 0)', '--nav-fill must be transparent by default');
    }

    // …and a skin must be able to move every one of them. This is the other
    // half: a token that is inert by default AND unreachable by a skin would
    // pass the assertions above while being useless.
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.textContent = ':root{--band-fill:#123456;--row-odd:#654321;--card-shadow:inset 0 0 0 2px #abcdef;}';
      document.head.append(st);
    });
    const moved = await page.evaluate(() => ({
      mastBg: getComputedStyle(document.querySelector('.masthead')).backgroundColor,
      rowBg: getComputedStyle(document.querySelector('.postrow')).backgroundColor,
      cardShadow: getComputedStyle(document.querySelector('.card')).boxShadow,
    }));
    assert.equal(moved.mastBg, 'rgb(18, 52, 86)', 'a skin can repaint the band');
    assert.equal(moved.rowBg, 'rgb(101, 67, 33)', 'a skin can stripe the rows');
    assert.match(moved.cardShadow, /inset/, 'a skin can bevel the surfaces');
  } finally {
    await inert.close();
  }

  // --- the phpBB skin actually looks like a board (3A) -------------------
  // The chrome vocabulary exists so a skin can express a FORUM, not just
  // recolour Forage. This asserts the things that make it read as phpBB:
  // a filled category band, striped rows, and square corners — none of which
  // any skin could reach before Phase 2.
  const board = await scenario('seeded');
  try {
    const { page } = board;
    await page.goto(`${board.origin}/settings`);
    await page.waitForSelector('text=Skin');
    await page.locator('.field-row:has-text("Skin") select').selectOption('phpbb');
    await page.waitForFunction(() =>
      document.getElementById('skin-sheet')?.getAttribute('href')?.includes('phpbb'));

    await page.goto(`${board.origin}/popular`);
    await page.waitForSelector('.postrow');

    const look = await page.evaluate(() => {
      const g = (sel, prop) => {
        const n = document.querySelector(sel);
        return n ? getComputedStyle(n)[prop] : null;
      };
      const rows = [...document.querySelectorAll('.postrow')].slice(0, 2)
        .map((n) => getComputedStyle(n).backgroundColor);
      return {
        band: g('.masthead', 'backgroundColor'),
        cardRadius: g('.card', 'borderRadius'),
        font: g('body', 'fontFamily'),
        link: g('.postmeta .domain', 'color') ?? g('a', 'color'),
        rows,
      };
    });

    assert.equal(look.band, 'rgb(58, 120, 188)', 'the category band carries the AA-corrected board blue #3A78BC');
    assert.equal(look.cardRadius, '0px', 'a board has corners — the radii tokenised in Phase 2 are squared');
    assert.match(look.font, /Lucida Grande|Verdana/, 'the subsilver2 font stack');
    assert.equal(look.rows[0], 'rgb(236, 236, 236)', 'odd rows carry subsilver2 .row1 #ECECEC');
    if (look.rows[1]) {
      assert.equal(look.rows[1], 'rgb(220, 225, 229)', 'even rows carry subsilver2 .row2 #DCE1E5');
    }

    // 3B gave phpbb a sibling, so the toggle is live here and moves between
    // two BOARDS — not between a board and Forage's own dark palette. That is
    // the whole point of pairing: the toggle changes palette, never identity.
    const tgl = page.locator('.themetoggle').first();
    assert.equal(await tgl.isDisabled(), false, 'phpbb now has a dark sibling');
    await tgl.click();
    // Wait on the COMPUTED value, not the href: the attribute flips
    // immediately but the sheet still has to load and apply.
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector('.masthead')).backgroundColor === 'rgb(42, 87, 136)');
    const dark = await page.evaluate(() => ({
      band: getComputedStyle(document.querySelector('.masthead')).backgroundColor,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      radius: getComputedStyle(document.querySelector('.card')).borderRadius,
    }));
    assert.equal(dark.band, 'rgb(42, 87, 136)', 'the dark board keeps a filled band, in its own blue');
    assert.match(dark.scheme, /dark/, 'native chrome follows the dark board');
    assert.equal(dark.radius, '0px', 'still a board: square corners survive the palette swap');

    await page.locator('.themetoggle').first().click();
    await page.waitForFunction(() =>
      getComputedStyle(document.querySelector('.masthead')).backgroundColor === 'rgb(58, 120, 188)');
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.querySelector('.masthead')).backgroundColor),
      'rgb(58, 120, 188)', 'and back to the light board, not to Forage');
  } finally {
    await board.close();
  }

  // --- a skin rides the SHELL, not a population (Phase 5) ----------------
  // Skins and modes are independent axes (4a, user 2026-08-25): any skin in any
  // mode. The phpBB board dressing the Bluesky view is legal — off-theme, but
  // legal — and this pins that so a future mode change cannot quietly couple
  // the two. It is the assertion that would fail if someone made a skin
  // mode-scoped as a "fix".
  const across = await scenario('first-visit', {
    mode: 'bluesky',
    initScripts: ["try { localStorage.setItem('forage.skin', 'phpbb'); } catch {}"],
  });
  try {
    await across.page.goto(`${across.origin}/`);
    await across.page.waitForSelector('.masthead');
    assert.equal(
      await across.page.evaluate(() => getComputedStyle(document.querySelector('.masthead')).backgroundColor),
      'rgb(58, 120, 188)', 'the phpBB band dresses the Bluesky view too — skins ride the shell');
    assert.equal(
      await across.page.evaluate(() => localStorage.getItem('forage.mode')), 'bluesky',
      'and the mode is genuinely the other one, not a silent fallback to memory');
  } finally {
    await across.close();
  }
}
