// W21 — the ⋯ menu (plan 2026-08-29-plan-post-and-thread, Phase 3, decisions 3+4).
//
// One menu for a post row, a thread head and a comment: groups separated by
// rules, no headings, no submenus, destructive last. A popover on desktop and
// a bottom sheet on a phone — ONE <dialog>, positioned by CSS, the authsheet's
// pattern (lens-views.js). What a persona sees is the guest-surface rule read
// correctly: only items they can USE, never a disabled row.
//
// Counts are exact on purpose. "Contains Copy link" passes against a menu that
// also shows a guest a Save it cannot perform.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

// the label is the first span; a trailing icon is decorative and not part of the name
const labels = (page) => page.$$eval('[role="menu"] [role="menuitem"]', (els) => els.map((e) => e.querySelector('span').textContent.trim()));
const menus = (page) => page.locator('[role="menu"]').count();
const seps = (page) => page.locator('[role="menu"] .msep').count();

async function openFirst(page, scope) {
  const kebab = page.locator(`${scope} .byline button.kebab`).first();
  assert.equal(await kebab.count(), 1, `${scope}: the kebab from Phase 1 is there to press`);
  await kebab.click();
  await page.waitForTimeout(150);
  return kebab;
}

async function persona(page, id) {
  await page.locator('.devbar select[title="Active persona"]').selectOption(id);
  await page.waitForTimeout(200);
}

export async function run() {
  const mem = await scenario('seeded');
  try {
    const { page } = mem;
    await page.goto(`${mem.origin}/popular`);
    await page.waitForSelector('.postrow');

    // ---- a guest, on a board row: the two things anyone can do ----
    const rowKebab = await openFirst(page, '.postrow');
    assert.equal(await menus(page), 1, 'pressing ⋯ opens exactly one menu');
    assert.equal(await rowKebab.getAttribute('aria-expanded'), 'true');
    // board-cards decision 8: …plus the one door, behind a rule, saying why
    // the rest is missing. In the sandbox it can only say so (O1: a toast
    // naming the dev bar); on the lens it opens the sign-in sheet.
    assert.deepEqual(await labels(page), ['Copy text', 'Copy link', 'Sign in to like, save and reply'], 'a guest sees what a guest can do, and the door');
    assert.equal(await seps(page), 1, 'two groups: the actions, then the door');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    assert.equal(await menus(page), 0, 'Esc closes it');
    assert.equal(await rowKebab.getAttribute('aria-expanded'), 'false');
    assert.ok(await rowKebab.evaluate((b) => document.activeElement === b), 'focus returns to the kebab');

    // ---- the thread: a guest on a comment ----
    // from gardening, because the steward case below is briar's — a steward
    // of gardening, a plain member anywhere else (/popular mixes feeds)
    await page.goto(`${mem.origin}/f/gardening`);
    await page.waitForSelector('.postrow');
    const threadHref = await page.evaluate(() =>
      [...document.querySelectorAll('.postrow')]
        .filter((r) => !/\b0 comments\b/.test(r.querySelector('.actions a.replies')?.getAttribute('aria-label') || '')) // feed-row v1: the words are the control's name
        .map((r) => r.querySelector('.posttitle a')?.getAttribute('href'))
        .find(Boolean) ?? null);
    assert.ok(threadHref, 'the seeded board offers a thread with replies');
    await page.goto(`${mem.origin}${threadHref}`);
    await page.waitForSelector('.comment');
    await openFirst(page, '.comment');
    assert.deepEqual(await labels(page), ['Copy text', 'Copy link', 'Sign in to like, save and reply']);
    // a second press while open must close, never stack a second menu
    await page.mouse.click(5, 5);
    await page.waitForTimeout(150);
    assert.equal(await menus(page), 0, 'a click outside closes it');

    // ---- a member: Save joins the first group, Report is its own (last) ----
    await persona(page, 'u_fern');
    await page.waitForSelector('.comment');
    const fernKebab = await openFirst(page, '.comment');
    assert.deepEqual(await labels(page), ['Copy text', 'Copy link', 'Save', 'Report']);
    assert.equal(await seps(page), 1, 'two groups, one rule between them');
    await page.locator('[role="menuitem"]', { hasText: 'Save' }).click();
    await page.waitForTimeout(250);
    assert.equal(await menus(page), 0, 'choosing an item closes the menu');
    await fernKebab.click();
    await page.waitForTimeout(150);
    assert.deepEqual(await labels(page), ['Copy text', 'Copy link', 'Unsave', 'Report'], 'Save toggled through the store: it reads Unsave now');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // ---- your own comment: no Report on yourself ----
    // fern writes one through the real composer, so "own" is the store's word
    await page.locator('textarea').first().fill('my own comment, for the menu');
    await page.locator('button', { hasText: /^Comment$/ }).click();
    await page.waitForSelector('.comment:has-text("my own comment, for the menu")');
    const own = page.locator('.comment', { has: page.locator(':scope > .comment-body > .comment-text', { hasText: 'my own comment, for the menu' }) }).first();
    assert.equal(await own.count(), 1, 'the comment fern just wrote is on the page');
    await own.locator(':scope > .comment-body > .byline button.kebab').click();
    await page.waitForTimeout(150);
    assert.deepEqual(await labels(page), ['Copy text', 'Copy link', 'Save'], 'no Report on your own comment');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // ---- a steward: the conditional fourth group, last ----
    await persona(page, 'u_briar');
    await page.waitForSelector('.comment');
    await openFirst(page, '.comment');
    const stew = await labels(page);
    assert.equal(stew.at(-1), 'Remove', `steward items are the last group: ${JSON.stringify(stew)}`);
    // three groups — or two when this first comment happens to be briar's own
    // (no Report on yourself), which the seed makes true on some threads
    assert.equal(await seps(page), stew.includes('Report') ? 2 : 1, `a rule between every group: ${JSON.stringify(stew)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // ---- the phone: a bottom sheet with a scrim and a close button ----
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirst(page, '.comment');
    const sheet = await page.evaluate(() => {
      const m = document.querySelector('[role="menu"]');
      const d = m.closest('dialog') || m;
      const r = d.getBoundingClientRect();
      return { bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width),
        close: !!d.querySelector('.sheet-close'), itemH: Math.round(m.querySelector('[role="menuitem"]').getBoundingClientRect().height) };
    });
    assert.equal(sheet.bottom, 844, `at 390 wide the menu is a sheet anchored to the bottom: ${JSON.stringify(sheet)}`);
    assert.equal(sheet.left, 0);
    assert.equal(sheet.width, 390);
    assert.ok(sheet.close, 'the sheet has a visible Close');
    assert.ok(sheet.itemH >= 44, `sheet items clear the 44px floor: ${sheet.itemH}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    // and one pixel wider than the breakpoint it is a popover again
    await page.setViewportSize({ width: 481, height: 844 });
    await openFirst(page, '.comment');
    const pop = await page.evaluate(() => {
      const d = document.querySelector('[role="menu"]').closest('dialog');
      const r = d.getBoundingClientRect();
      return { bottom: Math.round(r.bottom), width: Math.round(r.width) };
    });
    assert.notEqual(pop.bottom, 844, 'at 481 wide it is a popover, not a sheet');
    assert.ok(pop.width < 400, `a popover is narrower than the page: ${pop.width}`);
    await page.keyboard.press('Escape');

    assert.deepEqual(mem.errors(), []);
  } finally { await mem.close(); }
}
