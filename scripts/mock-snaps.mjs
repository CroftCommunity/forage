// Captures TODAY's UI at the workspace's standard mock viewports, so a mock can
// stand its drawings next to real pixels and say what they were taken from.
// Per CroftC/.claude/MOCKS.md: a mock names its baseline (`<repo>@<sha>`), and
// the baseline is whatever this script ran against — HEAD of this checkout.
//
//   node scripts/mock-snaps.mjs            # -> plans/mocks/snaps/*.png + manifest.json
//
// Hermetic: the e2e harness's memory-mode seeded scenario, the same population
// the workflows use, so two people running this get the same pictures. Routes
// are the two surfaces mocks argue about most — the board and a thread.
import { scenario } from '../e2e/harness/scenario.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'plans', 'mocks', 'snaps');
// The standard frames (MOCKS.md § Viewports): fun/mocks has drawn at 390×844
// since 2026-08-28; desktop is the width the e2e suite already uses.
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } };
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
const dirty = execFileSync('git', ['status', '--porcelain', '--', 'js', 'css', 'skins', 'index.html'], { cwd: ROOT }).toString().trim();
if (dirty) { console.error('refusing: UI files are uncommitted, so the sha would name a tree these pixels are not from:\n' + dirty); process.exit(2); }

mkdirSync(OUT, { recursive: true });
const files = [];
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const s = await scenario('seeded', {});
  await s.page.setViewportSize({ width: vp.width, height: vp.height });
  await s.open('#/popular'); await s.waitForSeed();
  await s.page.reload(); await s.page.waitForSelector('.postrow', { timeout: 10000 });
  const shoot = async (route) => {
    const file = `${route}.${name}.png`;
    await s.page.screenshot({ path: join(OUT, file) });
    files.push({ file, route, viewport: name, ...vp });
  };
  await shoot('board');
  // the thread with the most comments — the one whose shape a mock cares about
  const href = await s.page.evaluate(() => [...document.querySelectorAll('.postrow')]
    // the replies pill on the action row (board-cards Phase 4) says "12 comments"
    .map((r) => ({ n: parseInt((r.querySelector('.actions a.replies')?.textContent || '').match(/\d+/)?.[0] || '0', 10), href: r.querySelector('.posttitle a')?.getAttribute('href') }))
    .sort((a, b) => b.n - a.n)[0]?.href);
  await s.page.goto(`${s.origin}/#${href}`); await s.page.reload();
  await s.page.waitForSelector('.comment', { timeout: 15000 });
  await shoot('thread');
  await s.close();
}
const manifest = { baseline: `forage@${sha}`, capturedAt: new Date().toLocaleDateString('sv-SE') /* local day, not UTC's */, population: 'memory:seeded', files };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`baseline forage@${sha} — ${files.length} snaps in plans/mocks/snaps/`);
