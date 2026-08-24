// 5e: conformance memory <-> scoped-atproto. World B replays every scenario
// through the FULL codec round-trip — events -> record set (create/put/
// delete on member repos) -> decoded events -> fold — and must satisfy the
// identical seat-level assertions and match the memory world's observables.
// The event<->record round-trip is the contract's proof at this tier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConformance } from '../conformance/run.js';
import { resolveEvents, replayPure, runAssertions } from '../scenarios/format.js';
import { SCENARIOS } from '../scenarios/index.js';
import { encodeEvents, decodeRecords } from '../js/substrates/atproto.js';
import { tolerances, LEDGER } from '../ledger/divergence.js';
import { emptyState, reduce } from '../js/reducers.js';

const BASE = 1_800_000_000;

const memoryWorld = { name: 'pure-fold', replay: replayPure };
const scopedWorld = {
  name: 'scoped-atproto-roundtrip',
  replay: (sc, base) => {
    const { records, locals } = encodeEvents(resolveEvents(sc, base));
    return decodeRecords(records, locals).reduce((s, e) => reduce(s, e), emptyState());
  },
};

test('every scenario satisfies its own assertions through the codec round-trip', () => {
  for (const sc of SCENARIOS) {
    const results = runAssertions(sc, scopedWorld.replay(sc, BASE), BASE);
    for (const r of results) {
      assert.ok(r.pass, `${sc.id}: ${r.seat} ${r.probe} ${JSON.stringify(r.args)} expected ${JSON.stringify(r.expect)}, got ${JSON.stringify(r.got)}`);
    }
  }
});

test('conformance memory <-> scoped: no unledgered divergence across the library', () => {
  const report = runConformance({ base: BASE, worldA: memoryWorld, worldB: scopedWorld, toleranceEntries: tolerances() });
  const fails = report.filter((r) => r.status === 'fail');
  assert.deepStrictEqual(fails.map((f) => `${f.scenario}/${f.probe}/${JSON.stringify(f.args)}: A=${JSON.stringify(f.a)} B=${JSON.stringify(f.b)}`), []);
  assert.ok(report.length >= 80, 'the whole library ran');
});

test('the known unprobed divergence is a ledgered proposal (DL-009)', () => {
  const dl9 = LEDGER.find((e) => e.id === 'DL-009');
  assert.equal(dl9?.kind, 'proposal');
  assert.match(dl9.description, /title/i);
});
