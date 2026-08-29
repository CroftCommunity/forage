# Plan: hashtag discovery — search, trending, and what you have read

**Status:** **P1–P4 DONE** (2026-08-28/29), plus the logged-out search fix
(`4c23f41`). **P5 is the only phase left and it needs owner decisions** — the
eighth lens write, and whether a published subscription is read back on another
device. See the phase. Phase numbers are order-of-writing,
not priority — P5 is the owner's most recent interest.
**Serves:** the owner's public-site queue. Follows the left nav landing
(`2026-08-26-4`, forage `6b1dedf`) and the hashtag subscriptions that shipped
with it (`34a5fea`, `17df1c5`, `0f5d420`).
**Branch:** `main` directly — small, sequential, and no peer holds a claim
(`CroftC/.coordination/claims/` is empty but for its README).

---

## Problem Statement

Hashtags became joinable, so `/hashtags` exists to help you decide what to
join. It currently offers two lists and neither is what a browser of a forum
would expect first.

**The hard constraint, established by probe and not by reading docs:
Bluesky publishes no hashtag ranking.** `app.bsky.unspecced.getTrends` looks
exactly like the answer — it carries `postCount`, a `startedAt`, and a
hot/cooling `status` — and every result is a **feed generator**:

```
'Coyote vs. Acme releases'  postCount=2439
   link  = /profile/did:plc:qrz3…/feed/cff9e7d5f6b8
   topic = 'cff9e7d5f6b8'      ← an opaque record key, not a tag
```

There is no endpoint that lists hashtags, at any window, ranked any way. So
every hashtag-discovery surface in this app must be **derived**, and the only
question is from what.

Three sources exist, and they answer three different questions:

| Section | Question | Source |
|---|---|---|
| Search | "does a tag about X exist, and is anyone using it?" | `searchPosts`, tags harvested off real results |
| Trending | "what is the network doing right now?" | trending FEEDS, tags harvested off their posts |
| Loaded | "what do the people I already read talk about?" | posts rendered on boards you opened |

The owner's framing (2026-08-28): three equal sections, each showing a slice
with its own full page beneath it, and trending "always there as a barometer".

## What works logged out — measured 2026-08-29, after two wrong claims

Recorded as a table because I asserted this twice from memory and was wrong
twice; the owner corrected both. Re-probe before trusting it again.

| Surface | Logged out | Why |
|---|---|---|
| Trending now | **works** | `getTrendingTopics` and `getFeed` both 200 unauthenticated |
| Hashtags loaded | **works** | feed boards are public — one board logged out gave 30 rows, 12 tags |
| Find a hashtag | **403** | `searchPosts` refuses without a session (DL-014, re-probed plain and with `tag=`) |
| Joining a tag | **works** | it is device storage; nothing is asked of the network |
| `/h/:tag` board | **403** | same `searchPosts` gate (DL-021) |

Only search and the `/h/` boards are gated, and both for one reason. **The
other sections stay visible logged out** — hiding them alongside search would
punish a reader for a limit that is not theirs.

The search section is therefore ABSENT logged out rather than present and
refusing (landed `4c23f41`). It had shipped as a box that took a query and only
then admitted 403, which is the shape `49cf873` already rejected once.

## Approach

**Derive trending, and say so.** Fetch the trend list, fetch the top N trending
feeds, harvest tag facets off their posts, count. That is a real barometer of
the network. The section says *"tags on posts in what's trending right now"* —
never *"trending hashtags"*, which would claim a ranking nobody publishes.

**Keep the three sources from colliding, which they already do not.** Background
trending fetches must never feed the "loaded" statistics: one list is *what the
network is doing*, the other is *what I read*, and merging them makes both
meaningless. This needs no special-casing — `observeTags` is called from
`renderBoard`, so only a board a reader actually opened counts. Opening a
trending tag's board therefore DOES count, which is correct: you read it.
Search results already work this way for the same reason. **The rule is
"rendering counts, fetching does not", and it is worth a test rather than a
comment, because the next person adding a background fetch will not know.**

**Refresh on a dial, hourly by default** (owner). Six requests per refresh is
cheap once an hour and rude every page view, and a list that reshuffles on every
visit is not a barometer. Device-local, beside skin and density.

**The word cloud is one representation and the reader picks** (owner). The
counted list is the other, and it is the accessible one — see Reasoning.

## Reasoning

