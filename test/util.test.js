// timeAgo — pinned at its unit boundaries (plan 2026-08-29 post-and-thread,
// Phase 1). The byline shows this bare, so the units ARE the copy: s, m, h, d,
// mo, y — and no `w` (a week is 7d; Reddit's `1w` was considered and not taken).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeAgo } from '../js/util.js';

const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;

test('timeAgo: each unit turns over exactly at its boundary', () => {
  const now = Date.now();
  const at = (ms) => timeAgo(now - ms);
  assert.equal(at(0), '0s');
  assert.equal(at(59 * S), '59s');
  assert.equal(at(60 * S), '1m');
  assert.equal(at(59 * M), '59m');
  assert.equal(at(60 * M), '1h');
  assert.equal(at(23 * H), '23h');
  assert.equal(at(24 * H), '1d');
  assert.equal(at(29 * D), '29d');
  assert.equal(at(30 * D), '1mo');
  assert.equal(at(11 * 30 * D), '11mo');
  assert.equal(at(12 * 30 * D), '1y');
});

test('timeAgo: the output is bare — a unit suffix and nothing else', () => {
  for (const ms of [5 * S, 3 * M, 7 * H, 2 * D, 45 * D, 400 * D]) {
    assert.match(timeAgo(Date.now() - ms), /^\d+(s|m|h|d|mo|y)$/);
  }
});
