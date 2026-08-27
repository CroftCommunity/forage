# Plan: public-site polish — the queue behind "the main site in better shape"

**Status:** IN FLIGHT. Updated 2026-08-27, LANDED on `main` at `7113d87`.
- **Phase 0 DONE** — sign-in fixed; live on forage.fyi at `forage-v40`.
- **Phase 4 DONE** — curated names, `/feeds` → Browse feeds, LIVE drift check.
- **Phase 2 SUPERSEDED** — not open here. It moved to
  `2026-08-26-3-plan-signed-out-front-door.md`, whose Phase A has itself landed. Read
  that plan's Status for the front-door work; nothing in Phase 2 below is actionable.
- **Phase 1 OPEN** — the family-shaped skin picker. Design decisions settled with the
  owner 2026-08-26 and recorded below; no code written.
- **Phase 3 OPEN** — gated controls read as gated. Verified still true on `main`
  2026-08-27: `ringDial` renders four identical `.btn sm` buttons and refuses with an
  error toast on click.

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
