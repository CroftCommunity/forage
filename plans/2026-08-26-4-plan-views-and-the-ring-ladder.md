# Plan: views and the ring ladder — one strip, two halves

**Status:** DRAFTED, NOT STARTED (2026-08-26). **BLOCKED** behind `claude/polish`
(`worktrees/forage/polish`, claim `CroftC/.coordination/claims/forage--polish.md`,
session `croftc-b3`): its **Phase 2** rebuilds the signed-out lens front door and its
**Phase 3** makes the ring dial's four buttons read as gated. This plan deletes those
four buttons. Owner decided the ordering on 2026-08-26: *"we are going to pause and see
what they come up with and work on that, bc these are complementary just one has to land
first I think"* — and asked that `croftc-b3` **not** be told, so their take on the gating
problem arrives independent of this design.
**Worktree:** `worktrees/forage/views` on `claude/views`. Claim:
`CroftC/.coordination/claims/forage--views.md`.
**Serves:** the owner's public-site queue — the same pause of E138 that
`2026-08-26-2-plan-public-site-polish.md` serves.

---

## Problem Statement

The ring dial is a good idea wired as a page control, and the moment anyone tries to
promote it to chrome the wiring shows.

**What it is today.** `activeRing` is a module-level variable in `js/ui/lens-views.js`
(§ *the ring dial*, `let activeRing = 'world'`). It is page-lifetime state: not
persisted, not in the store, not in the URL. It resets on reload and on sign-out. Of the
seven exported lens views, exactly one reads it — `lensHomeView`. The dial renders as a
card on `/` and nowhere else.

**What the owner asked for**, 2026-08-26: *"I want to look at moving the 'ring' setting
to a segmented pill slider in teh top bar ... and ensuring that it's effects are
consistent and complete across what's visible on teh site"*, plus *"I want to remove the
'Home' text bc it's dupe of clicking the icon in the top left"*, and a phone treatment
that is *"usage but not intrusive"*.

Four problems fall out, and only the first is cosmetic.

1. **A top-bar control is a promise the state cannot keep.** Chrome persists; this
   resets every load.
2. **A globally-visible dial that governs one surface has to explain itself on every
   other surface.** The first draft of this design had the pill greying out with a
   reason on `/u/`, `/p`, `/feeds`, `/me`, `/settings`, `/mode` and `/frontiers` —
   seven explanations for one control.
3. **The rungs do not nest, so "further out" is a lie.** Mutuals are a subset of
   follows, fine. But Mutuals +1 — mutuals plus everyone *they* follow — does not
   contain everyone *you* follow: someone you follow who follows nobody back and is
   followed by none of your mutuals falls out. Stepping outward from Mutuals +1 to
   Following would show **less**. The dial's own order today is world / following /
   mutuals / mutuals+1, which is not an order at all.
4. **The widest rung has no implementation.** `ringFeed` (`js/substrates/lens.js`,
   § *the merged ring board*) opens with `if (ring === 'world') throw new Error('lens:
   the world ring has no merged board — its board is the sources/feeds surface')`.
   World is the dial's OFF position, not a query.

## Approach — SUPERSEDED by Revision 2 (the strip is dead; a sidebar replaces it)

Collapse the tab and the dial into **one strip with two halves**, and let the right half
be its own readout.

```
┌──────────────────────────────────────┐
│ 🍂 Forage                    ☾    👤 │
├──────────────────────────────────────┤
│   Discover      │    My mutuals   ▾  │
└──────────────────────────────────────┘
      the front page          the ladder; picking a rung
      (identical signed        BOTH switches you here and
       in or signed out)       sets the dial
```

Owner, arriving at this shape: *"there's a a discover half and then the other side is a
drop down but in that same top line and so it would say whatever was selected ... because
then the right side always says exactly what it's showing you"*.

**Two axes, not a pile of switches.**

