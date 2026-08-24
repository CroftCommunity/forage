// Routing config — the tier dial (BSM Appendix B, invariant 4). Substrate
// selection happens HERE and nowhere else: flipping a capability to another
// substrate is a one-line change in this table, and that flip IS the tier.
// Values name substrate modules registered below.

import * as memory from '../substrates/memory.js';

export const routing = {
  posting:       'memory',
  commenting:    'memory',
  voting:        'memory',
  saving:        'memory',
  fields:        'memory',
  moderation:    'memory',
  reporting:     'memory',
  notifications: 'memory',
  accounts:      'memory',
  prefs:         'memory',
};

export const CAPABILITIES = Object.freeze(Object.keys(routing));

const SUBSTRATES = { memory };

// Resolve a capability to its substrate. Fail loud with words: a typo'd
// capability or substrate name must self-diagnose from the error alone.
// The `table` override is the seam the conformance harness (phase 4) uses
// to evaluate the same scenario against two substrates.
export function substrateFor(capability, table = routing) {
  const name = table[capability];
  if (!name) {
    throw new Error(`unknown capability: ${capability} (known: ${Object.keys(table).join(', ')})`);
  }
  const substrate = SUBSTRATES[name];
  if (!substrate) {
    throw new Error(`unknown substrate: ${name} for capability ${capability} (known: ${Object.keys(SUBSTRATES).join(', ')})`);
  }
  return substrate;
}
