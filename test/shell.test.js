// 3d: the precache registry, mechanical. sw.js SHELL is a hardcoded list and
// the PWA serves a broken offline shell if a runtime module is missing from
// it — this scan turns that from a per-unit reminder into a red gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Files that are NOT runtime modules — every exclusion is explicit and visible.
// (Nothing test-only lives under js/ today; scenario/ledger modules join the
// scan when they become runtime imports in phase 4.)
const EXCLUDED = new Set([]);

function jsFilesUnder(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...jsFilesUnder(rel));
    else if (name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const RUNTIME = [...jsFilesUnder('js'), ...jsFilesUnder('scenarios'), 'data/seed.js']
  .filter((f) => !EXCLUDED.has(f));

test('every runtime module on disk is precached in sw.js SHELL', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const shellMatch = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(shellMatch, 'sw.js has a SHELL list');
  const shell = shellMatch[1];
  for (const file of RUNTIME) {
    assert.ok(shell.includes(`'./${file}'`), `sw.js SHELL is missing ./${file} (add it and bump CACHE)`);
  }
});

test('every SHELL js entry exists on disk (no stale precache entries)', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const entries = [...sw.matchAll(/'\.\/(js\/[^']+|data\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(entries.length > 0);
  for (const e of entries) {
    assert.ok(statSync(join(root, e)).isFile(), `sw.js precaches ./${e} which does not exist`);
  }
});
