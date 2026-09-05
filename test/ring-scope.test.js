// The reader's ring: which stops the pill offers, which one is selected, and
// whether feeds and hashtags are exempt from it.
//
// The ring became a site-wide display scope in plan 2026-09-03, and the stops
// became the reader's to compose. Everything below exists because a composable
// list of stops can be WRONG in ways a frozen ladder could not:
//
//   - stored in an order that inverts containment (the pill sorts by rank)
//   - naming a scope a later version retired (dropped, not thrown on)
//   - emptied entirely (falls back rather than rendering a pill with no stops)
//   - selecting a stop the reader has since removed (falls back to the widest)
//
// Storage is device-local, like skin and density — never forage.state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STOPS_KEY, SCOPE_KEY, EXEMPT_KEY, DEFAULT_STOPS, DEFAULT_SCOPE, EXEMPT_KINDS,
  stops, setStops, addStop, removeStop, scope, setScope,
  exemptsFeeds, setExemptsFeeds, effectiveScope, onChange, ringPill,
  OPEN_KEY, opensThreads, setOpensThreads,
} from '../js/ring-scope.js';

// Each test gets its own storage: a module-level cache would make these order-
// dependent, and the module deliberately has none (it reads through every time,
// the same as board-density).
function withStorage(seed = {}, fn) {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  try { return fn(store); } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
}

test('the defaults are Mutuals | Follows | World, scoped to World', () => {
  withStorage({}, () => {
    // Decision 1 (owner, 2026-09-03): 1a. Mutuals are a SUBSET of follows, so
    // these three are a real containment chain; `hop` stays in the registry for
    // a reader who wants to add it, which is what composability is for.
    assert.deepEqual(stops(), ['mut', 'fol', 'world']);
    assert.deepEqual(DEFAULT_STOPS, ['mut', 'fol', 'world']);
    // World is the default because it is what the app does today and it is the
    // only scope that costs no graph reads — the walk is paid by readers who
    // asked for it, and nobody's reading changes on upgrade.
    assert.equal(scope(), 'world');
    assert.equal(DEFAULT_SCOPE, 'world');
  });
});

test('feeds and hashtags are exempt by default, and those are the exempt kinds', () => {
  withStorage({}, () => {
    // Checked = exempt = unfiltered. A feed or a hashtag is something you went
    // and asked for by name; scoping it silently would make a deliberate
    // request quietly return less than the rest of the app.
    assert.equal(exemptsFeeds(), true);
    assert.deepEqual([...EXEMPT_KINDS].sort(), ['feed', 'hashtag']);
  });
});

test('a thread on a post from inside the ring is open to replies from outside it, by default', () => {
  // Owner, 2026-09-04: the ring is the whole universe — nothing outside it is
  // even hinted at — with ONE punch-hole, for practicality: on a post from
  // someone in the ring, the replies from outside it show, or the post is hard
  // to interact with. A setting, on by default.
  withStorage({}, (store) => {
    assert.equal(opensThreads(), true);
    setOpensThreads(false);
    assert.equal(opensThreads(), false);
    assert.equal(store[OPEN_KEY], '0');
    setOpensThreads(true);
    assert.equal(opensThreads(), true);
  });
});

test('stored stops are read back in containment order, never the stored order', () => {
  withStorage({ [STOPS_KEY]: JSON.stringify(['world', 'fol', 'mut']) }, () => {
    assert.deepEqual(stops(), ['mut', 'fol', 'world']);
  });
});

test('a stop naming a retired scope is dropped, and the rest of the pill survives', () => {
  withStorage({ [STOPS_KEY]: JSON.stringify(['fol', 'mutuals+1', 'world']) }, () => {
    assert.deepEqual(stops(), ['fol', 'world']);
  });
});

test('stops that read back empty fall back to the default — never a pill with no stops', () => {
  for (const junk of ['[]', '["mutuals+1"]', 'not json at all', '{"a":1}', '']) {
    withStorage({ [STOPS_KEY]: junk }, () => {
      assert.deepEqual(stops(), [...DEFAULT_STOPS], `${JSON.stringify(junk)} falls back`);
    });
  }
});

test('World cannot be removed — the pill always keeps an off position', () => {
  withStorage({}, () => {
    setStops(['mut', 'fol']);
    assert.ok(stops().includes('world'), 'World is re-added');
    removeStop('world');
    assert.ok(stops().includes('world'), 'and removing it directly is a no-op');
  });
});

test('adding a stop dedupes and re-sorts; removing one leaves the rest', () => {
  withStorage({}, () => {
    addStop('hop');
    assert.deepEqual(stops(), ['mut', 'fol', 'hop', 'world'], 'lands in containment order, not at the end');
    addStop('hop');
    assert.deepEqual(stops(), ['mut', 'fol', 'hop', 'world'], 'adding twice is adding once');
    removeStop('mut');
    assert.deepEqual(stops(), ['fol', 'hop', 'world']);
  });
});

