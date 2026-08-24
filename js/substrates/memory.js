// The memory substrate — today's whole backend, extracted behind the seam.
// This is the ONLY module allowed to call store.commit (invariant 1's teeth,
// enforced mechanically by test/invariants.test.js). It stays permanent as the
// hermetic CI/CD instrument and the conformance baseline even after real
// network substrates exist.

import { commit } from '../store.js';

// Persist one validated event. Synchronous truth — transport concerns
// (latency, failure simulation, and later a real network) belong to the
// actions adapter wrapping this, not to the substrate.
export function write(type, payload, opts) {
  return commit(type, payload, opts);
}
