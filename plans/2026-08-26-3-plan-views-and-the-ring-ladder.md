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

## Approach

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

## Units

Every unit states its RED test before its change, and every unit shipping user-visible
behaviour extends a workflow journey in the same commit (invariant 6b). Nothing lands
without the owner seeing it at `127.0.0.1:8737` first — owner: *"I definitely want to
kind of see a local preview here before we deploy."* The preview is Pages-faithful by
construction (`scripts/preview.mjs` returns the real 404 status), so it cannot flatter
the result.

### V1 — the ring becomes device-local state

RED: a unit test that a chosen rung survives a reload, and that sign-out clears it (the
graph belongs to an account, not a device — the rule `forgetRings()` already encodes).
Model on `js/board-density.js` including its resolution order. No UI yet.

### V2 — the nested ladder, as data

RED: a unit test asserting containment — each rung's member set is a superset of the rung
inside it, over a fixture where mutuals+1 provably does **not** contain follows (the
counterexample from Problem Statement 3). This test fails against today's ring order and
is the whole reason the ladder is redefined.

### V3 — the World board

RED: a workflow journey selecting World and asserting posts render. Fails today by
construction: `ringFeed` throws for `world`. This is the rung with no implementation.

### V4 — the strip

RED: a workflow journey — land signed-out, assert the left half is active and the right
half shows rungs greyed with a reason; sign in, pick a rung, assert both the view
switched and the label now reads that rung. Includes the tap-target assertion for the
opener (the touch floor gate landed in `2c4b28d`; the opener is exactly what it exists to
catch) and a **keyboard** journey — the menu is ours, not the platform's, so focus,
Escape and arrow keys are our responsibility and axe cannot see any of them.

Deletes `ringDial()`. Removes `Home` from the **Bluesky** masthead only
(`js/main.js`, § *the Bluesky masthead*): there the wordmark and `Home` both target `/`,
a true duplicate, and the emptied `<nav>` is the slot the strip takes. The **memory**
masthead is untouched — its wordmark targets `/popular` while `Home` targets `/home`, a
*different board* (`router.route('/home', …)`), so the same edit there would delete a
destination.

### V5 — Discover

The left half is the current `lensHomeView` content re-homed: top five trending, then
topics, then what's hot. Owner: *"where the left have is really kind of like the front
page always."* Identical signed in or out, which is what makes it the default landing.

---

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
