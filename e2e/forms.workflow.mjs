// W6 — the write path, end to end, with its accessibility checked in place.
//
// Everything before this scanned READ surfaces. The forms people actually use
// to post — the submit wizard, create-a-feed, feed settings — had no journey
// and no accessibility coverage at all, which is how 14 unlabelled form
// controls sat on them unnoticed.
//
// Two things are asserted together on purpose:
//
//   1. The journey works: a member picks a Feed, writes a post, publishes it,
//      and the post is there.
//   2. Every control on the way is USABLE without sight. A <label> that merely
//      sits next to an input names nothing — a screen reader announces "edit
//      text, blank" and the writer is in an unmarked box.
//
// The label test is deliberately BEHAVIOURAL rather than a markup assertion:
// click the label's text, and the control it names must take focus. That is
// the same association a screen reader reads, expressed as something a person
// can do — and it fails today.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import axePkg from '@axe-core/playwright';

const AxeBuilder = axePkg.default ?? axePkg;

// Sit in a seat that may write. Logged out, every write surface is a gate.
async function takeSeat(page, origin, persona = 'u_fern') {
  await page.goto(`${origin}/popular`);
  await page.waitForSelector('.devbar');
  await page.locator('.devbar select[title="Active persona"]').selectOption(persona);
  await page.waitForFunction(() => !!document.querySelector('.masthead .who a[href^="/u/"]'));
}

// Every labelled control on the page must actually be named by its label.
// Clicking the label is the observable form of that association.
async function assertLabelsName(page, where) {
  const rows = await page.locator('#main .field-row').all();
  const unnamed = [];
  for (const row of rows) {
    const control = row.locator('input:visible, select:visible, textarea:visible').first();
    if (!(await control.count())) continue; // a definition row, not a form feed
    const label = row.locator('label').first();
    if (!(await label.count())) continue;
    const text = (await label.textContent())?.trim() ?? '';

    await page.evaluate(() => document.activeElement?.blur?.());
    await label.click();
    const focused = await control.evaluate((el) => el === document.activeElement);
    if (!focused) unnamed.push(`${where}: clicking "${text}" does not focus its control`);
  }
  return unnamed;
}

async function axeOn(page, where) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return res.violations.flatMap((v) => v.nodes.map((n) =>
    `${where}: ${v.id} ${n.target.join(' ')} — ${(n.any?.[0]?.message ?? v.help).replace(/\s+/g, ' ').slice(0, 110)}`));
}

export async function run() {
  const s = await scenario('seeded');
  const { page } = s;
  const problems = [];
  // Scope every interaction to the app's main column. The dev bar is a sibling
  // full of buttons ("Fail Next: off", "Seed", "Export") whose text collides
  // with the form's own controls.
  const main = page.locator('#main');

  try {
    await takeSeat(page, s.origin);

    // ---- the submit wizard, step by step -------------------------------
    await page.goto(`${s.origin}/submit`);
    await page.waitForSelector('.field-row');

    problems.push(...await assertLabelsName(page, 'submit step 1'));
    problems.push(...await axeOn(page, 'submit step 1'));

    await main.locator('.field-row select').selectOption('gardening');
    await main.locator('button:has-text("Next")').click();
    await page.waitForSelector('.format-tabs');
    problems.push(...await axeOn(page, 'submit step 2'));

    await main.locator('button:has-text("Next")').click();
    await page.waitForSelector('.field-row input');

    problems.push(...await assertLabelsName(page, 'submit step 3'));
    problems.push(...await axeOn(page, 'submit step 3'));

    // ---- and it actually publishes --------------------------------------
    const TITLE = 'A holistic workflow test post';
    await main.locator('.field-row input[type="text"]').first().fill(TITLE);
    await main.locator('.field-row textarea').first().fill('Written by e2e/forms.workflow.mjs.');
    // Step 3 -> the review step, which is its own surface worth scanning:
    // it renders the post as it will appear, including any automod notice.
    await main.locator('button:has-text("Review")').click();
    await page.waitForSelector('.stack h2');
    problems.push(...await axeOn(page, 'submit step 4 (review)'));

    await main.locator('button:has-text("Submit")').click();

    // Publishing navigates to the new post's thread. That IS the assertion:
    // the round trip completed and the post is readable where it now lives.
    await page.waitForFunction((t) => document.body.textContent.includes(t), TITLE, { timeout: 15000 });
    assert.match(new URL(page.url()).pathname, /^\/f\/gardening\/p\//,
      `publishing lands on the new post's thread, got ${page.url()}`);
    assert.ok(await page.locator(`text=${TITLE}`).first().isVisible(),
      'the post a member just wrote is readable on its own page');
    problems.push(...await axeOn(page, 'the published thread'));

    // ---- create a Feed --------------------------------------------------
    await page.goto(`${s.origin}/create-feed`);
    await page.waitForSelector('.field-row');
    problems.push(...await assertLabelsName(page, 'create-feed'));
    problems.push(...await axeOn(page, 'create-feed'));

    // ---- Feed settings, the third form surface --------------------------
    // A different seat on purpose: only an owner edits a Feed's settings, so
    // member.fern gets a gate here rather than a form. Covering it as the owner
    // is both the realistic path and the only way to reach these controls.
    await takeSeat(page, s.origin, 'u_sage');
    await page.goto(`${s.origin}/f/gardening/settings`);
    await page.waitForSelector('#main .field-row');
    problems.push(...await assertLabelsName(page, 'feed settings'));
    problems.push(...await axeOn(page, 'feed settings'));

    // ---- signup, the fourth form surface --------------------------------
    // Logged out on purpose: this is the one form a person meets before they
    // have any seat at all, which makes it the worst one to leave unnamed.
    await page.goto(`${s.origin}/popular`);
    await page.waitForSelector('.devbar');
    await page.locator('.devbar select[title="Active persona"]').selectOption('');
    await page.goto(`${s.origin}/signup`);
    await page.waitForSelector('#main .field-row');
    problems.push(...await assertLabelsName(page, 'signup'));
    problems.push(...await axeOn(page, 'signup'));

    assert.deepEqual(problems, [],
      `${problems.length} problem(s) on the write path:\n  ${problems.join('\n  ')}`);
  } finally {
    await s.close();
  }
}
