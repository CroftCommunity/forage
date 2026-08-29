# TODO

> Known work only — items whose shape is already decided, and which may therefore be
> proposed as work. Anything still an open question (decide / verify / investigate /
> reconcile) belongs in the backlog of record, `discovery/alpha/ROADMAP_TODO.md`,
> however small or operational it is. Tracking scheme: `CroftC/.claude/TRACKING.md`;
> the two piles and why: its § "Two piles". Cross-reference E-numbers where an item
> here implements a backlog row.

Deferred work surfaced by `plans/2026-08-24-1-plan-behavior-scale-scaffolding.md`
(closed 2026-08-25) — full context lives there and in the ledger.

## Needs the owner

- ~~**`fyi.forage.tagsub` has never been written to a real PDS.**~~ — DONE
  2026-08-29. Probed against bsky.social with the standing test account and
  codified as `e2e/tagsub-pds-live.workflow.mjs` (W17, LIVE=1), which drives the
  production lens rather than re-issuing the calls: the record is accepted, lists
  back with our exact shape, reads world-readable with no auth header at all, and
  deletes cleanly. Raw record:
  `test/fixtures/atproto/tagsub-probe-summary.txt`.
  **One finding changed a justification rather than confirming one:** the PDS does
  NOT validate our lexicon — a record with neither required field was accepted
  with a 200 — so `wellFormed()` in `js/tagsubs-pds.js` is load-bearing, and W17
  asserts the non-validation still holds so we hear about it if that changes.
  **Still uncovered:** the browser OAuth handshake. W17 builds its session from an
  app password, so it proves the lens and a real PDS agree; whether
  `js/auth/session.js` can obtain a DPoP-bound session from bsky.social in a real
  browser is a separate claim no test in this repo makes.

- ~~**The 216 KB wordmark still ships on three surfaces.**~~ — DONE 2026-08-29:
  all three now point at `logo-wordmark-800.jpg` (63 KB), which was already in the
  service worker SHELL, so no precache entry was owed. The 1600x576 original is kept
  in `assets/` as the SOURCE the variants are generated from — unreferenced by the
  app, and deleting it would throw away the master to save a file nobody downloads.
  Original note: Phase E of plan
  2026-08-26-3 sized the emblem for the LENS hero (400/800/1200w, byte ceilings
  asserted, `js/hero.js` § EMBLEM). Three callers still point at the original
  1600x576 JPEG: the MEMORY population's hero (`js/ui/views.js:65`), the
  `/signup` art (`js/ui/views.js:701`), and `README.md`. All three were outside
  Phase E's declared write-set, so they were left rather than swept — the
  sandbox hero is the one that actually costs a visitor bytes. One-line each;
  point them at `logo-wordmark-800.jpg` and add it wherever a SHELL entry is
  owed. Not urgent: production defaults to the lens.

