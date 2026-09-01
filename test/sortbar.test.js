// The From select's option list, and what happens to a carried choice when a
// board does not offer it.
//
// WHY THERE IS A SECOND LIST (owner, 2026-09-01: "does 'top' month, year and
// all time really do anything?"). It depended entirely on which board you were
// on, and the menu said the same thing on all of them:
//
//   /h/ hashtag boards ride searchPosts, which takes sort + since/until
//       SERVER-SIDE. "Top · this month" there is a real query over the whole
//       corpus, and all five windows mean five different things.
//   /f/ feed boards have no such lever (DL-032: getFeedSkeleton takes limit and
//       cursor, nothing else), so they widen by PAGING BACKWARDS on a budget —
//       8 pages of 30. Measured against the live Discover feed 2026-09-01: that
//       reaches 29.4 hours. Driving the real toolbar against a feed of that
//       shape, "this week", "this month" and "this year" returned a
//       byte-identical ranking of the same 240 posts, and "all time" ranked
//       FEWER than any of them, because it was the one choice that skipped the
//       widening walk entirely.
//
// So a walking board offers the rungs its walk can be distinguished by, and
// "All time" is now the widest walk rather than the absent one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TIMEFRAMES, WALK_TIMEFRAMES, nearestTimeframe } from '../js/ui/sortbar.js';

const ids = (fs) => fs.map(([v]) => v);

test('a server-windowed board offers all five; a walking board offers the three its walk can tell apart', () => {
  assert.deepEqual(ids(TIMEFRAMES), ['day', 'week', 'month', 'year', 'all']);
  assert.deepEqual(ids(WALK_TIMEFRAMES), ['day', 'week', 'all']);
  // the walking list is a SUBSET, in the same order — a board must never invent
  // a window the shared list does not define
  const all = ids(TIMEFRAMES);
  assert.deepEqual(ids(WALK_TIMEFRAMES), all.filter((v) => ids(WALK_TIMEFRAMES).includes(v)));
  // and the labels come from the one place, so two boards cannot call the same
  // window by two names
  for (const [v, label] of WALK_TIMEFRAMES) {
    assert.equal(label, TIMEFRAMES.find(([w]) => w === v)[1], `${v} is labelled once`);
  }
});

test('a choice a board does not offer widens to the next one it does — never narrows', () => {
  // carried from a /h/ board, where the window is a real query, onto a /f/
  // board, where it is a walk. Asking for a month and being given a week would
  // silently answer a narrower question than the one on screen.
  assert.equal(nearestTimeframe('month', WALK_TIMEFRAMES), 'all');
  assert.equal(nearestTimeframe('year', WALK_TIMEFRAMES), 'all');
  // anything the board does offer is untouched
  for (const v of ['day', 'week', 'all']) assert.equal(nearestTimeframe(v, WALK_TIMEFRAMES), v);
  // and going the other way — a walking board's choice onto a server-windowed
  // one — is always offered, so nothing moves
  for (const v of ['day', 'week', 'all']) assert.equal(nearestTimeframe(v, TIMEFRAMES), v);
});

test('an unknown window falls back to the widest offered, not to a silent narrowing', () => {
  // a stored or shared value from a list that no longer exists must not land on
  // "today" and quietly hide almost everything
  assert.equal(nearestTimeframe('decade', WALK_TIMEFRAMES), 'all');
  assert.equal(nearestTimeframe(undefined, TIMEFRAMES), 'all');
});
