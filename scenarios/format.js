// Scenario format (BSM Appendix B, invariant 6). A scenario is deterministic
// data: events with OFFSET timestamps (seconds relative to a caller-supplied
// base clock — negative reaches into the past), derived ids, and seat-level
// assertions evaluated through the real selectors. No Date.now, no randomness
// (invariant 3): time enters as an input at replay.

import { validateEvent } from '../js/schema.js';
import { emptyState, reduce, tally } from '../js/reducers.js';
import * as sel from '../js/selectors.js';
import { loadEvents, getState } from '../js/store.js';
import { substrateFor } from '../js/config/routing.js';

// ---- events ----

// Concrete, validated events from a scenario. Ids derive from the scenario id
// and position, so the same scenario + base always yields the same log.
export function resolveEvents(scenario, baseSec) {
  return scenario.events.map((e, i) => {
    const ev = {
      id: `${scenario.id}_${i}`,
      type: e.type,
      actor: e.actor,
      ts: (baseSec + e.t) * 1000,
      payload: e.payload,
    };
    try {
      validateEvent(ev);
    } catch (err) {
      throw new Error(`scenario ${scenario.id} event ${i} (${e.type}): ${err.message}`);
    }
    return ev;
  });
}

// The event vocabulary maps onto routed capabilities by prefix.
const CAPABILITY_BY_PREFIX = {
  account: 'accounts', prefs: 'prefs', field: 'fields', post: 'posting',
  comment: 'commenting', vote: 'voting', save: 'saving', report: 'reporting',
  mod: 'moderation', notification: 'notifications',
};

export function capabilityFor(type) {
  const cap = CAPABILITY_BY_PREFIX[type.split('.')[0]];
  if (!cap) throw new Error(`no capability for event type: ${type}`);
  return cap;
}

// ---- replay ----

// Pure replay: fold the resolved events with no store anywhere. This is what
// assertions and the conformance harness evaluate against.
export function replayPure(scenario, baseSec) {
  return resolveEvents(scenario, baseSec).reduce((s, ev) => reduce(s, ev), emptyState());
}

// Substrate replay: drive every event through the REAL write path
// (capability -> routing -> substrate -> store), resetting the live store
// first. Browser Seed, tests, and the conformance harness share this path;
// `table` is the routing override the harness uses to pit substrates.
export function replayOnSubstrate(scenario, baseSec, { table } = {}) {
  loadEvents([]);
  for (const ev of resolveEvents(scenario, baseSec)) {
    substrateFor(capabilityFor(ev.type), table).write(ev.type, ev.payload, { id: ev.id, actor: ev.actor, ts: ev.ts });
  }
  return getState();
}

// Convenience alias: replay on the default routing (all memory today).
export function replayOnMemory(scenario, baseSec) {
  return replayOnSubstrate(scenario, baseSec);
}

// ---- assertions ----

// Named probes: each is seat-level and observable, evaluated through the real
// selectors. Results are plain JSON-able values so substrates compare exactly.
const PROBES = {
  perm: (state, seat, { fieldId, key }, now) => sel.permissions(state, seat, fieldId, now)[key],
  tally: (state, _seat, { type, id }) => tally(state, type, id),
  unread: (state, seat) => sel.notifications(state, seat).unread,
  fieldInfo: (state, seat, { slug, key }, now) => sel.field(state, seat, slug, now)?.[key] ?? null,
  auditTypes: (state, seat, { slug }) => sel.auditLog(state, seat, slug)?.entries.map((e) => e.type) ?? null,
  feedIds: (state, seat, { scope, sort = 'hot', timeframe = 'all' }, now) =>
    sel.feed(state, seat, scope, sort, timeframe, now).posts.map((p) => p.id),
};

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// The replay clock for assertions: just past the scenario's last event.
export function assertionNow(scenario, baseSec) {
  return baseSec + Math.max(...scenario.events.map((e) => e.t)) + 60;
}

// Evaluate every assertion; returns [{seat, probe, expect, got, pass}].
export function runAssertions(scenario, state, baseSec) {
  const now = assertionNow(scenario, baseSec);
  return scenario.assertions.map((a) => {
    const probe = PROBES[a.probe];
    if (!probe) throw new Error(`scenario ${scenario.id}: unknown probe ${a.probe} (known: ${Object.keys(PROBES).join(', ')})`);
    const got = probe(state, a.seat, a.args || {}, now);
    return { seat: a.seat, probe: a.probe, args: a.args, expect: a.expect, got, pass: deepEq(got, a.expect) };
  });
}
