// D7 (owner, 2026-09-16: "Maybe we put a mode slider under the ring slider?"):
// the view pill stands directly under the ring pill in the left nav, so the two
// dials read as one instrument — how close, and what kind. Signed out the ring
// pill locks to World; the view pill stays live, because a guest board has
// pictures and clips too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navTree } from '../js/ui/nav.js';

function withStorage(seed = {}, fn) {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  try { return fn(store); } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
}
// nav.js appends into the node it builds and sets aria-current on rows, so
// this fake carries the two DOM verbs it uses and nothing else.
const fakeEl = (tag, attrs = {}, ...kids) => {
  const n = { tag, attrs, kids: kids.flat().filter((k) => k != null && k !== false) };
  n.append = (...more) => { n.kids.push(...more.flat().filter((k) => k != null && k !== false)); };
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  return n;
};
const walk = (n, out = []) => { if (n && n.tag) { out.push(n); (n.kids || []).forEach((k) => walk(k, out)); } return out; };

test('the view pill stands under the ring pill, signed in and signed out', () => {
  for (const session of [null, { did: 'did:plc:me' }]) {
    withStorage({}, () => {
      const nav = navTree({ el: fakeEl, session, feeds: [], tags: [], current: null });
      const nodes = walk(nav);
      const ring = nodes.findIndex((n) => n.attrs['data-ring-pill'] === '1');
      const view = nodes.findIndex((n) => n.attrs['data-view-pill'] === '1');
      assert.ok(ring >= 0, 'the ring pill is drawn');
      assert.ok(view > ring, `the view pill follows the ring pill (session: ${!!session})`);
      const between = nodes.slice(ring + 1, view).filter((n) => n.attrs['data-nav-item']);
      assert.equal(between.length, 0, 'no board row sits between the two dials');
      const wrap = nodes.find((n) => String(n.attrs.class || '') === 'navview');
      assert.ok(wrap, 'the view pill has its nav wrapper');
      const live = nodes.filter((n) => n.tag === 'input' && n.attrs['data-view']).filter((i) => !i.attrs.disabled);
      assert.equal(live.length, 3, 'every mode is selectable, signed out too');
    });
  }
});

test('the section heading names it View', () => {
  withStorage({}, () => {
    const nav = navTree({ el: fakeEl, session: null, feeds: [], tags: [], current: null });
    const labels = walk(nav).filter((n) => String(n.attrs.class || '') === 'navsec').map((n) => n.kids.join(''));
    const ring = labels.indexOf('Your ring');
    assert.ok(ring >= 0);
    assert.equal(labels[ring + 1], 'View');
  });
});
