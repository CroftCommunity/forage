# Plan: public-site polish — the queue behind "the main site in better shape"

**Status: COMPLETE 2026-08-27.** Every phase is done or explicitly superseded; nothing
here is actionable. (Pass 1 was run 2026-08-27 — this plan predates the phase-plan skill,
so Phases 1 and 3 carry the template and the phases that closed earlier are left as the
record.) Landed on `main` at `7113d87` / `67d8d3c` / `b9114f2` / `a4d09c5`.

| Phase | State |
|---|---|
| 0 Sign-in | **DONE** — live at `forage-v40` |
| 1 Family-shaped skin picker | **DONE 2026-08-27** — four style rows, `family` canonical, `pairedWith` gone, `prefersDensity` on the family. Notes at the end |
| 2 Signed-out front door | **SUPERSEDED** — moved to `2026-08-26-3-plan-signed-out-front-door.md`, which is itself complete. Nothing in Phase 2 below is actionable |
| 3 Guest surface | **DONE 2026-08-27, in its REVISED form** — hide, not gate (owner reversed the approach; see the revision block below). `ringDial` is prose signed out, the vote arrows, star and Join/Leave are absent, and the score survives. `e2e/guest-surface.workflow.mjs` is the gate |
| 4 Curated names | **DONE** — names, Browse feeds, LIVE drift check |

*This line was itself stale until 2026-08-28: it still read IN FLIGHT with Phase 3 OPEN,
describing a `ringDial` that renders four buttons, after the hide-not-gate work had
landed and replaced it. The same defect this file's own note below warns about, committed
in this file, by appending a Phase 1 update instead of re-reading the whole line.*

*Why this line is this specific:* a peer session read "Phases 1–3 open" from outside and
could not tell whether Phase 2 was pending work or already superseded, nor whether the
claim covering this plan still stood. The Status line is the only thing anyone queued
behind a plan can read.
**Serves:** the owner's 2026-08-26 pause of E138 (private BBS on Spaces) — *"we are
pausing it until we have the main site in better shape."* `TODO.md` § Needs the owner
carries that pause; this plan is what "better shape" was pointed at.
**Worktree:** `worktrees/forage/polish` on `claude/polish`. Claim:
`CroftC/.coordination/claims/forage--polish.md`.

---

## Verified Assumptions (Pass 1, 2026-08-27)

Everything below was read or measured on the merged tree, not recalled from the draft.

| Claim | How verified |
|---|---|
| The skin registry still carries `palette` + `pairedWith` + `prefersDensity`; 7 skins, 4 families | read `js/skins.js:29-37` |
| The picker still filters the flat registry into two optgroups by palette | read `js/ui/views.js:580-585` |
| `bbs`, `usenet`, `phpbb` are EACH simultaneously a skin id and a would-be family id | read the registry — the namespace hazard is real, not hypothetical |
| `prefersDensity` is per-SKIN, so a family's two halves can disagree and a palette toggle could silently change board density | read `js/skins.js:36-37` + `js/board-density.js:33` |
| **Five** controls look available to a guest and refuse on click | measured in a browser, signed out, on `/` and `/f/whats-hot` (below) |
| Compose and reply do NOT render signed out — already hidden, out of Phase 3's scope | same measurement: neither appears |
| Every `disabled` in `js/ui/lens-views.js` is TRANSIENT (in-flight action), never gating | read all 10 occurrences |
| The boost arrow tells a guest **"Log in to vote."** | clicked it, signed out, and read the toast |

**The measured guest inventory** — what renders, and what happens on click:

```
SURFACE        CONTROL              ON CLICK, SIGNED OUT
lens home      Following            toast "Sign in first — rings are computed from your graph."
lens home      Mutuals              same
lens home      Mutuals +1           same
feed board     ☆ favorite           toast "Sign in to favorite feeds — it pins to your Bluesky account."
feed board     Join                 toast "Sign in to join feeds — it saves to your Bluesky account."
every post     ▲ boost              toast "Log in to vote."          <-- WRONG POPULATION
every post     ▼ bury               DL-011: no Bluesky analogue, separate concern
(not rendered) compose, reply       already hidden — nothing to do
```

**The boost message is a different defect from the other four.** The other four use the
right vocabulary and only have the wrong affordance. `"Log in to vote."` comes from
`voteBox` in `js/ui/components.js:47`, which is shared with the MEMORY population — where
"log in" is a real act. On the Bluesky lens there is no login: Forage has no accounts, you
bring one. So that string tells a guest to do a thing that does not exist, which is the
3h "populations do not mix" tenet broken inside a message rather than inside a layout.

## Documentation Impact (Pass 1)

- `js/skins.js` header comment — it documents "SKINS SUBSUME THEMES" and the sibling
  toggle. Phase 1 makes the PICKER family-shaped while the MODEL stays one-skin-one-palette,
  which is precisely what a future reader will get wrong. **Phase 1.**
