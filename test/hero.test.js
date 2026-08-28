// The emblem hero's dismissal — device-local, permanent, and fail-open.
//
// The owner's call is that dismissal NEVER expires, which is only survivable
// because the sticky masthead keeps sign-in on screen for someone who dismissed
// it. That makes the read path the risky half: a hero that vanishes because
// storage threw is a front door nobody can get back, on a device where nothing
// the reader did asked for that. So an unreadable store means SHOWN, the same
// way getSkin() falls back to 'default' rather than to nothing.
//
// The write path is best-effort by design. A ✕ that silently does nothing
// because the browser is in private mode would be worse than one that hides the
// hero for this visit and forgets — so persistence is what this module owns,
// and removing the node is the view's job. That split is why there is no
// module-level flag here to reset between tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HERO_KEY, heroDismissed, dismissHero } from '../js/hero.js';

function withStorage(impl, fn) {
  const saved = globalThis.localStorage;
  globalThis.localStorage = impl;
  try { return fn(); } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
}

const map = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return {
    calls: [],
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { this.calls.push(['set', k, v]); m.set(k, String(v)); },
    removeItem(k) { this.calls.push(['remove', k]); m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
};

test('a first-time visitor sees the hero', () => {
  withStorage(map(), () => assert.equal(heroDismissed(), false));
});

test('dismissing it persists, and the next visit does not see it', () => {
  const store = map();
  withStorage(store, () => {
    dismissHero();
    assert.equal(heroDismissed(), true);
  });
  // Same device, fresh page: the module is not holding this in memory.
  withStorage(map(store.dump()), () => assert.equal(heroDismissed(), true));
});

test('dismissal never expires — there is no timestamp to age out', () => {
  const store = map();
  withStorage(store, () => dismissHero());
  const written = store.calls.filter((c) => c[0] === 'set');
  assert.equal(written.length, 1, `one write: ${JSON.stringify(written)}`);
  assert.doesNotMatch(String(written[0][2]), /\d{4}|\d{10}/,
    `the stored value carries no date or epoch — an expiry is a thing that can be got wrong later: ${written[0][2]}`);
});

test('unreadable storage means SHOWN — fail open, never a lost front door', () => {
  withStorage({ getItem() { throw new Error('blocked'); }, setItem() {}, removeItem() {} },
    () => assert.equal(heroDismissed(), false));
  // and with no storage object at all (node, hardened browser)
  withStorage(undefined, () => assert.equal(heroDismissed(), false));
});

test('garbage in the key means SHOWN, not dismissed', () => {
  withStorage(map({ [HERO_KEY]: 'maybe' }), () => assert.equal(heroDismissed(), false));
});

test('unwritable storage does not throw — the ✕ still works, it just forgets', () => {
  withStorage({ getItem() { return null; }, setItem() { throw new Error('quota'); }, removeItem() {} },
    () => assert.doesNotThrow(() => dismissHero()));
});

test('dismissal is device-local and never touches forage.state', () => {
  assert.notEqual(HERO_KEY, 'forage.state');
  const store = map({ 'forage.state': '{"version":2,"events":[]}' });
  withStorage(store, () => dismissHero());
  assert.deepEqual(store.calls.map((c) => c[1]).filter((k) => k !== HERO_KEY), [],
    'the Bluesky population writes nothing to the event log; test/store-modes.test.js is the teeth on that and this is the lens');
  assert.equal(store.dump()['forage.state'], '{"version":2,"events":[]}');
});

// ---- the emblem asset -----------------------------------------------------
// The hero is the first thing above the fold on a phone, and it shipped as a
// single 1600x576 JPEG weighing 216 KB rendered at ~340 CSS px. Testing that a
// small file EXISTS would pass while the phone still downloaded the big one, so
// the browser-side half of this lives in e2e/hero.workflow.mjs and asserts the
// SELECTED source. What belongs here is the part a browser cannot tell you:
// what the files weigh, and whether the service worker can reach them.
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMBLEM, emblemSources } from '../js/hero.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SMALLEST_CEILING = 30 * 1024;
const ANY_CEILING = 140 * 1024;

test('every emblem source exists and is under its byte ceiling', () => {
  const sizes = emblemSources().map((u) => [u, statSync(join(root, u.slice(1))).size]);
  assert.ok(sizes.length >= 2, `srcset offers a choice: ${JSON.stringify(sizes)}`);
  const smallest = Math.min(...sizes.map(([, n]) => n));
  assert.ok(smallest <= SMALLEST_CEILING,
    `the source a phone picks is ${Math.round(smallest / 1024)} KB, ceiling ${SMALLEST_CEILING / 1024} KB`);
  const over = sizes.filter(([, n]) => n > ANY_CEILING);
  assert.deepEqual(over, [],
    `no source the hero can select may exceed ${ANY_CEILING / 1024} KB — the original 216 KB wordmark must not come back in through srcset`);
});

test('every emblem source is precached, or the hero is the one thing that breaks offline', () => {
  // SHELL caches by EXACT url. A srcset naming files sw.js has never heard of
  // means the app shell works offline and the front door does not.
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const missing = [...new Set([EMBLEM.src, ...emblemSources()])].filter((u) => !shell.includes(`'${u}'`));
  assert.deepEqual(missing, [], `sw.js SHELL is missing ${missing.join(', ')} (add them and bump CACHE)`);
});

test('the src fallback is a source, not the unresized original', () => {
  // A browser that ignores srcset (or a copy-paste of the URL) gets `src`.
  // Pointing it at the 1600px original would quietly undo the whole phase for
  // exactly the clients least able to afford it.
  assert.ok(emblemSources().includes(EMBLEM.src),
    `src must be one of the srcset entries: ${EMBLEM.src} not in ${JSON.stringify(emblemSources())}`);
  assert.ok(statSync(join(root, EMBLEM.src.slice(1))).size <= SMALLEST_CEILING,
    'and it must be the small one');
});

test('sizes describes the layout the hero actually has', () => {
  // Without `sizes`, the browser assumes 100vw and over-fetches on desktop,
  // where the emblem is ~350px inside a 1100px shell.
  assert.match(EMBLEM.sizes, /max-width:\s*560px/,
    'the breakpoint here and the one in css/app.css are the same number, or the browser picks for a layout that does not exist');
});
