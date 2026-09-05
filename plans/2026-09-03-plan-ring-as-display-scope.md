# Plan: the ring as a display scope — one composable pill, every surface

**Status:** **PHASES A–E COMPLETE (2026-09-03)** on `claude/ring-scope`; gate green on all
four CI steps (npm test 780/780, conformance 86/86, workflows 38/38, reference-gate 2/2).
Not merged. Phase F (mock captures) outstanding. All four decisions closed by the owner
the same day — see *Open decisions*, kept with their answers rather than deleted, because
Decision 1 was the one the earlier plan got wrong and the reasoning is the record.
~~DRAFTED, NOT STARTED. Awaiting owner sign-off on Decision 1.~~
**Worktree:** `worktrees/ring-scope/forage` on `claude/ring-scope`.
Claim: `CroftC/.coordination/claims/forage--ring-scope.md`.
**Supersedes in part:** `plans/2026-08-26-4-plan-views-and-the-ring-ladder.md` — see
*Reasoning § Why the top-bar pill is now right, having been wrong.*

---

## Problem Statement

The ring answers the wrong question. Today it is a **destination**: five rungs, five
boards, five rows in the sidebar under "Your ring", each at `/r/<rung>`
(`js/main.js:177`, `js/ui/nav.js`). Picking one means *"take me to a board of my
follows."* The owner wants it to be a **scope**: *"everything you show me is my
follows."* Those are different objects wearing the same word, and the difference is
visible in exactly one place — what happens to every OTHER surface when a rung is
picked. Today: nothing. A feed, a hashtag, a thread, a search result are all
untouched by the ring, because the ring is only ever the board you are standing on.

Four things follow, and only the first is cosmetic.

1. **The sidebar section is the wrong shape for the job.** Five nav rows say "five
   places to go." A scope is one control with a current value, which is what the
   owner's reference image is: a segmented pill, persistent, single-click switching.

2. **Nothing composes.** The five rungs are a frozen array (`LADDER` in
   `js/rings.js`). A reader who wants only three stops, or who wants a fourth built
   from "my follows plus one feed," has no way to say so, and adding one means
   editing the app.

3. **`RING_CAP` is a fetch bound being asked to act as a filter bound.**
   `membersFor()` truncates the `hop` rung at 25 members (`js/substrates/lens.js:600`)
   because a ring BOARD fans out one author-feed request per member. A ring FILTER
   fans out nothing — it tests authorship on posts already fetched — so the cap is
   both unnecessary and, worse, dishonest there: a capped member set used as a filter
   silently hides everyone past the 25th, which is exactly the class of thing DL-016
   exists to forbid. The two uses need different sets.

4. **The ring has no place in the filter order.** Blocks are applied pre-shape
   (`shapeLensFeed`), mutes inside `shapeLensPost` as `hidden`. The ring is applied
   nowhere, because it is a board query rather than a policy. The owner's stated order
   is **blocks → mutes → ring → display**, which means the ring becomes the fourth
   policy in the shape layer and needs a seat there.

## Approach

### 1. A scope registry, not a ladder

`js/rings.js` grows from a frozen five-element array into a **registry of scopes**,
each an object rather than a tuple:

```
{ id, label, blurb, rank, members(graph), needs }
```

- `rank` is the **containment rank** — the position of this scope in the real
  containment chain. It is the load-bearing field.
- `members(graph)` returns the DID list, or `null` for "do not filter."
- `needs` names the graph reads the scope requires (`follows`, `followers`,
  `hopFollows`), so a scope nobody has selected costs nothing.

The registry ships with today's five rungs, their math unchanged. Nothing about the
cumulative-union definition moves; `test/rings.test.js` and its counterexample stay
exactly as they are.

### 2. The pill is a stored, ordered list of scope ids

A new `js/ring-scope.js`, following the `js/board-density.js` preference pattern
(localStorage key, `onChange` listeners, a resolution order, device-local — never
`forage.state`):

- `STOPS_KEY = 'forage.ringstops'` — the reader's chosen stops.
- `SCOPE_KEY = 'forage.ringscope'` — the currently selected stop.
- Default stops: **see Decision 1.**
- **The pill always renders sorted by `rank`, never by stored order.** A reader who
  drags "world" into the middle gets it re-sorted, not honoured. This is the whole
  reason `rank` exists: the 2026-08-26 plan's defect was that stepping outward could
  show you *less*, and a user-composable stop list re-opens that defect the moment
  order is taken from the list rather than from containment.
- Adding a stop is `stops.add(id)`; the pill grows. Removing the selected stop falls
  back to the widest remaining. A one-stop pill renders as nothing (a control with one
  value is not a control).

### 3. The ring joins the posture, and applies in the shape layer