- **Phase 5 — the private BBS on Spaces** (plan 2026-08-25-1): **PAUSED behind the
  public-site queue** (owner 2026-08-26: *"we are pausing it until we have the main
  site in better shape"*). Not declined and no longer waiting on a review — the
  pre-Spaces review happened as an iteration (3h–3x) and the owner then named the
  queue that comes first. The split stays drafted and approved (5a–5d:
  space-credential module, bbs substrate, mode UI, DOCKER-gated W5); local
  rehearsal rig `ghcr.io/bluesky-social/atproto:pds-spaces-alpha` (D5 facts in the
  plan). Roadmap row: E138.

- **Composing follow-ons** (DL-027) — composing shipped 2026-08-26 (plan
  2026-08-26-1: post, reply, images, delete). Still not built: video and gallery
  embeds, external link cards, @mention facets (they need a `resolveHandle` per
  mention, and a mention that silently renders as plain text is worse than none),
  self-labels (content warnings), quote-posting from the composer, and editing a
  post — `putRecord`, which the lens does not do at all, and which the network
  itself does not really have: you delete and rewrite.
- **Per-post language selector** — the official client keeps `postLanguage` +
  `postLanguageHistory` in its composer (`social-app/src/state/persisted/schema.ts`);
  Forage claims the browser's language and offers no per-post choice. Worth doing
  if anyone posts in more than one language.

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
- ~~Lens pagination~~ — DONE 2026-08-25 (3d): feed boards and ring boards page
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
  hung member is reported, not fatal. ~~Ring caching~~ — DONE 2026-08-26 (3x):
  cached per ring for the life of the lens, warmed on sign-in; the promise is
  cached so racing callers share one graph walk, and a rejected one is dropped
  so a transient 502 is never remembered as an empty ring. Still open: DL-016
  (drawing the ring beyond the cap of 25), E139 (Jetstream v2 freshness).
- ~~Composing~~ — DONE 2026-08-26 (plan 2026-08-26-1): posting to a hashtag,
  replying in a thread, up to four images with required alt text, and deleting
  anything you wrote. Live-proved against the real network, not only against
  fixtures — which is how two bugs the suite could not see were found (posts
  declared no language; a click during session restore vanished silently).
  Feeds still get no compose affordance and never will while their criteria are
  unpublished (DL-025). What composing still does not do is listed under
  **Composing follow-ons** above and in DL-027.
- ~~hash routing vs clean paths~~ — DECIDED + SHIPPED 2026-08-26 (3n, owner):
  clean paths with the 404.html fallback; the service worker upgrades deep
  links to 200s; legacy `#/` links bridge at boot and live. Verified on
  forage.fyi at forage-v22.
- ~~Crawler caveat (from 3n)~~ — **PARKED far-out, owner 2026-08-26.** A bot's
  first hit on a deep link gets Pages' 404 status; the body is correct and
  shareable links verifiably work, so this is a discoverability question, not a
  defect. Options and the retire-by condition live on **roadmap E140**; do not
  re-derive them here.
- **Naming note:** bsky.app uses the `#` glyph for FEEDS in its nav even though
  hashtags exist. Our split is the honest one (DL-025): `/f/` feeds are not
  targetable, `/h/` hashtags are.

## Owed by the lexicon dimension (`CroftC/.claude/LEXICONS.md`)

Three gaps, all measured 2026-08-29 while the dimension was being written. None is a
reason to weaken the rule; each is work.

- **`fyi.forage.*` is unpublished, so nobody else can resolve it — NEEDS THE OWNER.**
  Rule 2 of `CroftC/.claude/LEXICONS.md`. Two steps, both owner-console; everything either
  side of them is built and proven.

  1. **An account whose handle is `forage.fyi`.** Owner decision 2026-08-29: one account
     per domain, so namespace authority reads as the project rather than a person and
     survives anyone changing personal accounts. `recipe.exchange` is the live example —
     its `_atproto` and `_lexicon` records name the same DID. bsky.social needs no invite
     code (checked via `describeServer`); it needs an email the owner can receive at.
  2. **Two TXT records at Porkbun**, values printed by the publisher in step 1 below:

     ```
     _atproto.forage.fyi   TXT   did=<the DID>     # makes the handle the domain
     _lexicon.forage.fyi   TXT   did=<the DID>     # makes the namespace resolvable
     ```

     Nothing is deleted. Neither name touches the apex, so Pages keeps serving —
     `forage.fyi` A records are 185.199.x and are not involved. `_lexicon.forage.fyi` is
     genuinely empty today, with no parking wildcard on this zone (unlike croft.ing; the
     difference and why it matters is in `CroftC/.claude/LEXICONS.md` § 2).

  What is already done, so this is not a research task:

  ```
  node CroftC/.claude/bin/publish-lexicons.mjs --repo forage --as <handle>   # writes the 10 schemas, prints the TXT
  node CroftC/.claude/bin/publish-lexicons.mjs --verify forage.fyi --repo forage   # after the 600s TTL
  ```

  The publisher was proven end to end 2026-08-29: all ten schemas written to the standing
  test account, read back **unauthenticated**, then removed — so what is unproven here is
  the DNS, not the mechanism. `--verify` walks the chain a consumer walks (authoritative
  nameserver → DID → PDS → served schemas, compared canonically against disk) rather than
  confirming that a record was typed.

- ~~**`js/lexicon.js` is a hand-rolled mirror and is not gated against the reference.**~~ —
  DONE 2026-08-29, `test/lexicon-reference-gate.test.js`. `@atproto/lexicon` as a
  devDependency; the corpus is GENERATED from the schemas (124 cases today) so a lexicon
  added tomorrow is covered without anyone extending the file. **It found a real divergence
  on its first run**, in the direction that matters: the mirror accepted a bare string for
  `fyi.forage.feed`'s `settings`, which the reference refuses — `unknown` means an arbitrary
  OBJECT, not an arbitrary value. An existing test had asserted the opposite in as many
  words, which is the argument for gating against something we did not write.

- ~~**The `fyi.forage.tagsub` register entry checked four official types and not
  `community.lexicon.*`.**~~ — DONE 2026-08-29. Re-run against `lexicon-community@main`;
  its nine record types are listed in the amended entry. The conclusion survives and has now
  actually been tested: none subscribes to anything, and the nearest — `bookmarks.bookmark` —
  points at a uri, the same pattern the official candidates showed. It carries an optional
  `tags` array, so the ecosystem models tags on a saved thing and still not a subscription
  to a tag.

## Found by the nine ecosystem checks (2026-08-29)

The register's exemption list is empty — all nine pre-register checks were done against the
real corpora (26 record types among the 435 official lexicons, 9 in `community.lexicon.*`),
and `test/lexicons.test.js` now allows no type to say `NOT DONE`. Two of the nine turned up
candidates. **Both were then narrowed by facts the schemas do not carry** — one a privacy
posture, one an owner requirement about what the Bluesky client shows — which is worth
saying because a field-list comparison looked conclusive and was not.

Context for all of it: **nine of the ten `fyi.forage.*` types have never been written to a
real PDS.** `tagsub` is the only one any code sends over a network; the rest are the memory
tier's wire shape, and it persists to `forage.state` in localStorage.

- **`fyi.forage.save` vs `community.lexicon.bookmarks.bookmark` is a PRIVACY decision, not a
  cleanup — owner's call.** The shapes match (theirs is a strict superset: `subject` uri +
  `createdAt` + optional `tags`), and my first write-up stopped there and recommended
  retiring ours. **The behaviours are opposite.** Bluesky's bookmarks are explicitly
  *private and server-side* — `createBookmark`/`deleteBookmark` are procedures, there is no
  record, and the lexicon says "Creates a **private** bookmark". The community type is a repo
  record, world-readable like a follow. Adopting it would publish everything anyone ever
  saved. The tagsub precedent is the nearest good answer if we do want it: local by default,
  published per item on purpose.

- **`fyi.forage.vote` — no change for lens content; drop the vestigial `value`.** Owner
  2026-08-29: likes must show the same in the Bluesky client as in Forage, and **only
  `app.bsky.feed.like` appears there**. `community.lexicon.interaction.like` is invisible to
  every official client, so adopting it would silently stop boosts showing up in Bluesky. The
  lens already writes real likes — the requirement met, not a compromise. ~~Separately and
  regardless: `value` is an enum of exactly `[1]`…~~ — **DONE 2026-08-29**: dropped from the
  lexicon and from both encoder paths; the decoder supplies the one value a present record
  can mean. The divergence from the community type is now exactly one field — their
  strongRef against our at-uri.

- **`fyi.forage.roster` is adoptable with reshaping and no blocker was found.** `list` +
  `listitem` could hold it; the cost is one record per member instead of a `literal:self`
  singleton. Recorded as convenience rather than justification, because that is what it is.
