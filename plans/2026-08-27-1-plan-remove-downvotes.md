# Plan: remove downvotes

**Status:** DRAFT — Pass 1 complete 2026-08-27. Not started.
**Origin:** owner decision, 2026-08-27: *"I actually have been thinking downvotes (bury)
just aren't very useful, let's remove them"*, and on the sort that depends on them,
*"controversial can go sure"*. Scope B of the two presented: **both populations**, as a
product concept, not a guest-visibility fix.
**Worktree:** `worktrees/forage/polish` on `claude/polish`.

---

## Problem Statement

Forage has a downvote (`▼ bury`) in both populations, and it is worth different amounts
in each.

On the **Bluesky lens** it cannot work at all. Bluesky has likes and no dislikes, which
is already recorded as **DL-011**: *"Lens scores are likes-only: ups = likeCount, downs =
0… controversial ranking is undefined at this tier."* The arrow renders on every post row,
refuses on click, and signing in would not unlock it. It is a control that advertises a
capability the network does not have.

On the **memory sandbox** it is a real, working feature — and load-bearing in more places
than the sort that names it. Measured:

```
top            ups - downs
best           confidence(ups, downs)
hot            hot(ups, downs, createdSec)
rising         velocity = (ups + downs) / age
controversial  controversy(ups, downs)          <- the only one that dies outright
limits.js      a cooling-off slowdown after rapid burying (value === -1)
schema.js:59   vote.set value must be -1|0|1
```

So "remove downvotes" is not one deletion. It narrows a validated payload, removes one
sort, makes a rate-limit rule unreachable, and simplifies the arithmetic of four others.

## Reasoning

**Why this is right rather than merely asked for: it CLOSES a divergence.** DL-011 exists
because the two populations disagree about whether a downvote is a thing. Removing
downvotes makes them agree, and a tolerance row that exists to excuse a disagreement can
retire rather than being carried forever. Convergence between the sandbox and the surface
that actually ships is worth more than the feature.

**What is genuinely lost, stated plainly:** the sandbox stops being able to express
disagreement, and `controversial` — the one ranking that surfaces contested rather than
popular things — has no replacement. There is no version of this that keeps Controversial,
because that sort is nothing but a function of ups against downs.

**Alternatives considered and rejected:**
- *Remove from the lens only.* Presented to the owner as option A alongside this; they
  chose B. A would have left the sandbox modelling a network shape Forage does not ship.
- *Keep and gate for guests.* This was the original Phase 3 recommendation. Rejected by
  the owner on product grounds — a permanently-inapplicable control on the lens, and a
  feature they judge not useful in the sandbox.
- *Keep `downs` in the data model at 0.* Rejected: an always-zero field in a validated
  schema is a lie with a maintenance cost, and it is exactly what DL-011 tolerates today.

## Verified Assumptions

| Claim | How verified |
|---|---|
| `vote.set` is `['subjectType','subjectId','value']` and validates `value ∈ {-1,0,1}` | read `js/schema.js:23,59` |
| All five sorts consume `downs`; only `controversial` is defined BY it | read `js/engines/rank.js:40-60` |
| `limits.js` has a cooling-off rule keyed on `value === -1` | read `js/engines/limits.js:36` |
| `hydrate()` does NOT re-validate stored events — only `dispatch` and `loadEvents` do | read `js/store.js:38-60,156-170` |
| So narrowing the schema cannot crash an existing sandbox — stale `-1` events fold silently instead | same |
| There is an existing precedent for an unfoldable stored log: `legacyLog()` refuses and says so, "loud, and recoverable" | read `js/store.js:159-164` |
| `controversial` is offered ONLY in the memory population | `js/ui/views.js:56` lists it; the lens toolbar (`js/ui/lens-views.js:324`) offers Feed order / New / Top |
| Three scenarios and four test files reference downs/bury/controversial | grep: `post-vote-rank`, `rate-limit-probation`, `demo-extras`; `engines`, `reducers`, `lens`, `lens-intake` |
| DL-011 is an ACTIVE tolerance whose whole subject is this disagreement | read `ledger/divergence.js:42-46` |

## Documentation Impact

- `ledger/divergence.js` — **DL-011 retires.** It is a tolerance for a divergence that
  will no longer exist. Status change plus a reason, not a deletion (the ledger is a
  record). **Phase 5.**
