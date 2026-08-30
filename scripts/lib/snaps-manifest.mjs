// The snaps manifest, merged per file (test/mock-snaps-manifest.test.js says why:
// a whole-file replace let one mock's re-capture rename another mock's baseline).
// Every file carries its own `baseline` (<repo>@<sha>) and `population`; the
// manifest's only top-level field is the day of the last run.

// A manifest from before per-file baselines named one baseline and population
// for every file; read it as if each file had carried them.
const normalise = (m) => (m?.files ?? []).map((f) => ({
  ...f,
  baseline: f.baseline ?? m.baseline,
  population: f.population ?? m.population,
}));

export function mergeManifest(existing, run) {
  const fresh = new Map(run.files.map((f) => [f.file, f]));
  const kept = normalise(existing).map((f) => fresh.get(f.file) ?? f);
  const seen = new Set(kept.map((f) => f.file));
  const added = run.files.filter((f) => !seen.has(f.file));
  return { capturedAt: run.capturedAt, files: [...kept, ...added] };
}
