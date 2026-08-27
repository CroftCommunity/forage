# Plan: the signed-out front door — sticky masthead, auth sheet, emblem hero

**Status:** Passes 1, 2 and 3 complete. **Phase 0 DONE** · **Phase A DONE** (its
`scroll-margin-top` item DROPPED with reasons, see the phase) · **Phase B DONE**
2026-08-27 · **Phases C and D BLOCKED on three owner confirmations** (see Open
Questions) · **Phase E** follows D. **Phase 0 D1 RESOLVED** (2026-08-27) — Phases C and D
are unblocked. **Phase A's tap-target half DONE**; its BLOCKING layout question is resolved.
Phase A's `scroll-margin-top` item and Phases B–E remain open.
**Supersedes** `2026-08-26-2-plan-public-site-polish.md` § Phase 2, which becomes a pointer.
**Worktree:** `worktrees/forage/polish` on `claude/polish`. Claim: `CroftC/.coordination/claims/forage--polish.md`.

---

## Problem Statement

A signed-out visitor on a phone is met by the wrong thing. Measured against the
deployed lens at 390×844 (2026-08-26, `forage-v38`):

```
y=  55   The Lens
y=  98   Your ring            ← the FIRST card, and three of its four
y= 248   Trending               buttons refuse anyone signed out
y= 356   what Forage is
y= 575   Browse
y= 708   Sign in with Bluesky ← starts 136px above the fold; the handle
                                field and its button sit at or below the edge
y= 948   Feeds                ← below the fold
```

The front door leads with a locked control and hides the key. Three separate gaps
produce it:

1. **The masthead scrolls away.** The one sign-in affordance always present stops
   being present the moment you move.
2. **There is no front door on the lens at all.** The rook-and-wreath emblem with its
   sign-in call exists in `boardView()` (`js/ui/views.js`) — in the MEMORY population.
   Production defaults to the lens (`js/ui/lens-views.js`), which has never shown it.
3. **Signing in presumes Bluesky.** `startDirectSignIn()` hardcodes
   `https://bsky.social`. Forage is an atproto client and its front door says otherwise.

Constraint: Forage has no accounts of its own on the lens. Account creation happens on
a PDS, so the front door's job is to route people to a server, not to register them.

## Reasoning

