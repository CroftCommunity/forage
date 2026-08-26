# Agent Instructions: Forage

## Identity (workspace architecture)

**Scope:** The social forum (forage.fyi, /f/ convention, behavior-scale build; events per `docs/adr/`).
**Not this repo:** generic atproto auth (workspace prior art — DECISIONS.md; OAuth pending).
**Provides:** the forage site. **Consumes:** AppView pulls (ADR 0002).
Card + altitudes: `CroftC/.claude/ARCHITECTURE.md`.

Forage is a behavior-scale build (method: `discovery/alpha/thinking/behavior-scale/`
in the workspace). One behavioral contract, substrates per capability, scope as the
tier dial. This page is the law agents execute against; it is deliberately short.

Sources of truth, in order: `js/schema.js`, `scenarios/`, `js/config/routing.js`,
`ledger/divergence.js`. Modes are named routing tables (`MODES` there) with a
store-side lifecycle: network modes are RAM-only and `forage.state` is written by
the memory mode alone (`test/store-modes.test.js` is the teeth). (The latter two arrive in phases 3–4 of
`plans/2026-08-24-1-plan-behavior-scale-scaffolding.md`; until then the plan is the
routing/ledger authority.) When these disagree with any document **including this
one**, they win; fix the document.

## Invariants

1. All mutations MUST flow through the actions adapter. No component writes state
   or calls a backend directly.
2. Policy (visibility, blocking, gating) MUST live in selectors, NEVER in
   components.
3. Reducers and scenarios MUST NOT call `Date.now()` or any randomness. Time and
   randomness are inputs resolved at dispatch or replay.
4. Substrate selection (and therefore a build's tier) MUST happen only in the
   routing config.
5. Every mutation type MUST exist in the shared schema before any implementation
   uses it.
6. Every new mutation MUST land with at least one scenario exercising it.
6b. Every unit shipping user-visible behavior MUST add or extend a workflow
    journey (`e2e/`) in the same unit; a unit with no workflow surface says so
    explicitly in its plan entry. (Browser-level sibling of invariant 6.)
7. Deferring a path and registering its frontier MUST be the same commit.
8. Behavior present only at one tier MUST carry a proposal (or frontier) entry
   before it renders.
9. Conformance MUST pass (or differences be ledgered as tolerances) before a
   capability change merges on either side.
10. Results from a tier below the intended production scale MUST NEVER be cited as
    evidence for performance, concurrency, capacity, or any scale claim. The mock
    answers "does it behave and feel right," never "does it hold up."
11. When documentation and behavior disagree, behavior (schema plus scenario suite)
    wins and the documentation is corrected. Prose is never the source of truth.

## Procedures

### Adding a user-visible function

1. Define the event(s) and payloads in the schema.
2. Write or extend the reducer; state derives, nothing is hand-maintained.
3. Expose reads as selectors, with policy enforced there.
4. Add the action through the adapter; wire the UI with all four states (skeleton,
   empty, error, gated).
5. Author a scenario touching the new mutation, with seat-level assertions.
6. Run conformance if any affected capability is on `api` or `hybrid`.
7. Run the acceptance checklist items for the affected screens.

### Changing an engine (ranking, recommendations, limits)

1. Implement the change as a variant alongside the current version.
2. Run both variants over the scenario library; record the output diff.
3. If the diff violates a contractual assertion, either revise or ledger a
   tolerance with reason.
4. Promote the variant; keep the diff record with the change.

### Scaling a capability (moving it up the continuum)

1. Implement the API against the schema for that capability's events and selectors.
2. Flip the routing config to `hybrid`.
3. Run conformance on every scenario touching the capability; ledger tolerances
   explicitly.
4. Flip to `api`. Keep the memory implementation; it is still the substrate for the
   mock and small tiers.
5. Add the capability's scenarios to the backend CI as fixtures.

### Escalation

On schema conflicts, tolerance ambiguity, or any case where the procedure
underdetermines the choice: STOP, surface the question, and log it as an ADR rather
than inventing an answer. An invented convention that ships is drift with a head
start.

## Surfaces (Bluesky population)

Clean paths (3n) — no `#` fragments; `404.html` mirrors `index.html` for Pages
deep links and the service worker upgrades them to 200s. One route namespace,
resolved by the active presentation mode (`js/mode.js`):
`/` home · `/f/@creator/:rkey` feed board (the SHAREABLE form) · `/f/:slug` the
same board in-session · `/h/:tag` hashtag board · `/p?uri=` thread ·
`/u/:handle` profile · `/me` your session + accounts + moderation mirror ·
`/feeds` discovery · `/mode` · `/settings`. Cross-population routes gate with
words. A feed link must carry its CREATOR to survive being pasted: an rkey has
no DID, and nothing resolves one without a repo (3v). Human aliases still route.

The lens writes, and `test/invariants.test.js` counts every one of them —
adding another means arguing for it there first:

| Write | What | Since |
|---|---|---|
| `createRecord` → `app.bsky.feed.like` | boost | DL-013 |
| `deleteRecord` → `app.bsky.feed.like` | unboost | DL-013 |
| `createRecord` → `app.bsky.feed.post` | publish a post or reply | 3w |
| `deleteRecord` → `app.bsky.feed.post` | delete your OWN post or reply | phase 2 |
| `uploadBlob` | image bytes into your repo, referenced by the post | phase 3 |
| `putPreferences` (savedFeedsPrefV2) | join / leave a feed | 3j |
| `putPreferences` (savedFeedsPrefV2) | favorite / unfavorite (pin) | 3s |

No `putRecord` anywhere: the lens creates and deletes, and never edits a
record — changing a post means deleting it and writing another, which is what
the network itself does. **Every write addresses `session.did` and nothing
else**, and the post delete additionally parses the at-uri and refuses one
outside your repo; `test/invariants.test.js` asserts both, per occurrence. Joining and favoriting are DIFFERENT states — saved is your list,
pinned is the top row of tabs — and conflating them rearranged the official
app's tab bar for anyone who joined a feed here (3s).

## Verification

Every task ends with:

1. `npm test` — the whole gate (characterization, purity, invariant scans; CI runs
   the identical command).
2. `npm run conformance` — once phase 4 lands; until then this line is inert and
   `npm test` is the full gate.
2b. `npm run workflows` — the workflow corpus (`e2e/*.workflow.mjs`): the app as
   a running system in a real browser, shim-backed and hermetic; LIVE=1/DOCKER=1
   unlock the credentialed/daemon-bound journeys locally.
3. The acceptance checklist items for affected screens, executed seat by seat via
   the dev-bar persona switcher (seat-level and observable: "switch to seat
   `newbie.moss`; Create Field is gated with the probation message").
4. A report of results, including tolerated differences with ledger ids.

## Escalation

STOP and write an ADR to `docs/adr/` (NNNN-slug.md, registered in `CroftC/.claude/DECISIONS.md`) when: schema conflict, tolerance ambiguity,
procedure underdetermines the choice. Never invent a convention.

## Concurrent sessions (workspace norm)

Multiple agent sessions share the `CroftC/` workspace. Do multi-turn work in a dedicated
worktree — `git -C forage worktree add ../worktrees/forage/<slug> -b claude/<slug>` — never in
this checkout (peer sessions stage with `git add -A`; loose files get swept into unrelated
commits). Contested surfaces here — claim in `CroftC/.coordination/claims/` before
touching: **landing on `main`** (the Pages deploy at forage.fyi follows it). Full protocol
and the reasons behind it: `CroftC/.claude/COORDINATION.md`.