```
WHAT'S IN IT (the composition)        HOW CLOSE (the ring)
──────────────────────────────        ────────────────────
my posts                              Just me
people I follow                 ×     My mutuals
feeds I follow                        My follows
hashtags I subscribe to               My follows, one hop out
                                      World
```

The composition is the boundary; the ring squeezes inside it. **World means unsqueezed,
not the firehose** — owner: *"world means, you know, I wanna see everybody's interactions
on on this combination of my my own posts, my follows posts, my mutuals, and like feeds I
follow, hashtags I'm subscribed to, that kind of thing."*

The rungs are redefined as **cumulative unions ordered by real containment**, which is
what makes "inclusive of everything further up the ladder" true rather than aspirational.
Friends-of-friends survives; it moves one rung wider than it sits today:

| Rung | Set |
|---|---|
| Just me | my posts |
| My mutuals | + follows ∩ followers |
| My follows | + everyone I follow |
| My follows, one hop out | + everyone my mutuals follow |
| World | + everything else in the composition |

Rung labels all begin with "my", so the right half reads as personal by construction and
needs no name of its own. (The owner named it **Personal**, then *"or 'Mine' not sure,
let's try both"* — the label is one constant, flipped in local preview before anything
lands. If the "my"-prefixed rungs carry it, the constant may end up unused.)

## Reasoning

**Why the two halves beat a top-bar pill.** A control's reach should be visible from
where it sits. In the top bar the ring governs one surface out of eleven and must
apologise on the other ten; in the tab strip it governs the half it is attached to and
vanishes on the other. Same tenet the repo already applies to gated controls —
`skinToggle()` in `js/main.js`: *"the control has to READ as unavailable rather than sit
there absorbing clicks."* Not rendering is the strongest form of reading as unavailable.

**Why the composition axis retires three switches the owner first described.** The
opening sketch had toggles for *"also restrict feeds to my ring"* and *"also restrict
hashtags to my ring"*. Once World means unsqueezed, those collapse into membership: a
feed is in your composition or it isn't, and at World you see it whole. What a separate
exemption would still buy is "keep *this one* full while everything else squeezes" —
real, advanced, and deferred.

**Why "World" is NOT renamed.** An earlier draft of this plan flagged a name collision:
old `world` = the global lens home, new `World` = unsqueezed composition. The owner
refuted it — *"doesn't world mean the same thing in both of those cases? Because you're
never seeing every post by every single person ... it's always some kind of feed so I
mean world still means through the lens through the viewports you have"* — and the code
agrees, in the thrown message quoted above: world's board **is** the sources surface. The
word is stable; the material it ranges over widens. Recorded because the rename was
nearly done as busywork.

**Why view definitions are device-local, and what that costs.** Checked against the
lexicon (`bluesky-social/atproto`, `lexicons/app/bsky/actor/defs.json`): a `savedFeed` is
`{id, type, value, pinned}` with `type` in `feed | list | timeline` — one item, one
thing. Bluesky's own home tab strip is exactly this list, leftmost being `timeline`
("Following"). **There is no representable composition**, and no hashtag type at all. So
a Forage view cannot live in the account, and a view built on a laptop will not appear on
a phone. Not fixable without Forage running a server. Stated here rather than discovered
later.

*The one interoperable exception:* `list` is a real curated people-list. The owner's end
state — *"peel it all the way back to I'm only seeing content from people that I choose"*
— maps onto it natively, so the tightest ring could work in the official app too. Worth
keeping in view as the eventual floor.

**Why persistence copies `js/board-density.js`.** That module is already the pattern for
a device-local reading preference read by both populations: one localStorage key, a
documented resolution order, change listeners, and an explicit *"never `forage.state`"*.
The ring is the same kind of object. Its header also carries the naming lesson this plan
respects: *"Two different things under one name in two files is how the next person loses
an afternoon."*

---

## Revision 1, 2026-08-28 — the signed-out half is deleted, not greyed

