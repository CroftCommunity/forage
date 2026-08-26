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

const RUNTIME = [...jsFilesUnder('js'), ...jsFilesUnder('scenarios'), ...jsFilesUnder('ledger'), ...jsFilesUnder('vendor'), 'data/seed.js']
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

test('the SHELL precaches the app shell itself so clean-path deep links work offline (3n)', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  assert.ok(shell.includes("'/'"), "sw.js SHELL precaches '/' (the navigation fallback)");
  assert.ok(shell.includes("'/404.html'"), 'sw.js SHELL precaches /404.html (the Pages deep-link shell)');
  readFileSync(join(root, '404.html')); // throws if missing
});

test('the preview server mirrors the Pages fallback (so local deep links behave like production)', () => {
  const src = readFileSync(join(root, 'scripts/preview.mjs'), 'utf8');
  assert.match(src, /404\.html/, 'preview serves the shell for unknown paths');
  assert.match(src, /extname\(file\)/, 'a missing ASSET is still a plain 404');
});

test('404.html is byte-identical to index.html (Pages serves it for every deep link)', () => {
  assert.equal(readFileSync(join(root, '404.html'), 'utf8'), readFileSync(join(root, 'index.html'), 'utf8'),
    'regenerate: cp index.html 404.html');
});

test('every SHELL js entry exists on disk (no stale precache entries)', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const entries = [...sw.matchAll(/'\.\/(js\/[^']+|data\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(entries.length > 0);
  for (const e of entries) {
    assert.ok(statSync(join(root, e)).isFile(), `sw.js precaches ./${e} which does not exist`);
  }
});
