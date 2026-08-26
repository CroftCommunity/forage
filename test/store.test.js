// 2c: the load path validates like dispatch does — hardening is not
// bypassable via Seed or Import. Fail loud: refuse the whole load, with
// words naming the offending event.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory localStorage so the storage adapter runs headless.
const bag = new Map();
globalThis.localStorage = {
  getItem: (k) => (bag.has(k) ? bag.get(k) : null),
  setItem: (k, v) => bag.set(k, String(v)),
  removeItem: (k) => bag.delete(k),
};

const store = await import('../js/store.js');
const storage = await import('../js/storage.js');
const { buildSeed } = await import('../data/seed.js');

const valid = (id, ts) => ({
  id: `ev_${id}`, type: 'account.registered', actor: `u_${id}`, ts, payload: { handle: `h${id}` },
});

test('loadEvents refuses an invalid event, naming its index and type, and loads nothing', () => {
  store.loadEvents([valid('a', 1)]);
  const before = store.getEvents().length;
  const badLog = [
    valid('b', 2),
    valid('c', 3),
    { id: 'ev_bad', type: 'post.created', actor: 'u_b', ts: 4, payload: { feedId: 'f1', format: 'text', title: 'no id' } },
  ];
  assert.throws(() => store.loadEvents(badLog), /event 2 \(post\.created\)/);
  assert.throws(() => store.loadEvents(badLog), /missing required feed: id/);
  assert.equal(store.getEvents().length, before, 'a refused load must not replace the log');
});

test('the full seed loads green end to end (buildSeed -> loadEvents -> fold)', () => {
  store.loadEvents(buildSeed());
  // 8 persona seats + the scenario-only seats (u_newt, u_alder, u_dell)
  assert.equal(Object.keys(store.getState().users).length, 11);
});

test('SCHEMA_VERSION is 2 — pre-hardening stored logs are discarded', () => {
  assert.equal(storage.SCHEMA_VERSION, 2);
});

test('importJson refuses a version mismatch with words naming both versions', () => {
  const doc = JSON.stringify({ version: 1, events: [valid('v', 1)] });
  assert.throws(() => storage.importJson(doc), /v1/);
  assert.throws(() => storage.importJson(doc), /v2/);
});

test('importJson refuses a document without events[]', () => {
  assert.throws(() => storage.importJson('{"version":2}'), /events/);
});

// ---- 2d: actor-scoped ids (ADR-001) ----

test('genId is <prefix>_<actorId>_<perActorSeq>, derived from the log', () => {
  store.loadEvents([valid('a1', 1), valid('a2', 2)].map((e, i) => ({ ...e, actor: i === 0 ? 'u_a' : 'u_b' })));
  // u_a has 1 event in the log, u_b has 1
  assert.equal(store.genId('p', 'u_a'), 'p_u_a_1');
  assert.equal(store.genId('p', 'u_b'), 'p_u_b_1');
  assert.equal(store.genId('p', 'u_a'), 'p_u_a_1'); // pure until a commit lands
});

test('ids from different actors can never collide (actor is embedded)', () => {
  store.loadEvents([]);
  const a = store.genId('c', 'u_alice');
  const b = store.genId('c', 'u_bob');
  assert.notEqual(a, b);
  assert.match(a, /^c_u_alice_\d+$/);
  assert.match(b, /^c_u_bob_\d+$/);
});

test('commit stamps actor-scoped event ids that advance with the actor log', () => {
  store.loadEvents([]);
  const e1 = store.commit('account.registered', { handle: 'a' }, { actor: 'u_a' });
  const e2 = store.commit('feed.created', { id: store.genId('f', 'u_a'), slug: 'g', title: 'G' }, { actor: 'u_a' });
  const e3 = store.commit('account.registered', { handle: 'b' }, { actor: 'u_b' });
  assert.equal(e1.id, 'ev_u_a_0');
  assert.equal(e2.id, 'ev_u_a_1');
  assert.equal(e2.payload.id, 'f_u_a_1'); // same per-actor seq, distinct prefix
  assert.equal(e3.id, 'ev_u_b_0');
});

test('importJson no longer stamps the current version over its input', () => {
  const doc = { version: 2, events: [valid('w', 1)], persona: null, dev: {} };
  storage.importJson(JSON.stringify(doc));
  const written = JSON.parse(globalThis.localStorage.getItem('forage.state'));
  assert.equal(written.version, 2);
  assert.equal(written.events.length, 1);
});

// ---- the Feed → feed rename (2026-08-26): make the break LOUD ----
// The rename changed the event vocabulary itself (`feed.created` →
// `feed.created`), which is a data-format change: pre-1.0, no migration layer.
// But "breaks" must mean "says so". The reducer's switch has no default branch,
// so a legacy log would otherwise fold into an EMPTY sandbox — the worst
// possible failure, indistinguishable from "you have never used this".

test('rename: a legacy field.* log is DETECTED, not silently folded into nothing', async () => {
  const { legacyLog } = await import('../js/store.js');

  // NOTE: the `field.*` strings below are the OLD vocabulary on purpose. A
  // search-and-replace that "fixes" them inverts this test into asserting that
  // current logs are legacy — which is exactly what happened during the rename,
  // and what this note exists to prevent next time.
  assert.equal(legacyLog([{ type: 'feed.created', payload: {} }]), false, 'current events are fine');
  assert.equal(legacyLog([]), false, 'an empty log is not a legacy log');
  assert.equal(legacyLog(null), false);

  assert.equal(legacyLog([{ type: 'account.registered' }, { type: 'field.created' }]), true);
  assert.equal(legacyLog([{ type: 'field.joined' }]), true);
  assert.equal(legacyLog([{ type: 'field.settingsUpdated' }]), true);
  assert.equal(legacyLog([{ type: 'post.created', payload: { fieldId: 'f_1' } }]), true,
    'a fieldId in a payload is a pre-rename log even if the type survived');
});
