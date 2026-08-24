// 2h: invariant 3, mechanical. The read layer (selectors), the fold
// (reducers), and the engines are provably store-free and clock-free —
// a static scan, so a regression cannot land quietly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PURE = [
  'js/selectors.js',
  'js/reducers.js',
  ...readdirSync(join(root, 'js/engines')).map((f) => `js/engines/${f}`),
];

// `nowSec` as a bare identifier stays LEGAL: engines take it as a parameter,
// which is exactly the time-as-input shape invariant 3 demands. What is
// banned is reaching for a clock (Date.now), randomness, or the store —
// reintroducing store.nowSec()/getEvents() requires the banned import.
const FORBIDDEN = [
  [/Date\.now/, 'Date.now (time is an input, resolved at dispatch or replay)'],
  [/Math\.random/, 'Math.random (randomness is an input)'],
  [/from\s+['"][^'"]*store\.js['"]/, 'an import of the store singleton'],
];

for (const file of PURE) {
  test(`${file} is pure — no clock, no randomness, no store`, () => {
    const src = readFileSync(join(root, file), 'utf8');
    for (const [re, why] of FORBIDDEN) {
      assert.ok(!re.test(src), `${file} contains ${why}`);
    }
  });
}