`buildPosture()` grows a `ring` field: `{ members: Set | null, exemptKinds: Set }`.
`shapeLensPost()` gains a fourth `hidden` branch, placed **after** the muted-word
check so the order in code is the order the owner named:

```
blocked   -> filtered pre-shape in shapeLensFeed        (unchanged)
labelled  -> hidden                                      (unchanged)
muted     -> hidden                                      (unchanged)
muted word-> hidden                                      (unchanged)
RING      -> hidden   <- NEW, and only here
display
```

Hidden, not badged. The owner's 2026-08-26 tenet — *"muting makes content ABSENT,
never present-with-a-label"* — applies identically: a row saying "outside your ring"
would cost a line of attention and announce what is being withheld.

Because every board, thread and search result already funnels through
`shapeLensPost(post, src, posture)`, this is site-wide by construction rather than by
eleven call sites remembering to opt in.

### 4. The feeds/hashtags exemption

`shapeLensPost` already receives `src`, which carries `feedKind` (`js/substrates/
lens.js:1149`). The exemption is a `src.feedKind` test against `posture.ring.exemptKinds`,
so it costs one set lookup and needs no new plumbing.

Advanced setting, on `/me` under the existing `<details data-advanced>` block
(`js/ui/lens-views.js:2899`), beside Alt text and Deep threads:

> **Exclude feeds and hashtags from your ring** *(checked by default)*
> Your ring scopes what you see. Feeds and hashtags are things you went and asked
> for, so by default they arrive whole. Uncheck this and your ring applies to them
> too — a quiet feed can then look empty, which is the setting working.

Checked = exempt = unfiltered. Unchecked = the ring applies everywhere.

### 5. What the nav loses, and what the chrome gains

`navTree()` drops its `Your ring` section and the `LADDER` import. `/r/:rung` routes
are **retired**, not redirected — pre-1.0, no compatibility layer (repo rule). The
pill renders in the masthead (`js/main.js:70`), signed-in only: signed out there is no
ring section at all today, and the guest-surface rule (49cf873) says a control a
reader cannot use is hidden rather than greyed.

### 6. Cost, and why the default is World

Scoping is a graph walk. Today it is paid only when you visit a ring board; site-wide
it would be paid on the first board of every session that is not scoped to World.
Mitigations, in order:

- **Default scope is World** — a fresh reader pays nothing, and the feature is
  something you turn on. This matches today's `let activeRing = 'world'`.
- The existing `ringCache` (`js/substrates/lens.js:1098`) already de-dupes concurrent
  and repeat computations for a session.
- `fol` and `mut` need `getFollows` + `getFollowers` — paged, but no fan-out.
- `hop` needs one `getFollows` **per mutual**. As a filter this is the only genuinely
  expensive scope, and it is the one that cannot be capped honestly (Problem 3).

### Phases

- **A — registry.** `js/rings.js` becomes scopes with `rank`; `membersFor` split into
  `membersFor` (capped, for the board fan-out that still exists) and
  `scopeMembers` (uncapped, for filtering). RED first: a test that the filter set is
  never truncated. Keeps `test/rings.test.js` green untouched.
- **B — preference module.** `js/ring-scope.js` + `test/ring-scope.test.js`: stored
  stops, rank-sorted rendering, removal fallback, the one-stop case.
- **C — posture + shape.** `ring` on the posture, the fourth `hidden` branch, the
  `feedKind` exemption. Tests in `test/lens-posture.test.js` shape: a post from
  outside the ring is absent; a feed post is present while exempt and absent when not.
- **D — chrome.** The pill in the masthead, `Your ring` out of the nav, `/r/:rung`
  retired, last-board/scroll-memory checked for rung assumptions.
- **E — advanced setting** on `/me`, wired to `exemptKinds`.
- **F — gate + mock.** `npm test`, conformance, a11y (44px tap floor on every
  segment — the pill is the tightest control on a 390px phone), and a
  `mock-baseline`/`mock-proposal` pair per MOCKS.md against a population built to
  stress it: a reader whose follows are quiet, so the Follows stop renders an
  honestly-empty board.

## Open decisions

### Decision 1 — what the middle stop is — **CLOSED: 1a** (owner, 2026-09-03: "1a seems right")

The owner's words, twice: **`follows -> mutuals -> world`**, left to right, with
*"if follows is set I only want to see content from people I follow"* and *"if mutuals
is set, I want to see content from mutuals + follows."*

Under the ladder the owner already approved, mutuals are a **subset** of follows
(`mut` = follows ∩ followers; `fol` = that plus everyone you follow). So
"mutuals + follows" computes to exactly the `fol` rung, and the two stops would show
identical content. One of two things is meant:

