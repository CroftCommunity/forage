# Plan: backend modes — the runtime tier dial, the live scoped session, and the first lens write

date: 2026-08-24
status: PASS 1+2 COMPLETE 2026-08-24 (all 7 open questions user-confirmed; gap
analysis applied) — Pass 3 (quality gates) pending, fresh context
repo: `CroftCommunity/forage`, local checkout `CroftC/forage`
baseline: `main` @ `10a8ade` (clean tree; main pushed, forage.fyi serving forage-v11)
prior plan: `plans/2026-08-24-1-plan-behavior-scale-scaffolding.md` (CLOSED — built the seam,
the harness, the codec, the lens; this plan picks up TODO.md's deferred work)
planning workflow: `phase-plan` skill (three-pass). This file is the single plan artifact.

## Problem Statement

The scaffolding plan closed with both Bluesky tiers **built but not switchable**:

1. **The routing table is compile-time static.** `js/config/routing.js` maps every
   capability to `'memory'` and registers only the memory substrate; `substrateFor`'s
   table override is used solely by the conformance harness. The scoped tier — codec,
   roster-aperture intake (`fetchScopedEvents`), session writer (`createScopedWriter`),
   all live-proven on bsky.social with two DIDs — is **not reachable from the app**.
   TODO.md names the gap: "what's missing is session plumbing and a deploy story."
2. **No mode concept exists.** There is no way to run the app against real Bluesky
   data and then return to the hermetic memory tier. The memory tier is the permanent
   CI/CD instrument (invariant 10 territory); any Bluesky mode must be enterable and
   leavable **without ever losing memory-tier state** (`storage.js` key `forage.state`).
3. **The lens is read-only with dead-ended polish items.** DL-013 (boost = like) is the
   ledgered first lens WRITE, deferred until "write-scope opens" — the in-memory
   app-password session already carries the scope. Comment author links inside lens
   threads point at `#/u/<handle>` (memory profiles — `js/ui/components.js:117`), and
   `lens.feed` plumbs cursors the UI never uses (no "more").
4. **The scoped tier was proven with self-chosen rkeys only.** Live rehearsal 5f wrote
   records whose rkeys were our deterministic local ids. Once real sessions write
   through the app, intake will also meet **PDS-minted TID rkeys**; `deriveEntityId`
   covers that path in unit tests, but it has never been exercised live end to end
   (record minted by the PDS → intake → fold → UI).

Goal: a **backend-mode switch** — `memory` (always available, hermetic default) |
`scoped` (fyi.forage.* records in members' own PDSes) | `lens` (the owner's Bluesky as
the forum) — flippable at runtime from the dev bar, with scoped mode actually live
(sign-in → writer + intake against a real roster) and DL-013 promoted as the first lens
write. Every new tier difference gets a ledger entry in the same commit (invariant 7/8);
`npm test && npm run conformance` stays the gate and conformance grows to cover the new
live path.

## Reasoning

- **Why the mode dial lives in `js/config/routing.js`:** invariant 4 — substrate
  selection MUST happen only in the routing config. A runtime mode is still substrate
  selection; it becomes per-mode tables (`MODE_TABLES`) plus a `setMode/getMode` in the
  same module, so "flipping the dial" remains a routing-config act, observable and
  mechanical. `substrateFor(capability)` resolves against the active mode's table; the
  explicit `table` parameter stays as the harness seam.
- **Why the scoped substrate is a stateful session module** (`js/substrates/scoped.js`)
  rather than the pure `atproto.js` growing state: `atproto.js` is deliberately a pure
  codec + transport-injected functions (that purity is what made 5c–5e hermetic).
  Session state (who is signed in, the id→at-uri index, the roster) is a different
  concern; it composes the pure pieces. The routing table needs a module whose `write`
  matches the substrate contract — that module is the session holder.
- **Why scoped writes echo through `memory.write`:** invariant 1's mechanical teeth
  (`test/invariants.test.js`) allow `store.commit` only from `js/substrates/memory.js`.
  The scoped write path is: validate + network write (createScopedWriter) → on success,
  fold the same event locally via `memory.write(type, payload, {id, ts, actor})`. The
  PDS stays the authority (a re-pull reconciles); the local echo is the optimistic
  cache. No second commit caller appears; the invariant test keeps passing untouched.
- **Why scoped mode does not persist fetched events** (recommended; OQ3): the roster's
  PDSes are the source of truth — the local fold is a cache, refreshed on entry. Not
  persisting means the memory tier's `forage.state` key is never written while a
  Bluesky mode is active, which makes the "memory state never lost" invariant
  *structural* rather than policed: `store.persist()` becomes mode-aware and writes
  only in memory mode. One new mechanical test pins it.
- **Why lens mode is a surface swap, not a store swap** (recommended; OQ1): the lens
  never touches the store — `lens.js` shapes AppView data directly into selector result
  shapes, and lens views render them without folding. Making `#/home` render lens data
  would mean either faking events (fabricating data — refused by the workspace rule) or
  a parallel read adapter (a second data plane, exactly what the all-atproto revision
  killed). So `mode=lens` makes the lens surface primary (default route + masthead
  emphasis), shares one session object app-wide, and routes the ONE lens write (boost)
  through the adapter; memory routes stay reachable and stay memory-backed.
- **Why the boost write goes through actions → routing → lens substrate:** invariant 1
  (all mutations flow through the actions adapter) does not exempt foreign-state
  mutations, and the symmetry is cheap: `routing.js` exports a `LENS_TABLE` mapping
  `voting` to the lens write substrate; a `setLensVote` action resolves through it
  **explicitly** — because lens surfaces are reachable in every mode, the boost must
  reach the lens substrate regardless of the global dial, and (conversely) memory
  views in lens mode must keep memory-routed writes, so `MODE_TABLES.lens` stays
  all-memory for the contract capabilities (Pass 2 correction — lens mode is purely
  the surface swap OQ1 confirmed). Every other lens capability stays a frontier
  chip. DL-013's promotion (frontier → shipped) lands in the same commit that
  removes its chip — the chip-ledger integrity test (`test/lens.test.js:85-97`)
  keeps chips and entries mechanically consistent.
- **Why the lens write is its own module** (`js/substrates/lens-write.js`, Pass 2):
  `test/invariants.test.js:36-54` grants `lens.js` a UI-import exception *because*
  it is read-only, and mechanically asserts it never calls
  `createRecord|putRecord|deleteRecord`. Putting like/unlike in `lens.js` would
  break the test AND the argument behind it. A separate write module keeps the
  exception intact: `lens.js` stays the shaping/read module UI may import;
  `lens-write.js` is reachable only through actions → routing, like every other
  write substrate.
- **Why a fake-PDS conformance world before going live:** 5e proved the *codec*
  conformant (pure round-trip). The live path adds `createScopedWriter` +
  `fetchScopedEvents` + the session module — none of it currently under the
  conformance gate. An in-memory fake PDS (the four record ops + paginated
  `listRecords`, semantics pinned by the 5a/D-probe fixtures) lets worldB replay every
  scenario through the REAL write path and REAL intake, hermetically. The harness then
  gates session plumbing the same way it gated the codec — and the gate's first run
  may catch real drift, as 5e's first run caught `held`.
- **Why identity synthesis at intake:** the fold's `users` map is built from
  `account.registered` events, which are LOCAL_ONLY — a live scoped pull has none, so
  authors render `[unknown]` and `viewerCtx` derives nothing. Intake synthesizes one
  `account.registered` local per roster DID (actor = DID, handle from the D2-probed
  resolution endpoint), keeping the contract untouched: the fold still derives
  everything, nothing is hand-maintained (invariant: state derives). The one selector
  change — `viewerCtx.handle` falls back to `state.users[viewerId]?.handle` when the
  viewer is not a static persona — also fixes an existing quirk for runtime-registered
  accounts, and lands test-first.
- **Why phases order hermetic-before-live:** the session substrate, mode dial, and
  fake-PDS conformance are all buildable and provable offline; live probes (Phase 0)
  and live validation (Phase 4's rehearsal, Phase 5's like) are bracketed so network
  work happens against verified machinery. This mirrors the prior plan's probe →
  hermetic → live rhythm, which worked.
- **Why not OAuth now:** TODO.md lists real OAuth as lens polish with croft's connect
  machinery as precedent — a full plan of its own. This plan keeps the in-memory
  app-password session (already the lens pattern) for both Bluesky modes; sessions are
  page-lifetime, never persisted, creds never stored. OAuth is explicitly deferred
  again (it stays on TODO.md, no ledger entry needed — it is scaffolding posture, not
  tier behavior).
- **Rejected: a per-capability mode UI** (dropdown per capability). The tier story is
  one dial (BSM: scope as the tier axis); per-capability flips stay possible in code
  (tables are per-capability) but the dev-bar control is one three-way switch. A
  capability-granular UI invites incoherent hybrids nobody has ledgered.
- **Rejected: persisting scoped fetches under a second storage key.** Cache
  invalidation across sessions with no freshness channel invites stale-fold confusion;
  pull-on-entry is 3.1s for 2 DIDs (measured, 5f) — acceptable for a ten-friends
  aperture. Revisit (with the Jetstream tail as the freshness channel, TODO.md) only
  when entry cost is actually felt.

## Verified Assumptions

Confirmed firsthand during planning (2026-08-24), by reading the named file/lines or
running the command:

- **Routing seam** — `js/config/routing.js`: static table, all `'memory'`;
  `substrateFor(capability, table = routing)` with fail-loud unknowns; `SUBSTRATES`
  registry holds only `memory`. `CAPABILITIES` = 10 keys.
- **Scoped machinery** — `js/substrates/atproto.js` (445 lines): pure codec
  (`recordToEvents`/`encodeEvents`/`decodeRecords`), `deriveEntityId` maps TID rkeys to
  `<prefix>_<did>_<rkey>` and passes non-TID rkeys through as local ids
  (`looksLikeTid` = `/^[2-7a-z]{13}$/`); `fetchRoster` (roster singleton, rkey
  `self`, in the founding DID's repo), `fetchScopedEvents` (unauth listRecords,
  paginated, per DID × 8 wire collections), `createScopedWriter({service, did,
  accessJwt, transport, uriFor})` → validates via `schema.js`, performs record ops,
  returns the event. **Writer always passes an explicit rkey** (the local id) — the
  PDS-minted-TID path exists only on intake of foreign records.
- **Memory substrate + invariant teeth** — `js/substrates/memory.js` is the sole
  `store.commit` caller, enforced by `test/invariants.test.js` (read at 3c in the
  prior plan; re-confirmed by grep).
- **Store persistence** — `js/store.js`: every `commit`/`loadEvents`/`setPersona`/
  `setDev` calls `persist()` → `storage.save` → localStorage key `forage.state`
  (`js/storage.js:5`, SCHEMA_VERSION 2). **Any Bluesky-mode fold loaded via
  `loadEvents` today would clobber the memory log** — the mode work MUST guard this.
- **Identity derivation** — `js/selectors.js:10-23` `viewerCtx`: `handle` comes from
  `personaById(viewerId)`, and `personaById` falls back to the Logged-out persona for
  unknown ids (`js/personas.js:19-21`) — a DID viewer would render handle "Logged
  out". `state.users[viewerId]` supplies registeredTs/suspended only. Author handles
  in selectors come from `state.users[...].handle` (`selectors.js:73,91`).
- **Actions layer** — `js/actions.js`: every write resolves `substrateFor(capability)`
  (no table argument — the active-table change lands exactly here for free);
  `guardedWrite` wraps latency + Fail-Next; ids from `genId(prefix)` =
  `<prefix>_<actorId>_<seq>`.
- **Lens** — `js/substrates/lens.js`: `LENS_PERMS` all-false write gates;
  `shapeLensPost` **drops `post.cid`** (needed for a like record's strong ref) and
  maps `myVote` from `viewer.like` (an at-uri whose rkey is the unlike handle);
  `createLens({session})` routes through the PDS proxy when signed in. Session +
  `lens` instance are module-local to `js/ui/lens-views.js` (`lens-views.js:12-13`) —
  promoting the session app-wide means extracting it.
- **Lens UI seams** — `js/ui/components.js:117`: `commentNode` hardcodes
  `#/u/${node.author}`; `postRow` renders the author as plain text (`:84`), so the
  author-link fix is commentNode-only. `js/ui/lens-views.js` rewrites post links
  post-hoc via querySelector (`:123-127`). Pagination: `lens.feed` returns `cursor`;
  `lensFieldView` ignores it.
- **Conformance harness** — `conformance/run.js`: worlds are `{name, replay,
  evaluate?}`; `test/conformance-scoped.test.js` (5e) replays through the PURE codec
  only — `createScopedWriter`/`fetchScopedEvents` are outside the gate today. Library
  = 10 scenarios, ≥80 observables asserted.
- **Ledger** — `ledger/divergence.js`: DL-013/014/015 are `kind: 'frontier'` (no
  `status` field on frontiers); tolerances carry `status: 'active'`; `COMPARATORS`
  extension rule ("added HERE, same commit"). Chips referencing DL ids render in
  `lens-views.js`; a chip-ledger integrity test landed in 6e.
- **Gate** — `package.json`: `test` = `node --test` (bare, v22.23.2 quirk),
  `conformance` = `node conformance/run.js`. Suite currently 172 tests + 88
  conformance observables green (prior plan close-out; re-verified green at this
  plan's baseline by running both — see Phase 1 precondition).
- **(Pass 2) Invariant teeth, read in full** — `test/invariants.test.js`:
  `store.commit` callable only from `memory.js` (regex scan over all `js/**`);
  `js/ui/**` may import no substrate except read-only `lens.js`
  (`UI_SUBSTRATE_EXCEPTIONS`) and may never import `config/routing`; `lens.js`
  must contain no `commit(` and no `createRecord|putRecord|deleteRecord`.
  `js/devbar.js` and `js/main.js` are NOT under `js/ui/` — the dev bar may
  legally drive `setMode`/`scoped.enter`.
- **(Pass 2) Replay path** — `scenarios/format.js:60-71`: `replayOnSubstrate`
  resolves `substrateFor(cap, table)` and `replayOnMemory` passes NO table — it
  rides the default, which 2a turns into the active mode's table. Browser Seed,
  tests, and the conformance CLI all share this path: without the 2a fix, Seed in
  scoped mode would replay the library through the LIVE writer. Two teeth land in
  2a/2b: `replayOnMemory` pins the explicit memory table; Seed/Delete All/Import
  become memory-mode-only dev-bar controls.
- **(Pass 2) Chip-ledger integrity** — `test/lens.test.js:85-97` asserts
  DL-010..015 exist with their exact kinds and that `lens-views.js` references
  each id: DL-013's kind change goes RED here first, and the same commit carries
  the chip removal (the test IS the same-commit enforcement).
- **SW registry** — `sw.js` CACHE `forage-v11`; `test/shell.test.js` mechanically
  requires every runtime module in SHELL. Any new `js/**` runtime module = SHELL line
  + cache bump in the same unit.
- **Creds** — `CroftC/.env` holds `test_user1/test_pass1`, `test_user2/test_pass2`
  (names verified, values not printed). Standing atproto test account precedent:
  memory `croft-test-atproto-account` (ngvalidation2112.bsky.social, M1 test bed).
- **5f live evidence** (prior plan Review Log): two-DID rehearsal 8/8 — writer +
  unauth intake + fold + selectors browse; 123ms/collection listRecords; 3.1s full
  pull (2 DIDs × 8 collections); all live records cleaned after.

**NOT verified (→ Phase 0):** that an unauth endpoint returns a DID's handle
(candidates: `com.atproto.repo.describeRepo` on the PDS, `app.bsky.actor.getProfile`
on the AppView — response shapes unprobed for this purpose); the live shape of a
PDS-minted TID record arriving through `fetchScopedEvents` (unit-tested only); the
`app.bsky.feed.like` record shape + viewer.like/likeCount observability round-trip
(never written by us).

## Documentation Impact

- `README.md` — gains the backend-modes section (what the dial does, what each mode
  is, that memory is the permanent default) in **Phase 2d** (the unit that makes the
  dial user-visible); the lens paragraph's "read-only" claim updates in **Phase 6c**
  (Pass 2: moved out of 5d for the file cap). Grep confirmed: "read-only"/"writes
  stay" wording appears in README's lens paragraph and `lens-views.js` copy (the
  latter updates in 5d with the button).
- `TODO.md` — the "Scoped-tier deployment" and "Lens polish" sections shrink as their
  items land: **Phase 4d** (scoped session plumbing) and **Phase 6c** (DL-013,
  author links, pagination). OAuth stays listed (deferred again, this plan).
- `ledger/divergence.js` — DL-013 frontier → shipped in **Phase 5d** (same commit as
  the chip removal; the integrity test at `test/lens.test.js:85-97` enforces the
  pairing); any new tier difference surfaced by phases 4–6 gets its entry in the
  same commit that creates the difference (invariant 7/8 — called out per-phase).
- `AGENTS.md` — no change: sources of truth already name `js/config/routing.js` and
  `ledger/divergence.js`; verification commands unchanged. (Checked: no wording
  depends on the table being static.)
- `sw.js` SHELL + cache bump — mechanical via `test/shell.test.js`: **Phase 1a**
  (`js/substrates/scoped.js`) and **Phase 5b** (`js/substrates/lens-write.js`);
  no other unit adds a runtime module (2c folds session state into existing
  `lens.js`).
- `plans/` (this file) — Review Log entries per pass; phase splits updated on probe
  evidence.
- `CroftC/.claude/CI-PATTERN.md` — untouched (no workflow changes; the stale-row item
  in TODO.md is unrelated meta-repo work, on request).

## Concurrency Map

```
Sequential spine: Phase 0 → 1a → 1b → 2a → 2b → 2c → 2d → 3a → 3b → 4a … 4d
                  → 5a → 5b → 5c → 5d → 6a → 6b → 6c
All phases sequential.
```

Reason: single agent, one working tree; the high-traffic files recur across units
(`routing.js` in 1a/2a/5b, `store.js` in 1b, `lens-views.js` in 2b/5c/6a/6b,
`devbar.js` in 2b/4b) and each phase's teeth gate the next. Phase 6 (lens polish) has
a write-set disjoint from phases 3–4 and could in principle run parallel in a
worktree, but it shares `lens-views.js` with phase 5 and the dispatch overhead
exceeds the unit size — declined for the same reason the prior plan declined 1e;
recorded so the sequential default is a decision, not an omission.

## Phases

Field conventions follow the prior plan: units cap at 3 written files (tests
included); test lands RED before production code within every unit (exceptions:
declared probe/fixture units and prose-only changes); every unit ends `npm test &&
npm run conformance` green with a commit. **No pushes to `main` without asking — a
push deploys forage.fyi.** Live units use creds from `CroftC/.env` (never committed,
never printed) and **delete every record they create** (per-unit cleanup listed in
Done-when).

### Phase 0: Discovery — live probes (Discovery Exemption applies)

**Goal:** Close the three NOT-verified assumptions with fixtures before hermetic
phases pin behavior against guessed shapes.

- [ ] **D1: What does a PDS-minted-TID record look like through our intake?**
  - **Probe:** As test account 1, `createRecord` a `fyi.forage.post` **without an
    rkey** (PDS mints a TID); pull it via `fetchScopedEvents` (real transport);
    decode; fold. Record the raw listRecords response. Delete the record.
  - **Success criteria:** the decoded event id is `p_<did>_<tid>` (TID matched by
    `looksLikeTid`), the fold produces a browsable post, and the record's at-uri is
    recoverable for the id→uri index. Any mismatch adjusts Phase 1a's index design
    before it is built.
  - **Disposition:** `keep-as-fixture` — raw response joins
    `test/fixtures/atproto/` (JWTs redacted); the probe script is deleted.
- [ ] **D2: Which unauth endpoint resolves DID → handle for roster members?**
  - **Probe:** against test-account DIDs, call `com.atproto.repo.describeRepo`
    (PDS) and `app.bsky.actor.getProfile` (AppView) unauthenticated; record status +
    response shape for both.
  - **Success criteria:** one endpoint returns the handle unauth with a documented
    field path; that endpoint becomes Phase 1b's resolution source. If both need
    auth, fallback decision: roster record carries denormalized handles (plan
    updated at the phase-1 boundary, Review Log entry).
  - **Disposition:** `keep-as-fixture` (redacted).
- [ ] **D3: What is the like write/read round-trip?**
  - **Probe:** test account 1 likes a post **authored by test account 2** via
    `com.atproto.repo.createRecord` (`app.bsky.feed.like`, strong ref = {uri, cid});
    read back `getPostThread` as account 1 (viewer.like present? likeCount bumped?);
    extract the like rkey from viewer.like; `deleteRecord` the like; confirm
    viewer.like gone. Both test-account records cleaned (the liked post is a
    probe-created post in account 2's repo, deleted after).
  - **Success criteria:** the exact record shape a like needs, the viewer.like →
    unlike-rkey extraction, and observed likeCount/viewer semantics — Phase 5's
    writer is built against this fixture, not the docs.
  - **Disposition:** `keep-as-fixture` (redacted).

**Done when:** Verified Assumptions updated with all three findings; fixtures
committed; zero residue records in either test account (verified by listRecords).

### Phase 1 — The scoped session substrate (hermetic)

#### 1a: `js/substrates/scoped.js` — session state + the write path
**Goal:** A routing-registrable substrate whose `write` performs the network write
and echoes locally, holding the session + id→at-uri index.
**Changes:**
- [ ] `js/substrates/scoped.js` — new: `connect({service, did, handle, accessJwt,
  transport})` / `disconnect()` / `isConnected()`; an id→uri index seeded by intake
  (1b) and extended by own writes (D1-informed); `write(type, payload, opts)` =
  no-session refusal with words → `createScopedWriter` network op → on success
  `memory.write(type, payload, {id, ts, actor: did})` local echo; local-only types
  refused with words (they never had a scoped route — their capabilities stay
  memory-routed, this is defense in depth).
- [ ] `test/scoped-substrate.test.js` — RED first: fake transport records the XRPC
  calls; write-without-session throws naming the fix ("scoped substrate: not signed
  in — connect() first"); a post.created write hits createRecord AND lands in the
  local fold with the same id/actor/ts; a network failure (non-ok response) throws
  and does NOT echo locally (fail loud, no divergent cache).
- [ ] `sw.js` — SHELL + `forage-v12` (the registry test forces this in-unit).
**Call chain:** (wired in 2a) actions → routing[scoped].voting… → `scoped.write` →
PDS + `memory.write` → `store.commit`.
**Wiring test:** deferred to 2a's table wiring (this unit's tests drive `write`
directly; the module is not yet reachable from the app — acceptable for one unit,
the mode dial lands next and the shell test already forces registration here).
**Depends on:** Phase 0 D1 (index design for foreign TIDs).
**Read-set:** `js/substrates/atproto.js`, `js/substrates/memory.js`, `js/schema.js`.
**Write-set:** the three files above.
**Shared-state contract:** none beyond the write-set (fake transport; no network).
**Risks:** double-validation (writer validates, memory.write validates again) — cheap
and harmless; ordering (network-then-echo) means a slow PDS delays the optimistic
UI — acceptable at ten-friends scale, the dev-bar latency toggle already simulates it.
**(Pass 2) rkey re-entry collision:** `genId` derives seq from the per-actor event
count, which can SHRINK across sessions (vote/save retractions delete records →
fewer decoded events), so a fresh id can equal an rkey already used — the PDS
create then conflicts. Posture: fail loud with words (the createRecord error
surfaces as a toast); if 4c's rehearsal actually hits it, the fix lands as its own
red-first commit (candidate: the scoped substrate consults its id→uri index and
refuses/advances before the network call). Not pre-built — measured first.
**Done when:** (behavioral) a connected scoped substrate persists a write to the
(fake) PDS and the local fold atomically, and refuses cleanly when signed out;
(verification) `npm test` green.
**Validation:** Narrow.

#### 1b: Scoped intake → store, identity synthesis, and the no-clobber guard
**Goal:** Entering scoped mode pulls the roster world into the store WITHOUT
touching the memory tier's persisted state; DIDs become renderable users.
**Changes:**
- [ ] `js/store.js` — mode-aware persistence: a `setPersistence(false)`-style guard
  (exact shape at implementation) so `persist()` is a no-op while a Bluesky mode
  owns the store; `hydrate()` restores the memory world on return.
- [ ] `js/substrates/scoped.js` — `enter({service, rosterDid, transport})`:
  `fetchRoster` → `fetchScopedEvents` → synthesize one `account.registered` local
  per roster DID (actor = DID, handle via the D2 endpoint; ts = a stable epoch so
  age-probation doesn't misfire — exact choice pinned by test) → seed the id→uri
  index from the pulled records → `loadEvents` the combined stream →
  `setPersona(did)` (writes attribute to the session DID; the masthead renders the
  synthesized user); `leave()` → disconnect + re-hydrate memory (hydrate restores
  the memory persona from storage — Pass 2 addition, pinned in the round-trip
  test).
- [ ] `test/scoped-substrate.test.js` — RED first, the plan's core invariant: seed
  the memory store, snapshot localStorage; `enter` a fake-transport roster world;
  assert the store now folds the scoped world AND `forage.state` in (mocked)
  localStorage is byte-identical to the snapshot; write in scoped mode (echo path)
  — still untouched; `leave()` → the memory world is back, byte-identical.
**Call chain:** dev-bar mode control (2b) → `scoped.enter` → intake → `store.loadEvents`.
**Wiring test:** the enter/leave round-trip test above (store-level end to end;
UI-level wiring lands with the dev-bar control in 2b).
**Depends on:** 1a; Phase 0 D2 (handle endpoint).
**Read-set:** `js/substrates/atproto.js`, `js/storage.js`.
**Write-set:** `js/store.js`, `js/substrates/scoped.js`, `test/scoped-substrate.test.js`.
**Shared-state contract:** mocked localStorage in tests; no network.
**Risks:** `viewerCtx.handle` still derives from personas for a DID viewer — fixed in
2b (selector fallback) where the UI makes it observable; synthesized registration ts
interacts with age-probation (`< 7 days` ⇒ probation) — the test pins the chosen ts
side.
**Done when:** (behavioral) enter/leave is lossless for the memory tier and the
scoped fold has real users; (verification) `npm test` green including the
byte-identical guard.
**Validation:** Narrow.

### Phase 2 — The mode dial

#### 2a: Per-mode routing tables + runtime mode state
**Goal:** Invariant 4's dial becomes runtime-switchable in the one legal place.
**Changes:**
- [ ] `js/config/routing.js` — `MODE_TABLES = { memory: (today's table), scoped:
  (wire capabilities → 'scoped'; notifications/prefs/accounts stay 'memory'), lens:
  (all-memory — lens mode is the surface swap, Pass 2 correction; the lens WRITE
  is reached only via the explicit `LENS_TABLE` export, which lands in 5c with its
  substrate so the table never names an unregistered substrate) }`;
  `getMode()/setMode(mode)` (unknown mode fails loud naming knowns);
  `substrateFor(capability, table)` default becomes the active mode's table;
  `SUBSTRATES` registers `scoped` (module from 1a).
- [ ] `scenarios/format.js` — (Pass 2) `replayOnMemory` passes the explicit memory
  table, so Seed/tests/conformance are pinned to the memory substrate whatever the
  runtime mode.
- [ ] `test/adapter.test.js` — RED first: mode switch changes which substrate a
  capability resolves to; unknown mode refused with words; scoped mode's
  notifications/prefs/accounts still resolve memory (the local-only split is
  behavior, pinned); default mode is memory; **replayOnMemory resolves memory even
  with mode=scoped active** (the Seed-safety tooth).
**Call chain:** devbar (2b) → `setMode` → every subsequent `actions.*` →
`substrateFor` → the mode's substrate.
**Wiring test:** an end-to-end action test: with mode=scoped (fake-connected
substrate), `actions.setVote` reaches the scoped substrate's transport, not
`store.commit` directly; with mode=memory it reaches memory. (Extends the existing
adapter spy pattern.)
**Depends on:** 1a, 1b.
**Read-set:** `js/actions.js` (confirmed: no action caches a substrate).
**Write-set:** `js/config/routing.js`, `scenarios/format.js`, `test/adapter.test.js`.
**Shared-state contract:** module-level mode state — tests reset it (afterEach) so
suite order stays irrelevant.
**Risks:** conformance harness passes explicit tables everywhere (verified) so
runtime mode cannot leak into the gate; a test forgetting to reset mode — the reset
helper is part of the unit.
**Done when:** (behavioral) one call flips which backend every write reaches;
(verification) `npm test && npm run conformance` green.
**Validation:** Narrow.

#### 2b: The dev-bar mode control + scoped sign-in + identity display
**Goal:** The dial is a dev-bar-grade control; entering scoped mode is a sign-in;
memory mode is one click back.
**Changes:**
- [ ] `js/devbar.js` — a three-way mode control (memory | scoped | lens): scoped
  opens a sign-in row (service, handle, app password + roster DID — defaults
  per OQ5's decision; in-memory only, page-lifetime, same posture as the lens card);
  on success `scoped.enter` + `setMode('scoped')` + toast with words; failure =
  toast, mode unchanged (memory never abandoned on a failed entry); leaving scoped
  → `leave()` + `setMode('memory')`; lens position → `setMode('lens')` + navigate
  `#/lens` (surface swap per OQ1's decision). Persona dropdown in scoped mode is
  replaced by the signed-in identity (a persona switch is meaningless against a
  real repo). **(Pass 2) Seed / Delete All / Import become memory-mode-only
  controls** — hidden or refusing with words in Bluesky modes: Seed replays the
  library through the write path and must never meet a live substrate (see the
  replayOnMemory finding; this is the belt to 2a's suspenders). Export stays (it
  reads storage). Accepted quirk, recorded not built-around: `#/signup` reached by
  URL in scoped mode creates a user in the ephemeral scoped fold — lost on leave,
  never on the wire (accounts stays memory-routed).
- [ ] `js/selectors.js` — `viewerCtx.handle` falls back to
  `state.users[viewerId]?.handle` when the viewer is not a static persona (fixes
  DID viewers AND the existing runtime-signup quirk).
- [ ] `test/selectors.test.js` — RED first for the fallback (DID viewer with a
  synthesized user renders its handle; static personas unchanged — both sides).
**Call chain:** devbar control → sign-in → `scoped.enter`/`setMode` → store notify
→ full re-render on the scoped world.
**Wiring test:** the selector test plus 2d's browser smoke (the devbar is DOM glue;
its logic lives in already-tested modules — the smoke run is the wiring proof, same
posture as the prior plan's dev-bar units).
**Depends on:** 2a.
**Read-set:** `js/ui/lens-views.js` (session card pattern), `js/personas.js`.
**Write-set:** `js/devbar.js`, `js/selectors.js`, `test/selectors.test.js`.
**Shared-state contract:** none beyond the write-set (no live network in this unit —
sign-in is exercised live in 4c).
**Risks:** devbar grows crowded — acceptable, it is scaffolding by design.
**Done when:** (behavioral) the dial exists and flips modes with words at every
refusal; (verification) `npm test` green + 2d smoke.
**Validation:** Moderate (smoke lands in 2d).

#### 2c: The shared lens session (Pass 2 addition — OQ1's surface swap needs it)
**Goal:** The lens session leaves `lens-views.js` module-locals so the whole app
(dev bar, actions in phase 5) shares one session; behavior otherwise unchanged.
**Changes:**
- [ ] `js/substrates/lens.js` — session state joins the read module (symmetric
  with `scoped.js`): `signIn({identifier, password})` (the createSession fetch
  moves here from `lens-views.js:26-35`), `signOut()`, `getSession()`,
  `activeLens()` returning the session-bound `createLens` instance. Still
  read-only — no record ops, the invariants tooth (`invariants.test.js:50-54`)
  keeps passing untouched.
- [ ] `js/ui/lens-views.js` — consumes the shared session/lens instead of its
  module-locals (`lens-views.js:12-13` deleted).
- [ ] `test/lens.test.js` — RED first: signIn stores the session and activeLens
  routes through it (fake transport); signOut drops back to the guest lens;
  signIn failure surfaces words and leaves the guest lens standing.
**Call chain:** lens session card / devbar → `lens.signIn` → `activeLens()` →
every lens view read; (phase 5) `actions.setLensVote` → `lens-write` →
`getSession()`.
**Wiring test:** the session tests + the existing lens-view rendering tests still
green over the refactor (characterization holds).
**Depends on:** 2b (ordering only — shared file churn).
**Read-set:** `js/ui/lens-views.js`.
**Write-set:** `js/substrates/lens.js`, `js/ui/lens-views.js`, `test/lens.test.js`.
**Shared-state contract:** module-level session state — tests reset it.
**Risks:** none material; a pure extraction with the old surface kept rendering.
**Done when:** `npm test` green; lens sign-in works as before in the browser.
**Validation:** Narrow (2d's smoke covers the browser).

#### 2d: Lens surface swap + mode-switch browser smoke + README
**Goal:** mode=lens makes the lens primary (OQ1); the memory-never-lost arc
observed in a real browser.
**Changes:**
- [ ] `js/main.js` — mode-aware boot/nav: in lens mode the default route is
  `#/lens` and the masthead emphasizes the lens surface (memory routes stay
  reachable and memory-backed — no route removal).
- [ ] `README.md` — backend-modes section (the dial, the three modes, memory as
  the permanent default; scoped/lens sessions in-memory only).
**Wiring test:** browser: seed memory → note a post → enter scoped
(fake-transport world via a test seam if cheap, else deferred to 4c's live run —
decided at execution, recorded in Review Log) → memory posts absent, scoped world
renders → leave → the noted post is back; reload → memory intact + memory mode;
flip to lens → lands on `#/lens`.
**Depends on:** 2b, 2c.
**Read-set:** `js/devbar.js`.
**Write-set:** `js/main.js`, `README.md`.
**Done when:** the smoke arc observed and recorded; README current.
**Validation:** Moderate.

### Phase 3 — Conformance over the live path (hermetic fake PDS)

#### 3a: The fake PDS
**Goal:** An in-memory PDS honest enough to host the writer + intake end to end.
**Changes:**
- [ ] `test/helpers/fake-pds.js` — fetch-shaped transport implementing
  createRecord (mints TIDs when no rkey given — D1-informed), putRecord,
  deleteRecord, getRecord, paginated listRecords (cursor semantics per the 5a
  fixtures), per-repo storage; auth checked only for writes (mirrors the real
  unauth-read posture).
- [ ] `test/fake-pds.test.js` — RED first: the fake's semantics pinned against the
  recorded fixtures (a createRecord round-trips through listRecords; pagination
  yields every record exactly once; unauth write refused).
**Call chain:** used by 3b + phase-4 tests as the `transport` argument.
**Depends on:** Phase 0 fixtures.
**Write-set:** the two files.
**Risks:** the fake drifting from the real PDS — bounded by building it strictly
from recorded fixtures, and by 4c's live rehearsal exercising the same code paths.
**Done when:** `npm test` green.
**Validation:** Narrow.

#### 3b: Scoped-LIVE conformance world
**Goal:** The conformance gate covers session plumbing, not just the codec.
**Changes:**
- [ ] `test/conformance-scoped-live.test.js` — worldB replays each scenario by
  DRIVING the real path: per-actor `createScopedWriter` against the fake PDS (wire
  events; locals folded directly), then `fetchScopedEvents` + identity synthesis →
  fold; run the full library through `runConformance` vs pure-fold; zero unledgered
  divergence (tolerances apply as ever). Any legitimate difference found here gets
  its ledger entry in the same commit (invariant 9 — this is where a new-mode
  tolerance would surface).
**Call chain:** `npm test` (and the library IS the gate content).
**Wiring test:** the suite itself — it is the wiring proof for writer→PDS→intake→fold.
**Depends on:** 3a, 1a/1b.
**Write-set:** the one file.
**Risks:** scenario actors are personas (`u_fern`), not DIDs — (Pass 2 refinement)
the world uses the persona id AS the fake DID, the exact precedent 5e's
`encodeEvents` set (`did = ev.actor`): local-id rkeys pass through
`deriveEntityId` unchanged, observables line up, and identity synthesis is
skipped because the locals already carry the scenarios' `account.registered`
events (synthesis in 1b must skip DIDs already registered — pinned by a test
here so live intake and this world share the guard). If any id-shaped observable
still legitimately differs, it is ledgered, not fudged.
**Done when:** (behavioral) the whole library passes through the live machinery;
(verification) `npm test && npm run conformance` green.
**Validation:** Narrow (hermetic by design; the live counterpart is 4c).

### Phase 4 — Scoped mode LIVE (the two test accounts)

#### 4a: Roster + world setup script (probe-style, disposition declared)
**Goal:** A reproducible live world: roster record in account 1's repo naming both
DIDs, a small seed of records — created by a script, torn down by the same script.
**Changes:**
- [ ] `scripts/scoped-rehearsal.js` (node, creds from env, never committed values) —
  `setup` / `teardown` subcommands; setup writes the roster (rkey `self`) + a field
  + a post; teardown deletes everything it created (idempotent; verifies by
  listRecords after).
**Depends on:** Phase 0; OQ5 (standing vs per-run roster).
**Shared-state contract:** writes ONLY to the two test-account repos; live network.
**Done when:** setup then teardown leaves both repos record-free (listRecords
verified); the script is the only live-record author outside probes.
**Validation:** Broad (it is live by nature).
**Disposition note (Discovery-adjacent):** the script is kept — it is the
deployment story's seed and the cleanup guarantee in one place.

#### 4b: Live entry defaults + error paths
**Goal:** The dev-bar scoped sign-in reaches the real world with honest failure
modes.
**Changes:**
- [ ] `js/devbar.js` — roster-DID + service defaults wired per OQ5's decision
  (never credentials); refusal paths surfaced with words (bad password, roster
  missing, network down → toast + stay in memory).
- [ ] `test/scoped-substrate.test.js` — RED first: `enter` with a failing roster
  fetch throws with words and leaves the store untouched (the failure half of the
  1b invariant, now against transport errors).
**Depends on:** 4a, 2b.
**Write-set:** the two files.
**Done when:** `npm test` green; failure paths observed in the browser against a
wrong password (no record writes involved).
**Validation:** Moderate.

#### 4c: The live rehearsal through the FULL UI (the user's probe ask)
**Goal:** The end-to-end that has never run: real sessions writing through the app,
intake meeting PDS-minted TID rkeys, both proof paths through the real UI.
**Changes:** none to production code (fixes discovered here become their own
red-first commits). Playwright drives: account 1 signs in via the dev bar → scoped
mode → creates a post through the real submit view (local-id rkey path) → account 2
(second browser context) signs in → sees it → comments + boosts → **the TID leg**:
a record is created in account 2's repo WITHOUT an rkey (script-injected, the
external-client stand-in) → account 1 re-enters/refreshes → the TID-rkeyed record
renders and is votable/commentable through the UI (uriFor index covers foreign
TIDs) → leave scoped → memory intact → teardown.
**Wiring test:** this run IS the wiring test at Broad scope; every observation
recorded in the Review Log with numbers.
**Depends on:** 4a, 4b.
**Shared-state contract:** live writes to test-account repos only; torn down by 4a's
script; `CroftC/.env` creds read at run time, never logged.
**Done when:** (behavioral) the arc above observed; (verification) teardown-verified
clean repos + `npm test && npm run conformance` still green.
**Validation:** Broad.

#### 4d: TODO/docs closure for the scoped tier
**Changes:**
- [ ] `TODO.md` — scoped-tier deployment section updated (session plumbing landed;
  what remains is the owner-facing deploy story + Jetstream freshness option).
- [ ] `README.md` — scoped paragraph updated if 4c changed any wording assumptions.
**Depends on:** 4c.
**Validation:** Narrow (prose).

### Phase 5 — The first lens write: boost = like (DL-013 promotion)

#### 5a: cid + like-rkey in the lens shapes (hermetic, read side only)
**Goal:** Shapes carry what a strong ref and an unlike need; still zero writes in
`lens.js`.
**Changes:**
- [ ] `js/substrates/lens.js` — `shapeLensPost` (and the thread nodes) carry `cid`
  and `likeRkey` (parsed from `viewer.like`, D3-informed).
- [ ] `test/lens.test.js` — RED first: shapes carry cid/likeRkey against the D3
  fixtures; absent viewer.like → likeRkey null (both sides).
**Depends on:** Phase 0 D3; 2c.
**Write-set:** the two files.
**Done when:** `npm test` green (`invariants.test.js` untouched and green —
lens.js stays read-only).
**Validation:** Narrow.

#### 5b: The lens write substrate (Pass 2 restructure — the invariants tooth
`invariants.test.js:50-54` forbids record ops in `lens.js`)
**Goal:** A write module the routing table can name, leaving the lens read-only
exception intact.
**Changes:**
- [ ] `js/substrates/lens-write.js` — new: `like(uri, cid)` / `unlike(likeRkey)`
  via the session PDS proxy (session from `lens.getSession()`, refusal with words
  when guest); a `write(type, payload)` facade mapping ONLY `vote.set`
  {value 1 → like, 0 → unlike} (any other type: refusal naming DL-013's scope);
  record shapes exactly per the D3 fixture.
- [ ] `sw.js` — SHELL + cache bump (registry test forces it).
- [ ] `test/lens-write.test.js` — RED first: like/unlike produce the D3-verified
  record ops (fake transport); guest refused with words; non-vote types refused;
  network failure propagates (no silent success).
**Depends on:** 5a, 2c (session), Phase 0 D3.
**Write-set:** the three files.
**Done when:** `npm test` green; `invariants.test.js` green unmodified (lens-write
is not UI-imported and not a commit caller — the existing scans already cover it).
**Validation:** Narrow.

#### 5c: Route the boost through the adapter
**Goal:** Invariant 1 holds for the lens write; the substrate joins routing.
**Changes:**
- [ ] `js/config/routing.js` — `SUBSTRATES['lens-write']` registered; `LENS_TABLE`
  exported (voting → 'lens-write'; nothing else) — surface-scoped selection that
  still lives entirely IN the routing config; `MODE_TABLES.lens` stays all-memory
  (2a's correction holds).
- [ ] `js/actions.js` — `setLensVote({uri, cid, likeRkey, value})`: resolves
  `substrateFor('voting', LENS_TABLE)`, wraps latency/Fail-Next like every write.
- [ ] `test/adapter.test.js` — RED first: the action reaches the lens-write
  transport regardless of the global mode; Fail-Next rejects it like any write;
  memory-mode `setVote` untouched.
**Call chain:** lens UI (5d) → `actions.setLensVote` → `LENS_TABLE` →
`lens-write.write` → PDS proxy.
**Wiring test:** the adapter test above; UI wiring in 5d.
**Depends on:** 5b, 2a.
**Write-set:** the three files.
**Done when:** `npm test && npm run conformance` green.
**Validation:** Narrow.

#### 5d: The boost button + DL-013 promotion + live validation
**Goal:** Boost renders live on lens posts/threads for a signed-in session; the
frontier chip retires in the same commit as the ledger change.
**Changes:**
- [ ] `js/ui/lens-views.js` — boost control on lens post rows + thread head
  (optimistic toggle: myVote/score update immediately, rollback on rejection with a
  toast — the memory tier's optimistic pattern); guest state keeps a chip pointing
  at sign-in (behavior difference stays ledgered: DL-014 pattern).
- [ ] `ledger/divergence.js` — DL-013: frontier → the shipped write (entry updated,
  not deleted — the ledger records history). A NEW entry records the tier
  difference the write creates if any observable one exists (e.g., a lens boost
  is a real public like on the open network — wording decided at execution;
  invariant 8).
- [ ] `test/lens.test.js` — (Pass 2: named precisely) the chip-ledger integrity
  test at `test/lens.test.js:85-97` pins DL-013's kind and its chip references —
  it goes RED on the ledger change and the SAME commit carries the chip removal +
  the test's new expectation (the same-commit invariant, mechanically held).
**Wiring test:** live validation: test account 1 signs into the lens, boosts a
probe post authored by test account 2 (created + torn down by 4a's script),
observes likeCount/myVote flip both ways, unlikes; teardown verifies no residue.
**Depends on:** 5c; 4a's script (the safe target post).
**Shared-state contract:** ONE live like against our own test account's post,
removed in-run.
**Done when:** (behavioral) boost works signed-in, refuses signed-out with words;
(verification) `npm test && npm run conformance` green + the live observation
recorded; zero residue.
**Validation:** Broad (small surface, real network).

### Phase 6 — Lens polish (TODO.md items)

#### 6a: Comment author links
**Goal:** Lens thread authors link to bsky.app profiles, memory authors keep
`#/u/`.
**Changes:**
- [ ] `js/ui/components.js` — `commentNode` honors a per-node `authorHref` (falls
  back to `#/u/<handle>` — memory behavior byte-identical).
- [ ] `js/substrates/lens.js` — lens thread shapes carry
  `authorHref: https://bsky.app/profile/<handle>`.
- [ ] `test/lens.test.js` — RED first: lens comment shapes carry the href; a
  memory-shaped node without one still renders the local link (both sides).
**Depends on:** none within the phase (orderable after 5d to avoid
lens-views churn).
**Write-set:** the three files.
**Done when:** `npm test` green + browser click-through on a live thread.
**Validation:** Moderate.

#### 6b: Lens pagination + TODO closure
**Goal:** The plumbed cursor becomes a "More" control.
**Changes:**
- [ ] `js/ui/lens-views.js` — `lensFieldView` renders a More button when a cursor
  returns; appends the next page (cursor threading, loading state, error toast).
- [ ] `test/lens-intake.test.js` — RED first: feed with cursor → second call passes
  it; page merge preserves order (fixture-driven).
**Depends on:** 6a (shared file churn ordering).
**Write-set:** the two files.
**Done when:** `npm test` green + a live two-page browse observed.
**Validation:** Moderate.

#### 6c: Docs closure (Pass 2 addition — README overflowed 5d's file cap)
**Goal:** Prose catches up with the shipped writes and polish.
**Changes:**
- [ ] `README.md` — the lens paragraph's "read-only" claim updated (boost is
  live); backend-modes section confirmed against final behavior.
- [ ] `TODO.md` — lens-polish section updated (OAuth remains, now the section's
  only resident); ledgered-items list drops DL-013.
**Depends on:** 5d, 6b.
**Write-set:** the two files.
**Done when:** grep for "read-only" in README/lens copy matches reality; TODO
reflects the plan's closures.
**Validation:** Narrow (prose).

## Sequencing and stop-points

Each phase leaves a shippable state: after 1, the session machinery exists under
test; after 2, the dial is real (scoped hermetic-only); after 3, the live path is
conformance-gated; after 4, scoped mode is live end to end; after 5, the lens has
its first write and DL-013 is history; after 6, the polish debt is paid. Stopping
early strands no invariant: the mode dial without phase 4 simply refuses live entry
with words.

## Open Questions

- [CONFIRMED: RESOLVED 2026-08-24 — SURFACE SWAP] **OQ1 — What does `lens` mode
  mean beyond the existing `#/lens` routes?** User confirmed: a *surface swap* — lens becomes the primary
  surface (default route + masthead emphasis + shared session), the boost write
  routes through the adapter, memory routes stay reachable and memory-backed. NOT a
  store swap: the lens never folds events, and faking events from AppView data would
  fabricate records (refused) or re-create the second data plane the all-atproto
  revision killed. *Blocking because phases 2b/2c and 5 encode the answer.*
- [CONFIRMED: RESOLVED 2026-08-24 — NEITHER PERSISTS] **OQ2 — Session/mode
  persistence across reload.** User confirmed: neither persists — sessions are in-memory (the lens's
  existing posture), reload lands in memory mode; scoped/lens are deliberate,
  re-enterable acts. Persisting an accessJwt to localStorage is a security posture
  change that should wait for the OAuth plan. *Phase-gated: 1b/2b encode it.*
- [CONFIRMED: RESOLVED 2026-08-24 — NO PERSISTENCE, PULL ON ENTRY] **OQ3 — Scoped
  fetched-events persistence.** User confirmed: none — pull-on-entry (3.1s measured for 2 DIDs), store stays
  in-memory for the mode's lifetime, `forage.state` untouched (the no-clobber
  invariant becomes structural). Alternative (a second storage key as a scoped
  cache) deferred until entry cost is felt; the Jetstream tail is the named
  freshness upgrade. *Phase-gated: 1b's storage guard is designed around it.*
- [CONFIRMED: RESOLVED 2026-08-24 — IDENTITY DISPLAY] **OQ4 — Persona switcher in
  scoped mode.** User confirmed: replaced by the signed-in identity (one DID, one seat — switching
  personas against a real repo is meaningless); the dev-bar seat-walk acceptance
  procedure applies to memory mode only, noted in AGENTS.md-adjacent docs if
  needed. Alternative (keep the dropdown as a *read-as* viewer over scoped data)
  is coherent read-side but a write trap. *Phase-gated: 2b builds the control.*
- [CONFIRMED: RESOLVED 2026-08-24 — PER-RUN + TEARDOWN] **OQ5 — Roster provenance
  for live runs.** User confirmed: per-run — 4a's script creates the roster (test account 1 as founding
  DID) and tears it down; a *standing* roster is the owner's deploy act, out of this
  plan (TODO.md keeps the deploy story). Alternative: leave a standing roster in
  the test account as a permanent staging world — convenient but violates the
  clean-up constraint as stated. *Phase-gated: 4a encodes it; also fixes the
  dev-bar default rosterDid (4b).*
- [CONFIRMED: RESOLVED 2026-08-24 — ALL WIRE CAPS] **OQ6 — Scoped mode flips ALL
  wire capabilities at once?** User confirmed: yes — the writer supports the full vocabulary and the fake-PDS
  conformance world proves it wholesale; a narrower first flip (posting/commenting/
  voting) would ledger-fragment the tier for no risk reduction. *Advisory: the
  table literal is trivially editable either way.*
- [CONFIRMED: RESOLVED 2026-08-24 — OWN TEST POST ONLY] **OQ7 — Live-validation
  like target (Phase 5c).** User confirmed: a probe post authored by our own test account 2, liked by test
  account 1, unliked and torn down — no third-party posts are ever engaged.
  *Advisory: safety posture, no design impact.*

## Review Log

### Pass 1: Plan development — 2026-08-24
Grounded firsthand against `main` @ `10a8ade`: read `routing.js`, `atproto.js`
(all 445 lines), `lens.js`, `lens-views.js`, `memory.js`, `store.js`, `storage.js`,
`actions.js`, `devbar.js`, `main.js`, `selectors.js` (viewerCtx/permissions),
`personas.js`, `schema.js`, `conformance/run.js`, `conformance-scoped.test.js`,
`ledger/divergence.js`, `components.js` author-link sites, `package.json`, `sw.js`
cache line, test/scenario/fixture inventories; prior plan + TODO.md in full.
Key findings that shaped the phases: `persist()` fires on every store mutation
(the clobber hazard → 1b's structural guard); `viewerCtx.handle` derives from
personas with a Logged-out fallback (→ 2b's selector fallback + intake identity
synthesis); the 5e conformance world covers the pure codec only (→ phase 3's
fake-PDS world); `shapeLensPost` drops `cid` (→ 5a); session is module-local to
`lens-views.js` (→ extraction implied by OQ1's surface-swap answer); the writer
always passes explicit rkeys, so PDS-minted TIDs arrive only via foreign records
(→ D1 + 4c's TID leg). Three unverified externals pushed to Phase 0 (TID intake
shape, DID→handle unauth endpoint, like round-trip). Seven open questions
surfaced; walk-through pending.

### Open-question walk-through — 2026-08-24
All seven questions walked one at a time; every recommendation confirmed by the
user: OQ1 surface swap (the one BLOCKING item, now resolved — lens mode = primary
surface + shared session + adapter-routed boost, never a store swap), OQ2 neither
mode nor session persists across reload, OQ3 scoped fold is pull-on-entry with no
localStorage persistence (the no-clobber guard is structural), OQ4 scoped mode
shows the signed-in identity in place of the persona switcher (seat-walk stays a
memory-mode instrument), OQ5 roster is per-run with script teardown (the standing
deployment roster remains an owner act on TODO.md), OQ6 scoped flips all wire
capabilities at once (local-only capabilities stay memory), OQ7 the live like
targets only our own test-account probe post. Tally: 7/7 resolved, 0 remaining.
No phase structure changed by the answers (all matched the drafted
recommendations). Pass 1 closed; Pass 2 (gap analysis) next.

### Pass 2: Gap Analysis — 2026-08-24
**Found (verified against the code, file:line):**
- `test/invariants.test.js:50-54` mechanically forbids
  `createRecord|putRecord|deleteRecord` in `lens.js` — the drafted 5a (writes
  inside `lens.js`) would break both the test and the read-only argument behind
  the UI-import exception.
- `scenarios/format.js:60-71`: `replayOnMemory` rides the DEFAULT routing table;
  once 2a makes the default mode-active, browser **Seed in scoped mode would
  replay the whole library through the live writer to a real PDS**. Conformance
  CLI and tests share the path.
- Lens routes are reachable in every mode, so a `MODE_TABLES.lens.voting→lens`
  entry was wrong twice over: memory views in lens mode would break, and the
  boost needs to work in ALL modes. Lens mode's table must stay all-memory; the
  boost resolves through an explicit `LENS_TABLE`.
- OQ1's surface swap had no implementing units: the session is module-local to
  `lens-views.js:12-13`, and nothing touched `main.js`.
- `scoped.enter` never set the viewer: actions attribute writes to
  `store.personaId`, so entering scoped mode must `setPersona(did)` (and leave()
  restores via hydrate).
- `genId`'s per-actor seq can shrink across sessions (retraction deletes reduce
  the decoded event count) — a fresh local id can collide with an already-used
  rkey at the PDS.
- 3b's actor mapping simplified by 5e precedent (`encodeEvents` uses `did =
  ev.actor`): persona ids ARE the fake DIDs; identity synthesis must skip
  already-registered DIDs (shared guard with live intake, pinned by test).
- The chip-ledger integrity test located precisely (`test/lens.test.js:85-97`) —
  it is itself the same-commit enforcement for DL-013's promotion.
**Concurrency:**
- No changes — map confirmed all-sequential; renumbered spine (2d, 5d, 6c added).
**Changed:**
- 2a: `MODE_TABLES.lens` → all-memory; `scenarios/format.js` joins the write-set
  (explicit memory table in `replayOnMemory`) with the Seed-safety tooth in
  `test/adapter.test.js`.
- 2b: Seed/Delete All/Import become memory-mode-only; the `#/signup`-in-scoped
  quirk recorded as accepted.
- New 2c (shared lens session extraction into `lens.js`); old 2c renumbered 2d
  and gains the `main.js` surface swap.
- 1a: rkey re-entry collision risk added (fail-loud posture, candidate fix named,
  measured at 4c before building).
- 1b: `setPersona(did)` on enter / restore on leave, pinned in the round-trip
  test.
- Phase 5 restructured: 5a shapes-only; new 5b `js/substrates/lens-write.js`
  (+SHELL bump); 5c routing/actions; 5d UI + DL-013 + live validation (README
  moved out for the file cap).
- New 6c docs-closure unit (README + TODO).
- Documentation Impact and Reasoning updated to match (lens-write module
  rationale added; invariants/replay/chip-test facts added to Verified
  Assumptions).
**Confirmed:**
- The phase order and hermetic-before-live rhythm held; the no-clobber guard
  design (1b) survived contact with `store.js`'s persist-everywhere reality;
  `devbar.js`/`main.js` sit outside `js/ui/` so the dev bar may legally drive
  routing (verified against the invariant test's scan scope); no action caches a
  substrate (per-call `substrateFor` — mode flips take effect immediately).
**New/revised open questions:** none — the gap analysis resolved into design
corrections, not new user decisions. Pass 2 closed; Pass 3 (quality gates) next
in a fresh context.
