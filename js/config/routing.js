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

// A MODE is a named routing table over the same capabilities (plan
// 2026-08-25-1, 1a). memory IS today's table; bbs flips every wire capability
// at once (no partial tier — imported decision 2026-08-24). The bbs substrate
// registers at runtime (phase 5); until then resolving in bbs mode refuses
// with words.
export const MODES = Object.freeze({
  memory: routing,
  bbs: Object.freeze(Object.fromEntries(CAPABILITIES.map((c) => [c, 'bbs']))),
});

let activeMode = 'memory';

export function currentMode() { return activeMode; }

export function setMode(name) {
  if (!MODES[name]) {
    throw new Error(`unknown mode: ${name} (known: ${Object.keys(MODES).join(', ')})`);
  }
  activeMode = name;
}

const SUBSTRATES = { memory };

// Runtime registration for network substrates. Collisions refuse (the memory
// baseline is never silently clobbered); a module without write() refuses
// early rather than failing at first dispatch.
export function registerSubstrate(name, module) {
  if (SUBSTRATES[name]) {
    throw new Error(`substrate already registered: ${name} (known: ${Object.keys(SUBSTRATES).join(', ')})`);
  }
  if (typeof module?.write !== 'function') {
    throw new Error(`substrate ${name} has no write() function`);
  }
  SUBSTRATES[name] = module;
}

// Resolve a capability to its substrate. Fail loud with words: a typo'd
// capability or substrate name must self-diagnose from the error alone.
// With no explicit table the ACTIVE MODE's table applies; the `table`
// override is the seam the conformance harness uses to evaluate the same
// scenario against two substrates regardless of mode.
export function substrateFor(capability, table = MODES[activeMode]) {
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