| | Stops | Middle stop is | Cost |
|---|---|---|---|
| **1a** *(recommended)* | `Mutuals \| Follows \| World` | today's `mut` — follows ∩ followers | cheap; two graph reads |
| **1b** | `Follows \| Mutuals+1 \| World` | today's `hop` — your follows plus everyone your mutuals follow | one `getFollows` per mutual, and uncappable as a filter |

**1a** keeps the owner's *sentences* ("only people I follow" is the Follows stop;
Mutuals is tighter) and flips the *order* they were written in. **1b** keeps the
*order* exactly and makes the middle stop genuinely wider than follows, which is the
only way that order can be true.

Recommending **1a** on two grounds beyond the set math: `hop` is the one scope whose
cost scales with your mutual count, and it is the one that cannot be truncated
without lying about what it hid (Problem 3). Under 1a, `hop` stays in the registry —
a reader who wants it adds it as a fourth stop, which is what composability is for.

Either way this is a one-line default in `js/ring-scope.js`. It is called out here
because getting it wrong silently ships a pill with a stop that changes nothing.

### Decision 2 — does the ring apply inside a thread? — **CLOSED: yes** (owner: "yes, it should apply site wide")

The recommendation here was *no* — exempt a thread's replies on the same reasoning as
the feeds exemption. The owner overrode it: site-wide means site-wide. Recorded as a
reversal rather than edited away, because the concern that produced the recommendation
is real and its answer is Decision 4: an out-of-ring reply is a reply whose answer you
cannot see, so the thread grew its own widening control instead of an exemption. The
exemption would have made the case invisible; the override makes it recoverable.

One consequence the implementation had to handle: a thread reached by direct link whose
ROOT your ring hides. That post shapes with `hiddenReason: 'scope'` — a machine token,
no wording — so the view can tell "your ring hid this" from "this post does not exist".

### Decision 4 — the thread pill — **CLOSED: a transient override** (owner: "just overrides the thread")

A ring control at the top of a thread, adjusting *that thread only*. The override is an
argument to `lens.thread()` held in the view's closure — never written — so navigating
away drops it by construction rather than by cleanup, and the masthead pill is exactly
where the reader left it.

### Decision 3 — pill labels on a phone — **ANSWERED BY THE GATE, not by judgement**

The plan proposed icon + label at three stops. Building it produced a harder answer:
the pill cannot live in the masthead at all. `e2e/avatar-nav.workflow.mjs` pins the
masthead at ONE ROW at 320px (≤72px), and three segments at the 44px touch floor took it
to 167px. That budget was spent once already — 113px → 61px, by deleting a duplicate
"Home" link — and the saving is not available twice.

So the pill is a **sibling of the masthead**, in its own `.ringbar`, and not sticky:
sticking it under a sticky masthead means pinning `top` to the masthead's height, which
is two elements agreeing about a number that a skin changing the band's padding would
break. Short labels (`Mutuals`, `Follows`, `World`) with the long wording in the title
and on the settings page.

This is the decision the plan would have got wrong by reasoning, and the gate got right
by measuring.

## Reasoning

**Why the top-bar pill is now right, having been wrong.** The views plan rejected
this exact control, and its argument was sound: *"in the top bar the ring governs one
surface out of eleven and must apologise on the other ten."* The first draft of that
design had the pill greying out with a reason on seven routes. That objection is not
being overruled — it is being **removed**. It was never an argument about pills; it
was an argument about a control whose reach is smaller than its position implies. A
ring that scopes every surface has reach equal to its position, and needs no
apology anywhere. The reversal is worth recording precisely because the earlier
finding was correct and still is, under its own premise.

