// W20 — the byline (plan 2026-08-29-plan-post-and-thread, Phase 1, decisions 7+8).
//
// Every post row and every comment opens the same way: an avatar slot, the
// name, a bare time (`1d`, not `1 day ago`), and a ⋯ slot top-right. This is
// the header the whole plan hangs off — the kebab is where Phase 3's menu
// lands, the avatar slot is where Phase 2's picture lands — so it is pinned
// here before either exists.
//
// Why exact counts: the likely regression is a DUPLICATE header (the old
// comment-meta surviving beside the new byline), and `>= 1` passes against it.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const TIME = /^\d+(s|m|h|d|mo|y)$/; // timeAgo's units, util.js — there is no `w`

const bylines = (page, scope) => page.evaluate((scope) =>
  [...document.querySelectorAll(scope)].map((n) => {
    // a row's byline sits in its right-hand column; a comment's in its body —
    // never deeper (a child comment's byline must not count for its parent)
    const sel = ':scope > .byline, :scope > div > .byline, :scope > .comment-body > .byline';
    const b = n.querySelector(sel);
    const all = n.querySelectorAll(sel).length;
    if (!b) return { count: all };
    const kids = [...b.children];
    return {
      count: all,
      first: kids[0]?.className ?? null,
      last: `${kids.at(-1)?.tagName.toLowerCase()}.${kids.at(-1)?.className}`,
      kebabName: kids.at(-1)?.getAttribute('aria-label') ?? null,
      time: b.querySelector('[data-time]')?.textContent.trim() ?? null,
      who: b.querySelector('.who')?.textContent.trim() ?? null,
      oldMeta: n.querySelectorAll(':scope > .comment-body > .comment-meta').length,
    };
  }), scope);

function assertByline(list, label) {
  assert.ok(list.length > 0, `${label}: nothing rendered to check`);
  for (const b of list) {
    assert.equal(b.count, 1, `${label}: exactly one .byline per node, got ${b.count}`);
    assert.equal(b.first, 'av', `${label}: the byline opens with the avatar slot`);
    assert.equal(b.last, 'button.kebab', `${label}: and closes with the ⋯ button`);
    assert.match(b.kebabName ?? '', /^More, by .+/, `${label}: the kebab names its author, so two never share a name: ${b.kebabName}`);
    assert.match(b.time ?? '', TIME, `${label}: bare time, got ${JSON.stringify(b.time)}`);
    assert.ok(b.who, `${label}: the byline names who`);
    assert.equal(b.oldMeta, 0, `${label}: the old comment-meta is gone, not doubled`);
  }
}

export async function run() {
  const mem = await scenario('seeded');
  try {
    const { page } = mem;
    await page.goto(`${mem.origin}/popular`);
    await page.waitForSelector('.postrow');
    assertByline(await bylines(page, '.postrow'), 'board rows');

    const threadHref = await page.evaluate(() =>
      [...document.querySelectorAll('.postrow')]
        .filter((r) => !/\b0 comments\b/.test(r.innerText))
        .map((r) => r.querySelector('.posttitle a')?.getAttribute('href'))
        .find(Boolean) ?? null);
    assert.ok(threadHref, 'the seeded board must offer a thread with replies');
    await page.goto(`${mem.origin}${threadHref}`);
    await page.waitForSelector('.comment');
    assertByline(await bylines(page, '.comment'), 'comments');

    // The kebab must clear the phone tap floor: 44px at 390 wide (mobile-fit
    // measures the whole page; this is the one control this suite adds).
    await page.setViewportSize({ width: 390, height: 844 });
    const kebab = await page.evaluate(() => {
      const r = document.querySelector('.comment .kebab').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    assert.ok(kebab.w >= 44 && kebab.h >= 44, `the kebab is ${kebab.w}x${kebab.h} at 390 wide; the floor is 44`);
    assert.deepEqual(mem.errors(), []);
  } finally { await mem.close(); }
}
