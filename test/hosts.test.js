// Phase B — the host registry (plan 2026-08-26-3).
//
// A pure, importable module ON PURPOSE. The curated-name check has to scrape
// `js/ui/lens-views.js` as SOURCE TEXT because CURATED lives in a module that
// cannot be imported outside a browser. The LIVE drift check for these hosts
// must not repeat that, so the registry lives in js/auth/.
//
// Every fact here was probed against the live network 2026-08-26/27, not
// inferred: describeServer for the signup posture, the oauth-authorization-
// server document for OAuth support, and prompt=create driven end to end
// through the vendored client (Phase 0 D1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOSTS, SIGNUP, hostById, featuredHosts, canCreateAccount, validateHosts }
  from '../js/auth/hosts.js';

test('4k: every host declares an entryway, a label, and a signup posture', () => {
  for (const h of HOSTS) {
    assert.ok(h.id, `host without an id: ${JSON.stringify(h)}`);
    assert.match(h.entryway, /^https:\/\//, `${h.id}: entryway must be an https origin`);
    assert.ok(h.label, `${h.id}: needs a human label`);
    assert.ok([SIGNUP.OPEN, SIGNUP.INVITE].includes(h.signups), `${h.id}: unknown posture ${h.signups}`);
  }
});

test('4k: the real registry passes validation', () => {
  assert.doesNotThrow(() => validateHosts());
});

test('4k: an unknown posture fails loudly and names the host AND the value', () => {
  const bad = [{ id: 'x', label: 'X', entryway: 'https://x.test', signups: 'maybe' }];
  assert.throws(() => validateHosts(bad), (e) => /x/.test(e.message) && /maybe/.test(e.message));
});

test('4k: a duplicate entryway fails loudly — two ids pointing at one server is a bug', () => {
  const dupe = [
    { id: 'a', label: 'A', entryway: 'https://same.test', signups: SIGNUP.OPEN },
    { id: 'b', label: 'B', entryway: 'https://same.test', signups: SIGNUP.INVITE },
  ];
  assert.throws(() => validateHosts(dupe), /same\.test/);
});

test('4k: hostById names what it does not know, like hrefFor and sourceLabel do', () => {
  assert.throws(() => hostById('nope'), (e) => /nope/.test(e.message) && /bsky/.test(e.message));
});

// The owner settled the SHAPE (capped, remainder behind "Another server");
// the MEMBERSHIP is still an open question in the plan. So the cap is asserted
// as a mechanism, not as a specific list.
test('4k: the featured list is capped, and the cap is a real constraint', () => {
  assert.ok(featuredHosts().length <= 4, 'featured list must be capped');
  assert.ok(featuredHosts().length >= 1, 'a capped list of nothing is not a list');
  for (const h of featuredHosts()) assert.ok(HOSTS.includes(h), 'featured hosts come from the registry');
});

// BOTH directions. The owner's decision was that an invite-only host shows the
// WORDS "invite only" where the create button would be — so a test that only
// checks the open case would pass while the invite case rendered a button.
test('4k: open-signup hosts offer account creation; invite-only hosts do NOT', () => {
  const open = { id: 'o', label: 'O', entryway: 'https://o.test', signups: SIGNUP.OPEN };
  const invite = { id: 'i', label: 'I', entryway: 'https://i.test', signups: SIGNUP.INVITE };
  assert.equal(canCreateAccount(open), true);
  assert.equal(canCreateAccount(invite), false,
    'invite-only must not offer create — prompt=create would land on a wall demanding a code');
});

test('4k: the registry knows bsky.social and blacksky.app are the OPEN ones (probed)', () => {
  const byId = Object.fromEntries(HOSTS.map((h) => [h.entryway, h.signups]));
  assert.equal(byId['https://bsky.social'], SIGNUP.OPEN);
  assert.equal(byId['https://blacksky.app'], SIGNUP.OPEN);
  assert.equal(byId['https://northsky.social'], SIGNUP.INVITE);
});
