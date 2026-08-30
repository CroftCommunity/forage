# Plan: posts, threads, and the ⋯ menu

**Status:** Pass 1 rewritten to the phase-plan template 2026-08-29; **Pass 2 (gap analysis)
applied the same day** — see Review Log. **Pass 3 not yet run.** Not started: Phase 0 first.
**Origin:** owner session 2026-08-29 — Reddit (web + Android) and Bluesky screenshots
studied against Forage as it renders, worked through twelve revisions of a mock, and
**ten decisions locked on `plans/mocks/post-and-thread.html` v12** (landed `b091566`).
The mock is the picture; this is the why and the order. Where they disagree, the mock
v12 wins on *what it looks like* and this plan wins on *what is built first*.
**Branch:** `claude/thread-plan-passes` (this doc); execution in five landing branches
(A–E, § Phases), one `CHANGELOG.md` entry each.

---

## Problem Statement

A Forage thread does not read the way a Reddit or Bluesky thread reads — who said what,
what answers what, what is a repost — and on a phone it has more things to tap by
accident than on purpose. Concretely, as measured on the memory-mode demo thread
(`plans/mocks/snaps/thread.phone.png`, baseline `forage@9eb0074`):

- **Every comment carries the collapse gutter**, so a flat list of forty direct replies
  to the post looks nested under nothing, and the whole left edge is a 24px button
  (`.gutter`, `css/app.css:265`) that a scroll on a phone hits.
- **The vote is a 13px `▲` beside a number** (`miniVote`, `js/ui/components.js:252`) —
  two implementations of one idea (`voteBox`, `:40`, is the other), neither readable at
  a glance.
- **A quote-response renders no controls at all** (`quoteNode`,
  `js/ui/lens-views.js:1039`): no like, no reply, no repost, and a tinted box that reads
  as tappable and is not.
- **There is no ⋯ menu.** Save / report / mute-nothing / block-nothing: save and report
  are bare text buttons in the action row (`commentNode`), report is a `prompt()`
  (`reportButton`, `components.js:290`), and the lens has **no** mute, block or
  mute-thread write at all (`AGENTS.md` § the lens writes — nine writes, none of them).
- **Avatars are absent** on posts and comments — the lens shapes `avatar` on profiles
  and feeds (`js/substrates/lens.js:788,1302,1345,1494`) and never on a post or a
  thread node — and the masthead draws initials by design (`js/main.js:89`, E144).
- **"Best" and "Top" order a thread identically.** `confidence()` in
  `js/engines/rank.js:37` was Wilson on likes/(likes+downs); with downvotes retired
  (plan 2026-08-27-1) it reduces to `1/(1+z²/n)`, strictly increasing in likes. The tab
  promises something the number no longer delivers.
- **A comment has no address.** The memory continue-stub writes `?focus=<id>`
  (`components.js:242`) that `threadView` never reads (`views.js:135-200`, no `focus`);
  on the lens `/p?uri=` of a reply would open it as an orphan root
  (`lens.js:921` fetches `getPostThread(uri, depth 10)`; the head renders nothing above
  itself, `lens-views.js:2148-2190`).

## Reasoning — the ten decisions, and why each

Numbered as on the mock. Each is decided; the alternative is recorded so a later session
does not re-open it as if undecided.

1. **Where the vote lives.** On a post: a pill in the action row (`▲ 35`), the left column
   becomes the avatar. On a comment: count-over-arrow in one outlined pill in the avatar
   column, the arrow on the action row's line, the rail passing behind it. *Why the
   asymmetry:* a post row is scanned by title and wants its controls in one row; a
   comment is scanned by rail and wants its vote on the vertical the rail draws. *Not
   taken:* no left column at all.
2. **Collapse is one ⊖ on the action row, on comments that have children only.**
   Collapsed, it becomes ⊕ and says how many it hides. *Why:* the gutter-as-button was
   never discoverable on a phone and cost mis-taps. **This retires the "§3.3 signature
   collapse gutter" deliberately.** §3.3 is not a document in this repo — it survives
   only as two comments (`components.js:162`, `app.css:1,254`) — so a later session
   that finds the phrase and "restores" the gutter is undoing a decision, not fixing a
   regression. *Not taken:* keep the gutter from depth 1 with a smaller hit area.
3. **The ⋯ menu contents** — post · thread · account groups, separators only, no
   headings, no submenus, destructive last: Copy text · Copy link · Open on bsky.app ·
   Save / Mute thread · Mute words & tags / Hide for me / Mute account · Block account ·
   Report. Steward items (remove/approve/pin/lock) as a conditional fourth group; Delete
   replaces Report on your own post. **Save rides Bluesky's own bookmarks**
   (`app.bsky.bookmark.createBookmark/deleteBookmark/getBookmarks` — private,
   server-side, no record; `docs/LEXICON-REGISTER.md` § bookmarks), never the public
   `community.lexicon.bookmarks.bookmark` record. *Not taken:* a four-item menu.
4. **Bottom sheet on the phone, popover on desktop.**
5. **A quote keeps the wall, loses the box:** the brand-green rule is the node's outer
   left edge, outside the avatar; no tint; the avatar header like any comment; no
   "open its thread ↳" (the ⋯ has Open on bsky.app; decision 10 gives it an address).
6. **Haptics on by default** — `navigator.vibrate(12)` on like and promote, nothing on
   un-like, one settings switch. iOS Safari has no vibrate API: it degrades to nothing,
   never a sound or a toast.
7. **Time is bare** — `1d`, `5h` — next to the name.
8. **Avatars are real.** Every avatar on posts and comments is the account's picture;
   the masthead's initials stand-in becomes the not-yet-loaded state only. *This
   reverses E144's stand-in*, which was chosen for cost ("drawing initials costs no
   request, cannot flash in late", `main.js:89`) — the owner now wants the picture, and
   the loading-state initials keep the no-flash property.
