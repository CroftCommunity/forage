# TODO

> Repo operations / deferred items only. The product/design backlog of record is
> `discovery/alpha/ROADMAP_TODO.md`; the tracking scheme is `CroftC/.claude/TRACKING.md`.
> Cross-reference E-numbers where an item here implements a backlog row.

Deferred work surfaced by `plans/2026-08-24-1-plan-behavior-scale-scaffolding.md`
(closed 2026-08-25) — full context lives there and in the ledger.

## Needs the owner

- **Pre-Spaces review** — the owner is reviewing phases 1–4 on forage.fyi before
  phase 5 starts. Findings from that review land here.

- **Phase 5 — the private BBS on Spaces** (plan 2026-08-25-1): PAUSED by the owner
  2026-08-25 with phases 1–4 deployed. The split is drafted and user-approved
  (5a–5d: space-credential module, bbs substrate, mode UI, DOCKER-gated W5);
  implementation starts on the owner's go. Local rehearsal rig:
  `ghcr.io/bluesky-social/atproto:pds-spaces-alpha` (D5 facts in the plan).

- ~~Push `main` + pull the `workflow_dispatch` hatch once~~ — DONE 2026-08-25: pushed
  `9f1cff4`; push-gate run 32792641974 and dispatched run 32792652759 both green;
  forage.fyi verified serving the new modules (sw at forage-v11).
- **`CroftC/.claude/CI-PATTERN.md`** — the forage row is stale (now: 2 workflows-worth
  of gate discipline in one workflow, all nine rules). Meta-repo commit, on request.
- **ATProto Spaces feasibility** (user-named, post-plan): the privacy variant of the
  scoped tier; probe the alpha, diff membership semantics against the roster+masking
  built here; its own plan.

- **Jetstream v2 stream freshness** (user, 2026-08-25): full investigation of how
  best to keep the content streams (feeds, /h/ hashtags, trending, quotes) fresh
  with the newly released Jetstream v2 — its own plan. Prior probes: filtered v1
  tail 676ms write→event; v2 `planSnapshot` was 401 token-gated. Context:
  `plans/2026-08-25-1-plan-backend-modes-bsky-writes.md` (NOT-doing list).
  **NARROWED 2026-08-26** by `plans/2026-08-26-1-plan-feed-discovery-sorts.md` (D5):
  Jetstream is NOT the instrument for ranking FEEDS. Measured — 310 like-events/sec
  and 159 KB/s on the tail, of which likes on feed generators are ~380/day
  network-wide (0 in a 30s tail; 2 in 7.6 replayed minutes / 68 MB). A 24h trending
  computation costs ~1.3 GB and ~2.4h of draining for an answer
  `app.bsky.feed.getLikes` returns per feed in ONE request. Jetstream cannot filter
  by subject (only wantedCollections/wantedDids), so there is no cheaper slice.
  What survives for E139: keeping POST streams fresh, where the events are the
  310/sec Jetstream is good at.

## Ledgered (see `ledger/divergence.js`)

- ~~DL-013 boost-as-like~~ — SHIPPED 2026-08-25 (plan 2026-08-25-1, 3c): boosts
  are real likes on the OAuth session; the invariant scan names the pair.
- **DL-014 guest lens search** — chip until a session; real search works signed-in
  (and /h/ hashtag boards ride it, session-gated — DL-021).
- **DL-015 lens saves** — bookmarks aren't public API surface yet.
- **DL-009 deleted-post title retention** (proposal) — decide when a scenario cares.

## Scoped-tier deployment (the "ten friends" instance)

> DEFERRED BY REDIRECT (2026-08-25): the all-public scoped mode is NOT wired
> into the app for now — the small-group experience ships as the private BBS on
> Spaces instead (plan 2026-08-25-1, phase 5). The machinery below stays live
> (codec, intake, writer, conformance world); wiring it in-app is wanted-later.

- Register a session-bound atproto substrate in `js/config/routing.js` (the codec,
  intake, and writer all exist and are live-proven; what's missing is session plumbing
  and a deploy story).
- Optional freshness channel: the filtered Jetstream live tail (676ms write→event,
  probe-proven) over the pull baseline.

## Lens polish

- ~~Real OAuth replaces the in-memory app-password sign-in~~ — DONE 2026-08-25
  (plan 2026-08-25-1, 2a–2c): vendored official client, `js/auth/session.js`,
  app-password card deleted; live loopback round-trip validated.
- ~~Comment author links inside lens threads~~ — DONE 2026-08-25 (3d): they link
  OUT to bsky.app (the lens tenet).
- ~~Lens pagination~~ — DONE 2026-08-25 (3d): field boards and ring boards page
  with More.

## Small

- Wrong-node `engine-strict` refusal recorded untested (only v22.23.2 + broken system
  node installed locally).
- One trivial mutation-audit residual: the rising-dispatch fixture's input order
  coincides with its expected order (2i write-up).
- 5e(1) commit message lost the word "held" to zsh backtick expansion (cosmetic).

## Bluesky-view polish (owner findings, 2026-08-26 local preview)

- ~~mutuals+1 hangs on the skeleton~~ — FIXED 2026-08-26 (3l): the board paints
  each member's posts as they land and bounds every member with a timeout; a
  hung member is reported, not fatal. STILL OPEN: preloading ring membership on
  session restore, and caching it across navigations. Related: DL-016 (cap),
  E139 (Jetstream v2 freshness).
- **Composing** — the hashtag affordance strip carries a disabled "Post to #x"
  button (3m). Writing posts is not built; when it is, that button is the
  deterministic path (feeds get no equivalent — DL-025).
- ~~hash routing vs clean paths~~ — DECIDED + SHIPPED 2026-08-26 (3n, owner):
  clean paths with the 404.html fallback; the service worker upgrades deep
  links to 200s; legacy `#/` links bridge at boot and live. Verified on
  forage.fyi at forage-v22.
- **Crawler caveat (from 3n):** a bot's FIRST hit on a deep link gets Pages'
  404 status (the body is correct). Only real fix is a host with rewrites, or
  prerendering. Decide if/when discoverability matters.
- **Naming note:** bsky.app uses the `#` glyph for FEEDS in its nav even though
  hashtags exist. Our split is the honest one (DL-025): `/f/` feeds are not
  targetable, `/h/` hashtags are.