test('the selected scope must be a stop the reader can still see', () => {
  withStorage({ [SCOPE_KEY]: 'hop', [STOPS_KEY]: JSON.stringify(['mut', 'fol', 'world']) }, () => {
    // Filtering by a scope with no segment on the pill is a state the reader
    // cannot observe and cannot leave. The widest stop is the safe fallback
    // because it is the one that hides the least.
    assert.equal(scope(), 'world');
  });
});

test('removing the SELECTED stop falls back to the widest remaining', () => {
  withStorage({}, () => {
    addStop('hop');
    setScope('hop');
    assert.equal(scope(), 'hop');
    removeStop('hop');
    assert.equal(scope(), 'world', 'not left filtering by a stop that is gone');
  });
});

test('setScope refuses a scope that is not a stop, by name', () => {
  withStorage({}, () => {
    assert.throws(() => setScope('hop'), /not a stop/i);
    assert.throws(() => setScope('nonsense'), /not a stop/i);
    assert.equal(scope(), 'world', 'and the selection did not move');
  });
});

test('effectiveScope: a thread override beats the site-wide scope, transiently', () => {
  withStorage({}, () => {
    setScope('fol');
    // Owner, 2026-09-03: the thread pill "just overrides the thread". The
    // override is passed IN rather than stored, which is what makes it
    // transient — leaving the thread drops the argument and the site-wide
    // scope is what remains.
    assert.equal(effectiveScope('world'), 'world');
    assert.equal(effectiveScope(null), 'fol', 'no override means the site-wide scope');
    assert.equal(effectiveScope(undefined), 'fol');
    assert.equal(scope(), 'fol', 'and an override never writes the stored scope');
  });
});

test('effectiveScope ignores an override that is not a stop', () => {
  withStorage({}, () => {
    setScope('fol');
    assert.equal(effectiveScope('mutuals+1'), 'fol');
  });
});

test('every setter notifies, so two pills on one page cannot disagree', () => {
  withStorage({}, () => {
    const seen = [];
    const off = onChange((s) => seen.push(s));
    try {
      setScope('fol');
      addStop('hop');
      setExemptsFeeds(false);
      setOpensThreads(false);
      assert.equal(seen.length, 4, 'scope, stops, the exemption and the punch-hole all notify');
      assert.equal(seen.at(-1).exemptsFeeds, false);
      assert.equal(seen.at(-1).opensThreads, false);
      assert.equal(seen.at(-1).scope, 'fol');
      assert.deepEqual(seen.at(-1).stops, ['mut', 'fol', 'hop', 'world']);
    } finally { off(); }
  });
});

test('no storage at all reads as the defaults and never throws', () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    assert.deepEqual(stops(), [...DEFAULT_STOPS]);
    assert.equal(opensThreads(), true);
    assert.equal(scope(), 'world');
    assert.equal(exemptsFeeds(), true);
    setScope('world');            // must not throw
    setExemptsFeeds(false);       // must not throw
    addStop('hop');               // must not throw
  } finally {
    if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved;
  }
});

// ---- the pill ----
//
// Built with an injected el(), the same way js/board-density.js builds its
// dial, so the structure is testable without a DOM. What is checked here is
// what a browser tier cannot cheaply check: that the segments come out in
// containment order, that exactly one is selected, that an override selects
// without writing, and that two pills on one page do not merge into one radio
// group. The paint is the browser tier's job.

const fakeEl = (tag, attrs = {}, ...kids) => ({
  tag, attrs, kids: kids.flat().filter((k) => k != null && k !== false),
});
const walk = (n, out = []) => {
  if (n && n.tag) { out.push(n); (n.kids || []).forEach((k) => walk(k, out)); }
  return out;
};
const inputs = (pill) => walk(pill).filter((n) => n.tag === 'input');

test('the pill renders one segment per stop, in containment order', () => {
  withStorage({}, () => {
    const pill = ringPill(fakeEl, { onPicked() {} });
    assert.deepEqual(inputs(pill).map((i) => i.attrs['data-scope']), ['mut', 'fol', 'world']);
  });
});

test('exactly one segment is checked, and it is the current scope', () => {
  withStorage({}, () => {
    setScope('fol');
    const checked = inputs(ringPill(fakeEl, { onPicked() {} })).filter((i) => i.attrs.checked);
    assert.equal(checked.length, 1);
    assert.equal(checked[0].attrs['data-scope'], 'fol');
  });
});

test('an override selects its own segment and never writes the stored scope', () => {
  withStorage({}, () => {
    setScope('mut');
    const pill = ringPill(fakeEl, { override: 'world', onPicked() {} });
    const checked = inputs(pill).filter((i) => i.attrs.checked);
    assert.deepEqual(checked.map((i) => i.attrs['data-scope']), ['world']);
    assert.equal(scope(), 'mut', 'the thread pill showed World; the site-wide scope is untouched');
  });
});