9. **Sort is one control bar, not tabs, on boards and threads** — `Sort ▾` and `From ▾`
   pills adapted from the lens `boardToolbar` selects (`lens-views.js:472`), every sort
   on every board whatever its age (Reddit withholds; we don't). **"Best" is retired; the
   thread's default is Hot, and Hot's signal is engagement — likes + replies + reposts**
   (owner, 2026-08-29: *"I don't like Best … Hot is fine and likes+replies … and across
   reposts too"*). One score, `hot(likes + replies + reposts, createdSec)`, the existing
   decay; the same definition on a board, where it replaces likes-only Hot. **`From`
   applies to Hot as it does to Top, default Today** — a filter over the loaded window by
   each item's own timestamp (`timeframeMs`, `selectors.js:166`), so it needs nothing
   from Jetstream; E139 (live whole-feed re-ranking) is untouched. *Why not a Wilson
   bound:* with no denominator that means "disapproval", a confidence interval on a
   count is a monotone reshaping of the count — the finding that started this. *Not
   taken:* keeping the word Best for any formula.
10. **Deep links, Reddit's shape:** every comment has a permalink; the share glyph copies
    it; opening one renders the whole thread, scrolls to the comment, tints it briefly,
    expands its ancestors, and shows a "viewing one comment — see the whole thread" bar.
    *Not taken:* bsky.app's shape (reply as head with parents above) — it makes "the
    thread" mean two different pages, and the forum framing wants one.

Cross-cutting: **every comment's ⋯ is top-right**, where the post's is; **Reply is a return
arrow**, the speech bubble means only "open the comments"; **Repost on a quote is the glyph
alone**; **share is a quiet glyph at the bottom-right of every comment**, 55% until
hover/focus, full 36/44px hit area.

**Why the phases are small and the landings are grouped.** phase-plan's hard rule — a
phase touching 4+ files is split — cut the landed plan's four phases into fourteen. The
memory tier and the lens draw the same components, and the e2e suites pin the class
names that change (`.gutter` in `bluesky-view` + `mobile-fit`, `.vote.boost` / `.cvote` /
`.votebox .score` / `.tabs .tab` in `no-downvote`, `select[data-density]` in `density`),
so a suite rewrite is a phase of its own and comes **before** the implementation that
turns it green — that is the RED. Phases group into five landing branches so each
landing is one `CHANGELOG.md` entry and one `mock-snaps` re-run (CHANGELOGS.md, MOCKS.md
rule 2), and CI can be red *between* phases of a branch but never at a landing.

## Verified Assumptions

Measured in this session, not remembered. Anything not listed here is unverified and is
either a Phase 0 task or an Open Question.

- `confidence(n)` is monotonic in `n` once downs are gone — algebra on
  `js/engines/rank.js:37-46`; Best ≡ Top on every thread. `test/engines.test.js:6`
  imports `confidence` by name, so removing it is a test change too.
- `threadView` (`js/ui/views.js:135-200`) reads `query.sort` (`:181`, default `'best'`)
  and no `focus`; the file's only `focus` is the mod-queue's j/k cursor (`:256-272`).
  `router.js:38` `parseQuery` already parses `?k=v`, so `focus` needs no router change.
- `quoteNode` (`lens-views.js:1039-1060`) renders byline, body and "open its thread"
  and nothing else; `lensNode` (`:1064`) dispatches walled vs comment.
- The six skins reference neither `.vote.boost` nor `.gutter` (grep: 0 hits each) — the
  "six skins style it" note in `components.js:73` is a claim the skins do not bear out.
  They set `--boost`; the new controls read that token and nothing else.
- `test/css-classes.test.js` fails any class literal in `js/` that `css/app.css` does not
  define (with a `HOOKS` allowlist for query-only classes). Every new class lands with
  its rule in the same commit or the unit gate goes red — a feature, and a constraint.
- The lens shapes `likeCount` and `replyCount` on posts (`lens.js:173,185`) and
  `avatar` on profiles/feeds (`:788,1302,1345,1494`) — **not** `repostCount`, and not
  `author.avatar` on posts or thread nodes. Both fields are on
  `app.bsky.feed.defs#postView` / `#profileViewBasic`; whether the fixtures under
  `test/fixtures/atproto/` carry them is D3.
- The lens writes are exactly nine (`AGENTS.md` § the lens writes) and
  `test/invariants.test.js` counts them: like/unlike, post, delete post, uploadBlob,
  two `putPreferences` (savedFeedsPrefV2), two `fyi.forage.tagsub` records. **No mute,
  block, mute-thread or bookmark write exists.** Mute *reads* do: `buildPosture`
  (`lens.js:62`) consumes `mutedWordsPref`, mutes and blocks from D10 payloads.
- Preferences are stored per-key in localStorage (`forage.mode`, `forage.skin`,
  `js/mode.js:9`, `js/skins.js:46`) — the haptics switch follows that pattern.
- `timeAgo` lives in `js/util.js:19`; every caller appends `' ago'` at the call site
  (`components.js:127,187`, `views.js:158`, `lens-views.js:2161`), so bare time is a
  call-site change, not a util change.
- `npm test` is the declared unit gate (`AGENTS.md:201`; 598 pass at `dfee168`);
  `npm run workflows` is the browser gate and CI's `workflows` check runs it (PR #16:
  2m11s, green).
- A last-day window on Hot is the loaded-window filter Top already has
  (`timeframeMs`, `selectors.js:166`), keyed on each item's timestamp.
- Bluesky bookmarks are XRPC procedures with no record type
  (`docs/LEXICON-REGISTER.md` § bookmarks). **Not verified against the live lexicon**
  — nothing in the repo calls them. D1.
- *(Pass 2)* `test/invariants.test.js:50-110` pins the **shape** of lens writes, not a
  count: no `putRecord`; exactly 2 `putPreferences` under a marker comment; exactly 3
  `createRecord` and 3 `deleteRecord`, each bound to a named `*_COLLECTION` constant;
  every `repo:` argument is `session.did`. Procedures (`muteActor`, `muteThread`,
  `bookmark.*`) match none of those regexes, so they would pass **unnoticed** — the
  test's intent ("anything else added here needs the same argument") requires a new
  assertion pinning procedure writes by name. Block is a record (`app.bsky.graph.block`)
  → `createRecord`/`deleteRecord` become 4/4 with a `BLOCK_COLLECTION` constant.
- *(Pass 2)* `voteBox` has three callers — `components.js:158` (`postRow`),
  `views.js:144` (memory thread head), `lens-views.js:2169` (lens thread head) — and
  `miniVote` one (`components.js:197`). Folding them touches three files plus CSS plus
  two suites: `e2e/no-downvote.workflow.mjs` (`.vote.boost, .cvote.boost`,
  `.votebox .score`) **and** `e2e/guest-surface.workflow.mjs:67` (`voteArrows:
  '.vote.boost, .cvote'`, asserted 0 for a guest and >0 signed in).
- *(Pass 2)* **There is no DOM in the unit gate** — no jsdom/happy-dom in
  `package.json`, no `document` in any `test/*.test.js`. UI components (`menu.js`,
  `sortbar.js`, the vote) get their wiring tests as workflows, never as unit tests;
  the RED-first shape for them is "write the workflow assertion first".
- *(Pass 2)* The six skins reference none of `comment-meta`, `comment-actions`,
  `postmeta`, `.gutter`, `votebox`, `cvote` (grep: 0 in all six) — Phase 1's risk is
  void; no alias classes needed.
- *(Pass 2)* `renderChildren` appends the `continue-stub` and the "load more" button
  **inside** the children container (`components.js:236-246`), so they inherit the
  collapse — Phase 8b's risk is void.
- *(Pass 2, resolves D3 without a probe)* `test/fixtures/atproto/wide-authed-thread-liked.json`
  carries both `"avatar"` and `"repostCount"`; `wide-getPostThread.json` carries
  `repostCount` but its three authors have no `avatar`. Phase 2a and 10b drive their
  unit tests from the authed-thread fixture.

## Documentation Impact

Scheduled in the phase that makes the reference stale; the branch letter is the landing.

- `CHANGELOG.md` — one entry per landing branch under the current month (A–E), written
  on the branch before it lands (CHANGELOGS.md).
- `plans/mocks/snaps/*.png` + `manifest.json` — re-captured with
  `scripts/mock-snaps.mjs` at each landing; `post-and-thread.html`'s `mock-baseline`
  meta bumps to the landed sha and `mock-version` bumps (MOCKS.md rules 1–2). Branch
  landings A–E.
- `AGENTS.md` § the lens writes (`:165-180`) — new rows for bookmark create/delete,
  muteActor, muteThread, `app.bsky.graph.block` create/delete, and `putPreferences`
  (mutedWordsPref) if Phase 4b takes it; `test/invariants.test.js` is the gate that
  forces the row. Phase 4a.
- `AGENTS.md:148` (masthead avatar sentence) — Phase 2.
- `README.md:75` ("the ranking math … Hot, Best") and `:188` (rating table) —
  Phase 10.
- `docs/LEXICON-REGISTER.md` § bookmarks — status moves from "not a record type" to
  "in use via XRPC, phase 4a" once D1 confirms. Phase 4a.
- `js/ui/components.js:162` and `css/app.css:1,254` — the three "§3.3 signature
  collapse gutter" comments are removed with the gutter (a comment naming a retired
  grammar is how it gets restored). Phase 8b.
