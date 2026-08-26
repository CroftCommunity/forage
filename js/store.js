// The store: event log + derived state + subscriptions. Persona switch re-derives
// all viewer-dependent caches here in one place (spec §9).

import { emptyState, reduce } from './reducers.js';
import { validateEvent } from './schema.js';
import * as storage from './storage.js';
import { DEFAULT_PERSONA_ID } from './personas.js';
// Benign import cycle (store → routing → memory substrate → store): every
// binding is only dereferenced at call time, never during module evaluation.
import { setMode as routingSetMode } from './config/routing.js';

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
  // In a network mode, reset clears the RAM dataset ONLY — `forage.state`
  // belongs to the memory tier and is never cleared from here (1b invariant).
  if (!activeNetworkMode) storage.clearAll();
  notify();
}

function persist() {
  // THE 1b invariant, structurally: while a network mode is active the memory
  // key is never written. Not best-effort — every persist path funnels here.
  if (activeNetworkMode) return;
  storage.save({ events: store.events, persona: store.personaId, dev: store.dev });
}

// ---- mode lifecycle (1b): network modes are RAM-only, memory is untouchable ----

let activeNetworkMode = null; // null = memory mode

export function activeMode() { return activeNetworkMode ?? 'memory'; }

// Enter a network mode: routing flips to the mode's table, the RAM dataset
// starts EMPTY (the mode's substrate fills it — pull-on-entry), and
// persistence to `forage.state` suspends until exitMode.
export function enterMode(name) {
  if (name === 'memory') {
    throw new Error('memory is not entered — use exitMode() to return to it');
  }
  if (activeNetworkMode) {
    throw new Error(`already in ${activeNetworkMode} mode — exitMode() first`);
  }
  routingSetMode(name); // throws with words on an unknown mode; nothing changed
  activeNetworkMode = name;
  store.events = [];
  store.state = emptyState();
  console.info(`forage: entered ${name} mode — RAM only, forage.state suspended`);
  notify();
}

// Exit back to memory: clear the network RAM dataset FIRST (so an absent key
// lands in a genuinely empty memory state — no leak), then restore from the
// untouched key.
export function exitMode() {
  if (!activeNetworkMode) {
    throw new Error('no network mode is active — nothing to exit');
  }
  const leaving = activeNetworkMode;
  activeNetworkMode = null;
  routingSetMode('memory');
  store.events = [];
  store.state = emptyState();
  const had = hydrate();
  console.info(`forage: exited ${leaving} mode — memory restored${had ? '' : ' (empty)'}`);
  notify();
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