- `docs/SKINS.md` — grepped; describes skins generally, names no picker shape. Check at
  execution; likely a one-line addition. **Phase 1.**
- `AGENTS.md` § Verification / § Surfaces — no picker or gating references found. No action.
- `README.md` — grepped for `skin`, `picker`, `ring`: nothing that Phase 1 or 3 stales.
- `ledger/divergence.js` — Phase 3 needs a DL row ONLY if we choose to differ from
  bsky.app's guest posture on purpose. Decide in Phase 3, not before.
- `sw.js` SHELL — no new files in either phase; `CACHE` bumps in both.

## Concurrency Map (Pass 1)

```
Sequential spine: Phase 1 → Phase 3
```

**All phases sequential**, for exactly one reason — and it is worth naming because it is
the ONLY one:

- **Write-sets are otherwise disjoint.** Phase 1 writes `js/skins.js`, `js/ui/views.js`,
  `js/board-density.js`, `test/skins.test.js`, `e2e/skins.workflow.mjs`. Phase 3 writes
  `js/ui/lens-views.js`, `js/ui/components.js`, `css/app.css`, `e2e/*`. No overlap.
- **They collide on `sw.js`'s `CACHE` constant and nothing else.** That single mutable
  value is also bumped by peer sessions, and this session has already seen two branches
  independently sit on `v39` and merge CLEAN because both had written the identical line.
  Git would have folded two unrelated SHELL changes into one cache generation silently.
- **Missed-parallelism note for Pass 2:** if the `CACHE` bump were deferred to a single
  landing commit, these two phases would be genuinely parallel-safe. Not proposing it —
  the bump belongs with the change that requires it — but recording that the sequential
  constraint is one line wide, not structural.

## Problem Statement

Five things, found by the owner using the deployed site on 2026-08-26 and by reading
the code behind each report. They are unrelated in mechanism and related in kind: every
one is a place where the deployed app tells the visitor something that is not true.

0. **Signing in on forage.fyi does not sign you in.** The authorize round-trip
   completes at `bsky.social` and returns to a signed-out page. Captured below.
1. **The skin picker presents seven themes where there are four.** Light and dark
   siblings are already modelled as pairs in the registry; the picker flattens them.
2. **The signed-out lens has no front door.** The rook-and-wreath emblem hero with
   its sign-in call exists — in the *other* population — so the surface production
   actually serves has nothing.
3. **Session-gated controls do not read as gated.** The ring dial offers Following /
   Mutuals / Mutuals +1 as ordinary buttons, then refuses with an error toast on click.
4. **We call a feed by a name its own network stopped using**, and the name we would
   replace it with collides with a page of ours.

## Approach

One phase per item, each landing on its own. Every phase states its RED test before
its change, and every phase that ships user-visible behaviour extends a workflow
journey in the same unit (invariant 6b). Phase 0 goes first and alone.

## Reasoning

The unifying argument is the tenet this repo already wrote down for the skin toggle,
in `skinToggle()` (`js/main.js`):

> *the control has to READ as unavailable rather than sit there absorbing clicks.
> Disabled with a title that says why — a dead-looking button is a bug report
> waiting to happen.*

Phases 1–4 are that same sentence applied to four other surfaces. Phase 0 is the
sharpest form of it: a control that absorbs an entire OAuth round-trip and returns
you to where you started, silently.

---

## Phase 0 — sign-in returns you signed out (P0) — DONE 2026-08-26

### What is actually wrong

`bootAuth()` (`js/ui/lens-views.js`) guards re-entry with a boolean and returns
**without awaiting the boot already in flight**:

```js
let bootStarted = false;
export async function ensureAuthBoot() { return bootAuth(); }
async function bootAuth() {
  if (bootStarted) return;          // <-- resolves IMMEDIATELY, boot still running
  bootStarted = true;
  ...
  const s = await m.restore();      // this is what consumes the callback
}
```

Boot ordering in `js/main.js` then does this:

```
 render()                    ← SYNCHRONOUS. Paints the signed-out lens.
   └ sessionCard()             manager === null, so it calls bootAuth()
       └ bootAuth() ........... starts. initSession() awaits a vendor import
                                AND a /client-metadata.json fetch before
                                client.init() ever looks at location.hash.

 import('./auth/session.js').then(...)     ← both modules are SW SHELL entries,
   └ import('./ui/lens-views.js')            so both resolve from cache, fast
       └ await ensureAuthBoot() ............ bootStarted is true → returns NOW
       └ history.replaceState({}, '', '/')   ← FRAGMENT DESTROYED HERE
```

The comment directly above that block states the correct intent — *"must complete the
exchange BEFORE the hash changes"* — and the guard's early return is what defeats it.
The race is not close: two SHELL-cached module fetches beat a vendor bundle import
plus a network fetch plus auth-server metadata resolution, every time.

`restore()` then does exactly what its contract says with an empty URL:

```js
const result = await client.init();
if (result === undefined) { session = null; setState('signed-out'); return null; }
```