- `plans/2026-08-27-1-plan-remove-downvotes.md` — its "Best" survives as prose; add a
  Review Log line pointing here when Best is retired. Phase 10.
- `plans/2026-08-28-1-plan-ring-board-kind-tabs.md` — unchanged; its
  `kindContext` reply/repost line is kept by Phase 1 (grepped `reply-context`,
  `repost-context`: only `lens-views.js:577-585` and `app.css:246-247`).
- Grepped for other references to `.gutter`, `miniVote`, `voteBox`, `cvote`, `votebox`:
  `e2e/no-downvote.workflow.mjs`, `e2e/bluesky-view.workflow.mjs`,
  `e2e/mobile-fit.workflow.mjs`, `scenarios/comment-tree-collapse.js`,
  `test/css-classes.test.js` — all scheduled below; nothing else.

## Concurrency Map

**All phases sequential**, in five landing branches executed in order A → B → C → D → E.
Reason: `js/ui/components.js` and `css/app.css` are in the write-set of eleven of the
fourteen phases, `js/ui/lens-views.js` in six, and `e2e/no-downvote.workflow.mjs` in
three (6, 11a) — no two phases have disjoint write-sets *and* disjoint suites. The one
candidate pair, D (sort) against E (deep links), shares `lens-views.js` and
`views.js`. Each branch runs in its own worktree (`worktrees/<branch>/forage`), one at
a time; no phase binds ports (the e2e harness picks its own), and the only ambient state
any phase touches is localStorage in a Playwright context that the harness discards.

*(Pass 2 — ambient-state sweep.)* One shared external: **the test account** (TESTBED.md).
D1, D2, 4a's and 4b's Validation, and 13's Validation write to it. Invariants: claim
`testbed--forage-test-account` before each such run; every write is undone in the same
run (bookmark deleted, mute/block lifted); the probe scripts never persist credentials
(read from the location TESTBED names). Those five steps are therefore serialized even
if everything else were parallel. *Missed-parallelism check:* after the Pass 2 splits,
the only candidate pairs with disjoint write-sets are 7a ↔ 8a (a pure module + test vs
three suites) and 10a ↔ 11a (rank + its test vs one suite) — each saves minutes, each
sits inside a branch whose next phase needs both; **stays sequential**, not worth a
worktree.

## Phases

Fourteen phases, five landing branches. Every phase: RED-first (a failing wiring test
before production code), `npm test` green at its end, and the named workflow green at
its end **unless the phase is a suite rewrite** (8a, 11a), which ends RED by design.
Field shape per phase-plan; "Shared-state contract" is "none beyond the write-set" unless
it says otherwise.

### Phase 0: Discovery — landing branch A (with phases 1–2)

**Goal:** turn the four unverified externals into evidence before any phase depends on
them. Cheap; each is a probe script or a fixture read.

- [ ] **D1: Do `app.bsky.bookmark.createBookmark` / `getBookmarks` / `deleteBookmark`
  exist on the test account's PDS/AppView, and what do they return?**
  - **Probe:** a script under `scripts/probe-bookmarks.mjs` (throwaway) that signs in as
    the test account (credentials at the location TESTBED.md names, never in the repo),
    creates a bookmark on a known post uri, lists, deletes, lists again; prints raw
    responses.
  - **Success criteria:** create returns 200 with no record uri (server-side, no repo
    write); `getBookmarks` lists the subject with a `createdAt`; after delete the list
    no longer holds it. Record the exact response shapes.
  - **Disposition:** `keep-as-fixture` — the raw responses become
    `test/fixtures/atproto/bookmarks.json` for Phase 4a's unit tests. The script is
    deleted after (it holds a sign-in flow the substrate already owns).
- [ ] **D2: Which mute/block procedures does the test account's server accept, and
  are they records or procedures?**
  - **Probe:** same script style: `app.bsky.graph.muteActor` / `unmuteActor`
    (procedures), `app.bsky.graph.muteThread` / `unmuteThread`, and
    `app.bsky.graph.block` (a **record** — `createRecord`/`deleteRecord`); read back with
    `getMutes` / `getBlocks` and via `buildPosture`'s existing reads.
  - **Success criteria:** each call 200; the read-back shows the change; `buildPosture`
    applied to the read-back hides the muted account's post in the shape layer.
  - **Disposition:** `keep-as-fixture` — read-back shapes to
    `test/fixtures/atproto/graph-writes.json`.
- [x] ~~**D3: Do the thread fixtures already carry `author.avatar` and `repostCount`?**~~
  **Resolved in Pass 2 by reading the fixtures:** `wide-authed-thread-liked.json` has
  both. No probe needed; the remaining D3 act is one line in Phase 2a's test naming
  that fixture.