- `ledger/divergence.js` — **DL-013** mentions *"Bury remains without an analogue (DL-011
  likes-only)"* in its shipped description. That sentence goes stale. **Phase 5.**
- `js/engines/rank.js` header — documents the sort family. **Phase 2.**
- `js/engines/limits.js:4` — its header describes the burying cooldown. **Phase 3.**
- `AGENTS.md` — grepped for `bury`/`controversial`: no references. No action.
- `README.md` — check at execution for a sort list; not found in a first grep.
- No new files, so no `sw.js` SHELL change; `CACHE` bumps once at the end.

## Concurrency Map

```
Sequential spine: 1 → 2 → 3 → 4 → 5
```

**All phases sequential.** Not merely by default — each phase reads what the previous one
wrote, and the ORDER is what keeps the tree green at every step:

- UI first, so nothing new can produce a `-1` while the engine still accepts one.
- Engine and limits next, while the schema still permits `-1` so existing scenarios and
  tests keep running.
- Scenarios before the schema, or narrowing the payload turns them red for a reason
  unrelated to the change under test.
- Schema and reducer LAST, because that is the contract, and narrowing it before its
  producers are gone would break the fold rather than tighten it.

Reversing any adjacent pair leaves the suite red mid-plan. That is the argument, not
write-set overlap.

## Phases

### Phase 1: the arrow goes

**Goal:** No downvote control exists in either population.
**Changes:**
- [ ] `js/ui/components.js` — `voteBox` loses `bury`; the box becomes a single control
      plus its score.
- [ ] `js/ui/lens-views.js` — `lensVote`'s `next === -1` branch and its DL-011 toast go.
**Call chain:** `render()` → `postRow()` → `voteBox()` → the rendered control.
**Wiring test:** `e2e/bluesky-view.workflow.mjs` and a memory-population journey assert
**no** `▼` renders on a post row or a comment, in either population, signed in or out.
RED today — it renders in all four combinations.
**Named behaviours, with edges:** boost still toggles on and off; the optimistic paint and
its revert still work (the "fills then reverts" path); a comment's vote control loses its
down arrow too (`js/ui/components.js:215` is a second, separate control — easy to miss).
**Depends on:** nothing.
**Read/Write-set:** reads `js/ui/components.js`, `js/ui/lens-views.js`, `js/ui/views.js`;
writes the first two plus `e2e/*`.
**Shared-state contract:** No state outside the write-set. `voteBox` is SHARED chrome —
this phase must leave the memory population's boost behaviour identical.
**Risks:** two vote controls exist (`voteBox` at `:42`, the comment control at `:215`).
Fixing one and shipping is the likely mistake.
**Done when:** 1) No post or comment in either population shows a downvote. 2) `npm run
workflows` green with the new absence assertions.
**Validation:** Moderate — tests plus a look at a board and a thread in both populations.

### Phase 2: the sorts

**Goal:** Ranking no longer consumes `downs`; `controversial` is gone.
**Changes:**
- [ ] `js/engines/rank.js` — drop `controversial` and `controversy()`; simplify `top`,
      `best`, `hot`, `rising` to their downs-free forms.
- [ ] `js/ui/views.js:56` — `SORTS` loses `controversial`.
**Wiring test:** a board journey asserts the sort tabs no longer offer Controversial and
that choosing each remaining sort still reorders. RED today.
**Named behaviours, with edges:** `top` orders by ups; `rising`'s velocity gate still
fires on the same inputs it used to when downs were 0; a stored preference of
`defaultSort: 'controversial'` must not strand a user on a sort that no longer exists —
**it falls back, and that is an edge worth its own assertion.**
**Depends on:** Phase 1 (nothing produces downs).
**Read/Write-set:** writes `js/engines/rank.js`, `js/ui/views.js`, `test/engines.test.js`.
**Risks:** `test/engines.test.js` has ~27 references; several will be genuinely obsolete
rather than needing repair. Deleting a test because it is inconvenient and deleting it
because its subject no longer exists look identical in a diff — say which, per test.
**Done when:** 1) The sandbox offers four sorts and each works. 2) `npm test` green.
**Validation:** Moderate.

### Phase 3: the burying cooldown

