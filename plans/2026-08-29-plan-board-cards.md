# Plan: board cards — the guest like, share, the toolbar, the media stage, the column, the pinned bar

**Status:** Pass 1 written straight to the phase-plan template 2026-08-29; **Pass 2 (gap analysis)
applied the same day** — every file:line below was read in the `board-cards` worktree at
`411c40f`. **Pass 3 (quality gates) applied the same day.** Open-question severities O1–O5
**confirmed as recommended by the owner 2026-08-29** ("accept all"). **Executing 2026-08-29** on `claude/board-cards-a`. Phase 0: D1 deferred to 5b (no device/adb attached); D2 answered (no `embed.video#view` in any fixture).
**Progress tracker:** this Status line. At every phase end append `last green: <phase> @ <sha>`.
**Origin:** the owner's review of forage.fyi after the post-and-thread landings (2026-08-29),
with Reddit's front page as the reference; worked through four revisions of
`plans/mocks/board-cards.html` and **eight decisions locked on v5**. The mock is the picture;
this is the why and the order. Where they disagree, the mock wins on what it looks like and
this plan on what is built first.
**Branch:** `claude/board-cards` (mock + this doc); execution in three landing branches
(A–C, § Phases), one `CHANGELOG.md` entry each.

---

## Problem Statement

The live board (`https://forage.fyi/f/whats-hot`, 2026-08-29) reads as clunky and half empty
beside Reddit, and one of its controls lies. Measured against the tree at `411c40f`:

- **A guest's ▲ looks pressable and does nothing.** `vote()` returns a read-only `span` for a
  reader who cannot vote (`js/ui/components.js:58-61`) — the 2026-08-27 rule that the count
  is a fact — but it wears the same bordered pill as the live button (`.vote`, `css/app.css`),
  so the touch is ignored without a word.
- **No share on posts.** Decision 10 of post-and-thread put `shareButton` on comments only
  (`components.js:282`); a post row's `.foot` (`:275`) is the vote pill and `.postmeta`.
- **Two toolbar dressings.** The sort bar's selects are `.pillsel` (`js/ui/sortbar.js`); the
  density dial is a bare `<select>` (`js/board-density.js:54-63`); the lens toolbar puts them
  in one row with a range slider (`js/ui/lens-views.js:510-545`).
- **Cards are half empty.** `.media-strip img` is capped at `--media-max`, default **220px
  tall** (`css/app.css:481-483`, `js/media-scale.js:13`), laid out inline-start in a card the
  width of the 1100px shell (`css/app.css:121`). A portrait picture at 220px is ~120px wide
  beside 900px of card.
- **The masthead scrolls away.** `.masthead` is `position: sticky` (`css/app.css:83`) but is
  rendered inside `<div id="masthost">` (`js/main.js:23,251`), a wrapper exactly its own
  height — sticky pins within the parent, so the rule never holds. The dev bar (`:57`) has no
  wrapper and pins.
- **The shell is Reddit's shape without Reddit's reason:** three columns at 1100px, the
  sidebar drawn as loud as the posts; Reddit's rail is advertising, ours has nothing that
  earns the weight.
- **A guest's ⋯ menu says nothing about signing in:** Copy text · Copy link · Open on
  bsky.app (`lens-views.js:1181`), and the rest is simply absent.

## Reasoning — the eight decisions, and why each

Numbered as on mock v5. Each is decided; the alternative is recorded.

1. **The guest's like pill is a door.** Same pill, dashed, a person glyph before the count,
   accessible name "1,540 likes — sign in to like", tooltip on hover/focus; tapping opens the
   sign-in sheet (lens) or the existing gate toast (memory). *Why:* the count must stay
   legible (it is how a busy thread is told from a quiet one) and the control must do
   something when touched — a tooltip alone does not survive a phone. *Not taken:* plain
   text, nothing to tap.
