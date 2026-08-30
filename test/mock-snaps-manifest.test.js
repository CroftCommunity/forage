// scripts/mock-snaps.mjs writes plans/mocks/snaps/manifest.json. Until 2026-08-30
// each run REPLACED it whole, so board-cards' re-capture at 0e20a32 overwrote the
// baseline post-and-thread's snaps were taken at (f374bc7) — one page then named
// three different baselines for one set of pixels (mock v17, the drift that
// started the mock-alignment feature). A run now merges: it replaces exactly the
// files it captured, each carrying its own baseline, and leaves the rest alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeManifest } from '../scripts/lib/snaps-manifest.mjs';

const file = (name, baseline, extra = {}) => ({ file: name, route: 'thread', viewport: 'phone', width: 390, height: 844, baseline, population: 'memory:seeded', ...extra });

test('a run replaces the files it captured and keeps the others, each with its own baseline', () => {
  const existing = { files: [file('board.phone.png', 'forage@0e20a32'), file('thread.phone.png', 'forage@0e20a32')] };
  const run = { capturedAt: '2026-08-30', files: [file('thread.phone.png', 'forage@abc1234')] };
  const out = mergeManifest(existing, run);
  assert.deepEqual(out.files.map((f) => [f.file, f.baseline]), [
    ['board.phone.png', 'forage@0e20a32'],
    ['thread.phone.png', 'forage@abc1234'],
  ]);
  assert.equal(out.capturedAt, '2026-08-30', 'the day is the last run’s');
  assert.deepEqual(existing.files.map((f) => f.baseline), ['forage@0e20a32', 'forage@0e20a32'], 'the input is not mutated');
});

test('files are listed in a stable order, new ones after the ones kept', () => {
  const existing = { files: [file('b.png', 'forage@1'), file('a.png', 'forage@1')] };
  const out = mergeManifest(existing, { capturedAt: '2026-08-30', files: [file('c.png', 'forage@2'), file('a.png', 'forage@2')] });
  assert.deepEqual(out.files.map((f) => f.file), ['b.png', 'a.png', 'c.png']);
});

test('no manifest yet: the run is the manifest', () => {
  const out = mergeManifest(null, { capturedAt: '2026-08-30', files: [file('a.png', 'forage@2')] });
  assert.deepEqual(out, { capturedAt: '2026-08-30', files: [file('a.png', 'forage@2')] });
});

test('a legacy manifest with one top-level baseline is read as that baseline on every file', () => {
  const legacy = { baseline: 'forage@0e20a32', capturedAt: '2026-08-30', population: 'memory:seeded',
    files: [{ file: 'board.phone.png', route: 'board', viewport: 'phone', width: 390, height: 844 }] };
  const out = mergeManifest(legacy, { capturedAt: '2026-08-31', files: [] });
  assert.deepEqual(out.files, [{ file: 'board.phone.png', route: 'board', viewport: 'phone', width: 390, height: 844, baseline: 'forage@0e20a32', population: 'memory:seeded' }]);
  assert.equal(out.baseline, undefined, 'the one-baseline-for-all field is gone');
});
