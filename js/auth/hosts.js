// Phase B — the atproto hosts Forage can start a sign-in at (plan 2026-08-26-3).
//
// Forage has no accounts of its own. Every identity here belongs to a server
// someone else runs, and the front door's job is to route you to one — which
// is why this is a list of real servers with visibly different rules rather
// than a single "Sign in with Bluesky" button. The sheet teaches the shape of
// the network by showing it.
//
// WHY THIS IS A MODULE AND NOT VIEW CONFIG: `CURATED` lives in
// js/ui/lens-views.js, which cannot be imported outside a browser, so its LIVE
// drift check has to scrape source text and asserts its own parse in case the
// shape moves. That was a cost paid once. The drift check for these hosts
// imports this file instead.
//
// EVERY FACT BELOW WAS PROBED, not inferred (2026-08-26/27):
//   - signup posture:  com.atproto.server.describeServer -> inviteCodeRequired
//   - OAuth support:   /.well-known/oauth-authorization-server
//   - prompt=create:   driven end to end through the vendored client (Phase 0
//                      D1). All four ADVERTISE it; the two open ones were
//                      observed landing in the registration wizard.
//   - eurosky.social:  added 2026-08-29 (owner). describeServer says open
//                      signups (phone verification, no invite code); the OAuth
//                      document advertises prompt=create and transition:generic.
//                      `eurosky.tech` is the project site and `portal.eurosky.tech`
//                      the account portal — NEITHER is the PDS; the entryway is
//                      `eurosky.social` (`pds.eurosky.social` resolves to the
//                      same server, same DID). Recorded so the first guess is
//                      not repeated.
// `blacksky.community` is NOT a PDS — the Blacksky host is `blacksky.app`.
// Recorded because it was the first guess and it was wrong.
// e2e/hosts-live.workflow.mjs (LIVE=1) is what notices when any of this rots.

export const SIGNUP = Object.freeze({ OPEN: 'open', INVITE: 'invite' });

// `app` (feed-row v13 decision 28): the provider's own WEB APP, where "Open on …"
// in the ⋯ menu goes for a reader signed in there — or null, and bsky.app stands
// in. Probed 2026-08-30 (GET /profile/bsky.app): blacksky.app, eurosky.social and
// northsky.social answer 404 — they are PDS hosts, not apps — and bsky.social
// itself 404s too (Bluesky's app is bsky.app, a different host). A null here is a
// fact recorded, never a guess (CLAUDE.md § External APIs); re-probe before filling one.
export const HOSTS = Object.freeze([
  Object.freeze({ id: 'bsky', label: 'Bluesky', entryway: 'https://bsky.social', signups: SIGNUP.OPEN, app: 'https://bsky.app' }),
  Object.freeze({ id: 'blacksky', label: 'Blacksky', entryway: 'https://blacksky.app', signups: SIGNUP.OPEN, app: null }),
  Object.freeze({ id: 'eurosky', label: 'EuroSky', entryway: 'https://eurosky.social', signups: SIGNUP.OPEN, app: null }),
  Object.freeze({ id: 'northsky', label: 'Northsky', entryway: 'https://northsky.social', signups: SIGNUP.INVITE, app: null }),
]);
const FALLBACK_APP = 'https://bsky.app';
// The app a post opens on for a reader whose session was issued by `issuer` (the
// OAuth server — the provider's entryway). `own` says whether it is the provider's
// own app or bsky.app standing in, so the menu item can say which.
export function appFor(issuer, list = HOSTS) {
  const norm = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();
  const host = list.find((h) => norm(h.entryway) === norm(issuer));
  const url = host?.app || FALLBACK_APP;
  return { url, host: new URL(url).hostname, own: !!host?.app };
}
// MEMBERSHIP is the owner's: settled 2026-08-27 at two open-signup hosts and
// ONE invite-only, chosen for reputation rather than for count; EuroSky added
// 2026-08-29. The same day the owner moved the invite-only host OFF the front
// page: the sheet's first screen is now the hosts a newcomer can actually join
// from here, and invite-only hosts sit on the "Another provider" panel beside the
// handle field, where a member still gets Sign in and the words that explain
// the missing Create. The plurality lesson survives — the panel is one tap
// away and the sheet's intro copy says it out loud.
//
// `zio.blue` was probed and is a real, OAuth-speaking PDS; it is out because
// three names is a small reviewable editorial commitment and four was not
// better. `mu.social` was considered and REJECTED on fact, not taste: it is a
// MASTODON server (403 on every atproto endpoint), so it is ActivityPub and
// this client cannot speak to it at all. `muni.town` is not a PDS either.
// Recorded so neither is re-proposed.

// The owner settled the SHAPE — capped, with everything else reachable through
// "Another provider", which takes a handle on any atproto host. The split between
// the two panels is POSTURE, not position in the list: featured = open signups
// (capped), other = invite-only. Both are derived from one registry so a host
// cannot fall off both panels by being edited in one place.
export const FEATURED_CAP = 4;
export function featuredHosts(list = HOSTS) {
  return list.filter((h) => h.signups === SIGNUP.OPEN).slice(0, FEATURED_CAP);
}
export function otherHosts(list = HOSTS) { return list.filter((h) => h.signups === SIGNUP.INVITE); }

export function hostById(id, list = HOSTS) {
  const h = list.find((x) => x.id === id);
  if (!h) throw new Error(`unknown host: ${id} (known: ${list.map((x) => x.id).join(', ')})`);
  return h;
}

// An invite-only host still ADVERTISES prompt=create — it would just land you
// on a create screen that then demands a code. So the posture is what decides
// whether we offer creation, not the host's advertised capability.
export function canCreateAccount(host) { return host.signups === SIGNUP.OPEN; }

// Bad registry data is silent breakage: a sign-in that lands nowhere, or an
// "invite only" label on a server with open signups. Validate loudly instead,
// and run it over the real registry from the test suite.
export function validateHosts(list = HOSTS) {
  const seen = new Set();
  for (const h of list) {
    if (!h.id) throw new Error(`host without an id: ${JSON.stringify(h)}`);
    if (!/^https:\/\//.test(h.entryway || '')) throw new Error(`host ${h.id}: entryway must be an https origin (got ${h.entryway})`);
    if (!h.label) throw new Error(`host ${h.id}: needs a human label`);
    if (![SIGNUP.OPEN, SIGNUP.INVITE].includes(h.signups)) {
      throw new Error(`host ${h.id}: unknown signup posture '${h.signups}' (expected '${SIGNUP.OPEN}' or '${SIGNUP.INVITE}')`);
    }
    if (seen.has(h.entryway)) throw new Error(`two hosts share the entryway ${h.entryway} — one server, two ids, is a bug`);
    seen.add(h.entryway);
  }
  return list;
}
