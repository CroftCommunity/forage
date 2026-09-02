// Captures the UI at the workspace's standard mock viewports, so a mock can
// stand real pixels beside its claims and say what tree they came from.
// Per CroftC/.claude/MOCKS.md: every frame a mock shows — CURRENT and PROPOSED
// alike — is a capture of the engine, and the manifest names the sha behind
// each file. A drawn frame is a sketch, never what the owner approves.
//
//   node scripts/mock-snaps.mjs                       # this checkout -> plans/mocks/snaps/
//   node scripts/mock-snaps.mjs --as proposed         # files get a .proposed suffix
//   node scripts/mock-snaps.mjs --only board-lens,menu-lens   # a subset of the routes below
//       (routes: board thread board-lens board-lens-media board-lens-compact board-lens-in
//        board-lens-cards board-lens-quote board-lens-hover board-lens-refresh
//        board-lens-refresh-news board-lens-refresh-pill post-lens-quote thread-lens
//        thread-lens-quote thread-lens-sheet thread-lens-embed menu-lens focus-lens reply-lens thread-lens-reply
//        news-lens news-lens-replies news-board news-board-nothumb
//        gif-lens gif-lens-paused gif-lens-alt gif-board)
//   node scripts/mock-snaps.mjs --as current --serve ../../forage
//       # the same script and fixtures, rendering ANOTHER checkout (main): the
//       # Current frames come from the tree the owner is running, captured by
//       # the branch that proposes to change it
//   --out <dir>   somewhere other than plans/mocks/snaps
//   --skin <id>   capture in a registered skin (a skin id, not a family) — the
//                 file name and the manifest carry the id. MOCKS.md says compare
//                 in ONE skin, and the default one; this flag is for the mock
//                 where the skin IS the subject (warm-skins), and the page it
//                 feeds must say so.
//
// Two populations, both hermetic (the same trees the workflows grade):
//   memory:seeded    the e2e harness's seeded memory sandbox — board + thread
//   lens:mock-thread e2e/harness/mock-thread.mjs — the Bluesky-view thread under
//                    the load the mock is judged against (real handle lengths,
//                    a quote, depth 4, signed in). The thread the owner sees on
//                    forage.fyi is the lens, so this is the frame that matters.
//   lens:mock-gif    e2e/harness/mock-gif.mjs — the gif-embeds load: the owner's
//                    two reported klipy records verbatim (landscape and
//                    portrait), a GIF with alt a person WROTE, a tenor .gif
//                    with no verified video form, a 96-char title, and a news
//                    card as the control the alt-text setting must not touch.
//   lens:mock-newspost e2e/harness/mock-newspost.mjs — the post-text load: a
//                    verbatim news record (three blocks split by \n\n, a #link
//                    facet over a truncated display URL, a link card), a
//                    thumbnail-less external, a 298-char wall, a \n list, and
//                    replies carrying a link, a tag and a mention.
// It refuses to run with uncommitted UI files in the served tree — the sha
// would otherwise name a tree the pixels are not from.
import { scenario } from '../e2e/harness/scenario.mjs';
import { RESPONSES, FAKE_SIGNED_IN, THREAD_PATH, NODE_IDS, ROOT as THREAD_ROOT } from '../e2e/harness/mock-thread.mjs';
import { RESPONSES as BOARD, BOARD_PATH, QUOTE_PATH } from '../e2e/harness/mock-board.mjs';
import { RESPONSES as NEWS, BOARD_PATH as NEWS_BOARD, THREAD_PATH as NEWS_THREAD, NODE_IDS as NEWS_NODES } from '../e2e/harness/mock-newspost.mjs';
import { RESPONSES as REFRESH } from '../e2e/harness/mock-refresh.mjs';
import { RESPONSES as GIF, BOARD_PATH as GIF_BOARD, THREAD_PATH as GIF_THREAD } from '../e2e/harness/mock-gif.mjs';
import { mergeManifest } from './lib/snaps-manifest.mjs';
import { SKINS } from '../js/skins.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const AS = opt('--as');
if (AS && !['current', 'proposed'].includes(AS)) { console.error(`--as must be current or proposed, not ${AS}`); process.exit(2); }
const ONLY = opt('--only')?.split(',') ?? null;
const wanted = (route) => !ONLY || ONLY.includes(route);
const SERVE = resolve(opt('--serve') ?? ROOT);
const OUT = resolve(opt('--out') ?? join(ROOT, 'plans', 'mocks', 'snaps'));
const SKIN = opt('--skin');
if (SKIN && !SKINS[SKIN]) { console.error(`--skin must be a registered skin id, not ${SKIN} (known: ${Object.keys(SKINS).join(', ')})`); process.exit(2); }
// The pre-paint boot script in index.html reads this key and injects the sheet
// before first paint — the same way e2e/skins.workflow.mjs dresses a page.
const SKIN_INIT = SKIN ? [`try { localStorage.setItem('forage.skin', '${SKIN}'); } catch {}`] : [];

