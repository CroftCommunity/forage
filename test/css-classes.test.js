// Every class the UI emits should be a class the stylesheet knows.
//
// Written after a live regression: a Field->Feed vocabulary rename swept the
// CSS class STRING `field-row` to `feed-row` inside js/ui/views.js, while
// css/app.css kept defining `.field-row`. The rename had a protection list —
// fieldRow(), fieldset, subjectField were all explicitly spared — but the class
// literal inside the helper was not, so every form row in the app silently lost
// its styling: labels no longer block, no spacing, on settings, submit,
// create-feed and signup at once.
//
// Nothing failed. The suite was green, the markup was well-formed, the text was
// all present. A class name is a contract between two files that no compiler
// checks and no test noticed, which is exactly the shape worth a test.
//
// Coverage is honest rather than total: this reads STRING LITERALS, so classes
// built by concatenation (`'postrow' + (compact ? ' compact' : '')`) are not
// seen. It catches the rename case, which is the one that has actually bitten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Classes that are deliberately not styled by app.css.
const HOOKS = new Set([
  'linkish',        // styled inline via style.cssText at the call site
  'quote-children', // a query hook for the quote cascade, never painted
  'reply-form',     // a query hook — components.js finds it via classList to toggle
]);

function stylesheetText() {
  const css = [readFileSync(join(root, 'css/app.css'), 'utf8'),
    readFileSync(join(root, 'css/tokens.css'), 'utf8')];
  for (const f of readdirSync(join(root, 'skins'))) {
    if (f.endsWith('.css')) css.push(readFileSync(join(root, 'skins', f), 'utf8'));
  }
  return css.join('\n');
}

test('no UI class literal is orphaned from the stylesheet', () => {
  const css = stylesheetText();
  const orphans = new Set();
  for (const f of readdirSync(join(root, 'js/ui'))) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(join(root, 'js/ui', f), 'utf8');
    for (const m of src.matchAll(/class:\s*'([^']+)'/g)) {
      for (const cls of m[1].trim().split(/\s+/)) {
        if (!cls || HOOKS.has(cls)) continue;
        if (!new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}\\b`).test(css)) {
          orphans.add(`${cls}  (js/ui/${f})`);
        }
      }
    }
  }
  assert.deepEqual([...orphans].sort(), [],
    `class(es) emitted by the UI that no stylesheet defines:\n  ${[...orphans].sort().join('\n  ')}`);
});
