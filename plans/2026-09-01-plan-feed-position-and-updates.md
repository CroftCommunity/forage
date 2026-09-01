# Plan: come back to your place in the feed — and be told what changed while you were gone

date: 2026-09-01
status: **WRITTEN, nothing built.** Mechanism decided by measurement (below); phases 1–6 unstarted.
repo: `CroftCommunity/forage`
baseline: `main` @ `3345405` (quote-embed landed)
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
| → open the post | 0 | — | — |
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
| 1 | **The instrument.** `history.scrollRestoration = 'manual'`; stamp every history entry with an id at `pushState` (`router.go`, `interceptLinks`, and every `replaceState` preserves it); save `window.scrollY` against that id on navigate-away; restore it synchronously on popstate. Add `data-uri` to `.postrow` (two lines; unlocks Phase 6) | a workflow reproducing the measured table above, RED on `main`, asserting a non-zero restored offset on desktop AND phone viewports |
| 2 | **The board record.** Per board identity, keep `{posts, cursor, sort, timeframe, savedAt}`. On return, render rows synchronously from the record; **do not fetch.** This is what makes Phase 1's restore land in the right document | `getFeed` call count does not increase across a Back; the restored row under the reader is the same post URI it was |
| 3 | **Board to board.** A *link* navigation to a board that has a record restores its offset instead of scrolling to top. The existing link-nav rule keeps applying to everything else, and `open-at-top` stays green. **Tapping the nav entry for the board you are already on is the tab-tap gesture: go to top and refresh** — otherwise D3 strands the reader | `open-at-top` unchanged; a new claim for board→board→board; a claim for the same-board tap |
| 4 | **The deep board.** More-paged posts survive the round trip (falls out of Phase 2), under the cap from D4 | Back after More ×3 restores a post from page 4 |
| 5 | **What changed while you were gone.** After restoring, fetch page 1 in the background, diff against the record, and *announce* the count. Never inject. Placement is an open decision (D9) | a claim that the restored offset does not move when the background fetch lands |
| 6 | **Prepend without moving anyone.** When the reader accepts new posts mid-list, measure the first visible row before and after and add the delta to the offset. Chrome and Firefox do a version of this automatically as CSS scroll anchoring; **Safari does not**, so it is done explicitly | a claim at 390×844 in webkit that a prepend leaves the anchored row's viewport position unchanged |

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

- **D9 — where "12 new posts" lives.** The owner: "maybe we show something on the left side
  since that bar doesn't move, or we have a notifications thing in the top bar and this is
  one of them, we'll have to see how it looks and behaves." **A constraint to weigh first:**
  `claude/logged-out-refine` pins the left nav only at `min-width: 801px`; below that it is a
  drawer, so a left-rail indicator is *invisible on a phone* — the surface the owner reads on.
  So the left rail can be the desktop home, but it cannot be the only home. Decide against a
  mock (MOCKS.md: built from the engine, both viewports, the reader's own skin).
- **D10 — does the pill carry a count or just "new posts"?** A count needs a real page-1
  fetch and a diff; "new" could ride a cheaper signal. Phase 5 needs this settled.
- **D11 — the stale threshold**, and whether a very old record still restores. Recommendation:
  it always restores, and the pill says more — silently discarding a reading position is the
  bug being fixed here, and age does not change that.
- **D12 — does a keep-alive hot tier earn its complexity?** Answer with Phase 2 in hand, not
  before.

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
