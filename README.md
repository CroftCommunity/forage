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
npm test
```

CI runs the same command as a gate on every PR and push to `main`.

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

## The dev bar

Above the header, dashed to mark it as scaffolding:

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

## Later layers

The adapter layer keeps `memory` as its sole substrate until the contract stabilizes; a
conformance harness arrives when the first capability grows an `api` implementation (the
build spec's Next.js + Postgres stack is that implementation's spec, already written). A
community edition follows via a `sync` substrate with an honor-system identity model. The
divergence ledger starts from the frontier list at `#/frontiers`.

---

*Find the good stuff.* · [forage.fyi](https://forage.fyi)
