// js/util.js — the small rendering helpers. Untested until 2026-08-27, which is
// how "1 comments" shipped and stayed: five call sites each interpolated a count
// beside a hardcoded plural noun, and no assertion looked at any of them.
//
// The fix is a helper rather than five ternaries, because five ternaries is
// five chances to write the next one wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural, fmtScore } from '../js/util.js';

test('plural: exactly one is singular; everything else is not', () => {
  assert.equal(plural(1, 'comment'), '1 comment');
  assert.equal(plural(2, 'comment'), '2 comments');
  // ZERO is plural in English — "0 comments", never "0 comment". This is the
  // case a naive `n > 1` check gets wrong, and the one most often on screen.
  assert.equal(plural(0, 'comment'), '0 comments');
});

test('plural: an irregular plural can be given rather than guessed', () => {
  // No inflection rules here on purpose. A helper that tries to pluralise
  // English is a helper that will one day render "replys" — the caller knows
  // the word and passes it.
  assert.equal(plural(1, 'reply', 'replies'), '1 reply');
  assert.equal(plural(3, 'reply', 'replies'), '3 replies');
});

test('plural: the count is FORMATTED, so big numbers read as they do elsewhere', () => {
  // fmtScore turns 39382 into 39.4k across the app. A count that skipped it
  // would render "39382 likes" beside "39.4k" on the same row.
  assert.equal(plural(39382, 'like'), `${fmtScore(39382)} likes`);
  assert.equal(plural(12000, 'like'), '12.0k likes');
});
