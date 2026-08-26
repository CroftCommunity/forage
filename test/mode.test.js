// 3h: the presentation mode — bluesky and memory are FULL, mutually exclusive
// populations (user, 2026-08-26). The choice is device-local; clearing it
// accepts the domain default. Store modes (1a/1b) are a separate axis.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const bag = new Map();
globalThis.localStorage = {
  getItem: (k) => (bag.has(k) ? bag.get(k) : null),
  setItem: (k, v) => bag.set(k, String(v)),
  removeItem: (k) => bag.delete(k),
};

const mode = await import('../js/mode.js');

test('the domain default is bluesky; no stored choice means default', () => {
  assert.equal(mode.DOMAIN_DEFAULT, 'bluesky');
  assert.equal(mode.stored(), null);
  assert.equal(mode.active(), 'bluesky');
});

test('set persists the choice under forage.mode; active follows it', () => {
  mode.set('memory');
  assert.equal(bag.get('forage.mode'), 'memory');
  assert.equal(mode.stored(), 'memory');
  assert.equal(mode.active(), 'memory');
  mode.set('bluesky');
  assert.equal(mode.active(), 'bluesky');
  assert.equal(mode.stored(), 'bluesky', 'an explicit choice is stored even when it matches the default');
});

test('clear removes the choice — the domain default takes over again', () => {
  mode.set('memory');
  mode.clear();
  assert.equal(mode.stored(), null);
  assert.equal(mode.active(), 'bluesky');
});

test('an unknown mode refuses with words naming the populations', () => {
  assert.throws(() => mode.set('vr'), (e) => {
    assert.match(e.message, /vr/);
    assert.match(e.message, /bluesky/);
    assert.match(e.message, /memory/);
    return true;
  });
});

test('a corrupted stored value degrades to the default, never crashes', () => {
  bag.set('forage.mode', 'garbage');
  assert.equal(mode.active(), 'bluesky');
  assert.equal(mode.stored(), null, 'garbage reads as no choice');
  mode.clear();
});
