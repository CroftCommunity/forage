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
  assert.equal(validateEvent(ev('post.created', { fieldId: 'f1', format: 'text', title: 'hi' })), true);
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
    () => validateEvent(ev('post.created', { fieldId: 'f1', format: 'text' })),
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

// ---- known-bad accepts (current behavior, phase-2b targets) ----

test('CURRENT: actor: null validates on a non-registration event', () => {
  // The actor check only rejects `undefined`; an explicit null slips through —
  // a logged-out direct commit validates today.
  assert.equal(validateEvent(ev('post.created', { fieldId: 'f1', format: 'text', title: 'hi' }, null)), true);
});

test('2b target: actor null/undefined rejected on every type except account.registered', { todo: true }, () => {
  assert.throws(() => validateEvent(ev('post.created', { fieldId: 'f1', format: 'text', title: 'hi' }, null)));
});

for (const type of ['post.created', 'comment.created', 'field.created', 'report.filed']) {
  const full = {
    'post.created': { fieldId: 'f1', format: 'text', title: 'hi' },
    'comment.created': { postId: 'p1', bodyMd: 'hi' },
    'field.created': { slug: 'g', title: 'G' },
    'report.filed': { subjectType: 'post', subjectId: 'p1', fieldId: 'f1', reason: 'spam' },
  }[type];

  test(`CURRENT: id-less ${type} validates (reducer would key state under undefined)`, () => {
    assert.equal(validateEvent(ev(type, full)), true);
  });

  test(`2b target: ${type} requires payload.id`, { todo: true }, () => {
    assert.throws(() => validateEvent(ev(type, full)), /missing required field: id/);
  });
}

// ---- vocabulary shape ----

test('EVENT_TYPES is the complete mutation vocabulary (27 types, all with required lists)', () => {
  const types = Object.keys(EVENT_TYPES);
  assert.equal(types.length, 27);
  for (const t of types) assert.ok(Array.isArray(EVENT_TYPES[t]), `${t} has a required-fields list`);
});