test('a one-stop pill is not a control, and does not render', () => {
  withStorage({}, () => {
    setStops([]);                      // World is pinned, so this leaves exactly one
    assert.deepEqual(stops(), ['world']);
    assert.equal(ringPill(fakeEl, { onPicked() {} }), null);
  });
});

test('two pills on one page are two radio groups, not one', () => {
  withStorage({}, () => {
    const a = inputs(ringPill(fakeEl, { onPicked() {} })).map((i) => i.attrs.name);
    const b = inputs(ringPill(fakeEl, { onPicked() {} })).map((i) => i.attrs.name);
    assert.equal(new Set(a).size, 1, 'one pill is one group');
    assert.notEqual(a[0], b[0], 'the masthead pill and the thread pill do not steer each other');
  });
});

test('the pill and every segment carry an accessible name', () => {
  withStorage({}, () => {
    const pill = ringPill(fakeEl, { onPicked() {} });
    assert.ok(pill.attrs['aria-label'], 'the group is named');
    const labels = walk(pill).filter((n) => n.tag === 'label');
    assert.equal(labels.length, 3);
    for (const l of labels) {
      assert.ok(l.attrs.for, 'each label points at its input');
      assert.ok(l.attrs.title, 'and says what the scope means on hover');
    }
    // The visible text is the SHORT label: "My follows, one hop out" does not
    // fit a 390px phone beside three siblings at a 44px tap floor.
    const text = walk(pill).flatMap((n) => n.kids).filter((k) => typeof k === 'string');
    assert.ok(text.includes('Follows') && text.includes('World'));
    assert.ok(!text.some((t) => t.includes('one hop out')));
  });
});

test('picking a segment reports the scope it stands for', () => {
  withStorage({}, () => {
    const picked = [];
    const pill = ringPill(fakeEl, { onPicked: (id) => picked.push(id) });
    inputs(pill).find((i) => i.attrs['data-scope'] === 'fol').attrs.onchange();
    assert.deepEqual(picked, ['fol']);
  });
});

// ---- the locked pill (signed out) ----
//
// Owner, 2026-09-03: "on logged out I still want the pill but only world is
// selectable and selected."
//
// This is a deliberate exception to the guest-surface rule, which says hide
// what a reader cannot use rather than greying it. The rule's own reasoning is
// why it can bend here: it exists so a control does not sit there absorbing
// clicks, and a locked pill is not absorbing anything — it is showing a signed
// out reader that scoping exists and which stop they are on, with the three
// they cannot reach visibly out of reach. The old ring section could not do
// that: it was five rows, and five rows minus the four you cannot use is a list
// of one, which reads as broken. One control with three quiet segments reads as
// a control.

test('locked: every stop is drawn, World is the one selected', () => {
  withStorage({}, () => {
    const pill = ringPill(fakeEl, { locked: true, onPicked() {} });
    assert.deepEqual(inputs(pill).map((i) => i.attrs['data-scope']), ['mut', 'fol', 'world']);
    const checked = inputs(pill).filter((i) => i.attrs.checked);
    assert.deepEqual(checked.map((i) => i.attrs['data-scope']), ['world']);
  });
});

test('locked: only World is selectable', () => {
  withStorage({}, () => {
    const pill = ringPill(fakeEl, { locked: true, onPicked() {} });
    const disabled = inputs(pill).filter((i) => i.attrs.disabled).map((i) => i.attrs['data-scope']);
    assert.deepEqual(disabled, ['mut', 'fol'], 'the two that need a follow graph');
    assert.equal(inputs(pill).find((i) => i.attrs['data-scope'] === 'world').attrs.disabled, false);
  });
});

test('locked: World is selected even when storage remembers another stop', () => {
  // A reader who scoped to Follows and then signed out must not be shown a pill
  // claiming they are still scoped to Follows — signed out there is no follow
  // graph, so nothing is being narrowed and the pill has to say so.
  withStorage({}, () => {
    setScope('fol');
    const pill = ringPill(fakeEl, { locked: true, onPicked() {} });
    assert.deepEqual(inputs(pill).filter((i) => i.attrs.checked).map((i) => i.attrs['data-scope']), ['world']);
    assert.equal(scope(), 'fol', 'and the remembered scope is still there for when they sign back in');
  });
});

test('locked: an unreachable stop says why, rather than being mysteriously dead', () => {
  withStorage({}, () => {
    const pill = ringPill(fakeEl, { locked: true, onPicked() {} });
    const labels = walk(pill).filter((n) => n.tag === 'label');
    const mut = labels.find((l) => l.attrs.for.endsWith('-mut'));
    assert.match(mut.attrs.title, /sign in/i, 'the tooltip names the reason');
    const world = labels.find((l) => l.attrs.for.endsWith('-world'));
    assert.ok(!/sign in/i.test(world.attrs.title), 'and World, which works, does not');
  });
});
