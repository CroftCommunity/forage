// Workflow-corpus runner (1d). Runs every e2e/*.workflow.mjs sequentially.
// Fitness rule: a workflow needing real Bluesky exports `live = true` and runs
// only under LIVE=1; one needing the Docker spaces PDS exports `docker = true`
// and runs only under DOCKER=1. Gated-off workflows SKIP-REPORT loudly —
// never silently absent. Exit non-zero if any RUN workflow fails.
import { readdir } from 'node:fs/promises';
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
  }
}
console.log(`\nworkflows: ${files.length} found, ${failed} failed`);
process.exit(failed ? 1 : 0);
