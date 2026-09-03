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

- ~~**When should the refresh check run on its own?**~~ **DECIDED 2026-09-02 by the owner: on
  return to a board.** Coming back to a board you were reading checks page one and says what
  arrived, with no press. A timer while you read was rejected (a cadence nobody chose) and so
  was the tab becoming visible (real, but a weaker signal than arriving at the board itself).
  Held by `mock-refresh` R10/R11 and `feed-position` P2b. Decision 6 on
  `plans/mocks/feed-refresh.html` v5.


- ~~**Images on a reply (feed-row O7).**~~ — DONE 2026-08-31 (feed-row v6): the reply page
  carries the composer's picker (`imagePicker` in `js/ui/lens-views.js`); the quick box
  stays text.

- **A comment's like count wraps at four digits.** On a 390px phone the comment action row breaks
  `▲ 1158` across two lines (and `▲ 121` on a narrow deep row). The FEED ROW was fixed for
  four-digit counts in feed-row v9; the comment row's five equal cells were not. Surfaced 2026-09-03
  by `e2e/harness/mock-deepthread.mjs`, which is the first population carrying a four-digit count on
  a comment — visible in every column of `plans/mocks/thread-depth.html` v1, Current included, so
  it is not that branch's doing. Out of scope there.

- **The focus bar lies about a comment it did find.** `?focus=` into a node that arrives with the
  QUOTE CASCADE reads "That comment isn't in this thread" over a comment it has found, unfolded,
  scrolled to and highlighted. The bar is built once from the first `focusComment` call, before
  the cascade lands; `onCascade` calls `focusComment` again for its side effects and discards the
  return value (`js/ui/lens-views.js`), so the wording never catches up. Reproduced on main at
  cascade depth 3 on 2026-09-03, found while building `plans/mocks/thread-depth.html` — not that
  branch's doing, and deliberately not fixed there. `e2e/mock-depth.workflow.mjs` records it in a
  comment beside the claim that does not assert it.

- **The post you are answering, on `/reply` (reply-embeds decision 2).** The reply-target card
  (`lensReplyView` in `js/ui/lens-views.js`) draws the post's own picture but has never drawn the
  post it QUOTES, and it clamps the words to four lines — so it is built as a summary, not as a
  full rendering. Found 2026-09-01 while fixing the same drop on reply nodes; deliberately not
  changed there, because whether that card is a summary or a rendering is a decision, not a bug.
  Mock: `plans/mocks/reply-embeds.html` decision 2. One line either way.

- **Providers without a web app (feed-row 28).** "Open on …" names the signed-in provider's app
  only where `js/auth/hosts.js` records one; blacksky.app, eurosky.social and northsky.social were
  probed 2026-08-30 and answer 404 at `/profile/…` (PDS hosts, not apps). If one of them ships a
  client, re-probe and fill `app` — never from memory.
- **Surf's muted ink on its own elevated surface is under AA.** `--muted` #5C6B75 on
  `--card-2` #F3E6D0 measures 4.47 (floor 4.5) — a pair `test/skins.test.js` does not grade
  (`--muted` is graded on `--bg` and `--card` only), found 2026-08-30 while authoring surf's
  `--row-hover` (feed-row 22). Darken surf's `--muted` a notch and add the pair to ROLE_PAIRS.
- **The snaps manifest cannot see a file that is missing, or one that is spare.**
  `test/mock-snaps-manifest.test.js` checks the manifest's SHAPE, not its
  correspondence with the directory — so a manifest row naming a deleted PNG passes,
  and a PNG no row names passes too. Both happened on 2026-09-03 when self-thread's
  proposal B was withdrawn: four stale rows and two orphan captures survived a green
  run, and were found by hand. Two assertions over `plans/mocks/snaps/*/manifest.json`
  close it: every named file exists, and every `.png` in the directory is named.