This plan specified "signed out, the right half shows rungs greyed with a reason." That is
the shape the owner **rejected** while this plan sat blocked, and the rejection is landed
behaviour on main. Recorded as a revision rather than quietly edited, because V4 asserted
the opposite and a future reader would otherwise find the two irreconcilable.

`49cf873` (*guest surface: hide what a reader cannot use, keep what they can read*) quotes
the owner killing the gated shape before it was built:

> *"a thousand things that pop up a login seems pretty obnoxious to me… I actually think
> bury or hide is the better option then for logged out… putting a bunch of pop up
> landmines, even if it's our own pop up, is a bad plan."*

and draws the consequence for this exact control: **the ring dial stops being a dial.**
Hiding three of four settings leaves one option, "which reads as broken rather than
clean", so signed out it is prose — what a ring is, and that it needs your own follow
graph. `ringDial()` on main now returns exactly that and no buttons.

**The same argument applies one level up, which is the revision.** Hiding the right half
of a two-half strip leaves one half, and one half is not a strip — it is a title with a
border. So signed out there is no strip: home is the front door (`heroCard`, landed
`5c9d4d7`) plus the Discover material, which is what a guest already gets. The strip
arrives with the session, because it slices a graph and a guest has none.

**What this does NOT change**, stated so it is not over-applied: the ladder still explains
each rung to a signed-in reader, and the answer to "what would an account get me" still
gets told once — `lensHomeView` does it in prose through the `data-account-adds`
paragraph. That paragraph is the right home for it. The rejected thing was dangling an
unusable control at a guest, not explaining the account.

**Also landed while this was blocked, and folded in:** downvotes are gone from both
populations (DL-011 retired, `9bcd5dc`), the score is now called likes (`c7a1e61`), and
score-threshold auto-collapse is retired. None touches the strip, but every rung board
inherits them — so a rung board shows a like count and no arrows.

---

## Revision 2, 2026-08-28 — the strip is rejected; a left sidebar replaces it

**The defect, found by the owner in the mock and not by any test.** The strip's right half
was a tab *and* a dropdown opener. Clicking it to switch to that view also opened the
menu, so every switch cost a menu nobody asked for:

> *"when I try to select the right column of my follows or whatever the act of switching
> also triggers the drop down and I dont' think that's fixable in a sane way"*

That is right and it is not tunable — one control cannot have two jobs when doing either
requires doing both. The elegance of "the label IS the control", which Revision 0 argued
for, is exactly what produced it.

**A left sidebar replaces it**, owner's call, with the rungs stacked as plain links.

```
[☰] Forage                       ☾  Settings  (avatar)
┌───────────────┬──────────────────────────────────┐
│ YOUR RING     │  ▲  The rye loaf finally held…    │
│  Just me      │ 31  f/baking · by wren · 40m      │
│  My mutuals  ▌│                                   │
│  My follows   │  ▲  Chanterelles on the north…    │
│  …one hop out │ 54  f/foraging · by juniper · 3h  │
│  World        │                                   │
│ FEEDS         │                                   │
│  Discover     │                                   │
│ HASHTAGS      │                                   │
│  #harvest     │                                   │
│ ─────         │                                   │
│  Trending     │                                   │
│  Browse all   │                                   │
└───────────────┴──────────────────────────────────┘
```

Each rung is a link with one job. Three further arguments, none of which is "it looks
like Reddit":

- **It is this repo's declared genre.** `package.json` describes forage as *"topic-driven
  aggregation in the Reddit structural family"*. A left nav is that family's grammar.
- **It removes a column rather than adding one.** `lensSidebar()` already renders Feeds on
  the RIGHT — navigation on the wrong side. It moves left and joins the rings.
- **On a phone it costs nothing.** A drawer is off-screen until opened, where the strip
  always spent a row. That is a better answer to the owner's original *"usable but not
  intrusive"* than the strip ever had.

### The taxonomy was wrong, and the owner's question fixed it

> *"why is discover a view and what's-hot a feed? they are the same thing literally"*

