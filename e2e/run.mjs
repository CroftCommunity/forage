// Workflow-corpus runner (1d). Runs every e2e/*.workflow.mjs sequentially.
//
// IT GLOBS THIS DIRECTORY, so it will happily grade your scratch work. If you
// are hunting an intermittent failure by running the suite in a loop, a RED
// work-in-progress workflow left in e2e/ produces failures that look exactly
// like the signal you are hunting. That happened twice in one session on
// 2026-08-26: three of four "hits" in a flake hunt were the hunter's own
// unfinished file, and the one real catch was nearly lost in them. Commit or
// move your WIP out before you start a hunt, and read WHICH workflow failed
// before concluding anything.
// Fitness rule: a workflow needing real Bluesky exports `live = true` and runs
// only under LIVE=1; one needing the Docker spaces PDS exports `docker = true`
// and runs only under DOCKER=1. Gated-off workflows SKIP-REPORT loudly —
// never silently absent. Exit non-zero if any RUN workflow fails.
import { readdir } from 'node:fs/promises';
import { diagnoseLive } from './harness/scenario.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const files = (await readdir(DIR)).filter((f) => f.endsWith('.workflow.mjs')).sort();

let failed = 0;
for (const f of files) {
  const mod = await import(join(DIR, f));
  if (mod.live && !process.env.LIVE) { console.log(`SKIPPED  ${f} — live-only, run with LIVE=1`); continue; }
  if (mod.docker && !process.env.DOCKER) { console.log(`SKIPPED  ${f} — needs the spaces PDS, run with DOCKER=1`); continue; }
  const t0 = performance.now();
  try {
    await mod.run();
    console.log(`ok       ${f} (${Math.round(performance.now() - t0)}ms)`);
  } catch (e) {
    failed++;
    console.error(`FAILED   ${f}\n${e?.stack || e}`);
    // Any scenario still open when the workflow threw still knows what it was
    // waiting on. Ask it before it is garbage — a stack alone has cost this
    // suite two undiagnosed failures already.
    try {
      const d = await diagnoseLive();
      if (d) console.error(d);
    } catch (de) { console.error(`  (diagnostics unavailable: ${de?.message})`); }
  }
}
console.log(`\nworkflows: ${files.length} found, ${failed} failed`);
process.exit(failed ? 1 : 0);
