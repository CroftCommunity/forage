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
//        thread-lens menu-lens focus-lens)
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
// It refuses to run with uncommitted UI files in the served tree — the sha
// would otherwise name a tree the pixels are not from.
import { scenario } from '../e2e/harness/scenario.mjs';
import { RESPONSES, FAKE_SIGNED_IN, THREAD_PATH, NODE_IDS, ROOT as THREAD_ROOT } from '../e2e/harness/mock-thread.mjs';
import { RESPONSES as BOARD, BOARD_PATH } from '../e2e/harness/mock-board.mjs';
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
// --skin <id>: every frame in that skin (the owner asked to see the mocks in three,
// 2026-08-30); files carry the skin in their name, the default skin carries none
const SKIN = opt('--skin');
const SKIN_INIT = SKIN ? [`try { localStorage.setItem('forage.skin', '${SKIN}'); } catch {}`] : [];
const skinTag = SKIN ? `.${SKIN}` : '';
const scenarioS = (state, opts = {}) => scenario(state, { ...opts, initScripts: [...SKIN_INIT, ...(opts.initScripts || [])] });
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
  const file = `${route}.${name}${skinTag}${suffix}.png`;
  await page.screenshot({ path: join(OUT, file) });
  files.push({ file, route, viewport: name, ...vp, baseline, population, ...(SKIN ? { skin: SKIN } : {}) });
};

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  // ---- memory:seeded — the board and its deepest thread ----
  if (wanted('board') || wanted('thread')) {
  const s = await scenarioS('seeded', { root: SERVE, initScripts: SKIN_INIT });
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
  const l = await scenarioS('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: RESPONSES });
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

  // feed-row v4: the /reply page (signed in, a draft already kept, so the frame shows
  // the draft line) and the thread with the quick box open under a comment
  if (wanted('reply-lens')) {
    const seeded = `try { localStorage.setItem('forage.draft:${THREAD_ROOT}', JSON.stringify({ text: 'Might as well — a pie tube is a pie tube, and the quiche would travel better than the proposal did.', savedAt: '2026-08-30T20:15:00Z' })); } catch {}`;
    const r = await scenarioS('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, seeded], responses: RESPONSES });
    await r.page.setViewportSize({ width: vp.width, height: vp.height });
    await r.page.goto(`${r.origin}/reply?uri=${encodeURIComponent(THREAD_ROOT)}&root=${encodeURIComponent(THREAD_ROOT)}`);
    await r.page.waitForSelector('[data-reply-target]', { timeout: 15000 });
    await r.page.evaluate(() => document.fonts?.ready);
    await shoot(r.page, 'reply-lens', 'lens:mock-thread', name, vp);
    await r.close();
  }
  if (wanted('thread-lens-reply')) {
    const q = await scenarioS('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
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
  if (wanted('board-lens') || wanted('board-lens-media')) {
    const out = await scenarioS('first-visit', { root: SERVE, mode: 'bluesky', initScripts: SKIN_INIT, responses: BOARD });
    await out.page.setViewportSize({ width: vp.width, height: vp.height });
    await out.page.goto(`${out.origin}${BOARD_PATH}`);
    await out.page.waitForSelector('.postrow', { timeout: 15000 });
    await out.page.evaluate(() => document.fonts?.ready);
    await shoot(out.page, 'board-lens', 'lens:mock-board', name, vp);
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
  // feed-row v1: the board at COMPACT density — the phpBB skin's preference and
  // the owner's phone (2026-08-30). Same skin as every other frame (MOCKS.md
  // rule 4: compare in one skin), so the density is the only axis that moves.
  if (wanted('board-lens-compact')) {
    const cmp = await scenarioS('first-visit', { root: SERVE, mode: 'bluesky', responses: BOARD,
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
  if (wanted('board-lens-in')) {
    const inn = await scenarioS('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [...SKIN_INIT, FAKE_SIGNED_IN], responses: BOARD });
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
