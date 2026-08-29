// Which sections of /hashtags a reader wants — device-local, all on by default.
//
// Three sections answer three different questions (plan 2026-08-28-1), and not
// everyone wants all three: someone who never looks past their own reading has
// no use for a network barometer, and someone using Forage to find new corners
// may not care what they have already loaded. So the page is composable rather
// than fixed — and the control sits behind an ADVANCED disclosure, because a
// setting most readers should never need is noise on the page they visit to
// change their skin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HASHTAG_SECTIONS, SECTION_PREFS_KEY, sectionEnabled, setSectionEnabled, enabledSections } from '../js/hashtag-prefs.js';

const withStorage = (seed, fn) => {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  try { return fn(store); }
  finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
};

test('every section is declared with a label, and the ids match the page', () => {
  assert.deepEqual(HASHTAG_SECTIONS.map(([id]) => id), ['search', 'trending', 'loaded']);
  for (const [, label] of HASHTAG_SECTIONS) assert.ok(label && label.length > 2);
});

test('all three are on by default — an unset preference is not an off one', () => {
  withStorage({}, () => {
    for (const [id] of HASHTAG_SECTIONS) assert.equal(sectionEnabled(id), true, `${id} defaults on`);
    assert.deepEqual(enabledSections(), ['search', 'trending', 'loaded']);
  });
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try { assert.equal(sectionEnabled('trending'), true, 'and no storage is still on, not off'); }
  finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
});

test('turning one off leaves the others alone and survives a reload', () => {
  withStorage({}, (store) => {
    setSectionEnabled('trending', false);
    assert.equal(sectionEnabled('trending'), false);
    assert.equal(sectionEnabled('search'), true);
    assert.deepEqual(enabledSections(), ['search', 'loaded'], 'and order follows the page, not the click');
    assert.ok(store[SECTION_PREFS_KEY], 'it was actually written down');
  });
});

test('turning one back on restores it', () => {
  withStorage({}, () => {
    setSectionEnabled('loaded', false);
    setSectionEnabled('loaded', true);
    assert.deepEqual(enabledSections(), ['search', 'trending', 'loaded']);
  });
});

test('an unknown section id is refused rather than stored', () => {
  withStorage({}, () => {
    setSectionEnabled('nonsense', false);
    assert.deepEqual(enabledSections(), ['search', 'trending', 'loaded'], 'nothing was hidden');
    assert.equal(sectionEnabled('nonsense'), false, 'and asking about one that does not exist is false, not true');
  });
});

test('hiding everything is ALLOWED — the page says so rather than the setting refusing', () => {
  withStorage({}, () => {
    for (const [id] of HASHTAG_SECTIONS) setSectionEnabled(id, false);
    assert.deepEqual(enabledSections(), [],
      'a control that silently refuses the last unchecking is a control that lies about what it does');
  });
});

test('a corrupt preference reads as all-on rather than an empty page', () => {
  withStorage({ [SECTION_PREFS_KEY]: 'not json' }, () =>
    assert.deepEqual(enabledSections(), ['search', 'trending', 'loaded']));
  withStorage({ [SECTION_PREFS_KEY]: '[]' }, () =>
    assert.deepEqual(enabledSections(), ['search', 'trending', 'loaded'],
      'the safe direction is showing too much, never a blank page nobody chose'));
});
