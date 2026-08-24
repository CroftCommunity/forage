// The seed IS the scenario library (4c). buildSeed replays every registered
// scenario onto one timeline — each scenario gets its own staggered base so
// the worlds interleave sanely, with the last (demo-extras, the gardening
// world) landing at the caller's base so it reads freshest in the browser.
//
// Time enters HERE, at the dispatch boundary — the default base is the call
// moment, which is exactly where invariant 3 says the clock may be resolved.
// Tests pass a fixed base and get a byte-identical log every time.

import { SCENARIOS } from '../scenarios/index.js';
import { resolveEvents } from '../scenarios/format.js';

const HOUR = 3600;

export function buildSeed(baseSec = Math.floor(Date.now() / 1000)) {
  const events = SCENARIOS.flatMap((s, i) =>
    resolveEvents(s, baseSec - (SCENARIOS.length - 1 - i) * HOUR));
  return events.sort((a, b) => a.ts - b.ts); // stable: ties keep library order
}