**Goal:** No rate-limit rule keys on an act that cannot happen.
**Changes:**
- [ ] `js/engines/limits.js` — remove the cooling-off slowdown and its header sentence.
**Wiring test:** the limits journey/scenario still enforces its OTHER cooldowns — this
phase must narrow the rule set, not weaken it.
**Depends on:** Phase 1.
**Risks:** `scenarios/rate-limit-probation.js` exists partly to exercise this. Phase 4
decides whether it loses a step or loses its reason to exist.
**Done when:** 1) Rapid posting is still limited; rapid burying is not a concept.
2) `npm test` green.
**Validation:** Narrow.

### Phase 4: the scenarios

**Goal:** The scenario library stops producing downvotes.
**Changes:**
- [ ] `scenarios/post-vote-rank.js` (4 refs), `scenarios/rate-limit-probation.js` (2),
      `scenarios/demo-extras.js` (1).
**Depends on:** Phases 2 and 3 — a scenario asserting on `controversial` cannot be fixed
before the sort is gone.
**Risks:** **Conformance replays these on two substrates and compares 88 observables.**
Observables WILL move. Per invariant 9 the change does not merge until conformance passes
or each difference is ledgered as a tolerance with a reason. A moved observable here is
expected, not a defect — but "expected" must be written down per observable, not asserted
in aggregate.
**Done when:** 1) `npm run conformance` passes. 2) Any moved observable is named.
**Validation:** Broad — this is the phase that can silently change what the model asserts.

### Phase 5: the contract, and the ledger

**Goal:** `vote.set` cannot carry `-1`, and the record says why.
**Changes:**
- [ ] `js/schema.js` — `vote.set` value narrows to `0|1`; the error message names the change.
- [ ] `js/reducers.js` — a stored `-1` folds to "no vote" rather than persisting.
- [ ] `ledger/divergence.js` — DL-011 → retired, with the reason; DL-013's stale sentence.
- [ ] `sw.js` — bump `CACHE`.
**Named behaviours, with edges:** dispatching `-1` now throws with words; an EXISTING
stored log containing `-1` still hydrates (it is not re-validated) and folds to no-vote —
**asserted with a fixture log, because this is the only part of the change that touches
data people already have.**
**Depends on:** Phase 4 — narrowing before the producers are gone breaks the fold.
**Risks:** the coercion is the one silent behaviour in this plan. It must be a named,
tested rule, not a side effect of the reducer's `else` branch.
**Done when:** 1) `-1` is rejected on dispatch and harmless on hydrate. 2) Full gate green.
**Validation:** Broad — data contract plus stored state.

## Open Questions

- `[RECOMMENDED: PHASE-GATED — Phase 5]` **Stale `-1` in an existing sandbox: coerce
  silently, or refuse loudly like `legacyLog` does?** *Rationale: the repo's precedent for
  an unfoldable log is to refuse and say so. This log is foldable, just stale, so coercion
  is proportionate — but it is the one place this change touches data a person already
  has, and "fail loud" is a stated principle. Recommend coerce + test; want it confirmed.*
- `[RECOMMENDED: ADVISORY]` **Does the sandbox lose something it should replace?**
  *Rationale: `controversial` was the only sort surfacing contested rather than popular
  items. Not proposing a replacement — just naming that the sandbox's expressive range
  narrows, so the loss is a decision rather than an oversight.*

## Review Log

### Pass 1 — 2026-08-27
Written before any code, because a batch approved in conversation that changes a data
contract and spans ~14 files is exactly the trigger for persisting a plan first.

**Grounding changed the scope twice.** The owner's decision was framed as "remove
downvotes, and controversial can go". Reading the engine showed that **all five** sorts
consume `downs`, not just the one named — so four more get simplified. Reading
`limits.js` showed a rate-limit rule keyed on rapid burying, which becomes unreachable and
was in nobody's description of this change.

**The migration question is real but not fatal**, and only reading `store.js` showed why:
`hydrate()` does not re-validate, so narrowing the schema cannot brick an existing
sandbox. Without that, Phase 5 would have been planned defensively around a crash that
cannot happen.

**The strongest argument for the change was not in the request.** Removing downvotes
retires DL-011 — a tolerance row that exists solely because the two populations disagree
about whether a downvote is a thing. The change closes a divergence rather than creating
one.

**Open:** two questions, one phase-gated (coerce vs refuse), one advisory (the sandbox's
narrowed expressive range).
