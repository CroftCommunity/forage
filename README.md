# Forage

<img src="assets/logo-wordmark.jpg" alt="Forage — wordmark with a rook in a wreath as the O" width="640">

**Forage the open web.**

Forage is a topic-driven aggregation site in the Reddit structural family — three-column
layout, community-scoped posting, universal boost/bury rating, hot ranking with time
decay, deeply nested collapsible comments, volunteer stewards with a public audit log.

This repository is **version one: a behavioral twin with no production sibling yet.** The
entire front end runs on in-memory reducers, browser persistence, deterministic seeds, and
a persona switcher — built so the same contract can later be pointed at a real backend
capability by capability.

## Run it

No build step. Serve the folder over HTTP (ES modules need a server, not `file://`):

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

Tests run on the pinned Node (`.nvmrc`, enforced by `engine-strict`; `fnm install` reads
the pin) with zero dependencies:

```sh
npm test              # unit, characterization, purity + invariant scans, scenarios
npm run conformance   # replay the scenario library on two substrates, compare observables
```

CI runs both as the gate on every PR and push to `main`.

Deployed on GitHub Pages at [forage.fyi](https://forage.fyi/) and installable as a PWA. All
asset paths are relative, so it works equally under a project subpath. Append `?nosw` to
bypass the service worker. Domain, DNS, certificate, and brand-asset operations:
[docs/HOSTING.md](docs/HOSTING.md).

## How it works

Identity is a **dev-bar dropdown**, not a login. Every UX path is walkable from every seat.

- **Event vocabulary** (`js/schema.js`) — the build spec's data model becomes an append-only
  event log. Scores, comment counts, reputation and unread badges are *derived*, never
  stored: state is a pure fold over the log (`js/reducers.js`), so drift is impossible.
- **Selector contract** (`js/selectors.js`) — the read API of the future, expressed as pure
  functions now. Policy (the §10 permission matrix, removal masking, ban read-only, rate
  limits) lives here so it holds on every surface.
- **Action contract** (`js/actions.js`) — the write side. Every action resolves its
  capability's substrate through the routing table (`js/config/routing.js`, all `memory`
  today) and dispatches to it (`js/substrates/memory.js` is the only module that touches
  the store's commit); the dev bar's latency toggle and Fail-Next wrap that dispatch, so
  the optimistic-vote rollback path is observable on any substrate.
- **Engines** (`js/engines/`) — the ranking math as pure, swappable functions. Hot, Best
  (Wilson), Controversial and Rising carry the build spec's formulas verbatim; the Limits
  engine runs rolling-window rate limits over the event log.

## Skins

A skin is a **token-sheet swap** (Settings → Skin, device-local): an extra
stylesheet that may only reassign the design tokens in `css/tokens.css` —
`test/skins.test.js` scans every registered skin and refuses smuggled component
rules. Shipping: **Classic BBS** (amber terminal, monospace, square corners) and
**Usenet gray** (newsprint). Skins and modes are independent axes — the BBS skin
in the Bluesky view is legal, just off-theme; the BBS mode merely defaults to
its skin. New skins are cheap: one CSS file + one registry line.

## Testing

`npm test` (units + invariant scans) · `npm run conformance` (memory↔codec worlds)
· `npm run workflows` (the journey corpus: the app in a real browser over a
hermetic network shim — `e2e/`; `LIVE=1` / `DOCKER=1` unlock the credentialed and
spaces-PDS journeys locally).

## The dev bar

Above the header, dashed to mark it as scaffolding:

- **Mode** — memory | bbs (network modes are RAM-only; Seed/Import/Delete All and
  the persona switch are pinned outside memory), plus the "Bluesky view" link —
  a view, not a store mode.
- **Persona** — switch seats; re-derives every viewer-dependent view in one place.
- **Seed / Delete All** — replay the scenario library (`scenarios/` — the same
  deterministic, assertion-carrying scenarios the test suite and conformance harness
  run), or clear to the genuine empty state.
- **Export / Import** — round-trip the whole event log as JSON.
- **Latency** — 0 / 250 / 600 ms simulated write latency.
- **Fail Next** — arm a one-shot write failure to watch optimistic UI roll back.
- **Frontiers / SW unregister** — toggle deferred-feature chips; drop the service worker.

## Personas (seats)

| Seat | Handle | Covers |
|---|---|---|
| — | Logged out | Public reads, auth-gates on every write |
| 1 | `admin.wren` | Site admin |
| 2 | `owner.sage` | Owner of `gardening` |
| 3 | `steward.briar` | Steward of `gardening` + plain member elsewhere (dual-hat) |
| 4 | `member.fern` | Established member — the default reader seat |
| 5 | `newbie.moss` | Probation: rate-limited, cannot create Fields |
| 6 | `banned.thorn` | Banned from `gardening`, active elsewhere |
| 7 | `heavy.aspen` | High reputation, at the post rate limit, saved items populated |
| 8 | `pristine.dove` | Never receives seed activity — first-run and empty states forever |

## Nomenclature

| Concept | Forage term |
|---|---|
| Community node | **Field** (`/f/:slug`) |
| Rating | **Boost / Bury** |
| Volunteer moderator | **Steward** |
| Public mod log | **Audit log** |

## Where Bluesky's behavior is defined (two sources, two questions)

Forage is a lens onto Bluesky, so most of what it must get right is defined
somewhere else. There are two authorities and they answer different questions:

| Question | Source |
|---|---|
| What is **legal** — required fields, limits, record shapes | the official lexicons, `bluesky-social/atproto/lexicons/…` |
| What the network **actually does** — defaults, conventions, what other clients expect | the official client, [`bluesky-social/social-app`](https://github.com/bluesky-social/social-app) |

`social-app` is what drives bsky.app (its own repo metadata says so:
`homepage: https://bsky.app`, MIT, actively maintained), which makes it the
canonical reference for client behavior — the things a lexicon cannot tell you
because they were never a matter of legality.

Every wrong assumption this project has shipped lived in the gap between those
two. The lexicon does not mention content languages at all; only the client's
`src/state/persisted/schema.ts` shows they are stored **in the app**, that
language tags are two letters with the region stripped, and that a post's
language defaults to the device's.

Reading it:

```sh
gh api "search/code?q=contentLanguages+repo:bluesky-social/social-app"
gh api repos/bluesky-social/social-app/contents/src/state/persisted/schema.ts \
  --jq .content | base64 -d
```

**Differing from it is allowed; differing by accident is not.** Two places
Forage diverges on purpose, both recorded in the ledger: the official client
defaults your content languages to your device's, and Forage defaults to no
filter at all — narrowing what you see without being asked is the opposite of
the point. And where the client falls back to `'en'` when the device says
nothing, Forage says nothing, rather than claim a language it does not know.

Details and the full discipline: `AGENTS.md` invariant 12, `ledger/divergence.js`
(DL-026), and `CroftC/.claude/DECISIONS.md` § Prior-art router for the
workspace-wide entry.

## Boards: feeds and hashtags are NOT the same promise

Both render as boards — same rows, same sort bar, same card/compact view — and
differ in exactly one place, the strip at the top:

| | `/h/<tag>` hashtag | `/f/<feed>` feed |
|---|---|---|
| Who decides what appears | the tag itself | a program you cannot inspect |
| Can you get in on purpose | **yes** — include the tag | **not knowably** |
| Rules published | n/a (the tag IS the rule) | **no** — verified 2026-08-26 |
| Join | nothing to join | subscribe (writes your Bluesky saved feeds) |

Feeds publish no machine-readable criteria: the `app.bsky.feed.generator`
record carries only name/description/avatar, `describeFeedGenerator` returns a
service DID, and the third-party builders keep configs server-side. The only
inclusion instructions that exist are the feed's own description prose — which
is why the feed board renders it verbatim and never offers a "post to this
feed" button (`ledger/divergence.js` DL-025).

Neither is a subreddit: a hashtag has no membership or moderators, a feed
cannot be posted into. The BBS mode (phase 5) is the surface where the full
forum contract — membership, gatekeeping, posting into a place — becomes real.

## The front door, and the two populations

Forage is **one of two things at a time** — full populations, never mixed
(`/mode` switches; the routes `/`, `/f/`, `/h/`, `/p` mean whichever is
active):

- **Bluesky view** (the domain default): live network content, topic-first, no
  account needed. Signed in (OAuth), the **ring dial** chooses how far out your
  world goes — World / Following / Mutuals / Mutuals +1 (capped at 25 with
  honest overflow) — boosts are real likes, threads continue through replies
  AND quotes, your account's moderation posture applies everywhere, `#tags`
  open `/h/` boards, and the trending rail opens topics as feed streams.
- **Memory sandbox**: the local, seeded instrument — nothing leaves the device.

Your choice at `/mode` is device-local, and CLEARING it means the device
follows the domain default. A route that belongs to the other population gates
with words — no silent redirects, no mixed chrome.

**Identity surfaces** (Bluesky population): `/me` carries your session, the
account switcher (several fully separate accounts, one page), and the
moderation mirror; `/u/<handle>` is any user's profile — avatar, banner,
counts, bio, and their posts — with editing linked out to bsky.app.
`/feeds` is feed discovery (searchable); every feed board carries its card.

## URLs

Real paths, not hash fragments: `forage.fyi/h/gardening`, `forage.fyi/f/whats-hot`,
`forage.fyi/u/alice.test`. GitHub Pages has no rewrite rules, so `404.html` is a
copy of `index.html` (a test asserts they stay identical) and serves every deep
link; the service worker answers navigations from the cached shell, which makes
those links real 200s and works offline. Links already shared in the old `#/`
form are bridged to their clean path at boot AND live, so they keep working.
Every asset reference must be absolute — a route-relative `./icons/x.png`
resolves against `/f/` on a deep link, so `test/invariants.test.js` scans for it.

## Modes

The running app has **modes** — named routing tables over the same capabilities
(`MODES` in `js/config/routing.js`) plus a dataset lifecycle (`js/store.js`):

- **memory** (the default): the local sandbox. The only mode that persists —
  everything lives under the `forage.state` key.
- **bbs** (experimental, phase 5): the private-board mode. RAM-only: entering it
  suspends persistence structurally, the dataset dies on exit/reload, and
  `forage.state` is provably untouched (byte-identical round-trip under test).
- The **Bluesky view** (`/`) is deliberately NOT a mode — it is a read
  surface over the live network with its own session; nothing from it enters the
  event fold. Identity is **Sign in with Bluesky** (the official OAuth flow via
  the vendored `@atproto/oauth-client-browser`, drift-checked in
  `test/vendor.test.js`): you authorize on your own server, no credentials touch
  Forage, and the session survives reloads. Works on forage.fyi and localhost
  (the OAuth client is origin-bound; other origins are read-only).

The dev bar's store-mode control is scaffolding; the PRESENTATION mode
(which population the app is) lives at `#/mode`.

## The tiers

One behavioral contract, one atproto data plane — **scope is the tier dial**
(`js/config/routing.js`):

- **Mock** (`memory`, this deployment): the permanent in-browser instrument — hermetic
  CI/CD, behavior and workflow testing, and the conformance baseline every other tier is
  proven against.
- **Scoped** (atproto, small aperture, all public): Forage's write vocabulary as
  `fyi.forage.*` records (`lexicons/`) in members' own PDS repos; a `fyi.forage.roster`
  record in the founding DID's repo is the aperture; intake is unauthenticated
  `listRecords` over exactly the roster's DIDs; moderation is steward action records
  applied as masking at fold time (nobody deletes another member's records). The
  substrate (`js/substrates/atproto.js`) is a pure event↔record codec plus a
  session-bound writer — proven by conformance against `memory` over the whole scenario
  library, and live on a real PDS with two DIDs.
- **Wide** (atproto, network aperture — next): the same UI as a lens over the owner's
  own Bluesky: Fields are feeds, replies are the thread tree, boost rides likes,
  moderation rides mutes/blocks/labelers through the same masking selectors.

Differences between tiers are refused by the conformance harness
(`npm run conformance`) unless the divergence ledger (`ledger/divergence.js`, rendered
at `#/frontiers`) names them.

---

*Find the good stuff.* · [forage.fyi](https://forage.fyi)
