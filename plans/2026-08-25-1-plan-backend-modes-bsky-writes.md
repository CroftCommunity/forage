# Plan: three modes — memory, the Bluesky view with a ring dial, and the private BBS

date: 2026-08-25
status: EXECUTING — Phase 0 COMPLETE (D1–D10, four user-directed additions);
amendments (3e/3f/3g, tenets) review-passed 2026-08-25; next unit: 1a.
Execution in worktrees/forage/modes-bbs (branch claude/modes-bbs)
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
- **Lean into the lens (design tenet, user 2026-08-25):** Forage is another ANGLE on
  the network — topic-centered where Bluesky is actor-centered — and advertises
  rather than hides that relationship. Concretely: author links go OUT to bsky.app;
  lens surfaces may carry "view on bsky.app" affordances; no faux-native profile
  surfaces for network authors.
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
  aperture AND the read gate ("you choose even what's readable"). [CORRECTED at D5:
  `spaces-alpha.host.bsky.net` does not exist — the hosted alpha PDS URL is
  invite-gated behind the owner's Bluesky dev account. Rehearsals run against a
  LOCAL `ghcr.io/bluesky-social/atproto:pds-spaces-alpha` Docker container with
  throwaway accounts; per-run+teardown = `docker rm` the container+volume.]
  Clearly labeled experimental in-app: the alpha has breaking changes and sandbox
  resets, so BBS mode ships as a sandbox experience until Spaces GA (OQ7 posture).
  Conformance memory↔bbs should hold via the codec world that already exists.
