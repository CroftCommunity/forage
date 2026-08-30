# Plan: posts, threads, and the ⋯ menu

**Status:** drafted 2026-08-29, not started. Four phases; none begun.
**Origin:** owner session 2026-08-29 — Reddit (web + Android) and Bluesky screenshots
studied against Forage as it renders, worked through twelve revisions of a mock, and
**ten decisions locked on `plans/mocks/post-and-thread.html` v12** (landed `b091566`).
The mock is the picture; this is the why and the order. Where they disagree, the mock
v12 wins on *what it looks like* and this plan wins on *what is built first*.
**Branch:** `claude/thread-plan` (this doc); execution branches per phase.

---

## Problem Statement

A Forage thread does not read the way a Reddit or Bluesky thread reads — who said what,
what answers what, what is a repost — and on a phone it has more things to tap by
accident than on purpose. Concretely, as measured on the memory-mode demo thread
(`plans/mocks/snaps/thread.phone.png`, baseline `forage@9eb0074`):

- **Every comment carries the collapse gutter**, so a flat list of forty direct replies
  to the post looks nested under nothing, and the whole left edge is a 24px button
  (`.gutter`, `css/app.css`) that a scroll on a phone hits.
- **The vote is a 13px `▲` beside a number** (`miniVote`, `js/ui/components.js`) — two
  implementations of one idea (`voteBox` is the other), neither readable at a glance.
- **A quote-response renders no controls at all** (`quoteNode`, `js/ui/lens-views.js`):
  no like, no reply, no repost, and a tinted box that reads as tappable and is not.
- **There is no ⋯ menu.** Save / report / mute / block are bare text buttons in the
  action row (`commentNode`), report is a `prompt()`, and mute/block do not exist.
- **Avatars are absent** on posts and comments, and the masthead draws initials by
  design (`js/main.js` E144).
- **"Best" and "Top" order a thread identically.** `confidence()` in
  `js/engines/rank.js` was Wilson on likes/(likes+downs); with downvotes retired (plan
  2026-08-27-1) it reduces to `1/(1+z²/n)`, strictly increasing in likes. The tab
  promises something the number no longer delivers.
- **A comment has no address.** The memory continue-stub writes `?focus=<id>` that
  `threadView` never reads; on the lens `/p?uri=` of a reply would open it as an orphan
  root (`getPostThread(uri, depth 10)`, nothing rendered above the head).

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
   never discoverable on a phone and cost mis-taps. **This retires the §3.3 "signature
   collapse gutter" deliberately** — a later session that finds §3.3 in the spec and
   "restores" it is undoing a decision, not fixing a regression. *Not taken:* keep the
   gutter from depth 1 with a smaller hit area.
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
   "open its thread ↳" (the ⋯ has Open on bsky.app; F gives it an address).
6. **Haptics on by default** — `navigator.vibrate(12)` on like and promote, nothing on
   un-like, one settings switch. iOS Safari has no vibrate API: it degrades to nothing,
   never a sound or a toast.
7. **Time is bare** — `1d`, `5h` — next to the name.
8. **Avatars are real.** Every avatar on posts and comments is the account's picture
   (the lens already carries `avatar` on profiles and feeds); the masthead's initials
   stand-in becomes the not-yet-loaded state only. *This reverses E144's stand-in*, which
   was chosen for cost ("drawing initials costs no request, cannot flash in late") — the
   owner now wants the picture, and the loading-state initials keep the no-flash property.
