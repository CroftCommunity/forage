# Plan: the feed row and the thread head under a pointer — lit rows, Reply at the bottom, the quote's own bar, repost-or-quote, and Browse hiding its dead

date: 2026-08-30
status: Phases A–B BUILT (F–K filed 2026-08-30 evening, owner's screenshots of bsky.app and the ⋯ menu) on `claude/feed-row-hover` (worktree `worktrees/feed-row-hover/forage`); C in progress; D–E open. Landing via PR — the owner merges.
repo: `CroftCommunity/forage`
baseline: `main` @ `ad29be5` (feed-row v9 landed)
mock: `plans/mocks/feed-row.html` v10 → v11 (decisions 22–26, O12); F–G are decisions 27–28, drawn when built. The mock is the record (MOCKS.md P3); this file is the order the promises get kept in.
parent: plan `2026-08-29-plan-post-and-thread.md` (the head, the quote as a walled comment) and feed-row v1–v9 (Bluesky's row as the reference).

## Problem Statement

Five things the owner saw on 2026-08-30, in one sitting, on the desktop and the phone:

1. > "we give a mouseover underline … bsky and reddit both give a subtle highlight to the
   > moused over card and that's a better model … we'll have to bake a representation into
   > every skin"

   The global `a:hover` underlined a row's text; nothing said which row the pointer was on.
2. > "I don't love how we extract every hashtag and present it under and have it in the
   > original, it's not helpful and it's confusing"

   A text post's tags sit in its text AND as a chip row under its picture (13 chips on the
   post that prompted it).
3. > "move the reply button to the bottom of this top post comments page section … just reply
   > alone, like should be top towards the right"

   On a post with a continuation and a quote, the like row — Reply on it — sat between the
   text and the rest of the post.
4. > "I only want the pronounced left side quote bar on the actual repost not on all of its
   > comments, they can thread just like a normal comment"

   The quote's wall was a border on the node, so it ran down every reply threaded under it.
   And ⟳ on a quote only toggled a plain repost — the owner wanted what bsky.app's ⟳ offers:
   > "the same button for us should just popup with a dialogue that allows us to add
   > commentary or not and if we hit post without then it's just a plain repost"
5. > "let's make the hide inactive on browse all feeds the default"

   Browse feeds hid dead feeds only on search; on the popular list that day 46 of 111 were
   stale, empty or silent (30 / 3 / 13) and every one was listed.

Verified against the network before designing 4: jcsalterego's post is the root, funkelly's
post is a **quote** of it (`app.bsky.embed.record`, 2 reposts, 0 quotes, 1 reply), and
matrixman124's post is an ordinary reply to the quote — the screenshot's shape exactly. A
Bluesky *repost* is contentless and appears in no thread; a *quote* is a post with the
record embedded and does. bsky.app's ⟳ shows the two counts summed
(`social-app/src/components/PostControls/index.tsx`: `repostCount + quoteCount`, read 2026-08-30).

## Approach

One branch, one mock revision per decision batch, each promise held by a claim in the gate
before it is built (RED first), the frames captured from the engine (MOCKS.md P1/P2).

| Phase | Decision | What | Held by |
|---|---|---|---|
| A | 22 | `.postrow:hover` paints `--row-hover`, fenced by `(hover: hover)`; the title link stops underlining; every skin declares its own value, graded (≥ 3 L*, ≤ 12 L*, AA) | mock-board claim 27; `test/skins.test.js` "EVERY skin bakes its own row hover" |
| B | 26 | Browse feeds: Hide inactive ON by default for the popular list too; the count line says what went | `signin.workflow` "hide-inactive defaults ON for browse" |
| C | 23 | The head's Reply alone moves to the bottom of the head, right-aligned, under picture · continuation · quote; the like row stays under the text, like at its right end | mock-thread — decision 23 block |
| C | 24 | The quote's wall is an element over its own three rows; replies thread beneath it unwalled | mock-thread — decision 24 block; `bluesky-view` wall measure |
| D | 25 | ⟳ on any node opens a sheet: optional words, one Post — words → a quote post (shows under the node it quotes, with the tell); none → a plain repost; Remove repost when already reposted. The count is reposts + quotes, bsky.app's figure | a mock-thread claim per outcome; `test/invariants` on the write ledger |
| F | 27 | A **classic Bluesky** skin: bsky.app's dark palette (near-black blue-grey ground, the #1083FE accent, white ink, the heart for the like) — and, the owner's word, "we can even make the upvote a heart in this case": the like's glyph becomes a token a skin may set (`--like-glyph`, default ▲), since a skin restyles and restructures nothing (SKINS.md) | `test/skins.test.js` (the registry, AA, the hover grade); a `skins` workflow claim that the glyph follows the token |
| G | 28 | "Open on bsky.app" in the ⋯ opens on the app of the reader's **signed-in provider** when the provider registry names one, and on bsky.app otherwise — the menu item says which. Needs the registry to carry an app URL per provider (DESIGN.md: the probed provider registry); which providers have one is a probe, not a guess (CLAUDE.md § External APIs) | `test/lens-intake` or the menu workflow — the href per provider |
| H | 29 | A YouTube link post **plays in place** and is clearly YouTube: the external card carries the YouTube mark and the video title, and a press swaps the thumbnail for the embedded player (youtube-nocookie, no autoplay) instead of leaving Forage — bsky.app's behaviour (owner's screenshots). Nothing loads from YouTube until the press: a thumbnail is a third-party fetch too, so the card shows the post's own preview image first | `bluesky-view` — the external card for a youtu.be link: the mark, the title, the iframe only after the press |
| H | 29 | A YouTube link post **plays in place** and is clearly YouTube: the external card carries the YouTube mark and the video title, and a press swaps the thumbnail for the embedded player (youtube-nocookie, no autoplay) instead of leaving Forage — bsky.app's behaviour (owner's screenshots). Nothing loads from YouTube until the press: a thumbnail is a third-party fetch too, so the card shows the post's own preview image first | `bluesky-view` — the external card for a youtu.be link: the mark, the title, the iframe only after the press |
| I | 30 | A **native Bluesky video** (`app.bsky.embed.video#view`) plays in place — today the stage's play button opens the post on bsky.app. Bluesky serves HLS (`playlist` m3u8 + thumbnail); Safari plays HLS natively, Chromium and Firefox need hls.js — a new dependency, so SUPPLY-CHAIN.md's ladder first (DECISIONS.md grep, osv, the allowlist) before any code. The player is the native `<video>` with controls, the thumbnail as poster, nothing fetched until the press | `bluesky-view` — the video stage: poster from the view, `<video>` only after the press, the playlist URL on it |
| J | 31 | The **external link card** (a link to a book, owner's screenshot): the preview picture sits centred and contained in its frame rather than pinned to an edge, with the title, description and domain under it — bsky.app's card. Measured on the owner's example before drawing | `bluesky-view` — the external card's picture is centred in its frame; the title and domain are under it |
| K | 32 | The row's **byline is a step larger** (owner: "bump the size up on the top left author attribution too"): the chosen name at the body size and weight 600, the mark and time beside it — bsky.app's byline is 15px bold on a 15px post. Today it is `--t-xs` (13px). Measured under the v2 load (the 64-grapheme name, the 30-character handle) so the line still holds at 390 and 320 | mock-board — the byline's computed size ≥ the post text's; the one-line claims already there |
| E | O12 | The hashtags: (1) no chip row, tags stay in the text as links; (2) fold a trailing tag run into the chips; (3) chips only. Recommended 1. **Awaiting the owner's pick.** | — |

Captures: `scripts/mock-snaps.mjs` — `board-lens-hover` (desktop only, A) and `thread-lens`
(both viewports, both columns — the fixture's root gained a picture for C, which is a new
population for Current too).

## Reasoning

- **Per-skin hover value, not a universal overlay.** A `color-mix` of the ink at 5% would
  light every skin without a token, but a skin author could not choose it, and the owner
  asked for a representation in every skin. The token is graded so a skin cannot declare an
  invisible or a selection-strength value.
- **Reply alone moves; the like row stays.** Considered moving the whole row (bsky.app's
  shape); the owner chose Reply alone, like at the top right. Recorded as decided.
- **The wall as an element, not a border.** A border on the node is the cheapest wall and is
  wrong by construction once the node has children. A grid item spanning the node's own rows
  has exactly the extent the owner drew.
- **One sheet for repost-or-quote.** bsky.app's ⟳ is a menu (Repost / Quote); ours is a
  sheet with an optional box because the owner asked for it that way, and the native
  `<dialog>` sheet is the ONE recorded exception to "pages, not modals" (DESIGN.md).
  A quote is a write to the owner's account: its own commit, its own claim, checked against
  the test account, never the owner's.
- **Hide inactive ON everywhere.** The search default already existed because a third of
  results were dead; the popular list measured 41% the same day. The line still says how many
  went and why; the box still turns it off.
