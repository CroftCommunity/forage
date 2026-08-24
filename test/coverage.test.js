// 4b: invariant 6, mechanical — every mutation type in the vocabulary is
// exercised by at least one scenario. A new event type without a scenario
// turns this red; so does a scenario library that quietly loses coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TYPES } from '../js/schema.js';
import { SCENARIOS } from '../scenarios/index.js';

test('every EVENT_TYPES mutation is touched by at least one scenario', () => {
  const touched = new Set(SCENARIOS.flatMap((s) => s.events.map((e) => e.type)));
  const uncovered = Object.keys(EVENT_TYPES).filter((t) => !touched.has(t));
  assert.deepStrictEqual(uncovered, [], `uncovered mutation types: ${uncovered.join(', ')}`);
});

test('every scenario carries at least one assertion (no assertion-free replays)', () => {
  for (const s of SCENARIOS) {
    assert.ok(s.assertions.length > 0, `${s.id} has no assertions`);
  }
});

test('scenario ids are unique', () => {
  const ids = SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});