- [ ] **D4: Does `navigator.vibrate(12)` fire inside a click handler on the Samsung
  test device's Chrome, and is it silent in the iOS simulator?**
  - **Probe:** a one-page `scripts/probe-haptics.html` opened over the LAN; tap a
    button; report `typeof navigator.vibrate` and the return value in the page.
  - **Success criteria:** Android: `true` and a felt buzz; iOS: `undefined`, no error,
    nothing else happens.
  - **Disposition:** `throwaway`.

**Done when:** D1, D2 and D4 have evidence in Verified Assumptions, D1–D2 fixtures exist,
and Phases 4a/4b/6 have been re-read against them (Phase 0 is the only phase allowed to
restructure later phases; log any change in the Review Log).

---

### Landing branch A — the header line

#### Phase 1: the byline on rows and comments (memory tier)
**Goal:** every post row and comment opens the same way: avatar slot · name · `1d` ·
⋯ slot, top-right.
**Changes:**
- [ ] `js/ui/components.js` — `postRow` and `commentNode` build a `.byline`
  (avatar slot as a sized `<span class="av">` with initials, `.who`, bare
  `timeAgo`, `.kebab` button with `aria-label` and no handler yet). `postmeta` keeps
  board / comment-count / domain; `comment-meta` folds into the byline. Bare time is
  the call site dropping `' ago'` (`:127,187`).
- [ ] `css/app.css` — `.byline`, `.av`, `.kebab` rules (from the mock's CSS, tokens
  only); `test/css-classes.test.js` forces this in the same commit.
- [ ] `e2e/thread-byline.workflow.mjs` (new) — seeded memory thread: every `.comment`
  has exactly one `.byline` whose first child is `.av` and last is `button.kebab`
  with `aria-label`; time text matches `/^\d+[smhdw]$/`; the post row likewise.