**Why trending is worth deriving rather than skipping.** The two lists that
exist today are both about *you*: what you searched for, and what you have read.
A reader deciding what to join has no way to see past their own bubble, which is
the exact thing a discovery surface is for. Trending is the only source that
answers "what is happening that I am not already looking at".

**Why the honesty about the source is not pedantry.** A section headed
"Trending hashtags" claims a network-wide ranking of tags. What we have is tags
appearing on posts inside five feeds an algorithm picked. Those are different
claims, and the second one is defensible. This repo has the habit already —
the ring's capped board states its true pre-cap total, the loaded list states
its sample — and the reason is the same: a ranked list with no stated
denominator reads as authoritative.

**Why the word cloud cannot be the only representation.** Sizing text by
frequency makes the rare tags small, and a 9px tag is one nobody with low vision
can read. This repo blocks its build on axe at serious/critical, and
`croft-pwa/docs/ACCESSIBILITY.md` is explicit that a green scan only counts if
it graded the DOM a user gets. So: the list is the default and the cloud is a
toggle, the cloud's font range is bounded so its smallest is still legible, and
the cloud carries the same links with the same accessible names. A cloud that
is decoration over a real list is fine; a cloud that is the only way to read the
data is not.

---

## Phases

Each phase lands on its own, RED first, and every phase shipping user-visible
behaviour extends `e2e/tagsub.workflow.mjs` or adds a sibling (invariant 6b).

### P1 — trending hashtags, derived and cached — **DONE 2026-08-28**

RED: a unit test that the trending list is harvested from the trending feeds'
posts, and a second that a background refresh does **not** touch the loaded
statistics — the collision rule, made executable.

- `js/trending-tags.js`: fetch the trend list, take the top N feeds, harvest and
  count their tags. Cached device-local with a timestamp.
- The refresh interval is a setting (default hourly) on `/me`, beside the other
  device-local preferences.
- `/hashtags` gains the section, headed with what it actually sampled.

**Landed as:** `js/trending-tags.js` + `test/trending-tags.test.js` (9 tests),
the section on `/hashtags` with a refresh dial (15m / hourly / 6h / daily,
hourly by default), and the collision rule asserted twice — once as a unit test
and once end-to-end in `e2e/tagsub.workflow.mjs`, where a tag that is only
trending is checked to be absent from `forage.tagstats`.

**Two things the tests caught, both mine:**

1. **The async storage helper tore down its own fixture.** `try { return
   fn(store) } finally { restore() }` restores the moment an async body returns
   its PROMISE, so every assertion after the first `await` read the real
   environment. It fails as an empty store, which looks exactly like "the code
   wrote nothing" — three tests failed that way before the pattern gave it
   away. The helper awaits now, and says why in a comment.
2. **A workflow assertion written when the page had one list.** The filter
   check demanded that EVERY tag on the page match the filter; with trending
   added there are three lists, and the filter belongs to one. Scoped to
   `[data-loaded-tags]` rather than loosened.

### P2 — the three-section page — **DONE 2026-08-29**

`/hashtags` becomes Search · Trending · Loaded, each a slice of ~12 with a full
page beneath. Ordering is the owner's: search at the top, trending in the
middle, loaded at the bottom.

### P3 — the full pages — **DONE 2026-08-29**

One page per dimension, each loading deeper than its slice (~100 for search) and
carrying that dimension's own controls. Back and forth between a slice and its
page must not lose the reader's sort or filter.

**Landed as `/hashtags/:section`.** One view builds both shapes, because a full
page that drifted from its slice would be two answers to one question — and the
slice is what people see first, so the drift would be invisible. Two decisions
worth keeping:

- **"See all" is absent on the page it leads to.** A link to where you already
  are is noise pretending to be navigation.
- **A section's own page ignores the Advanced preference.** You arrived by
  asking for it by name; refusing a direct request because of a display setting
  is the setting overreaching. The preference composes the OVERVIEW, not the
  address space.

### P5 — local-only as a privacy choice, and per-subscription sync

**This reframes what P1's storage decision WAS.** The tagsub work shipped local
storage as a waiting room — somewhere subscriptions sit until they graduate to
a repo. The owner's reading (2026-08-29) is better: *"I'm actually starting to
think this local prefs thing is a nice privacy option to have."* Local is a
**destination**, and it offers something the atproto version structurally
cannot — nobody can see what you follow, because it never left the device. A
`fyi.forage.tagsub` record in a repo is world-readable, exactly like a follow.

