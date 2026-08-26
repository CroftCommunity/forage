// 3o: the deployed-version verifier (owner ask 2026-08-26). "Am I looking at
// the new deploy?" is answerable in Settings: the SHELL version on the server
// vs the one this browser is actually running (a service worker can keep an
// old shell alive for a load or two).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShellVersion, versionStatus } from '../js/version.js';

test('parseShellVersion pulls the cache name out of sw.js source', () => {
  assert.equal(parseShellVersion("const CACHE = 'forage-v20';\n"), 'forage-v20');
  assert.equal(parseShellVersion('const CACHE = "forage-v7";'), 'forage-v7');
  assert.equal(parseShellVersion('nothing here'), null);
  assert.equal(parseShellVersion(''), null);
});

test('versionStatus: matching = current, differing = stale (with both versions named)', () => {
  const cur = versionStatus({ deployed: 'forage-v20', running: 'forage-v20' });
  assert.equal(cur.state, 'current');
  assert.match(cur.label, /forage-v20/);

  const stale = versionStatus({ deployed: 'forage-v21', running: 'forage-v20' });
  assert.equal(stale.state, 'stale');
  assert.match(stale.label, /forage-v20/, 'says what you are running');
  assert.match(stale.label, /forage-v21/, 'and what is deployed');
  assert.match(stale.label, /reload/i, 'and what to do about it');
});

test('versionStatus: no worker yet is NOT stale — it is simply not cached', () => {
  const fresh = versionStatus({ deployed: 'forage-v20', running: null });
  assert.equal(fresh.state, 'live');
  assert.match(fresh.label, /forage-v20/);
  assert.match(fresh.label, /no cached/i);
});

test('versionStatus: an unreachable server is unknown, never a false "current"', () => {
  const un = versionStatus({ deployed: null, running: 'forage-v20' });
  assert.equal(un.state, 'unknown');
  assert.match(un.label, /forage-v20/);
});