**Call chain:** `#/f/:slug/p/:id` → `threadView` → `commentNode` → `.byline`;
`#/popular` → `renderBoard` → `postRow` → `.byline`.
**Wiring test:** `e2e/thread-byline.workflow.mjs` — RED before (no `.byline`).
**Depends on:** nothing. **Read-set:** `js/util.js`, `js/ui/views.js`.
**Write-set:** `js/ui/components.js`, `css/app.css`, `e2e/thread-byline.workflow.mjs`.
**Risks:** ~~`comment-meta` styled by a skin?~~ Pass 2: no skin references it. The
36px kebab under the 44px phone floor is the live risk — see Validation.
**Done when:** (1) a reader sees avatar · name · `1d` · ⋯ on every comment and row in
memory mode; (2) `node e2e/run.mjs thread-byline` green, `npm test` green.
**Validation:** Narrow — wiring test + unit; plus one phone-width look (`mobile-fit`
still green: the kebab is a 36px button, above the 44 floor? **No — 36 < 44**; the
phone rule makes it 44 on `[data-phone]`; `mobile-fit` measures at 320/360/390 so the
kebab must be 44 there. Carry the mock's `.app[data-phone]` rule as a `@media
(max-width: 480px)` rule).

#### Phase 2: real avatars on posts, comments, and the masthead (lens)
**Goal:** the avatar slot shows the account's picture wherever the lens has one; initials
are the loading state.
**Changes:**
- [ ] `js/substrates/lens.js` — `shapePost` and the thread node shaping carry
  `avatar: post.author.avatar || null` (D3 fixture drives the unit test in
  `test/lens.test.js`); the session's own profile picture is exposed for the masthead.
- [ ] `js/main.js` — the masthead control renders `<img>` when the session profile has
  an avatar, initials until it loads (`onload` swaps; no layout shift: both 30px).
- [ ] `e2e/avatar-nav.workflow.mjs` — extend: signed-in shim profile with an avatar
  URL → masthead shows `img[alt=""]` inside the control; a lens thread's `.byline .av`
  contains an `img` when the node has `avatar`, initials when not.
**Call chain:** `lens.thread()` → `lensNode` → `commentNode(node)` → `.byline .av img`;
`main.js` masthead → session profile → `img`.
**Wiring test:** `avatar-nav.workflow.mjs`, the new assertions — RED before.
**Depends on:** Phase 1 (the slot), D3.
**Read-set:** `js/ui/components.js`, `js/ui/lens-views.js`, `test/fixtures/atproto/`.
**Write-set — split in Pass 2 (4 files):**
- **2a** shaping: `js/substrates/lens.js`, `test/lens.test.js` (fixture:
  `wide-authed-thread-liked.json`; asserts `avatar` on the head and every node).
- **2b** rendering: `js/main.js` (masthead), `e2e/avatar-nav.workflow.mjs` (the wiring
  test for both — the lens comment's `.byline .av img` proves 2a reached the DOM).
**Risks:** E144's reason for initials was the 320px masthead row; an `img` is the same
30px. Avatar URLs are CDN — the e2e shim must serve a data: URL, never the network.
**Done when:** (1) signed in, the masthead and every lens comment show the picture;
(2) `node e2e/run.mjs avatar-nav` green.
**Validation:** Moderate — plus a live look on the Samsung (TESTBED claim) at a real
thread: pictures load, no flash of initials longer than the fetch.

**Branch A lands:** `CHANGELOG.md` entry; `AGENTS.md:148`; `mock-snaps` re-run and the
mock's baseline bumped.

---

### Landing branch B — the ⋯ menu

#### Phase 3: the menu component, wired to the memory tier
**Goal:** one menu, popover on desktop and sheet on the phone, groups declared as data;
the memory tier's Save · Hide · Report (and steward items, Delete on your own) move
into it and out of the action row.
**Changes:**
- [ ] `js/ui/menu.js` (new) — `menu({ groups, anchor, sheet })`: `role="menu"`, items
  with trailing icon, `.msep` between groups, Esc/outside-click close, focus returned to
  the kebab; `sheet` = bottom sheet with scrim under `(max-width: 480px)`.
- [ ] `js/ui/components.js` — the kebab from Phase 1 opens the menu; `saveButton`,
  `reportButton`, `modButtons`, `deleteControl` become group entries; the action row
  keeps vote · reply (· share slot).
- [ ] `e2e/post-menu.workflow.mjs` (new) — click a comment's kebab: menu appears with
  the memory groups; Save toggles `saved` in state; a steward persona sees the fourth
  group; the author sees Delete not Report; at 390 wide the menu is a sheet
  (`getComputedStyle` bottom-anchored) with a scrim.
**Call chain:** `.byline button.kebab` click → `menu()` → item handlers → `actions.*`.
**Wiring test:** `post-menu.workflow.mjs` — RED before (kebab has no handler).
**Depends on:** Phase 1. **Read-set:** `js/actions.js`, `css/app.css`.
**Write-set — restructured in Pass 2** (the "CSS as a prerequisite commit" idea was
dead code by another name; there is no DOM in the unit gate, so the only honest RED is
the workflow):
- **3a (RED):** `e2e/post-menu.workflow.mjs` — written first, fails against HEAD because
  the kebab has no handler (assertion failure, not selector timeout: assert the kebab
  exists, then that clicking it produces `[role=menu]`).
- **3b (GREEN):** `js/ui/menu.js`, `css/app.css`, `js/ui/components.js` — 3 files;
  `css-classes.test.js` is what forces `menu.js`'s literals and `app.css`'s rules into
  the same commit.
Also gates 3b: `e2e/guest-surface.workflow.mjs` (a guest's kebab shows Copy text ·
Copy link only — never a Save it cannot perform).
**Risks:** `guest-surface.workflow.mjs` asserts a signed-out reader sees no control they
cannot use — the menu must render only usable items per persona, never disabled rows.
**Done when:** (1) every memory post and comment has a working ⋯ with the decided
groups; (2) `node e2e/run.mjs post-menu guest-surface` green.
**Validation:** Moderate — plus keyboard: Tab to kebab, Enter, arrow keys, Esc.

#### Phase 4a: the lens writes — bookmarks, mutes, blocks (substrate only)
**Goal:** the substrate can save/unsave (bookmark), mute/unmute an account, mute/unmute
a thread, block/unblock — each argued in `invariants.test.js` and listed in `AGENTS.md`.
**Changes:**
- [ ] `js/substrates/lens.js` — `bookmark(uri, on)`, `muteActor(did, on)`,
  `muteThread(rootUri, on)`, `block(did, on)`; the last is a record
  (`app.bsky.graph.block`), the rest procedures (D2). Read-backs feed `buildPosture`.
- [ ] `test/invariants.test.js` + `test/lens-writes.test.js` — the write count rises
  from 9 to 13 (or 14 with mutedWords, O5) with the argument; each write unit-tested
  against the D1/D2 fixtures via the fetch shim.
- [ ] `AGENTS.md` § the lens writes — the rows. `docs/LEXICON-REGISTER.md` § bookmarks —
  status line.
**Call chain:** none yet — Phase 4b wires it. The wiring test is 4b's; this phase's
"done" is the unit gate and the invariant count.
**Depends on:** D1, D2. **Read-set:** `test/fixtures/atproto/`.
**Write-set — split in Pass 2 (5 files):**
- **4a-i bookmarks:** `js/substrates/lens.js`, `test/lens-writes.test.js`,
  `test/invariants.test.js` — a **new** assertion: `PROCEDURE_WRITES` pinned by name
  (`app.bsky.bookmark.createBookmark`, `deleteBookmark`), because the existing regexes
  see only `createRecord`/`deleteRecord`/`putPreferences` and a procedure write would
  otherwise land unnoticed. `docs/LEXICON-REGISTER.md` § bookmarks status line rides
  here (docs, 4th file — the register is the argument's home).
- **4a-ii mutes and blocks:** `js/substrates/lens.js`, `test/lens-writes.test.js`,
  `test/invariants.test.js` — `muteActor`/`unmuteActor`/`muteThread`/`unmuteThread`
  join `PROCEDURE_WRITES`; `app.bsky.graph.block` is a record: `createRecord` 3→4,
  `deleteRecord` 3→4, `BLOCK_COLLECTION` constant bound twice. `AGENTS.md` § the lens
  writes rows (docs). If O5 takes Bluesky's muted words, `putPreferences` 2→3 under the
  marker — a third phase 4a-iii, not a silent bump.
- **4a-iii (O6, if taken): the repost write** — `app.bsky.feed.repost` record,
  `createRecord` 4→5, `deleteRecord` 4→5, `REPOST_COLLECTION`; same three files.
**Risks:** `invariants.test.js` exists to make adding a write an argument — write the
argument in the test's own voice, do not bump the number.
**Done when:** `npm test` green with the new count and every new write exercised.
**Validation:** Broad — each write run once against the test account (TESTBED claim),
read back via `getBookmarks` / `getMutes` / `getBlocks`, then undone.

#### Phase 4b: the lens menu
**Goal:** the ⋯ on a lens post or comment carries the full decided list, each item live.
**Changes:**
- [ ] `js/ui/lens-views.js` — `LENS_PERMS`/ctx supply the menu groups: Copy text, Copy
  link (`/p?uri=` shareable form), Open on bsky.app, Save (4a), Mute thread, Mute words
  & tags (O5), Hide for me (local, `hidden` set in localStorage, applied in the shape
  layer), Mute account, Block account, Report (a sheet, not `prompt()` — the memory
  report becomes the same sheet), Delete on your own.
- [ ] `e2e/bluesky-view.workflow.mjs` — extend: signed-in shim, open a comment's ⋯,
  assert the ten items in order and that Save calls the bookmark procedure (shim
  records it); Hide removes the node and survives reload.
**Call chain:** `lensNode` → `commentNode(node, ctx)` → kebab → `menu(ctx.menuGroups)` →
`lens.bookmark()` etc.
**Wiring test:** the `bluesky-view` additions — RED before.
**Depends on:** 3b, 4a-i, 4a-ii, O5, O8. **Read-set:** `js/ui/menu.js`, `js/substrates/lens.js`.
**Write-set:** `js/ui/lens-views.js`, `e2e/bluesky-view.workflow.mjs`,
`js/ui/components.js` (report sheet replaces `prompt()`) — 3.
**Risks:** Block is visible to the blocked account on Bluesky; the item's copy says so.
**Done when:** (1) signed in, every lens node's ⋯ does what it says; (2)
`node e2e/run.mjs bluesky-view post-menu` green.
**Validation:** Broad — one live pass per item on the test account, undone after.

**Branch B lands:** `CHANGELOG.md`; snaps + baseline bump.

---

### Landing branch C — threading, the vote, haptics, the quote

#### Phase 6: one vote component (pill on posts, count-over-arrow on comments)
**Goal:** `voteBox` and `miniVote` fold into one `vote(subject, data, { layout })`; the
post layout is the pill `▲ 35`, the comment layout the outlined count-over-arrow in the
avatar column; the pressed state fills the arrow in `--boost`.
**Changes:**
- [ ] `js/ui/components.js` — one implementation; `postRow` uses `layout:'pill'` in the
  action row; `commentNode` uses `layout:'stack'` placed `grid-column:1 / grid-row:3`.
  Optimistic flip, revert on `gated`/`banned`, toast otherwise — unchanged semantics.
- [ ] `css/app.css` — `.vote` (pill) and `.avvote` (stack) from the mock; `.votebox`,
  `.cvote`, `.score` rules removed (css-classes keeps the two files honest).
- [ ] `e2e/no-downvote.workflow.mjs` — its selectors move from `.vote.boost, .cvote.boost`
  / `.votebox .score` to the one control (`[data-vote]` + `aria-pressed` + `.n`); its
  invariant (no bury anywhere, aria names) is unchanged — **RED first**, then GREEN.
**Call chain:** row and comment → `vote()` → `actions.setVote` / `lensVote`.
**Wiring test:** `no-downvote.workflow.mjs` (already visits a row AND a comment — that
is why it, not a new suite) **and** `guest-surface.workflow.mjs:67,92,111` (a guest sees
a count and no arrow; signed in the arrow is back).
**Depends on:** 1. **Read-set:** `js/actions.js`, `js/ui/lens-views.js` (`lensVote`).
**Write-set — restructured in Pass 2** (four callers in three files, two suites pin the
selectors; 6 files → three phases, RED → GREEN → GREEN):
- **6a (RED):** `e2e/no-downvote.workflow.mjs`, `e2e/guest-surface.workflow.mjs` —
  selectors move to `[data-vote]` / `[aria-pressed]` / `.n`; the bury invariant keeps
  its `[class*="bury"]` sweep (new class names must not contain "bury").
- **6b:** `js/ui/components.js`, `css/app.css` — `vote()` with two layouts;
  `voteBox`/`miniVote` removed; `postRow` and `commentNode` call it. The two thread
  heads still import `voteBox` and break here — CI red *inside* branch C, by design.
- **6c (GREEN):** `js/ui/views.js:144`, `js/ui/lens-views.js:2169` — the thread heads
  call `vote(…, { layout: 'pill' })`.
**Risks:** ~~grep the callers~~ (done: four). The head's pill and the row's pill are
the same layout — `density.workflow.mjs` must still see compact rows shrink the pill.
**Done when:** (1) one `▲ n` control on posts, the stacked unit on comments, both
toggling; a guest sees counts only; (2) `node e2e/run.mjs no-downvote guest-surface
density` green, `npm test` green.
**Validation:** Moderate — phone-width: the stack is 44px tall under 480px.

#### Phase 7: haptics
**Goal:** a like or promote buzzes on devices that can; one switch on `/me`; default on.
**Changes:**
- [ ] `js/haptics.js` (new) — `buzz()` reads `forage.haptics` (default `'on'`), calls
  `navigator.vibrate?.(12)` inside the user gesture; pure `enabled()`/`set()`.
- [ ] `js/ui/components.js` — the vote component calls `haptics.buzz()` on the
  optimistic flip **to on**, never on off. `js/ui/views.js` — the `/me` page gains the
  switch beside skin/mode.
- [ ] `test/haptics.test.js` — default on; off suppresses; `vibrate` absent is a no-op
  with no throw.
**Call chain:** vote click → `vote()` flip → `haptics.buzz()` → `navigator.vibrate`.
**Wiring test:** `test/haptics.test.js` for the module; the wiring is the vote
component's call — assert it via `no-downvote`'s existing click with a stubbed
`navigator.vibrate` counting calls (one line in that suite).
**Depends on:** 6c, D4, O3.
**Write-set — split (Pass 2 confirms):**
- **7a:** `js/haptics.js`, `test/haptics.test.js` — pure module; `navigator` absent in
  node is the first test (no throw).
- **7b:** `js/ui/components.js` (the call inside the click handler), `js/ui/views.js`
  (`/me` switch), `e2e/no-downvote.workflow.mjs` (stub `navigator.vibrate` via
  `addInitScript`, count exactly one call per like-on, zero per like-off).
**Risks:** O3 (reduced-motion). Chrome ignores `vibrate` without user activation —
the call must stay inside the click handler, not after the `await`.
**Done when:** (1) on the Samsung a like buzzes and the switch stops it; (2)
`npm test` green; `no-downvote` green with the stub counting exactly one call per
like-on.
**Validation:** Broad — the device (D4's page is the pattern), both switch states.

#### Phase 8a: the thread suites move to the new grammar (RED)
**Goal:** the three files that pin the gutter now describe the rail + ⊖ grammar. This
phase ends RED on purpose.
**Changes:**
- [ ] `e2e/bluesky-view.workflow.mjs:253-280` — a reply has no `.gutter`; a comment
  with children has exactly one `button[data-fold]` on its action row; clicking it
  hides `.kids` and the button reads `⊕ n replies hidden`; a walled quote has no fold
  and no rail; depth-0 nodes have no `.line`.
- [ ] `e2e/mobile-fit.workflow.mjs:46-54` — the `isRail` exemption is deleted (there is
  no rail-shaped target any more; the fold button is 44px like everything else).
- [ ] `scenarios/comment-tree-collapse.js` — the scripted scenario clicks
  `[data-fold]`, asserts hidden counts, asserts the rail is `pointer-events:none`.
**Call chain / wiring test:** these ARE the wiring tests for 8b.
**Depends on:** 6. **Write-set:** the three files above.
**Done when:** all three fail against HEAD for the right reason (assertion, not
selector timeout — a timeout is a wrong-selector bug in the test, not RED).
**Validation:** read the failure output in full (VERIFICATION.md: never through
`tail`).

#### Phase 8b: the rail and ⊖/⊕, the gutter removed (GREEN)
**Goal:** 8a goes green.
**Changes:**
- [ ] `js/ui/components.js` — `commentNode`: avatar column carries `.line` when the
  node has children; the elbow is CSS on each child; the `gutter` button and
  `collapse-note` are removed; a `button.fold[data-fold]` on the action row of any
  node with children toggles `.collapsed` and writes its own label. The "§3.3" comment
  at `:162` goes.
- [ ] `css/app.css` — `.c`/`.avcol`/`.line`/`.kids::before`/elbows/`.fold` from the mock;
  `.gutter*` and `.collapse-note` rules removed; the two "§3.3" comments go.
- [ ] `js/ui/lens-views.js` — `quoteNode` no longer needs to *avoid* a gutter; nothing
  else (its full change is Phase 9).
**Call chain:** `threadView`/`lens.thread` → `commentNode` → `.fold` → `.collapsed`.
**Wiring test:** 8a's three files.
**Depends on:** 8a. **Write-set:** `js/ui/components.js`, `css/app.css`,
`js/ui/lens-views.js`.
**Risks:** ~~"load N more" / `continue-stub` must inherit the collapse~~ — Pass 2: they
are appended inside the children container (`components.js:236-246`); they do. Deep nesting at 390 wide: 22px per level; `mobile-fit`
measures overflow by element geometry at 320/360/390 — a thread ten deep must not
overflow (the continue-stub at depth 10 is the existing ceiling).
**Done when:** (1) a direct reply to the post has no rail; a comment's replies hang
off its avatar; ⊖ folds them; (2) `node e2e/run.mjs bluesky-view mobile-fit` green,
`npm test` green (css-classes: no orphan `.gutter` literal).
**Validation:** Moderate — phone look at three nesting levels.

#### Phase 9: the quote node
**Goal:** a quote-response is a comment with a wall: avatar header, wall on the outer
edge, no tint, no "open its thread", full action row (vote stack, Reply, ⟳ glyph, share).
**Changes:**
- [ ] `js/ui/lens-views.js` — `quoteNode` builds through `commentNode` with a
  `kind:'quote'` ctx (byline gets `⟳ quoted this`; action row adds a Repost glyph
  calling the existing repost write — **does one exist? No: the nine writes have no
  repost.** → the ⟳ glyph is inert-with-toast until a repost write is argued; O6).
- [ ] `css/app.css` — `.c.quote` wall rule; `.quote-node`/`.quote-meta`/`.quote-body`/
  `.quote-open` removed.
- [ ] `e2e/bluesky-view.workflow.mjs` — the quote assertions: wall on the node's own
  left edge (`border-left-width` on `.c.quote`, not on an inner box), no
  `.quote-open`, byline present, the vote stack present.
**Depends on:** 8b, **4b** (the quote's ⋯ takes the lens menu groups), O2, O6.
**Write-set:** `js/ui/lens-views.js`, `css/app.css`, `e2e/bluesky-view.workflow.mjs`.
**Done when:** (1) a quote reads as a walled comment with controls; (2) `bluesky-view`
green.
**Validation:** Moderate.

**Branch C lands:** `CHANGELOG.md`; snaps + baseline bump; the mock's decision-2 line
gets "landed <sha>".

---

### Landing branch D — Hot on engagement, the sort bar

#### Phase 10: Hot takes engagement; Best is retired
**Changes:**
- [ ] `js/engines/rank.js` — `hot(engagement, createdSec)` unchanged in shape; `sortItems`
  computes `likes + replies + reposts` per item (`i.likes + (i.replyCount ?? i.children?.length ?? 0) + (i.repostCount ?? 0)`);
  `confidence` and `case 'best'` removed.
- [ ] `test/engines.test.js` — pins: at equal age, 3 likes + 4 replies outranks 5
  likes + 0; `sortItems(items,'best')` no longer exists (throws or falls to hot —
  decide: **falls to hot**, so an old `?sort=best` URL still renders; O7).
- [ ] `js/substrates/lens.js` — `repostCount` shaped on posts and thread nodes (D3).
  `js/selectors.js:171` thread default `'best'` → `'hot'`; `views.js:181` likewise.
**Write-set:** `js/engines/rank.js`, `test/engines.test.js`, `js/substrates/lens.js`,
`js/selectors.js`, `js/ui/views.js` — **5 → split**: 10a rank + test (2); 10b shaping
+ defaults (3). `README.md:75,188` and the 2026-08-27-1 plan's Review Log line in 10b.
**Wiring test:** `no-downvote`'s thread tab assertions (`:192-222`) already read the
sort names on a thread — they pin `Best`; 10b changes them to `Hot` (RED first).
**Done when:** a thread sorted Hot puts a replied-to comment above a merely liked one;
`npm test` green; `no-downvote` green.
**Validation:** Narrow.

#### Phase 11a: the sort bar on the memory tier (tabs retired)
**Changes:**
- [ ] `js/ui/sortbar.js` (new) — `sortBar({ sorts, sort, timeframes, from, onChange })`:
  two `<select>`s dressed as pills (`Sort`, `From`), `From` shown only for Hot/Top.
- [ ] `js/ui/views.js` — boards and threads render `sortBar` in place of `tabs()`
  (`:26,81,179`); `?sort=&from=` stay in the URL.
- [ ] `e2e/no-downvote.workflow.mjs:192-222` — the tab assertions become select
  assertions (options list; active value) — RED first.
**Write-set — restructured in Pass 2 (same reason as Phase 3):**
- **11a (RED):** `e2e/no-downvote.workflow.mjs:192-222` — the thread and board sort
  assertions read `select[data-sort]` options and value; fails against HEAD.
- **11b (GREEN):** `js/ui/sortbar.js`, `css/app.css`, `js/ui/views.js`.
`e2e/mobile-fit.workflow.mjs:40` already lists `select` among tap targets, so the two
selects are measured at 320/360/390 with no suite change.
**Done when:** every memory board and thread has the bar; every sort available on every
board; `no-downvote` green.

#### Phase 11c: the sort bar on the lens
**Changes:**
- [ ] `js/ui/lens-views.js` — `boardToolbar` keeps `select[data-density]` and the media
  slider (`density.workflow.mjs:52,96` drives them) and replaces its sort/timeframe
  selects with `sortBar`; the thread page gets the bar above its comments (it has none
  today). `From` default Today on a board, All time on a thread.
- [ ] `e2e/density.workflow.mjs` — unchanged if `data-density` survives; assert the bar
  is present beside it (one line). `e2e/bluesky-view.workflow.mjs` — the lens thread
  shows the bar; re-sorting re-queries (4e) as today.
**Depends on:** 11b. **Write-set:** `js/ui/lens-views.js`, `e2e/density.workflow.mjs`,
`e2e/bluesky-view.workflow.mjs`.
**Done when:** the lens board and thread carry the same bar as memory; `density`,
`bluesky-view` green.

**Branch D lands:** `CHANGELOG.md`; snaps + baseline bump; `README.md`.

---

### Landing branch E — deep links

#### Phase 12: `?focus=` on the memory thread
**Changes:**
- [ ] `js/ui/views.js` — `threadView` reads `query.focus`; after paint: scroll the node
  into view, add `.focused` (tint via `--tint`, `animation` fading over 2s, honouring
  `prefers-reduced-motion` by skipping the fade), expand its ancestors' `.collapsed`,
  collapse its siblings to ⊕, prepend the "Viewing one comment — see the whole thread"
  bar linking to the bare thread URL. The comment's share glyph and its ⋯ "Copy link"
  write `/f/<slug>/p/<post>?focus=<id>` to the clipboard.
- [ ] `css/app.css` — `.focused`, `.focus-bar`, the share glyph rule.
- [ ] `e2e/deep-link.workflow.mjs` (new) — open a seeded thread with `?focus=<deep id>`:
  the node is in the viewport, `.focused`, ancestors expanded, the bar present; click
  "see the whole thread" → bar gone, siblings expanded. Clipboard: the share button
  writes the expected URL (Playwright `context.grantPermissions(['clipboard-read'])`).
**Write-set:** `js/ui/views.js`, `css/app.css`, `e2e/deep-link.workflow.mjs` (+
`js/ui/components.js` for the share glyph and the copy handler — 4 → **12a** share
glyph + copy on comments (`components.js`, `app.css`, `deep-link` suite RED for the
clipboard case); **12b** focus landing — **Pass 2 decides the helper's home:**
`focusComment(container, id, { bar })` lives in `js/ui/components.js` (both tiers import
it; `views.js` and `lens-views.js` already import from there), so 12b's write-set is
`components.js`, `views.js`, `deep-link` suite (GREEN)).
**Done when:** a copied comment link opens on that comment, highlighted, in context;
`deep-link` green.
**Validation:** Moderate — phone: the focused node lands below the sticky masthead, not
under it.

#### Phase 13: `?focus=` on the lens, and a reply uri resolves
**Changes:**
- [ ] `js/substrates/lens.js` — `thread(uri)`: when the fetched head is itself a reply
  (`record.reply?.root`), refetch from `root.uri` and return `{ …, focus: uri }`; the
  `getPostThread` response's `parent` chain is otherwise still discarded.
- [ ] `js/ui/lens-views.js` — the thread page calls 12b's `focusComment` from
  `components.js` with `query.focus ?? t.focus`; Copy link / share write
  `/p?uri=<root>&focus=<reply>`.
- [ ] `e2e/deep-link.workflow.mjs` — lens cases: `/p?uri=<reply uri>` lands on the root
  with the reply focused; `&focus=` likewise.
**Depends on:** 12b. **Write-set:** `js/substrates/lens.js`, `js/ui/lens-views.js`,
`e2e/deep-link.workflow.mjs`.
**Done when:** a bsky reply uri pasted into `/p?uri=` lands on its thread at that reply;
`deep-link` green.
**Validation:** Broad — one live reply uri from the test account.

**Branch E lands:** `CHANGELOG.md`; snaps + baseline bump.

## Open Questions

- ~~**O1: what Best means without downvotes.**~~ **Resolved 2026-08-29 (owner):** Best
  is retired; Hot on likes + replies + reposts, `From` default Today. Decision 9.
- [RECOMMENDED: ADVISORY] **O2: Repost on plain replies too?** On Bluesky a reply is a
  post and repostable; the mock shows ⟳ only on quotes. *Cheap to add in Phase 9; the
  decision is about row density, not mechanism.*
- [RECOMMENDED: ADVISORY] **O3: haptics under `prefers-reduced-motion`?** *Not motion,
  but some people set it for exactly this; default proposal: respect it (Phase 7a reads
  the media query).*
- [RECOMMENDED: ADVISORY] **O4: the loading-state avatar** — initials (keeps E144's
  no-flash) vs a neutral silhouette. *Default: initials; Phase 2 ships either in one
  line.*
- [RECOMMENDED: PHASE-GATED, Phase 4b] **O5: what "Mute words & tags" opens** — Bluesky's
  `mutedWordsPref` (a 14th write, `putPreferences`) or Forage's own hashtag prefs
  (plan 2026-08-28-2, `js/hashtag-prefs.js`)? *They are different stores with different
  reach; the menu item's label promises Bluesky's. Recommend Bluesky's, with the Forage
  prefs linked from `/me`.*
- [RECOMMENDED: PHASE-GATED, Phase 9] **O6: the repost write.** The lens has no
  `app.bsky.feed.repost` write; the mock puts ⟳ on quotes and the post head already
  draws a repost pill with a count. *Recommend: argue it in `invariants.test.js` as
  write #15 in Phase 4a-ii (same shape as like), so Phase 9's glyph is live; otherwise
  the glyph is a count only.*
- [RECOMMENDED: ADVISORY] **O7: old `?sort=best` URLs** — fall to Hot silently, or 404?
  *Recommend fall to Hot: the URL is in people's history and Hot is what Best was
  pretending to be.*
- [RECOMMENDED: PHASE-GATED, Phase 3] **O8: steward items in the lens menu.** The memory
  tier has stewards; the lens has no moderation writes (moderation "rides your account's
  own", README:467). *Recommend: the fourth group renders only where `ctx.canModerate`
  — memory today, lens never until a plan says otherwise.*

## Review Log

- 2026-08-29 — drafted from mock v12 after the owner locked all ten decisions (four
  phases, no template fields). Landed `dfee168`.
- 2026-08-29 — O1 resolved by the owner the same day; phase 3 unblocked.
- 2026-08-29 — **Pass 1 (rewrite to the phase-plan template).** Four phases became
  fourteen under the 4-file rule, grouped into five landing branches; Phase 0 added with
  four discovery tasks (bookmarks, mutes/blocks, fixture fields, haptics on device);
  Documentation Impact and Concurrency Map added; every phase carries call chain, wiring
  test, read/write-sets, done-when (two tiers), validation. New findings while grounding:
  the lens has **no** mute/block/repost write (O6, 4a), `invariants.test.js` counts
  writes, `css-classes.test.js` forces CSS and JS to land together, the e2e suites pin
  `.gutter`/`.vote`/`.tabs` (hence the RED-suite phases 8a/11a), and `§3.3` is a phrase in
  three comments rather than a document. Filename keeps the workspace convention (no
  ordinal — TRACKING.md, retired 2026-08-29) over the skill's default.

### Pass 2: Gap Analysis — 2026-08-29

Verified every file:line the plan cites (all present as cited). Findings and the
additive fixes, all recorded in place with a *(Pass 2)* marker:

- **Factual gaps.** `invariants.test.js` pins write *shapes* by regex, so procedure
  writes would land unnoticed → 4a gains a `PROCEDURE_WRITES` assertion; Block is a
  record → counts 3→4 with `BLOCK_COLLECTION`; O5/O6 become 4a-iii candidates.
  `guest-surface` pins the vote selector alongside `no-downvote` → Phase 6 is 6a/6b/6c.
  `voteBox` has four callers, not "grep to find out". No DOM in `npm test` → the
  "CSS prerequisite commit" splits in Phases 3 and 11 were dead code by another name;
  both become suite-RED-first (3a/3b, 11a/11b/11c).
- **Resolved without probes.** D3 (fixtures carry both fields); Phase 1's skin risk
  (0 hits); Phase 8b's continue-stub risk (inside the container).
- **Dependencies added.** 4b ← O5, O8; 9 ← 4b, O2, O6; 7b ← 6c, O3; 11c ← 11b;
  13 ← 12b. No cycles. 12b's helper home decided (`components.js`).
- **Concurrency Map.** Still all-sequential — honestly: the test account is a shared
  external for five steps (now declared with invariants), and the two disjoint pairs
  found are not worth a worktree.
- **Reasoning check.** Holds. One tension surfaced: decision 3 lists "Mute words &
  tags" and Forage already has its own hashtag prefs (plan 2026-08-28-2) — O5 stays
  open and PHASE-GATED; the plan does not pick for the owner.
- **Not changed:** phase order, decisions, the branch grouping.