**Why the registry rather than a longer frozen array.** Composability was asked for
directly (*"users can remove or add entries on the slider ... just make it
composable"*), and the shape of the future entries the owner named — "follows + one
feed" — is not a rung on a graph ladder at all. It is a scope built from a graph set
and a source set. Making the registry entry an object with a `members()` function now
means that entry is an addition later rather than a redefinition.

**Why `rank` is separate from list order.** This is the whole defect of the shipped
dial, re-entering through a new door. The 2026-08-26 plan found that the dial's order
was "not an order at all," and fixed it by defining rungs as cumulative unions. A
user-composable stop list hands the ordering back to the user, and a user has no
reason to know that "further out must contain everything nearer in." Sorting by
`rank` means the property is enforced by construction rather than by asking.

**Why hidden rather than dimmed or badged.** Settled precedent in this repo, from the
owner, 2026-08-26: a row announcing what it withheld defeats the withholding twice.
The ring is a reader's own instruction about what they want to see; the only
rendering that honours it is nothing at all.

**Why the exemption defaults to exempt.** A feed or a hashtag is a thing the reader
went and asked for by name. Silently scoping it would make a deliberate request
return less than it does elsewhere in the app, with no visible cause. The setting
exists because the opposite is a legitimate thing to want — the owner named the empty
feed as intended behaviour — but wanting it is a choice you make, not one you inherit.

**Why World is the default.** Two reasons that agree: it is what the app does today
(`activeRing = 'world'`), so nobody's reading changes on upgrade; and it is the only
scope that costs no graph reads, so the walk is paid by readers who asked for it.

---

## Review Log

**2026-09-03 — three defects the unit tier could not see.** Worth recording as a group,
because the common factor is not carelessness: each was invisible to a suite that was
green at the time.

1. **A dangling import.** Phase A deleted `LADDER`; `js/ui/lens-views.js` kept importing
   it. That is a SyntaxError at module-link time and would have broken the app on load —
   through 764 passing unit tests, because *nothing imports the UI modules*.
   `test/css-classes.test.js` and `test/a11y-names.test.js` read them with `readFileSync`
   as text, which proves a string is present and proves nothing about whether the file
   loads. Closed by `test/module-links.test.js`, which links every module and names
   `js/main.js` as the one it cannot cover rather than leaving the gap implicit.
2. **The masthead height regression** (Decision 3 above), found by measurement.
3. **A warm-up that had been dead for weeks.** `lens.ringMembers('mutuals')` ran on every
   sign-in, rejected with "unknown rung" because the rungs were renamed to
   `me/mut/fol/hop/world`, and its own `.catch(() => {})` swallowed the error. A cache
   warm that never warmed anything, kept looking healthy by its own error handler.

**Cross-session sequencing.** `croftc-ba` was restructuring `shapeLensThread`'s
self-thread walk in the same file. Divided by claim before either branch moved: this one
went first, `sw.js` cache versions split v74/v75, and their question — *can a reader
narrow themselves out of their own thread?* — became two tests here. The answer is no,
structurally: every rung is a cumulative union starting at `me`.

**2026-09-04 — the universe, the punch-hole, and a day-old decision re-affirmed** (owner,
on forage.fyi at Follows over a Bluesky Team post; `claude/ring-universe`).

1. **"It looks like the posts were deleted."** The quote cascade never checked `p.hidden`:
   `build()` dropped an out-of-ring reply, `buildQuote()` shaped the quote, found it hidden,
   and built the node anyway — a `[removed]` byline over nothing, once per stranger who
   quoted the post. Phase C's test covered replies and not quotes. Fixed at the same door.
2. **The ring is the whole universe, with one hole.** Owner: *"there are only mutuals and
   mutuals' activities … with this one kind of other punch hole just for practicality."* A
   thread whose ROOT is in the ring shows every reply and quote; a root outside it stays
   hidden. `opensThreads` on the ring spec, a reader setting on by default, consulted by
   `shapeLensThread` alone — it opens threads, never posts, and never a board. Whole thread
   rather than direct replies only: a stranger shown while the stranger they answer is
   absent is the deleted-post look back through a different door.
3. **The thread pill mutes a stop nobody on the thread belongs to** (*"otherwise what's
   the point?"*), reason on hover. The shaper reports `authors` off the raw tree — before
   any policy, because a muted friend is still ON the thread — and `absentStops()` intersects.
   World and the current stop are never muted. Cost: the members of every stop on the pill
   resolve beside the thread fetch; for the default pill that is the walk the ring already
   paid for, cached. A reader who adds `hop` pays its walk on their first thread instead of
   their first selection.
4. **Decision 2's exemption stands — re-affirmed, not reversed.** This session proposed
   retiring it, reading the owner's *"if it's not from someone inside my ring, don't show it"*
   as reaching feeds. The owner's answer draws the line precisely: *"if I go directly to a
   feed I'm looking to see that feed unedited."* The thing that scopes by default is a future
   surface — **mixes**, a reader-composed board interpolating several feeds and hashtags the
   way a Reddit home does, *"like funny and followers … within this radius"* — recorded as
   roadmap E159. So an exempt feed can still hand a reader a thread that says "Outside your
   ring" — that empty state stays, and the thread pill beside it is the way in.
5. **A swallowed error, again.** The first green unit run of `absentStops` passed Sets; the
   substrate hands out arrays; the view's own `catch` turned `members.has is not a function`
   into a pill that muted nothing — indistinguishable from the feature working on a busy
   thread. Caught by the workflow (`e2e/ring-universe.workflow.mjs`, written RED against
   main), not the unit tier. The unit test now passes the real shape through the real lens.
   Same lesson as the dead warm-up above: a `.catch` that degrades gracefully is where a
   type error goes to live.