Which is the reported symptom: back at `https://forage.fyi`, clean URL, signed out.

### Evidence (captured 2026-08-26, hermetic, no network)

Harness boot at `/#state=st-1&iss=…&code=cod-abc` with a fake manager whose
`restore()` blocks until released, standing in for the real `client.init()`:

```
WHILE the exchange is still in flight:
  location.hash = ""
AFTER release:
  what restore() saw   = ""
RESULT: params were STRIPPED before the exchange could read them.
```

Not inferred. The exchange reads an empty hash.

### RED first

`e2e/signin.workflow.mjs` gains a journey: land on a fragment callback with a deferred
`restore()`; assert `location.hash` **still carries `code`** while the exchange is in
flight; release; assert signed-in AND the URL cleaned. Fails today at the first
assertion. The seam already exists — `initSession()` honours
`window.__forageFakeSessionManager`, the pattern `bluesky-view.workflow.mjs` uses.

Add at the unit tier (`test/auth-session.test.js`): concurrent callers of a
boot-once helper must all await the same completion — the pure form of the defect.

### GREEN

Memoize the promise instead of flagging the start:

```js
let bootPromise = null;
function bootAuth() {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => { /* existing body */ })();
  return bootPromise;
}
```

**This repo already learned this exact lesson, this same day, one seam over.**
`TODO.md`: *"Ring caching — DONE 2026-08-26 (3x): … the promise is cached so racing
callers share one graph walk."* `bootAuth` is the boolean-flag version of the bug 3x
fixed for rings. Worth saying in the commit so it is learned once.

### Dimensions

- **Enforcement:** sign-in is a refusing surface with no scenario row. The
  signed-out / restoring / signed-in triad (`sessionGateMessage`, pinned by
  `test/lens-posture.test.js`) covers *messages*; nothing covers *boot ordering*.
- **Versioning:** `js/main.js` and `js/ui/lens-views.js` are SHELL entries → bump `CACHE`.
- **Testbed:** confirm on a real device against a throwaway account, never the owner's.

### Open

The **red bar at the bottom of a signed-out page** the owner reported is NOT explained
by this and is NOT reproduced: a hermetic probe of the signed-out lens home found zero
toasts and nothing `position: fixed` near the bottom. Leading candidate is an
error toast with an empty body (`.toast.err` is `#9E2F26`, fixed bottom-right,
`10px 14px` padding — an empty one is a small red block), and `toast(e.message, 'err')`
appears in several `catch` arms where `e.message` can be empty. **Not claimed.** Needs
a screenshot or a live capture before anyone names a cause.

---

## Phase 1 — the skin picker becomes family-shaped (owner-decided)

**Decided 2026-08-26:** rows are families, not skins; a family name must read for both
palettes; Classic BBS shows as dark-only rather than growing a light sibling.

The registry already models pairing (`palette`, `pairedWith`, `validatePairing`). Only
`settingsView()` flattens it — it filters the registry by palette into two optgroups.
So this is a presentation change over an existing model, **not** a return of the theme
axis that phase 1A deliberately retired. `forage.skin` keeps storing a concrete skin
id, so stored preferences survive and the pre-paint boot scripts in
`index.html` / `404.html` need no change.

### 1a — the registry learns families (pure, RED first)

Family becomes canonical; `pairedWith` is deleted and `siblingOf` derived from
family + palette. `siblingOf` keeps its signature, so `skinToggle()` is untouched.
Deriving it makes `validatePairing`'s three error classes — asymmetric, dangling,
self-paired — structurally impossible rather than merely checked.

New: `familyOf`, `familyMembers`, `resolveInFamily(family, palette)`, `families()`,
`validateFamilies`.

RED tests:
1. every skin declares a REGISTERED family — a fake with `family: 'nope'` names it
2. no family holds two skins of the same palette — names the family and both ids
3. every registered family has at least one member
4. the REAL registry passes `validateFamilies`
5. `familyOf` / `familyMembers` name unknown ids, the way `hrefFor` does
6. **the two namespaces do not overlap by accident** — `bbs`, `usenet` and `phpbb` are
   each simultaneously a skin id and a family id, so a wrong-namespace argument would
   otherwise resolve silently. `familyMembers('default')` must throw; `hrefFor('forage')`
   must throw.
7. `siblingOf` still returns the opposite-palette member, and `null` for a sole-palette
   family — that null is what disables the toggle
8. `resolveInFamily` returns the wanted palette, and falls back to the sole member where
   that palette does not exist — a legal answer, not an error
9. `families()` returns one row per family with label + light + dark, flagging sole rows
10. **the owner's naming rule, gated:** no family label may contain a palette or flavour
    word. It has to read for both sides. A rule with no check decays into prose
    (`PATTERN.md`).
11. `resolveDefault` still resolves the OS dark preference through the family
12. `prefersDensity` (DL-028) moves from the skin onto the FAMILY. Today both phpBB
    entries carry `compact` independently; nothing stops them disagreeing, and a
    disagreement means **toggling palette silently changes board density**. Moving it
    deletes that class. One line in `js/board-density.js` follows.