- **A comment's action row clips Delete at 390px.** On a phone a comment you wrote
  carries fold, Reply, ⟳, Delete, the like pill and share on one row, and Delete renders
  as "Delet". Found 2026-09-03 while capturing the self-thread mock; reproduced
  identically on main (`8bc6cbd`) in that mock's Current frames, so it predates the
  branch and was deliberately not fixed quietly there. Frames:
  `plans/mocks/snaps/self-thread/self-lens-count.phone.*.png`.

- **GIF search on the reply box (feed-row O9).** The GIF button attaches a `.gif` from the
  device. bsky.app searches Tenor through its own proxy — endpoint and key unverified from
  here; probe first (CLAUDE.md § External APIs), then a picker. Mock: `plans/mocks/feed-row.html`
  decision 16.

- **A native mirror of drafts (feed-row O8).** Drafts live in this browser (`js/drafts.js`).
  `app.bsky.draft.createDraft/updateDraft/getDrafts/deleteDraft` (private stash) could hold
  the words too — but `defs#draft` has no reply target (lexicon read 2026-08-30), so the
  parent stays local either way. Wants a live probe with the standing test account first
  (CLAUDE.md § External APIs), then a Settings choice. [device: none]


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

## Device queue — owed device runs (for the device-testing queue session to lift)

The workspace queue reads this section through the `[device: …]` tags (`CroftC/.claude/TESTBED.md`
§ The device queue): `bash CroftC/.claude/bin/device-queue.sh --have samsung` seats what the phone in
hand can run; fulfil an item by turning its tag into `[device done YYYY-MM-DD: …]`.

Every item here is a **look or a measurement on a real phone** that a shipped plan could not
make because no device was attached. Each names the plan, the phase, and the exact claim;
none needs code before the run, and each may need code after it. Claim `testbed--samsung`
(`CroftC/.claude/TESTBED.md`) before running.

- **board-cards D1 — the blurred backdrop's cost.** `plans/2026-08-29-plan-board-cards.md` (since 2026-08-29) [device: android]
  Phase 0/5b (O2, PHASE-GATED). Ten stages with `filter: blur(22px)` on a mid-range
  Android: scroll a picture-heavy board (`/f/whats-hot` at card size 4) and read the frame
  timeline. **Pass:** no dropped frames at 60Hz. **Fail:** set `data-flat` on `.stage`
  (the flat band `prefers-reduced-transparency` already selects) by default on phones —
  the rule exists in `css/app.css`; only the trigger is missing.
- **board-cards 5c Broad — the four card sizes on the Samsung.** Same plan, Phase 5c. (since 2026-08-29) [device: android=samsung]
  The live site's shapes at card size 1, 2, 3 and 4 (toolbar pill or Settings → Card size):
  does 4 feel tall on a phone (O4 said 3 would be the first thing to try)? Portrait /
  landscape / wide / video posts each at 390 wide.
- **board-cards 6 — the carousel's swipe as a feel.** The handler is proven (pointer (since 2026-08-29) [device: android]
  events, `e2e/media-stage`); the feel — threshold 40px, the 250ms slide — is not. A
  four-picture post at setting 1 (the default).
- **board-cards 7 — the one-column phone layout with the rail folded.** The rail's cards (since 2026-08-29) [device: android]
  follow the content on a phone (the hero owns the fold); one look that the sign-in card
  is findable signed out on `/f/whats-hot` at 390, and that the Side panel switch's OFF
  state changes nothing visible on a phone (as designed).
- **post-and-thread Phase 7 — haptics.** `plans/2026-08-29-plan-post-and-thread.md`: (since 2026-08-29) [device: android=samsung]
  a like buzzes once on the flip to on, never on off; Settings → Buzz on like stops it.
  `navigator.vibrate` is stubbed in `e2e/no-downvote`; the buzz itself was never felt.

## Mock captures — post-and-thread v20, board-cards v9 (2026-08-30)

Found by capturing the shipped board and thread beside every sketch (both mocks'
"captured" callouts). Decided shape, not yet built:

