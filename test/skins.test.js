// 4a: the skin mechanism (plan 2026-08-25-1). A skin is a token-sheet swap —
// a stylesheet that may ONLY assign custom properties DECLARED in
// css/tokens.css. The static scan is the teeth: skins cannot smuggle
// component rewrites. Skins and modes are independent axes (user 2026-08-25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKINS, hrefFor, skinScan, declaredTokens, SKIN_KEY } from '../js/skins.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the registry: default is the no-op; every entry carries a label; files exist', () => {
  assert.ok(SKINS.default, 'default skin exists');
  assert.equal(SKINS.default.file, null, 'default = no stylesheet = todays look, zero behavior change');
  for (const [id, s] of Object.entries(SKINS)) {
    assert.ok(s.label, `${id} has a label`);
    if (s.file) readFileSync(join(root, s.file)); // throws if missing
  }
});

test('hrefFor: default → null (no link element); others → their file', () => {
  assert.equal(hrefFor('default'), null);
  assert.throws(() => hrefFor('neon-dreams'), (e) => {
    assert.match(e.message, /neon-dreams/);
    assert.match(e.message, /default/);
    return true;
  });
});

test('the skin preference key is its own device-local key, never forage.state', () => {
  assert.equal(SKIN_KEY, 'forage.skin');
});

test('declaredTokens parses the real token sheet (fonts and radii included)', () => {
  const tokens = declaredTokens(readFileSync(join(root, 'css/tokens.css'), 'utf8'));
  assert.ok(tokens.has('--bg'));
  assert.ok(tokens.has('--font-body'));
  assert.ok(tokens.has('--radius-card'));
  assert.ok(tokens.size > 50);
});

test('skinScan passes a well-behaved token-only skin', () => {
  const tokens = new Set(['--bg', '--text', '--font-body']);
  const r = skinScan(`/* era palette */
:root { --bg: #000; --text: #3f3; --font-body: ui-monospace, monospace; }
:root[data-theme="light"] { --bg: #111; }`, tokens);
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test('skinScan BITES: a component rule and an undeclared token both turn it red', () => {
  const tokens = new Set(['--bg']);
  const bad = skinScan(`:root { --bg: #000; } .card { display: none; }`, tokens);
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some((v) => v.includes('display')), 'the smuggled component rule is named');
  const undeclared = skinScan(`:root { --sneaky-new-token: red; }`, new Set(['--bg']));
  assert.equal(undeclared.ok, false);
  assert.ok(undeclared.violations.some((v) => v.includes('--sneaky-new-token')));
});

test('every REGISTERED skin file passes the scan against the real tokens', () => {
  const tokens = declaredTokens(readFileSync(join(root, 'css/tokens.css'), 'utf8'));
  for (const [id, s] of Object.entries(SKINS)) {
    if (!s.file) continue;
    const r = skinScan(readFileSync(join(root, s.file), 'utf8'), tokens);
    assert.deepEqual(r.violations, [], `${id} must only assign declared tokens`);
  }
});
