# Plan: three modes — memory, the Bluesky view with a ring dial, and the private BBS

date: 2026-08-25
status: PLANNING — Pass 1+2 done, then USER REDIRECT incorporated (see Review Log);
open-question walk-through pending, then Pass 3 in a fresh context
repo: `CroftCommunity/forage`, local checkout `CroftC/forage`
baseline: `main` @ `10a8ade` (clean tree, pushed; forage.fyi deployed at forage-v11)
prior plan: `plans/2026-08-24-1-plan-behavior-scale-scaffolding.md` (CLOSED — built the
routing seam, the fyi.forage.* codec/intake/writer, and the read-only lens)
planning workflow: `phase-plan` skill. Single plan file.

## Problem Statement

The user's destination, in their words (2026-08-25, paraphrased from the redirect):
three modes. (1) **Memory** — as today, "the canonical design for the adapters" and the
hermetic instrument. (2) **The Bluesky view** — a logged-out view plus a logged-in
"representation of you", with a **ring dial**: you choose how far out your ring goes —
the whole big world, just mutuals, mutuals plus the people they follow — and Fields
stay feed/`/f/`-shaped groups, subreddit-like. (3) **The private BBS** — "the old
school private BBS experience … it's really a private instance, because you choose
even what's readable" — which is what the ATProto Spaces frontier is for; plus
**skins** ("applying a full UI toolkit"), starting with a classic-BBS skin, because a
few skins "really go a long way to harkening back to that era."

Two directional changes from the earlier draft of this plan:
- The **all-public scoped mode** (fyi.forage.* records in public repos, roster
  aperture) is NOT wired into the app now — the small-group experience the user wants
  is *private*, i.e. Spaces. The scoped machinery survives intact as the substrate the
  BBS mode reuses inside a space, and as the conformance world it already is.
