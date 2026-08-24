# Plan: behavior-scale scaffolding — the seam, the law, and the two substrates

date: 2026-08-24
status: READY FOR EXECUTION — all three passes complete (2026-08-24); no BLOCKING
questions; OQ1/OQ4 phase-gated, OQ5 advisory
repo: `CroftCommunity/forage`, local checkout `CroftC/forage`
baseline: `main` @ `f5639a2` (clean tree)
method: `discovery/alpha/thinking/behavior-scale/behavior-scale-methodology.md` (invariants §8,
procedures §9, roadmap §13, skeletons Appendix A/B). Cited below as **BSM**.
planning workflow: `phase-plan` skill (three-pass). This file is the single plan artifact
for all passes.

## Outcome Summary

| Phase | Outcome | Commits | Note |
|---|---|---|---|
| 0 Discovery | ✅ resolved in planning | — | D1 answered during Pass 3; probe deleted |
| 1 Test rig, CI, law | ✅ SHIPPED | `3ed7a31`…`46f92d4` | 61 pass + 6 todo; gate bites (red 32782423150, green 32782491189); dispatch hatch pending main push |
| 2 Determinism/purity | pending | | |
| 3 Adapter + routing | pending | | |
| 4 Scenarios + harness | pending | | |
| 5 Scoped atproto | pending | | |
| 6 Wide lens | pending | | |

## Problem Statement

Forage is a behavior-scale build whose **contract layer is real** (event vocabulary with
dispatch-time validation, state as a pure fold, policy in selectors, pure engines) but whose
**adapter layer is notional**: the README claims "the adapter layer keeps `memory` as its sole
substrate," yet no adapter or routing table exists — `js/actions.js` calls `store.commit`
directly, and three UI sites bypass even the actions module. A 2026-08-24 review found six
gaps, several of them violations of BSM's own invariants:

1. **No adapter / routing table** (BSM invariant 4, roadmap layer 3). The capability→substrate
   seam both upcoming substrates need does not exist.
2. **UI bypasses actions** (invariant 1): `js/ui/views.js:333` (`notification.read`),
   `views.js:485-486` (`field.created`, `field.joined`). There is no `createField` action at
   all — Field creation exists only as an inline view commit.
3. **Replay non-determinism** (invariant 3): `js/reducers.js:193` calls `Date.now()` inside a
   reducer; selectors call `Date.now()` (`js/selectors.js:16,130`) and import `nowSec`/
   `getEvents` from the store singleton (`selectors.js:8`), coupling the "pure read API" to
   one global store — a conformance harness cannot run the same selectors over a second
   substrate's state.
4. **No scenario library, no conformance harness, no tests, no CI.** `data/seed.js` is one
   monolithic seed with zero assertions; invariant 6 ("no mutation without a scenario") has
   no enforcement; the repo has no `.github/workflows` (outside the workspace CI pattern,
   `CroftC/.claude/CI-PATTERN.md`).
5. **Schema validation gaps**: entity-creating events (`post.created`, `comment.created`,
   `field.created`) rely on `payload.id` in reducers but `id` is not required in
   `EVENT_TYPES`, so an id-less event validates and corrupts state under an `undefined` key.
   The actor check in `validateEvent` (`js/schema.js:48-51`) never rejects `actor: null`, so a
   logged-out direct commit validates. Event ids from `genId` are a per-device sequence
   (`ev_0_0`) — guaranteed collisions the moment two devices sync. **(Pass 2 addition:)**
   `store.loadEvents` and `storage.importJson` never validate events at all, so hardened
   dispatch-time validation is bypassable via Import — and `importJson` stamps the current
   `SCHEMA_VERSION` onto whatever it is given (`js/storage.js:46`), defeating the version
   discard.
6. **No agent-law doc** (roadmap layer 6): the repo has no AGENTS.md carrying the invariants
   and procedures, though the work is agent-driven.

The destination is decided (**revised 2026-08-24, user direction: all-in on atproto**):
records always come from a PDS or the Jetstream that relays PDSes — **scope, not a
different data plane, is what separates the tiers.** One behavioral model, one atproto
substrate, a scope dial:

- **Mock tier** (`memory`): the in-browser instrument, unchanged and permanent — it is
  what scales CI/CD, behavior testing, and workflow testing (user, 2026-08-24): scenarios
  replay against it hermetically in the gate with no network, no PDS, no credentials, and
  it remains the conformance baseline every atproto scope is proven against.
- **Scoped tier** (atproto, narrow aperture): the "ten friends" deployment, **all
  public** (user decision 2026-08-24): Forage's write vocabulary becomes lexicon records
  (`fyi.forage.*`) in members' own PDSes; intake is scoped to the member DIDs (direct PDS
  reads or a filtered Jetstream tail — chosen at phase 5's split); the local store is
  just the fold over those records. The privacy variant — same tier, *some privacy but
  not confidentiality* — rides **ATProto Spaces** (permission-gated space repos,
  access-controlled not encrypted, forums a named use case) and is **backburnered to a
  post-plan feasibility test**: the only difference between the two is the gate, not the
  shape.
- **Wide tier** (atproto, network aperture): a forum-shaped **lens over the owner's own
  Bluesky experience** — and a logged-out guest mode (OQ2, required scope). Fields are
  Feeds (pinned/saved feed generators and lists); posts are `app.bsky.feed.post`; replies
  are the thread reply tree; boost rides likes; bans and moderation ride the rails Bluesky
  already has (mute / block / labelers), surfacing through the same selector masking the
  mock already implements. Not a new platform — a differently shaped lens on data that
  already exists.

The earlier draft's `sync` substrate (device-to-device event-log merge, honor-system
identity, export/import transport — BSM §11's small tier) is **dropped by user decision**:
it was a second data plane, and the whole point of the revision is that there is only one.

## Approach

Six phases, ordered so every later phase rides machinery the earlier one proved. Phases 1–4
close findings 1–6 (the scaffolding debt); phases 5–6 are the two substrates the scaffolding
exists to serve. Each phase is decomposed into **execution units** (1a, 1b, …) sized to a
single context window with a hard cap of 3 written files per unit; every unit lands
test-first behind the CI gate phase 1 creates and leaves the tree green. The two substrate
phases end with the conformance harness — built in phase 4 and proven on memory-vs-memory
before any second substrate exists — running as the merge gate BSM says it must be.

## Reasoning

- **Why test rig before fixes** (phase 1 before 2–3): the workspace discipline is TDD
  non-negotiable, and the repo has zero test infrastructure. Standing up the runner + CI
  first means every subsequent change — including the invariant fixes — lands red-first.
  Characterization tests over existing behavior are the one legitimate test-after moment: they
  pin what the fold does *today* so the purity fixes in phase 2 are provably
  behavior-preserving.
- **Why purity (2) before adapter (3) before harness (4):** the conformance harness replays
  scenarios against two substrates and evaluates *the same selectors* on both. That is
  impossible while selectors read the global store (finding 3), and meaningless until
  substrates are a routing choice (finding 1). Fix the functions, then build the seam, then
  build the proof.
