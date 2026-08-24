// The store: event log + derived state + subscriptions. Persona switch re-derives
// all viewer-dependent caches here in one place (spec §9).

import { emptyState, reduce } from './reducers.js';
import { validateEvent } from './schema.js';
import * as storage from './storage.js';
import { DEFAULT_PERSONA_ID } from './personas.js';

const listeners = new Set();

const store = {
  events: [],
  state: emptyState(),
  personaId: DEFAULT_PERSONA_ID,
  dev: { latency: 0, failNext: false, frontiers: true },
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { for (const fn of listeners) fn(store); }

export function getState() { return store.state; }
export function getEvents() { return store.events; }
export function getPersonaId() { return store.personaId; }
export function getDev() { return store.dev; }

// Rebuild derived state from the whole log (a pure fold — no drift possible).
function rebuild() {
  let st = emptyState();
  for (const ev of store.events) st = reduce(st, ev);
  store.state = st;
}

export function nowSec() { return Math.floor(Date.now() / 1000); }

// Append a validated event and re-derive. Returns the event.
export function commit(type, payload, opts = {}) {
  const actor = opts.actor !== undefined ? opts.actor : store.personaId;
  const ev = {
    id: opts.id || genId('ev', actor),
    type, actor,
    ts: opts.ts || Date.now(), payload,
  };
  validateEvent(ev);
  store.events.push(ev);
  store.state = reduce(store.state, ev); // incremental fold keeps it O(1) per write
  persist();
  notify();
  return ev;
}

// Bulk load (seed / import): replace log, fold once. Every event validates
// like dispatch does — a single bad event refuses the WHOLE load (fail loud,
// load nothing), with words naming the offender for the toast/console.
export function loadEvents(events) {
  events.forEach((ev, i) => {
    try {
      validateEvent(ev);
    } catch (e) {
      throw new Error(`load refused: event ${i} (${ev && ev.type}): ${e.message}`);
    }
  });
  store.events = events.slice();
  rebuild();
  persist();
  notify();
}

export function setPersona(id) {
  store.personaId = id;
  persist();
  notify(); // one place: re-derives all viewer-dependent views
}

export function setDev(patch) {
  store.dev = { ...store.dev, ...patch };
  persist();
  notify();
}

export function reset() {
  store.events = [];
  store.state = emptyState();
  storage.clearAll();
  notify();
}

function persist() {
  storage.save({ events: store.events, persona: store.personaId, dev: store.dev });
}

// Hydrate from storage on boot. Returns true if there was saved state.
export function hydrate() {
  const data = storage.load();
  if (!data) return false;
  store.events = data.events || [];
  store.personaId = data.persona ?? DEFAULT_PERSONA_ID;
  store.dev = { latency: 0, failNext: false, frontiers: true, ...(data.dev || {}) };
  rebuild();
  return true;
}

// Actor-scoped ids (ADR-001): <prefix>_<actorId>_<perActorSeq>. Deterministic —
// the sequence is derived from the log, no mutable counter, no randomness — and
// collision-free across actors by construction (the actor is embedded). Known
// limitation: one actor writing from two devices concurrently can still collide;
// accepted for the memory tier, revisited when ids meet atproto rkeys (phase 5).
export function genId(prefix, actor = store.personaId) {
  let n = 0;
  for (const e of store.events) if (e.actor === actor) n++;
  return `${prefix}_${actor}_${n}`;
}
