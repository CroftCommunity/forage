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

## What the a11y sweep left behind (2026-08-26)

> `2c4b28d` closed the two gate gaps a live audit of the deployed site found (surface
> coverage, and the missing touch floor). Two items survive it, both with the work
> already known. Origin: a Playwright + axe survey of forage.fyi at `forage-v38`,
> service worker blocked so the scan saw the first-hit DOM, 8 routes × {390, 1280}.

- **`link-name` on media links (SERIOUS, wcag2a) — diagnosed, not fixed.** `mediaNode`
  in `js/ui/lens-views.js` wraps `el('img', { alt: '' })` in an `<a>` for the external
  card, so the link has no accessible name; the images branch has the same hole whenever
  a post carries no alt text. A screen reader announces "link" and nothing else.
  Measured ×5 on `/u/:handle` against live data. **Held by another session's claim**
  (`CroftC/.coordination/claims/forage--polish.md`) — `2c4b28d` handed the diagnosis over
  rather than editing under it.
- **The hermetic fixtures render no media card, so no axe tier can see the above.**
  `2c4b28d` states this as its own honest limit: the sweep reaches every route and still
  cannot reproduce the finding. Closing it means a fixture with an external card and an
  alt-less image, which is what makes the surface sweep able to fail on this class at
  all. Same shape as the mobile-fit fixtures, which are *built* to provoke the defect
  they check for.
