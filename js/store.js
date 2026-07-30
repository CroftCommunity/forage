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
  _seq: 0,
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
  const ev = {
    id: opts.id || `ev_${store._seq++}_${store.events.length}`,
    type, actor: opts.actor !== undefined ? opts.actor : store.personaId,
    ts: opts.ts || Date.now(), payload,
  };
  validateEvent(ev);
  store.events.push(ev);
  store.state = reduce(store.state, ev); // incremental fold keeps it O(1) per write
  persist();
  notify();
  return ev;
}

// Bulk load (seed / import): replace log, fold once.
export function loadEvents(events) {
  store.events = events.slice();
  store._seq = events.length;
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
  store._seq = 0;
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
  store._seq = store.events.length;
  store.personaId = data.persona ?? DEFAULT_PERSONA_ID;
  store.dev = { latency: 0, failNext: false, frontiers: true, ...(data.dev || {}) };
  rebuild();
  return true;
}

export function genId(prefix) { return `${prefix}_${store._seq++}_${store.events.length}`; }
