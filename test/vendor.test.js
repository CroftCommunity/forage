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

// feed-row v13 decision 30 (native video in place): hls.js, the SECOND vendored
// runtime artifact. Chromium and Firefox cannot play Bluesky's HLS playlists
// without it; Safari can, and the player only loads this file when it must.
// Same two-way pin: content sha256 + the version the header names.
const HLS_FILE = join(root, 'vendor', 'hls.light.min.js');
const HLS_PINNED_VERSION = '1.7.1';
const HLS_PINNED_SHA256 = '839aa4ef944a01ed62b07f0f5deeb323732e8fc0e93f1d725c01e73dc2d615b1';

test('hls.js: the header records provenance and the content matches the pin', () => {
  const rawHls = readFileSync(HLS_FILE, 'utf8');
  const idx = rawHls.indexOf('content sha256');
  assert.ok(idx > 0, 'header carries the content sha256 line');
  const end = rawHls.indexOf('\n', idx) + 1;
  const header = rawHls.slice(0, end);
  assert.match(header, new RegExp(`hls\\.js@${HLS_PINNED_VERSION.replace(/\./g, '\\.')}`), 'the header names the pinned version');
  assert.match(header, /Apache-2\.0/, 'and the licence (rung 2 decides licences the way it decides CVEs)');
  assert.match(header, /cdn\.jsdelivr\.net\/npm\/hls\.js@/, 'and where the bytes came from');
  const sha = createHash('sha256').update(rawHls.slice(end)).digest('hex');
  assert.equal(sha, HLS_PINNED_SHA256, 'vendored hls.js drifted — if deliberate, re-fetch per the header and re-pin');
  assert.ok(header.includes(HLS_PINNED_SHA256), 'the header’s sha line agrees with the pin');
});
