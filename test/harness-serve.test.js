// e2e/harness/serve.mjs serves THIS checkout by default; scripts/mock-snaps.mjs
// asks it to serve another one (main) so a mock's Current frames come from the
// tree the owner runs, captured by the branch's own script and fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '../e2e/harness/serve.mjs';

test('serve({ root }) serves that tree, not this checkout', async () => {
  const root = mkdtempSync(join(tmpdir(), 'forage-serve-'));
  writeFileSync(join(root, 'index.html'), '<title>another tree</title>');
  const s = await serve({ root });
  try {
    assert.equal(await (await fetch(`${s.origin}/`)).text(), '<title>another tree</title>');
    const missing = await fetch(`${s.origin}/deep/link`);
    assert.equal(missing.status, 404, 'no 404.html in that tree: a plain 404, never this checkout’s shell');
  } finally { await s.close(); }
});

test('serve() with no root serves this checkout', async () => {
  const s = await serve();
  try { assert.match(await (await fetch(`${s.origin}/`)).text(), /Forage/); } finally { await s.close(); }
});