So syncing is per-subscription and opt-in, shown in the account page:

```
#harvest     Local only     [ Save to PDS ]
#foraging    Local only     [ Save to PDS ]
#mycology    Saved to PDS   [ Remove from PDS ]
```

**"Save to PDS" must read as PUBLISH, in the box, in words.** It sounds like
backup and it means the world can read it. Saying so once beside the control is
the difference between a feature and a leak.

**The disabled button logged out is consistent with the ring decision, not
against it.** What `49cf873` rejected was a control whose only behaviour was to
summon a login, on a dial where hiding three of four settings left one option
and a box that read as broken. Here the row is fully working locally and only
the sync half is unavailable: nothing is dangled, nothing pops a modal, and the
reader has a complete feature without an account. Owner's call, and the
distinction is worth keeping written down because the two look alike.

### Decided 2026-08-29: Forage may define its own record types, with a register

Owner: *"forage is going to need records of its own as we go, no help for it,
esp with our handling of hashtags, but let's keep it to a minimum and highlight
every one created and defined for ourselves so we are intentional about it and
so we can reflect on overlap with the ecosystem."*

So the permission comes with an obligation: **every `fyi.forage.*` record type
carries a recorded justification, and the justification includes what was
checked in the ecosystem first.** A rule with no check decays into prose, so
this one is enforced — `test/lexicons.test.js` already pins the collection set,
and it gains an assertion that each entry has a rationale.

**The overlap check for `fyi.forage.tagsub`, done 2026-08-29** — the pattern for
what these entries look like:

| Candidate | What it holds | Why it does not fit |
|---|---|---|
| `site.standard.graph.subscription` | a subscription to a **publication**, as an at-uri | a hashtag has no record and therefore no at-uri |
| `app.bsky.notification.putActivitySubscription` | a subscription to an **actor** | subject is a DID; a hashtag is not an identity |
| `app.bsky.actor.defs#savedFeedsPrefV2` | `feed \| list \| timeline`, one value each | no hashtag type, and no room to add one |
| `app.bsky.graph.list` + `listitem` | curated **people** | a list of accounts, not a subject |

**The finding, which is a better justification than "nothing exists":** across
458 official lexicons, a subscription always points at *a thing that exists* — a
record or an identity. A hashtag is neither; it is a query. That is the gap, and
it is why the type has to be ours.

**This is the first thing to take forage's write count from seven to eight.**
`AGENTS.md` lists every write with a test that counts them, precisely so an
eighth has to be argued for rather than added. The argument is above; the unit
lands with the table updated and `test/invariants.test.js` extended in the same
commit.

Open, and not for me to decide: whether a subscription saved to a repo should
then be READ back on another device — that makes it sync rather than publish,
and raises what happens when the two disagree.

### P4 — the word cloud — **DONE 2026-08-29**

A representation toggle on Trending, and on Loaded if it earns it. The list
stays the default and the accessible one; the cloud is bounded so its smallest
tag is still readable, and axe runs over both modes.

**Landed on Trending only.** Loaded did not earn it: its whole point is sorting
and filtering a long list, which a cloud cannot do. Adding one there would have
been symmetry for its own sake.

Three things the accessibility constraint actually forced, all asserted:

- **The floor is 13px, the app's own `--t-xs`.** A cloud may not invent a size
  smaller than anything else in the app — its small end is exactly where its
  data hides.
- **Each tag's accessible name carries its count** (`#harvest, 4 posts`).
  Font size is the only place a cloud shows magnitude, and for a screen reader
  font size does not exist. Same information, both ways of reading.
- **All-equal counts all get the floor.** No spread means no ranking to show,
  and faking a gradient would be a lie told in font-size.

`/hashtags` joined the a11y sweep in the same commit.

---

## Not doing

- **A windowed count** ("most posts in the last thirty days"). `js/tag-stats.js`
  keeps one running total per tag, so a window would have to be invented. Doing
  it honestly means per-window buckets — a storage decision, and its own plan.
- **Claiming a network hashtag ranking.** There is not one to claim.

## Review Log

- **2026-08-28, design with the owner.** The three-section shape and the
  collision rule are the owner's; the derivation is forced by the probe. Worth
  recording that the owner described the workaround before knowing it was one —
  *"we could do a few fetches in the background of like trending results"* is
  exactly what deriving trending requires, because the endpoint that sounds like
  it does this returns feeds.
