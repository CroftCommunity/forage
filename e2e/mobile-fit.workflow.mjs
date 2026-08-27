// W6 — mobile fit (croft-pwa PRACTICES lesson, adopted): NO horizontal
// overflow at 320/360/390 on the surfaces that matter, in BOTH populations.
// Long unbroken tokens and deep comment nesting are the classic culprits —
// the fixtures are built to provoke exactly those.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const WIDTHS = [320, 360, 390];
const LONG_WORD = 'Supercalifragilisticexpialidocious'.repeat(4);
const LONG_URL = 'https://example.com/an/extremely/long/path/segment/that/never/breaks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const post = (rkey, did, ts, text, extra = {}) => ({ post: {
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: 'cid-' + rkey,
  author: { did, handle: 'averyveryverylonghandle.some-subdomain.bsky.social' },
  record: { text, createdAt: ts }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: 3, ...extra,
} });

// croft-pwa/docs/MOBILE-FIRST.md § The gate requires tap targets ALONGSIDE the
// overflow check; this workflow did the overflow half only, so measured
// failures sat live: /feeds selects at 118x19 and 88x19, the density select at
// 76x19, the skin toggle at 30x30, masthead nav links at 38x21.
//
// 44 CSS px is the floor. The canonical doc exempts links inline in PROSE —
// where enlarging the target would mean enlarging the sentence — and that
// exemption does not reach the masthead, which is a chrome region, not prose.
const TAP_FLOOR = 44;

async function assertTapTargets(page, label) {
  const small = await page.evaluate((floor) => {
    // Interactive things a thumb is meant to hit. Anchors inside a paragraph or
    // a clamp are prose links and carry the documented exemption.
    // `.masthead a` is here because the comment above this function already
    // said it should be: the prose exemption "does not reach the masthead,
    // which is a chrome region, not prose". It said so while the selector
    // matched no plain <a> at all, so the four masthead failures it names as
    // motivation were invisible to it — the gate documented coverage it did
    // not have. Widened to the region it names, and no further: extending the
    // floor to every non-prose anchor app-wide is a policy call, not a bug fix.
    const sel = 'button, select, input[type="checkbox"], input[type="radio"], .tab, a.btn, .themetoggle, .masthead a';
    const inProse = (el) => !!el.closest('p, .clamp, .comment-text, .postmeta');
    // The dev bar is scaffolding, not product chrome — /about says so in as many
    // words, and it would not ship in a production build. Holding it to the
    // product's touch floor would fail the gate on something no user ever taps.
    const isScaffolding = (el) => !!el.closest('.devbar');
    // The collapse gutter is a RAIL, not a button-shaped target: 24px wide by
    // the full height of the subtree it collapses — measured at 24x2160 on a
    // deep thread. Its area is enormous and it is trivially easy to hit; only
    // its narrow dimension trips a width check. Widening it to 44 would cost
    // 20px of horizontal space PER NESTING LEVEL at 320px, which breaks the
    // deep threads it exists to manage. Exempted deliberately and recorded, not
    // silently skipped — this one is a judgement call and the owner should see
    // it as such.
    const isRail = (el) => el.classList.contains('gutter');
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      if (inProse(el) || isScaffolding(el) || isRail(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;      // not rendered
      if (r.width < floor || r.height < floor) {
        out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''} ` +
          `${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return [...new Set(out)];
  }, TAP_FLOOR);
  assert.deepEqual(small, [],
    `${label}: ${small.length} tap target(s) under ${TAP_FLOOR}px:\n      ${small.join('\n      ')}`);
}

async function assertNoOverflow(page, label) {
  const { scrollW, innerW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
  }));
  assert.ok(scrollW <= innerW + 1, `${label}: horizontal overflow (${scrollW} > ${innerW})`);
}

// Both halves of the mobile gate, at the same moment and the same width.
async function assertBoth(page, label) {
  await assertNoOverflow(page, label);
  await assertTapTargets(page, label);
}

export async function run() {
  // ---- the bluesky population, guest surfaces ----
  // NB: replies must come from a DIFFERENT author than the root — same-author
  // chains hoist into the post body (3i self-threads), leaving no comments.
  const deepReplies = (depth) => depth === 0 ? [] : [{
    post: post(`r${depth}`, `did:plc:r${depth}`, '2026-08-26T10:00:00Z', `deep reply ${LONG_WORD}`).post,
    replies: deepReplies(depth - 1),
  }];
  const b = await scenario('first-visit', {
    responses: {
      'getTrendingTopics': { topics: [{ topic: LONG_WORD, displayName: LONG_WORD, description: LONG_URL, link: '/profile/did:plc:t/feed/x1' }] },
      'getFeed': { feed: [
        post('long1', 'did:plc:aa', '2026-08-26T10:00:00Z', `${LONG_WORD} ${LONG_URL}`),
        post('long2', 'did:plc:aa', '2026-08-26T09:00:00Z', LONG_URL),
      ] },
      'getAuthorFeed': { feed: [post('long1', 'did:plc:aa', '2026-08-26T10:00:00Z', `${LONG_WORD} ${LONG_URL}`)] },
      'getPostThread': { thread: {
        post: post('long1', 'did:plc:aa', '2026-08-26T10:00:00Z', `${LONG_WORD} ${LONG_URL}`).post,
        replies: deepReplies(8),
      } },
      'getQuotes': { posts: [] },
    },
  });
  for (const width of WIDTHS) {
    await b.page.setViewportSize({ width, height: 800 });
    await b.page.goto(`${b.origin}/`);
    await b.page.waitForSelector('text=The Lens');
    await assertBoth(b.page, `bluesky home @${width}`);

    await b.page.goto(`${b.origin}/f/whats-hot`);
    await b.page.waitForSelector('.postrow');
    await assertBoth(b.page, `feed board (long tokens) @${width}`);

    await b.page.goto(`${b.origin}/p?uri=${encodeURIComponent('at://did:plc:aa/app.bsky.feed.post/long1')}`);
    await b.page.waitForSelector('.comment');
    await assertBoth(b.page, `deep thread @${width}`);

    await b.page.goto(`${b.origin}/mode`);
    await b.page.waitForSelector('[data-mode-card="memory"]');
    await assertBoth(b.page, `/mode @${width}`);

    await b.page.goto(`${b.origin}/settings`);
    await b.page.waitForSelector('text=Skin');
    await assertBoth(b.page, `/settings @${width}`);
  }
  await b.close();

  // ---- the memory population, seeded ----
  const m = await scenario('seeded', {});
  for (const width of WIDTHS) {
    await m.page.setViewportSize({ width, height: 800 });
    await m.page.goto(`${m.origin}/popular`);
    await m.page.waitForSelector('.postrow');
    await assertBoth(m.page, `memory popular @${width}`);

    // pick a seeded thread that actually HAS comments (deep nesting is the
    // overflow risk we care about here)
    const threadLink = await m.page.evaluate(() => {
      for (const row of document.querySelectorAll('.postrow')) {
        const link = [...row.querySelectorAll('a')].find((a) => /\d+ comments/.test(a.textContent) && !/^0 /.test(a.textContent));
        if (link) return link.getAttribute('href');
      }
      return null;
    });
    assert.ok(threadLink, 'the seed has a thread with comments');
    await m.page.goto(new URL(threadLink, m.origin).href); // clean paths already start with /
    await m.page.waitForSelector('.comment');
    await assertBoth(m.page, `memory thread @${width}`);
  }
  await m.close();
}
