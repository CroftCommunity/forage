// Haptics (plan 2026-08-29 post-and-thread, decision 6 + O3): a like buzzes on
// devices that can, nothing on un-like, one switch, default ON. iOS Safari has
// no vibrate API and degrades to nothing — never a sound, never a toast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enabled, set, buzz } from '../js/haptics.js';

// node has no localStorage; the module must read "absent" as the default (on)
function withStorage(values, fn) {
  const store = new Map(Object.entries(values));
  const prev = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  try { return fn(store); } finally { if (prev === undefined) delete globalThis.localStorage; else globalThis.localStorage = prev; }
}
function withVibrate(impl, fn) {
  const prev = Object.getOwnPropertyDescriptor(globalThis.navigator, 'vibrate');
  if (impl) Object.defineProperty(globalThis.navigator, 'vibrate', { value: impl, configurable: true, writable: true });
  else delete globalThis.navigator.vibrate;
  try { return fn(); } finally { if (prev) Object.defineProperty(globalThis.navigator, 'vibrate', prev); else delete globalThis.navigator.vibrate; }
}
function withReducedMotion(matches, fn) {
  const prev = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: matches && /prefers-reduced-motion/.test(q) });
  try { return fn(); } finally { if (prev === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = prev; }
}

test('enabled(): absent → on (the default); only the literal "off" disables; garbage reads as on', () => {
  assert.equal(enabled(), true, 'no localStorage at all: on');
  withStorage({}, () => assert.equal(enabled(), true));
  withStorage({ 'forage.haptics': 'off' }, () => assert.equal(enabled(), false));
  withStorage({ 'forage.haptics': 'banana' }, () => assert.equal(enabled(), true, 'a corrupted key must not silence a default-on feature'));
  withStorage({}, (store) => { set(false); assert.equal(store.get('forage.haptics'), 'off'); assert.equal(enabled(), false); set(true); assert.equal(enabled(), true); });
});

test('buzz(): calls navigator.vibrate(12) exactly once when on; zero times when off', () => {
  const calls = [];
  withVibrate((ms) => { calls.push(ms); return true; }, () => {
    withStorage({}, () => { assert.equal(buzz(), true); });
    assert.deepEqual(calls, [12]);
    withStorage({ 'forage.haptics': 'off' }, () => { assert.equal(buzz(), false); });
    assert.deepEqual(calls, [12], 'off: not called again (zero, not ≤1)');
  });
});

test('buzz(): no vibrate API (iOS) → false, no throw, nothing else happens', () => {
  withVibrate(null, () => {
    withStorage({}, () => { assert.doesNotThrow(() => buzz()); assert.equal(buzz(), false); });
  });
});

test('buzz() (O3): prefers-reduced-motion: reduce → zero calls even when enabled', () => {
  const calls = [];
  withVibrate((ms) => { calls.push(ms); return true; }, () => {
    withReducedMotion(true, () => withStorage({}, () => assert.equal(buzz(), false)));
    assert.deepEqual(calls, []);
    withReducedMotion(false, () => withStorage({}, () => assert.equal(buzz(), true)));
    assert.deepEqual(calls, [12]);
  });
});
