# Plan: come back to your place in the feed — and be told what changed while you were gone

date: 2026-09-01
status: **Phases 0, 1, 2, 3, 4 and 5 COMPLETE.** Phase 6 CLOSED AS UNNEEDED (see below). Phases 0–4 on `claude/feed-position-restore`, seven claims in `e2e/feed-position.workflow.mjs`; phase 5 landed as #46 — on `claude/feed-position` — mock `plans/mocks/feed-refresh.html` v4 (Current `forage@71f66f0`, Proposed `forage@09daed3`), nine claims in `e2e/mock-refresh.workflow.mjs`, gate green (680/680 unit, 86/86 conformance, 34 workflows). **Phases 0–4 and 6 unstarted.** D9 decided by the owner 2026-09-01; D13 resolved in 5a; **D14 settled by the owner 2026-09-01 on the v1 frames** — option (b), the pill; it is decision 5 of mock v2.
repo: `CroftCommunity/forage`
baseline: `main` @ `3345405` (quote-embed landed); **rebased onto `3132a25`** 2026-09-01 after reply-embeds (#48) and thread guides (#49) landed mid-flight
related: `claude/logged-out-refine` item 7 (the centre column's scroller) — **decided compatibly, see Reasoning D0**; `e2e/open-at-top.workflow.mjs` (the rule this must not break)

## Problem Statement

The owner, browsing forage.fyi on 2026-09-01:

> "Right now when I'm browsing, you know, a feed or a combination of feeds, and I click into
> a post and I read it and I come hit the back button it takes me back out to either a
> refreshed feed or all the way back out to the top. Ideally for me I want to browse the
> feed, go into a particular post, hit back and come back to my place in the feed … can you
> … start investigating what it would take to do that both on mobile and desktop … reliably.
> But then also I guess we have to think about like, okay, then how does the feed actually
> update, and we can talk through that."

This is **three losses wearing one coat**, and only the first is about scrolling.

**1. The offset is destroyed by a height collapse.** `render()` (`js/main.js:302`) calls
`mainEl.replaceChildren(out.main)` on *every* popstate. `feedBoardView` returns a skeleton
and fetches. So the browser restores the saved offset into a document that is one viewport
tall, and the clamp takes it to 0. Measured, `/f/whats-hot`, 30 rows:

| | scrollY | scrollHeight | rows |
|---|---|---|---|
| desktop 1280×900, scrolled to p29 | 3173 | 4073 | 30 |
| → open the post | 0 | **DONE**  — | — |
| → Back, **immediately** | **0** | **900** | **0** | ← the browser restores here |
| → Back, settled (600ms) | 0 | 4073 | 30 | ← too late; nothing retries |
| phone 390×844, scrolled to p29 | 4270 | 5274 | 30 |
| → Back, immediately | **0** | **844** | **0** |
| → Back, settled | 0 | 5274 | 30 |

`history.scrollRestoration` is `auto` and the browser did its job. It restored 4270 into an
844px document. **This is not a missing scroll store; it is an empty document at the instant
of restore.**

**2. The paged-in posts are gone.** `allPosts` and `nextCursor` are closure locals in
`feedBoardView` (`js/ui/lens-views.js:1126-1127`). Press More three times, reach post 87,
press Back: 30 rows. The offset the reader wants does not exist in the document at any
point, so no amount of scroll bookkeeping can reach it.

**3. Back refetches, so it is a different feed.** Measured `getFeed` calls across the
journey: **3 before Back, 4 after.** New posts arriving at the top shift everything down; a
pixel offset now addresses a different post. Restoring a number into a re-fetched feed is
restoring the wrong place accurately.

**A fourth thing the measurement turned up, unasked.** Three `getFeed` calls to render one
board on arrival. `store.subscribe(render)` re-mounts the entire view on every store change
— a session restoring, saved feeds landing — and each mount re-fires the fetch. Today that
already yanks a reader mid-browse if a background fetch lands under them. Phase 0.

## Approach

Everything below follows from one measured fact, so it is stated first.

**The browser will place the reader correctly if — and only if — the rows are in the
document synchronously, inside the popstate handler.** Probe: a synthetic page, 50 rows,
scrolled to 2500, torn down and restored, sampled every frame for five frames.

| engine | handler fills **synchronously** | handler fills **50ms later** |
|---|---|---|
| chromium | **2500** | 0 (and stays 0) |
| webkit | **2500** | 0 |
| firefox | **2500** | 0 |

The browser applies the saved offset *after* the popstate handler returns and *before* the
next animation frame. A handler that returns an empty document has already lost, in every
engine, and no later fetch reopens the window.

So the work is in the **render pipeline**, not in scroll code. Six phases.

| Phase | What | Held by (RED first) |
|---|---|---|
| 0 | **One mount per navigation.** `render()` re-mounts the board on every store change and refetches each time (measured 3×). Make a board mount once per navigation; a store change repaints without re-fetching. Prerequisite for everything below — a cache that is thrown away three times on arrival is not a cache | a workflow asserting exactly ONE `getFeed` per board navigation |
| 1 | **DONE**  **The instrument.** `history.scrollRestoration = 'manual'`; stamp every history entry with an id at `pushState` (`router.go`, `interceptLinks`, and every `replaceState` preserves it); save `window.scrollY` against that id on navigate-away; restore it synchronously on popstate. Add `data-uri` to `.postrow` (two lines; unlocks Phase 6) | a workflow reproducing the measured table above, RED on `main`, asserting a non-zero restored offset on desktop AND phone viewports |
| 2 | **DONE**  **The board record.** Per board identity, keep `{posts, cursor, sort, timeframe, savedAt}`. On return, render rows synchronously from the record; **do not fetch.** This is what makes Phase 1's restore land in the right document | `getFeed` call count does not increase across a Back; the restored row under the reader is the same post URI it was |
| 3 | **DONE**  **Board to board.** A *link* navigation to a board that has a record restores its offset instead of scrolling to top. The existing link-nav rule keeps applying to everything else, and `open-at-top` stays green. **Tapping the nav entry for the board you are already on is the tab-tap gesture: go to top and refresh** — otherwise D3 strands the reader | `open-at-top` unchanged; a new claim for board→board→board; a claim for the same-board tap |
| 4 | **DONE**  **The deep board.** More-paged posts survive the round trip (falls out of Phase 2), under the cap from D4 | Back after More ×3 restores a post from page 4 |
| 5a | **The bar has to be able to hold it.** `.sortbar` shrink-wraps to 295px inside a 680px column, so its `.grow` spacer measures **0** and nothing in it is right-aligned today (D13). Stretch the bar to its host, which moves the density and card-size dials to the column's right edge — a visible change to an approved surface, so it is drawn and captured before it is built | `mock-board` at both viewports: the bar's right edge meets the feed card's right edge; the dials keep their order and their 44px |
| 5b | **The control.** One control with states at the bar's right end: quiet ⟳ at rest, ⟳ + count when there is something, a spinner while fetching. After restoring, fetch page 1 in the background, diff against the record, and *announce* — never inject. Its count is a live region, so the change is heard and not only seen | a claim that the restored offset does not move when the background fetch lands; a claim that the count is announced; 44px at 390 |
| 5c | **The reader who is deep in the feed.** The bar is `position: static` and leaves the viewport at scrollY 256 (desktop) / 274 (phone) — under one screen, so the control is invisible in exactly the case it exists for (D14). **DONE** as option (b): a pill that appears only while the bar is off-screen and there is something to say, and stands down when the bar returns | `mock-refresh` R8, both frames |
| 6 | **CLOSED AS UNNEEDED — decision 4 removed its caller.** Was: **Prepend without moving anyone.** When the reader accepts new posts mid-list, measure the first visible row before and after and add the delta to the offset. Chrome and Firefox do a version of this automatically as CSS scroll anchoring; **Safari does not**, so it is done explicitly | a claim at 390×844 in webkit that a prepend leaves the anchored row's viewport position unchanged |

## Reasoning

**D0 — the centre column stays on the document scroller, so `window.scrollY` is the
instrument.** This was in genuine doubt: `claude/logged-out-refine` item 7 is the owner's
"can we make the center column scroll independently like reddit.com?", and a
`body { overflow: hidden }` three-column layout would have made the browser's per-entry
restoration inapplicable outright — the browser restores the *document* scroller, never a
nested one. That branch settled it the compatible way, in its own words:

> the PAGE keeps being the scroller and the two side columns are PINNED to it. Nothing here
> is a scroll container for the content, so the browser's scrollbar, the space bar,
> Home/End, `#anchor` links, **scroll restoration on Back**, and every `scrollIntoView` in
> the app and its journeys go on meaning what they meant.

This plan depends on that holding. If the three-column scroller is ever revisited, Phase 1's
instrument becomes the container's `scrollTop` and Phase 1 must be re-measured — so the
implementation reads the scroller through one accessor rather than naming `window` in a
dozen places.

**D1 — `manual`, not `auto`.** Counter-intuitive, since `auto` is free and measured correct
under a synchronous fill. But sampling every frame found Firefox painting one frame at 0
before landing at 2500, while a synchronous `scrollTo` under `manual` was correct on the
first sampled frame in all three engines:

| engine | `auto` (frames 1–5) | `manual` (frames 1–5) |
|---|---|---|
| chromium | 2500, 2500, 2500, 2500, 2500 | 2500, 2500, 2500, 2500, 2500 |
| webkit | 2500, 2500, 2500, 2500, 2500 | 2500, 2500, 2500, 2500, 2500 |
| firefox | **0**, 2500, 2500, 2500, 2500 | 2500, 2500, 2500, 2500, 2500 |

`manual` is also *required* anyway for Phase 3 — a link navigation to a cached board creates
a **fresh** history entry, for which the browser holds no offset at all. Measured: a
synchronous fill plus `scrollTo` on a pushState navigation lands at the saved offset
immediately and stays there, in all three engines. Since Phase 3 must own the restore, owning
it in Phase 1 too means one mechanism rather than two that can disagree.

**D2 — two caches, because they answer different questions.** Offsets are keyed by a stamped
**history-entry id**: this is exact, distinguishes two visits to the same board at different
depths, and gets Forward right for free. Board records are keyed by **board identity**: this
is what "board to board and back" needs, since that arrives on a new entry with no offset of
its own. One map cannot do both jobs.

**D3 — reload is a fresh start, so both caches are in-memory.** The owner: "I think reload
reloads the whole page so there is no scroll position to my mind at that point." This is a
real simplification, not a shortcut — no `sessionStorage`, no serialization, no schema to
version, and a reload becomes the natural way to reset a wedged cache. It also declines the
much larger ask in bsky's issue #4107 (resume where you stopped, across launches), which is
a different feature and should stay one.

**D4 — cap by posts, not by boards.** The owner: "we can cap the keys stored but it should
be cheap to do even like a hundred right? but likely to be a dozen usually." Measured on a
30-post board:

- **Data record: ~22 KB of JS heap** (20 retained copies cost 431 KB). So 100 shallow boards
  ≈ 2.2 MB; but a board paged to 120 posts is ~88 KB, and 100 of *those* is ~9 MB. A hundred
  is cheap — a hundred *deep* ones is not. Cap total retained posts (~3,000, LRU-evicted),
  which is a dozen ordinary boards or a couple of deep ones, and let board count follow.
- **Live DOM: 1,020 nodes and 73 KB of HTML per 30-row board.** I could not put a byte figure
  on retaining it — `JSHeapUsedSize` does not count DOM, and `measureUserAgentSpecificMemory`
  needs cross-origin isolation the harness does not have — so this is a node count, not a
  memory measurement, and it is stated that way deliberately. 100 boards would retain
  ~102,000 nodes plus their decoded images, which is the cost that does not show up in any
  counter here and is the reason not to guess about it.

Hence **the data record is the cache, at the owner's ~100 scale; keeping the live DOM node
is at most a small hot tier (1–3 boards) and is not required by any phase.** Deferred until
Phase 2 shows whether re-render is visibly worse than re-attach. Re-render's one weakness is
honest and known: `stage()` sets `--aspect` from the embed so most media rows are sized
before load, but a record with no aspect takes the cap and resizes on load — those rows will
shift, and Phase 6's anchor is the correction.

**D5 — Back restores; it never refetches.** This is the decision that makes the position
*honest* rather than merely *present*. Restoring a pixel offset into a re-fetched feed puts
the reader at a confident, wrong place — worse than the top, because the top is at least
legible as a reset.

**D6 — new posts are announced, not injected.** This is where the industry converged after
trying the alternative. Twitter's tweet-counter bar and Instagram's "New Posts" button both
replaced silent background reshuffles, explicitly because readers complained about the feed
moving under them. Restoring is automatic; refreshing is a press.

## Prior art

**bsky.app has not solved this**, which is worth stating plainly given that this workspace
treats social-app as canonical for *network* behaviour: it is not canonical for this.
[social-app#1352](https://github.com/bluesky-social/social-app/issues/1352) — "Going forward
and back in the browser loses position in the feed/tab" — was opened 2023-08-31, is still
open, labelled `bug` and `x:on-the-roadmap`, with no linked PR.
[social-app#4107](https://github.com/bluesky-social/social-app/issues/4107) asks for the
harder across-launches version. Third-party clients sell it as a differentiator: Boost Blue
advertises "Preserved Feed Position".

[TanStack Router](https://tanstack.com/router/latest/docs/guide/scroll-restoration) reaches
the same mechanical conclusion — restore "after successful navigations **before DOM paint**"
— and exposes exactly the key choice this plan makes in D2: its default key is the history
entry, and `getKey` lets an app switch to `location.pathname`. Its escape hatch for
virtualized lists (`useElementScrollRestoration` → `initialOffset`) is the same idea as
Phase 2: hand the renderer the offset up front rather than scrolling after the fact.

For Phase 6, the technique is [scroll anchoring](https://github.com/josh/scroll-anchoring) /
React Native's `maintainVisibleContentPosition`: measure the first visible item's position
before and after the prepend and add the difference to the offset.

## Open decisions

- ~~**D9 — where "12 new posts" lives.**~~ **DECIDED 2026-09-01 by the owner:** on the feed
  column, at the top of the post stack, **on the same horizontal line as the sort control
  bar, right-aligned** — an indicator and a refresh button. Not the left rail (which the
  earlier sketch favoured "since that bar doesn't move") and not the masthead. This settles
  the phone problem the rail had: `claude/logged-out-refine` pins the left nav only at
  `min-width: 801px`, so a rail indicator would have been invisible on the surface the owner
  actually reads on. The bar is in the column at every width. Two obstacles were measured
  after the decision and are recorded as D13 and D14 — neither changes the placement.
- ~~**D10 — does the pill carry a count or just "new posts"?**~~ **ANSWERED by what shipped (#46):**
  a count. The control reads `3 new` and the pill `↑ 3 new posts`, and `mock-refresh` R5 holds that
  the number is the number that arrived. Original note: A count needs a real page-1
  fetch and a diff; "new" could ride a cheaper signal. Phase 5 needs this settled.
- ~~**D11 — the stale threshold**~~ **ANSWERED 2026-09-02: there is none, and none is wanted.**
  With the trigger settled as "on return to a board", every return checks — one page-one request,
  which the record makes cheap. A threshold would only suppress an answer the reader is standing
  there waiting for. The recommendation below was right and is now the behaviour. Original note:, and whether a very old record still restores. Recommendation:
  it always restores, and the pill says more — silently discarding a reading position is the
  bug being fixed here, and age does not change that.
- ~~**D12 — does a keep-alive hot tier earn its complexity?**~~ **ANSWERED by Phase 2 (#50): no.**
  The question was whether retaining a live DOM node would restore more accurately than
  re-rendering from data. Measured with Phase 2 in hand: re-rendering reproduces every row height
  exactly and the restored offset holds through the whole settle — once `stage.js` remembers the
  ratios it has measured, which was the only thing that actually moved. A keep-alive tier would
  buy nothing measurable and would cost retained DOM and decoded images, the one cost this plan
  could never put a number on (D4). Closed rather than deferred.
- **D13 — the bar does not currently right-align anything, and fixing it moves two existing
  controls.** Measured: `.sortbar` is a shrink-wrapping flex item inside a full-width host, so
  it is **295px wide in a 680px column** and its `.grow` spacer measures **0px**. The density
  and card-size dials are therefore *not* at the column's right edge — they sit right after
  the Sort pill, leaving **385px of unused bar on desktop** and 79px on the phone. Stretching
  the bar is a one-line CSS change, but it relocates two approved controls by that distance,
  which is a visible change the owner should see rather than discover. Hence Phase 5a draws it
  first. Open sub-question: does refresh sit *outboard* of the two display dials (furthest
  right, the conventional home for a refresh affordance) or *inboard* of them, keeping the
  display controls together as one family? Recommendation: outboard — refresh acts on content,
  the dials on presentation, and the outermost position is the one a thumb reaches.
- ~~**D14 — the chosen line scrolls away, so it cannot be the whole answer.**~~ **DECIDED 2026-09-01
  by the owner, on the v1 frames: option (b), the pill.** It is decision 5 of mock v2, built and
  held by R8 at both viewports. The reasoning is kept below because the rejected options are the
  reason the chosen one is right, and a later session asking "why isn't the bar just sticky?"
  should find the 14%-of-a-phone answer here rather than re-deriving it. Measured: the
  toolbar is `position: static` and its bottom leaves the viewport at **scrollY 256 (desktop)
  / 274 (phone)** — less than one screen. A reader restored to 4270px on a phone is 15 screens
  past it. So the control is out of sight in precisely the situation Phase 5 exists to serve:
  you came back to a deep position and something changed. Three ways out, for the owner:
  **(a)** make the toolbar sticky under the masthead — always visible, costs 56px on the phone
  on top of the 61px masthead, so 14% of an 844px viewport is permanently chrome;
  **(b)** keep the bar as the control's home and add a floating pill that appears *only when
  the bar is off-screen and there is something to report* — costs nothing at rest, and is what
  Twitter and Instagram converged on; **(c)** accept the limit and treat the control as an
  arrival-and-near-the-top affordance only. Recommendation: **(b)**. It keeps the owner's
  placement as the resting home, spends no permanent vertical space on a phone, and the
  floating pill is the surface that can also carry the Phase 6 "accept these posts" press.

## Measurements

Probes are scratch, not committed; each is reproduced by the workflow its phase owes.

1. **The height collapse** — real app, `e2e/harness/scenario.mjs`, `/f/whats-hot`, 30 rows,
   desktop 1280×900 and phone 390×844. Table in the Problem Statement.
2. **`getFeed` call count** — counted in-page by wrapping `window.fetch` above the harness
   shim: 3 before Back, 4 after.
3. **Restore ordering and engine agreement** — synthetic page, chromium/webkit/firefox,
   sync vs +50ms fill, `auto` vs `manual`, sampled per frame. Tables in Approach and D1.
4. **Link-nav restore** — pushState to a cached board, synchronous fill + `scrollTo`:
   immediate and settled both at the saved offset in all three engines.
5. **Per-board cost** — 30-post board: data ~22 KB heap; DOM 1,020 nodes / 73 KB HTML
   (node count only — see D4 for why there is no byte figure).
6. **The sort bar, for D9's placement** — real app, `/f/whats-hot`, both viewports:
   `position: static`; host spans the column (680 desktop / 374 phone) but `.sortbar` measures
   **295px** in both and `.grow` measures **0**; bar right edge 545 vs the feed card's 930 on
   desktop (303 vs 382 on the phone); the bar's bottom leaves the viewport at scrollY 256 /
   274; bar height 46 desktop / 56 phone, masthead 61.

## Execution notes — 5a/5b/5c, 2026-09-01

**The mock earned its keep on its first capture**, which is the case MOCKS.md P2 is written
for. Two defects, neither caught by review, both fixed before publication:

- At 390 **with a count showing**, the bar wraps to two rows and the control landed at the
  **left** of row two — the opposite of the owner's ask. `.grow` right-aligns only while
  everything fits one line; the spacer stays on row one. `margin-left: auto` fixes it, and R9
  now measures it. **The at-rest frame fits one row and could never have shown this** — the
  frame that found it is the one drawn under load.
- The pill's brand green sat on the fixture's green video frame and all but vanished. It now
  carries a 2px ring in the page's own ground.

**Phase 0 bit the fixture before it bit a reader.** The harness's sequenced responses were
first written to advance per request. They had run to the end of the sequence before the test
could say "now the world changes", because the board mounts three times on arrival. Advancing
on an explicit `__shimAdvance()` says *when*, which is the thing under test. Recording it here
because it is the first concrete cost of the triple-mount beyond the wasted fetches.

**Three mutations, three reds** (green state committed first, per CLAUDE.md): injecting instead
of announcing kills R5; moving refresh inboard of the dials kills R2; dropping the wrapped-row
alignment kills R9.

**Two gate catches** on the way through: an orphaned class literal (`.refresh-words` with no
stylesheet rule) and an unprecached module (`/js/ui/refresh-control.js` missing from the sw
SHELL). Both are checks this repo already had, doing their job.

**What this landing does NOT do.** Phases 0–4 and 6 are unstarted, and the reported bug — press
Back, land at the top of a refreshed feed — is **still there after this lands**. Phase 5 was
built first because it is the half that needs nothing from the other half: the count asks only
"is there anything newer than the post you are holding", never the board record. So this ships
the *update* policy (announced, never injected) while the *position* policy is still to build.
Anyone reading the changelog entry should not expect their place in the feed to be kept yet.

**Rebased mid-landing, and the mock was re-captured rather than re-labelled.** Two features
landed on `main` while this branch was open (#48 reply embeds, #49 thread guides), both
touching `css/app.css`, `js/ui/lens-views.js` and `scripts/mock-snaps.mjs`. After the rebase
every sha had moved: v2's `mock-baseline` named a tree that was no longer what the owner runs,
and its `mock-proposal` named a pre-rebase commit on no branch and destined for gc. Nothing in
the design changed and no frame looks different — but a sha that does not name a live tree is
precisely the drift MOCKS.md rule 2 exists to prevent, so **both columns were captured again**
(v3) instead of editing the metas to fit. Gate re-run green on the merged tree: 682/682 unit
(two new tests arrived with #48), 86/86 conformance, 34 workflows 0 failed.

**Rebased a second time, onto #47** (the signed-out board), which reworked this exact surface:
`js/ui/sortbar.js` gained per-board timeframes, the rail lost its Feeds card, Trending moved
into the nav. `boardToolbar` had grown an options object, so `refresh` went into it rather than
becoming a third positional argument. This time the re-capture changed **every** frame, where
v3's had come back byte-identical — the difference is the whole reason a mock names its trees.
The control is unaffected and still ends at the column's right edge. Gate green again: 688/688
unit, 86/86 conformance, 34 workflows 0 failed.

## Phases 0–4, executed 2026-09-02

**The measured failure was never the scroll offset.** Four `getFeed` calls to arrive at one
board; the paged-in posts held in closure locals that died with the view; and a document that
was empty at the instant the browser restored. `js/board-cache.js` answers phases 0, 2 and 4
together, because all three are the same question — *does this board still know what it was
showing?*

**Two things the measurements changed rather than confirmed:**

- **The restore landed exactly right and then the floor moved.** `scrollTo(0, 3877)` was
  correct; 50ms later the document had shrunk 168px as one stage resolved its picture ratio,
  and the browser clamped the scroll to the new height. `js/ui/stage.js` already *documented*
  this — "the one case a board can jump" — and it was survivable while every board was built
  once from a fresh fetch. Repainting from a record made it load-bearing. The stage now
  remembers what it measured, keyed by src, which also fixes the jump for an ordinary reader
  scrolling back up a board.
- **In-flight dedupe was not optional.** Two mounts race, both miss an empty cache, both
  fetch. The count went 4 → **2**, not 4 → 1, until `board-cache` tracked flights.

**Phase 6 is closed as unneeded, not deferred.** It was specified as "when the reader accepts
new posts mid-list, measure the first visible row before and after and add the delta". Decision
4 removed its caller: nothing is ever prepended without an explicit press, and that press takes
the reader to the top by design. Building the anchor maths now would be code with no path to
it. The half of Phase 6 that turned out to be *real* — content changing height under a reader —
arrived from the opposite direction as the stage's measured-ratio memo, which is the same
promise kept at the point where the shift actually happens. If a future decision ever does
inject mid-list, this phase reopens with its original spec.

**Seven claims, six mutations, six killed.** One survived on the first round and the fault was
in the claim, not the code: P6 pressed an anchor at the top of the document through
`page.click()`, which scrolls its target into view *before* clicking — so the page was already
at 0 and the assertion was reading Playwright's scroll rather than ours. Deleting the entire
rule under test left it green. It now clicks programmatically and asserts the premise at the
moment of the press.

**One regression, caught by this repo's own gate.** Stamping the first history entry went
through `pathOf()`, which is pathname + search and drops the **fragment** — and atproto's
browser OAuth returns `code`/`state` in the fragment. Sign-in broke outright, and
`e2e/signin.workflow.mjs` said so in words: "the callback params must survive until the
exchange reads them". `stampCurrent()` now omits the url argument, which is all it ever needed
to do. Worth recording because nothing in the diff *looked* like it touched authentication.