// The standard frames (MOCKS.md § Viewports): fun/mocks has drawn at 390×844
// since 2026-08-28; desktop is the width the e2e suite already uses.
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } };

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: SERVE }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'js', 'css', 'skins', 'index.html'], { cwd: SERVE }).toString().trim();
if (dirty) { console.error(`refusing: UI files are uncommitted in ${SERVE}, so the sha would name a tree these pixels are not from:\n` + dirty); process.exit(2); }
const baseline = `forage@${sha}`;
const suffix = `${SKIN ? `.${SKIN}` : ''}${AS ? `.${AS}` : ''}`;

mkdirSync(OUT, { recursive: true });
const files = [];
const shoot = async (page, route, population, name, vp) => {
  if (!wanted(route)) return;
  const file = `${route}.${name}${suffix}.png`;
  await page.screenshot({ path: join(OUT, file) });
  files.push({ file, route, viewport: name, ...vp, baseline, population, ...(SKIN ? { skin: SKIN } : {}) });
};

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  // ---- memory:seeded — the board and its deepest thread ----
  if (wanted('board') || wanted('thread')) {
  const s = await scenario('seeded', { root: SERVE, initScripts: SKIN_INIT });
  await s.page.setViewportSize({ width: vp.width, height: vp.height });
  await s.open('#/popular'); await s.waitForSeed();
  await s.page.reload(); await s.page.waitForSelector('.postrow', { timeout: 10000 });
  await shoot(s.page, 'board', 'memory:seeded', name, vp);
  // the thread with the most comments — the one whose shape a mock cares about
  const href = await s.page.evaluate(() => [...document.querySelectorAll('.postrow')]
    // the replies pill on the action row (board-cards Phase 4) says "12 comments"
    .map((r) => ({ n: parseInt((r.querySelector('.actions a.replies')?.textContent || '').match(/\d+/)?.[0] || '0', 10), href: r.querySelector('.posttitle a')?.getAttribute('href') }))
    .sort((a, b) => b.n - a.n)[0]?.href);
  await s.page.goto(`${s.origin}/#${href}`); await s.page.reload();
  await s.page.waitForSelector('.comment', { timeout: 15000 });
  await shoot(s.page, 'thread', 'memory:seeded', name, vp);
  await s.close();
  }

  // ---- lens:mock-thread — the Bluesky-view thread, signed in, under load ----
  if (wanted('thread-lens') || wanted('menu-lens') || wanted('focus-lens')) {
  const l = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: RESPONSES });
  await l.page.setViewportSize({ width: vp.width, height: vp.height });
  await l.page.goto(`${l.origin}${THREAD_PATH}`);
  await l.page.waitForSelector('.comment[data-kind="quote"]', { timeout: 15000 }); // the quote cascade landed
  await l.page.evaluate(() => document.fonts?.ready);
  await shoot(l.page, 'thread-lens', 'lens:mock-thread', name, vp);
  // post-and-thread § B: the ⋯ menu on a reply — a bottom sheet on the phone, a popover on desktop
  if (wanted('menu-lens')) {
    await l.page.locator(`.comment[data-node-id="${NODE_IDS[0]}"] > .comment-body > .byline button.kebab`).click();
    await l.page.waitForSelector('[role="menu"]');
    await shoot(l.page, 'menu-lens', 'lens:mock-thread', name, vp);
    await l.page.keyboard.press('Escape');
  }
  // post-and-thread § F: a deep link lands on the comment, its parents above, the bar over it
  if (wanted('focus-lens')) {
    await l.page.goto(`${l.origin}${THREAD_PATH}&focus=${encodeURIComponent(NODE_IDS[2])}`);
    // wait for the BAR, not `.comment.focused`: a tree where the focus is lost
    // after the cascade repaint (main before 2026-08-30) is exactly what a
    // Current capture must be able to show
    await l.page.waitForSelector('.focus-bar', { timeout: 15000 });
    await l.page.waitForTimeout(2200); // the 2s focus tint has faded: the resting state, not the flash
    await shoot(l.page, 'focus-lens', 'lens:mock-thread', name, vp);
  }
  await l.close();
  }

  // feed-row v11 decision 24: the quote-response and the reply threaded under it,
  // scrolled to the top of the frame — the wall on the quote's own rows only
  if (wanted('thread-lens-quote')) {
    const qz = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: RESPONSES });
    await qz.page.setViewportSize({ width: vp.width, height: vp.height });
    await qz.page.goto(`${qz.origin}${THREAD_PATH}`);
    await qz.page.waitForSelector('.comment[data-kind="quote"]', { timeout: 15000 });
    await qz.page.evaluate(() => document.fonts?.ready);
    await qz.page.evaluate(() => { document.querySelector('.comment[data-kind="quote"][data-depth="0"]')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -72); });
    await qz.page.waitForTimeout(200);
    await shoot(qz.page, 'thread-lens-quote', 'lens:mock-thread', name, vp);
    await qz.close();
  }
  // feed-row v12 decision 25: the repost sheet, opened from the quote-response's ⟳
  // (on main the press toggles a repost and nothing opens — an honest Current)
  if (wanted('thread-lens-sheet')) {
    const sh = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: RESPONSES });
    await sh.page.setViewportSize({ width: vp.width, height: vp.height });
    await sh.page.goto(`${sh.origin}${THREAD_PATH}`);
    await sh.page.waitForSelector('.comment[data-kind="quote"]', { timeout: 15000 });
    await sh.page.evaluate(() => document.fonts?.ready);
    await sh.page.evaluate(() => { document.querySelector('.comment[data-kind="quote"][data-depth="0"]')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -72); });
    await sh.page.locator('.comment[data-kind="quote"][data-depth="0"] > .comment-body > .comment-actions > [data-repost]').click();
    await sh.page.waitForTimeout(400);
    await shoot(sh.page, 'thread-lens-sheet', 'lens:mock-thread', name, vp);
    await sh.close();
  }
  // feed-row v4: the /reply page (signed in, a draft already kept, so the frame shows
  // the draft line) and the thread with the quick box open under a comment
  if (wanted('reply-lens')) {
    const seeded = `try { localStorage.setItem('forage.draft:${THREAD_ROOT}', JSON.stringify({ text: 'Might as well — a pie tube is a pie tube, and the quiche would travel better than the proposal did.', savedAt: '2026-08-30T20:15:00Z' })); } catch {}`;
    const r = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN, seeded], responses: RESPONSES });
    await r.page.setViewportSize({ width: vp.width, height: vp.height });
    await r.page.goto(`${r.origin}/reply?uri=${encodeURIComponent(THREAD_ROOT)}&root=${encodeURIComponent(THREAD_ROOT)}`);
    await r.page.waitForSelector('[data-reply-target]', { timeout: 15000 });
    await r.page.evaluate(() => document.fonts?.ready);
    await shoot(r.page, 'reply-lens', 'lens:mock-thread', name, vp);
    await r.close();
  }
  // reply-embeds (owner, 2026-09-01, "reply with an image that doesn't load"):
  // the two replies that carry embeds — a picture with words above it, and a
  // WORDLESS reply whose whole content is a quote of a picture post. On main
  // both draw a byline and an action row over nothing, which is what an honest
  // Current frame has to be able to show.
  if (wanted('thread-lens-embed')) {
    const em = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: RESPONSES });
    await em.page.setViewportSize({ width: vp.width, height: vp.height });
    await em.page.goto(`${em.origin}${THREAD_PATH}`);
    await em.page.waitForSelector('.comment[data-kind="quote"]', { timeout: 15000 });
    await em.page.evaluate(() => document.fonts?.ready);
    // the WORDLESS one anchors the frame: it is the reported shape, and it is the
    // node whose Current and Proposed differ most (an empty row vs a quote card)
    await em.page.evaluate((id) => { document.querySelector(`.comment[data-node-id="${id}"]`)?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -72); }, NODE_IDS[8]);
    await em.page.waitForTimeout(200);
    await shoot(em.page, 'thread-lens-embed', 'lens:mock-thread', name, vp);
    await em.close();
  }
  if (wanted('thread-lens-reply')) {
    const q = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: RESPONSES });
    await q.page.setViewportSize({ width: vp.width, height: vp.height });
    await q.page.goto(`${q.origin}${THREAD_PATH}`);
    await q.page.waitForSelector('.comment[data-kind="quote"]', { timeout: 15000 });
    await q.page.locator(`.comment[data-node-id="${NODE_IDS[2]}"] > .comment-body > .comment-actions button.reply`).click();
    await q.page.waitForSelector(`.comment[data-node-id="${NODE_IDS[2]}"] [data-composer]`);
    await q.page.evaluate((id) => document.querySelector(`.comment[data-node-id="${id}"]`)?.scrollIntoView({ block: 'start' }), NODE_IDS[2]);
    await q.page.waitForTimeout(200);
    await shoot(q.page, 'thread-lens-reply', 'lens:mock-thread', name, vp);
    await q.close();
  }

  // ---- lens:mock-board — the board, signed out (board-cards A–F, post-and-thread A/E) and signed in ----
  if (wanted('board-lens') || wanted('board-lens-media') || wanted('board-lens-cards') || wanted('board-lens-quote')) {
    const out = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: SKIN_INIT, responses: BOARD });
    await out.page.setViewportSize({ width: vp.width, height: vp.height });
    await out.page.goto(`${out.origin}${BOARD_PATH}`);
    await out.page.waitForSelector('.postrow', { timeout: 15000 });
    await out.page.evaluate(() => document.fonts?.ready);
    await shoot(out.page, 'board-lens', 'lens:mock-board', name, vp);
    // feed-row v13 (H, I, J): the link cards and the clip — the YouTube row scrolled to the top
    if (wanted('board-lens-cards')) {
      await out.page.evaluate(() => [...document.querySelectorAll('.postrow')].find((r) => r.querySelector('[data-extcard][data-provider="youtube"]'))?.scrollIntoView({ block: 'start' }));
      await out.page.evaluate(() => window.scrollBy(0, -72));
      await out.page.waitForTimeout(200);
      await shoot(out.page, 'board-lens-cards', 'lens:mock-board', name, vp);
    }
    // feed-row v16: the QUOTE row — the quoted post and its video, in the feed.
    // Scrolled to the top of the frame, because the row is what the report was
    // about: before this it was the quoter's sentence over nothing.
    if (wanted('board-lens-quote')) {
      await out.page.evaluate(() => document.querySelector('.postrow .card.quoted, .postrow [data-quoted]')?.closest('.postrow')?.scrollIntoView({ block: 'start' }));
      await out.page.evaluate(() => window.scrollBy(0, -72));
      await out.page.waitForTimeout(200);
      await shoot(out.page, 'board-lens-quote', 'lens:mock-board', name, vp);
    }
    // board-cards § D: the media stage — the portrait post scrolled to the top of the frame
    if (wanted('board-lens-media')) {
      await out.page.evaluate(() => document.querySelector('.postrow .media-stage, .postrow .stage, .postrow img')?.closest('.postrow')?.scrollIntoView({ block: 'start' }));
      await out.page.waitForTimeout(200);
      await shoot(out.page, 'board-lens-media', 'lens:mock-board', name, vp);
    }
    // the fixture's pictures point at cdn.test and never load — the stage is
    // sized from the aspect ratio, which is the point — so drain the resource
    // errors the browser logs for them; this is a capture, not a gate
    out.consoleErrors(); out.errors();
    await out.close();
  }
  // feed-row v16: the same quote on its POST PAGE — the second surface
  // quotedContext renders on, and the one that showed the quoted words with no
  // video. Two surfaces, one shape: the pair is the frame worth comparing.
  if (wanted('post-lens-quote')) {
    const q = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: SKIN_INIT, responses: BOARD });
    await q.page.setViewportSize({ width: vp.width, height: vp.height });
    await q.page.goto(`${q.origin}${QUOTE_PATH}`);
    await q.page.waitForSelector('.head-byline', { timeout: 15000 });
    await q.page.evaluate(() => document.fonts?.ready);
    await shoot(q.page, 'post-lens-quote', 'lens:mock-board', name, vp);
    q.consoleErrors(); q.errors();
    await q.close();
  }
  // feed-row v1: the board at COMPACT density — the phpBB skin's preference and
  // the owner's phone (2026-08-30). Same skin as every other frame (MOCKS.md
  // rule 4: compare in one skin), so the density is the only axis that moves.
  if (wanted('board-lens-compact')) {
    const cmp = await scenario('first-visit', { root: SERVE, mode: 'bluesky', responses: BOARD,
      initScripts: ["try { localStorage.setItem('forage.boardview', 'compact'); } catch {}"] });
    await cmp.page.setViewportSize({ width: vp.width, height: vp.height });
    await cmp.page.goto(`${cmp.origin}${BOARD_PATH}`);
    await cmp.page.waitForSelector('.postrow', { timeout: 15000 });
    await cmp.page.evaluate(() => document.fonts?.ready);
    // at the picture post, found by its handle (a tree that renders no stage in
    // compact — main before feed-row — is exactly what the Current frame must show)
    await cmp.page.evaluate(() => [...document.querySelectorAll('.postrow')]
      .find((r) => r.querySelector('.who')?.textContent.includes('erislovesgardens'))?.scrollIntoView({ block: 'start' }));
    await cmp.page.waitForTimeout(200);
    await shoot(cmp.page, 'board-lens-compact', 'lens:mock-board', name, vp);
    cmp.consoleErrors(); cmp.errors();
    await cmp.close();
  }
  // feed-row v10, decision 22: the row under the pointer — desktop only, since a
  // phone has no pointer and the rule is fenced by (hover: hover). The second
  // row scrolled to the top of the frame and its text hovered: on main the text
  // underlines and the row stays as it is; on the branch the row lights.
  // ---- lens:mock-refresh — the control bar's right end, and the feed CHANGING.
  // A separate scenario because its fixture declares getFeed? as a sequence:
  // page one, then page one with three arrivals on top. The at-rest frame is
  // captured on BOTH trees (it is the bar's layout that changed); the news and
  // pill frames need the seam this branch introduces, so on a tree without it
  // they are skipped rather than faked — a mock shows the engine or nothing.
  if (wanted('board-lens-refresh') || wanted('board-lens-refresh-news') || wanted('board-lens-refresh-pill')) {
    const rf = await scenario('first-visit', { root: SERVE, mode: 'bluesky',
      initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: REFRESH });
    await rf.page.setViewportSize({ width: vp.width, height: vp.height });
    await rf.page.goto(`${rf.origin}${BOARD_PATH}`);
    await rf.page.waitForSelector('.postrow', { timeout: 15000 });
    await rf.page.evaluate(() => document.fonts?.ready);
    await shoot(rf.page, 'board-lens-refresh', 'lens:mock-refresh', name, vp);
    const hasSeam = await rf.page.evaluate(() => typeof window.__forageCheckForNew === 'function');
    if (hasSeam) {
      if (wanted('board-lens-refresh-news')) {
        await rf.page.evaluate(() => { window.__shimAdvance(); return window.__forageCheckForNew(); });
        await rf.page.waitForSelector('[data-refresh][data-state="news"]', { timeout: 10000 });
        await rf.page.waitForTimeout(150);
        await shoot(rf.page, 'board-lens-refresh-news', 'lens:mock-refresh', name, vp);
      }
      // D14: the same pending count, seen from where the bar no longer is
      if (wanted('board-lens-refresh-pill')) {
        if (!wanted('board-lens-refresh-news')) {
          await rf.page.evaluate(() => { window.__shimAdvance(); return window.__forageCheckForNew(); });
          await rf.page.waitForSelector('[data-refresh][data-state="news"]', { timeout: 10000 });
        }
        await rf.page.evaluate(() => window.scrollTo(0, 1200));
        await rf.page.waitForSelector('[data-newspill]', { timeout: 10000 });
        await rf.page.waitForTimeout(200);
        await shoot(rf.page, 'board-lens-refresh-pill', 'lens:mock-refresh', name, vp);
      }
    } else {
      console.log(`  (skipped board-lens-refresh-news/pill at ${name}: ${SERVE} has no refresh control)`);
    }
    rf.page.on('console', () => {});
    await rf.close().catch(() => {});
  }

  if (wanted('board-lens-hover') && name === 'desktop') {
    const hov = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: SKIN_INIT, responses: BOARD });
    await hov.page.setViewportSize({ width: vp.width, height: vp.height });
    await hov.page.goto(`${hov.origin}${BOARD_PATH}`);
    await hov.page.waitForSelector('.postrow', { timeout: 15000 });
    await hov.page.evaluate(() => document.fonts?.ready);
    // the row's top clear of the sticky masthead, so the lit band's whole extent is in the frame
    await hov.page.evaluate(() => { document.querySelectorAll('.postrow')[1]?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -72); });
    await hov.page.locator('.postrow').nth(1).locator('.posttitle').hover(); // v13: the text is text
    await hov.page.waitForTimeout(200);
    await shoot(hov.page, 'board-lens-hover', 'lens:mock-board', name, vp);
    hov.consoleErrors(); hov.errors();
    await hov.close();
  }
  // ---- lens:mock-gif — the gif-embeds mock's frames -----------------------
  // The surface the owner reported twice on 2026-09-02: a GIF on a REPLY, which
  // is where they met it both times. Three frames, because the change is a
  // player AND two settings, and a setting with one frame cannot be judged:
  // the defaults, autoplay off (the overlay a reader actually presses), and
  // alt text on.
  const GIF_FRAMES = [
    ['gif-lens', []],
    // autoplay off: the paused state, which is also what a reader with
    // prefers-reduced-motion gets without touching anything
    ['gif-lens-paused', ["try { localStorage.setItem('forage.gifautoplay','off'); } catch {}"]],
    // alt text on: the "ALT: <title again>" duplication comes BACK, on purpose
    // — that is what the switch is for, and the frame has to show its cost
    ['gif-lens-alt', ["try { localStorage.setItem('forage.alttext','on'); } catch {}"]],
  ];
  for (const [route, prefs] of GIF_FRAMES) {
    if (!wanted(route)) continue;
    const gw = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, ...prefs, FAKE_SIGNED_IN], responses: GIF });
    await gw.page.setViewportSize({ width: vp.width, height: vp.height });
    await gw.page.goto(`${gw.origin}${GIF_THREAD}`);
    await gw.page.waitForSelector('.comment', { timeout: 15000 });
    await gw.page.evaluate(() => document.fonts?.ready);
    await gw.page.waitForTimeout(200);
    await shoot(gw.page, route, 'lens:mock-gif', name, vp);
    gw.consoleErrors(); gw.errors();
    await gw.close();
  }
  // the same GIFs as board ROWS, with the news card below them as the control
  if (wanted('gif-board')) {
    const gb = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: SKIN_INIT, responses: GIF });
    await gb.page.setViewportSize({ width: vp.width, height: vp.height });
    await gb.page.goto(`${gb.origin}${GIF_BOARD}`);
    await gb.page.waitForSelector('.postrow', { timeout: 15000 });
    await gb.page.evaluate(() => document.fonts?.ready);
    await gb.page.waitForTimeout(200);
    await shoot(gb.page, 'gif-board', 'lens:mock-gif', name, vp);
    gb.consoleErrors(); gb.errors();
    await gb.close();
  }
  // ---- lens:mock-newspost — the post-text mock's frames -------------------
  // The surface the owner compared on 2026-09-01: a news post's own words at the
  // thread head, and the same words on the board row beside it.
  if (wanted('news-lens') || wanted('news-lens-replies')) {
    const nw = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: NEWS });
    await nw.page.setViewportSize({ width: vp.width, height: vp.height });
    await nw.page.goto(`${nw.origin}${NEWS_THREAD}`);
    await nw.page.waitForSelector('.comment', { timeout: 15000 });
    await nw.page.evaluate(() => document.fonts?.ready);
    await shoot(nw.page, 'news-lens', 'lens:mock-newspost', name, vp);
    // the replies: a link, a #tag and an @mention in the first one — dead text
    // on main, because a thread node's shape carries no facets at all
    if (wanted('news-lens-replies')) {
      await nw.page.evaluate((id) => { document.querySelector(`.comment[data-node-id="${id}"]`)?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -72); }, NEWS_NODES[0]);
      await nw.page.waitForTimeout(200);
      await shoot(nw.page, 'news-lens-replies', 'lens:mock-newspost', name, vp);
    }
    nw.consoleErrors(); nw.errors();
    await nw.close();
  }
  // the same post as a ROW, above the thumbnail-less external, the 298-char wall
  // and the \n list — the board's half of the same question
  if (wanted('news-board')) {
    const nb = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: SKIN_INIT, responses: NEWS });
    await nb.page.setViewportSize({ width: vp.width, height: vp.height });
    await nb.page.goto(`${nb.origin}${NEWS_BOARD}`);
    await nb.page.waitForSelector('.postrow', { timeout: 15000 });
    await nb.page.evaluate(() => document.fonts?.ready);
    await shoot(nb.page, 'news-board', 'lens:mock-newspost', name, vp);
    // the link whose page has no og:image, scrolled to the top of the frame: on
    // main the lens builds no media for it at all and the link goes nowhere
    await nb.page.evaluate(() => { [...document.querySelectorAll('.postrow')]
      .find((r) => r.textContent.includes('press.example.org'))?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -72); });
    await nb.page.waitForTimeout(200);
    await shoot(nb.page, 'news-board-nothumb', 'lens:mock-newspost', name, vp);
    nb.consoleErrors(); nb.errors();
    await nb.close();
  }
  if (wanted('board-lens-in')) {
    const inn = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: BOARD });
    await inn.page.setViewportSize({ width: vp.width, height: vp.height });
    await inn.page.goto(`${inn.origin}${BOARD_PATH}`);
    await inn.page.waitForSelector('.postrow', { timeout: 15000 });
    await inn.page.evaluate(() => document.fonts?.ready);
    await shoot(inn.page, 'board-lens-in', 'lens:mock-board', name, vp);
    inn.consoleErrors(); inn.errors();
    await inn.close();
  }
}

const manifestPath = join(OUT, 'manifest.json');
const existing = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const manifest = mergeManifest(existing, { capturedAt: new Date().toLocaleDateString('sv-SE') /* local day, not UTC's */, files });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${baseline}${SKIN ? ` in ${SKIN}` : ''}${AS ? ` as ${AS}` : ''} — ${files.length} snaps in ${OUT}`);
