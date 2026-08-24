// 4a: the scenario library format (BSM Appendix B). Scenarios are
// deterministic — offset timestamps resolved against a caller-supplied base
// clock, derived ids, no wall clock anywhere — and carry seat-level
// assertions evaluated through the real selectors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEvents, capabilityFor, replayPure, replayOnMemory, runAssertions } from '../scenarios/format.js';
import { fieldLifecycle } from '../scenarios/field-lifecycle.js';
import { SCENARIOS } from '../scenarios/index.js';

const BASE = 1_800_000_000; // replay clock (sec), an explicit input

// Every scenario in the library: both replay paths satisfy its assertions
// and converge on identical observables.
for (const sc of SCENARIOS) {
  test(`scenario ${sc.id}: pure and substrate replays both satisfy every assertion`, () => {
    const pure = runAssertions(sc, replayPure(sc, BASE), BASE);
    for (const r of pure) assert.ok(r.pass, `[pure] ${r.seat} ${r.probe} ${JSON.stringify(r.args)}: expected ${JSON.stringify(r.expect)}, got ${JSON.stringify(r.got)}`);
    const viaSub = runAssertions(sc, replayOnMemory(sc, BASE), BASE);
    for (const r of viaSub) assert.ok(r.pass, `[substrate] ${r.seat} ${r.probe}: got ${JSON.stringify(r.got)}`);
    assert.deepStrictEqual(viaSub.map((r) => r.got), pure.map((r) => r.got));
  });
}

test('resolveEvents is deterministic: same base -> identical events, ids derived from the scenario', () => {
  const a = resolveEvents(fieldLifecycle, BASE);
  const b = resolveEvents(fieldLifecycle, BASE);
  assert.deepStrictEqual(a, b);
  assert.ok(a.every((ev) => ev.id.startsWith(`${fieldLifecycle.id}_`)));
  assert.ok(a.every((ev) => Number.isFinite(ev.ts)));
  // offsets are relative to base: first event at base + its offset
  assert.equal(a[0].ts, (BASE + fieldLifecycle.events[0].t) * 1000);
});

test('capabilityFor maps every event type in the vocabulary to a routed capability', async () => {
  const { EVENT_TYPES } = await import('../js/schema.js');
  const { routing } = await import('../js/config/routing.js');
  for (const type of Object.keys(EVENT_TYPES)) {
    const cap = capabilityFor(type);
    assert.ok(routing[cap], `${type} -> ${cap} must be a routed capability`);
  }
  assert.throws(() => capabilityFor('telepathy.sent'), /telepathy/);
});

test('field-lifecycle: replayed PURE (fold, no store), every assertion passes', () => {
  const state = replayPure(fieldLifecycle, BASE);
  const results = runAssertions(fieldLifecycle, state, BASE);
  for (const r of results) assert.ok(r.pass, `${r.seat} ${r.probe}: expected ${JSON.stringify(r.expect)}, got ${JSON.stringify(r.got)}`);
  assert.ok(results.length >= 5, 'the scenario carries real seat-level coverage');
});

test('field-lifecycle: replayed ON the memory substrate (real write path), same assertions pass', () => {
  const state = replayOnMemory(fieldLifecycle, BASE);
  const results = runAssertions(fieldLifecycle, state, BASE);
  for (const r of results) assert.ok(r.pass, `${r.seat} ${r.probe}: got ${JSON.stringify(r.got)}`);
});

test('substrate replay and pure replay converge on identical observables', () => {
  const viaSubstrate = runAssertions(fieldLifecycle, replayOnMemory(fieldLifecycle, BASE), BASE);
  const viaPure = runAssertions(fieldLifecycle, replayPure(fieldLifecycle, BASE), BASE);
  assert.deepStrictEqual(viaSubstrate.map((r) => r.got), viaPure.map((r) => r.got));
});

test('a scenario event that violates the schema refuses at replay with words', () => {
  const bad = { id: 'bad-sc', description: 'x', events: [{ t: 0, actor: 'u_a', type: 'post.created', payload: { fieldId: 'f', format: 'text', title: 'no id' } }], assertions: [] };
  assert.throws(() => replayPure(bad, BASE), /missing required field: id/);
});