- **Why the selector purity change is staged, not atomic** (Pass 2): the signature change
  ripples into every caller (`views.js` 16 call sites, `actions.js` 7, `devbar.js` 2,
  `main.js` 1 — grep-counted), which would make one atomic unit touch 5+ files. Instead:
  add explicit inputs with temporary store-backed defaults (2e), migrate callers in two
  units (2f, 2g), then delete the defaults and the store import (2h) so the purity gate
  goes green. Every intermediate state is working; the temporary defaults are removed in
  the same phase that introduced them, so no silent-fallback posture survives phase 2.
- **Why memory-vs-memory first in phase 4:** BSM roadmap layer 4 — prove the harness itself
  (memory vs memory-with-a-variant-engine) before trusting it to gate a real second
  substrate. A harness that has never failed is not yet evidence.
- **Why all-in on atproto, scope as the axis (revision, 2026-08-24):** the user's
  correction — records always come from a PDS or the Jetstream; a second data plane
  (BSM's device-merge `sync` substrate) reintroduces exactly the fork the behavior-scale
  thesis exists to prevent. One substrate with a scope dial keeps the tiers literally the
  same product, and ATProto Spaces supplies the private/small primitive natively
  (permission-gated space repos; forums are a named use case). The memory tier is kept
  deliberately: it is the hermetic CI/CD and behavior/workflow testing instrument and the
  conformance baseline — no network, no credentials, replayable in the gate.
- **Why scoped (5) before wide (6):** the scoped tier is the first real network substrate
  through the seam, but with N known PDSes and our own lexicons — small surface, our
  schema, Spaces' bulletin-board example as reference. The wide lens adds the foreign data
  model (bsky primitives shaped into our contract) and should meet a seam that has already
  survived one real network substrate. With Spaces deferred post-plan (OQ3), phase 5 has
  no alpha dependency; the order is confirmed at phase 5's pre-execution split.
- **Why the lens framing constrains phase 6:** because the big-world view is a lens over
  existing Bluesky data, phase 6 is **read-first**. Every capability whose write side has no
  Bluesky primitive stays on `memory` (or becomes a frontier chip), which is exactly what
  `hybrid` routing is for. No invented write paths, no simulated outcomes.
- **Why `node:test` as the runner:** zero dependencies, runs the repo's plain ES modules
  natively, matches the no-build ethos. Rejected alternatives: vitest (better DX but pulls a
  dependency tree into a repo that currently has none); jest (CJS-era friction with bare ESM).
  If `node:test` proves too spartan by end of phase 2, swapping to vitest is a single commit —
  the choice is not load-bearing.
- **Why no backwards compat anywhere:** pre-1.0 workspace rule. Stored localStorage state is
  a disposable prototype log; schema-version bumps discard rather than migrate (the
  `storage.js` versioning already does this).
- **Why phases 5–6 stay coarse in this plan:** they depend on decisions and evidence produced
  by phases 1–4 (harness shape, id scheme, probe re-runs). They carry full field blocks at
  phase granularity here; each gets split into ≤3-file execution units via a plan update +
  Review Log entry immediately before its execution, per "the plan doc is a living document."

## Verified Assumptions

Confirmed firsthand during planning (2026-08-24), by reading or running the named thing:

- **Module inventory and sizes** — `wc -l` over `js/`, `js/engines/`, `js/ui/`, `data/`:
  ~2.6k lines total; no build step; ES modules served raw.
- **Direct-commit bypass sites** — `grep`: `js/ui/views.js:333` (`notification.read`),
  `views.js:485-486` (`field.created` + `field.joined`). No other UI file calls
  `store.commit` (`js/ui/components.js`: zero `store.`/`sel.` references).
- **Nondeterminism sites** — `grep` + read: `js/reducers.js:193` (`Date.now()` in
  `resolveReports`); `js/selectors.js:16,130` (`Date.now()`); `js/selectors.js:8` imports
  `nowSec`, `getEvents` from `./store.js`. Engines are clean: `js/engines/rank.js` and
  `limits.js` take `nowSec` as a parameter; `js/prng.js` is seeded mulberry32, no
  `Math.random` anywhere (its own header, confirmed by grep).
- **Selector call-site counts** — `grep -c "sel\."`: views.js 16, actions.js 7, devbar.js 2,
  main.js 1, components.js 0.
- **Schema required-fields gap** — read `js/schema.js:5-40`: `id` absent from every
  entity-creating event's required list; actor check at `schema.js:48-51` cannot reject
  `null`.
- **Load/import paths skip validation** — read `js/store.js:52-58` (`loadEvents`: slice,
  fold, no validation) and `js/storage.js:43-48` (`importJson`: shape check only, stamps
  current `SCHEMA_VERSION` over the input's).
- **Service worker precaches a hardcoded module list** — read `sw.js:10-21`: `SHELL` names
  every js file individually; cache name `forage-v5` is the version. Any new runtime module
  must be added to `SHELL` with a cache bump or offline/PWA loads break.
- **Seed shape** — read `data/seed.js:1-60`: every event carries `id: sd_${n}`; timestamps
  are offsets from `Date.now()` at build; synthetic voters use actor ids (`sv_N`) that are
  **never registered as users** — so schema hardening may require actor *presence*, not
  actor *existence in state*.
- **Personas** — read `js/personas.js`: 8 seats + `null` logged-out; `personaById(null)`
  returns the logged-out seat.
- **Toolchain** — `fnm ls`: node v22.23.2 installed and default; no `package.json`,
  no `node_modules`, no `test*/`, no `.github/` in the repo (`ls`).
- **CI pattern** — read `CroftC/.claude/CI-PATTERN.md` in full: nine rules; forage currently
  listed as "no workflows"; enforcement ladder = declare (`.nvmrc`) · read (`setup-node`) ·
  refuse (`engine-strict`) · resolve (fnm).
- **Prior atproto probes** — `discovery/alpha/plans/2026-07-27-read-first-forum-mvp.md`
  records 2026-07-27 firsthand probe results: unauth-200 for `resolveHandle`,
  `getAuthorFeed`, `getFeed`, `getPostThread(depth)`, `getFollows`/`getFollowers`;
  `searchPosts` 403 unauth; post views carry `replyCount`/`repostCount`/`likeCount`/
  `quoteCount`. **Dated evidence — phase 6 re-verifies.**
- **Jetstream v2** — web-sourced 2026-08-24 (atproto.com blog): launched 2026-08-13;
  replay via `planSnapshot` → sealed segments → live cutover; archive needs API token,
  live tail open; v2 endpoints `wss://jetstream.us-{west,east}.bsky.network`. **Not
  probe-verified — phase 6 treats every v2 fact as probe-verify at build time.**

- **D1 resolved during planning (Pass 3, 2026-08-24)** — probe run firsthand on v22.23.2:
  the full browser-facing module graph (`schema.js`, `reducers.js`, `selectors.js`,
  `store.js`, `data/seed.js`) imports headless with no `localStorage`/`document` throw;
  `buildSeed()` folded through `reduce` yields exactly 8 `users` entries; a failing
  assertion exits non-zero. **Empty-dir semantics:** `node --test test/` over an empty
  directory **exits 1** ("no test files" is a failure) — so 1a cannot claim a green suite;
  the green milestone belongs to 1b (1a recalibrated accordingly). API note for phase 1:
  the reducers state constructor is **`emptyState()`**, not `initialState()`. Probe files
  deleted per the `throwaway` disposition.

## Documentation Impact

Each update is scheduled in the execution unit that makes the reference stale:

- `README.md` — "Run it" gains the test command (unit **1d**) and the conformance command
  (**4e**); "How it works" adapter/actions paragraph updated when the adapter becomes real
  (**3b**); dev-bar "Seed" description updated when seeding becomes scenario replay
  (**4c**); "Later layers" paragraph rewritten as phases 5 and 6 land (**5**, **6**) —
  (Pass 3 correction: the pre-restructure "honor-system identity text from BSM §11–12"
  item is void; the current README's "Later layers" still describes the dropped `sync`
  substrate, and phase 5's rewrite replaces it with the scoped all-public atproto tier).
- `AGENTS.md` — new file (**1e**).
- `adr/ADR-001-event-id-scheme.md` — new file (**2d**); first entry in a new `adr/` tree
  (see OQ5).
- `sw.js` `SHELL` list + cache-name bump — not prose, but the registry every new runtime
  module must join: **3d** (routing + memory substrate), **4d** (ledger module), and again
  in **5**/**6** for substrate modules. Called out per-unit below; **mechanically enforced
  from 3d onward by `test/shell.test.js`** (Pass 3 addition).
- `docs/HOSTING.md` — grepped (`adapter`, `test`, `workflow`, `substrate`): no references,
  no impact.
- `CroftC/.claude/CI-PATTERN.md` — the workspace CI table's forage row becomes stale when
  **1d** lands. Meta-repo file; updated in a separate CroftC commit, on request, per
  workspace commit discipline.
- `plans/` (this file) — Review Log entries at every pass and at the phase-5/6 split
  updates.

## Concurrency Map

```
Sequential spine: Phase 0 → 1a → 1b → 1c → 1d → 1e → 2a … 2i → 3a … 3d → 4a … 4e → 5 → 6
All phases sequential.
```

Reason: single-agent execution in one working tree; the high-traffic files recur across
units (`actions.js` in 2g/3b/3c, `selectors.js` in 2e/2h, `views.js` in 2f/3c, `sw.js` in
3d/4d), and each phase's enforcement teeth gate the next. Considered and declined: **1e**
(AGENTS.md) has a write-set disjoint from 1a–1d and could run parallel in a worktree, but
the dispatch overhead exceeds the unit's size; recorded here so the sequential default is a
decision, not an omission. Phases 5 and 6 revisit this map in their pre-execution split.

## Phases

Field conventions: units cap at 3 written files (test files included); "Shared-state
contract" is "none beyond the write-set" unless stated; Re-entry verification is omitted
(no parallel sets). For test-scaffolding units the wiring test *is* the gate command.
**Execution order within every unit (Pass 3): the test change lands RED before the
production change, regardless of the order the Changes list happens to print** — the
lists group by file, not by sequence. The only exceptions are the declared
characterization units (1b, 1c) and prose/config-only units (1a, 1e, 4e's workflow line).

### Phase 0: Discovery — RESOLVED DURING PLANNING (Pass 3, 2026-08-24)

**Goal:** Resolve the two runner unknowns before phase 1 commits to `node:test`.

- [x] **D1: Does `node --test` on v22.23.2 import the app's module graph headless?**
  **Answered yes** — evidence in Verified Assumptions ("D1 resolved during planning").
  `node:test` is confirmed as the runner; execution starts at 1a.
  - **Probe:** `node --test` over a scratch test that imports `js/store.js`,
    `js/selectors.js`, `js/reducers.js`, `data/seed.js`, calls `buildSeed()` and folds it;
    confirm no `localStorage`/`document`/`performance` reference throws at import or fold
    time. Also confirms `node --test test/` directory semantics and reporter output shape.
  - **Success criteria:** exit 0 with the fold producing a state whose `users` map has 8
    entries; a deliberately failing assertion exits non-zero.
  - **Disposition:** `throwaway` — findings recorded here; the scratch file is deleted
    (phase 1 rewrites real tests red-first).

**Done when:** ~~Verified Assumptions updated with D1's evidence; phase 1 unblocked or the
runner decision revisited~~ — done at Pass 3; phase 1 is unblocked.

### Phase 1 — Test rig, CI gate, agent law (findings 4-infra, 6) — ✅ SHIPPED (`3ed7a31` 1a, `3640bcf` 1b, `46a7a57` 1c, `94fdb80` 1d, `46f92d4` 1e)

**Delivered notes (2026-08-24):**
- **1a deviation:** `scripts.test` is bare `node --test` (auto-discovery), not
  `node --test test/` — on v22.23.2 the path form resolves `test/` as a CJS module and
  dies MODULE_NOT_FOUND. Discovered when 1b's suite first ran; fixed in `3640bcf`.
- **1d bite test observed:** deliberate tally sign swap on throwaway branch/PR #8 →
  run 32782423150 **failure at the `npm test` step**; revert → run 32782491189
  **success**. PR closed unmerged, branch deleted.
- **1d pending:** the `workflow_dispatch` hatch cannot be pulled until `main` is pushed
  (the workflow must exist on the remote default branch). Pull it once at the first
  main push.
- Wrong-node refusal recorded untested: only v22.23.2 + the known-broken system node
  are installed locally.

#### 1a: Toolchain pin
**Goal:** Node pinned and enforced; `npm test` exists and invokes the runner.
**Changes:**
- [ ] `package.json` — `"type": "module"`, `engines`, `scripts.test = "node --test test/"`
- [ ] `.nvmrc` — `22.23.2`
- [ ] `.npmrc` — `engine-strict=true`
**Call chain:** `npm test` → `node --test test/`.
**Wiring test (recalibrated at Pass 3 on D1 evidence):** `npm test` *executes the runner*
and exits 1 with the "no test files" message — an empty `test/` dir is a **failure** on
v22.23.2, so 1a cannot and does not claim green; the first green `npm test` is 1b's
milestone. Pin enforcement: with node ≠ pin, npm refuses (verify once by
`fnm exec --using <other>` if another version is installed, else record as untested).
**Depends on:** Phase 0 D1.
**Read-set:** `CroftC/.claude/CI-PATTERN.md` (enforcement ladder).
**Write-set:** `package.json`, `.nvmrc`, `.npmrc`.
**Risks:** none material; no dependencies are added.
**Done when:** (behavioral) a fresh clone with fnm reaches the runner via `npm test` and a
wrong node version is refused; (verification) `npm test` reaches `node --test` (exit 1
"no test files" is the expected pre-1b outcome).
**Validation:** Narrow — the command itself.

#### 1b: Characterization — contract layer
**Goal:** Pin today's fold and validation behavior, including the known-bad accepts.
**Changes:**
- [ ] `test/schema.test.js` — `validateEvent` accept/reject table; the finding-5 holes
  asserted as *current* behavior with `todo`-marked companions describing the phase-2 target
- [ ] `test/reducers.test.js` — fold determinism (same log ⇒ deep-equal state, twice);
  tally/myVote/reputation; mod-pipeline (remove→mask fields, report resolution, audit push)
**Call chain / Wiring test:** `npm test` (suite is the deliverable).
**Depends on:** 1a.
**Read-set:** `js/schema.js`, `js/reducers.js`.
**Write-set:** the two test files.
**Risks:** characterizing a bug as "correct" — mitigated by the paired `todo` tests naming
the intended phase-2 behavior.
**Done when:** (behavioral) the contract layer's behavior is executable documentation;
(verification) `npm test` green; deliberately breaking `reduce` (local scratch edit,
`git checkout HEAD -- js/reducers.js` to restore) turns it red.
**Validation:** Narrow.

#### 1c: Characterization — engines and selectors
**Goal:** Pin ranking math, limits windows, and the permission matrix seat-by-seat.
**Changes:**
- [ ] `test/engines.test.js` — hot/confidence/controversy/rising on fixed inputs
  (formula-verbatim claims from `rank.js`), `sortItems` orderings, limits factor/cool-off/
  wait arithmetic over a hand-built log. **Boundary cases, not single points (Pass 3):**
  rank orderings must include a tie and a zero-vote item (mutating the comparator or the
  formula's sign must flip an ordering assertion); limits tests assert at the window edge —
  an event exactly at the cutoff, one inside, one outside — and at the factor boundaries
  (probation vs high-rep vs default), so a `<` → `<=` or factor-swap mutation dies
- [ ] `test/selectors.test.js` — `permissions` for all 9 seats over a minimal folded state
  **asserting both grants and denials per seat** (a permissions map mutated to all-false or
  all-true must fail); feed visibility (deleted/held/removed masking) asserted both ways —
  the masked item absent for a plain member *and present* for the seat allowed to see it;
  thread depth deferral at the boundary: depth 9 renders, 10 renders, 11 defers (or the
  code's actual edge — pin whichever side `selectors.js` implements, at 9/10/11)
**Call chain / Wiring test:** `npm test`.
**Depends on:** 1b (shares test helpers for building event logs — extracted to
`test/helpers.js` only if both files need it; helpers count toward the file cap).
**Read-set:** `js/engines/*.js`, `js/selectors.js`, `js/personas.js`.
**Write-set:** the two test files (+ optional `test/helpers.js`).
**Risks:** selectors currently call `Date.now()` — tests pin *relative* behavior (ordering,
masking) not wall-clock-dependent values, so they survive phase 2's `now` threading.
**Done when:** (behavioral) engines + policy pinned; (verification) `npm test` green.
**Validation:** Narrow.

#### 1d: CI gate
**Goal:** The gate exists, bites, and matches the workspace pattern.
**Changes:**
- [ ] `.github/workflows/ci.yml` — adapted from `croft-pwa/.github/workflows/ci.yml`:
  `pull_request` + `push: main` + `workflow_dispatch`; `setup-node` with
  `node-version-file: .nvmrc`; `permissions: contents: read`; per-ref concurrency;
  `timeout-minutes`; single gate command `npm test`
- [ ] `README.md` — "Run it" section gains `npm test`
**Call chain:** GitHub event → gate job → `npm test`.
**Wiring test:** per CI-PATTERN "verify the gate actually bites": push a branch with a
deliberate test break, confirm red at the test step, revert. Pull the dispatch hatch once.
**Depends on:** 1a–1c (something to run).
**Read-set:** `croft-pwa/.github/workflows/ci.yml`, `croft-pwa/docs/CI.md` checklist.
**Write-set:** `.github/workflows/ci.yml`, `README.md`.
**Shared-state contract:** pushes branches to the GitHub remote (chasemp identity per
workspace rule); no deploy job is added — Pages serving is untouched.
**Risks:** none to the served site; workflow-only.
**Done when:** (behavioral) a PR with failing tests is blocked before main; (verification)
the observed red run + green rerun, linked in the phase commit message.
**Validation:** Moderate — the bite test is the manual exercise.

#### 1e: Agent law
**Goal:** The one-page law agents execute against.
**Changes:**
- [ ] `AGENTS.md` — BSM Appendix A skeleton: invariants §8 verbatim, procedures §9
  verbatim, sources of truth in order (`js/schema.js`, `scenarios/`,
  `js/config/routing.js`, `ledger/divergence.js` — the latter two "arrive in phases 3–4"),
  verification commands (`npm test`, `npm run conformance` once phase 4 lands), escalation
  = STOP + ADR.
**Call chain / Wiring test:** n/a (prose); the doc's verification section names the real
commands, checked against `package.json` scripts.
**Depends on:** 1a (script names exist).
**Read-set:** BSM Appendix A. **Write-set:** `AGENTS.md`.
**Done when:** (behavioral) a fresh agent session can run the law without this plan open;
(verification) commands named in AGENTS.md all execute.
**Validation:** Narrow.

### Phase 2 — Determinism, purity, schema hardening (findings 3, 5)

#### 2a: Reducer determinism
**Goal:** Replaying the same log at different wall-clock times yields identical state.
**Changes:**
- [ ] `js/reducers.js` — `resolveReports` notification `ts: Date.now()` → the triggering
  event's `ev.ts` (threading `ev` into `resolveReports`)
- [ ] `test/reducers.test.js` — RED first: fold the same log twice with a forced clock skew
  (or assert notification ts === mod event ts), watch it fail, fix, green
**Call chain:** `store.commit(mod.*)` → `reduce` → `applyMod` → `resolveReports`.
**Wiring test:** the new determinism assertion runs through `reduce` on a full log.
**Depends on:** 1b. **Read-set:** `js/reducers.js`. **Write-set:** `js/reducers.js`,
`test/reducers.test.js`.
**Risks:** none — no caller observes the old value deliberately.
**Done when:** (behavioral) notification timestamps are replay-stable; (verification)
`npm test`.
**Validation:** Narrow.

#### 2b: Schema hardening — required ids and actors
**Goal:** The finding-5 dispatch holes closed.
**Changes:**
- [ ] `js/schema.js` — `id` required on `post.created`, `comment.created`, `field.created`,
  `report.filed`; actor rule: every type except `account.registered` rejects
  null/undefined actor (presence, not registered-existence — seed's synthetic voters stay
  legal)
- [ ] `test/schema.test.js` — flip the phase-1 `todo` tests RED→GREEN. **Both sides of
  every new rule (Pass 3):** for each hardened type, one reject (id absent / actor null /
  actor undefined) *and one accept* (id present, actor present — including a
  never-registered `sv_`-style actor, which must stay legal); `account.registered` with no
  actor still accepts (the exemption is itself pinned, so widening the rejection to all
  types dies)
**Call chain:** every `commit` → `validateEvent`.
**Wiring test:** commit of an id-less `post.created` throws (through `store.commit`, not
`validateEvent` in isolation).
**Depends on:** 1b. **Read-set:** `js/schema.js`, `data/seed.js` (confirm seed passes —
seed events carry ids and actors per Verified Assumptions; if any violation surfaces,
fixing seed becomes 2b's third file). **Write-set:** `js/schema.js`,
`test/schema.test.js` (+ `data/seed.js` only if needed).
**Risks:** a latent seed event violating the hardened rules — surfaced immediately by 2c's
load-validation test replaying the seed.
**Done when:** (behavioral) malformed events cannot enter the log at dispatch;
(verification) `npm test`.
**Validation:** Narrow.

#### 2c: Load-path validation (Pass 2 addition)
**Goal:** Import/seed/bulk-load validate like dispatch does — the hardening is not
bypassable.
**Changes:**
- [ ] `js/store.js` — `loadEvents` validates every event (fail loud: throw, load nothing).
  **Observability (Pass 3):** the thrown error names the offending event's index and type
  (`"event 37 (comment.created): missing required id"`), so a refused import is
  diagnosable from the toast/console without a debugger
- [ ] `js/storage.js` — `importJson` stops stamping `SCHEMA_VERSION` over the input;
  mismatched version is a refusal with words naming both versions, same posture as
  `load()`
- [ ] `test/store.test.js` — RED: import of an invalid/mis-versioned log refuses; the full
  seed loads green
**Call chain:** dev bar Import/Seed → `loadEvents` → `validateEvent` per event.
**Wiring test:** the seed-loads-green test (exercises `buildSeed()` → `loadEvents` end to
end).
**Depends on:** 2b. **Read-set:** `js/store.js`, `js/storage.js`, `data/seed.js`.
**Write-set:** `js/store.js`, `js/storage.js`, `test/store.test.js`.
**Risks:** existing visitors' stored logs predating hardening — acceptable discard per
no-backwards-compat; `SCHEMA_VERSION` bumps to 2 here so old state discards cleanly.
**Done when:** (behavioral) no unvalidated event can enter state by any path;
(verification) `npm test`.
**Validation:** Moderate — manually Import a hand-broken JSON in the browser and observe
the refusal toast.

#### 2d: Collision-safe ids + ADR-001
**Goal:** Event/entity ids unique across actors — no cross-actor collision possible
(wording updated at Pass 3: the honor-system tier this unit originally served was dropped
in the all-atproto restructure; the id scheme now serves the memory tier and must meet
atproto rkeys at phase 5).
**Changes:**
- [ ] `js/store.js` — `genId`/event ids become actor-scoped:
  `<prefix>_<actorId>_<perActorSeq>` (deterministic, no randomness; logged-out never
  writes post-2b)
- [ ] `adr/ADR-001-event-id-scheme.md` — decision, context, the stated limitation (one
  actor writing from two devices concurrently can still collide; accepted for the memory
  tier; **revisited at phase 5's split when ids meet atproto rkeys**, with probe evidence)
- [ ] `test/store.test.js` — two stores, same actor sets disjoint from different actors;
  same-log replay produces identical ids
**Call chain:** actions → `genId`/`commit` → event ids.
**Depends on:** 2b (actor always present). **Read-set:** `js/store.js`, `js/actions.js`.
**Write-set:** `js/store.js`, `adr/ADR-001-event-id-scheme.md`, `test/store.test.js`.
**Risks:** persisted old-scheme ids — moot, 2c's version bump discarded old state.
**Done when:** (behavioral) ids from different actors can never collide; (verification)
`npm test`.
**Validation:** Narrow.

#### 2e: Selector explicit inputs (defaults retained)
**Goal:** Every selector can run on caller-supplied `{ now, events }`; store-backed
defaults keep callers working temporarily.
**Changes:**
- [ ] `js/selectors.js` — `viewerCtx`/`feed`/`thread`/`limits`/etc. take `now` (sec) and,
  for `limits`, `events`, defaulting to the store imports *for this unit only*
- [ ] `test/selectors.test.js` — RED: same state + same `now` ⇒ identical output with no
  store present (construct state via fold, never via the singleton)
**Depends on:** 1c. **Read-set/Write-set:** `js/selectors.js`, `test/selectors.test.js`.
**Risks:** the temporary defaults surviving — 2h deletes them and the purity gate makes
regression impossible; the pairing is declared here so 2e is never "done" alone.
**Done when:** (behavioral) selectors evaluable against arbitrary state/clock;
(verification) `npm test`.
**Validation:** Narrow.

#### 2f: Caller migration — views
**Changes:**
- [ ] `js/ui/views.js` — all 16 `sel.` call sites pass explicit `{ now, events }` built at
  the view boundary from the store
**Wiring test:** existing selector/view behavior unchanged — suite green; manual smoke:
serve, browse feed/thread/profile.
**Depends on:** 2e. **Write-set:** `js/ui/views.js`.
**Validation:** Moderate — manual browse of the four screen states.
**Done when:** `npm test` green + smoke pass.

#### 2g: Caller migration — actions, main, devbar
**Changes:**
- [ ] `js/actions.js` (7 sites), `js/main.js` (1), `js/devbar.js` (2) — same migration
**Depends on:** 2e. **Write-set:** those three files.
**Validation:** Moderate — smoke: vote with latency toggle, Fail-Next rollback, persona
switch.
**Done when:** `npm test` green + smoke pass.

#### 2h: Purity gate closes
**Goal:** Invariant 3 mechanical.
**Changes:**
- [ ] `js/selectors.js` — delete the store import and all defaults
- [ ] `test/purity.test.js` — static scan: `js/selectors.js`, `js/reducers.js`,
  `js/engines/*` contain no `Date.now`, no `Math.random`, no `from './store.js'`
**Wiring test:** the static scan itself, RED before the deletion if run first.
**Depends on:** 2f, 2g. **Write-set:** `js/selectors.js`, `test/purity.test.js`.
**Done when:** (behavioral) the read layer is provably store-free; (verification)
`npm test`.
**Validation:** Narrow.

#### 2i: Mutation-testing audit (report-only)
**Goal:** The check on the check, over the rules-engine-shaped modules.
**Changes:** none to production code — Stryker (or hand-run per-line if OQ6 resolves
against adding the dep) over `js/reducers.js`, `js/schema.js`, `js/engines/`; survivors
triaged equivalent-vs-gap; gap-closing tests added to the existing test files.
**Depends on:** 2a–2h all green and **committed** (commit-before-mutate rule).
**Write-set:** test files only; findings recorded in this plan's Review Log.
**Done when:** every survivor is dispositioned in the write-up.
**Validation:** the audit is the validation.

### Phase 3 — Adapter + routing table (findings 1, 2)

#### 3a: Routing config + memory substrate
**Changes:**
- [ ] `js/config/routing.js` — capability → substrate map, all `memory` (BSM Appendix B):
  posting, commenting, voting, saving, fields, moderation, reporting, notifications,
  accounts, prefs
- [ ] `js/substrates/memory.js` — today's commit path extracted; the only module allowed
  to call `store.commit`
- [ ] `test/adapter.test.js` — RED: dispatch through the routing table reaches memory;
  unknown capability throws — **and the error names the unknown capability and the known
  keys (Pass 3, observability)**, asserted in the test so a routing typo self-diagnoses
**Call chain:** (next unit wires actions) adapter → routing lookup → substrate.
**Depends on:** phase 2 complete. **Write-set:** the three new files.
**Done when:** `npm test` green; modules exist and are covered.

#### 3b: Actions dispatch through the adapter
**Changes:**
- [ ] `js/actions.js` — every action resolves substrate via routing; latency/Fail-Next
  wrap the adapter (they simulate any substrate's transport)
- [ ] `README.md` — "How it works" actions/adapter paragraph updated
**Call chain:** UI → actions → adapter → routing → `substrates/memory` → `store.commit`.
**Wiring test:** an end-to-end action test (createPost via actions on a seeded store)
passes only through the adapter path — asserted by making `memory.js` the sole commit
caller (3c's static test) plus a spy on the routing lookup.
**Depends on:** 3a. **Write-set:** `js/actions.js`, `README.md`.
**Validation:** Moderate — browser smoke with latency + Fail-Next.
**Done when:** `npm test` green + smoke; behavioral: substrate choice is a config value.

#### 3c: Close the UI bypasses
**Changes:**
- [ ] `js/actions.js` — new `createField` (enforces `canCreateField` — the probation gate,
  write-time, at last) and `markNotificationsRead`
- [ ] `js/ui/views.js` — sites 333, 485-486 route through actions
- [ ] `test/invariants.test.js` — static: `store.commit` appears only in
  `js/substrates/memory.js`; `js/ui/**` never references `.commit(` or imports a substrate
**Wiring test:** the static invariant test (RED against baseline if run first) + a
behavioral test **on both sides (Pass 3)**: probation seat's `createField` refuses *and*
an established seat's succeeds (a `canCreateField` mutated to constant-false must fail
the second assertion, constant-true the first).
**Depends on:** 3b. **Write-set:** the three files.
**Done when:** invariants 1 and 4 mechanical; `npm test` green.

#### 3d: Service worker registry (Pass 2 addition; mechanized at Pass 3)
**Changes:**
- [ ] `sw.js` — `SHELL` adds `js/config/routing.js`, `js/substrates/memory.js`; `CACHE`
  bumps to `forage-v6`
- [ ] `test/shell.test.js` (Pass 3 addition) — static registry gate: every runtime module
  on disk (`js/**/*.js`, `data/seed.js`; later `scenarios/`, `ledger/` once
  runtime-imported) appears in `sw.js`'s `SHELL` list. RED against baseline (routing.js +
  memory.js exist but are unlisted), GREEN after the `SHELL` edit.
**Wiring test:** the static registry test, plus manual — serve, load with SW, go offline,
reload: app shell works.
**Depends on:** 3a. **Write-set:** `sw.js`, `test/shell.test.js`.
**Risks:** forgetting this class of change in later phases — now **mechanical**: any unit
that adds a runtime module without the `SHELL` line turns `npm test` red (the per-unit
sw.js notes in 4d, 5, 6 remain as reminders, but the test is the enforcement). The test
must exempt non-runtime files (test/, plans/, conformance runner if node-only) via an
explicit exclusion list, so exclusions are visible, not implicit.
**Validation:** Moderate — the offline reload check; the registry gate rides `npm test`
forever after.
**Done when:** offline reload green with the new modules cached; registry test green.

### Phase 4 — Scenario library, conformance harness, divergence ledger (finding 4)

#### 4a: Scenario format + first scenarios
**Changes:**
- [ ] `scenarios/format.js` — scenario shape + offset-timestamp resolver + replay helper
- [ ] `scenarios/field-lifecycle.js`, `scenarios/post-vote-rank.js` — first two, with
  seat-level assertions (BSM Appendix B)
- [ ] `test/scenarios.test.js` — replaying each scenario on the memory substrate satisfies
  its own assertions
**Depends on:** phase 3. **Write-set:** those files (format + 2 scenarios counts as the
cap-stretch unit; if it strains, the second scenario moves to 4b).
**Done when:** `npm test` runs scenario assertions green.

#### 4b: Scenario coverage to the mutation vocabulary
**Changes:**
- [ ] remaining scenarios (`comment-tree-collapse`, `mod-remove-mask`, `ban-readonly`,
  `rate-limit-probation`, `report-resolve-notify`, `save-and-profile`,
  `search-visibility`) — landed one-to-three per commit
- [ ] `test/coverage.test.js` — walks `EVENT_TYPES`; any mutation type untouched by every
  scenario fails (invariant 6, mechanical)
**Depends on:** 4a. **Write-set:** `scenarios/*.js`, `test/coverage.test.js` (multi-commit
unit; each commit ≤3 files).
**Done when:** coverage test green over the full vocabulary.

#### 4c: Seed becomes scenario replay
**Changes:**
- [ ] `data/seed.js` — decomposed to compose from `scenarios/` (+ the stress thread kept
  as its own generated scenario)
- [ ] `js/devbar.js` — Seed = replay the library
- [ ] `README.md` — dev-bar section wording
**Wiring test:** browser Seed produces the same state test-replay does (assert via
export/import round-trip equality in `test/scenarios.test.js`).
**Depends on:** 4b. **Write-set:** the three files.
**Validation:** Moderate — browser Seed + browse.

#### 4d: Harness + ledger + variant-engine proof
**Changes:**
- [ ] `conformance/run.js` (+ `package.json` script `conformance`) — replay each scenario
  on substrate A and B, evaluate identical assertions, compare observables; report
  pass/fail/tolerated with ledger ids. **Per-failure output names scenario, seat,
  assertion, the two observed values, and the substrate pair (Pass 3, observability)** —
  a conformance red must be diagnosable from the CI log alone
- [ ] `ledger/divergence.js` — frontier/proposal/tolerance entries; `js/frontier.js` folds
  in as `kind: 'frontier'`; `#/frontiers` renders from the ledger (`js/ui/views.js`
  touch); `sw.js` SHELL + bump if `ledger/` is runtime-imported
- [ ] `test/conformance.test.js` — the proof: memory vs memory-with-variant-ranking FAILS
  until the variant's tolerance entry exists, then reports tolerated
**Depends on:** 4c. **Write-set:** multi-commit unit, ≤3 files per commit (run.js+script;
ledger+frontier+views; sw.js; proof test).
**Done when:** (behavioral) drift is detectable and tolerances are ledger-gated;
(verification) the observed red→tolerated transition, noted in the commit.

#### 4e: Conformance joins the gate
**Changes:**
- [ ] `.github/workflows/ci.yml` — gate = `npm test && npm run conformance`
- [ ] `README.md` — "Run it" gains `npm run conformance` beside `npm test` (Pass 3: the
  gate command and the README must not drift)
**Depends on:** 4d. **Write-set:** the workflow, `README.md`.
**Done when:** a PR breaking conformance is blocked (observed once, like 1d's bite test).

### Phase 5 — Scoped tier: atproto at small aperture (all public)

**Restructured 2026-08-24 (user direction, all-in on atproto; Spaces backburnered — see
OQ3).** Coarse here; split into ≤3-file units via plan update + Review Log before
execution, after the probe.

**Goal:** the "ten friends" deployment on the same atproto rails, everything public:
Forage's write vocabulary as `fyi.forage.*` lexicon records in **members' own PDSes**;
intake scoped to the member DIDs; local store = the fold over synced records.
**Changes:** probe unit first (Discovery-style, disposition `keep-as-fixture`): record
CRUD with custom lexicons against a real PDS (the standing test account), plus both
scoped-intake candidates measured — direct PDS reads (`com.atproto.repo.listRecords`) vs
a Jetstream tail filtered to member DIDs — **and the full Jetstream v2 exploration OQ4
mandates**: replay a filtered slice end to end (`planSnapshot` → sealed segments → live
cutover; archive token required), measuring effort, latency, and index size against plain
AppView pulls, so the phase-6 intake model is decided on evidence (ADR before phase 6's
split); `lexicons/fyi.forage.*` schemas mapping the
event vocabulary (skylite's `ing.croft.*` lexicon tree is the in-house precedent);
member-roster home decided at split (a roster record in the founding DID's repo vs client
config); `js/substrates/atproto.js` first cut — event ↔ record codec, scoped intake,
write path to the member's own repo; IndexedDB behind `js/storage.js` if the folded cache
outgrows localStorage; `js/config/routing.js` flip demonstrated; `sw.js` SHELL + bump;
README "Later layers" first rewrite.
**Call chain:** actions → adapter → `substrates/atproto` (scoped) → member's PDS repo;
reads: scoped intake → fold → selectors.
**Wiring test:** conformance memory↔scoped-atproto across the scenario library (event ↔
record round-trip is the contract's proof at this tier).
**Depends on:** phase 4; test-account creds (`CroftC/.env`).
**Shared-state contract:** network to PDS hosts / Jetstream; test-account DIDs; writes
only to test-account repos.
**Risks:** lexicon design churn (fixtures pin the codec; pre-1.0, change freely);
moderation semantics over records nobody can delete from someone else's repo — the §10.1
matrix maps to *masking at fold time*, not record deletion (same posture the mock already
has; divergences ledgered); the id scheme meets rkeys (ADR-001 revisited at split with
probe evidence).
**Done when:** (behavioral) a small group's records from their own PDSes browse as a
Forage Field, writes landing as `fyi.forage.*` records; (verification) `npm test` +
`npm run conformance` + probe fixtures round-tripping through the codec.
**Validation:** Broad — live session with two DIDs; error paths (non-member content
excluded by scope, offline).

**Deferred (post-plan): Spaces feasibility.** The privacy variant of this tier — same
shape, gated membership, *privacy but not confidentiality* (Spaces is access-controlled,
not encrypted) — is a named follow-on after this plan completes: probe the ATProto Spaces
alpha (or its full release, expected "later this year"), diff its membership semantics
against the roster + masking built here, and write its own plan.

### Phase 6 — Big-world tier: the atproto lens (`hybrid`)

Coarse here; split before execution, after the probe re-run. Read-first; every gap a
frontier, never a dead button.

**Prior art — do not re-derive.** `discovery/alpha/plans/2026-07-27-read-first-forum-mvp.md`
(see Verified Assumptions): unauth-200 read surface, `searchPosts` 403 unauth ⇒ guest
boards = feed-URI / author / list sources; search-backed boards need a session.

**Intake refinement — Jetstream v2 postdates the prior art.** Jetstream v2 (launched
2026-08-13) adds Network Replay (`planSnapshot` → sealed segments → live-tail cutover;
`listSegments`/`getSegment` snapshot-only; archive behind API token, live tail open; same
JSON format; v1 unchanged). A *filtered personal index* (only the collections/actors the
owner's Fields touch) becomes replay-then-tail with server-side filtering and no
full-network backfill — previously the cost that justified deferring any lens-local
indexer. Intake is a two-path decision (OQ4), all v2 facts probe-verify at build time.

**Goal:** feed/thread(/search-with-session) reads on `hybrid` from the owner's Bluesky;
writes stay `memory`. **Two identity states are required scope (OQ2, user decision,
critical): signed-in (personal feeds, mutes, search) and logged-out guest (feed-URI /
author / list boards; search and personal surfaces as frontier chips).** The guest mode is
the zero-setup demo path: anyone opens the lens and browses public feeds as a forum.
**Changes:** probe script re-running the 2026-07-27 probes (Discovery-style unit opening
the phase; disposition `keep-as-fixture` — raw responses become adapter test fixtures);
`js/substrates/atproto.js` read side; Fields = pinned/saved feeds + lists; posts/comments
shaped from `getFeed`/`getPostThread` into the existing selector result shapes; boost =
like (+ viewer's like as `myVote: 1`); bury = frontier entry; mutes/blocks/labelers
surface through the existing masking selectors; routing flips reads to `hybrid`;
tolerances ledgered (ranking, membership semantics, likes-only scores); `sw.js` SHELL +
bump; README "Later layers" rewrite.
**Call chain:** views → selectors ← read-adapter ← `substrates/atproto` ← AppView XRPC.
**Wiring test:** conformance shape-contract run with ledgered tolerances; a live smoke
rendering a real feed as a Field.
**Depends on:** phase 5 (seam proven twice); test account creds (`CroftC/.env`).
**Shared-state contract:** network reads to `public.api.bsky.app`; authenticated session
for the test account; no writes to the network.
**Risks:** API drift since 2026-07-27 (probe catches); rate limits (read-only, low
volume); shaping mismatches (fixtures pin them).
**Done when:** (behavioral) the same UI browses the owner's Bluesky as a forum, every
unmirrorable capability visibly frontier'd in the same commit that defers it (invariant
7); (verification) `npm test` + conformance + live smoke.
**Validation:** Broad — live data, error paths (offline, 403 on guest search), fixture
round-trips.

## Sequencing and stop-points

Each phase is independently valuable (BSM §13's property, preserved): stopping after 1
leaves a tested, gated repo; after 2, a deterministic contract; after 3, the seam; after 4,
the proof machinery; after 5, a shippable scoped edition (all-public atproto); after 6,
the lens. No phase starts until the prior phase's teeth are in the CI gate.

## Open Questions

- [CONFIRMED: PHASE-GATED (Phase 6)] **OQ1 — Field slug ↔ feed mapping**: slugs from
  feed record rkeys, display names, or a local alias table? *Decide at probe time with
  real data in hand; nothing earlier depends on it. Confirmed by user 2026-08-24.*
- [RESOLVED 2026-08-24: SHIP IN PHASE 6] **OQ2 — logged-out lens**: user decision, marked
  critical — the logged-out lens is required phase-6 scope, not a deferral. Guest mode =
  feed-URI / author / list boards (unauth-200 per the MVP probes); search and personal
  surfaces (pinned feeds, mutes) render as frontier chips when logged out.
- [RESOLVED 2026-08-24: SPACES DEFERRED POST-PLAN] **OQ3** (twice-replaced: the original
  sync-transport question dissolved with the all-atproto revision; the Spaces-posture
  question was then resolved by user decision): phase 5 ships the scoped tier **all
  public**; the Spaces-gated privacy variant (privacy, not confidentiality) is a
  post-plan feasibility test with its own plan. The only difference between the two is
  the gate, not the shape.
- [CONFIRMED: PHASE-GATED (Phase 5 probe → decision before Phase 6 split)] **OQ4 — lens
  intake model**: AppView pull vs Jetstream v2 replay-then-tail. *User direction
  2026-08-24: no default — explore v2 firsthand before choosing; it may be strong enough
  to go straight to the streaming model. The phase-5 probe unit carries the exploration
  (replay a filtered slice via `planSnapshot` → segments → live cutover, measure
  effort/latency/index size vs plain pulls); the intake decision is recorded as an ADR
  before phase 6's split.*
- [CONFIRMED: ADVISORY] **OQ5 — ADR location**: `adr/` at repo root per BSM Appendix A
  skeleton; 2d creates it. *Confirmed by user 2026-08-24.*
- [RESOLVED 2026-08-24: STRYKER] **OQ6 — mutation-testing tool**: Stryker, accepted as
  the repo's first (dev-only) dependency for the 2i audit; hand-run mutation rejected as
  the documented trap. Production code remains dependency-free.

## Review Log

### Pass 1: Plan development — 2026-08-24
Initial draft was written in the repo's existing plan style (problem/approach/reasoning +
narrative phases) before the `phase-plan` skill was engaged; the same day, retrofitted to
the skill's template on user direction: added Verified Assumptions, Documentation Impact,
Concurrency Map, per-unit field blocks, Phase 0, severity-tagged Open Questions, this log.
The six-phase narrative and all reasoning were preserved unchanged; phases were decomposed
into ≤3-file execution units (2e–2h staging is the one structural addition, forced by the
4-file rule — see Reasoning). Phases 5–6 deliberately left at phase granularity with a
mandatory pre-execution split, recorded in Reasoning.

### Pass 2: Gap Analysis — 2026-08-24
**Found:**
- `sw.js` precaches a hardcoded `SHELL` module list (`sw.js:10-21`) — every phase adding a
  runtime module must extend it and bump the cache name, or the PWA serves a broken shell.
- `store.loadEvents` / `storage.importJson` bypass validation entirely, and `importJson`
  stamps the current `SCHEMA_VERSION` over its input (`storage.js:46`) — schema hardening
  (2b) was closable around via Import.
- Selector purity change ripples into 26 call sites across 4 caller files — atomic unit
  would violate the 4-file rule.
- Seed uses never-registered synthetic voter actors (`sv_N`) — constrains 2b's actor rule
  to presence, not registered-existence.
- `js/ui/components.js` has zero `store.`/`sel.` references — 3c's static test scope
  confirmed as sufficient over `js/ui/**`.
**Concurrency:**
- Map confirmed all-sequential; 1e noted as the one parallel-safe candidate, declined with
  reason.
**Changed:**
- Added 2c (load-path validation) and 3d (service-worker registry) as units; staged 2e–2h;
  finding 5 in the Problem Statement extended with the load-path hole; sw.js obligations
  named in 4d, 5, 6; Documentation Impact gained README/CI-PATTERN/sw.js entries; OQ5,
  OQ6 added.
**Confirmed:**
- Six-phase order and dependencies held; memory-vs-memory harness bootstrap held;
  read-first phase 6 held; engines already pure (no fix needed there — only the static
  gate in 2h covers them).

### Walk-through + all-atproto restructure — 2026-08-24
During the open-question walk-through the user redirected the architecture at OQ3:
records always come from a PDS or the Jetstream — **scope, not a second data plane, is
the tier axis** — and directed going all-in on atproto, with ATProto Spaces (alpha,
verified against atproto.com announcement) as the private/small primitive, replacing
BSM §11's device-merge `sync` substrate entirely. The memory tier is explicitly kept as
the hermetic CI/CD + behavior/workflow testing instrument and conformance baseline.
**Changed:** destination section rewritten (mock → scoped → wide ladder); Reasoning
entries replaced (`sync`-first rationale → all-atproto rationale + scoped-before-wide);
Phase 5 rewritten as the Spaces-backed scoped tier (lexicons `fyi.forage.*`, direct PDS
sync, probe-first with keep-as-fixture disposition); OQ3 replaced (transport question
dissolved → Spaces alpha posture, PHASE-GATED Phase 5).
**Unchanged:** phases 0–4 in full; phase 6 in full (guest mode already in from OQ2).
**Question severities, walk-through complete (2026-08-24):** OQ1 confirmed PHASE-GATED
(Phase 6); OQ2 resolved (logged-out lens ships in phase 6, critical); OQ3 resolved
(Spaces deferred post-plan; phase 5 ships all-public — phase 5 rewritten accordingly:
records in members' own PDSes, roster question surfaced to its split,
moderation-as-masking risk named); OQ4 confirmed PHASE-GATED (Jetstream v2 exploration
mandated in the phase-5 probe, no default model, ADR before phase 6's split); OQ5
confirmed ADVISORY (`adr/` at root); OQ6 resolved (Stryker as first dev-only dependency).
Tally: 3 resolved outright, 2 PHASE-GATED, 1 ADVISORY. Pass 1+2 closed; Pass 3 next in a
fresh context.

### Pass 3: Quality Gates — 2026-08-24
Spot-checks re-run before the gates: baseline still `f5639a2` clean (plan file untracked
only); every cited file:line re-verified (`reducers.js:193`, `selectors.js:8,16,130`,
`storage.js:46`, `store.js:52-58`, `sw.js:10-21`); node v22.23.2 confirmed.
**TDD ordering:**
- Added the phase-wide execution-order rule: within every unit the test lands RED before
  the production change, regardless of Changes-list print order (exceptions: declared
  characterization 1b/1c and config/prose-only 1a/1e/4e-workflow).
- Mutation-resistance: boundary cases named where tests guarded branching behavior with
  single points — 1c (rank ties + zero-vote items; limits window edge at/inside/outside +
  factor boundaries; thread depth 9/10/11), 2b (accept AND reject per hardened rule, the
  `account.registered` exemption pinned, `sv_`-actor accept pinned), 3c (`createField`
  refuses probation AND succeeds for an established seat).
**Observability:**
- 2c load/import refusals name the offending event index + type, and version mismatches
  name both versions; 3a's unknown-capability error names the capability + known routing
  keys (asserted in test); 4d's conformance report names scenario/seat/assertion/observed
  values/substrate pair per failure — CI-log-diagnosable.
**Debugging readiness:**
- Each unit already ends at a green `npm test` checkpoint with a commit; 3d's new
  `test/shell.test.js` converts the recurring "remember sw.js SHELL" obligation from
  per-unit reminders into a mechanical gate (exclusion list explicit, not implicit).
**Validation calibration:**
- 1a recalibrated on D1 evidence: `node --test test/` over an empty dir exits 1, so 1a
  verifies the runner executes + the pin refuses; first green suite is 1b's milestone.
- **Phase 0 D1 resolved during planning** (per the Pass 3 "resolve now" rule): headless
  import of the full module graph confirmed, seed folds to 8 users, failing assertion
  exits non-zero, empty-dir semantics captured; reducers export is `emptyState` (not
  `initialState`). Probe deleted per `throwaway` disposition. Execution starts at 1a.
**Concurrency honesty:**
- Map confirmed; sequential plan. Write-set disjointness moot (no parallel sets); the 1e
  decline stands recorded.
**Coherence:**
- Post-restructure stragglers fixed: 2d's goal/ADR text de-honor-systemed (id scheme now
  serves the memory tier, rkeys revisit at phase 5's split); "Sequencing and stop-points"
  phase-5 wording updated to the scoped all-public tier.
**Documentation impact:**
- Stale README item voided and replaced (the "honor-system identity text from BSM §11–12"
  entry predated the all-atproto restructure; the live README's "Later layers" still
  describes the dropped `sync` substrate — phase 5's rewrite replaces it); 4e gains the
  README conformance-command line; sw.js registry entry notes the mechanical test.
- All six OQ severities previously user-confirmed (2026-08-24 walk-through); none new.
**Confirmed ready:** yes — no BLOCKING questions. Phase-gates: OQ1 before phase 6's
mapping work; OQ4's ADR before phase 6's split (evidence from phase 5's probe). OQ5
advisory, applied (2d creates `adr/`).
