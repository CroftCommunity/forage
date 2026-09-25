// D7 (owner, 2026-09-21): the View control is a dropdown in the TOP BAR, not a
// second pill under the ring. The ring pill is a gradient — mutuals inside
// follows inside world — and a segmented control says so; a view is a content
// type, one at a time, and a select says that. So the nav carries the ring
// alone, as it did before 2026-09-17; this test holds that the pill did not
// come back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navTree } from '../js/ui/nav.js';

function withStorage(seed = {}, fn) {
  const store = { ...seed };
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  try { return fn(store); } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
}
const fakeEl = (tag, attrs = {}, ...kids) => {
  const n = { tag, attrs, kids: kids.flat().filter((k) => k != null && k !== false) };
  n.append = (...more) => { n.kids.push(...more.flat().filter((k) => k != null && k !== false)); };
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  return n;
};
const walk = (n, out = []) => { if (n && n.tag) { out.push(n); (n.kids || []).forEach((k) => walk(k, out)); } return out; };

test('the nav carries the ring pill and no view control, signed in and signed out', () => {
  for (const session of [null, { did: 'did:plc:me' }]) {
    withStorage({}, () => {
      const nodes = walk(navTree({ el: fakeEl, session, feeds: [], tags: [], current: null }));
      assert.ok(nodes.some((n) => n.attrs['data-ring-pill'] === '1'), 'the ring pill is drawn');
      assert.ok(!nodes.some((n) => n.attrs['data-view-pill'] === '1' || n.attrs['data-view-select'] === '1'), 'no view control in the nav');
      const labels = nodes.filter((n) => String(n.attrs.class || '') === 'navsec').map((n) => n.kids.join(''));
      assert.ok(!labels.includes('View'), 'no View section');
    });
  }
});

// The guest's Preferences door (owner, 2026-09-25, option 1): signed out the top bar's one
// account control is "Sign in" straight to the authorize screen, so Preferences — which a
// guest can use — moves to a row in the drawer. Signed in the account button covers it and
// the row is not drawn (one door, not two).
test('a guest gets a Preferences row under the rule; a signed-in reader does not', () => {
  withStorage({}, () => {
    const guest = walk(navTree({ el: fakeEl, session: null, feeds: [], tags: [], current: null }));
    const row = guest.find((n) => n.attrs['data-nav-item'] === 'preferences');
    assert.ok(row, 'the guest has a Preferences row');
    assert.equal(row.attrs.href, '/me');
    assert.match(row.kids.join(''), /Preferences/);
    const rule = guest.findIndex((n) => n.tag === 'hr');
    assert.ok(guest.indexOf(row) > rule, 'it sits with the browse surfaces under the rule');
    const signedIn = walk(navTree({ el: fakeEl, session: { did: 'did:plc:me' }, feeds: [], tags: [], current: null }));
    assert.ok(!signedIn.some((n) => n.attrs['data-nav-item'] === 'preferences'), 'signed in, the account button is the door');
  });
});
