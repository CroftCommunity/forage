// The wave planner (plan 2026-09-14-plan-clips, Phase 1, D1): at a people-scope
// the reel is fed by fan-out over the scope's members with the mode's author-
// feed filter, a WAVE at a time — the reader's reaching the end of the reel is
// the ask for the next wave, so a reader who watches five clips costs a
// handful of requests and never the whole scope. Pure: no session, no clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILTER, orderMembers, nextWave, encodeCursor, decodeCursor, roundRobin } from '../js/reel-plan.js';

test('each mode names the author-feed filter the network offers (lexicon-verified 2026-09-14)', () => {
  assert.equal(FILTER.clip, 'posts_with_video');
  assert.equal(FILTER.gram, 'posts_with_media');
  assert.equal(FILTER.forum, undefined);
});

test('known posters go first, in the order given; everyone else follows in the scope order; nobody twice', () => {
  const members = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(orderMembers(members, new Set(['d', 'b', 'zz'])), ['b', 'd', 'a', 'c', 'e']);
  assert.deepEqual(orderMembers(members, new Set()), members);
  assert.deepEqual(orderMembers(['a', 'a', 'b'], new Set()), ['a', 'b']);
});

test('a wave is continuations first (members that answered with frames and a cursor), then fresh members, up to the size', () => {
  const state = { order: ['a', 'b', 'c', 'd', 'e', 'f'], at: 2, cursors: { a: 'a2' } };
  const w = nextWave(state, 3);
  assert.deepEqual(w.asks, [{ did: 'a', cursor: 'a2' }, { did: 'c' }, { did: 'd' }]);
  assert.equal(w.at, 4);
});

test('the wave after the last member is empty, and says so', () => {
  const w = nextWave({ order: ['a'], at: 1, cursors: {} }, 4);
  assert.deepEqual(w.asks, []);
  assert.equal(w.done, true);
});

test('the cursor is a string the board can hold like any other cursor, and round-trips; garbage refuses by name', () => {
  const state = { order: ['a', 'b'], at: 1, cursors: { a: 'x' } };
  const c = encodeCursor(state);
  assert.equal(typeof c, 'string');
  assert.deepEqual(decodeCursor(c), state);
  assert.throws(() => decodeCursor('not json'), /reel cursor/);
  assert.throws(() => decodeCursor(JSON.stringify({ nope: 1 })), /reel cursor/);
});

test('round-robin keeps the people in the order they were asked, one frame each per round; a frame seen twice is dropped', () => {
  const q = (id, ...ids) => ({ id, posts: ids.map((x) => ({ id: x })) });
  const out = roundRobin([q('m10', 'j1', 'j2'), q('m9', 'k1'), q('m2'), q('m4', 'j1', 'l1')]);
  assert.deepEqual(out.map((p) => p.id), ['j1', 'k1', 'l1', 'j2'], 'm10 before m9 because it was asked first; j1 once');
});
