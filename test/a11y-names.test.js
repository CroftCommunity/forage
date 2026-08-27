// Accessible names for controls the hermetic browser tier cannot reach.
//
// e2e/forms.workflow.mjs asserts label association BEHAVIOURALLY — click the
// label, the control focuses — which is the right test and the one that found
// six real failures. It can only do that on surfaces reachable without a live
// session. The lens composer needs a real OAuth session, so its controls are
// checked here at the source instead. That is weaker on purpose, and saying so
// is the point: a source check proves the attribute is written, not that the
// rendered control is usable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

test('the composer image-alt input carries an accessible name, not just a placeholder', () => {
  // Reported by the session that shipped composing (2026-08-26): alt text is
  // REQUIRED to post, so a control a screen reader cannot name blocks
  // publishing outright rather than merely being awkward.
  const lens = src('js/ui/lens-views.js');
  const decl = lens.match(/el\('input', \{[^}]*'data-image-alt'[^}]*\}/s);
  assert.ok(decl, 'found the image-alt input');
  assert.match(decl[0], /'aria-label'/,
    'the image-alt input must carry aria-label; a placeholder is not an accessible ' +
    'name — it disappears on input and is announced inconsistently');
});

test('form controls in views.js are named through fieldRow, not bare labels', () => {
  // The regression guard for the 14 unnamed controls: a <label> sitting NEXT TO
  // an input names nothing. fieldRow() wires label[for] -> control[id]; the
  // only field-rows allowed to keep a bare label are the ones holding a link or
  // a readout rather than a control (Mode, Accounts, Version).
  const views = src('js/ui/views.js');
  const bare = [...views.matchAll(/class: 'field-row' \}, el\('label', \{\}, '([^']+)'/g)]
    .map((m) => m[1]);
  assert.deepEqual(bare.sort(), ['Accounts', 'Mode', 'Version'],
    `field-rows with a bare label must be the non-control rows only; found: ${bare.join(', ')}`);
});