### 1b — the picker renders families

Option `value` is a family id; label is the family label, plus `— dark only` where the
family ships one palette. The change handler keeps the current palette and calls
`resolveInFamily`. Selecting a dark-only family from light lands on dark and the
toggle disables with its existing words.

### 1c — workflow (invariant 6b)

`e2e/skins.workflow.mjs` currently selects by concrete skin id. Rework:

- the picker offers exactly **4** rows, not 7
- pick "Usenet gray" from light → `/skins/usenet.css`
- toggle ☾ → `/skins/usenet-dark.css` **and the picker still reads "Usenet gray"** ←
  this assertion is the whole feature
- pick "Forage" while dark → `forage-dark`, not `default` ← the palette carries across
  families
- pick "Classic BBS" → dark, and ☀ is `disabled` with words
- reload → family and palette both survive, from one stored id

**Trap to avoid:** `selectOption('bbs')` passes today and would keep passing after the
change *for a different reason* — `bbs` is both a skin id and a family id. The reworked
assertions must read the resolved `link#skin-sheet` href, never the select value.

### Dimensions

sw.js SHELL bump; W5 axe re-run over `/settings`; mobile fit improves (shorter rows);
the `js/skins.js` header comment gains the sentence a future reader will otherwise get
wrong — *the picker is family-shaped; the model is still one skin, one palette.*

---

### Phase 1 — template fields (Pass 1)

**Goal:** The picker offers one row per style family; the ☾/☀ toggle chooses the side.
**Call chain:** `render()` → `settingsView()` (`js/ui/views.js`) → the `<select>` → its
`change` handler → `skins.resolveInFamily(family, currentPalette)` → `skins.setSkin(id)`
→ `apply()` swaps `link#skin-sheet`. The masthead ☾/☀ (`skinToggle()` in `js/main.js`)
keeps its existing chain because `siblingOf` keeps its signature.
**Wiring test:** `e2e/skins.workflow.mjs` — from a real selection in Settings, assert the
`link#skin-sheet` href changes to the family's member for the CURRENT palette, then toggle
and assert the picker STILL shows the same family selected. That second assertion is the
feature; the first alone would pass on today's code.
**Named behaviours, with edges:**
- one option per family (4), not per skin (7)
- pick a family while DARK → the dark member; while LIGHT → the light member (both
  directions, or a hardcoded palette would pass)
- a sole-palette family (Classic BBS) → its only member, and ☀ goes `disabled` with words
- pick a family whose current-palette member does not exist → falls back, does not throw
- reload → family AND palette survive, from ONE stored id
- `familyMembers('default')` throws and `hrefFor('forage')` throws — the two id
  namespaces overlap on `bbs`/`usenet`/`phpbb` and a wrong-namespace argument would
  otherwise resolve silently