2. **Share on every post.** The same ↗ comments have, last on the action row, 60% at rest, no
   session needed. The action row becomes like · replies · reposts · share (Reddit's row);
   the board link moves under it. *Not taken:* Copy link in the ⋯ only.
3. **One toolbar dressing.** `densityDial` takes `.pillsel`; Sort · From · Card/Compact ·
   Size in one row; the range slider is retired (decision 7). *Not taken:* drop the dial on
   the lens.
4. **The media stage.** A card-wide frame, height capped by the card size, the picture
   centred and contain-fit, a blurred darkened copy of itself behind (black bands for
   video). Portrait, landscape, widescreen and a screenshot fill the same rectangle. The
   stage sizes itself from the embed's `aspectRatio` before the picture loads. *Why:* one
   rule for every shape is what makes a feed read as consistent; the empty card was a sizing
   rule, not a layout choice. *Not taken:* raise the inline cap to 480px.
5. **Pictures shown at once: 1 · 2 · 3 · 4** (Advanced, default 1). ≤ N pictures → Bluesky's
   own grid (2 side by side · 3 = one tall + two · 4 = 2×2); more → a carousel with dots, edge
   arrows, swipe, arrow keys, an `aria-live` "picture 2 of 4". Bluesky caps a post at four, so
   4 = never a carousel — the "off" without a second switch. *Not taken:* carousel always.
6. **The column and the rail.** 200 / 680 / 300: a slim nav, a 680px content column, a right
   rail that is **optional, on by default, a step quieter** (muted surfaces, smaller type) —
   a sign-in card for a guest, feeds you might like, trending tags; nothing sold. Off
   (Advanced → Side panel) the column stays 680 and centres. *Why:* content first; Reddit's
   ratio is advertising's. *Not taken:* one column (mock v2); rail always on (v3); keep the
   1100 shell.
7. **Card size 1 · 2 · 3 · 4** (default 4 = as drawn). Scales the stage cap (220 → 520px
   desktop, 180 → 420 phone), card padding and title size — the whole card, so the reader
   chooses how much real estate a post takes. Replaces the drag slider, which on a phone moved
   in visible jumps and felt broken; four notches make every position a real state. The same
   control on the toolbar (`Size · 4`) and in Advanced.
8. **Sign in from the ⋯ menu when signed out.** A last group with one item, *Sign in to like,
   save and reply*, opening the sign-in sheet — on every post and comment, both tiers.
9. **The masthead is pinned** (the `#masthost` wrapper takes the sticky; the dev bar is
   unpinned — scaffolding should not spend viewport). Folded into decision 6 on the mock.

**Why the phases are small and the landings grouped:** the 4-file rule; `components.js`,
`lens-views.js` and `app.css` are in most write-sets; the suites that pin today's shapes
(`guest-surface` for the guest pill, `bluesky-view:591-610` for the slider and `:647-675` for
`.media-strip img`, `density` for the dial, `mobile-fit` for the masthead) are rewritten
RED-first in their own phases. Three landing branches: **A quick wins** (pinned bar, toolbar,
guest door, share), **B the stage** (aspect shaping, the stage, card size, carousel + grid),
**C the column and the rail**.

## Verified Assumptions

Read in the worktree at `411c40f` (Pass 2). Anything not here is Phase 0 or an Open Question.

- `vote()` read-only branch: `components.js:58-61` — `span[data-vote][data-readonly][role=img]`
  with `aria-label` = `plural(likes,'like')`. `guest-surface:69-70,94` pins `button[data-vote]`
  = 0 for a guest and reads the count from `[data-vote][data-readonly] .n`. Decision 1 makes
  the guest control a **button** again → both assertions change (RED first).
- `postRow`'s foot: `components.js:275` — `vote(...)` + `.postmeta`. `shareButton(url, what)`
  at `:282` takes the label noun. `mobile-fit` exempts `.postmeta` as prose — the new action
  row must not be inside it.
- Lens guest menu: `lens-views.js:1181` `if (!session) return [first];`. Memory guest:
  `memoryMenuGroups` (`components.js:152-159`) adds Save only when `perms.loggedIn`.
  `openAuthSheet()` is exported (`lens-views.js:242`) and already the CTA target (`:229,:759`);
  memory's gate is `toast('Log in to vote.', 'err')` in `actions.setVote`.
- Toolbar: `densityDial(el, onPicked)` (`board-density.js:54-63`, `DENSITIES` `:18`, key
  `forage.boardview` `:17`); `boardToolbar` (`lens-views.js:510-545`) draws bar · viewSel ·
  slider under `[data-board-toolbar]`; `density.workflow` reads `#main select[data-density]`;
  `bluesky-view:591-610` drives `[data-media-scale]` and measures `.media-strip img` height.
- Media: `mediaNode` (`lens-views.js:456`) draws `.media-strip` of `<a><img></a>`; the lens
  shapes `media.items[] = {thumb, full, alt}` (`lens.js:233`) and `video = {thumb}` (`:235`)
  — **no aspect ratio**, though the embed view carries `aspectRatio {width,height}`
  (`test/fixtures/atproto/bookmarks.json:64,104`, `wide-getFeed.json:36`). Video views carry
  `aspectRatio` optionally (lexicon `app.bsky.embed.video#view`) — Phase 0 D2 checks a
  fixture. `media-scale.js` is `forage.mediascale`, 80–640, default 220, `cssValue()` →
  `--media-max`; `sw.js:14` precaches it.
- Shell: `.shell` 1100px grid (`app.css:121`), `.shell.with-nav` `210px minmax(0,1fr)` (`:647`),
  one column under 860px (`:126`); `.side .card` uses `--panel` (`:125`). `lensSidebar`
  (`lens-views.js:674`) draws Feeds (CURATED for a guest, `:374`) and `sessionCard` (`:709`)
  is the guest sign-in card; `trendingRail()` exists (`:928`). The rail's three cards already
  exist as pieces.
- Masthead: `main.js:23` `mastHost = el('div', { id: 'masthost' })`, appended at `:33`, filled
  at `:251`; `.masthead` sticky at `app.css:83`, `.devbar` sticky at `:57`. `mobile-fit`
  measures the masthead's controls (`:22-34`) but not its position after a scroll.
- Settings rows: `settingsView` uses `.field-row` (`views.js:583-585`); the haptics switch
  (`#pref-haptics`, `.switch`) is the precedent for a `role=switch`; a 1–4 notch row needs a
  new control (`.notches`, radio group) — `mobile-fit` measures `input[type=radio]`, so
  notches are 44px buttons in a `role=radiogroup`.
- `test/css-classes.test.js` forces every new class literal in `js/ui/` to land with its
  rule; `test/skins.test.js:574-576` forbids hardcoded radii (use `--radius-*`).
- `a11y-skins` scans one skin across the routes it lists (`:179`); a new stage adds no route.

## Documentation Impact

- `CHANGELOG.md` — one entry per landing (A, B, C). Written on the branch before it lands.
- `plans/mocks/board-cards.html` — `mock-baseline` bump + snaps re-capture at each landing
  (MOCKS.md rules 1–3); the decisions table gets "landed <sha>" per row.
- `README.md:353` ("a slider for how big previews are") — Phase 5c (card size replaces it).
- `AGENTS.md` — no module map (grepped 2026-08-29, post-and-thread); new files
  (`js/ui/stage.js`, `e2e/media-stage.workflow.mjs`) need no row; `sw.js` SHELL does.
- `css/app.css:481` comment ("3t: --media-max is the slider's one output") — Phase 5c.
- Grepped `media-max`, `mediascale`, `data-media-scale`: `css/app.css:481-483`,
  `js/media-scale.js`, `lens-views.js` (toolbar + `applyMediaScale`), `bluesky-view:591-610`,
  `sw.js:14` — all scheduled in 5c; nothing else.

## Concurrency Map

**All phases sequential**, three landing branches A → B → C, one worktree at a time. Reason:
`components.js`, `lens-views.js` and `app.css` sit in the write-set of nine of eleven phases;
the only disjoint pair is 1 (masthead: `main.js`, `app.css`, `mobile-fit`) ↔ 5a (lens shaping:
`lens.js`, `lens.test.js`) and both are minutes of work. No phase binds a port; the only
ambient state is localStorage inside a Playwright context the harness discards. **No live
account is touched by any phase** — every write here is device-local (`forage.cardsize`,
`forage.pictures`, `forage.rail`). *(Pass 3)* Map confirmed after the additions; no shared
external state, so no contract to write; the one disjoint pair (1 ↔ 5a) stays sequential.

## Phases

Every phase: RED-first (a failing wiring test before production code), `npm test` green at its
end, and the named workflow green at its end unless the phase is a suite rewrite (3a, 4a, 5c-i),
which ends RED by design. `node e2e/run.mjs <name>` is shorthand for
`node --input-type=module -e "await (await import('./e2e/<name>.workflow.mjs')).run()"`; the
landing gates are `npm test` and `npm run workflows` in full, **gated on the runner's exit
code** (post-and-thread's D-landing lesson). Observability convention as in post-and-thread
(`forage:`-prefixed console lines; `toast()`; `__shimHits`/`__shimMisses`).

### Phase 0: Discovery — landing branch A

- [ ] **D1 (DEFERRED 2026-08-29 — no device attached; re-run at 5b's validation): Does the blurred backdrop cost a phone anything?** Ten stages with
  `filter: blur(22px)` on a mid-range Android.
  - **Probe:** a one-page `scripts/probe-stage.html` with ten cards, opened over the LAN on
    the Samsung; scroll; read the frame timeline in DevTools remote.
  - **Success:** no dropped frames at 60Hz while scrolling. If it drops: the fallback is a
    flat darkened band (`prefers-reduced-transparency` also selects it).
  - **Disposition:** `throwaway`. **Needs the device** — deferred to Phase 5b's validation
    if none is attached, as post-and-thread D4 was.
- [x] **D2 (answered 2026-08-29: NO fixture carries `embed.video#view` at all — `grep -ln` over `test/fixtures/atproto/*.json` is empty; 5a's unit test carries an inline video embed, and a video stage sizes from the thumbnail on load): Do video views in the fixtures carry `aspectRatio`?** `grep aspectRatio` over
  `test/fixtures/atproto/*.json` for `embed.video#view`; if absent, a video stage sizes
  from the thumbnail's natural size on load.
  - **Disposition:** `keep-as-fixture` (whatever fixture answers it drives 5a's unit test).
- [x] **D3: Do image embeds carry `aspectRatio`?** Yes — `bookmarks.json:64,104`,
  `wide-getFeed.json:36`. Resolved in Pass 2.

**Done when:** D2 answered in Verified Assumptions; D1 answered or explicitly deferred.

---

### Landing branch A — quick wins

#### Phase 1: the masthead pins (decision 9) — ✅ shipped 2026-08-29
**Changes:** `css/app.css` — `#masthost { display: contents }` (the wrapper was the masthead's own height, so the sticky range was zero; `main.js` untouched);
`css/app.css` — `.devbar` loses `position: sticky`; `e2e/mobile-fit.workflow.mjs` — after
`window.scrollBy(0, 600)` on a seeded board, `.masthead.getBoundingClientRect().top === 0`
at 320/360/390 and 1280 (RED first).
**Wiring test:** `mobile-fit`. **Write-set:** 3 files. **Edges:** top is 0 at every width, not
only the phone ones; the dev bar's top is *not* 0 after the scroll (memory mode).
**Observability:** *(Pass 3)* none needed — a sticky rule either holds or does not, and the
suite is the instrument.
**Done when:** the bar stays put on the live site's shape; `mobile-fit` green.
**Validation:** Narrow, plus one look at 320 wide that the bar still holds one row (E144).
**Checkpoint:** *(Pass 3)* the first commit of branch A; `mobile-fit` is the whole gate.

#### Phase 2: one toolbar dressing (decision 3)
**Changes:** `js/board-density.js` — `densityDial` gets `class: 'pillsel'` and its label
"Card" / "Compact" reads as `Card` only (the axis is obvious from the options);
`js/ui/lens-views.js` — `boardToolbar` row order bar · viewSel; `js/ui/views.js` — board row
already bar + dial. `e2e/density.workflow.mjs` — asserts the dial carries `.pillsel` and sits
in `.sortbar`'s row (RED first).
**Write-set:** 4 → **2a** `density` suite (RED); **2b** `board-density.js`, `lens-views.js`,
`views.js`. **Wiring test:** `density`. **Edges:** the dial keeps `data-density` (three suites
read it); the slider is untouched here (5c retires it).
**Edges (Pass 3):** the dial's options are exactly `['Card','Compact']` (an exact array — a
third option would be a regression `contains` misses); at 320 the dial is ≥44px like the
sort pills (`mobile-fit` measures `select`); the dial's `change` still calls `setDensity`
(`density` asserts the rows change, not the class).
**Validation:** *(Pass 3)* Narrow — the suites are sufficient; this is dressing.
**Done when:** `density`, `mobile-fit` green.

#### Phase 3: the guest's like is a door; Sign in in the guest's ⋯ (decisions 1, 8)
- **3a (RED):** `e2e/guest-surface.workflow.mjs` — a guest sees `button[data-vote][data-guest]`
  on every row, named `/\d+ likes? — sign in to like/`, with a person glyph and **no** arrow;
  clicking it opens `dialog.authsheet` (lens) — asserted; the count text is unchanged after
  the click; `voteArrows` (live votes) stays 0 for a guest. The guest's ⋯ menu ends with
  `Sign in to like, save and reply` after a separator (exact list of four); choosing it opens
  the auth sheet. `e2e/no-downvote.workflow.mjs` — its `readonlyNames` regex reads the new
  name; its bury sweep unchanged.
- **3b (GREEN):** `js/ui/components.js` — `vote()`'s `!canVote` branch returns a
  `button.vote[data-guest]` whose click calls `ctx.onGuest?.()` (lens: `openAuthSheet`;
  memory: `toast('Log in to vote.', 'err')` via `actions`); `memoryMenuGroups` guest group
  gains the sign-in item behind a separator; `css/app.css` — `.vote[data-guest]` dashed, the
  person glyph; `js/ui/lens-views.js` — `lensMenuGroups` guest return gains the item; rows and
  thread pass `onGuest`. 4 files → **3b-i** `components.js` + `app.css`; **3b-ii**
  `lens-views.js` (+ `views.js` if the memory thread needs `onGuest` wired — Pass 2: it
  does not; the memory gate is inside `actions.setVote`).
**Wiring test:** `guest-surface` (board row, lens) + `post-menu` (memory guest menu: the
list is now `Copy text · Copy link · Sign in…` — its exact-list assertion changes in 3a).
**Edges:** signed in, no `[data-guest]` anywhere; the guest button's `aria-pressed` is
absent (it is not a toggle); the tooltip is `title`, the name carries the count.
**Done when:** a guest's tap opens the sheet on the lens and the toast in memory;
`guest-surface`, `post-menu`, `no-downvote` green.
**Observability:** *(Pass 3)* the guest tap logs nothing on success (the sheet IS the
feedback); if `openAuthSheet` is unavailable (`manager === 'unavailable'`) the sheet's own
toast speaks — the pill never fails silently, which was the whole complaint.
**Validation:** Moderate — a phone look: the dashed pill reads as "not yet", not "broken".

#### Phase 4: the post action row — replies · reposts · share (decision 2)
- **4a (RED):** `e2e/deep-link.workflow.mjs` — a post row's action row ends with
  `button.share[aria-label="Copy link to this post"]` (memory: `/f/<slug>/p/<id>`; lens:
  `/p?uri=`), clipboard asserted; `e2e/guest-surface` — the share is present signed out;
  `e2e/density` — compact rows keep the pill row (the >25% rule still holds — measured).
- **4b (GREEN):** `js/ui/components.js` — `postRow`'s `.foot` becomes `.actions`
  (like · `💬 n` linking to the thread · `⟳ n` count · share) with `.postmeta` beneath it
  (board link, domain, edited); `css/app.css`; `js/ui/lens-views.js` — `permalink` for rows.
**Edges:** the reply pill's count is `commentCount` and links to the thread; the repost pill
is a **count**, not a write, on rows (O2 of post-and-thread stays); compact rows: the row
still >25% shorter than card.
**Observability:** *(Pass 3)* the clipboard failure path is the existing `copy()`
(`console.warn('forage: clipboard write failed')` + toast) — reused, not duplicated.
**Validation:** *(Pass 3)* Moderate — one phone look at a compact board: the pill row does
not wrap onto two lines at 320 (the overflow is measured by `mobile-fit`; the wrap is a
visual judgement).
**Done when:** `deep-link`, `guest-surface`, `density`, `mobile-fit` green.

**Branch A lands:** `CHANGELOG.md`; mock baseline + snaps.

---

### Landing branch B — the stage

#### Phase 5a: the lens shapes aspect ratios
**Changes:** `js/substrates/lens.js:233-235` — `items[].aspect = {w,h}` from
`image.aspectRatio` (null when absent); `video.aspect` likewise (D2); `test/lens.test.js` —
pins both from the fixtures, and null when the embed has none.
**Write-set:** 2. **Edges:** `aspectRatio` missing → `aspect: null`, never `NaN`; a 0 height
→ null; a string width (seen in the wild on old records) → null, not a coerced number.
**Wiring test:** *(Pass 3)* none of its own — 5b-i asserts the stage's height is set before
the image loads, which is only possible if this field reached the DOM. That is the wire.
**Validation:** Narrow.

#### Phase 5b: `js/ui/stage.js` (decision 4)
- **5b-i (RED):** `e2e/media-stage.workflow.mjs` (new, lens shim with four posts: portrait
  9:16, landscape 4:3, wide 16:9, video) — every `.stage` is the card's inner width; its
  height ≤ the cap for the current size; the `img` is centred (`left + width/2 ≈ stage
  centre`) and contain-fit (no side exceeds the stage); `.stage-back` exists for images and
  **not** for video; the stage's height is set **before** the image's `load` event fires
  (aspect from 5a: assert `height > 0` with images blocked by the shim).
- **5b-ii (GREEN):** `js/ui/stage.js` — `stage({ items, aspect, cap, onOpen })` returns the
  frame (one link, the blurred `.stage-back`, the `img`); `css/app.css` — `.stage`,
  `.stage-back`, `.stage img`, `@media (prefers-reduced-transparency)` and D1's fallback.
**Wiring test:** 5c wires it; 5b's suite drives `stage()` through a lens board (the entry
point IS `mediaNode` → 5c). 5b-i is written against 5c's DOM, so it stays RED until 5c —
5b and 5c land back to back.
**Edges (Pass 3):** a picture wider than tall at the cap fills the width and the stage is
SHORTER than the cap (height = width / ratio); a picture with `aspect: null` gets the cap
as its height and sizes on `load` (assert the stage grows from 0 only in that case); the
stage never exceeds the card's inner width by a pixel at 320/360/390/1280; the video stage
has no `.stage-back` and a black ground; `prefers-reduced-transparency` → no blur filter
(stub with `emulateMedia`).
**Observability:** *(Pass 3)* `stage()` says once per session when it had to size on
`load` (`console.debug('forage: stage sized from the picture — no aspect on the embed')`) —
the line that explains a layout jump if one is ever reported.
**Validation:** Broad — D1's device look (or its deferral recorded).

#### Phase 5c: `mediaNode` draws the stage; card size 1–4 replaces the slider (decision 7)
- **5c-i (RED):** `e2e/bluesky-view.workflow.mjs:591-610` — the slider assertions become
  size assertions: `select[data-size]` on the toolbar, choosing 1 lowers `.stage` height,
  4 raises it; `:647-675` — `.media-strip img` → `.stage img`; `e2e/density` — the toolbar's
  row includes `select[data-size]`.
- **5c-ii:** `js/media-scale.js` → **`js/card-size.js`** (`forage.cardsize`, 1–4, default 4,
  `apply()` sets `--stage-cap` and `--card-pad`/`--title` on `:root`); `sw.js` SHELL;
  `css/app.css` — the four notches' variables, `.postrow.compact` unchanged.
- **5c-iii:** `js/ui/lens-views.js` — `mediaNode` → `stage()`; `boardToolbar` — the slider
  becomes `select[data-size].pillsel` (`Size · 4`); `js/ui/views.js` — `settingsView` gains
  `Card size` notches (`role=radiogroup` of 44px buttons); `README.md:353`.
**Edges:** size 1 on a phone: stage ≤ 180px; size 4 desktop: ≤ 520; a stored value outside
1–4 reads as 4; the text-only post has **no** stage element at all.
**Done when:** `media-stage`, `bluesky-view`, `density`, `mobile-fit`, `a11y-skins` green;
`npm test` green (the class literals; the `media-scale` tests move to `card-size`).
**Observability:** *(Pass 3)* a stored `forage.cardsize` outside 1–4 reads as 4 and
`console.warn`s the raw value once.
**Validation:** Broad — the live site's shapes on the Samsung at each of the four sizes.
**Checkpoint:** *(Pass 3)* 5b and 5c are one CI-green point; commit 5b-ii and 5c together if
5b-i cannot be made green alone.

#### Phase 6: more than one picture (decision 5)
- **6a (RED):** `e2e/media-stage` — a four-picture post: setting 1 → carousel (`[data-slide]`
  count 4, one visible, dots 4, `aria-live` region reads "picture 1 of 4"; → and ← keys
  move it; the arrows move it); setting 4 → `.stage-grid[data-count="4"]` with four `img`;
  setting 2 with two pictures → the 2-grid; setting 3 with three → the 3-grid.
- **6b:** `js/ui/stage.js` — the carousel and the grids; `css/app.css`.
- **6c:** `js/pictures.js` (`forage.pictures`, 1–4, default 1); `js/ui/views.js` settings
  row; `sw.js`.
**Edges:** exactly N shown for count ≤ N (never a one-slide carousel); swipe on a phone
(Playwright `touchscreen` in the suite); the counter is `n / m` text with `aria-hidden`,
the live region carries the words; each slide keeps its own alt.
**Observability:** *(Pass 3)* the live region is the observability — a screen reader hears
every slide change; nothing logs.
**Validation:** *(Pass 3)* Moderate — swipe on the Samsung (Playwright's touchscreen proves
the handler, not the feel).
**Done when:** `media-stage` green; `npm test` green.

**Branch B lands:** `CHANGELOG.md`; mock baseline + snaps; `README.md:353`.

---

### Landing branch C — the column and the rail

#### Phase 7: 200 / 680 / 300, the rail optional and quieter (decision 6)
- **7a (RED):** `e2e/mobile-fit` — no horizontal overflow at 320/360/390 with the rail on
  and off; `e2e/guest-surface` — signed out, the rail carries the sign-in card; signed in it
  does not; `e2e/bluesky-view` — the rail's feeds list is the same three sources
  `lensSidebar` drew (assert the hrefs); a new `e2e/rail.workflow.mjs`? **No** — the rail is
  `lensSidebar` restyled, so its existing coverage stays; the suites above gain one line each.
- **7b:** `css/app.css` — `.shell` → `200px minmax(0,680px) 300px` centred; `.shell[data-rail=off]`
  drops the third track; `.side` quieter (`--panel`, `--t-xs`); one column under 860px as
  today. `js/rail.js` (`forage.rail`, on/off, default on) — 2 files. **7c:** `js/ui/views.js`
  settings row `Side panel`; `js/main.js` sets `data-rail` on `.shell`; `js/ui/lens-views.js`
  — `lensSidebar` order: `sessionCard` (guest) · Feeds · `trendingRail`.
**Edges:** rail off → the column is still 680 and centred (assert `.shell` grid has two
tracks and the column's left offset equals the right margin); rail on under 860px → the
sign-in card is the top notice, not a rail.
**Done when:** the live board reads as one content column with a quiet rail; all suites
green.
**Observability:** *(Pass 3)* none — layout; the suites and the look are the instrument.
**Validation:** Moderate — the Samsung at 390 (one column) and the laptop at 1280.
**Checkpoint:** *(Pass 3)* 7b before 7c: the CSS alone must not break `mobile-fit`.

**Branch C lands:** `CHANGELOG.md`; mock baseline + snaps.

## Open Questions

*All five confirmed at their recommended severity by the owner, 2026-08-29.*

- [RECOMMENDED: ADVISORY] **O1: the memory tier's guest door.** Memory has personas, not a
  sign-in; the pill's tap shows the existing `Log in to vote.` toast, which names the dev bar.
  *Good enough for a demo; the lens is the product.*
- [RECOMMENDED: PHASE-GATED, Phase 5b] **O2: the blur's cost on a phone** (D1). *If a
  mid-range Android drops frames, the fallback is a flat darkened band; the suite pins the
  `prefers-reduced-transparency` branch either way.*
- [RECOMMENDED: ADVISORY] **O3: what "feeds you might like" means for a guest** — the CURATED
  list `lensSidebar` already draws. Signed in: the account's saved feeds not yet pinned.
  *Nothing new to fetch either way.*
- [RECOMMENDED: ADVISORY] **O4: the card-size default on a phone** — 4 everywhere (as drawn).
  *A phone at 4 is the mock's own frame; 3 would be the first thing to try if 4 feels tall.*
- [RECOMMENDED: ADVISORY] **O5: the rail below 1100px** — the third track needs 300px; between
  860 and 1100 the column would drop under 600. *Recommend: the rail folds under 1100 as
  it does under 860 today, regardless of the setting.*

## Review Log

- 2026-08-29 — decisions 1–8 locked on mock v5 (owner: "looks good"); plan written straight to
  the template (Pass 1) with the codebase read for every claim (Pass 2) in one sitting, as the
  owner asked ("do pass 1 and 2"). Findings that shaped the phases: the guest control is a
  `span` today and `guest-surface` pins that, so decision 1 is a suite rewrite first; the
  embed's `aspectRatio` is already in the fixtures (D3 resolved without a probe); the rail's
  three cards already exist as `sessionCard`, `lensSidebar` and `trendingRail`, so Phase 7 is
  CSS plus an ordering, not a new surface; `mobile-fit` measures the masthead's controls but
  never its position, which is how the dead sticky rule shipped unseen. Pass 3 owed.

### Pass 3: Quality Gates — 2026-08-29

**TDD ordering:**
- Every phase opens with its RED suite (2a, 3a, 4a, 5b-i, 5c-i, 6a, 7a) or a RED unit test
  (5a). 5b's suite is written against 5c's DOM on purpose — the stage's entry point is
  `mediaNode`, so a unit-only 5b would be the Isolation Trap; recorded as a two-phase green
  point.
- Edges added to 2, 5a, 5b; the others carried them from Pass 1.
**Observability:** stage sizing-on-load debug line; out-of-range card size warn; the guest
door's failure path named (the auth sheet's own toast); everything else is layout, where the
suite is the instrument.
**Debugging readiness:** the Status line tracks `last green`; checkpoints named for 1, 5b/5c
and 7b/7c.
**Validation calibration:** 2 and 5a Narrow; 4, 6, 7 Moderate with the specific look named;
5b/5c Broad (the device). No phase says "tests are sufficient" for a visual change.
**Concurrency honesty:** map confirmed; sequential; no shared external state.
**Discovery:** D1 `throwaway` with an explicit deferral rule; D2 `keep-as-fixture`; D3
resolved. Neither open task can be resolved during planning (a device; a fixture read that
is Phase 0's first minute).
**Coherence:** the plan answers each of the seven measurements in the Problem Statement;
no scope beyond the eight decisions. Severities confirmed by the owner.
**Documentation impact:** every listed file has a phase (README:353 and app.css:481 in 5c;
CHANGELOG and mock per landing); no trailing docs phase.
**Confirmed ready:** yes — no BLOCKING items; O2 gates 5b on a device look or its recorded
deferral.
