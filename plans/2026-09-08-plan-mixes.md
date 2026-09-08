# Plan: Mixes — a Home board made of everything you subscribed to, and the page that tunes it

date: 2026-09-08
**Status:** DRAFTED, NOT STARTED. Nine decisions below need the owner; D1, D4 and D5 change
what gets built. Retires roadmap E159 when the first phase lands.
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
- **Weights are notches, not a slider.** `Less · Normal · More` = 1 · 2 · 3 (see D1). Off is
  the switch, not a fourth notch: the switch remembers the weight, so turning a row back on
  restores *More* rather than *Normal*. The owner's *"deweighted to 0 effectively"* is what
  the substrate sees; the reader sees a switch.
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
one list. **Weighted round-robin:** in each round, source *i* contributes up to `weight_i`
posts, sources ordered by weight descending then source id; a queue that runs dry is skipped
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
is the deal, *New/Hot/Top* are the existing client-side sorts over the loaded window. The
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
| **D1** | What is a weight? | (a) share of the deal — *More* is 3 posts per round beside *Normal*'s 2; (b) a multiplier on recency so a heavy source's older posts float up; (c) a per-page cap | **(a).** Explainable in one sentence, order inside a source untouched, and the number on the dial is the number you see. (b) reorders across sources, which is the flood again with extra steps. Notches 1·2·3 named *Less · Normal · More*; a fourth notch is a later ask, not a design change. |
| **D2** | Where does the Off switch live? | (a) a switch per row that remembers the weight; (b) Off as the dial's zero | **(a).** The owner named a "disable slider" and a weight as two things; a row turned back on should come back where it was. |
| **D3** | A new custom mix starts as? | (a) empty — everything listed, everything off; (b) a copy of Home | **(a).** A mix is picked into. A copy of Home is one tap from being Home and hides the difference. |
| **D4** | Where does a mix live? | (a) device-local `forage.mixes`; (b) a `fyi.forage.mix` PDS record from day one; (c) local now, publish later on the tagsub pattern | **(c).** Minting a record type is cheap and permanent (LEXICONS.md) and needs the four acts; a device-local Home ships the board this month. The model in A is written so (c)'s second half is an addition. |
| **D5** | Does Home become the first-time landing board? | (a) yes — `FIRST_TIME_BOARD` becomes Home; (b) no — Home is a sidebar row like any other | **(a).** "Default Home mix" reads as the door, not a row. Returning readers keep their last board either way. |
| **D6** | Fan-out bound | (a) none — every enabled source, measured live on the owner's account before deciding; (b) a cap with honest overflow like the old `RING_CAP` | **(a) first, then decide.** A dozen parallel reads is what the old World board already did. The measurement is a phase, not a guess. |
| **D7** | Does the mix board keep the sort toolbar? | (a) yes, Default = the deal; (b) no toolbar, the deal only | **(a).** The toolbar's other sorts are client-side over the loaded window and cost nothing; a reader who wants newest-first across everything has *New*. |
| **D8** | Dedupe credit | (a) the first source to deal a post keeps it; (b) the heavier source | **(a).** Deterministic and cheap; (b) requires knowing every source's membership before dealing. |
| **D9** | Lists (`savedFeeds` kind `list`) | (a) rows in a mix like feeds; (b) out of scope | **(a).** They are already subscriptions and `feed()` already fetches them. |

## Phases

Each phase is RED first and leaves the tree green. Files named where they are known.

### Phase 0 — measurement (no code) · a `LIVE=1` probe
`e2e/mixes-fanout-live.workflow.mjs`: signed in as the test account with the owner's source
count seeded, time a Home page open (N requests in parallel, per-source timeout 8 s), record
wall time and the slowest source, three runs. Result goes in the Review Log and settles D6.

### Phase 1 — the model · `js/mixes.js` · `test/mixes.test.js`
Home from a subscription list (timeline + feeds + tags → rows, all on, Normal); overrides
persist and apply; a new subscription appears in Home on; a custom mix starts empty; weights
clamp; unknown source ids survive as *no longer subscribed*; Home cannot be deleted or
renamed to nothing; slugs collide → refused by name; corrupt storage → Home alone;
`onChange` fires on every write.

### Phase 2 — the deal · `js/mix-deal.js` · `test/mix-deal.test.js`
Weight 3 contributes 3 per round beside 2 and 1; weight 0 contributes nothing and is never
a queue; a dry queue is skipped and resumes when refilled; duplicates by uri drop, first
source wins; order within a source is preserved; the deal is deterministic for one input;
`length ≤ sum of inputs`. A property test over random queues for the last three.

### Phase 3 — the substrate · `js/substrates/lens.js` `mix()` · `test/lens-mix.test.js`
Fake session with one route per source: all answer → one deal; one 502 → `failures`
carries it with words and the rest paint; one hangs → the timeout fails it and the rest
paint; cursors returned per source and *More* pages only the sources that had a cursor; a
timeline envelope keeps its `itemKind` (repost, reply) through the re-shape; every dealt post
carries `feedKind:'mix'`, and at Follows a stranger's post from a hashtag row is **hidden** —
the exemption never sees the constituent (the sentence E159 exists for).

### Phase 4 — the board and route · `/m/:slug` in `js/main.js`, `mixBoardView` in `js/ui/lens-views.js`
`test/routes.test.js` sees the route; board-cache key `mix:<slug>`; info line with sources
and failures; the empty-mix invitation; *More*; `currentBoardId`. `e2e/mixes.workflow.mjs`
(hermetic; timeline + 2 feeds + 1 hashtag): the board paints, the deal is visible (a
weight-3 feed shows 3 of the first 6), a failed source is named, *More* extends.

### Phase 5 — the sidebar · `js/ui/nav.js`
Mixes section above Feeds, Home first; guest sees none; `aria-current` on the open mix.
Journey extends `e2e/mixes.workflow.mjs` and `e2e/guest-surface.workflow.mjs`.

### Phase 6 — the Mixes page · `/mixes`, `/mixes/:slug`
Rows per subscription grouped by kind; switch + three-notch dial at 44px; New mix; rename;
delete (not Home); *no longer subscribed* rows. Journey: turn `#foraging` to *Less*, open
Home, it deals 1 per round; switch it off, it is gone and not fetched (the fixture counts
requests); make *Weekend* from two rows, it appears in the sidebar and paints those two.
`e2e/mobile-fit.workflow.mjs` covers the page at 320/360/390.

### Phase 7 — Home as the door (D5) · `js/last-board.js`
`FIRST_TIME_BOARD` → Home; a returning reader's last board still wins; `test/last-board.test.js`.

### Phase 8 — the mock · `plans/mocks/mixes.html` + `snaps/mixes/`
Per MOCKS.md: captures of the engine, Current (main: `/f/following`, the Feeds sidebar)
beside Proposed (`/m/home`, the Mixes page, the sidebar), phone and desktop, in one skin,
against a population that STRESSES it — twelve sources, a 60-character feed name, a
hashtag row that failed, a mix with everything off. Captured in the same landing as any
decision that changes in code.

### Phase 9 — the documents
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

**Why a deal and not a sort.** The retired World board was the sort: every source's posts
into one pile, newest first. That makes weights impossible to express — a weight has to say
*how often*, and a timestamp order has no "how often" in it. Weighted round-robin is the
oldest fair-share algorithm there is and it explains itself on the dial: *More* is three of
every six. It also keeps each source's own order, which for a feed is the generator's
ranking — the thing the reader subscribed to the feed *for*.

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
| A weight is a share of the deal | `test/mix-deal.test.js` counts per round; the journey counts the first six rows |
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