- no family label contains a palette or flavour word (the owner's naming rule, gated)
**Depends on:** nothing.
**Read-set:** `js/skins.js`, `js/ui/views.js`, `js/board-density.js`, `js/main.js`,
`test/skins.test.js`, `e2e/skins.workflow.mjs`.
**Write-set:** `js/skins.js`, `js/ui/views.js`, `js/board-density.js`,
`test/skins.test.js`, `e2e/skins.workflow.mjs`, `sw.js`.
**Shared-state contract:** Writes one `localStorage` key (`forage.skin`) — unchanged in
shape, still a concrete skin id, so stored preferences survive and the pre-paint boot
scripts in `index.html`/`404.html` need no change. Never `forage.state`. Invokes no
`git checkout`/`stash`/`rebase` in the parent worktree; binds no ports; reaches no
network (skins are pure CSS — `e2e/skins.workflow.mjs` already asserts `shimMisses()`
is empty).
**Risks:**
- `selectOption('bbs')` passes TODAY and would keep passing after the change **for a
  different reason**, because `bbs` is both a skin id and a family id. Every reworked
  assertion must read the resolved sheet href, never the select value.
- Moving `prefersDensity` onto the family is a behaviour change, not a refactor: today
  the two phpBB entries carry it independently and could disagree, which would mean a
  palette toggle silently changing board density. Moving it deletes that class; it also
  touches DL-028, which landed hours before this plan was drafted.
**Done when:**
1. **Behavioral:** In Settings the picker lists four styles; choosing one keeps your
   current palette; the masthead toggle moves between that family's two sides and is
   disabled, with words, on the family that has one.
2. **Verification:** `npm test` and `npm run workflows` — `skins.workflow.mjs` passing
   its reworked assertions, and `a11y-skins.workflow.mjs` still clean over `/settings`.
**Validation:** Moderate. Tests, plus looking at the picker on all four families at 390
and 1280 — the rows get shorter, so this should improve mobile fit rather than risk it.

## Phase 2 — the signed-out lens gets its front door back

### The finding

The hero was never removed. `boardView()` in `js/ui/views.js` renders, for `!V()`, a
`.hero-gate` carrying `assets/logo-wordmark.jpg` — the rook in the wreath as the O —
with the tagline and a sign-up call. That is the **memory** population. Production
defaults to the **Bluesky lens** (`js/ui/lens-views.js`), which has no hero at all.
The art is in the repo and shipped; the surface people actually land on never shows it.

### The unit

A lens-native signed-out hero: the emblem, one line of what Forage is, and the
sign-in call. Collapsible, **expanded by default** (owner). Collapse state is
device-local like skin and density — its own key, never `forage.state`
(`test/store-modes.test.js` is the teeth on that).

RED tests: default expanded; the toggle persists; unreadable storage falls back to
expanded (the `getSkin()` try/catch precedent, not a throw).

Workflow: signed-out lens home shows the hero expanded with the emblem; collapsing
survives reload; **signed in it is absent**.

### Dimensions

- **A11y:** the `<img>` alt already exists in `views.js` and should be reused verbatim.
  The collapse control needs `aria-expanded` and a real name — `test/a11y-names.test.js`
  is the home for the source-level check, `e2e/forms.workflow.mjs` for behavioural.
- **Mobile-first:** "expanded by default" costs vertical space on a 390px phone. Assert
  the first board row is still reachable — an explicit assertion, because this is the
  one dimension where the owner's default actively works against the reader.

---

## Phase 3 — gated controls read as gated, and an account is easy to find

### The finding

`ringDial()` renders all four rings as identical `.btn sm`. Clicking a gated one calls
`toast(…, 'err')`. AGENTS.md § *Adding a user-visible function* requires all four
states — skeleton, empty, error, **gated** — and the ring dial has an error state
wearing the gated state's clothes.

### The unit

Signed out, Following / Mutuals / Mutuals +1 render disabled, and the dial carries a
**visible line of words**, not only a `title`. A `title` alone is not a fix: it does not
exist on touch, and disabled controls are skipped by some assistive tech. Grayed-out
plus tooltip is the request; grayed-out plus tooltip plus one visible sentence is the
version that actually works on the phone the owner is holding.

The restoring-vs-signed-out distinction must survive. That distinction was a phase-1
live-proof finding, it lives in `sessionGateMessage()` (`js/substrates/lens.js`) and is
pinned by `test/lens-posture.test.js:347`. Flattening it back into one message would
undo a bug that was already paid for once.

Third ask — *make it easy to find how to make an account.* The lens sign-in card offers
a handle field and nothing else; there is no "don't have one?" path. It gains an
out-link to create a Bluesky account, out-linking per the lens tenet.

### The survey, as a check rather than a list

The owner drew a real distinction: some controls should be **hidden** signed out
(no context at all), others should be **shown and gated** (real, just not yours yet).
That decision per control belongs in a pinned matrix, not in prose — the idiom
`ENFORCEMENT.md` already prescribes for every refusing surface. The check enumerates
the session-gated controls and asserts each is either absent or gated-with-words when
signed out. Then a fifth control added later cannot quietly ship as neither.

---

### Phase 3 — REVISED 2026-08-27: HIDE, not gate

**The approach reversed after the owner heard it described.** Pass 1 and every earlier
draft specified *gate* — render the control, disabled, with words. Presented with the
follow-on question (does a gated control open the sign-in sheet, or just say its piece?),
the owner rejected the whole shape:

> *"a thousand things that pop up a login seems pretty obnoxious to me… I actually think
> bury or hide is the better option then for logged out, and we'll need to come up with a
> way to sort of indicate what's possible if you want to log in. But I think putting a
> bunch of pop up landmines, even if it's our own pop up, is a bad plan."*

That is right, and it kills the version I was about to build. Six controls scattered
across every surface whose behaviour is "summon a modal you did not ask for" is a
minefield even when the modal is ours. **Signed out, the six controls are ABSENT.**

**Three consequences that are not "remove the button", and are the actual work:**

1. **The ring dial stops being a dial.** Hiding Following / Mutuals / Mutuals +1 leaves one
   setting — World — and a one-option dial reads as broken, not clean. Signed out it is
   not a control at all: it is a sentence saying what rings are, where the dial will be.
2. **Hiding the control must NOT hide the information.** The boost arrow and the score
   share a box. The arrow is an action you cannot take; **the score is a fact**, and it is
   how you tell a busy thread from a quiet one. Arrow goes, number stays. Read literally,
   "hide the vote control" would take the score with it and make every post look identical.
3. **The feed header just gets quieter** — name, creator, likes, description. It needs
   nothing added; it reads as a thing you are looking at rather than one you are managing.

**Saying what an account adds, without landmines:** words where the controls would be,
never controls that talk. Text cannot be tapped by accident and does not look
interactive. Exactly two places, because six muted "needs an account" lines is its own
quieter nagging:
- where the ring dial would be — one sentence on what rings are;
- the card that already says *"Signed out, the lens is read-only"* names what you would
  GAIN. It currently states a limitation without naming a single thing you would get.

**Deferred, owner's idea 2026-08-27:** *"having a button that's like, you know, show me
what creating an account adds"* — a single deliberate affordance instead of scattered
hints. Explicitly NOT built now: *"we gotta start somewhere and then let's work from
there and I can kind of see what we're working with."* Revisit once the plain version is
live and judgeable.

### Phase 3 — template fields (Pass 1, revised)

**Goal:** A guest is never shown a control they cannot use, and still learns what an
account would add.

**Pass 1 changed this phase's shape.** The draft named the ring dial. The measured
inventory (see Verified Assumptions) is FIVE controls across three surfaces, and one of
them is a different defect: the boost arrow says *"Log in to vote."*, which is the memory
sandbox's vocabulary on the Bluesky lens, where there is no login. Fixing affordances
without fixing that would leave the most-repeated gated control on the site — it is on
every post row — telling guests to do something that does not exist.

**Call chain:** `render()` → `lensBoard()`/`feedBoard()`/`ringDial()` → the control →
its click handler → `sessionGate()`/`!session` → today a `toast`. After: the control
renders gated and the handler is unreachable for guests.
**Wiring test:** a workflow journey, signed out, asserting on the RENDERED page rather
than on the click: none of the six controls exists in the DOM, the score still renders,
and the ring explanation is present. Then signed in, all six are back. RED today — all
six render enabled.
**Named behaviours, with edges:**
- signed OUT: none of the six is in the DOM — asserted as ABSENT, not as disabled
- signed OUT: **the score still renders** — the arrow is an action, the number is a fact
- signed IN: all six are present and live (the other direction, or "always hidden" passes)
- the vote control's rule is `canVote`, which BOTH populations already compute, so the
  memory sandbox signed-out gets the same treatment from one rule rather than two
- **RESTORING is not signed-out** — `sessionGateMessage()` distinguishes them
  (`js/substrates/lens.js:651`, pinned by `test/lens-posture.test.js:347`) and that
  distinction was a phase-1 live-proof finding. Flattening it would re-buy a paid bug.
- the ring card signed out contains prose and NO buttons — a one-option dial is the
  failure this phase exists to avoid
- no "needs an account" line appears more than twice on any page (the anti-nagging rule)
**Depends on:** nothing in this plan. Independent of Phase 1.
**Read-set:** `js/ui/lens-views.js`, `js/ui/components.js`, `js/substrates/lens.js`,
`css/app.css`, `test/lens-posture.test.js`.
**Write-set:** `js/ui/lens-views.js`, `js/ui/components.js`, `css/app.css`, `e2e/*`,
`sw.js`, possibly `ledger/divergence.js`.
**Shared-state contract:** No mutable state outside the write-set and `sw.js`'s `CACHE`.
`voteBox` is SHARED with the memory population, so any change there must leave the memory
population's wording and behaviour untouched — asserted, not assumed, because the whole
defect is one population's words appearing in the other.
**Risks:**
- `voteBox` is shared chrome. The obvious fix — changing its string — would put Bluesky
  vocabulary into the memory sandbox, which is the same defect mirrored. The gate message
  has to come from the caller, not the component.
- Disabling the ring buttons removes the only way a guest discovers what rings ARE. The
  words have to carry that, or the feature becomes invisible rather than gated.
**Done when:**
1. **Behavioral:** Signed out, no control on the lens invites a click it will refuse;
   each is absent or gated with a visible reason naming Bluesky. Signed in, all are live.
2. **Verification:** `npm run workflows` — the new signed-out journey and the existing
   `bluesky-view` signed-in journey both green; `npm test` for `sessionGateMessage`.
**Validation:** Moderate. Tests, plus a signed-out pass over `/`, `/f/...` and a thread
on a phone width, because the point of the phase is what someone SEES before clicking.
**Enforcement matrix:** this is a refusing surface, so per `ENFORCEMENT.md` the inventory
above becomes a pinned table the check reads — a sixth gated control added later cannot
then ship as neither hidden nor gated.

## Phase 4 — "What's Hot" is not what the network calls it — DONE 2026-08-26

### Probed, not inferred (unauth `app.bsky.feed.getFeedGenerator`, 2026-08-26)

```
uri rkey     : whats-hot                    ← the record key. Immutable.
displayName  : "Discover"                   ← the human name. Bluesky's to change.
description  : "Trending content from your personal network"
service did  : did:web:discover.bsky.app
```

Cross-checked against `getPopularFeedGenerators`, which lists the row as
`Discover | whats-hot`.

The owner's read was right in substance and inverted in detail: `whats-hot` is the
**fixed machine string**, and *Discover* is the **human-readable name**. `CURATED` in
`js/ui/lens-views.js` hardcodes `title: "What's Hot"` — a display name the network no
longer uses. This is precisely the gap invariant 12 exists for: the lexicon says what is
legal, the network says what is true, and a hardcoded display name is neither.

### The collision the owner sensed

Our `/feeds` page is titled **"Discover feeds"** and the sidebar link reads
**"discover ›"**. Rendering the feed's real name puts *Discover* (a feed) inside
*Discover feeds* (our page). That is the thing to clarify, and it is why this cannot be
fixed by editing one string.

### Recommendation

**Stop hardcoding display names at all.** Resolve each curated entry's `displayName`
from its generator, keeping the current string as an explicitly-labelled fallback for
the offline case. That makes the whole class — a stale hardcoded network name —
unable to recur, rather than fixing this one instance. Then rename our page
(*Browse feeds* / *Find feeds*) so the collision is gone.

`/f/whats-hot` must keep resolving whatever the display name becomes: the rkey is the
route, and those links have been shared. Assert it.

### Test tiers

- unit: a curated entry carries a uri and a fallback title, and the fallback is *marked*
  as a fallback; a failed resolve falls back and says so
- workflow: `/f/whats-hot` renders the network name; the route survives
- **live tier (`live = true`, LIVE=1 only):** assert our fallback titles still match the
  network. Network-touching, so it must never sit in push CI — the runner's fitness
  rule already handles this and SKIP-reports it loudly.

### Ledger

No DL row: we render the network's name, so there is no divergence.

### What shipped, and the two decisions that shaped it

BOTH hardcoded names were wrong, not one. The feed at rkey `whats-hot` reports
`"Discover"`; the account at `bsky.app` reports `"Bluesky"`, and this repo had been
shipping `"Bluesky Team"` — a name that account has never used. Finding the second
one is the argument for the drift check: a plausible-looking wrong name survives
indefinitely, because nobody re-reads a label that reads fine.

1. **Resolve where the data is already in hand; hardcode elsewhere, with a check.**
   The board `<h1>` reached PAST an already-resolved `info` for the registry string —
   that was a bug, not a trade-off, and it cost no request to fix. The guest sidebar
   genuinely would have needed new requests and a second paint, so it keeps its
   synchronous string. The drift that choice invites is caught by
   `e2e/curated-names-live.workflow.mjs` (LIVE=1), which was bite-tested by restoring
   an old name and confirming it fails.
2. **One naming rule for every source (owner, 2026-08-26).** An earlier draft
   special-cased author boards to their handle, on the grounds that handles are unique
   and stable where display names are neither. The owner overruled it: that argument is
   about identifiers, and a sidebar is for reading. `sourceLabel` collapsed to
   `title || slug` for every kind, and the handle remains the route, the href and the
   hover title. The overruled argument is recorded in the source so it is not
   re-derived later.

---

## Order

**Phase 0 alone and first.** Then 4 (smallest, and it is a truthfulness fix), then 1
(owner-decided and self-contained), then 2 and 3 together — they are the same surface
and the same visitor.

## Open Questions (Pass 1, 2026-08-27)

- `[RECOMMENDED: BLOCKING for Phase 3]` **Per control: hide, or show-and-gate?** The owner
  named the distinction — *"some things we should just not show when someone's not logged
  in, because it has no context at all"* versus *"those should somehow indicate they
  require you to be logged in"* — and explicitly put the ring dial in the second group.
  The other four were never assigned. My recommendation, for confirmation not assumption:

  ```
  Following / Mutuals / Mutuals +1   GATE    (owner named these explicitly)
  ☆ favorite                          GATE    a real thing an account can do here
  Join                                GATE    same, and it is how feeds work
  ▲ boost                             GATE    plus fix the wrong-population message
  ▼ bury                              HIDE    DL-011: it has no Bluesky analogue at all,
                                              so it is not gated, it is inapplicable
  ```
  *Rationale: everything except bury is a real capability the reader gains with an
  account, which is what "gate" is for. Bury is the one that genuinely has no meaning on
  this network, and showing a permanently-inapplicable control teaches something false.*

- `[RECOMMENDED: PHASE-GATED — Phase 1]` **Does `prefersDensity` move from the skin onto
  the family?** *Rationale: today the two phpBB entries carry it independently, so they
  could disagree and a palette toggle would silently change board density. Moving it
  deletes that class — but it is a behaviour change to DL-028, which landed the same day,
  and it is the owner's call whether to disturb it now.*

- `[RECOMMENDED: ADVISORY]` **Does Phase 3 need a ledger row?** *Rationale: only if we
  differ from bsky.app's guest posture on purpose. bsky.app shows guests a mostly
  read-only surface too, so this may be convergence rather than divergence — worth a
  look at social-app before deciding, per invariant 12.*

## Review Log

### Pass 1: Reasoning and Plan Development — 2026-08-27
This plan predates the phase-plan skill; it was written as prose during a conversation and
executed from twice (Phases 0 and 4 both shipped and landed). Pass 1 brings the two OPEN
phases to the template and leaves the closed ones as the record.

**Grounded in the codebase, and it changed Phase 3's shape.** The draft named the ring
dial. Measuring what a signed-out visitor actually sees found **five** controls that look
available and refuse, across three surfaces — and one of them, the boost arrow on every
post row, says *"Log in to vote."*, which is the memory population's vocabulary on the
Bluesky lens where there is no login. That is a different defect from the other four,
which have the right words and only the wrong affordance. Reading the code alone would
not have found it: `voteBox` is shared chrome and the string lives in `js/ui/components.js`,
one file away from anything the draft named.

**Also found by measuring:** compose and reply do not render signed out at all, so they
are already "hidden" and out of scope — the draft implied they needed a decision. And
every `disabled` in `js/ui/lens-views.js` is transient, so nothing in the lens is gated
today; there is no existing pattern to follow, which is why the phase has to establish one.

**No Phase 0.** Every assumption in both phases is verified above by reading or by
measurement, and the one genuine unknown — hide versus gate, per control — is an owner
decision, not a question a probe can answer. A discovery phase would be theatre.

**Concurrency:** sequential, and the map records that the constraint is exactly one line
wide — `sw.js`'s `CACHE`. Without it the two phases have disjoint write-sets and would be
parallel-safe. Flagged for Pass 2 rather than acted on.

**Open:** three questions, one BLOCKING (hide-vs-gate per control), one phase-gated
(`prefersDensity`), one advisory (ledger row). None invented by me except the third; the
first is the owner's own distinction applied to controls they had not seen enumerated.

## Execution: Phase 1 — 2026-08-27

**Shipped, all three sub-steps.** The picker lists four styles; the ☾/☀ toggle chooses the
side; `forage.skin` still stores one concrete skin id, so the pre-paint boot scripts in
`index.html`/`404.html` were not touched.

**1a — the registry.** `family` is canonical, `pairedWith` deleted, `siblingOf` derived.
That was the point of the sub-step and it is worth stating what it bought: the three
failure classes `validatePairing` checked — asymmetric, dangling, self-paired — are now
**structurally impossible** rather than caught, because there is no second place to write
the relationship. Their four tests were **deleted, not ported**; a test for an impossible
state is a test that can never fail. Deriving introduces exactly one new class (two
same-palette skins in one family, where `siblingOf` would pick arbitrarily) and
`validateFamilies` guards it.

**The owner's naming rule is gated, not written down.** No family label may carry a palette
word or a parenthetical. `Forage (light)` as a family row would lie about half of what it
selects; the parenthetical ban is the proxy for "flavour", since `(amber terminal)` and
`(newsprint)` describe one side. Skin labels keep their parentheticals — they name one
palette, which is the whole point of them. PATTERN.md: a rule with no check decays into
prose, and naming conventions decay fastest.

**`prefersDensity` moved to the family**, which deletes a class rather than testing for it.
Both phpBB entries carried `compact` independently and nothing stopped them disagreeing —
a disagreement would have meant **the palette toggle silently re-laying-out the board**.
`e2e/density.workflow.mjs`'s last assertion now says so where it happens.

**1c — the workflow, and the trap the plan named.** `selectOption('bbs')` passes before and
after this change **for different reasons**, because `bbs` is simultaneously a skin id and
a family id. Every assertion reads the resolved `link#skin-sheet` href or the computed
paint — except the one that reads the select value, which IS the feature: after toggling,
the picker still shows the same style. Under the flat list, toggling moved your selection
to a different row.

**Three workflow assertions were wrong in the same way, and the way is instructive.** Each
assumed a LIGHT starting palette that the family model no longer guarantees: picking Forage
from Classic BBS lands on `forage-dark`, not on the light default, because the palette
carries across families. That is the feature, and three tests written against the old model
encoded "changing style resets you to light" without ever saying so. Fixed by threading the
real palette through — which also gave the carry-across three independent assertions from
three different origins.

**Left as-is:** the Settings row is still labelled "Skin" though it now lists style
families. The owner's vocabulary is "skin"; renaming it was not asked for and would churn
the a11y and workflow selectors that name it.

**Bite-tested, twice, because the plan's own trap warned that these assertions can survive
a rewrite while proving nothing:**

1. *Revert the picker to per-skin rows, family model intact underneath.* W4 dies — but by
   `selectOption('forage')` finding no such option, which is a coarse kill and slow (each
   miss burns a 30s actionability wait).
2. *Keep the four family rows; hardcode the change handler's palette to `'light'`.* This is
   the precise mutant, and it is the one worth reporting: picking Usenet gray while in dark
   lands on `usenet` instead of `usenet-dark`. **The full W4 kills it by TIMEOUT** — the
   wait for a `usenet-dark` href can never become true — which counts as a kill but takes
   30s to say so. A five-second targeted probe gave the same verdict immediately, and both
   directions were confirmed: mutant `usenet`, restored `usenet-dark`.

**Gate:** 486 unit / 88 conformance / 14 workflows, 0 failures. Looked at on 390 and 1280;
`a11y-skins` still clean over `/settings`.
