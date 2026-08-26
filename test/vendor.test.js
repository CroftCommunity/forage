// 2a: the vendored OAuth client's drift check (plan 2026-08-25-1). The bundle
// is the ONE third-party runtime artifact in the repo; this test pins it in
// both directions (workspace dependency-sourcing rule: vendor + CI drift check):
//  - file content edited → sha mismatch → red
//  - version bumped in the header without re-pinning here → red
// The pins live HERE, not in the file, so the file cannot self-certify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(root, 'vendor', 'atproto-oauth-client-browser.js');

// THE PINS. Re-vendoring = rebuild per the header's recorded command, then
// update BOTH pins here in the same commit.
const PINNED_VERSION = '0.5.3';
const PINNED_SHA256 = 'ad8b0860092bdc5072493ee40101ea1378c788ae0665b3d84370d8dc3901f1cd';

const raw = readFileSync(FILE, 'utf8');
const shaLineIdx = raw.indexOf('content sha256');
const headerEnd = raw.indexOf('\n', shaLineIdx) + 1;

test('the header records provenance: package@version, build command, sha line', () => {
  const header = raw.slice(0, headerEnd);
  assert.match(header, new RegExp(`@atproto/oauth-client-browser@${PINNED_VERSION.replace(/\./g, '\\.')}`));
  assert.match(header, /npx esbuild .*--bundle --format=esm --minify/);
  assert.match(header, /atprotoLoopbackClientMetadata/);
  assert.ok(shaLineIdx > 0, 'header carries the content sha256 line');
});

test('the bundle content below the header matches the pinned sha256 (drift check)', () => {
  const content = raw.slice(headerEnd);
  const sha = createHash('sha256').update(content).digest('hex');
  assert.equal(sha, PINNED_SHA256,
    'vendored bundle drifted — if deliberate, rebuild per the header and re-pin BOTH constants');
  // and the header's own sha line agrees with the pin (one story, two places)
  assert.ok(raw.slice(0, headerEnd).includes(PINNED_SHA256), 'header sha equals the pinned sha');
});

test('the bundle parses under node and exports the two client symbols', () => {
  // A bare import leaves an open handle (the Locks API fallback — D4), so the
  // check runs in a child that exits explicitly.
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    const m = await import(${JSON.stringify(FILE)});
    if (typeof m.BrowserOAuthClient !== 'function') throw new Error('no BrowserOAuthClient');
    if (typeof m.atprotoLoopbackClientMetadata !== 'function') throw new Error('no atprotoLoopbackClientMetadata');
    process.exit(0);
  `], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, `child import failed: ${r.stderr}`);
});
