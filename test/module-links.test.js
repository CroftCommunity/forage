// Every module on disk must LINK — its named imports must exist.
//
// Written after a near-miss on 2026-09-03: js/rings.js retired its `LADDER`
// export and js/ui/lens-views.js kept importing it. That is a SyntaxError at
// module-link time and would have broken the app on load, and the unit suite
// was 764/764 green through the whole thing — because nothing IMPORTS the UI
// modules. test/css-classes.test.js and test/a11y-names.test.js read them with
// readFileSync as text, which proves a string is present and proves nothing
// about whether the file can be loaded at all.
//
// A green suite that grades a set the defect is not in is worse than no suite:
// it manufactures confidence. This is the cheapest possible fix — link every
// module, assert nothing else — and it is deliberately not a behaviour test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
};

// Modules that touch the DOM at import time rather than inside a function.
// Kept as an explicit list so it stays small and visible: an entry here is a
// module this test cannot cover, which is worth seeing rather than inferring.
const NEEDS_DOM = new Set([
  // The entry point: it reaches for document at import time to find its mount
  // hosts, which is what an entry point is for. Covered by the browser tier
  // (e2e/run.mjs) instead, which loads the real page. Saying so here is the
  // point — this is the one module whose imports this test does NOT check.
  'js/main.js',
]);

test('every js/ module links — its named imports all exist', async () => {
  const files = walk(join(root, 'js')).filter((f) => !NEEDS_DOM.has(relative(root, f)));
  const broken = [];
  for (const f of files) {
    try { await import(f); } catch (e) {
      // A missing export is the thing this test is for. A DOM reference at
      // import time is a different (and also interesting) finding, so both are
      // reported with the message rather than collapsed into one verdict.
      broken.push(`${relative(root, f)}: ${e.message.split('\n')[0]}`);
    }
  }
  assert.deepEqual(broken, [], `modules that do not link:\n${broken.join('\n')}`);
});
