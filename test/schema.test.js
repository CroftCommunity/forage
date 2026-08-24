// Characterization: validateEvent as it behaves TODAY (phase 1b).
// Known-bad accepts are pinned as current behavior with paired `todo`
// tests naming the phase-2b target; 2b flips the todos RED->GREEN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent, EVENT_TYPES } from '../js/schema.js';

const ev = (type, payload, actor = 'u_alice', rest = {}) =>
  ({ type, actor, ts: 1000, payload, ...rest });

// ---- accepts ----

test('accepts a minimal valid post.created', () => {
  assert.equal(validateEvent(ev('post.created', { id: 'p1', fieldId: 'f1', format: 'text', title: 'hi' })), true);
});

test('accepts account.registered with no actor (bootstrap exemption)', () => {
  const e = { type: 'account.registered', ts: 1000, payload: { handle: 'alice' } };
  assert.equal(validateEvent(e), true);
});

test('accepts vote.set at every legal value: -1, 0, 1', () => {
  for (const value of [-1, 0, 1]) {
    assert.equal(validateEvent(ev('vote.set', { subjectType: 'post', subjectId: 'p1', value })), true);
  }
});

test('accepts an actor that was never registered (presence, not existence)', () => {
  // Seed's synthetic voters (sv_N) rely on this; 2b must preserve it.
  assert.equal(validateEvent(ev('vote.set', { subjectType: 'post', subjectId: 'p1', value: 1 }, 'sv_99')), true);
});

// ---- rejects ----

test('rejects a non-object event', () => {
  assert.throws(() => validateEvent(null), /event must be an object/);
  assert.throws(() => validateEvent('post.created'), /event must be an object/);
});

test('rejects an unknown event type', () => {
  assert.throws(() => validateEvent(ev('post.upvoted', {})), /unknown event type/);
});

test('rejects a missing required field, naming it', () => {
  assert.throws(
    () => validateEvent(ev('post.created', { id: 'p1', fieldId: 'f1', format: 'text' })),
    /post\.created missing required field: title/,
  );
});

test('rejects a null payload when fields are required', () => {
  assert.throws(() => validateEvent(ev('post.created', null)), /missing required field/);
});

test('rejects vote.set with an out-of-range value', () => {
  for (const value of [2, -2, 0.5, '1']) {
    assert.throws(() => validateEvent(ev('vote.set', { subjectType: 'post', subjectId: 'p1', value })), /-1\|0\|1/);
  }
});

test('rejects actor: undefined on a non-registration event', () => {
  const e = { type: 'post.created', ts: 1000, payload: { fieldId: 'f1', format: 'text', title: 'hi' } };
  assert.throws(() => validateEvent(e), /requires an actor/);
});

// ---- hardened rules (2b): both sides of each ----

test('actor null AND undefined rejected on every type except account.registered', () => {
  const payload = { fieldId: 'f1', format: 'text', title: 'hi' };
  assert.throws(() => validateEvent(ev('post.created', payload, null)), /requires an actor/);
  assert.throws(() => validateEvent({ type: 'post.created', ts: 1, payload }), /requires an actor/);
  // the exemption itself is pinned: registration still bootstraps actorless
  assert.equal(validateEvent({ type: 'account.registered', ts: 1, payload: { handle: 'x' } }), true);
});

for (const type of ['post.created', 'comment.created', 'field.created', 'report.filed']) {
  const full = {
    'post.created': { fieldId: 'f1', format: 'text', title: 'hi' },
    'comment.created': { postId: 'p1', bodyMd: 'hi' },
    'field.created': { slug: 'g', title: 'G' },
    'report.filed': { subjectType: 'post', subjectId: 'p1', fieldId: 'f1', reason: 'spam' },
  }[type];

  test(`${type} requires payload.id — rejects without, accepts with`, () => {
    assert.throws(() => validateEvent(ev(type, full)), /missing required field: id/);
    assert.equal(validateEvent(ev(type, { id: 'x1', ...full })), true);
  });
}

// ---- wiring: the rules bind at the commit entry point ----

test('store.commit refuses an id-less post.created (validation wired at dispatch)', async () => {
  const store = await import('../js/store.js');
  assert.throws(
    () => store.commit('post.created', { fieldId: 'f1', format: 'text', title: 'x' }, { actor: 'u_a' }),
    /missing required field: id/,
  );
  assert.throws(
    () => store.commit('vote.set', { subjectType: 'post', subjectId: 'p1', value: 1 }, { actor: null }),
    /requires an actor/,
  );
});

// ---- vocabulary shape ----

test('EVENT_TYPES is the complete mutation vocabulary (27 types, all with required lists)', () => {
  const types = Object.keys(EVENT_TYPES);
  assert.equal(types.length, 27);
  for (const t of types) assert.ok(Array.isArray(EVENT_TYPES[t]), `${t} has a required-fields list`);
});