- **Sequencing: modes foundation → OAuth → ring dial (+likes/polish) → skins → BBS.**
  Foundation first (BBS needs it; it's small and invariant-bearing). OAuth second
  (ring dial's signed-in half and DL-013 depend on it). Skins before BBS so the BBS
  mode launches wearing its skin. BBS last and coarse — it has the largest unknowns
  and a mandatory pre-execution split after its discovery probe, same protocol the
  prior plan used for its network phases.
- **Content streams — one abstraction, two keys (user, 2026-08-25):** `/f/` and
  `/h/` are two spellings of the same thing, a content stream: `/f/` keyed by a
  feed/Field, `/h/` keyed by a hashtag. The lens field view generalizes to a
  stream view; trending topics (D8: each resolves to a feed generator) are a
  DISCOVERY RAIL of `/f/`-kind streams, not a third kind. `/h/` is session-gated
  (searchPosts, D8); in memory mode `/h/:tag` maps to the native tag concept via
  a selector, so the route scheme is a platform concept, not a lens hack.
- **Piggy-back principle (user, 2026-08-25: "we should piggy back anywhere we can
  in that way"):** wherever the network already stores a user's state
  account-side, forage READS that state rather than keeping a forage-local copy —
  proven surface (D10): the getPreferences blob (muted words, label filters,
  adult toggle, saved feeds) + graph endpoints (mutes, blocks, list subs). The
  Bluesky view holds NO forage-local moderation or preference state; editing
  happens on the network's own surfaces (lens tenet), with putPreferences-based
  management a registered frontier.
- **Bluesky primitives sorting rule (user-ratified 2026-08-25):** topic-shaped
  primitives (feeds, hashtags, quotes, trending) get first-class stream/thread
  surfaces; person-shaped primitives (profiles, mentions, follows) become
  aperture or link OUT; policy/trust-shaped primitives (labels, mutes, gates,
  verification) are respected and rendered honestly, never re-invented. Lists
  and starter packs are registered frontiers (list-backed Fields), not built now.
- **What this plan does NOT do:** wire the all-public scoped mode into the app
  (machinery kept; in-app wiring deferred until wanted); DMs/chat (separate
  private service, wrong shape for a forum); list-backed Fields + starter packs
  (frontier entries, 3g); matrix-style per-capability `hybrid` rows; Spaces GA
  hardening (alpha only, by definition); **Jetstream v2** — live freshness for
  these streams is a NAMED FOLLOW-UP investigation (user 2026-08-25: "full
  investigation of how best to handle these with the new released jetstream2");
  recorded in TODO.md; prior probes: filtered v1 tail 676ms write→event, v2
  planSnapshot token-gated.

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
- Workspace OAuth prior art — `CroftC/.claude/DECISIONS.md` § Prior-art router,
  grepped 2026-08-25 (Pass 3, resolving D4's survey half at planning time): the
  registry's atproto-OAuth entry lists the lineages; the **official-library path** is
  in production in `arecipe/src/auth/` and `greetings_site/src/auth-core.ts`, with
  "hard-won loopback facts" in `arecipe/spike/d1-oauth/`. The **croft-stack broker**
  (`croft-stack/broker/src/`) is a *confidential* client (RFC 7523 private_key_jwt,
  Rust, server-side) — a different problem than a browser public client; forage
  cannot lean on it for the browser flow (D4 confirms nothing else hosted applies).
  The registry's "the pick is the owner's call" is satisfied: OQ6 WAS that call.
- Settings surface exists — `js/main.js:70` routes `/settings` → `views.settingsView`;
  OQ4's "mode preference in Settings" has a real home. Default route today:
  `js/main.js:107` (`location.hash = '/popular'` when empty) with first-visit
  auto-seed adjacent (`main.js:107-110`) — the phase-3 front-door flip must not
  trigger memory auto-seed from the lens front door (named in 3d).
- Baseline drift check (Pass 3): commits since `10a8ade` are doc/orientation only
  (plan commits + `3d1e463`, `e80b643`, `d488e5e`); no code drift. The `adr/` →
  `docs/adr/` migration the walk-through called out-of-scope has since LANDED
  (`e80b643`: `docs/adr/0001-0002`); D4/ADR references here already point at
  `docs/adr/`. Gate re-verified green at Pass 3: 172 tests, conformance 88/88.

**Phase 0 findings (2026-08-25, all probes firsthand):**

- **D1 like mechanics** — `app.bsky.feed.like {subject:{uri,cid},createdAt}` via
  `com.atproto.repo.createRecord`; authed `getPostThread` → `viewer.like` = the
  like's exact at-uri; `deleteRecord(rkey)` → `viewer.like` absent (other viewer
  fields remain); unauth (public.api.bsky.app) threads carry NO `viewer` but do
  carry `likeCount`. Fixtures `wide-authed-thread-{liked,unliked}.json`. All
  probe residue deleted.
- **D2** — unauth `describeRepo(did)` on bsky.social: 200 + `handle` for both
  test DIDs.
- **D3** — colon rkeys legal: `fyi.forage.probe/post_did:plc:abc123_3xyz`
  created 200 and deleted. Scoped/BBS ids embedding DIDs need no escaping.
- **D4 OAuth vendor** — `@atproto/oauth-client-browser@0.5.3` + 
  `atprotoLoopbackClientMetadata` (from `@atproto/oauth-types`) bundle to ONE
  208KB minified ESM (esbuild 0.28.2; entry re-exports both; content sha256
  `ad8b0860092bdc5072493ee40101ea1378c788ae0665b3d84370d8dc3901f1cd`, recorded in
  the staged file's header). Live loopback round-trip PROVEN with no build step
  (static page + `python3 -m http.server`, Playwright-driven): loopback client_id
  with IP-literal redirect + explicit `atproto transition:generic` scope →
  authorize on bsky.social → callback completed by `client.init()` → session did
  → DPoP `fetchHandler` `getTimeline` 200 → `getTokenInfo(true)` forced refresh →
  **session restored across reload from IndexedDB** → `signOut()` clean. Node
  quirk: bare-importing the bundle under node leaves an open handle (Locks API
  fallback) — 2a's drift test must parse/hash, and any import check needs an
  explicit exit. Artifact staged (uncommitted) at
  `vendor/atproto-oauth-client-browser.js`; 2a commits it drift-test-first.
- **D5 Spaces** — hosted alpha PDS URL is INVITE-GATED (owner's Bluesky dev
  account); `spaces-alpha.host.bsky.net` from Pass 1 web sourcing DOES NOT
  EXIST. Rehearsal rig: local Docker `ghcr.io/bluesky-social/atproto:pds-spaces-alpha`
  (amd64-only → `--platform linux/amd64` on Apple Silicon; needs a volume at
  `/pds` chowned to `node`; PDS v0.5.29; htu in DPoP proofs must name the
  server's CONFIGURED origin, not the mapped port). Full gated loop proven with
  3 throwaway accounts: `simplespace.createSpace {type, policy:
  memberListPolicy, appAccess: open}` → space uri
  `at://<owner>/space/<type>/<tid>`; `space.createRecord {space, repo,
  collection, rkey, record}` accepts `fyi.forage.*` (validate:false) — the
  scoped codec's shape plus one `space` param; `simplespace.addMember/
  listMembers/removeMember {space, did}` (member list is host-internal,
  owner-auth). READS: own-repo `space.listRecords` works with plain session
  auth; CROSS-repo reads require the space-credential dance —
  `space.getDelegationToken` (session auth, own PDS) →
  `space.getSpaceCredential` (Bearer delegation token + DPoP proof; ES256
  WebCrypto; nonce retry) → reads with `Authorization: DPoP <credential>` +
  proof carrying `ath` (b64url sha256 of credential); `space.listRepos`
  enumerates member repos w/ revs; `listRecords` inlines values + cid. THE
  GATE: outsider exchange refused `UserNotAuthorized`; outsider/removed-member
  direct reads `RepoNotFound` (indistinguishable from empty, per lexicon); anon
  401; public `repo.listRecords` shows ZERO space records. Alpha divergence
  hit: `simplespace.getSpace` is owner-only on this build despite the lexicon
  saying member-readable. Full lexicon set lives on atproto branch
  `permissioned-data` (PR #5187): simplespace {createSpace,addMember,
  removeMember,listMembers,getSpace,updateSpace,deleteSpace,checkUserAccess},
  space {createRecord,putRecord,deleteRecord,applyWrites,getRecord,listRecords,
  listRepos,listSpaces,getRepo,getLatestCommit,listBlobs,getBlob,
  getDelegationToken,getSpaceCredential,registerNotify,unregisterNotify,
  notifyWrite,notifySpaceDeleted,listRepoOps}. The `bulletin` sample app
  (github.com/bluesky-social/bulletin) uses a server-side managing app
  (`managingAppPolicy` + webhooks) — NOT needed for forage: `memberListPolicy`
  is PDS-enforced and zero-backend. Consequence for phase 5: the BBS read path
  needs a small DPoP/space-credential module (WebCrypto ES256, ~60 lines —
  distinct from hand-rolling OAuth; the vendored client does not cover space
  credentials). Fixtures `bbs-*.json` (5 files). Teardown complete.
- **D6 ring costs** — mutuals: follows ∩ followers, 1 request per 100 edges per
  side (trivial at test scale, 197ms total). Merged author-feed fan-out
  (parallel, limit 30): N=5 81ms / N=15 105ms / N=25 110–420ms warm; serial
  N=25 ~590ms; ONE cold-start stall of ~20s observed on a first-ever request →
  the board fetch needs per-request timeouts with per-member failure chips.
  **Cap ships at 25** (latency is not the binding constraint; board noise is).

## Documentation Impact

- `README.md` — modes paragraph (1c); OAuth sign-in (2c); front door + ring dial +
  lens writes (3d); quotes-as-continuation ledger proposal (3e); honest-rendering
  note (3f); `/h/` streams + trending rail (3g); skins (4b); BBS mode + its alpha
  caveat (5, at split).
- `TODO.md` — Jetstream v2 stream-freshness investigation added as a named
  follow-up (this session, doc commit); OAuth/DL-013 closures as before.
- `index.html` — if the front-door flip or Settings pref needs head-inline changes
  (theme-flash precedent), 3d owns them; grepped otherwise-unaffected.
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
Sequential spine: Phase 0 → 1a → 1b → 1c → 2a → 2b → 2c → 3a → 3b → 3c → 3e → 3f → 3g → 3d → 4a → 4b → 5(split) → 6
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

### Phase 0: Discovery — ✅ COMPLETE 2026-08-25 (all six tasks; findings below and in VA)

**Findings summary (evidence in Verified Assumptions § Phase 0 findings):**
- **D1 ✅** — like create/delete round-trip proven on our own probe post; authed
  `viewer.like` carries the exact like at-uri, absent after delete; unauth threads
  carry NO `viewer` but do carry `likeCount`. Fixtures:
  `test/fixtures/atproto/wide-authed-thread-{liked,unliked}.json` (redacted).
- **D2 ✅** — unauth `describeRepo` → 200 + handle for both test DIDs.
- **D3 ✅** — colon rkeys LEGAL: `post_did:plc:abc123_3xyz` accepted verbatim
  (created + deleted on bsky.social). BBS ids can embed DIDs unchanged.
- **D4 ✅** — vendored-client path PROVEN end to end with no build step: 208KB
  minified ESM bundle (v0.5.3), loopback sign-in round-trip on `127.0.0.1` via
  Playwright (authorize → callback → DPoP `getTimeline` 200 → forced refresh →
  session SURVIVES reload via IndexedDB → clean sign-out). OQ6's decision stands.
- **D5 ✅** — the WHOLE gated loop demonstrated against a LOCAL
  `pds-spaces-alpha` Docker PDS (the hosted alpha is invite-gated via the
  owner's Bluesky dev account — the local container is the rehearsal rig, and
  per-run+teardown becomes `docker rm`): space create (memberListPolicy) →
  `fyi.forage.*` writes → member grant → cross-repo member read via the
  **space-credential dance** → outsider refused (`UserNotAuthorized` at the
  credential mint; `RepoNotFound` on direct reads; anon 401; ZERO leak through
  the public repo surface) → member removal re-refuses. Fixtures:
  `test/fixtures/atproto/bbs-*.json`. Full protocol facts in VA.
- **D6 ✅** — measured: warm parallel author-feed fan-out 80–420ms for N≤25
  (serial ~590ms); one cold-start stall of ~20s observed → per-request timeouts
  required. **The cap ships at 25.** Mutuals math trivial at test-account scale;
  pagination costs 1 request per 100 edges per side.
- **D10 ✅ (added 2026-08-25, user direction: mirror standard moderation, piggy-back
  on the account)** — the moderation surface is far MORE accessible than "block
  lists only": `app.bsky.actor.getPreferences` (authed, PDS-served) returns the
  SAME preferences blob the official app uses — observed $types on the test
  account: contentLabelPref (per-category show/warn/hide — the content filters
  screen), adultContentPref, savedFeedsPrefV2, interestsPref, personalDetailsPref,
  bskyAppStatePref, declaredAgePref. `putPreferences` round-trip PROVEN on our own
  test account: wrote a `mutedWordsPref` item
  `{value, targets:['content','tag'], actorTarget:'all'}` (the muted-words dialog
  maps 1:1 — text&tags vs tags-only = targets; "exclude users you follow" =
  actorTarget; duration = expiry field), read it back verbatim, restored the
  original prefs exactly. Graph endpoints all authed-200: getBlocks, getMutes
  (test account has 2), getListMutes, getListBlocks; `app.bsky.graph.block`
  records are additionally PUBLIC repo records. So: muted words/tags, label
  filters, adult-content toggle, mutes, blocks, mod-list subscriptions — ALL
  readable via the account with a session; nothing needs forage-local storage.
  Interaction defaults (who-can-reply/allow-quotes) and hide-verification-badges
  are further pref $types not present on this account (never set) — same blob,
  confirm shape when first encountered. Fixture `wide-preferences.json` (redacted).
- **D8 ✅ (added 2026-08-25, user direction: trending in, /h/ streams)** —
  `app.bsky.unspecced.getTrendingTopics` AND `getTrends` are UNAUTH-200. Each
  trending topic's `link` resolves to a FEED GENERATOR (`/profile/<did>/feed/<id>`)
  — trending is a source of feed streams, not a third stream kind. `getTrends`
  adds postCount, status (saturating/cooling), category, startedAt, actor
  profiles. Both are `unspecced` (may break without notice — ledger entry +
  graceful degradation required). Hashtag search re-confirmed: `searchPosts`
  403 unauth / 200 authed with `tag=` param + hitsTotal → `/h/:tag` is a
  signed-in surface. Fixtures `wide-getTrendingTopics.json`, `wide-getTrends.json`.
- **D9 ✅ (added 2026-08-25, user direction: represent verification)** — post
  author views in EVERY feed/thread payload already carry `verification`:
  `{verifications[], verifiedStatus: 'valid'|'none', trustedVerifierStatus:
  'valid'|'none'}` (e.g. npr.org verified-by-Bluesky; bsky.app itself is
  trustedVerifier). Rendering checkmarks costs zero extra requests. Author
  views also carry `labels` (saw `!no-unauthenticated`) — the masking layer's
  input is already in hand. Fixture `wide-author-verification.json`.
- **D7 ✅ (added 2026-08-25, user direction: quotes are thread continuation)** —
  `app.bsky.feed.getQuotes` is UNAUTH-public (200 on public appview), cursored,
  returns full post views whose `embed` is `app.bsky.embed.record#view` with the
  quoted original's uri + text inlined; thread post views carry `quoteCount`
  alongside `replyCount`; a quote post in any feed renders its quoted context
  for free. Fixtures `wide-quotes.json`, `wide-quote-post-view.json` (redacted).
  Probe posts (own accounts, both sides) deleted.

Original task specs (all executed as written):

- [x] **D1: Like-record mechanics.** Probe (test_user1, own post): create
  `app.bsky.feed.like` `{subject:{uri,cid},createdAt}`; authed getPostThread/getFeed
  → does `viewer.like` carry the like's at-uri; delete → gone. Fixtures kept
  (`wide-authed-*`, redacted). **Disposition:** keep-as-fixture.
- [x] **D2: describeRepo handle resolution, unauth.** For both test DIDs; 200+handle
  or documented refusal. **Disposition:** throwaway.
- [x] **D3: rkey colon legality.** createRecord with explicit rkey containing `:`;
  accept/refuse verbatim (BBS ids embed DIDs). **Disposition:** throwaway.
- [x] **D4: OAuth vendor feasibility.** The survey half was RESOLVED during Pass 3
  (see Verified Assumptions): DECISIONS.md grepped — official-library lineage is
  arecipe + greetings_site; the croft-stack broker is a confidential server-side
  client and does not apply. What remains: read arecipe `src/auth/` glue end to end
  plus `arecipe/spike/d1-oauth/` (loopback facts) and skim
  `greetings_site/src/auth-core.ts` (patterns: loopback vs prod metadata, session
  provider, callback page). THEN the one-off esbuild bundle of
  `@atproto/oauth-client-browser` to a single browser ESM; record size; drive
  arecipe-style init + authorize redirect against the test account from a raw
  `python3 -m http.server` page (no build); confirm callback + DPoP-bound fetch +
  refresh work; design the drift check (pinned version + sha256 in a test).
  **Success:** a working no-build sign-in round-trip, or a documented blocker that
  reopens the hand-roll/build-step decision (OQ6). **Disposition:** promote — the
  bundle and glue become phase 2's starting material, TDD applied there.
- [x] **D5: Spaces alpha recon.** Create TWO throwaway accounts on
  `spaces-alpha.host.bsky.net`; create a space; write `fyi.forage.*` records into the
  permissioned repo; grant membership to account 2; verify account 2 reads, an
  outsider CANNOT (the actual gate — the point of the mode); record the API/SDK
  surface actually used, auth model, and every breaking-change caveat hit.
  **Success:** the gated read/write loop demonstrated end to end, or a precise list
  of what's missing → phase 5 re-scoped at its split. **Disposition:**
  keep-as-fixture (responses; throwaway scripts).
- [x] **D10: Moderation-surface accessibility** (added on user direction, executed
  2026-08-25; one reversible prefs write on our own test account, restored
  exactly). getPreferences/putPreferences + graph moderation endpoints.
  **Disposition:** keep-as-fixture.
- [x] **D8: Trending + hashtag-search surfaces** (added on user direction, executed
  2026-08-25, read-only). getTrendingTopics/getTrends unauth status + shapes;
  searchPosts tag gate re-check. **Disposition:** keep-as-fixture.
- [x] **D9: Verification shape** (added on user direction, executed 2026-08-25,
  read-only). Author-view `verification` in feed payloads; labels availability.
  **Disposition:** keep-as-fixture.
- [x] **D7: Quote-post mechanics** (added post-Phase-0 on user direction, executed
  2026-08-25). Probe (own test accounts): original post (user1) + quote post via
  `app.bsky.embed.record` (user2) + plain reply (user2); `getQuotes` unauth +
  authed; thread `quoteCount`; quote-post feed view embed shape; delete all.
  **Success:** the read surface for quotes-as-continuation confirmed (unauth
  status, pagination, embedded-view shape). **Disposition:** keep-as-fixture.
- [x] **D6: Ring-dial cost measurements.** For the test account: mutuals computation
  (follows ∩ followers, paginated) — count + wall time; merged author-feed board for
  N ∈ {5, 15, 25} members — wall time + request count. Output: the measured cap the
  UI ships with. **Disposition:** throwaway (numbers into VA).

**Done when:** VA carries D1–D10 evidence; OQ6 resolves or escalates; phase 5's
split has its factual basis; all live residue deleted. (Met 2026-08-25, incl. the
four user-directed additions D7–D10.)

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
**Boundary cases (mutation resistance):** `persist()` invoked WHILE a network mode is
active leaves `forage.state` byte-identical (the suspension is structural, not
best-effort); the raw key value is captured before `enterMode` and compared verbatim
at three points — during the network mode, after a network-mode dispatch, and after
`exitMode`; `exitMode` without a prior `enterMode` refuses with words.
**Wiring test:** with a network mode active, `actions.createPost` dispatches into the
RAM dataset (event visible via selectors) AND `localStorage['forage.state']` is
byte-unchanged — the entry-point path, not a storage unit test alone.
**Observability:** mode transitions announce themselves (`console.info` with
mode name; the dev-bar badge in 1c is the visible surface) — "why didn't my post
persist" must be answerable from the console alone.
**Write-set:** `js/store.js`, `js/storage.js`, `test/store-modes.test.js`.

#### 1c: Mode control + docs
Dev-bar Mode control (memory | bbs | "Bluesky view" as a navigation shortcut to the
lens — labeled a view, not a store mode). Per OQ4 this control is scaffolding: the
canonical mode preference lands in Settings at 3d; the dev bar remains a mirror.
Seed/Import disabled outside memory;
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
- [ ] Tests FIRST: `test/lens.test.js` session-dependent cases re-pointed RED at the
  OAuth session shape (`js/auth/session.js` fake) before any lens change; a RED
  assertion that no app-password path remains (grep-style scan for the old
  `signIn(identifier, password)` shape in lens.js/lens-views.js).
- [ ] lens (`js/substrates/lens.js` + `js/ui/lens-views.js`) consumes the OAuth
  session (DPoP fetch) instead of the app-password card — the card is DELETED;
  masthead/lens show signed-in identity; sign-out. Session errors and expiry
  surface with words in the existing lens error states (no silent signed-out flips).
- [ ] `README.md`/`TODO.md` — OAuth documented, OAuth TODO line closed.
Live validation (Moderate→Broad): real sign-in round-trip on localhost loopback with
the test account; fields/search/timeline behind the session work. Multi-commit ≤3.

### Phase 3 — The Bluesky view: ring dial, likes, quotes, honesty, streams, polish

**Execution order (amendment review 2026-08-25): 3a → 3b → 3c → 3e → 3f → 3g → 3d.**
3d is the phase capstone — it carries the front-door flip and the ONE live smoke
that validates everything the phase built (rings, boost, a quoted thread, masking,
a hashtag stream, the trending rail). Unit numbering is historical; the spine above
is the order. 3e/3f/3g's "the 3d smoke extends" lines mean the capstone smoke
covers them, not that 3d has already run.

#### 3a: Ring computation
- [ ] `js/substrates/lens.js` — `ringMembers(ring, {session, fetch})`: `mutuals` =
  follows ∩ followers (paginated, D6-measured); `mutuals+1` = mutuals ∪ their follows
  with the D6-derived cap; returns members + honest overflow info.
- [ ] `test/lens-rings.test.js` — RED first over canned graph pages: intersection
  correct incl. pagination boundaries; cap enforced with overflow reported;
  ring='world' bypasses graph entirely. **Boundary cases (mutation resistance):**
  empty intersection (follows and followers disjoint) → empty ring, no fetch of
  boards; intersection spanning a page boundary (member on page 2 of one side);
  cap edges at exactly cap−1 / cap / cap+1 members (overflow reported only at
  cap+1, with the true count); a member appearing in both mutuals and their-follows
  counted once.

#### 3b: Ring boards
- [ ] `js/substrates/lens.js` — `ringFeed(ring, …)`: merged author-feed board
  (time-interleaved, cursor-capable) for mutuals/mutuals+1; `following` =
  getTimeline; world = today's sources.
- [ ] `js/ui/lens-views.js` — the dial UI (world | following | mutuals | mutuals+1)
  on the lens home/field surfaces; overflow chip when capped.
- [ ] `ledger/divergence.js` — ring frontier entries (beyond-cap truncation; ring
  criteria beyond follow-graph) land WITH their chips.
**Wiring:** hermetic merged-board tests + the 3d smoke. Merged-board boundary
cases named RED: timestamp ties keep a deterministic order (author-DID
tiebreak, pinned); one member's feed exhausted mid-merge; cursor round-trip
resumes without duplicates.

#### 3c: Boost = like (DL-013), OAuth-bound
Self-contained (the pre-redirect draft text no longer exists in this doc): lens
shapes gain `cid` + `likeUri`; `lens.like(uri,cid)` creates `app.bsky.feed.like`
via the OAuth DPoP fetch and `lens.unlike(likeUri)` deletes it (record shapes per
D1 evidence); the boost button flips optimistically and reconciles on response.
Tests RED first in `test/lens.test.js` (or a `lens-writes` file): create sends the
D1-pinned record shape; unlike deletes the exact rkey; failure restores the
pre-flip count with words. `test/invariants.test.js` — the lens no-write-path
proof changes terms in the SAME commit: the exception is exactly the like
create+delete pair (any other write through lens.js stays red). DL-013 → shipped,
same commit. PHASE-GATE: OQ3 (own-test-post-only live validation, confirmed).

#### 3d: Polish, the front door, and live validation
- [ ] OQ4 consequences land HERE (scheduled, not just recorded in the OQ):
  `js/main.js` empty-hash default flips `#/popular` → `#/lens` (the unauth Bluesky
  view is the front door); the Settings view gains the mode/front-door preference
  (device-local key, `js/theme.js` precedent — its own key, never `forage.state`);
  the 1c dev-bar control is formally the mirror from here on. **Named check:** the
  first-visit auto-seed (`main.js:107-110`) must NOT fire from the lens front door —
  seeding remains a memory-mode entry event; a test pins that arriving at `#/lens`
  with empty storage writes nothing to `forage.state`.
- [ ] Author links → bsky.app profiles; pagination "More".
- [ ] Live smoke (Broad, the phase capstone — runs AFTER 3e/3f/3g): OAuth sign-in →
  ring dial through mutuals → boost/unboost on own test post → open a thread with
  a known quote (own pair) → verified author + facet links visible → a muted word
  set on the account masks in the board → trending rail opens a topic → hashtag
  board opens signed-in (evidence recorded); README updated (front door + modes +
  ring + streams).
Multi-commit ≤3.

#### 3e: Quotes as thread continuation (added 2026-08-25, user direction; D7-grounded)
The user's observation: on Bluesky people respond by replying AND by quoting, and a
topic-centered lens should present BOTH as the thread's continuation (the network's
actor-centered view scatters quotes onto the quoter's profile). Also the BBS idiom.
- [ ] `js/substrates/lens.js` — thread shape gains quote-responses: fetch
  `getQuotes(uri)` (unauth-public per D7) alongside the thread; each quote node is
  a continuation entry marked `kind: 'quote'` (replies are `kind: 'reply'`),
  time-interleaved with replies; carries the quote's own uri so it opens as its
  own thread. Inbound: any post whose `embed` is `record#view` renders quoted
  context (uri + excerpt) — free per D7.
- [ ] `js/ui/lens-views.js` — thread view renders one continuation with distinct
  markers (↳ reply / ❝ quote); quoted-context block on quote posts links to the
  original's thread; "N quotes" from `quoteCount` when the fetch fails (chip).
- [ ] `test/lens.test.js` — RED first over canned thread+quotes pages:
  interleave is time-ordered across kinds (tie → deterministic); a quote node
  opens as its own thread root; `getQuotes` failure degrades to the count chip
  with words, replies still render; **detached quotes**: a quote absent from
  `getQuotes` (author detached it via postgate) simply doesn't appear — we render
  exactly what the appview returns, never re-derive from search.
- [ ] `ledger/divergence.js` — proposal entry: quote-respond as a first-class
  schema event (the BBS/memory tiers have replies only; invariant 8 — wide-tier
  behavior carries a proposal before it renders); lands with the 3e commit.
**Wiring:** hermetic thread tests + the 3d live smoke extends to open a thread with
a known quote (own test post pair). Multi-commit ≤3.

#### 3f: Honest rendering — the account's own moderation posture, mirrored
(Added 2026-08-25, user-ratified tier 1 + verification; EXPANDED same day on user
direction: "mirror the standard moderation controls … piggy back anywhere we can".)
Correctness, not features: a lens that drops these misrepresents the network.
**Piggy-back principle (D10-proven):** forage stores NO moderation state of its
own for the Bluesky view — the entire posture derives from the account via
`getPreferences` (muted words/tags with targets+actorTarget+expiry; per-category
label filters show/warn/hide; adult-content toggle) plus the graph endpoints
(mutes, blocks, list-mutes/blocks). One fetch per session; the same settings the
official app reads, so a word muted on bsky.app is muted here with no forage UI.
- [ ] `js/substrates/lens.js` — shapes carry `facets` (mention/link/tag spans),
  author `labels`, author `verification` (D9: already in every payload); a
  session-scoped moderation posture (from getPreferences + getMutes/getBlocks/
  getListMutes/getListBlocks, D10) is applied IN THE SHAPE LAYER as masking
  (policy in selectors/substrate, never components): muted words/tags filter
  stream/thread shapes (honoring targets, actorTarget, expiry), label prefs map
  to the show/warn/hide masking states, muted/blocked authors mask.
- [ ] `js/ui/lens-views.js` — post text renders facet-aware (links live, mentions
  link OUT per the tenet, `#tags` become `/h/` links once 3g lands — until then
  plain emphasized); label-bearing content renders through the existing masking
  affordances (hide/warn chips); verified authors get the checkmark
  (`verifiedStatus === 'valid'`), trusted verifiers a distinct mark — display
  only, never a gate.
- [ ] A read-only **Moderation panel** in the lens settings surface: shows the
  account's current posture (muted words count, filter levels, mutes/blocks
  counts) with **edit-on-bsky.app links** — the lens tenet applied to settings:
  we mirror and respect; the network's own surface manages. (Managing posture
  FROM forage via putPreferences — round-trip proven at D10 — is a registered
  frontier, not built now.)
- [ ] `test/lens.test.js` — RED first over fixture payloads: facet spans map to
  byte-correct offsets (facets are BYTE-indexed, not UTF-16 — the boundary
  case: a post with an emoji before the tag); muted WORD in post text masks
  (and does NOT when actorTarget excludes follows and the author is followed;
  and does NOT past expiry); muted TAG masks under targets:['tag'] but plain
  text mention of the word does not; label prefs map show/warn/hide including
  the adult-content master toggle OFF forcing hide; a muted author's posts are
  masked in board shapes; a blocked author never renders; verification states
  render for valid/none/trusted-verifier. Fixture-driven (D8/D9/D10 files).
- [ ] `ledger/divergence.js` — divergence entry WITH its chip: the wide tier's
  moderation posture is ACCOUNT-derived (preferences + graph) while the memory
  tier's is event-derived (local mod events) — same masking semantics, different
  source of authority; recorded so conformance tolerates it with a reason.
- [ ] Hide-verification-badges: when the preferences blob carries the
  verification pref (unseen on the test account, D10 — pin its `$type` shape on
  first encounter), checkmarks are suppressed accordingly.
**Wiring test (hermetic):** a fixture feed containing a muted-word post, a
muted-author post, and a labeled post flows through the lens entry (home/stream
shape) and the masked items are absent/warn-wrapped in the SHAPE — proving the
posture is applied on the live path, not only in unit-tested helpers. Plus the
3d capstone smoke visually confirms a verified author and a facet-linked post.
**Write-set:** `js/substrates/lens.js`, `js/ui/lens-views.js`,
`test/lens.test.js`, `ledger/divergence.js` (multi-commit, ≤3 per slice).
**bsky.app link targets:** the Moderation panel's edit links point at the official
app's moderation pages; exact client routes are verified at implementation time
(they are SPA routes — assert them then, not now). Multi-commit ≤3.

#### 3g: Content streams — /h/ hashtag boards + the trending rail
(Added 2026-08-25, user direction: "/f for feed/field and /h for hashtag … treat
them as content streams either way"; trending promoted IN.)
- [ ] `js/substrates/lens.js` — the field/board fetch generalizes to
  `stream({kind: 'feed'|'hashtag', key, session})`: `feed` = today's sources +
  any feed-generator at-uri (which is what trending links resolve to, D8);
  `hashtag` = searchPosts `tag=` (session-gated — guests refuse with words +
  sign-in affordance); `trending()` = getTrendingTopics (unauth) mapped to
  feed-stream descriptors.
- [ ] `js/main.js` + `js/ui/lens-views.js` — route `#/h/:tag` (Bluesky view) →
  hashtag stream view (same stream component as `/f/`); trending rail on the
  lens home (each topic opens its feed stream); `#/h/:tag` in MEMORY mode → a
  selector-backed native tag stream (posts across fields carrying the tag) so
  the route scheme is mode-symmetric.
- [ ] `ledger/divergence.js` — entries land WITH their chips: trending rides an
  `unspecced` API (degrades to absent-with-words when it breaks); `/h/` is
  session-gated at the wide tier while memory `/h/` is open (tier divergence);
  frontier entries for list-backed Fields and starter packs (registered, not
  built — same commit as this deferral per invariant 7).
- [ ] `test/` — RED first: stream dispatch by kind (unknown kind refuses with
  words); hashtag stream refuses without a session; trending mapper turns D8
  fixture topics into feed descriptors (link parsing boundary: the at-uri is
  derived from the `/profile/<did>/feed/<rkey>` link shape); memory tag
  selector returns cross-field tagged posts (empty tag → empty, not crash).
**Depends on:** 2b (hashtag streams need the session); 3f (facet tags become the
/h/ doorways); trending rail itself is unauth (D8).
**Wiring:** `#/h/:tag` reachable from a rendered facet tag (3f) and from the
trending rail; the 3d capstone smoke covers: open a trending topic, open a
hashtag board signed-in. Multi-commit ≤3.

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
  smuggle component rewrites); default = no-op. **Negative case named:** a fixture
  skin containing a component-selector rule (e.g. `.card { display:none }`) turns
  the scan red — the scan is proven to bite, not just to pass on well-behaved
  input. Skin preference persists under its own key (`forage.skin`, `js/theme.js`
  precedent), never `forage.state`.
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
**D5 inputs to the split (2026-08-25):** rehearsal rig is the LOCAL Docker alpha PDS
(hosted URL is owner-invite-gated — if the owner supplies an invite, the same loop
re-runs there); `memberListPolicy` + `appAccess: open` is the zero-backend shape (no
managing app); writes are the scoped codec's shape + a `space` param; cross-repo
reads need a small DPoP/space-credential module (WebCrypto ES256 — the split scopes
it; NOT covered by the vendored OAuth client); own-repo reads work with plain
session auth; `getSpace` is owner-only on this build (lexicon divergence — the
member UI cannot rely on it); refusals are `UserNotAuthorized` (credential mint),
`RepoNotFound` (reads — deliberately ambiguous), 401 (anon).

### Phase 6 — Close-out
Docs truthful everywhere; final cross-mode browser smoke (memory untouched, ring
dial live, a boost, a quote-continued thread, account-posture masking, a hashtag
stream + trending rail, the BBS in its skin); TODO/ledger reconciled; plan
close-out.

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
- [RESOLVED 2026-08-25 — FRONT DOOR = UNAUTH BLUESKY VIEW; MODE IS A SETTING]
  **OQ4 — surface primacy + control placement:** user decision in the walk-through:
  the unauthenticated Bluesky view becomes forage.fyi's front door (default route);
  mode selection is a **device-local setting in the user profile/settings surface**
  ("it's local to them") — a `/memory` route was considered and rejected by the
  user. The dev bar may mirror the control as scaffolding, but Settings is
  canonical. Consequences: `js/main.js` default route flips in phase 3; the
  settings view gains the mode preference; 1c's dev-bar control is demoted to a
  mirror. Persistence reconciliation: the 2026-08-24 no-persistence ruling covered
  sessions and fetched data; the mode PREFERENCE is a persisted local setting, and
  OAuth sessions persist properly via the official client (that is what "wait for
  the OAuth plan" deferred to). Network-mode event data stays RAM-only.
- [RESOLVED 2026-08-25 — EXTERNAL, AND LEAN INTO THE LENS] **OQ5 — author links:**
  external bsky.app profiles. Elevated by the user to a DESIGN TENET during the
  walk-through: Forage deliberately leans into being a lens — a topic-centered
  presentation of conversations (Fields/feeds) versus the network's actor-centered
  one — and never hides that Bluesky is underneath; link out to the network's own
  surfaces wherever they are the better home (profiles first). Applies across
  phase 3; recorded in Reasoning.
- [RESOLVED 2026-08-25 — VENDOR THE OFFICIAL CLIENT; SURVEY THE WORKSPACE FIRST]
  **OQ6 — OAuth posture:** use the official client, vendored with a drift check;
  never hand-roll ("no, don't create your own — look at what's being done"). The
  user named TWO in-workspace precedents to study in D4 before phase 2 designs:
  arecipe's browser-client glue (read 2026-08-25) and **croft-stack's own OAuth
  broker** (not yet examined — D4 now includes reading it: if the workspace runs a
  broker one layer up, forage may borrow hosted pieces, e.g. metadata or token
  services, instead of reinventing them).
- [CONFIRMED 2026-08-25] **OQ7 — BBS ships as a sandbox-alpha experience:** user
  confirmed ("totally comfortable") — built against `spaces-alpha.host.bsky.net`
  with throwaway identities, labeled experimental in-app, boards treated as
  ephemeral (sandbox resets painless under the RAM-only posture), GA hardening a
  named follow-up plan when Spaces stabilizes.
- [ACCEPTED AS RECOMMENDED 2026-08-25] **OQ8 — skin lineup:** classic BBS + one
  restrained second skin ("usenet gray"-style) to prove the mechanism generalizes;
  more skins are cheap follow-ups once the mechanism exists. (Accepted via
  "keep going" — user may override before phase 4.)

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

### Walk-through complete — 2026-08-25
OQ4 resolved (unauth Bluesky view = the front door; mode is a device-local Settings
preference; `/memory` route rejected); OQ5 resolved (external bsky.app author links,
elevated to the lean-into-the-lens design tenet); OQ6 resolved (vendor the official
client; D4 surveys DECISIONS.md + arecipe + the croft-stack broker; never hand-roll);
OQ7 confirmed (sandbox-alpha BBS posture); OQ8 accepted as recommended (BBS + one
tame second skin). With the earlier imports: OQ1 resolved (RAM-only), OQ2 withdrawn,
OQ3 confirmed (real likes, own-test-post validation). Tally: 8 questions — 6
resolved, 1 confirmed, 1 withdrawn; none open. Workspace-norms updates folded in:
D4 consults `CroftC/.claude/DECISIONS.md` first; future ADRs go to `docs/adr/`
(NNNN-slug.md, registered in DECISIONS.md — the prior plan's `adr/` files predate
the convention; migration is out of scope here); a claim file in
`CroftC/.coordination/claims/` precedes any push/landing on forage `main`
(Pages deploy follows it); execution runs in `worktrees/forage/modes-bbs`.
Pass 3 next, fresh context.

### Pass 3: Quality Gates — 2026-08-25 (fresh context)
**TDD ordering:**
- 2c gained an explicit tests-FIRST item (lens tests re-pointed at the OAuth
  session shape + a no-app-password-path scan, RED before the card is deleted).
- 3c rewritten self-contained — its "as pre-redirect draft 3a/3b" reference dangled
  (that text no longer exists in this doc); named RED tests now inline, including
  the invariant-scan term change in the SAME commit as the write path.
- 1b gained a named wiring test (`actions.createPost` while a network mode is
  active → RAM dataset gains the event, `forage.state` byte-unchanged).
**Mutation resistance (boundaries named):**
- 1b: persist-during-network-mode no-op; key compared verbatim at three points;
  exitMode-without-enter refuses. 3a: empty intersection, page-boundary member,
  cap−1/cap/cap+1 edges, double-membership dedup. 3b: timestamp ties (pinned
  tiebreak), exhausted feed mid-merge, cursor resume without duplicates. 4a: a
  misbehaving fixture skin proves the static scan bites (negative case).
**Observability:**
- 1b: mode transitions announce via `console.info` + the dev-bar badge — "why
  didn't my post persist" answerable from the console. 2c: session errors/expiry
  surface with words in existing lens error states.
**Debugging readiness:**
- Unchanged and adequate: commit-per-unit with gate green, Phase 0 report
  checkpoint, mandatory phase-5 split checkpoint, worktree isolation.
**Validation calibration:**
- Per-phase strategies confirmed calibrated (hermetic for pure units; live
  loopback round-trip for 2c; live smoke for 3d; live rehearsal at 5). Phase 0
  dispositions all declared. **Resolve-now applied:** D4's survey half was pure
  reading and was resolved DURING Pass 3 — DECISIONS.md grepped (official-library
  lineage = arecipe + greetings_site; croft-stack broker is a confidential RFC 7523
  server-side client, not reusable for a browser public client; the registry's
  "owner's call" requirement is satisfied by OQ6). D4 slimmed to the arecipe/
  greetings_site read + the esbuild bundle probe. D1/D2/D3/D5/D6 stay in Phase 0
  (live probes needing credentials/accounts).
**Concurrency honesty:**
- Map confirmed; sequential plan (single worktree is the session's lock; recurring
  files across phases). No missed parallel candidates worth the coordination cost.
**Coherence:**
- OQ4's consequences were recorded in the OQ but scheduled nowhere — now first-class
  3d items (front-door flip, Settings mode preference, dev-bar demoted to mirror),
  with a named check that the first-visit auto-seed cannot fire from the lens front
  door. 1c cross-references the demotion. Settings surface verified real
  (`js/main.js:70`).
- Baseline drift checked: only doc/orientation commits since `10a8ade`; the `adr/`
  → `docs/adr/` migration has since landed (`e80b643`), so the walk-through's
  "migration out of scope" note is moot. Gate re-verified: 172 tests + conformance
  88/88 green.
**Documentation impact:**
- All entries map to owning phases; 3d's README line widened to cover the front
  door; `index.html` added as a checked candidate for 3d. No trailing docs phase
  (phase 6 is reconciliation, not first-writing).
**Confirmed ready:** yes — no open questions (8 settled: 6 resolved, 1 confirmed,
1 withdrawn). Execution next: `worktrees/forage/modes-bbs`, Phase 0 first under the
Discovery Exemption; phase 5 must split after D5 before any phase-5 implementation.

### Phase 0 executed — 2026-08-25
All six discovery tasks completed in one session under the Discovery Exemption
(findings inline at Phase 0 and in VA § Phase 0 findings). Highlights: D4's live
no-build OAuth round-trip succeeded first try on the arecipe facts (IP-literal
redirect, explicit scope); D5 disproved the Pass-1 web-sourced hostname
(`spaces-alpha.host.bsky.net` does not exist — hosted alpha is invite-gated), so
the rehearsal rig became a LOCAL `pds-spaces-alpha` Docker container, where the
full member-gated loop (create → write → grant → credential-dance read → outsider
refused → removal re-refuses, zero public leak) was proven and torn down; D6 fixed
the ring cap at 25 with measurements and surfaced the cold-start stall that
mandates per-request timeouts. Dispositions honored: D2/D3/D6 spikes discarded
(scratchpad); D1/D5 responses kept as fixtures (`test/fixtures/atproto/
wide-authed-thread-*.json`, `bbs-*.json` — no tokens/emails in any of them);
D4's bundle staged NON-PRODUCTION at `vendor/atproto-oauth-client-browser.js`
(header records package version, build command, content sha256) for phase 2a to
commit drift-test-first. Live residue: bsky.social probe post/like/D3 record
deleted, OAuth session signed out, Docker container+volume removed. Plan changes:
Reasoning's hosted-PDS sentence corrected; phase 5 gained "D5 inputs to the
split"; no phase restructuring required — the phase-5 split (mandatory, after
user review of these findings) now has its factual basis.

### D7 + 3e added — 2026-08-25 (user direction: quotes are thread continuation)
User observation mid-execution: Bluesky conversations continue through BOTH replies
and quote posts; a topic-centered lens should present both as one thread
continuation. Probe D7 ran same-session (Discovery Exemption): getQuotes is
unauth-public with cursors and embedded-view shapes; thread views carry quoteCount;
inbound quoted-context rendering is free. Phase 3 gained unit 3e (interleaved
continuation with distinct markers, failure chip, postgate-detachment honesty —
render only what the appview returns — and the invariant-8 ledger proposal for
quote-respond as a schema event). Documentation Impact: 3e's ledger entry noted on
the ledger line; README thread-view mention rides 3d's update.

### Primitives ratified: 3f + 3g added, trending + verification IN — 2026-08-25
User walk-through of the Bluesky-primitives map: tier 1 (facets, labels→masking,
mutes) ratified → unit 3f, WITH verification promoted in ("we should represent
verification"); trending promoted in ("I would like to do trending"); the route
scheme set by the user — `/f/` for feed/field, `/h/` for hashtag, "treat them as
content streams either way" → unit 3g generalizes the board fetch to one stream
abstraction with two keys, mode-symmetric (`/h/` in memory = native tag selector).
Probes D8/D9 ran same-session (read-only): trending endpoints unauth-200 and each
topic resolves to a FEED GENERATOR (no third stream kind needed; unspecced-API
fragility → ledger entry with degradation); verification + labels already ride
every author view (zero extra requests). Frontiers registered at 3g: list-backed
Fields, starter packs. NOT-doing updated: DMs out; **Jetstream v2 investigation
recorded as a named follow-up in TODO.md** (user: "full investigation of how best
to handle these with the new released jetstream2") — not folded into this plan.

### Moderation mirror ratified; piggy-back principle adopted — 2026-08-25
User direction (with the official app's screens as reference): mirror the standard
moderation controls — muted words & tags, content filters, mutes, blocks, mod
lists, interaction settings, verification settings — and "piggy back anywhere we
can" on account-side state. D10 probed same-session and settled the accessibility
question favorably: the user's working assumption was that settings are not
accessible — they are not PUBLIC, but they ARE app-API-accessible with the user's
session via getPreferences (and blocks are public records besides); putPreferences
round-trip proven and restored. Consequences: 3f expanded from "labels+mutes" to
the FULL posture mirror derived from the account (muted words with
targets/actorTarget/expiry, label filters, adult toggle, mutes/blocks/list-subs),
plus a read-only Moderation panel with edit-on-bsky.app links; managing posture
from forage (putPreferences UI) and interaction-defaults authoring are registered
frontiers (forage composes no network posts). The piggy-back principle recorded as
a Reasoning tenet. BBS-side board moderation (banned words as a space-owner
concept) is a phase-5-split topic — the memory tier's moderation-as-masking is the
shape it reuses.

### Amendment review pass — 2026-08-25 (user-requested, over D7–D10 + 3e/3f/3g)
The plan grew four probes and three phase-3 units after Pass 3 closed; this pass
ran the Pass-3 quality gates over ONLY the amendments (extend-don't-rewrite).
Found and fixed:
- **Ordering defect (the real catch):** 3d is the live-validation capstone and the
  front-door flip, but sat before 3e/3f/3g whose wiring lines lean on "the 3d
  smoke". Execution order now explicit — 3a→3b→3c→3e→3f→3g→3d — with 3d's smoke
  widened to cover quotes, masking, verification, streams, and trending. Phase 6's
  final smoke widened to match.
- **Concurrency Map spine** updated with 3e/3f/3g (was stale at 3c→3d→4a).
- **3f hardening:** explicit hermetic wiring test (posture applied on the live
  shape path, not only helpers); ledger divergence entry added (wide moderation =
  account-derived vs memory = event-derived, tolerated with reason); hide-
  verification-badges pref respected when encountered; write-set declared
  (4 files, multi-commit ≤3 per slice); bsky.app link routes deliberately pinned
  at implementation time (SPA routes — user-confirmed the link-out posture:
  "we can link to the bsky.app pages for the moderation content that is shared
  via the PDS").
- **3g dependencies declared** (2b session; 3f facet doorways; trending unauth).
- **Phase 0 Done-when** corrected D1–D6 → D1–D10; status header now reflects
  EXECUTING with amendments reviewed.
No violations found in: TDD ordering (all three units are RED-first with named
boundary cases), dispositions (all four new probes declared + honored, residue
deleted), doc impact (README/TODO/ledger lines map to owning units), ≤3-file rule
(all multi-commit units sliced). Confirmed ready to resume at 1a.