**Why the masthead goes first.** The owner named the real path: *"folks who are used to
that kind of design, they're gonna automatically see the login in the top right and kind
of get the whole thing"*, and called the hero *"a little bit of like a helping funnel"*.
So the masthead must be correct and the hero must be handsome — different bars,
different phases. Sequencing is also load-bearing for safety: dismissal-never-expires
(owner's call) is only survivable because a sticky masthead keeps sign-in on screen for
someone who dismissed the hero. **Reordering A after D reintroduces a dead end.**

**Why a host sheet rather than a bigger sign-in button.** Every atproto client has to
teach that servers are real and independent. A stacked list with visibly different rules
(two open, two invite-only) teaches it by showing it. The owner asked for the Reddit
mobile shape explicitly, and for the other hosts *"as like an homage and convenience"*.

**Alternatives considered and rejected:**

- *One "Continue with Bluesky" button per host, no create/sign-in split.* Rejected once
  `prompt=create` was verified — the split is a genuinely different destination, not two
  buttons pointing at one screen. This was my recommendation until the owner pushed back
  and probing proved them right.
- *Resolve the host list from the network at runtime.* Rejected for the same reason the
  curated feed names are not resolved in the sidebar: it puts requests and a second paint
  on the front door to avoid drift that a LIVE check catches for free. Second use of a
  pattern established the same day.
- *Hero on mobile only.* Rejected by the owner — *"it's more about like prominent logo,
  you know, branding, like it's more about getting it seen"*. Accepts three sign-in
  affordances on desktop; dismissal is what makes that tolerable.
- *A hand-rolled modal div.* Rejected in favour of native `<dialog>`, which brings focus
  trapping, `Esc`, and background inertness. Modals are exactly where hand-rolling fails.
- *Theme-adaptive SVG emblem now.* Deferred. The wordmark letters are dark green; making
  them follow the skin means the letters become SVG text/paths taking `currentColor` —
  a redraw, not a code change. Phase E does the cheap half and decides with it in hand.

## Verified Assumptions

| Claim | How verified | Date |
|---|---|---|
| `prompt_values_supported` includes `create` on all four hosts | `GET /.well-known/oauth-authorization-server` on each | 2026-08-26 |
| bsky.social, blacksky.app open signups; northsky.social, zio.blue invite-only | `com.atproto.server.describeServer` → `inviteCodeRequired` | 2026-08-26 |
| `blacksky.community` is NOT a PDS; the host is `blacksky.app` | `describeServer` returned non-JSON on the former, `did:web:blacksky.app` on the latter | 2026-08-26 |
| No atproto PDS at `mu.social` or `muni.town` | `describeServer` — neither answers | 2026-08-26 |
| All four hosts advertise scopes `atproto` + `transition:generic` (what we request) | `scopes_supported` in each auth-server document | 2026-08-26 |
| The vendored client's `signIn` takes a second options argument carrying `prompt` | `grep` of `vendor/atproto-oauth-client-browser.js`: `async signIn(e,r)`, `prompt:Ln.optional()` | 2026-08-26 |
| **Our** `createSessionManager.signIn(handle)` DROPS that argument | read `js/auth/session.js:122-130` | 2026-08-26 |
| The lens emblem hero does not exist; the memory one does | `boardView()` in `js/ui/views.js` renders `.hero-gate`; no equivalent in `lens-views.js` | 2026-08-26 |
| Signed-out mobile geometry above | Playwright measurement, 390×844, harness-served | 2026-08-26 |
| `assets/logo-wordmark.jpg` is 1600×576, 216 KB | `ls -la` + JPEG SOF parse | 2026-08-26 |
| **SUPERSEDED by the Pass 2 row below — the skin toggle was fixed upstream.** ~~masthead nav links 38×21 / 53×21; skin toggle 30×30~~ | Deployed-site survey by a third session, forage.fyi @ `forage-v38`, axe + real element geometry. **Provenance warning: that survey is UNCOMMITTED in the shared `forage/` checkout as of 2026-08-26 and has no identified author.** Recorded here so the measurement survives if that file is swept. Not re-derived — the survey says not to. | 2026-08-26 |
| The a11y gate scans only `/popular`, `/settings`, `/` under `wcag2a\|wcag2aa` | read `e2e/a11y-skins.workflow.mjs:36,44,82` MYSELF — same conclusion the survey reached | 2026-08-26 |
| **`.masthead` is ALREADY `position: sticky; top: 0; z-index: 40`** — landed upstream in `2c4b28d` | read `css/app.css:84-86` after merging origin/main | Pass 2, 2026-08-26 |
| **The masthead's tap targets still fail, and the gate cannot see them.** Measured on the merged tree at 390px: wordmark 107×30, "Home" 38×21, "Settings" 53×21, **"Sign in" 44×21**. Only `☾` (44×44) passes. NONE of the failures match the gate's selector | Playwright measurement + `el.matches()` against the gate's own selector string, `e2e/mobile-fit.workflow.mjs:33` | Pass 2, 2026-08-26 |
| **At 320px the sticky masthead is 107px tall** — it wraps to two rows (`.masthead` has `flex-wrap`), permanently consuming ~19% of a 320×568 screen | same measurement | Pass 2, 2026-08-26 |
| No `scroll-margin-top` exists anywhere in `css/app.css` | grep | Pass 2, 2026-08-26 |
| CI runs `npm run workflows`; LIVE/DOCKER skip-report by design | `.github/workflows/ci.yml:46-57` | 2026-08-26 |
| Neither README nor AGENTS.md enumerates individual workflow files | grep for `workflow.mjs` — AGENTS.md:158 names the corpus generically | 2026-08-26 |

**NOT verified (drives Phase 0):** that `signIn(host, { prompt: 'create' })` through *our*
vendored client actually lands on a create screen. Advertised support is not observed
behaviour, and Phases C and D both assume it.

## Documentation Impact

- `README.md:363` — says identity is **"Sign in with Bluesky"**. Becomes stale the moment
  the sheet offers other hosts. **Phase C.**
- `AGENTS.md` § Identity (line ~7) — "Forage runs the vendored official
  `@atproto/oauth-client-browser`" is still true, but the single-host framing needs the
  multi-host sentence. **Phase C.**
- `AGENTS.md` § Surfaces — the sheet is a new modal surface on the signed-out home; add
  one line. **Phase C.**
- `sw.js` SHELL — `js/auth/hosts.js` and any new asset must be listed, or
  `test/skins.test.js` "1G: every SHELL url resolves" and the offline shell both break.
  **Phase B (hosts.js), Phase E (assets).**
- `CroftC/.claude/DEPLOYED.md` — generated; never hand-edited. No action.
- `CroftC/.claude/WEB-TESTING.md` — index only; no new toolchain pin. No action.
- Grepped `README.md AGENTS.md docs/ .github/` for `workflow.mjs`, `startDirectSignIn`,
  `masthead` — no enumerated lists that a new file would stale. Recorded per the
  "cannot be empty" rule.
- `plans/2026-08-26-2-plan-public-site-polish.md` § Phase 2 → replace body with a pointer
  here. **Phase A** (the first phase to land makes it stale).

## Concurrency Map

```
Sequential spine: Phase 0 → A → B → C → D → E
```

**All phases sequential.** Three independent reasons, any one of which is sufficient:

1. **Write-set collision.** A, C, and D all write `css/app.css`; C and D both write
   `js/ui/lens-views.js`; B, C, and E all write `sw.js` (SHELL and/or `CACHE`).
2. **Shared-state collision.** Every phase bumps `sw.js`'s `CACHE` constant, which is a
   single mutable value peer sessions also bump (observed: `3a0443c` "sw v35 — main
   landed its own v34 while this branch merged").
3. **Semantic dependency.** D's dismissal is only safe after A ships; C cannot be built
   before B's `signIn` seam exists; E measures an asset D introduces.

**Missed-parallelism check:** B and E have disjoint code write-sets (`js/auth/hosts.js`
vs `assets/*`), but both write `sw.js` SHELL, so they stay sequential under the hard rule.
Not worth splitting the SHELL edit to buy parallelism on a two-phase pair.

## Observability (Pass 3, cross-cutting)

The plan had nothing here, which is conspicuous given what produced it: **the defect this
plan grew out of was SILENT.** Sign-in redirected, came back, and reported nothing.
`client.init()` returned `undefined`, `restore()` correctly set `signed-out`, and every
layer behaved as written. No log, no toast, no state — the only instrument that existed
was a human noticing they were still logged out.

Phases B and C add *more* ways for sign-in to fail — a wrong entryway, a host gone dark,
an OAuth error from someone else's server — so shipping them without closing this makes
the same class of failure more likely, not less.

**The requirement, and it is testable:** a boot that ARRIVED as an OAuth callback and
ends signed-out is not the same state as an ordinary signed-out boot, and must not render
as one. `isOAuthCallback()` already distinguishes them at boot; nothing downstream keeps
that fact. Phase B carries the fix because it owns the session seam.

Two related defects to fold in rather than discover twice:
- `bootAuth`'s `catch` does `toast(e.message, 'err')`. An error with an empty message
  renders an **empty red toast** — `.toast.err` is `#9E2F26`, fixed bottom-right, 10px/14px
  padding, so an empty one is a small red block with no words. That matches the
  "weird red opaque bar" the owner reported on a signed-out page and which never
  reproduced hermetically. Not proven to be the same thing; named so the next person
  checks it rather than re-hunting it.
- Toast is the app's only diagnostic channel and it is *transient*. Anything worth
  debugging after the fact needs somewhere that survives a repaint.

**Debugging readiness.** The harness already has the right instrument and no phase
references it: `diagnoseLive()` in `e2e/harness/scenario.mjs` reports outstanding requests
and service-worker state when a workflow dies, and it was built after two undiagnosed
hangs. Every phase adding a workflow states that a failure there is read WITH the
diagnostic, not from the stack alone. *(Used in earnest this session: it is what showed
the service worker mid-install and the ERR_INTERNET_DISCONNECTED that turned out to be a
sleeping machine.)*

## Phases

### Phase 0: Discovery

Included because one assumption is unverified and **two later phases depend on it** — the
multiplicative-rework criterion.

- [x] **D1 — RESOLVED 2026-08-27. YES, and the screens are not subtly different.**
  Probed by driving the vendored client directly against the real network from a loopback
  build — no production code modified, no credentials, no sign-in completed.

  ```
  bsky.social,  no prompt  ->  "Authenticate | Welcome | Please authenticate to continue
                                | Create a new account | Sign in | Cancel"
  bsky.social,  create     ->  "Sign up | We're so excited to have you join us!
                                | Step 1 of 3 | Choose a username"
  blacksky.app, no prompt  ->  "Blacksky Algorithms | Welcome | ... | Create a new account"
  blacksky.app, create     ->  "Blacksky Algorithms | Sign up | ... | Step 1 of 3
                                | .myatproto.social"
  ```

  `prompt=create` lands directly in the registration wizard on BOTH open-signup hosts, and
  Blacksky's even names its handle domain. The Create / Sign in split in Phase C is honest.
  Note also that the plain screen already offers both paths, so `prompt=create` saves a step
  and states intent — it does not unlock anything otherwise unreachable.
  **Disposition honoured:** throwaway. Nothing from the probe was kept.

- [x] ~~D1 (original wording; resolved above)~~
  - **Probe:** Temporarily thread the options argument, call
    `signIn('https://bsky.social', { prompt: 'create' })` from a local build, and record
    what bsky.social renders — a create/registration screen, or the ordinary sign-in
    screen. Repeat against `blacksky.app`. Capture the authorize URL query string.
  - **Success criteria:** the authorize URL carries `prompt=create` AND the rendered
    screen differs from the plain sign-in screen. "It didn't error" is not success.
  - **Disposition:** `throwaway` — the thread-through becomes Phase B properly, TDD'd.
  - **If it fails:** the Create/Sign-in split collapses to one action per host. Phase C's
    row design and Phase D's button copy both change. Record in the Review Log and
    restructure before proceeding — this is the one phase allowed to do that.

- [x] **D2 — RESOLVED 2026-08-27. Yes to both, and focus behaviour comes free.**
  Probed by opening a Phase-C-shaped dialog in the harness **with a deliberate defect
  planted in it** (an unnamed close button) — a clean scan would have proved nothing.

  ```
  showModal open        : true   focus -> #x      (focus enters the dialog)
  axe saw INSIDE dialog : button-name #x          (axe is NOT blind to it)
  Esc closed it         : true   focus -> #trig   (focus returns to the trigger)
  total violations      : 1                       (only the planted one)
  ```

  So `<dialog>` supplies focus-entry, Esc, and focus-return without code, and the W5
  tier can scan the open sheet per skin as Phase C assumes. No restructuring needed.
  **Disposition honoured:** throwaway.

- [ ] ~~**D2: Does a native `<dialog>` + `showModal()` work under the workflow harness, and
      can `@axe-core/playwright` scan an open one?**~~
  - **Probe:** minimal page in the harness; open a `<dialog>`, assert `Esc` closes it and
    focus returns; run an axe scan with it open.
  - **Success criteria:** both observed. If axe cannot see into the dialog, the W5
    accessibility tier needs a different entry point and Phase C says so.
  - **Disposition:** `throwaway`.

**Done when:** both questions answered with observed evidence and Verified Assumptions
updated.

---

### Phase A: The masthead follows you

**Goal:** Sign-in is reachable from anywhere on the page AND hittable with a thumb.

**Pass 2 rescoped this phase.** Sticky landed upstream in `2c4b28d` while this plan was
being written, so the change I had planned is done. What is left is the half nobody has
done, and it is the more important half: **the masthead's controls are now permanently
the closest targets on every screen, and four of the five are under the 44px floor.**
"Sign in" is 44×21 — the single control this entire plan exists to make reachable.

**Changes:**
- [x] ~~`.masthead { position: sticky }`~~ — landed upstream, `2c4b28d`.
- [x] DONE `2776537` — `e2e/mobile-fit.workflow.mjs`, tap-target selector extended to chrome-region
      anchors. Its selector is
      `'button, select, input[…], .tab, a.btn, .themetoggle'`, which matches no plain
      `<a>`, while its own comment says masthead nav links measured 38×21 and that the
      prose exemption "does not reach the masthead, which is a chrome region, not prose".
      The prose and the selector disagree; the prose is right. RED first.
- [x] DONE `2776537` — `css/app.css`, masthead controls at the floor, plus the tighter gap and the
      removal of the duplicate lens nav link that together took 320px from 107px to 61px.
- [~] **DROPPED at execution, 2026-08-27 — the rationale was false.** The item said
      "in-page anchors and deep links land under the sticky bar". Forage has **no in-page
      anchors at all** (grepped `href="#`, `href: '#`, `location.hash =` — nothing), and
      ordinary navigation is unaffected because a sticky bar occupies flow space at scroll
      position 0; it only overlays once you scroll. So the stated case does not exist.
      The only programmatic scroll in the app is `scrollIntoView({ block: 'nearest' })` at
      `js/ui/views.js:264-265`, which IS occludable — but it is the memory population's
      **moderation queue**, a view no workflow in the corpus reaches. Shipping
      `scroll-margin-top` for it would be untested production code for an unexercised
      path, which is the thing this repo does not do. **Re-open when the mod queue gets
      workflow coverage**, and fix it with a RED test then.
- [ ] `plans/2026-08-26-2-plan-public-site-polish.md` § Phase 2 → pointer here.
**Call chain:** `masthead()` (`js/main.js`) → `.masthead` element → the `.who` sign-in
link. No new JS; the element already renders on every surface via `render()`.
**Wiring test:** `e2e/mobile-fit.workflow.mjs` — with the selector extended to chrome
anchors, assert every masthead control meets the floor at 320/360/390. **RED on the
merged tree** (four failures, measured). The scroll-still-visible assertion is now GREEN
by inheritance from `2c4b28d`; keep it anyway, because nothing else pins sticky and a
later layout change could silently take it away.
**Depends on:** nothing.
**Read-set:** `js/main.js`, `css/app.css`, `e2e/mobile-fit.workflow.mjs`.
**Write-set:** `css/app.css`, `e2e/mobile-fit.workflow.mjs`, `sw.js` (CACHE),
`plans/2026-08-26-2-plan-public-site-polish.md`.
**Shared-state contract:** No shared mutable state beyond the file write-set, except
`sw.js`'s `CACHE` constant, which peer sessions also bump. Runs in
`worktrees/forage/polish`; does not invoke `git checkout`/`stash`/`rebase` in the parent
worktree; binds no ports.
**Risks:**
- The dev bar sits ABOVE the masthead in the memory population. It is scaffolding and
  should scroll away, leaving the masthead stuck to the viewport top — not to the bottom
  of a bar that is gone. Verify in both populations.
- A sticky bar costs permanent vertical space on a phone, the very thing this plan is
  buying back. Measure it and assert a ceiling.
- **Raising the masthead controls to 44px will make the 320px wrap worse.** The bar is
  already 107px and two rows at 320 because `.masthead` carries `flex-wrap: wrap`;
  enlarging its children is the obvious fix for the floor and the obvious way to make a
  sticky bar eat a quarter of a small screen. These two requirements pull against each
  other and the resolution is a layout decision, not a padding tweak. See Open Questions.
- Widening the selector may surface tap failures on OTHER chrome anchors across the 16
  swept surfaces, not just the masthead. That is real signal, but it can make this phase
  much larger than "fix the masthead". Measure the blast radius before fixing, and split
  if it is wide.
- The `☾` toggle already passes at 44×44 — the upstream touch-floor block covers
  `.themetoggle` explicitly. Do not re-fix it.
**Done when:**
1. **Behavioral:** Scrolling to the bottom of the signed-out lens on a 390px viewport
   leaves the masthead and its sign-in link visible, and every masthead control meets the
   44px floor.
2. **Verification:** `npm run workflows` — `mobile-fit.workflow.mjs` passes, including the
   new scroll assertion, the masthead-height ceiling, AND new tap-target assertions over
   the masthead (which do not exist today).
**Validation:** Moderate. Wiring test + the full workflow corpus + look at it in both
populations and both skins, since a z-index error is invisible to assertions.

---

### Phase B: The seam — sign-in options and a registry of real hosts

**Goal:** The app can start sign-in at any host, in either intent.
**Changes:**
- [x] DONE — `js/auth/session.js`, `signIn(handle, options)` forwards options verbatim.
- [x] DONE — `js/auth/hosts.js`, pure registry + `validateHosts` + `canCreateAccount`.
- [x] DONE — RED first in both. Of the three seam tests, ONE was red (options dropped); the
      other two pinned behaviour that already held but nothing asserted.
- [x] DONE — `e2e/hosts-live.workflow.mjs`. Passes against all four hosts. Reports an
      unreachable host SEPARATELY from a changed one: a dark third-party server is not our
      regression and must not read as one.
- [x] DONE — SHELL entry added, `CACHE` → `forage-v41`.
- [x] DONE — `bootAuth` reads whether the boot ARRIVED as a callback (before anything
      clears it, which the Phase 0 fix is what makes possible) and says so when the
      exchange yields no session. RED in `e2e/signin.workflow.mjs`.
- [x] DONE — `toast()` substitutes a true fallback rather than rendering a wordless
      coloured block. It still SHOWS: refusing outright would swallow the signal.
**Call chain:** Phase C's sheet → `hosts.list()` → a row's action →
`lensViews` handler → `manager.signIn(entryway, { prompt })` → `client.signIn` → redirect.
In THIS phase the chain ends at `manager.signIn`; Phase C supplies the caller. That is why
B's wiring test asserts the seam, not a UI.
**Wiring test:** *(Pass 3 rewrote this — the original was a unit test on an isolated
seam, which is the exact plan defect Pass 3 names: a component that passes its own tests
while nothing calls it.)* `e2e/signin.workflow.mjs` — from a real click in the running app
on the temporary Phase-C-precursor trigger, assert the fake manager recorded
`signIn(<entryway>, { prompt })`. The unit test below stays as well; it is the fast one,
not the wiring one.

**Named behaviours, with edges** *(Pass 3: the original spec was a single happy-path
assertion that would survive a one-line mutation)*:
- options forwarded intact — `{ prompt: 'create' }` arrives as `{ prompt: 'create' }`
- **no options at all** — `signIn(host)` must still work, and must NOT send `prompt`
- an unknown/unregistered host id fails loudly by name (`hrefFor` precedent)
- an open-signup host exposes a create action; an invite-only host exposes the WORDS
  and no create action — both directions asserted, not just the open one
- a rejected `client.signIn` leaves state `signed-out`, not `pending` (the existing
  catch does this; nothing pins it)
**Depends on:** Phase 0 D1 (if `prompt=create` does not work, the registry's posture field
and the whole create/sign-in split change shape).
**Read-set:** `js/auth/session.js`, `vendor/atproto-oauth-client-browser.js`, `sw.js`,
`test/auth-session.test.js`.
**Write-set:** `js/auth/session.js`, `js/auth/hosts.js`, `test/auth-session.test.js`,
`test/hosts.test.js`, `e2e/hosts-live.workflow.mjs`, `sw.js`.
**Shared-state contract:** The LIVE workflow makes real network requests to four
third-party hosts — it is `live = true` and therefore never runs in push CI. It reads no
credentials and writes nothing. Otherwise no shared mutable state beyond the write-set
plus `sw.js`'s `CACHE`.
**Risks:**
- **The registry must NOT live in `js/ui/lens-views.js`.** That module cannot be imported
  outside a browser, which is exactly why `curated-names-live.workflow.mjs` has to scrape
  source text. Repeating that mistake in the same session would be inexcusable.
- Invite-only hosts advertise `create` but will demand a code. The registry stores posture
  so the UI can say so; it does not suppress the capability.
- A third-party host going dark makes the LIVE check fail for a reason that is not our
  regression. The failure message must distinguish "host unreachable" from "posture
  changed".
**Done when:**
1. **Behavioral:** `manager.signIn(host, { prompt: 'create' })` reaches the vendored client
   with its options, and the registry names four hosts with verified postures.
2. **Verification:** `npm test` (unit tiers green) and
   `LIVE=1 npm run workflows` (hosts-live passes) — plus a bite test: flip one posture,
   confirm it FAILS, restore, confirm the file is byte-identical.
**Validation:** Broad — it touches an external API surface across four third-party hosts.
Tests plus the live check plus reading the actual authorize URL produced.

---

### Phase C: The sheet

**Goal:** A visitor can choose a server and an intent, and understands why they are being
asked.
**Changes:**
- [ ] `js/ui/lens-views.js` — the `<dialog>`, its rows, and the trigger seam.
- [ ] `css/app.css` — sheet styling; bottom sheet under ~700px, centred dialog above.
- [ ] `e2e/auth-sheet.workflow.mjs` (NEW) — the journey.
- [ ] `e2e/a11y-skins.workflow.mjs` — scan with the sheet OPEN.
- [ ] `README.md:363`, `AGENTS.md` § Identity + § Surfaces — multi-host wording.
- [ ] `sw.js` — bump `CACHE`.
**Settled with the owner (2026-08-26):** open-signup hosts get `[Create account] [Sign in]`;
invite-only hosts get the words *invite only* **in the create slot** with Sign in beside
them, so the column stays aligned and the words explain the missing button; the list is
capped with the remainder behind **Another server**; never rendered signed in.
**Call chain:** hero button (Phase D) or masthead → `openAuthSheet()` →
`<dialog>.showModal()` → row click → `manager.signIn(entryway, { prompt })`. In this phase
the trigger is a temporary control on the signed-out home so the chain is live before D
exists — **the sheet must not ship unreachable.**
**Wiring test:** `e2e/auth-sheet.workflow.mjs` — from the signed-out lens home, activate
the trigger, assert the dialog opens, click Bluesky's *Create account*, and assert the fake
manager recorded `signIn('https://bsky.social', { prompt: 'create' })`. End to end from a
real click, not a direct call to the opener.
**Depends on:** Phase B (the seam), Phase 0 D1 and D2.
**Read-set:** `js/auth/hosts.js`, `js/auth/session.js`, `js/ui/lens-views.js`,
`css/app.css`, `e2e/harness/*`.
**Write-set:** `js/ui/lens-views.js`, `css/app.css`, `e2e/auth-sheet.workflow.mjs`,
`e2e/a11y-skins.workflow.mjs`, `README.md`, `AGENTS.md`, `sw.js`.
**Shared-state contract:** *(Pass 3: rewritten as invariants, not mechanisms.)* Writes
only under the file write-set plus `sw.js`'s `CACHE`. Does not invoke `git checkout`,
`git stash`, or `git rebase` in the parent worktree. Binds no ports. Reaches no host
outside the shim's fenced list — asserted, not assumed, by `s.shimMisses()` being empty.
**Risks:**
- A11y is load-bearing here and it is the class of thing token tests cannot see. Needs
  `aria-labelledby`, focus return to the trigger, an accessible name on the close control,
  and an axe scan **with the dialog open, per skin** — a modal is a new
  foreground/background pairing on every skin.
- On a 390px viewport the sheet nearly fills the screen at four hosts. The cap is not
  cosmetic; assert the row count.
- `<dialog>` + skins: the browser's default backdrop is not a token. Ensure the scrim and
  the sheet ground both come from tokens or the sheet will be wrong on some skin.
**Done when:**
1. **Behavioral:** From the signed-out lens home, a visitor can open the sheet, see four
   hosts with honest postures, and be redirected to a chosen host in a chosen intent.
2. **Verification:** `npm run workflows` — `auth-sheet.workflow.mjs` and
   `a11y-skins.workflow.mjs` both pass, the latter scanning an open sheet on every skin.
**Validation:** Moderate-to-broad. Tests, plus opening it on all four skins at both
breakpoints, plus one real redirect against a throwaway account — never the owner's.

---

### Phase D: The hero

**Goal:** The emblem is seen, and the sheet has a front door.
**Changes:**
- [ ] `js/ui/lens-views.js` — hero on the signed-out lens **home only**.
- [ ] `js/hero.js` (NEW) — pure dismissal state, device-local.
- [ ] `test/hero.test.js` (NEW), `e2e/feed-naming.workflow.mjs` or a new journey.
- [ ] `css/app.css` — hero layout; stacks under ~560px.
- [ ] `sw.js` — SHELL + `CACHE`.
**Owner decisions:** expanded by default; **dismissal never expires**; **on desktop too**
(branding, not only funnel); close is a ✕ in the corner, not a button competing with the
primary action; home only.
**Call chain:** `render()` → `lensHome()` → `heroCard()` → its button →
`openAuthSheet()` (Phase C). Replaces C's temporary trigger.
**Wiring test:** the journey — hero visible signed out on `/`, its button opens the sheet,
dismiss, reload, still gone; absent on `/f/...` and `/p?uri=`; absent signed in.
**Depends on:** Phase A (sticky masthead is what makes permanent dismissal safe), Phase C.
**Read-set:** `js/ui/lens-views.js`, `js/hero.js`, `css/app.css`, `assets/`.
**Write-set:** `js/ui/lens-views.js`, `js/hero.js`, `test/hero.test.js`, `css/app.css`,
`e2e/*`, `sw.js`.
**Shared-state contract:** Writes one `localStorage` key. **Never `forage.state`** —
`test/store-modes.test.js` asserts the Bluesky population writes nothing there, and this
is the lens. No other shared mutable state beyond the write-set and `CACHE`.
**Risks:**
- Unreadable storage must mean SHOWN — fail open, per the `getSkin()` precedent. A hero
  that vanishes because storage threw is worse than one shown twice.
- **Measured cost:** in the mock the hero runs to ~y=370 of an 844px viewport — about 44%
  of the first screen. That is the direct consequence of "prominent branding" and needs an
  explicit look before it ships. See Open Questions.
- Permanent dismissal + a bug that dismisses accidentally = a front door nobody can get
  back. The dismiss control must be unambiguous and nowhere near the primary action.
**Done when:**
1. **Behavioral:** A signed-out visitor on `/` sees the emblem and can reach the sheet from
   it; dismissing it survives reload; it never appears signed in or off the home route.
2. **Verification:** `npm test` (dismissal unit tier) and `npm run workflows` (the journey,
   plus the mobile-fit assertion that the first board card is still reachable).
**Validation:** Moderate. Tests plus looking at it on all four skins at 390 and 1280.

---

### Phase E: The emblem asset

**Goal:** The front door does not cost 216 KB above the fold.
**Changes:**
- [ ] `assets/` — correctly-sized sources; `<picture>`/`srcset` in the hero.
- [ ] a byte-ceiling assertion.
- [ ] `sw.js` — SHELL + `CACHE`.
**Call chain:** `heroCard()` → `<picture>` → the sized source the viewport selects.
**Wiring test:** a workflow assertion that at 390px the *selected* source is the small one
— not merely that a small file exists on disk. Testing the file's existence would pass
while the phone still downloads the 216 KB original.
**Depends on:** Phase D.
**Read-set:** `js/ui/lens-views.js`, `assets/`, `sw.js`.
**Write-set:** `assets/*`, `js/ui/lens-views.js`, `css/app.css`, `sw.js`, `e2e/*`.
**Shared-state contract:** No shared mutable state beyond the write-set and `CACHE`.
**Risks:** SHELL caches assets by exact URL; a `srcset` that names files not in SHELL
means the hero is the one thing that does not work offline.
**The experiment, stated as one:** a transparent-background variant so the card's ground
shows through. It is NOT a themeable emblem — see Reasoning.
**Retire-by:** if the transparent variant does not look better than the paper plaque on at
least three of the four skins, keep the plaque and close the question. No lingering
someday-SVG.
**Done when:**
1. **Behavioral:** A 390px viewport downloads a source sized for it, and the hero still
   works offline.
2. **Verification:** `npm run workflows` — the selected-source assertion and the byte
   ceiling; `npm test` — SHELL resolves (`1G`).
**Validation:** Narrow-to-moderate. Tests plus a look on all four skins.

## Open Questions

- `[RECOMMENDED: PHASE-GATED — Phase D]` The hero occupies ~44% of a 390px first screen at
  the mocked size. Ship at that prominence, or cap the emblem around 200px tall?
  *Rationale: the owner explicitly asked for prominence, so this is not a defect — but the
  measurement was taken after that decision, and it should be re-confirmed with the sticky
  masthead in place, which changes how much the hero has to carry.*
- `[RECOMMENDED: PHASE-GATED — Phase C]` Which hosts, and how many, in the capped list?
  Currently four (2 open, 2 invite-only). *Rationale: more is more welcoming and more
  scrolling; the cap is settled, the membership is not.*
- `[RECOMMENDED: ADVISORY]` Should the masthead also open the sheet, or keep going to the
  sidebar card? *Rationale: once the masthead is sticky it is the primary path, so it
  arguably deserves the richer affordance — but that is a Phase C+ refinement.*
- `[RECOMMENDED: BLOCKING]` Phase 0 D1 must pass before Phases C and D are executed as
  written. *Rationale: the create/sign-in split is the spine of the sheet's design.*

**Added Pass 2:**
- ~~`[RECOMMENDED: BLOCKING for Phase A]` At 320px the sticky masthead is already 107px…~~
  **RESOLVED 2026-08-27 by measuring the candidates rather than arguing them.** The
  conflict was real but had a third answer: the lens masthead's `nav` held ONE link —
  "Home", `href='/'` — which is the wordmark's href beside it. Removing the duplicate,
  applying the floor, and tightening the gap at touch widths gives **61px at 320, down
  from 107px today, with every control at 44px**. Better than the status quo on both
  axes rather than a trade. Measured at 320px:

  ```
  today (4 controls under floor)            107px   14% of fold
  floor + keep wrap                         121px   16%   compliant but WORSE
  floor + nowrap, nav scrolls                61px    8%   "Home" scrolled OFF-SCREEN
  floor + drop duplicate + tighter gap       61px    9%   <- shipped
  ```

  Two things only looking caught: the nowrap candidate passed every number while
  clipping "Home" to "H" and wrapping "Settings" to "Settin gs"; and the first applied
  fix measured 121px — compliant, and worse than the bar it replaced, which no gate
  can distinguish. ~~Options:~~
  let it wrap and pay the height; drop `flex-wrap` and let items shrink or scroll; or
  collapse the nav behind a single 44×44 control at touch widths. *Rationale: this is a
  layout decision with a visible cost either way, and it gates the phase — there is no
  version of "meet the floor" that does not touch it.*

## Review Log

### Pass 1: Reasoning and Plan Development — 2026-08-26
**Produced:** Problem statement from measured geometry; five phases plus a discovery
phase; Verified Assumptions from live probes of four atproto hosts and the vendored
client; Documentation Impact from a grep of `README.md`, `AGENTS.md`, `docs/`,
`.github/`; a sequential Concurrency Map with the collision reasons named.
**Notable:** An earlier informal draft of this plan skipped the template entirely — no
Verified Assumptions, no Documentation Impact, no Concurrency Map, and no per-phase
Call chain / Wiring test / Read-set / Write-set. Rewriting to the template surfaced
**Phase 0 D1**: `prompt=create` is *advertised* by all four hosts but has never been
observed working through our vendored client, and Phases C and D both depend on it. That
is the multiplicative-rework criterion, and the informal draft had it as a settled fact.
**Open:** four questions, one BLOCKING (D1), two PHASE-GATED, one ADVISORY.

### Amendment (post-Pass-1, pre-Pass-2) — 2026-08-26
**Found:** A deployed-site survey by a third session (uncommitted in the shared `forage/`
checkout, no identified author) measured the masthead's tap targets at 38×21 and 53×21
against a 44px floor. Phase A's risk list had this as a thing to *watch*; it is in fact
already failing, which changes Phase A's scope.
**Changed:** Fixing the masthead tap targets moved INTO Phase A — sticky alone would
promote a latent failure into the most-touched control on every screen. Phase A's
"Done when" now requires tap-target assertions that do not exist in
`e2e/mobile-fit.workflow.mjs` today. Two rows added to Verified Assumptions, one of them
carrying a provenance warning so the measurement survives if the source file is swept.
**Confirmed:** I re-read `e2e/a11y-skins.workflow.mjs:36,44,82` myself rather than trust
the survey's summary; its account of the scanned surfaces and the tag filter is exact.

### Pass 2: Gap Analysis — 2026-08-26 (inline, at the owner's direction)
**Found:**
- **Phase A's central change had already landed upstream** (`2c4b28d`, merged into this
  branch) while the plan was being written. `.masthead` is `position: sticky; top: 0;
  z-index: 40`. A plan whose first phase was already done is exactly the staleness Pass 2
  reads the codebase to catch.
- **The freshly-landed tap-target gate documents coverage it does not have.**
  `e2e/mobile-fit.workflow.mjs:33` selects
  `'button, select, input[…], .tab, a.btn, .themetoggle'` — no plain `<a>` — while the
  comment eight lines above records masthead nav links at 38×21 and states that the
  prose exemption "does not reach the masthead, which is a chrome region, not prose".
  Verified by running the gate's own selector string through `el.matches()` against every
  masthead control: four failures, zero matched.
- **The failing control is the one this plan is about.** "Sign in" measures 44×21.
- **A conflict between two of this plan's own requirements**, not visible in Pass 1:
  meeting the touch floor makes the masthead taller, and the masthead at 320px is already
  107px and two rows. Raised as a BLOCKING open question rather than resolved here.
- No `scroll-margin-top` exists, so the deep-link-under-the-sticky-bar risk is live now,
  not hypothetical — sticky landed without it.
**Concurrency:**
- No changes — map confirmed. Phase A's write-set gained `e2e/mobile-fit.workflow.mjs`,
  which no other phase writes, so nothing moves. All phases remain sequential; the
  `sw.js` CACHE collision reason strengthened rather than weakened (main moved twice
  during this session, and a peer and I both held `v39` on unlanded branches — the merge
  was CLEAN because we had written the identical line, which is precisely the silent
  collision the sequential map exists to prevent).
**Changed:**
- Phase A rescoped: sticky struck as done; gate-selector extension added as the RED step;
  tap-target fix and `scroll-margin-top` added; wiring test rewritten to assert the floor
  rather than stickiness, while KEEPING the scroll assertion since nothing else pins it.
- Four rows added to Verified Assumptions, one row marked SUPERSEDED rather than deleted.
- Two risks replaced with the two real ones (the wrap conflict; the selector's blast
  radius). One risk removed as obsolete — "the gate does not exist" is no longer true.
- One BLOCKING open question added.
**Confirmed:**
- Phases B–E unaffected: `js/auth/hosts.js` still does not exist, the memory-population
  hero in `boardView()` is untouched, the emblem asset is unchanged, and the shaper work
  in Phase B remains unstarted.
- The Documentation Impact inventory still holds; nothing upstream changed `README.md:363`.
- Phase 0's D1 remains BLOCKING and unaddressed. Nothing in this pass touched it.

### Execution: D1 and the masthead question — 2026-08-27
**D1 resolved:** `prompt=create` verified end to end against both open-signup hosts by
driving the vendored client directly. Phases C and D unblocked. Evidence in Phase 0.

**Phase A, tap-target half, shipped:**
- The gate's selector now reaches `.masthead a` — the chrome region its own comment
  already named while matching no plain `<a>`. RED produced exactly four failures, all
  masthead, **nothing else across either population's swept surfaces** — which answers
  the Pass 2 blast-radius risk: it does not cascade.
- The lens masthead's redundant `nav` link removed (`js/main.js`). The memory
  masthead's nav is NOT redundant — Home/Popular/All are three real destinations — and
  keeps them; it passes the widened gate unchanged.
- Touch floor + tighter gap at ≤480px (`css/app.css`), with `white-space: nowrap` and
  `flex: none` load-bearing against label collapse, and wrap deliberately left ON as a
  safety valve.

**A process note worth keeping.** Two runs appeared to hang and I killed both, then went
looking for leaked browsers. Neither was hung: the machine slept for ~9 hours mid-run.
The evidence was in the output all along — `mode-roundtrip` reported 32,272,247ms, which
is 8.96 hours, and `ERR_INTERNET_DISCONNECTED` is what a sleeping machine's network looks
like. A wall-clock reading that absurd is a fact about the HOST, not a flake, and it was
faster to check `uptime` than to hunt a cause. Nothing was wrong with the change.

**Still open in Phase A:** `scroll-margin-top` (grep still confirms none exists), and the
pointer edit to `2026-08-26-2-plan-public-site-polish.md` § Phase 2.

### Pass 3: Quality Gates — 2026-08-27 (inline)
**Resolved during the pass, not deferred:** D2. Pass 3 requires that a discovery task
answerable during planning be answered then, and D2 was a twenty-minute probe sitting in
Phase 0. Native `<dialog>` supplies focus-entry, Esc and focus-return without code, and
axe scans an OPEN one — proved by planting an unnamed button inside it, because a clean
scan would have proved nothing. Phase C's a11y tier stands unchanged.

**Gate 1 — TDD ordering. Two defects, both fixed in the plan:**
- **Phase B had no wiring test.** Its verification was a unit test on the `signIn` seam,
  and the plan said so out loud: "the chain ends at `manager.signIn`; Phase C supplies
  the caller." That is precisely the defect Pass 3 names — a component that passes its
  own tests while nothing calls it. Rewritten to assert from a real click in the running
  app, with the unit test kept as the fast one rather than the wiring one.
- **Single-point assertions on branching code.** The spec was "options arrive intact",
  which survives a one-line mutation by construction. Replaced with named edges: no
  options at all (and no `prompt` sent), unknown host fails by name, open vs invite-only
  asserted in BOTH directions, a rejected `signIn` leaving `signed-out` not `pending`.

**Gate 2 — observability. The plan had nothing, and that was conspicuous:** the defect
this plan grew out of was SILENT. Sign-in redirected, returned, and reported nothing;
every layer behaved as written. Phases B and C add more ways for sign-in to fail, so
shipping them without closing this makes the class more likely, not less. Added as a
cross-cutting section with a testable requirement — a callback boot that ends signed-out
is not an ordinary signed-out boot and must not render as one — plus the empty-`toast()`
defect, which is the best candidate for the owner's unreproduced "red bar" and is named
so the next person checks it instead of re-hunting it.

**Gate 3 — debugging readiness.** Zero references to `diagnoseLive()`, the harness's own
instrument, built after two undiagnosed hangs. Now required reading for any workflow
failure in this plan. Earned its place this session: it is what showed the
service-worker-mid-install and ERR_INTERNET_DISCONNECTED that turned out to be a
sleeping machine, not a flake.

**Gate 5b — concurrency honesty.** Phase C's shared-state contract was a mechanism
("shim-backed and hermetic"). Rewritten as invariants: writes only within the write-set,
invokes no `git checkout`/`stash`/`rebase` in the parent worktree, binds no ports,
reaches no unfenced host — the last one *asserted* by `s.shimMisses()` being empty rather
than assumed.

**Gate 4 — flagged, NOT resolved: three open questions carry severities I set and the
owner has never confirmed** (hero prominence, host list membership, masthead-opens-sheet).
Pass 3 says an agent-set severity the user has not reviewed is a defect. They are listed
for confirmation and this plan should not execute Phases C or D until they are.

**Confirmed:** every phase declares a validation strategy and they are calibrated to
scope (Phase B "Broad" for four third-party hosts; Phase E "Narrow-to-moderate"). The
Concurrency Map accounts for every phase. Both Phase 0 dispositions are declared and
both were honoured — nothing from either probe was kept.

### Execution: Phase A remainder and Phase B — 2026-08-27
**Phase A closed.** Its `scroll-margin-top` item was DROPPED, not done: the rationale was
false. Forage has no in-page anchors at all, and a sticky bar does not occlude at scroll
position 0 because it occupies flow space. The only programmatic scroll is the memory
population's moderation queue, which no workflow reaches — so shipping the CSS would have
been untested production code for an unexercised path. Re-open with the mod queue's
coverage.

**Phase B shipped**, and the seam is LIVE rather than waiting for Phase C: the masthead's
"Sign in" now resolves its entryway through `hostById('bsky')`, so `js/auth/hosts.js` is
reachable from the entry point today. That was Pass 3's wiring-test finding applied at
execution — a registry no running code imports is exactly the dead component the field
exists to prevent.

**Honest note on the RED steps:** of the three seam tests written, only ONE failed. The
other two — an options-less `signIn` not inventing a prompt, and a rejected `signIn`
leaving `signed-out` rather than `pending` — described behaviour that already held with
nothing pinning it. Written as RED, discovered green. Worth keeping and worth saying
plainly rather than presenting three passing tests as three fixes.

**Gate:** 470 unit / 88 conformance / 11 workflows, 0 failures. Both live-only checks
skip-reported.
