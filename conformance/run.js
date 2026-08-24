// The conformance harness (BSM §6, invariant 9): replay every scenario on two
// worlds, evaluate the IDENTICAL assertions, compare observables. Differences
// are refused unless an ACTIVE ledger tolerance covers them — and a tolerance
// only narrows the comparison (e.g. set-equality), it never waves it through.
//
// A world is { name, replay(scenario, base) -> state, evaluate?(scenario,
// state, base) -> results }; evaluate defaults to the shared runAssertions.
// This is the merge gate: `npm run conformance` (pure fold vs the memory
// substrate today; a network substrate becomes worldB in phase 5).

import { SCENARIOS } from '../scenarios/index.js';
import { replayPure, replayOnMemory, runAssertions } from '../scenarios/format.js';
import { tolerances, COMPARATORS } from '../ledger/divergence.js';

export function runConformance({ scenarios = SCENARIOS, base, worldA, worldB, toleranceEntries = tolerances() }) {
  const report = [];
  for (const sc of scenarios) {
    const evalA = worldA.evaluate || runAssertions;
    const evalB = worldB.evaluate || runAssertions;
    const ra = evalA(sc, worldA.replay(sc, base), base);
    const rb = evalB(sc, worldB.replay(sc, base), base);
    ra.forEach((a, i) => {
      const b = rb[i];
      const row = {
        scenario: sc.id, seat: a.seat, probe: a.probe, args: a.args,
        worlds: `${worldA.name} vs ${worldB.name}`, a: a.got, b: b.got,
      };
      if (JSON.stringify(a.got) === JSON.stringify(b.got)) {
        report.push({ ...row, status: 'pass' });
        return;
      }
      const tol = toleranceEntries.find((t) => t.appliesTo?.probe === a.probe);
      const compare = tol && COMPARATORS[tol.tolerance];
      if (compare && compare(a.got, b.got)) {
        report.push({ ...row, status: 'tolerated', ledgerId: tol.id });
      } else {
        report.push({ ...row, status: 'fail', ledgerId: tol ? tol.id : null });
      }
    });
  }
  return report;
}

// Every non-pass row is one diagnosable line: scenario, seat, probe, both
// observed values, the substrate pair, and the ledger id when one applied.
export function formatReport(report) {
  const lines = [];
  for (const r of report) {
    if (r.status === 'pass') continue;
    const tag = r.status === 'tolerated' ? `TOLERATED (${r.ledgerId})` : 'FAIL';
    lines.push(`${tag} ${r.scenario} seat=${r.seat} probe=${r.probe} args=${JSON.stringify(r.args ?? {})} [${r.worlds}]`);
    lines.push(`  A: ${JSON.stringify(r.a)}`);
    lines.push(`  B: ${JSON.stringify(r.b)}`);
  }
  const counts = { pass: 0, tolerated: 0, fail: 0 };
  for (const r of report) counts[r.status]++;
  lines.push(`conformance: ${counts.pass} pass, ${counts.tolerated} tolerated, ${counts.fail} fail over ${report.length} observables`);
  return lines.join('\n');
}

// CLI: pure fold (the contract's spec) vs the memory substrate (the live
// write path). A fixed base keeps runs byte-identical.
const CLI_BASE = 1_800_000_000;
if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runConformance({
    base: CLI_BASE,
    worldA: { name: 'pure-fold', replay: replayPure },
    worldB: { name: 'memory-substrate', replay: replayOnMemory },
  });
  console.log(formatReport(report));
  process.exit(report.some((r) => r.status === 'fail') ? 1 : 0);
}