- **Proper OAuth login is in scope now** ("I do want to build out the proper OAuth
  login") — the app-password card is out; arecipe is the named in-workspace precedent.

Current gaps against that destination: no mode concept; no OAuth; the lens has no ring
dial, no writes (DL-013), dead author links, no paging; no skinning mechanism; no
Spaces integration (and Spaces is alpha — sandbox PDS, breaking changes).

## Reasoning

- **Modes are named routing tables plus mode-scoped storage** (survives from the
  pre-redirect draft): `MODES = { memory: …, bbs: … }` over the existing
  `substrateFor(capability, table)` seam, and per-mode storage namespaces so the
  memory tier's key (`forage.state`) is untouchable — the plan's core invariant is a
  byte-identical memory round-trip. The Bluesky view is NOT a store mode (lens data
  never enters the fold); it is a read surface with its own session. The BBS mode IS a
  store mode: a fold over space-scoped fyi.forage.* records.
- **OAuth: vendor the official client rather than hand-roll or add a build.**
  arecipe (the named precedent) uses `@atproto/oauth-client-browser` with a served
  `client-metadata.json` (`arecipe/client-metadata.json`: scope
  `atproto transition:generic`, `dpop_bound_access_tokens: true`, redirect to a
  signin page; ~430 lines of glue in `arecipe/src/auth/`). connect hosts metadata but
  its flow is Kotlin — not reusable for web. Forage is no-build/zero-dep by ethos, so:
  bundle `@atproto/oauth-client-browser` ONCE (esbuild, one ESM file) and commit it
  under `vendor/` with a CI drift check (workspace dependency-sourcing rule: "not
  ours: vendor it and add CI drift checks"). Rejected: hand-rolling PAR+DPoP+PKCE
  (WebCrypto ES256 — crypto we'd own forever); adding a build step (changes the
  repo's whole posture for one dependency). Feasibility (bundle size, no-build
  operation, refresh handling) is a Phase 0 probe, not an assumption.
- **The ring dial is aperture over the social graph, computed from probe-verified
  reads.** Rings: `world` (curated/public feeds — today's guest surface),
  `following` (the signed-in timeline), `mutuals` (follows ∩ followers, then a merged
  author-feed board), `mutuals+1` (mutuals plus their follows — capped, with the cap
  stated honestly in the UI; beyond-cap is a named frontier, not silent truncation).
  getFollows/getFollowers/getAuthorFeed/getTimeline are all probe-verified surfaces
  (prior plan; unauth-200 for the graph reads, timeline session-gated). Cost probe in
  Phase 0 sizes the caps with measurements, not guesses (memory rule: measure, don't
  predict).
- **Boost = like ships with OAuth, not before.** The lens write (DL-013) binds to the
  OAuth session so we never ship a write path on the app-password scaffolding we're
  simultaneously removing.
- **Skins are token-sheet swaps, not component forks.** The repo already splits
  `css/tokens.css` (design tokens) from `css/app.css` (components) with `js/theme.js`
  owning light/dark. A skin = an additional stylesheet overriding token values (and
  at most small skin-scoped component overrides), registered in a skin registry,
  persisted, applied across all modes. Classic-BBS first (the point), plus at most
  one more to prove the mechanism generalizes (OQ8). Rejected: a component toolkit
  swap — enormously more surface for the same nostalgia payload; tokens already carry
  the visual identity.
- **The BBS mode is the scoped tier inside a Space.** Same event↔record codec, same
  intake/writer shape, same moderation-as-masking — pointed at permissioned repos in
  one space instead of public repos under a roster. The space's membership IS the
  aperture AND the read gate ("you choose even what's readable"). Built against the
  hosted alpha PDS (`spaces-alpha.host.bsky.net`) with throwaway accounts only,
  clearly labeled experimental in-app: the alpha has breaking changes and sandbox
  resets, so BBS mode ships as a sandbox experience until Spaces GA (OQ7 posture).
  Conformance memory↔bbs should hold via the codec world that already exists.
- **Sequencing: modes foundation → OAuth → ring dial (+likes/polish) → skins → BBS.**
  Foundation first (BBS needs it; it's small and invariant-bearing). OAuth second
  (ring dial's signed-in half and DL-013 depend on it). Skins before BBS so the BBS
  mode launches wearing its skin. BBS last and coarse — it has the largest unknowns
  and a mandatory pre-execution split after its discovery probe, same protocol the
  prior plan used for its network phases.
- **What this plan does NOT do:** wire the all-public scoped mode into the app
  (machinery kept; in-app wiring deferred until wanted); Jetstream; matrix-style
  per-capability `hybrid` rows; Spaces GA hardening (alpha only, by definition).

## Verified Assumptions

Firsthand, current tree (details in the prior plan where noted):

- `js/config/routing.js` — `substrateFor(capability, table = routing)` with override;
  `SUBSTRATES = { memory }`; refusals with words. (Prior plan 3a.)
- `js/substrates/atproto.js` — pure codec (`encodeEvents`/`decodeRecords`), roster
  intake, `createScopedWriter`; live-proven 8/8 on bsky.social with two DIDs; outbound
  rkey = local id. (Prior plan 5c–5f.)
- `js/substrates/lens.js` + `js/ui/lens-views.js` — guest + app-password session
  reads; shapes satisfy the memory shape contract; `myVote` already reads
  `viewer.like`; shapes currently drop `cid`. (Prior plan 6b–6e.)
- `js/store.js` / `js/storage.js` — single dataset, single key `forage.state`
  (`storage.js:5`), `persist`/`hydrate`/`loadEvents`/`reset`; five storage entry
  points all on KEY.
- `css/tokens.css` vs `css/app.css` split; `js/theme.js` light/dark via root class +
  media; no CSP meta in `index.html` (lens fetches already rely on this).
- arecipe OAuth — `client-metadata.json` at app origin (scope
  `atproto transition:generic`, DPoP-bound, redirect `signin.html`), deps
  `@atproto/oauth-client-browser@^0.4.6`, glue in `src/auth/` (~430 lines incl.
  session provider + boot; loopback metadata for local dev per its own comments).
  Read 2026-08-25.
- Spaces alpha — web-sourced 2026-08-25 (atproto.com blog + proposal 0016): alpha
  live; hosted alpha PDS `spaces-alpha.host.bsky.net` open for dev accounts;
  permissioned repo = one account's records within one space on their PDS; published
  SDKs + sample app; explicit "breaking changes / not for production." **Every Spaces
  fact is probe-verified at D5 before phases rely on it.**
- Graph/read surfaces — getFollows/getFollowers/getAuthorFeed unauth-200,
  getTimeline/searchPosts session-gated, `savedFeedsPref` real: probe-verified in the
  prior plan's 6a fixtures.
- Test accounts — `CroftC/.env` (`test_user1/2`), never committed/printed. Spaces
  work uses NEW throwaway accounts on the alpha PDS, not these.
- Gate — `npm test && npm run conformance` (172 + 88 green at baseline); shell
  registry and invariant scans mechanical; `test/invariants.test.js` currently proves
  lens.js has NO write path (changes terms when likes land — scheduled with that
  unit).
- Coordination — `CroftC/.claude/COORDINATION.md` now in force: multi-turn execution
  happens in a worktree (`worktrees/forage/<slug>`), shared main takes doc commits +
  user-asked landings only; this plan file should be committed (doc commit) so it
  cannot be swept by a peer session.

**Not verified** (Phase 0): like-record mechanics + authed `viewer.like` (D1);
describeRepo handle resolution (D2); rkey colon legality (D3); OAuth vendor bundle
feasibility (D4); everything Spaces (D5); ring-dial cost measurements (D6).

## Documentation Impact

- `README.md` — modes paragraph (1c); OAuth sign-in (2c); ring dial + lens writes
  (3d); skins (4b); BBS mode + its alpha caveat (5, at split).
- `TODO.md` — OAuth line closes (2c); DL-013 + lens polish lines close (3d); scoped
  in-app wiring gets an explicit "deferred by redirect" note (1c).
- `ledger/divergence.js` — DL-013 promotion (3c); new ring-dial frontier entries
  (beyond-cap ring truncation) land with their chips (3b); BBS-mode entries at the
  phase-5 split.
- `AGENTS.md` — modes note in sources-of-truth (1c); OAuth session as an identity
  seam (2c).
- `sw.js` SHELL — mechanical via the registry gate; every unit adding runtime modules
  (vendor bundle included) updates it in-unit.
- This plan — Review Log per pass/split; prior-plan cross-reference stays accurate
  (its "Later layers"/tiers wording in README is updated by 1c/5).

## Concurrency Map

```
Sequential spine: Phase 0 → 1a → 1b → 1c → 2a → 2b → 2c → 3a → 3b → 3c → 3d → 4a → 4b → 5(split) → 6
All phases sequential.
```
Reason: single working tree (execution in ONE worktree per COORDINATION.md — the
worktree is the session's lock); recurring files (`routing.js`, `store.js`,
`lens.js`, `lens-views.js`, `devbar.js`, `sw.js`) across phases; each phase's gate
teeth protect the next. Doc-only units declined for parallel dispatch as before.

## Phases

Conventions: ≤3 written files per unit (multi-commit units slice ≤3 per commit); test
RED before production change except declared characterization/config-prose units;
every unit ends gate-green with a commit; execution happens in
`worktrees/forage/modes-bbs` (branch `claude/modes-bbs`), landing on main at
user-approved checkpoints.

### Phase 0: Discovery

- [ ] **D1: Like-record mechanics.** Probe (test_user1, own post): create
  `app.bsky.feed.like` `{subject:{uri,cid},createdAt}`; authed getPostThread/getFeed
  → does `viewer.like` carry the like's at-uri; delete → gone. Fixtures kept
  (`wide-authed-*`, redacted). **Disposition:** keep-as-fixture.
- [ ] **D2: describeRepo handle resolution, unauth.** For both test DIDs; 200+handle
  or documented refusal. **Disposition:** throwaway.
- [ ] **D3: rkey colon legality.** createRecord with explicit rkey containing `:`;
  accept/refuse verbatim (BBS ids embed DIDs). **Disposition:** throwaway.
- [ ] **D4: OAuth vendor feasibility.** One-off esbuild bundle of
  `@atproto/oauth-client-browser` to a single browser ESM; record size; drive
  arecipe-style init + authorize redirect against the test account from a raw
  `python3 -m http.server` page (no build); confirm callback + DPoP-bound fetch +
  refresh work; design the drift check (pinned version + sha256 in a test).
  **Success:** a working no-build sign-in round-trip, or a documented blocker that
  reopens the hand-roll/build-step decision (OQ6). **Disposition:** promote — the
  bundle and glue become phase 2's starting material, TDD applied there.
- [ ] **D5: Spaces alpha recon.** Create TWO throwaway accounts on
  `spaces-alpha.host.bsky.net`; create a space; write `fyi.forage.*` records into the
  permissioned repo; grant membership to account 2; verify account 2 reads, an
  outsider CANNOT (the actual gate — the point of the mode); record the API/SDK
  surface actually used, auth model, and every breaking-change caveat hit.
  **Success:** the gated read/write loop demonstrated end to end, or a precise list
  of what's missing → phase 5 re-scoped at its split. **Disposition:**
  keep-as-fixture (responses; throwaway scripts).
- [ ] **D6: Ring-dial cost measurements.** For the test account: mutuals computation
  (follows ∩ followers, paginated) — count + wall time; merged author-feed board for
  N ∈ {5, 15, 25} members — wall time + request count. Output: the measured cap the
  UI ships with. **Disposition:** throwaway (numbers into VA).

**Done when:** VA carries D1–D6 evidence; OQ6 resolves or escalates; phase 5's split
has its factual basis; all live residue deleted.

### Phase 1 — Modes foundation (survives the redirect intact)

#### 1a: Named mode tables + substrate registration
As pre-redirect draft: `MODES` (now `{ memory, bbs }`), `setMode`/`currentMode`,
`registerSubstrate`, active-table default in `substrateFor`, refusals with words;
`test/modes.test.js` RED-first incl. the stub-substrate wiring test through
`actions.createPost`. **Write-set:** `js/config/routing.js`, `test/modes.test.js`.

#### 1b: Mode lifecycle — the memory tier is untouchable, network modes are RAM-only
SIMPLIFIED by the 2026-08-24 user confirmation (peer plan OQ2/OQ3, imported): network
modes do NOT persist — no second storage key, no session persistence; reload lands in
memory mode; entering a network mode is a deliberate, re-enterable act.
`enterMode`/`exitMode` hold the network dataset in RAM only: while a network mode is
active, persistence to `forage.state` is SUSPENDED (structural no-clobber — the key is
never written outside memory mode); `exitMode` restores the memory dataset from its
untouched key. Seed/Import/Delete-All gated outside memory. **Core invariant test**:
memory round-trip byte-identical + fold deep-equal; a BBS cache key is a named
deferral "until entry cost is felt" (user's words, imported).
**Write-set:** `js/store.js`, `js/storage.js`, `test/store-modes.test.js`.

#### 1c: Mode control + docs
Dev-bar Mode control (memory | bbs | "Bluesky view" as a navigation shortcut to the
lens — labeled a view, not a store mode); Seed/Import disabled outside memory;
persona dropdown pinned while a network mode is active; README modes paragraph;
AGENTS.md line; TODO note recording the scoped-wiring deferral. Browser smoke: mode
round-trip with memory visibly unchanged. **Write-set:** `js/devbar.js`,
`README.md` (+`AGENTS.md`/`TODO.md` — multi-commit, ≤3 per slice).

### Phase 2 — OAuth (the identity seam, arecipe-precedent)

#### 2a: Vendored client + drift check
- [ ] `vendor/atproto-oauth-client-browser.js` — the D4 bundle, committed with a
  header recording package name/version/build command.
- [ ] `test/vendor.test.js` — RED first: pinned sha256 + version string match (the
  drift check both directions: file edited → red; version bumped without re-pin →
  red); module parses/exports the client symbol under `node --test`.
- [ ] `sw.js` — SHELL + bump (registry gate forces it).
**Wiring:** consumed by 2b; this unit proves integrity, not usage.

#### 2b: The session module
- [ ] `js/auth/session.js` — init from vendored client (client-metadata for
  forage.fyi; loopback metadata for localhost dev, arecipe pattern), `signIn(handle)`
  (authorize redirect), callback completion, `currentSession()`, `signOut()`,
  DPoP-bound `fetch` handed to lens/BBS consumers; session events so views re-render.
- [ ] `client-metadata.json` — served at the forage.fyi origin (scope
  `atproto transition:generic`, DPoP-bound, redirect back into the app).
- [ ] `test/auth-session.test.js` — RED first, hermetic: metadata shape pinned
  (client_id/redirects/scope/dpop true); session module state machine over a faked
  client (signed-out → pending → signed-in → signed-out); refusal words when the
  vendor bundle is absent/mismatched.
**Depends on:** 2a, D4.

#### 2c: Sign-in UI + lens/session integration
- [ ] lens (`js/substrates/lens.js` + `js/ui/lens-views.js`) consumes the OAuth
  session (DPoP fetch) instead of the app-password card — the card is DELETED;
  masthead/lens show signed-in identity; sign-out.
- [ ] `README.md`/`TODO.md` — OAuth documented, OAuth TODO line closed.
Live validation (Moderate→Broad): real sign-in round-trip on localhost loopback with
the test account; fields/search/timeline behind the session work. Multi-commit ≤3.

### Phase 3 — The Bluesky view: ring dial, likes, polish

#### 3a: Ring computation
- [ ] `js/substrates/lens.js` — `ringMembers(ring, {session, fetch})`: `mutuals` =
  follows ∩ followers (paginated, D6-measured); `mutuals+1` = mutuals ∪ their follows
  with the D6-derived cap; returns members + honest overflow info.
- [ ] `test/lens-rings.test.js` — RED first over canned graph pages: intersection
  correct incl. pagination boundaries; cap enforced with overflow reported;
  ring='world' bypasses graph entirely.

#### 3b: Ring boards
- [ ] `js/substrates/lens.js` — `ringFeed(ring, …)`: merged author-feed board
  (time-interleaved, cursor-capable) for mutuals/mutuals+1; `following` =
  getTimeline; world = today's sources.
- [ ] `js/ui/lens-views.js` — the dial UI (world | following | mutuals | mutuals+1)
  on the lens home/field surfaces; overflow chip when capped.
- [ ] `ledger/divergence.js` — ring frontier entries (beyond-cap truncation; ring
  criteria beyond follow-graph) land WITH their chips.
**Wiring:** hermetic merged-board tests + the 3d smoke.

#### 3c: Boost = like (DL-013), OAuth-bound
As pre-redirect draft 3a/3b but on the OAuth session: shapes carry `cid`/`likeUri`;
`lens.like/unlike`; invariant-scan narrowing (exactly the like create+delete pair);
boost button optimistic flip; DL-013 → shipped in the same commit. PHASE-GATE: OQ3.

#### 3d: Polish + live validation
Author links → bsky.app profiles; pagination "More"; live smoke: OAuth sign-in →
ring dial through mutuals → boost/unboost on own test post (evidence recorded);
README updated. Multi-commit ≤3.

### Phase 4 — Skins

#### 4a: The mechanism
- [ ] `js/skins.js` + `skins/` registry — a skin = a stylesheet layering over
  `tokens.css` (+ optional skin-scoped extras), applied via a managed `<link>`,
  persisted (device-local pref), composing WITH light/dark where the skin permits;
  `default` skin = today's look, zero behavior change. **Skins and modes are
  independent axes** (user, 2026-08-25): any skin applies in any mode — the BBS skin
  in the Bluesky view is legal, just off-theme; the BBS mode merely DEFAULTS to the
  BBS skin and respects an explicit override.
- [ ] `test/skins.test.js` — RED first: registry shape; every skin file exists and
  only overrides declared token custom properties (static scan — skins cannot
  smuggle component rewrites); default = no-op.
- [ ] Dev-bar/settings skin picker; `sw.js` SHELL for skin files.
Multi-commit ≤3.

#### 4b: The classic BBS skin (+ at most one more, OQ8)
- [ ] `skins/bbs.css` — the era: terminal palette (amber/green on black), monospace
  stack, box-drawing borders, dense rows; readable, not a costume that breaks WCAG
  contrast (tokens carry recorded ratios).
- [ ] second skin per OQ8; README skins section; browser smoke across modes.

### Phase 5 — The private BBS on Spaces (coarse; MANDATORY split after D5)

**Goal:** the private-instance forum: a space is the instance; membership gates read
AND write; inside it, the standing fyi.forage.* forum (codec/intake/writer reused);
BBS skin as the mode's default dress; explicitly labeled sandbox-alpha in-app
(alpha PDS, throwaway identities, breaking changes expected — no production data).
**Shape (finalized at split, on D5 evidence):** space create/join flow; the scoped
substrate pointed at permissioned repos (aperture = space membership instead of
roster); mode `bbs` storage namespace per space; moderation stays masking;
conformance memory↔bbs through the codec world; live rehearsal with two throwaway
alpha accounts (the gated-read proof is the acceptance: an outsider sees NOTHING).
**Depends on:** phases 1–4; D5; OQ7 posture confirmed.
**Imported decisions (2026-08-24 confirmations):** live rehearsals are per-run with
full teardown — a standing space/world is the owner's deploy act, out of plan; the
mode flips ALL wire capabilities at once (no partial tier).
**Risks:** alpha churn (pin every endpoint/SDK fact to D5 evidence; re-probe at
split); sandbox resets (RAM-only posture makes them harmless); auth on the alpha PDS
may differ from mainline OAuth (D5 records it; the split decides the session story).

### Phase 6 — Close-out
Docs truthful everywhere; final cross-mode browser smoke (memory untouched, ring
dial live, a boost, the BBS in its skin); TODO/ledger reconciled; plan close-out.

## Open Questions

- [RESOLVED 2026-08-24 — RAM-ONLY, imported from the peer plan's user-confirmed
  OQ2/OQ3] **OQ1 — network-mode persistence:** none. Sessions and network-mode data
  live in RAM; reload lands in memory mode; a cache key is deferred "until entry
  cost is felt". 1b simplified accordingly.
- [WITHDRAWN by redirect] ~~OQ2 — founder-DID source~~ — the roster connect flow is
  deferred with the scoped in-app wiring; the BBS equivalent (space selection UX) is
  decided at phase 5's split on D5 evidence.
- [CONFIRMED 2026-08-24 — imported from the peer plan's user-confirmed OQ1/OQ7]
  **OQ3 — lens likes ship as real writes**, validated ONLY against a probe post
  authored by our own test account (no third-party posts ever engaged). Gate
  satisfied; 3c inherits the own-post-only validation constraint verbatim.
- [RECOMMENDED: ADVISORY, reframed] **OQ4 — surface primacy + control placement:**
  yesterday's confirmation (peer OQ1) made the lens a *surface swap* — primary
  surface, masthead emphasis — for the pre-redirect scope. Under the redirect: does
  the Bluesky view become forage.fyi's DEFAULT front door (memory demoted to a
  demo/dev mode behind the dial), or does memory stay the front door for now
  (recommended for this plan: memory stays default, dial in the dev bar + a
  masthead entry point; primacy revisited when OAuth lands)?
- [RECOMMENDED: ADVISORY] **OQ5 — lens author links:** external bsky.app profiles
  (recommended) vs in-app author boards.
- [RECOMMENDED: PHASE-GATED (Phase 2)] **OQ6 — OAuth dependency posture:** vendor
  the official `@atproto/oauth-client-browser` bundle with a CI drift check
  (recommended; arecipe precedent + workspace vendoring rule) vs hand-rolled
  PAR/DPoP/PKCE vs introducing a build step. *D4 tests feasibility; the posture is
  yours to confirm before phase 2.*
- [RECOMMENDED: PHASE-GATED (Phase 5)] **OQ7 — BBS ships as a sandbox-alpha
  experience:** built against `spaces-alpha.host.bsky.net` with throwaway
  identities, labeled experimental in-app, caches disposable, GA hardening deferred
  until Spaces stabilizes. *Confirm that posture — it is what "alpha, breaking
  changes, not production" permits.*
- [RECOMMENDED: ADVISORY] **OQ8 — skin lineup:** classic BBS + ONE more (recommended:
  a restrained "usenet gray" to prove the mechanism generalizes) vs BBS-only vs a
  larger set.

## Review Log

### Pass 1: Plan development — 2026-08-25
(As originally drafted: modes foundation, all-public scoped mode in-app, lens likes,
polish. Grounding firsthand from the prior plan's execution.)

### Pass 2: Gap Analysis — 2026-08-25 (combined context)
Found and fixed pre-redirect: `hydrate()` empty-namespace leak named in the 1b test;
Seed/Import gated outside memory; `refresh()` preserving LOCAL_ONLY events; rkey
colon legality unverified → D3; all five storage entry points namespaced; a 4-file
unit re-sliced. Concurrency map confirmed sequential.

### USER REDIRECT — 2026-08-25
At the end-state alignment step the user redirected the destination (their words
paraphrased in the Problem Statement): the small-group experience is the **private
BBS** — "it's really a private instance… you choose even what's readable… we're back
to Spaces" — so the all-public scoped mode is NOT wired into the app now (machinery
kept; deferral noted in TODO); the standard view gains the **ring dial** (world /
mutuals / mutuals+their-follows — "you choose how far out your ring goes"); **skins**
are prioritized ("a few different skins would really go a long way"), classic BBS
first; and **proper OAuth login** is in scope ("we have several examples… go look at
arecipe"). Plan restructured on that direction: phases now modes-foundation → OAuth
(vendored official client, arecipe precedent, D4 feasibility probe) → ring dial +
likes + polish → skins → BBS-on-Spaces (coarse, split after D5 recon against the
alpha PDS) → close. Phase 0 grew D4 (OAuth vendor), D5 (Spaces recon with throwaway
accounts incl. the outsider-cannot-read proof), D6 (ring cost measurements). OQ2
withdrawn; OQ6 (OAuth posture), OQ7 (sandbox-alpha posture), OQ8 (skin lineup)
added. Also recorded: execution will run in `worktrees/forage/modes-bbs` per the
new workspace COORDINATION.md, with main taking user-approved landings.

### Peer-plan reconciliation — 2026-08-25
The workspace audit surfaced `plans/2026-08-24-2-plan-backend-modes.md` — an
UNTRACKED plan by a parallel session on the pre-redirect scope (mode dial, live
scoped session, first lens write), Pass 1+2 complete with **7 open questions
user-confirmed 2026-08-24**. Those confirmations are user signal and are imported
here: (OQ2/OQ3) no persistence for sessions or network-mode data — reload lands in
memory, cache keys deferred → 1b simplified to RAM-only with persistence suspended
outside memory mode; (OQ1) the lens boost write was accepted → this plan's OQ3
gate satisfied; (OQ7) live like-validation targets our own test post only;
(OQ4) persona switcher yields to the signed-in identity (already this plan's
design); (OQ5) per-run + teardown for live worlds, standing worlds are a deploy
act; (OQ6) network modes flip all wire capabilities at once. The peer file itself
is left untouched (uncommitted peer state per COORDINATION.md); its scoped-live
core is superseded by the user's redirect, recorded here. Peers croftc-6d and
croftc-10 messaged; execution will claim `worktrees/forage/modes-bbs`. OQ4
reframed with the surface-swap data point; remaining walk-through: OQ4, OQ5,
OQ6, OQ7, OQ8.