9. **Sort is one control bar, not tabs, on boards and threads** — `Sort ▾` and `From ▾`
   pills adapted from the lens `boardToolbar` selects, every sort on every board whatever
   its age (Reddit withholds; we don't). **Best is redefined** — see O1.
10. **Deep links, Reddit's shape:** every comment has a permalink; the share glyph copies
    it; opening one renders the whole thread, scrolls to the comment, tints it briefly,
    expands its ancestors, and shows a "viewing one comment — see the whole thread" bar.
    *Not taken:* bsky.app's shape (reply as head with parents above) — it makes "the
    thread" mean two different pages, and the forum framing wants one.

Cross-cutting: **every comment's ⋯ is top-right**, where the post's is; **Reply is a return
arrow**, the speech bubble means only "open the comments"; **Repost on a quote is the glyph
alone**; **share is a quiet glyph at the bottom-right of every comment**, 55% until
hover/focus, full 36/44px hit area.

## Verified assumptions

Measured in this session, not remembered:

- `confidence(n)` is monotonic in `n` once downs are gone — algebra on
  `js/engines/rank.js:37-46`; Best ≡ Top on every thread.
- `threadView` (`js/ui/views.js`) reads no `focus` parameter; the only `focus` in the
  file is the mod-queue's j/k cursor.
- `quoteNode` renders byline, body and "open its thread" and nothing else.
- The six skins reference neither `.vote.boost` nor `.gutter` (grep: 0 hits each) — the
  "six skins style it" note in `components.js:73` is a claim the skins do not bear out.
  They set `--boost`; the new controls should read that token and nothing else.
- Bluesky bookmarks are XRPC procedures with no record type (`docs/LEXICON-REGISTER.md`).
  **Not yet verified:** the three procedures against the live lexicon — nothing in the
  repo calls them. Phase 1 writes the probe before the code (External APIs rule).
- `npm test` is the declared gate (`AGENTS.md` § 201); 598 pass at `b091566`.

## Phases

Each phase: RED-first per CLAUDE.md, a `CHANGELOG.md` entry under the current month
before landing (CHANGELOGS.md), `scripts/mock-snaps.mjs` re-run after landing so the mock's
"today" moves with the tree, and an axe + mobile-fit pass (every phase touches layout).

### Phase 1 — the header line, real avatars, and the ⋯ menu (decisions 3, 4, 7, 8)

- `postRow` / `commentNode` / `quoteNode` gain the byline (avatar · name · time · ⋯);
  bare time format in `timeAgo` callers.
- One menu component (`js/ui/menu.js`), popover/sheet by viewport, groups declared as
  data so the steward group and the Delete/Report swap are data, not branches.
- Real avatars: `shapePost` / thread shaping carry `avatar`; masthead fetches the
  session's profile picture with initials as the loading state.
- Save via `app.bsky.bookmark.*` — probe script first, printing the raw response.
- Mute thread / mute account / block account as the atproto preferences and records they
  are; Hide for me local. Report becomes a sheet.
- **Write-set:** `js/ui/components.js`, `js/ui/lens-views.js`, `js/ui/menu.js` (new),
  `js/substrates/lens.js` (bookmarks, mutes), `js/main.js` (masthead), `css/app.css`.
- **Gates that notice:** `e2e/guest-surface.workflow.mjs` (a signed-out reader sees no
  menu items they cannot use), `e2e/a11y-skins.workflow.mjs`, `e2e/density.workflow.mjs`.

### Phase 2 — threading, the vote unit, haptics (decisions 1, 2, 5, 6)

- The rail: parent avatar column draws the line; each child draws its own elbow into its
  avatar; `pointer-events:none` on all of it. Depth 0 has no rail.
- ⊖/⊕ on the action row; the `.gutter` element and its CSS are **removed**, and
  `scenarios/comment-tree-collapse.js` is rewritten to the new control (it will go RED —
  that is the point; do not keep both).
- **One vote implementation.** `voteBox` and `miniVote` fold into one component with two
  layouts (pill; count-over-arrow). `e2e/no-downvote.workflow.mjs` already visits both a
  row and a comment, so it is the regression net.
- Haptics: `vibrate(12)` in the vote component's optimistic flip; a `forage.haptics`
  preference, default on, one switch on `/me`.
- Quote node: wall on the outer edge, avatar header, full row (like unit, Reply, ⟳, share).
- **Write-set:** `js/ui/components.js`, `js/ui/lens-views.js`, `css/app.css`,
  `scenarios/comment-tree-collapse.js`, `e2e/no-downvote.workflow.mjs`, `js/ui/views.js`
  (`/me` switch).
- **Mobile-fit:** the phone frame at 390 with three levels of nesting (22px per level)
  must not overflow; measure element geometry, not `scrollWidth` (MOBILE-FIRST.md).

### Phase 3 — the sort bar, and what Best means (decision 9; O1 first)

- Blocked on **O1**. Once decided: one `sortBar` component replacing `tabs()` on boards and
  threads and `boardToolbar`'s sort/timeframe selects on the lens; density and preview
  size stay at its right end on the lens board.
- Every sort on every board; timeframe list unified (the memory tier has `hour`, the lens
  does not — one list).
- **Write-set:** `js/ui/views.js`, `js/ui/lens-views.js`, `js/engines/rank.js` (Best),
  `js/selectors.js` (thread sort default), `test/` for rank.

### Phase 4 — deep links (decision 10)

- Memory: `threadView` honours `?focus=<id>`; lens: `/p?uri=<post>&focus=<reply>`, and a
  bare reply uri resolves by walking `reply.root` from the record.
- Landing: scroll, tint (`--tint`, fading ~2s), ancestors expanded, siblings collapsed to
  ⊕, the "viewing one comment" bar.
- Share on a comment and "Copy link" in its ⋯ copy this link.
- **Write-set:** `js/router.js`, `js/ui/views.js`, `js/ui/lens-views.js`,
  `js/substrates/lens.js` (root resolution), `css/app.css`.

## Open questions (gates inside known work — TRACKING.md)

- **O1 (blocks phase 3): what Best means without downvotes.** Three candidates on the
  mock: Wilson on likes/(likes+replies); Hot applied to comments (likes with decay);
  retire the word and default threads to Top. Owner's call; the rank test suite is where
  the chosen formula gets its RED.
- **O2 (phase 2, non-blocking): Repost on plain replies too?** On Bluesky a reply is a
  post and repostable; the mock shows ⟳ only on quotes. Cheap to add, busier row.
- **O3 (phase 2, non-blocking): haptics under `prefers-reduced-motion`?** It is not
  motion, but some people set it for exactly this. Default proposal: respect it.
- **O4 (phase 1, non-blocking): the loading-state avatar.** Initials (keeps E144's
  no-flash property) vs a neutral silhouette. Default proposal: initials.

## Review Log

- 2026-08-29 — drafted from mock v12 after the owner locked all ten decisions.