- **The kind label truncates before the name does at 390px on a quote node.** With a
  30-character handle, "⟳ quoted this" clips to "⟳ quoted" (`snaps/focus-lens.phone.proposed.png`,
  the misterhooperspecial node). The byline rule lets the name yield first; a second rule
  should let the label yield only after the name is at its floor (`min-width` on `.who`).
- **Every mock section is now captured.** The remaining sketches in post-and-thread (A–F)
  and board-cards are the record the decisions were made on; nothing further is owed there.

## Mock alignment — post-and-thread v18 (2026-08-30)

Found by capturing the engine beside the drawing (`plans/mocks/post-and-thread.html` v18
§ C, "What the captures found"). Decided shape, not yet built:

- **Byline word order.** Shipped: *name · time · ⟳ quoted this*; the drawing (decision 5's
  header) has *name · ⟳ quoted this · time*. `byline()` in `js/ui/components.js` appends
  `after` past the time; the kind label wants to precede it. One line, plus the
  thread-byline workflow's `last`/`time` expectations.
- **The lens head's title.** A Bluesky post has no title, so `/p` renders the whole text
  as the `h1` — at 390px that is eight lines of display type before the first reply
  (`snaps/thread-lens.phone.current.png`). Decide the head's shape for a title-less post
  (body type with the byline above, as bsky.app does) and draw it as a captured Proposed
  frame, not a sketch.
- **The memory tier's Reply.** The memory population's inline `.reply-form` predates the
  lens composer; the two look different on the same action row. Fold it into the same
  `.reply-host` mount so one component serves both tiers.

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

- ~~**A self-thread continuation drops its embed.**~~ **DONE 2026-09-02** (#53). A hoisted
  same-author chain part now carries `media` and `quoted` through `mediaOf`'s one door, plus the
  `author`/`id` a video's link-out needs. Held by `test/lens.test.js` for the shape and
  `e2e/self-thread-embeds.workflow.mjs` for the render — a shape that carries media and a head
  that never draws it is the same bug with a green unit test.

- ~~**Tenor GIFs play the .gif, not its cheaper video.**~~ **DONE 2026-09-02** (#53), after the
  probe the previous entry asked for. Two independent real ids, against tenor's OWN host
  (`media.tenor.com`, `access-control-allow-origin: *`): `Zc-ZTPzlEHo` gif 66,865 B → webm
  37,761 / mp4 20,255 (3.3x); `r2ZObFlQ5I4` gif 4,160,427 B → webm 79,370 / mp4 77,723 (**52x**).
  So no proxy is needed, as with klipy. forage requires the `AAAAC` format code to be a SUFFIX,
  which is stricter than social-app's first-match `replace`: an id merely containing `AAAAC`
  earlier would otherwise be rewritten into a 404, and a silently broken player is worse than a
  larger working one.

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

- ~~**`e2e/mock-board.workflow.mjs` flakes ~1 in 5 on a DNS lookup that escapes the shim's
  fence.**~~ — **DONE 2026-09-01.** Filed and fixed the same day. Worth keeping for the
  correction: **the filed diagnosis was wrong.** It said the fix was to "name the host in the
  shim's fence list", which could not have worked — `e2e/harness/shim.mjs` fences
  `window.fetch`, and the failing request was a `<video>` element's own playlist load, which
  never goes through `fetch`. No entry in that list would have caught it, and neither would
  any of the `<img>`, `<iframe>`, stylesheet or font loads in every other workflow. Root cause
  found by instrumenting `requestfailed` and running until it tripped:
  `net::ERR_NAME_NOT_RESOLVED https://video.cdn.test/clip/playlist.m3u8`. Fixed by moving the
  fence a layer down — `scenario.mjs` routes every request and refuses anything off the
  harness's own origin locally, recording it as `blockedExternals()`. The flake was the cheap
  half: the real bug was that a resolver which *answers* (a captive portal, a wildcard DNS
  provider, this laptop's own OpenDNS hijack of unknown names) would have served real bytes
  into a test reporting itself hermetic. Held by `e2e/harness-fence.workflow.mjs`; measured
  12/12 clean on the previously-flaky workflow.
