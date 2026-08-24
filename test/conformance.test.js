// 4d: the conformance harness — and the PROOF that it can fail. A harness
// that has never failed is not yet evidence (BSM roadmap layer 4): memory vs
// memory-with-a-variant-ranking must FAIL while no tolerance covers the
// difference, become TOLERATED under the ledger's set-equality tolerance
// (DL-008), and still FAIL if the variant changes membership, tolerance or no.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConformance } from '../conformance/run.js';
import { replayPure, replayOnMemory, runAssertions } from '../scenarios/format.js';
import { tolerances } from '../ledger/divergence.js';

const BASE = 1_800_000_000;

const pureWorld = { name: 'pure-fold', replay: replayPure };
const memoryWorld = { name: 'memory-substrate', replay: replayOnMemory };

// A deliberately order-perverse ranking variant: same fold, feed membership
// identical, order reversed. This is the shape an engine A/B produces —
// evaluated through the probe-override seam (BSM change-engine step 2).
const variantWorld = {
  name: 'memory-variant-ranking',
  replay: replayPure,
  evaluate: (sc, state, base) => runAssertions(sc, state, base, {
    probeOverrides: {
      feedIds: (s, seat, args, now, ctx, probes) => probes.feedIds(s, seat, args, now, ctx).slice().reverse(),
    },
  }),
};

// A membership-breaking variant: drops the top feed item entirely.
const lossyWorld = {
  name: 'memory-lossy',
  replay: replayPure,
  evaluate: (sc, state, base) => runAssertions(sc, state, base, {
    probeOverrides: {
      feedIds: (s, seat, args, now, ctx, probes) => probes.feedIds(s, seat, args, now, ctx).slice(1),
    },
  }),
};

test('baseline: pure fold vs memory substrate conform exactly (0 fail, 0 tolerated)', () => {
  const report = runConformance({ base: BASE, worldA: pureWorld, worldB: memoryWorld });
  assert.ok(report.length > 0);
  assert.equal(report.filter((r) => r.status === 'fail').length, 0);
  assert.equal(report.filter((r) => r.status === 'tolerated').length, 0);
});

test('the harness CAN fail: variant ranking with NO tolerances is refused, with words', () => {
  const report = runConformance({ base: BASE, worldA: pureWorld, worldB: variantWorld, toleranceEntries: [] });
  const fails = report.filter((r) => r.status === 'fail');
  assert.ok(fails.length > 0, 'the variant must be detected');
  const f = fails[0];
  // a conformance red is diagnosable from the report row alone
  assert.ok(f.scenario && f.probe === 'feedIds');
  assert.ok(Array.isArray(f.a) && Array.isArray(f.b));
  assert.notDeepStrictEqual(f.a, f.b);
});

test('the SAME difference under the ledger tolerance reports tolerated with the DL id', () => {
  const report = runConformance({ base: BASE, worldA: pureWorld, worldB: variantWorld, toleranceEntries: tolerances() });
  assert.equal(report.filter((r) => r.status === 'fail').length, 0);
  const tolerated = report.filter((r) => r.status === 'tolerated');
  assert.ok(tolerated.length > 0);
  assert.ok(tolerated.every((r) => r.ledgerId === 'DL-008'));
});

test('a tolerance is bounded: membership drift still fails under DL-008', () => {
  const report = runConformance({ base: BASE, worldA: pureWorld, worldB: lossyWorld, toleranceEntries: tolerances() });
  assert.ok(report.filter((r) => r.status === 'fail').length > 0);
});

test('non-feed observables never ride the feed tolerance', () => {
  // a variant that perturbs a permission answer must fail even with DL-008 active
  const permBreaker = {
    name: 'perm-breaker',
    replay: replayPure,
    evaluate: (sc, state, base) => runAssertions(sc, state, base, {
      probeOverrides: { perm: () => 'perturbed' },
    }),
  };
  const report = runConformance({ base: BASE, worldA: pureWorld, worldB: permBreaker, toleranceEntries: tolerances() });
  assert.ok(report.filter((r) => r.status === 'fail' && r.probe === 'perm').length > 0);
});
