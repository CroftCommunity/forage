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
import { HOSTS, SIGNUP, hostById, featuredHosts, otherHosts, canCreateAccount, validateHosts, appFor }
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

// 2026-08-29 (owner): the front page of the sheet is the OPEN hosts only —
// the ones a newcomer can actually join from here. Invite-only hosts are not
// dropped; they move to the "Another server" panel, next to the handle field,
// where a member of one still gets a Sign in and the words that explain why
// there is no Create beside it. So the split is a function of posture, and
// both halves are asserted so a host cannot silently fall out of both.
test('4k: featured hosts are ONLY the open-signup ones; invite-only hosts live on the other panel', () => {
  const reg = [
    { id: 'o1', label: 'O1', entryway: 'https://o1.test', signups: SIGNUP.OPEN },
    { id: 'i1', label: 'I1', entryway: 'https://i1.test', signups: SIGNUP.INVITE },
    { id: 'o2', label: 'O2', entryway: 'https://o2.test', signups: SIGNUP.OPEN },
  ];
  assert.deepEqual(featuredHosts(reg).map((h) => h.id), ['o1', 'o2'], 'featured keeps registry order, open only');
  assert.deepEqual(otherHosts(reg).map((h) => h.id), ['i1'], 'invite-only hosts go to the other panel');
  const all = [...featuredHosts(reg), ...otherHosts(reg)].map((h) => h.id).sort();
  assert.deepEqual(all, ['i1', 'o1', 'o2'], 'every registered host is on exactly one panel');
});

test('4k: the real registry has open hosts on the front page and Northsky behind Another server', () => {
  assert.ok(featuredHosts().every((h) => h.signups === SIGNUP.OPEN));
  assert.ok(otherHosts().some((h) => h.entryway === 'https://northsky.social'));
});

test('4k: the registry knows eurosky.social is OPEN and speaks OAuth (probed 2026-08-29)', () => {
  const h = hostById('eurosky');
  assert.equal(h.entryway, 'https://eurosky.social');
  assert.equal(h.signups, SIGNUP.OPEN);
  assert.equal(h.label, 'EuroSky');
});

// feed-row v13 decision 28 (owner: "can we make this open on bsky.app respective
// to the user's actual logged in provider?"): the ⋯ menu's "Open on …" follows
// the signed-in provider when the registry names a web app for it. Probed
// 2026-08-30: blacksky.app, eurosky.social and northsky.social are PDS hosts
// with no /profile route (404) — no app to name — so they fall back to bsky.app,
// and the item SAYS bsky.app rather than pretending. bsky.social is Bluesky's
// PDS; its app is bsky.app.
test('appFor: the signed-in provider names its app, or bsky.app stands in and says so', () => {
  assert.deepEqual(appFor('https://bsky.social'), { url: 'https://bsky.app', host: 'bsky.app', own: true });
  assert.deepEqual(appFor('https://blacksky.app'), { url: 'https://bsky.app', host: 'bsky.app', own: false });
  assert.deepEqual(appFor(null), { url: 'https://bsky.app', host: 'bsky.app', own: false });
  assert.equal(HOSTS.find((h) => h.id === 'bsky').app, 'https://bsky.app');
  for (const h of HOSTS) if (h.id !== 'bsky') assert.equal(h.app, null, `${h.id}: no app probed yet — null, never a guess`);
});
