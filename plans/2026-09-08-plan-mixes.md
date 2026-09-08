# Plan: Mixes — a Home board made of everything you subscribed to, and the page that tunes it

date: 2026-09-08
**Status:** PHASES 0–9 BUILT (2026-09-08, one day; owner: "do full plan") on `claude/mixes`,
PR #62 open by the owner's choice. ALL NINE DECISIONS CLOSED by the owner (D1 reshaped what a
weight is — see *Decisions* and the Review Log). Owed: the phone-on-cellular timing run
`[device: android]` before D6 is final. D4's second half — mixes as a PDS record — is
BUILT the same day (`plans/2026-09-08-plan-mixes-on-the-pds.md`, live-proven). E159 marked
done in `discovery/alpha/ROADMAP_TODO.md`.
repo: `CroftCommunity/forage`
baseline: `main` @ `68ab504` (the ring as the whole universe, #61)
branch: `claude/mixes` · worktree `worktrees/mixes/forage`

## Problem Statement

The owner, 2026-09-04, while settling what the ring does to a feed:

> "after this work we're gonna look at creating mixes which are gonna be kind of like local
> feeds almost but are closer to like interpolated, you know, like a Reddit home thing where
> like right now when you subscribe to like ten feeds you're kinda looking at them all in
> isolation and then you're looking at you know hashtag you know feed or whatever but what I
> want is like the ability to create local things that are like a mix of you know funny and
> followers or whatever"

and 2026-09-08, the ask this plan answers:

> "a default 'Home' Mix that is a combination of all followed accounts, feeds and hashtags
> and we want a 'Mixes' admin page that allows users to adjust the parameters for inclusion
> in a mix and create new mixes and add them to the left sidebar. … your subscriptions are
> in rows on a Mixes admin page and you can weight things so they show up more or less in
> the mix in question. … the home mix would by default be all subscribed types, but you
> should be able to disable a subscription no matter the kind with a disable slider and it's
> deweighted to 0 effectively"

**What a reader has today.** Three kinds of subscription, each a board of its own and nothing
that joins them:

| Subscription | Where it lives | The board |
|---|---|---|
| Following (the accounts you follow) | Bluesky's follow graph; `{kind:'timeline'}` | `/f/following` |
| Saved feeds and lists | Bluesky's `savedFeedsPrefV2`, read by `lens.feeds()` | `/f/<slug>` each |
| Hashtags | `fyi.forage.tagsub` records on the PDS, plus a local half (`effectiveTags`) | `/h/<tag>` each |

Ten feeds are ten places to go. The one board that ever combined them, `/r/world`, was
retired with the merged ring board on 2026-09-03; its own commit says *"a capability leaves
with them and it is not dead code … nothing replaces it."* This plan is the replacement, and
it is not the old board back: `/r/world` was newest-first across every source with no way to
say *less of that one*, so it belonged to whichever source posted most.

**What is asked for, in one sentence.** A **mix** is a board the reader composes from their
subscriptions, where each subscription is a row with an on/off switch and a weight; **Home**
is the mix that starts with every subscription on; mixes sit in the left sidebar; and a
**Mixes** page is where rows are switched, weighted, and new mixes made.

**Why this is the surface the ring scopes by default.** Recorded on 2026-09-04 (ring plan,
review log item 4; roadmap E159): a feed opened by name is that feed, unedited, so feeds and
hashtags are exempt from the ring by default. A mix is the opposite kind of object — *"these
things but within this radius"* — so a mix is **never exempt**. The reader who wants a
stranger-free Home sets the ring to Follows and gets it; nothing on the Mixes page needs to
mention the ring.

## Approach

Actor narrative first. **Alice** follows 300 accounts, saved eight feeds and subscribed to
`#harvest` and `#foraging`. She opens Forage and lands on **Home**: one board where her
timeline, her eight feeds and her two tags are dealt into one list, a few posts from each in
turn. The `#foraging` tag is noisy this week, so she opens **Mixes → Home**, finds the
`#foraging` row and turns its weight down to *Less*; the timeline row she turns up to *More*.
She makes a second mix, **Weekend**, from two of the feeds and `#harvest` only, and it
appears under Home in the sidebar. **Bob**, signed out, sees none of this — he has no
subscriptions, and the sidebar stays the curated one.

### A. The model — `js/mixes.js` (pure; device-local storage, like the ring)

A mix is `{ slug, name, rows }` where a row is `{ source, on, weight }` and `source` names a
subscription: `{ kind:'timeline' }`, `{ kind:'feed'|'list', uri }`, or `{ kind:'hashtag',
tag }`. Sources are identified by a stable **source id** (`timeline`, `feed:<uri>`,
`hashtag:<tag>`) so a row survives a feed being renamed.

- **Home stores overrides only.** Its definition is *every subscription, on, at Normal*; the
  stored record holds just the rows the reader changed. A feed saved tomorrow is in Home
  tomorrow, at Normal, without anyone touching Mixes. Home cannot be deleted (it is pinned
  the way World is pinned on the ring pill).
- **A custom mix stores its rows in full**, and starts **empty** — every subscription listed,
  every switch off — because a mix is something you pick into, and a copy of Home is one
  click from being Home.
- **Weights are notches, not a slider.** `Less · Normal · More` = ×½ · ×1 · ×2 — ONE number
  per row, a multiplier, and it means *"more of this in this mix"* under every sort (D1; the
  table in § D says what it does under each). Off is the switch, not a fourth notch: the
  switch remembers the weight, so turning a row back on restores *More* rather than
  *Normal*. The owner's *"deweighted to 0 effectively"* is what the substrate sees; the
  reader sees a switch.
- Storage key `forage.mixes`, one JSON document, read through on every render (the
  `board-density` / `ring-scope` pattern: every read is a repair — an unknown source id is
  kept but rendered as *no longer subscribed*, an unknown weight is clamped, a corrupt
  document falls back to Home alone). `onChange` listeners; writes refuse by name.
- **Device-local now, account-shaped later.** A mix is a composition, which is closer to a
  tag subscription (a PDS record) than to a skin. Publishing it means a `fyi.forage.mix`
  lexicon and LEXICONS.md's four acts, and the tagsub two-halves pattern is there to copy.
  That is its own plan (D4); nothing in A closes the door.

### B. The interleave — `js/mix-deal.js` (pure)

`deal(queues, { weights })` takes one ordered queue of shaped posts per source and returns
one list. **Weighted round-robin:** in each round, source *i* contributes up to `2 × weight_i`
posts — ×½ deals 1, ×1 deals 2, ×2 deals 4 — sources ordered by weight descending then
source id; a queue that runs dry is skipped
until it is refilled; a post already dealt (same `uri`) is dropped so a post that is both in
your timeline and in a feed appears once, credited to the first source that dealt it. Order
*within* a source is the source's own — the feed generator's for a feed, reverse-chron for
the timeline, `latest` for a hashtag — never re-sorted across sources (that is what made the
old World board flood).

Weight 0 (a row switched off) is never a queue at all: the source is not fetched.

### C. The substrate — `lens.mix(spec, { cursors, timeoutMs })`

Fan-out, one request per enabled source per page, all in parallel, each behind a per-source
timeout; a source that fails or times out goes into `failures[]` with words and the board
still paints. Each source is fetched through the existing door for its kind — `feed()` for
timeline/feed/list, `stream({kind:'hashtag'})` for a tag — and **re-shaped under a mix src**
(`feedKind: 'mix'`, `feedSlug: 'm:<slug>'`) so the ring's exemption never sees a
constituent's kind. Returns `{ posts, cursors, failures, sources }` where `cursors` is the
per-source cursor map for *More*; it lives in memory with the board (board-cache record
`mix:<slug>`), not in the URL — the old ring board's base64 cursor blob is not coming back.

Cost is measured, not predicted (D6): Home on the owner's account is roughly a dozen
sources, so a dozen requests on open. The old per-member fan-out measured 80–420 ms at 25.

### D. The board — `/m/:slug`, `mixBoardView`

Reuses `feedBoardView`'s toolbar, *More*, language filter and `renderBoard`; *Default* sort
is the deal, *New/Hot/Top* are the existing client-side sorts over the loaded window — with
the weight riding along, because the owner's rule (D1) is that a weight *"has to play nice
with top etc sort."* Every post a mix deals carries its row's weight (`mixWeight`), and the
window sorts read it:

| Sort | What orders the board today (`js/engines/rank.js`) | With a weight *w* on the post's source |
|---|---|---|
| Default | the deal | share of each round: 2·*w* posts |
| Top | `likes` | `likes × w` |
| Hot | `log10(engagement) + age/45000 s` | `log10(engagement × w) + …` — ×2 is worth 3¾ hours of youth, ×½ costs the same |
| New | `createdTs` | **unweighted.** The reader asked for time; the switch still applies |

So a small feed's posts, which lose every raw-likes contest to a big feed's, surface under
Top and Hot when the reader says *More* of that feed — which is the owner's stated point of
weighting. Under New a weight does nothing, and the info line says so when New is picked
(*"New ignores weights"*). The
info line under the toolbar names what the board is made of (*"Home · 11 sources"*) and,
when it applies, what did not answer (*"2 of 11 did not answer — Trending, #foraging"*).
A mix with every row off is an empty state with a next step (*"Nothing is in this mix yet —
open Mixes"*), never a blank board. `currentBoardId` learns `/m/<slug>` → `mix-<slug>`.

### E. The sidebar — `js/ui/nav.js`

A **Mixes** section above Feeds, Home first, then the reader's mixes in the order made. Every
mix is a row (the ask); hiding one from the sidebar is deliberately not offered until
someone has more mixes than fit. Signed out, the section does not render.

### F. The Mixes page — `/mixes` and `/mixes/:slug`

Pages, not modals. `/mixes` lists the reader's mixes with *New mix* (a name → a slug) and a
row per mix leading to `/mixes/<slug>`. That page is the ask verbatim: **one row per
subscription** — Following, each saved feed and list, each hashtag — label left, controls
right: a switch and a three-notch weight dial. Rows are grouped by kind with the kind as a
heading. A subscription in the stored mix that the reader has since unsubscribed from is
shown greyed with *no longer subscribed* and a remove action. Rename and delete live here
(Home has rename only). Linked from the sidebar's *Browse* cluster (*Your mixes*) and from
`/me`. Tap floor 44px on the switch and every notch; the mobile-fit gate gains
`input[type=range]` if a range is ever used, which this plan does not.

### G. Home as the landing board

`/` lands on the last board or, first time, on `following`. With Home in place the first-time
board becomes `m/home` (D5); the last-board memory still wins for a returning reader.

## Decisions

| # | Question | Options | Recommendation |
|---|---|---|---|
| **D1** | What is a weight? | (a) share of the deal only; (b) a multiplier on the post's score, so it also plays under Top and Hot; (c) a multiplier on recency | **CLOSED (owner, 2026-09-08) — (b), with (a) as its Default-sort face.** *"I was kind of thinking of it as weighting upvotes so smaller feeds and such still surface; for me the point of weighting is I want more of this in this mix, but it has to play nice with top etc sort."* One multiplier per row — ×½ · ×1 · ×2, *Less · Normal · More* — read by every sort (§ D table): the deal's share under Default, `likes × w` under Top, `engagement × w` inside Hot's log, nothing under New. This plan's first draft had (a) alone, which could not say anything under Top; (c) is still rejected — it reorders across sources by age, the old flood. |
| **D2** | Where does the Off switch live? | (a) a switch per row that remembers the weight; (b) Off as the dial's zero | **CLOSED — (a)** (owner: "yes to your smaller ones"). The owner named a "disable slider" and a weight as two things; a row turned back on should come back where it was. |
| **D3** | A new custom mix starts as? | (a) empty — everything listed, everything off; (b) a copy of Home | **CLOSED — (a).** A mix is picked into. A copy of Home is one tap from being Home and hides the difference. |
| **D4** | Where does a mix live? | (a) device-local `forage.mixes`; (b) a `fyi.forage.mix` PDS record from day one; (c) local now, publish later on the tagsub pattern | **CLOSED — (c)** (owner: "device local for now, yes, pds later, yes"). Minting a record type is cheap and permanent (LEXICONS.md) and needs the four acts. The model in A is written so (c)'s second half is an addition. |
| **D5** | Does Home become the first-time landing board? | (a) yes — `FIRST_TIME_BOARD` becomes Home; (b) no — Home is a sidebar row like any other | **CLOSED — (a)** (owner: "yes"). Returning readers keep their last board either way. |
| **D6** | Fan-out bound | (a) none — every enabled source; (b) a cap with honest overflow like the old `RING_CAP`; (c) no cap, but a **per-source page size** (10–15 instead of 30) and a **per-source timeout** with the board painting what answered | **(c), from the measurement** (Review Log, 2026-09-08). Twelve sources in parallel cost ~0.7 s warm and 2.3 s cold — the sequential equivalent was 5.1 s — and nothing failed; twenty-five cost 3.1 s because of ONE straggler, not the count. The cost that grew with N was payload: 277 posts for one page at N=12, 569 at N=25, of which a screen shows a dozen. So the bound is on what each source is asked for, not on how many are asked. |
| **D7** | Does the mix board keep the sort toolbar? | (a) yes, Default = the deal; (b) no toolbar, the deal only | **CLOSED — (a).** And D1 makes the toolbar load-bearing: Top and Hot are where a weight lifts a small feed. |
| **D8** | Dedupe credit | (a) the first source to deal a post keeps it; (b) the heavier source | **CLOSED — (a)** for the deal. Under Top/Hot a post in two sources takes the **heavier** weight, because there the weight is a score and the higher one is what the reader asked for; that is a lookup, not a membership walk. |
| **D9** | Lists (`savedFeeds` kind `list`) | (a) rows in a mix like feeds; (b) out of scope | **CLOSED — (a).** They are already subscriptions and `feed()` already fetches them. |

## Phases

Each phase is RED first and leaves the tree green. Files named where they are known.

### Phase 0 — measurement (no code) · a `LIVE=1` probe — **DONE 2026-09-08**
`e2e/mixes-fanout-live.workflow.mjs`: signed in as the test account, fan out over the
Following timeline, popular feed generators found live, and two hashtags — through the
lens's own `feed()`/`stream()` so shaping is inside the number — per-source timeout 8 s,
three runs at N=12, one at N=25, one sequential for contrast. Result in the Review Log;
D6 is now recommendation (c).

### Phase 1 — the model · `js/mixes.js` · `test/mixes.test.js` — **DONE 2026-09-08** (15 tests, RED first; sw cache v77)
Home from a subscription list (timeline + feeds + tags → rows, all on, Normal); overrides
persist and apply; a new subscription appears in Home on; a custom mix starts empty; weights
clamp; unknown source ids survive as *no longer subscribed*; Home cannot be deleted or
renamed to nothing; slugs collide → refused by name; corrupt storage → Home alone;
`onChange` fires on every write.

### Phase 2 — DONE 2026-09-08 — the deal and the weighted sorts · `js/mix-deal.js`, `js/engines/rank.js` · `test/mix-deal.test.js`, `test/engines.test.js`
×2 contributes 4 per round beside ×1's 2 and ×½'s 1; weight 0 contributes nothing and is never
a queue; `sortWindow` reads `mixWeight` when present — Top orders by `likes × w`, Hot by
`hot(engagement × w)`, New ignores it; a post absent a weight sorts exactly as today
(the literal pins in `test/engines.test.js` must not move); a ×2 post with half the likes
ties a ×1 post under Top; a dry queue is skipped and resumes when refilled; duplicates by uri drop, first
source wins; order within a source is preserved; the deal is deterministic for one input;
`length ≤ sum of inputs`. A property test over random queues for the last three.

### Phase 3 — DONE 2026-09-08 — the substrate · `js/substrates/lens.js` `mix()` · `test/lens-mix.test.js`
Fake session with one route per source: all answer → one deal; one 502 → `failures`
carries it with words and the rest paint; one hangs → the timeout fails it and the rest
paint; cursors returned per source and *More* pages only the sources that had a cursor; a
timeline envelope keeps its `itemKind` (repost, reply) through the re-shape; every dealt post
carries `feedKind:'mix'`, and at Follows a stranger's post from a hashtag row is **hidden** —
the exemption never sees the constituent (the sentence E159 exists for).

### Phase 4 — DONE 2026-09-08 — the board and route · `/m/:slug` in `js/main.js`, `mixBoardView` in `js/ui/lens-views.js`
`test/routes.test.js` sees the route; board-cache key `mix:<slug>`; info line with sources
and failures; the empty-mix invitation; *More*; `currentBoardId`. `e2e/mixes.workflow.mjs`
(hermetic; timeline + 2 feeds + 1 hashtag): the board paints, the deal is visible (a
weight-3 feed shows 3 of the first 6), a failed source is named, *More* extends.

### Phase 5 — DONE 2026-09-08 — the sidebar · `js/ui/nav.js`
Mixes section above Feeds, Home first; guest sees none; `aria-current` on the open mix.
Journey extends `e2e/mixes.workflow.mjs` and `e2e/guest-surface.workflow.mjs`.

### Phase 6 — DONE 2026-09-08 — the Mixes page · `/mixes`, `/mixes/:slug`
Rows per subscription grouped by kind; switch + three-notch dial at 44px; New mix; rename;
delete (not Home); *no longer subscribed* rows. Journey: turn `#foraging` to *Less*, open
Home, it deals 1 per round; switch it off, it is gone and not fetched (the fixture counts
requests); make *Weekend* from two rows, it appears in the sidebar and paints those two.
`e2e/mobile-fit.workflow.mjs` covers the page at 320/360/390.

### Phase 7 — DONE 2026-09-08 — Home as the door (D5) · `js/last-board.js`
`FIRST_TIME_BOARD` → Home; a returning reader's last board still wins; `test/last-board.test.js`.

### Phase 8 — DONE 2026-09-08 — the mock · `plans/mocks/mixes.html` + `snaps/mixes/`
Per MOCKS.md: captures of the engine, Current (main: `/f/following`, the Feeds sidebar)
beside Proposed (`/m/home`, the Mixes page, the sidebar), phone and desktop, in one skin,
against a population that STRESSES it — twelve sources, a 60-character feed name, a
hashtag row that failed, a mix with everything off. Captured in the same landing as any
decision that changes in code.

### Phase 9 — DONE 2026-09-08 — the documents
CHANGELOG under `[Unreleased]`/the month; `AGENTS.md` (sources, the `mix` kind, the write
count unchanged — no PDS write in this plan); `docs/LEXICON-REGISTER.md` untouched (D4);
E159 retired in `discovery/alpha/ROADMAP_TODO.md` with this plan as the reason; this plan's
Status and Review Log.

## Not doing

- **Publishing mixes to the PDS.** D4(c)'s second half: a `fyi.forage.mix` lexicon after the
  four acts. Its own plan, once the shape has survived a month of use.
- **Per-post scoring, engagement ranking, or anything that reorders inside a source.** The
  deal is the only mixing there is; a source's own order is trusted.
- **Sharing a mix, or importing someone else's.** Needs D4's second half first.
- **Reordering or hiding sidebar rows.** Every mix is a row until someone has too many.
- **Mixing accounts you do not follow** (an author row). Following is one row; a single
  account as a row is a later ask and `feed()` already supports `{kind:'author'}` when it comes.

## Reasoning

**Why one multiplier and not one number per sort.** The owner's sentence has two halves —
*"I want more of this in this mix"* and *"it has to play nice with top etc sort"* — and a
weight that meant one thing under Default and had no meaning under Top would break the
second half the moment a reader touched the toolbar. A multiplier is the one shape that
reads the same everywhere: it is a share of the deal, it is a factor on likes, it is a
factor inside Hot's log (where ×2 is exactly 3¾ hours of youth, a number a reader can be
told). New is the deliberate exception, because time is the one order a weight cannot
touch without becoming the old flood.

**Why a deal for Default and not the newest-first pile.** The retired World board was the
pile: every source's posts, newest first, so it belonged to whichever source posted most.
Weighted round-robin is the oldest fair-share algorithm there is, it explains itself on the
dial, and it keeps each source's own order — which for a feed is the generator's ranking,
the thing the reader subscribed to the feed *for*.

**Why Home stores overrides and a custom mix stores rows.** The owner's rule is that Home is
*"by default all subscribed types."* If Home stored a full row list, a feed saved tomorrow
would be missing from Home until the reader visited Mixes — a default that has to be
maintained is not a default. A custom mix is the other object: the reader chose its members,
so a new subscription has no business appearing in it.

**Why the switch remembers the weight.** *"Deweighted to 0 effectively"* describes the
substrate's view — a source with weight 0 is not fetched. The reader's view is a row they
turned off and will turn back on, and a row that comes back at *Normal* when they had set
*More* has forgotten something they told it. Two controls, because they are two facts.

**Why device-local first.** The ring is device-local by tenet (*"a property of how you are
reading right now"*), and a mix is not that — it is a composition, account-shaped, like a tag
subscription. But tagsubs earned their PDS record after the local half existed and the shape
had settled, and LEXICONS.md's rule (*investigate, publish, socialize, validate*) is a week
of work that should follow a shape, not precede it. The model keys rows by a stable source id
and stores nothing that would not serialize into a record, so the publish step is additive.

**Why the mix is never exempt from the ring.** Settled 2026-09-04 in the owner's words: the
exemption exists for a board you *opened by name*; a mix is *"these things but within this
radius."* Re-shaping every constituent under a `mix` src is what makes that true by
construction rather than by a per-kind check that a new source kind could miss.

**Why notches and not a slider.** Board-cards decision 7, 2026-08-30: the card-size dial
replaced a slider because *"a notch is a choice a thumb can make; the slider moved in visible
jumps."* Three notches also keep the vocabulary small enough that the info line and the
journey can say what a weight did.

**Why the measurement is Phase 0.** Five plan claims in `fun/` were refuted by their own
measurements (memory: measure, don't predict). The one number this plan cannot reason its
way to is what a dozen parallel reads cost on a phone on the owner's real account; D6 is
decided by that number and nothing else.

## Verification

| Claim | Held by |
|---|---|
| A weight is a share of the deal under Default | `test/mix-deal.test.js` counts per round; the journey counts the first six rows |
| A weight lifts a small feed under Top and Hot, and does nothing under New | `test/engines.test.js` (×2 with half the likes ties); the journey switches to Top and finds the weighted row's post first |
| Unweighted posts sort exactly as before | the existing literal pins in `test/engines.test.js`, unmoved |
| Off is not fetched | the hermetic fixture counts requests per source |
| Home includes a subscription made later | `test/mixes.test.js` |
| A failed source is named, not fatal | `test/lens-mix.test.js` + the journey's info line |
| A mix is inside the ring | `test/lens-mix.test.js`: a hashtag stranger hidden at Follows with the exemption ON |
| Every control meets the tap floor | `e2e/mobile-fit.workflow.mjs` at 320/360/390 |
| The frames are the engine | `snaps/mixes/manifest.json` names the sha behind every file |

Declared gate for every landing: `npm test && npm run conformance`, `npm run reference-gate`,
`npm run workflows` — the four CI steps, run on the final tree.

## Review Log

- **2026-09-08 — drafted** from the owner's two statements (2026-09-04, 2026-09-08) and a
  survey of the subscription, board, route and sidebar plumbing. Nothing built. Awaiting D1,
  D4, D5 in particular.
- **2026-09-08 — Phase 0 measured** (`LIVE=1`, the standing test account, a laptop on
  wi-fi against `bsky.social` — NOT a phone on cellular; that run is still owed
  `[device: android]` before D6 is final). Sources = Following + popular generators found
  live + `#harvest` + `#foraging`, per-source timeout 8 s, through `lens.feed()`/`stream()`:

  | run | sources | wall | median per source | slowest | failed | posts loaded |
  |---|---|---|---|---|---|---|
  | 1 (cold) | 12 | 2341 ms | 696 ms | Mutuals 2339 ms | 0 | 276 |
  | 2 | 12 | 673 ms | 479 ms | Mutuals 673 ms | 0 | 277 |
  | 3 | 12 | 685 ms | 469 ms | Blacksky 684 ms | 0 | 277 |
  | 4 | 25 | 3119 ms | 578 ms | OnlyPosts 3116 ms | 0 | 569 |
  | 12 sequential | 12 | 5137 ms | — | — | — | — |

  Three readings. (1) **The count is not the cost.** Wall time is the slowest source, and
  the slowest source at N=25 was one straggler at 3.1 s while the median sat at 0.6 s; N=12
  warm was under a second. A cap on N would not have helped run 4. (2) **The payload is the
  cost that scales.** Each source answered with its full page (`limit: 30`), so one Home
  open loaded 277 posts and one at N=25 loaded 569 — twenty screens' worth, into a board
  cache budgeted at 3000. A mix should ask each source for a small page (10–15) and page
  the sources that run dry on *More*; the deal needs `weight` posts per round per source,
  not thirty. (3) **Parallel is the whole point:** the same twelve, one after another, took
  5.1 s. So D6 → (c): no cap; a per-source page size and a per-source timeout, and the board
  paints what answered, naming what did not. Open: the cold first run (2.3 s) is what the
  first open of the day feels like, and it is the phone number that matters.
- **2026-09-08 — all nine decisions closed by the owner.** D2–D9 as recommended ("yes to
  your smaller ones"; D4 "device local for now, yes, pds later, yes"; D5 "yes"). **D1 was
  reshaped**, not confirmed: the draft's weight was a share of the deal and nothing else,
  and the owner's model is a score — *"weighting upvotes so smaller feeds and such still
  surface … it has to play nice with top etc sort."* The draft could not have honoured that:
  under Top a deal-share weight is invisible. Resolved as one multiplier per row (×½ · ×1 ·
  ×2) read by every sort — § D's table — with New the stated exception. D8 grew a second
  half for the same reason (the heavier weight wins under a score). What this changes in the
  phases: Phase 2 now touches `js/engines/rank.js`, and its literal pins are the guard that
  unweighted boards do not move.
- **2026-09-08 — Phases 2–9 built** ("do full plan"). What the building found, in the order
  it bit:
  1. **The weight rode the dealt list and not the queues.** `lens.mix()` stamped `mixWeight`
     on the posts it dealt, and the board keeps the per-source queues and re-deals them after
     More — so on the board, Top sorted unweighted while the unit test (which read the dealt
     list) was green. Caught by the journey's Top claim; the substrate now stamps the sources
     themselves and the unit test pins that they agree.
  2. **Nothing wrote the last-board memory.** `setLastBoard` had one caller, the ring board,
     and it left with `/r/<rung>` on 2026-09-03; `/` has landed every returning reader on
     Following since. Feed boards and mix boards now write it (D5's "a returning reader keeps
     their last board" was not true before this).
  3. **On main, the door races its own registry.** Under the mixes fixture, `/` →
     `/f/following` paints "Unknown feed": the slug is registered by `ensureSavedFeeds()`,
     which the feed view does not await. The mix board awaits its subscriptions and has no
     such race. Not fixed here (a `/f/` view concern); the mock's Current frame is Discover
     for that reason, and the review log is where the finding lives until someone owns it.
  4. **`New` is the honest exception, and the board says so** — the info line reads
     *"New ignores weights"* when New is picked, per D1.
  5. The shim learned a declared failing route (`{ __status: 502 }`) so a journey can show a
     source that did not answer without a miss.
  6. The mock's Current frames are Discover (`/f/whats-hot`) and `/me` — the nearest surfaces
     on main to a board and to subscription management; neither address in this plan exists
     there.
