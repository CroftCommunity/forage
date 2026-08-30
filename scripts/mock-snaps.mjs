// Captures the UI at the workspace's standard mock viewports, so a mock can
// stand real pixels beside its claims and say what tree they came from.
// Per CroftC/.claude/MOCKS.md: every frame a mock shows — CURRENT and PROPOSED
// alike — is a capture of the engine, and the manifest names the sha behind
// each file. A drawn frame is a sketch, never what the owner approves.
//
//   node scripts/mock-snaps.mjs                       # this checkout -> plans/mocks/snaps/
//   node scripts/mock-snaps.mjs --as proposed         # files get a .proposed suffix
//   node scripts/mock-snaps.mjs --only board-lens,menu-lens   # a subset of the routes below
//   node scripts/mock-snaps.mjs --as current --serve ../../forage
//       # the same script and fixtures, rendering ANOTHER checkout (main): the
//       # Current frames come from the tree the owner is running, captured by
//       # the branch that proposes to change it
//   --out <dir>   somewhere other than plans/mocks/snaps
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
import { RESPONSES, FAKE_SIGNED_IN, THREAD_PATH, NODE_IDS } from '../e2e/harness/mock-thread.mjs';
import { RESPONSES as BOARD, BOARD_PATH } from '../e2e/harness/mock-board.mjs';
import { mergeManifest } from './lib/snaps-manifest.mjs';
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

// The standard frames (MOCKS.md § Viewports): fun/mocks has drawn at 390×844
// since 2026-08-28; desktop is the width the e2e suite already uses.
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } };

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: SERVE }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'js', 'css', 'skins', 'index.html'], { cwd: SERVE }).toString().trim();
if (dirty) { console.error(`refusing: UI files are uncommitted in ${SERVE}, so the sha would name a tree these pixels are not from:\n` + dirty); process.exit(2); }
const baseline = `forage@${sha}`;
const suffix = AS ? `.${AS}` : '';

mkdirSync(OUT, { recursive: true });
const files = [];
const shoot = async (page, route, population, name, vp) => {
  if (!wanted(route)) return;
  const file = `${route}.${name}${suffix}.png`;
  await page.screenshot({ path: join(OUT, file) });
  files.push({ file, route, viewport: name, ...vp, baseline, population });
};

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  // ---- memory:seeded — the board and its deepest thread ----
  if (wanted('board') || wanted('thread')) {
  const s = await scenario('seeded', { root: SERVE });
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
  const l = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: RESPONSES });
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
    await l.page.waitForSelector('.comment.focused', { timeout: 15000 });
    await l.page.waitForTimeout(2200); // the 2s focus tint has faded: the resting state, not the flash
    await shoot(l.page, 'focus-lens', 'lens:mock-thread', name, vp);
  }
  await l.close();
  }

  // ---- lens:mock-board — the board, signed out (board-cards A–F, post-and-thread A/E) and signed in ----
  if (wanted('board-lens')) {
    const out = await scenario('first-visit', { root: SERVE, mode: 'bluesky', responses: BOARD });
    await out.page.setViewportSize({ width: vp.width, height: vp.height });
    await out.page.goto(`${out.origin}${BOARD_PATH}`);
    await out.page.waitForSelector('.postrow', { timeout: 15000 });
    await out.page.evaluate(() => document.fonts?.ready);
    await shoot(out.page, 'board-lens', 'lens:mock-board', name, vp);
    await out.close();
  }
  if (wanted('board-lens-in')) {
    const inn = await scenario('first-visit', { root: SERVE, mode: 'bluesky', initScripts: [FAKE_SIGNED_IN], responses: BOARD });
    await inn.page.setViewportSize({ width: vp.width, height: vp.height });
    await inn.page.goto(`${inn.origin}${BOARD_PATH}`);
    await inn.page.waitForSelector('.postrow', { timeout: 15000 });
    await inn.page.evaluate(() => document.fonts?.ready);
    await shoot(inn.page, 'board-lens-in', 'lens:mock-board', name, vp);
    await inn.close();
  }
}

const manifestPath = join(OUT, 'manifest.json');
const existing = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const manifest = mergeManifest(existing, { capturedAt: new Date().toLocaleDateString('sv-SE') /* local day, not UTC's */, files });
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${baseline}${AS ? ` as ${AS}` : ''} — ${files.length} snaps in ${OUT}`);
