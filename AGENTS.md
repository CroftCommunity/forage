# Agent Instructions: Forage

Forage is a behavior-scale build (method: `discovery/alpha/thinking/behavior-scale/`
in the workspace). One behavioral contract, substrates per capability, scope as the
tier dial. This page is the law agents execute against; it is deliberately short.

Sources of truth, in order: `js/schema.js`, `scenarios/`, `js/config/routing.js`,
`ledger/divergence.js`. (The latter two arrive in phases 3–4 of
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

## Verification

Every task ends with:

1. `npm test` — the whole gate (characterization, purity, invariant scans; CI runs
   the identical command).
2. `npm run conformance` — once phase 4 lands; until then this line is inert and
   `npm test` is the full gate.
3. The acceptance checklist items for affected screens, executed seat by seat via
   the dev-bar persona switcher (seat-level and observable: "switch to seat
   `newbie.moss`; Create Field is gated with the probation message").
4. A report of results, including tolerated differences with ledger ids.

## Escalation

STOP and write an ADR to `adr/` when: schema conflict, tolerance ambiguity,
procedure underdetermines the choice. Never invent a convention.

## Concurrent sessions (workspace norm)

Multiple agent sessions share the `CroftC/` workspace. Do multi-turn work in a dedicated
worktree — `git -C forage worktree add ../worktrees/forage/<slug> -b claude/<slug>` — never in
this checkout (peer sessions stage with `git add -A`; loose files get swept into unrelated
commits). Contested surfaces here — claim in `CroftC/.coordination/claims/` before
touching: **landing on `main`** (the Pages deploy at forage.fyi follows it). Full protocol
and the reasons behind it: `CroftC/.claude/COORDINATION.md`.
