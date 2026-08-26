// Route reachability. A route table is a list of patterns tried IN ORDER, and
// the first match wins — so a generic pattern registered above a specific one
// silently swallows it. Reading js/main.js tells you nothing: every route looks
// present and correct, because the defect lives in the order, not the lines.
//
// Found live 2026-08-26: `/f/:handle/:rkey` sat above `/f/:slug/settings`, so
// `/f/gardening/settings` matched handle=gardening, rkey=settings. Field
// settings was unreachable in both modes on production — in lens mode it fired
// a doomed resolveHandle against the literal string "settings".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The patterns, in registration order, straight from the source of truth.
function declaredRoutes() {
  const src = readFileSync(join(root, 'js/main.js'), 'utf8');
  return [...src.matchAll(/^\s*router\.route\('([^']+)'/gm)].map((m) => m[1]);
}

// Compiled exactly as js/router.js compiles them — if that changes, this must.
function compile(pattern) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
  return { rx, keys };
}

// A concrete path that the pattern is meant to serve. Params get a value that
// cannot be confused with a literal segment appearing elsewhere in the table.
function sampleFor(pattern, i) {
  return pattern.replace(/:[^/]+/g, (_, __) => `p${i}`);
}

test('router.js still compiles params as single segments', () => {
  // sampleFor and compile above mirror js/router.js. If the real compiler
  // changes shape, this test is measuring a fiction — so pin it.
  const src = readFileSync(join(root, 'js/router.js'), 'utf8');
  assert.match(src, /\(\[\^\/\]\+\)/,
    'router compiles :params as ([^/]+); update this test if that changes');
});

test('every declared route is REACHABLE — no earlier pattern swallows a later one', () => {
  const patterns = declaredRoutes();
  assert.ok(patterns.length > 10, `found ${patterns.length} routes, expected the full table`);

  const compiled = patterns.map(compile);
  const shadowed = [];

  patterns.forEach((pattern, i) => {
    const path = sampleFor(pattern, i);
    const firstMatch = compiled.findIndex((c) => c.rx.test(path));
    if (firstMatch !== i) {
      shadowed.push(
        `'${pattern}' (position ${i}) is unreachable: the path ${path} is taken by ` +
        `'${patterns[firstMatch]}' at position ${firstMatch}`);
    }
  });

  assert.deepEqual(shadowed, [],
    `${shadowed.length} route(s) can never run:\n  ${shadowed.join('\n  ')}`);
});

test('the specific /f/ sub-routes outrank the generic two-segment shape', () => {
  // The regression named above, pinned directly rather than only via the
  // general check, so a future reordering fails with the reason attached.
  const patterns = declaredRoutes();
  const generic = patterns.indexOf('/f/:handle/:rkey');
  const settings = patterns.indexOf('/f/:slug/settings');
  assert.notEqual(generic, -1, 'the creator-qualified feed route still exists');
  assert.notEqual(settings, -1, 'the field settings route still exists');
  assert.ok(settings < generic,
    '/f/:slug/settings must be registered BEFORE /f/:handle/:rkey — both are two ' +
    'segments under /f/, so whichever is first wins, and the generic one must be ' +
    'the fallback rather than the interceptor');
});
