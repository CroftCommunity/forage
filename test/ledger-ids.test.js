// Divergence-ledger id uniqueness. Two entries sharing an id mean two DIFFERENT
// things under one name, and every citation of it — README, plans, tests — becomes
// ambiguous.
//
// TWO REAL COLLISIONS on 2026-08-26, both found only after the fact:
//   DL-027  skins (c901d4b) vs composing (2285813)      — resolved 02ef5e4
//   DL-035  label floor (d98bd20) vs sandbox (95a24c5)  — resolved df10d61
//
// WHY THIS IS A TEST AND NOT AN ALLOCATOR. The workspace has an atomic allocator
// (CroftC/.claude/bin/next-id.sh) and it prevented ZERO of the two, because in both
// cases neither session ever reached for it. An allocator closes contention between two
// sessions that both ask; it does nothing about nobody asking. Ids get written under
// load, and load is exactly when a tool you must remember gets skipped. A test needs no
// one to remember it — `npm test` runs it, and so does CI.
//
// WHY NOT A HEADER COMMENT ("next free: DL-038"). It would have been accurate when read
// and wrong by the time it was used. The session that created the DL-035 collision ran a
// REAL duplicate check while merging main into an older branch, correctly saw
// DL-001..DL-034 with no gaps, then allocated later from a NEWER base without
// re-checking — "an id allocated against one base is not allocated against another."
// A check that is correct when it runs and silently stale afterwards leaves justified
// confidence, which is worse than no check.
//
// Three things this must get right, each a way the obvious version would be WRONG:
//   1. Count DECLARATIONS, not mentions. `DL-011` was recorded as a collision in the
//      allocator's own header for a day; it never was one. The claim came from grepping
//      the id anywhere in the file, which counts a prose cross-reference inside another
//      entry's text. DL-011 is mentioned twice and declared once.
//   2. Do not anchor on field order. `tier` is present on three of the four collided
//      rows and absent on the fourth, sitting between `capability` and `label`.
//   3. Do not assume append-at-end. The DL-027 pair was appended (lines 27 and 107);
//      the DL-035 pair was INSERTED MID-FILE, because the ledger is grouped by theme
//      and people insert beside related entries. Mid-file is the shape that recurs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(root, 'ledger/divergence.js');

// A DECLARATION is `id: '<PREFIX>-<digits>'`. Anything else — including the id appearing
// inside another entry's label or description — is a mention, and mentions are legal.
const DECLARATION = /\bid:\s*['"]([A-Za-z]+-\d+)['"]/g;

function declarationsWithLines(source) {
  const found = [];
  source.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(DECLARATION)) found.push({ id: m[1], line: i + 1 });
  });
  return found;
}

test('every divergence id is declared exactly once', () => {
  const decls = declarationsWithLines(readFileSync(LEDGER, 'utf8'));
  assert.ok(decls.length > 0, 'found no id declarations at all — the pattern has drifted');

  const byId = new Map();
  for (const d of decls) byId.set(d.id, [...(byId.get(d.id) ?? []), d.line]);

  const dupes = [...byId.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([id, lines]) => `${id} declared on lines ${lines.join(', ')}`);

  assert.deepEqual(
    dupes,
    [],
    `duplicate divergence id(s):\n  ${dupes.join('\n  ')}\n\n` +
      'Resolve before committing, while it is one line and one session rather than a\n' +
      'cross-session renumber later:\n' +
      '  1. The workspace tiebreak is GIT ANCESTRY — the entry whose commit is the\n' +
      '     ancestor keeps the id (CroftC/.claude/TRACKING.md § ID discipline).\n' +
      '  2. Reserve a fresh id:  bash ../.claude/bin/next-id.sh DL\n' +
      '  3. Renumber the other, and update anything citing the old id.',
  );
});

// Regression test for the phantom DL-011: the checker must count declarations, not
// occurrences, or it invents collisions that do not exist. This pins the distinction
// against the actual shape that fooled a human count.
test('an id cross-referenced in another entry is not a duplicate', () => {
  const sample = [
    "  { id: 'DL-011', kind: 'tolerance', capability: 'feeds', tier: 'wide', label: 'Real entry' },",
    "  { id: 'DL-012', kind: 'frontier', capability: 'feeds', label: 'Supersedes DL-011 for the wide tier' },",
  ].join('\n');
  const ids = declarationsWithLines(sample).map((d) => d.id);
  assert.deepEqual(ids, ['DL-011', 'DL-012'], 'a prose mention was miscounted as a declaration');
});

// Pins constraints 2 and 3 together: inconsistent field order AND a mid-file insert.
// Without both, an implementation can pass the happy path and miss the shape that
// actually recurred in this repo.
test('duplicates are caught mid-file and regardless of field order', () => {
  const sample = [
    "  { id: 'DL-001', kind: 'tolerance', capability: 'auth', tier: 'wide', label: 'First' },",
    "  { id: 'DL-035', kind: 'tolerance', capability: 'moderation', tier: 'wide', label: 'Label floor' },",
    "  { id: 'DL-036', kind: 'tolerance', capability: 'moderation', tier: 'wide', label: 'Muted absent' },",
    "  { id: 'DL-035', kind: 'tolerance', capability: 'feeds', label: 'Sandbox governed locally' },",
    "  { id: 'DL-040', kind: 'frontier', capability: 'search', tier: 'wide', label: 'Last' },",
  ].join('\n');
  const lines = declarationsWithLines(sample)
    .filter((d) => d.id === 'DL-035')
    .map((d) => d.line);
  assert.deepEqual(lines, [2, 4], 'a mid-file duplicate with differing field order was missed');
});
