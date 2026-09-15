// The browser-only register (docs/DEVICE-LOCAL.md). Owner, 2026-09-14: Forage keeps
// adding "config or personal things that are browser only for a start, with an eye
// towards PDS persistence — we should build a practice around keeping track of them
// so we don't forget." The practice: every storage key the code touches has a row,
// and the row says whether an account half exists, is planned, is a cache, or is
// device-only by design. The keys are HARVESTED from the code, so a new one cannot
// land unregistered; a row whose key left the code is stale and fails too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const REGISTER = 'docs/DEVICE-LOCAL.md';
const HALVES = new Set(['record', 'planned', 'cache', 'device', 'undecided']);
// 'forage.fyi' is the site's host in share-target.js, not a store
const NOT_A_KEY = new Set(['forage.fyi']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

function harvest() {
  const keys = new Map(); // key -> [files]
  for (const file of walk(join(root, 'js'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?<![\w.])'(forage\.[a-z0-9._-]+)'/g)) {
      if (NOT_A_KEY.has(m[1])) continue;
      keys.set(m[1], [...(keys.get(m[1]) || []), relative(root, file)]);
    }
  }
  return keys;
}

function rows() {
  const md = readFileSync(join(root, REGISTER), 'utf8');
  const out = new Map();
  for (const line of md.split('\n')) {
    const m = line.match(/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| `([a-z]+)` \| (.*) \|$/);
    if (m) out.set(m[1], { store: m[2].trim(), holds: m[3].trim(), half: m[4], plan: m[5].trim() });
  }
  return out;
}

test('every browser-only key the code touches has a row in docs/DEVICE-LOCAL.md, and no row is stale', () => {
  const keys = harvest();
  assert.ok(keys.size >= 30, `harvest found ${keys.size} keys — the regex or the tree changed`);
  const reg = rows();
  const missing = [...keys].filter(([k]) => !reg.has(k)).map(([k, files]) => `${k} (${files.join(', ')})`);
  assert.deepEqual(missing, [], `unregistered browser-only keys — add a row to ${REGISTER}:\n  ${missing.join('\n  ')}`);
  const stale = [...reg.keys()].filter((k) => !keys.has(k));
  assert.deepEqual(stale, [], `rows whose key is no longer in the code — remove or rename them: ${stale.join(', ')}`);
});

test('every row says what its account half is, in the vocabulary, with the reason or the plan the half needs', () => {
  for (const [key, r] of rows()) {
    assert.ok(HALVES.has(r.half), `${key}: account half '${r.half}' is not one of ${[...HALVES].join(' | ')}`);
    assert.ok(r.holds.length > 8, `${key}: says nothing about what it holds`);
    if (r.half === 'record') assert.match(r.plan, /`(fyi\.forage|app\.bsky)\.[a-z.]+`/, `${key}: a 'record' row names the collection the account half lives in`);
    if (r.half === 'planned') assert.match(r.plan, /plans\/|TODO\.md/, `${key}: a 'planned' row points at the plan or the TODO item`);
    if (r.half === 'device' || r.half === 'cache') assert.ok(r.plan.length > 12, `${key}: a '${r.half}' row says WHY it never needs an account half`);
    if (r.half === 'undecided') assert.ok(r.plan.length > 12, `${key}: an 'undecided' row says what the decision is`);
  }
});