They are the same **object**. `js/ui/lens-views.js` § *CURATED* is
`{ slug: 'whats-hot', title: 'Discover', kind: 'feed', … }` — "Discover" is the
displayName Bluesky reports for that generator, probed 2026-08-26 and kept only as an
offline fallback. The sidebar sketch listed one feed twice, under two headings. Trending
is feeds too: `trendingRail()` resolves each topic to a `feedUri` and registers it as a
source.

**So there is no views-vs-feeds axis.** Everything in the nav is a **board** — a list of
posts — and boards differ only in where the posts come from: a feed generator, a hashtag,
or your own graph at some reach. Discover is not a category; it is one feed with a good
name.

This is also why the strip's LEFT half does not survive. Discover was only ever a peer of
the ring because a two-half strip needs a partner, so a feed got promoted to a category to
fill the slot. The shape invented the concept. With no slot, it drops back to one row
under FEEDS.

### Where `/` lands — the rule

| Session | Lands on | Why |
|---|---|---|
| Signed out | the directory (trending, browse, Discover's posts) | a guest has no history worth remembering, and it is one page for everyone |
| Returning | the board they last read | no click between opening the app and reading |
| First sign-in | **My follows** | a new account has no last board; this is what someone arriving from Bluesky expects, and its data is already fetched |

The directory is never hidden — it stays in the nav as Trending and Browse all feeds, so a
signed-in reader is one tap from it.

**The last board is device-local**, beside skin and density. Same constraint as the
composition: `app.bsky.actor.defs#savedFeed` can store a pinned feed but not a Forage
board, so a laptop and a phone each remember their own. Stated so it is not later filed as
a bug.

### This couples E144, which was filed as optional

The mock's phone frame clips the masthead to `cpettet.bsky.so…`. The hamburger costs ~54px
in a bar that only fits one row *because* `2776537` removed a duplicate to save 52px
(113px → 61px at 320px). Adding a control back overruns it. **E144** — the avatar
replacing the handle text — buys roughly 120px and is the fix. So the sidebar cannot ship
on a phone without E144, which moves it from a deferred backlog row to a dependency. It
stays a backlog row until the owner decides *how* the masthead shrinks; this plan only
records that something must.

---

## Units

Every unit states its RED test before its change, and every unit shipping user-visible
behaviour extends a workflow journey in the same commit (invariant 6b). Nothing lands
without the owner seeing it at `127.0.0.1:8737` first — owner: *"I definitely want to
kind of see a local preview here before we deploy."* The preview is Pages-faithful by
construction (`scripts/preview.mjs` returns the real 404 status), so it cannot flatter
the result.

### V1 — the last board becomes device-local state — **DONE 2026-08-28**

Shipped as `js/last-board.js` + `test/last-board.test.js`, modelled on
`js/board-density.js`: one key (`forage.lastboard`), read through one module, never
`forage.state`. Reads through storage on every call rather than caching, so a second tab
writing it is visible on the next read. Six tests; the junk-refusal branch was
mutation-checked and the suite killed the mutation.

**Two deviations from this unit as written, both deliberate:**

1. **It stores the last BOARD, not the ring.** Revision 2 established that a rung, a feed
   slug and a hashtag are all boards, and the landing rule needs whichever one you left.
   Storing only the ring would have needed a second key the moment V5 arrived.
2. **Sign-out does NOT clear it**, where this unit originally said it should. The
   reasoning that motivated clearing — *the graph belongs to an account, not a device* —
   is about graph DATA, which `lens.forgetRings()` already drops. What this stores is the
   NAME of a reading choice, and clearing it would mean signing out and back in loses your
   place, defeating the rule the unit exists to serve. The landing rule simply does not
   consult it while signed out, because a guest gets the directory.

   **Left open for the owner, and not decided here:** an account SWITCH on a shared
   device. A stored rung is fine — "my mutuals" recomputes for whoever is signed in — but
   a stored feed or hashtag is the previous reader's preference showing to the next one.
   Keying the value by DID would fix it and is more machinery than V1 needs. Raise it at
   V5, where the rule that reads this value lives.

### V2 — the nested ladder, as data

RED: a unit test asserting containment — each rung's member set is a superset of the rung
inside it, over a fixture where mutuals+1 provably does **not** contain follows (the
counterexample from Problem Statement 3). This test fails against today's ring order and
is the whole reason the ladder is redefined.

### V3 — the World board

RED: a workflow journey selecting World and asserting posts render. Fails today by
construction: `ringFeed` throws for `world`. This is the rung with no implementation.

### V4 — the sidebar

RED: a workflow journey — signed out, assert there is **no ring section** and the one-line
reason is present; signed in, assert the rungs render as links, click one, assert the board
switched AND the nav marks it current. A second journey at 390px: assert the nav is
**not** rendered until the hamburger is pressed, then is, then closes on scrim-tap and on
Escape. Includes tap-target assertions for the hamburger and every nav row (the touch floor
landed in `2c4b28d`), and a keyboard journey — the drawer is ours, so focus, Escape and
tab-order are our responsibility and axe cannot see any of them.

Deletes `ringDial()`. Moves `lensSidebar()`'s Feeds card into the nav; `.side` loses its
only lens occupant, so the shell goes from three columns to two.

### V5 — the landing rule

RED: three unit tests over one function, `landingFor(session, lastBoard)` — guest yields
the directory, a returning reader yields the stored board, a session with no stored board
yields `fol`. Pure, so it is a unit test and not a journey. Then one journey asserting a
picked board survives a reload, which is what makes "returning" mean anything.

## Not doing (and where each one lives)

Each of these is an **open question**, so under `CroftC/.claude/TRACKING.md` § "Two
piles" (owner, 2026-08-26 — readiness, not scope) none of them belongs in `TODO.md`.
They are backlog rows — **E143, E144, E146** filed 2026-08-26 (discovery `7be3cfa`) —
and this plan cites them rather than restating them. **E145** (does the axe gate adopt
best-practice rules) came from the same survey and is filed alongside them.

- **E143** — editing the composition; views beyond the first two; removable tabs; *"set
  this view as default"*; per-source ring exemptions.
- **E144** — merging `/settings` into `/me` behind the avatar. (`/me` already carries
  `accountMenu`, `languagePanel` and `moderationPanel` — a "what do I see" control of
  exactly this kind already lives there, which is what makes the merge natural.)
- **E146** — rungs beyond one hop, *"mutuals+followers and mutuals+2"*. **Measure before
  designing:** mutuals+followers is nearly free (`computeRing` already fetches both
  lists), where a second hop is a different order of magnitude over a walk already capped
  at `RING_CAP = 25` with honest overflow (DL-016).

## Review Log

- **2026-08-26, design session with the owner (croftc-40).** Converged from "pill in the
  top bar" to the two-half strip over five exchanges. Three of the owner's corrections
  changed the design rather than decorating it: feeds should not obey the ring by
  default; the tab and the dial are one control, not two; and World already means what
  the new top rung means, so the rename this plan nearly performed was unnecessary. The
  nesting defect (Problem Statement 3) was found while checking whether the owner's
  "inclusive of everything further up the ladder" was true of the existing rings. It was
  not.

- **2026-08-28, mock review with the owner (croftc-40).** The two-half strip died in the
  mock, killed by a defect no test would have caught: its right half was a tab and a menu
  opener at once. Worth noting how it was found — the strip's *elegance* caused it. "The
  label IS the control" is a good sentence and a bad control, and only clicking the thing
  showed the difference. The sidebar replaced it, and the owner's follow-up question
  ("why is discover a view and what's-hot a feed?") then collapsed the taxonomy the strip
  had invented: they are one object in `CURATED`, so there is no views-vs-feeds axis and
  everything in the nav is a board. Two mocks, two design errors found, neither by a
  suite. Mocks are in `plans/mocks/`.
