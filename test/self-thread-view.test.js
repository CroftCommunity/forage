// The mock switch is a switch, not a source of surprises: an unset or corrupt
// value renders the shipped shape, never a blank thread.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, MODES, DEFAULT, active } from '../js/self-thread-view.js';

const withStorage = (value, fn) => {
  const store = value === null ? {} : { [KEY]: value };
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null) };
  try { return fn(); } finally { delete globalThis.localStorage; }
};

test('self-thread view: nothing stored reads as the shipped shape', () => {
  assert.equal(withStorage(null, active), DEFAULT);
  assert.equal(DEFAULT, 'hoist', 'the shipped shape today is the hoist');
});

test('self-thread view: a stored mode is honoured', () => {
  for (const mode of MODES) assert.equal(withStorage(mode, active), mode);
});

test('self-thread view: a value that is not a mode is not a mode', () => {
  assert.equal(withStorage('sideways', active), DEFAULT);
  assert.equal(withStorage('', active), DEFAULT);
});

test('self-thread view: no localStorage at all still renders', () => {
  assert.equal(active(), DEFAULT, 'private mode, or node: the thread must still draw');
});
