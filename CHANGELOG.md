# Changelog — Forage

What changed for a reader of `forage.fyi`. Forage deploys from `main` (Pages), so landing
*is* releasing: there is no unreleased window, and sections are months, each entry dated
by its landing. Per `CroftC/.claude/CHANGELOGS.md`, the branch that changes something a
reader runs adds its entry here before it lands. Started 2026-08-29; the August entries
below are the landings of that month, and everything earlier is in `git log`.

## 2026-08

- 2026-08-30 **Four warmer skins, each with a lighter and a darker side.** Settings → Skin
  now offers **Rosewater** (blush paper and raspberry links; plum after dark), **Lavender**
  (lilac and violet; twilight after dark), **Apricot** (cream and terracotta; espresso
  after dark) and **Seaglass** (mint and white with a coral hover; deep water after dark),
  beside the four styles already there. The ☾/☀ control switches sides on all four. They
  are inspired by the pink, purple, orange and mint styles of the classic phpBB era, not
  copied from any of them, and every text pairing in every one clears AA. Also repaired:
  on Usenet gray after dark, a removal notice was painted in a red meant for a light page
  (1.93:1); it is now legible. (plan 2026-08-30-plan-warm-skins) [device: android]
- 2026-08-30 **A link to a reply lands on it, and a board row's name holds its line.** Opening
  a link to a specific reply in a thread now scrolls to that reply and keeps it marked, even
  when the thread also has quotes (before, the page said "Viewing one comment" and sat at the
  top). On the board, a long Bluesky handle no longer wraps a post's byline onto two lines.
  (plan 2026-08-29-plan-post-and-thread / board-cards, mock v20 / v9 — the captures pass)
- 2026-08-30 **A reply's name holds its line, and every reply offers Reply.** In a thread, a
  long Bluesky handle no longer wraps the byline onto two or three lines and pushes the ⋯
  down with it: the name shortens with an ellipsis and the time and ⋯ stay where they are.
  Every reply and quote in a Bluesky-view thread now has ↩ Reply on its action row, and the
  composer opens under the one you answered (before, only the post itself offered Reply).
  (plan 2026-08-29-plan-post-and-thread, mock v18 — the alignment pass)
- 2026-08-30 **Content languages follow your browser until you choose.** A fresh device
  now filters boards to the languages your browser asks for (among the eight Forage lists;
  a browser asking for others filters nothing), the board still says how many posts that
  hid, and the settings card names what it picked. Ticking a box or pressing *Show every
  language* makes it your choice, and that choice sticks across reloads — it no longer
  falls back to the browser. (claude/browser-langs)
- 2026-08-30 **The column and the rail.** The page is a 680px column of posts with a slim
  navigation on the left and a quieter panel on the right — suggestions, feeds, and the
  sign-in card when you are signed out; nothing sold. Settings → *Side panel* turns the
  panel off, and the column takes the middle. On narrower screens the panel folds under the
  posts; on a phone the sign-in card leads and the suggestions follow. (plan
  2026-08-29-plan-board-cards, branch C)
- 2026-08-29 **Pictures stand on a stage.** A picture in a card fills the card's width on a
  framed stage — centred, whole (never cropped), a blurred copy of itself behind it, black
  bands for video — instead of a small thumbnail in a half-empty tile; the frame is sized
  before the picture loads, so the board does not jump. The preview-size slider is gone: a
  **card size** of 1–4 (on the board's toolbar and in Settings) sets how much room a post
  takes, 4 being the full stage. A post with more than one picture is a carousel (dots,
  arrows, swipe, arrow keys, and it says "picture 2 of 4" to a screen reader); Settings →
  *Pictures shown at once* raises how many stand side by side in a grid before they fold.
  (plan 2026-08-29-plan-board-cards, branch B)
- 2026-08-29 **The board's small honesties.** Signed out, the like count is a pill you can
  press: a person glyph instead of the arrow, "Sign in to like" on hover, and a tap opens the
  sign-in sheet instead of doing nothing; the ⋯ on every post and comment ends with *Sign in
  to like, save and reply*. Every post now carries the same ↗ share as a comment, last on its
  action row, beside a replies pill that opens the thread and a repost count. The
  Card/Compact dial wears the sort bar's pill dressing in the same row. And the top bar is
  pinned — it stays put while the board scrolls under it (it was meant to since the first
  version; the rule had nowhere to stick). (plan 2026-08-29-plan-board-cards, branch A)
- 2026-08-29 **A reply's arrow likes again, from the middle of the reply.** In the Bluesky
  view, signed in, pressing the count-over-arrow under a reply's avatar did nothing — it was
  the read-only count wearing the button's clothes, and a second press could not have
  un-liked anyway (the reply carried no like rkey). Now it is the same real like the post's
  pill is, both ways. The stack also moved from the bottom of the avatar column to the
  vertical middle of the reply's body. And shrinking the window past the sidebar breakpoint
  no longer leaves the sidebar sitting open as an undimmed drawer — it closes until you
  press ☰. Opening a post from a board now lands at the top of the thread instead of at
  the board's scroll offset. And an author's picture is their picture — not their picture
  under two initials. (claude/thread-vote)
- 2026-08-29 **Every comment has an address.** The small ↗ at the end of a comment's action
  row (and the ⋯ menu's Copy link) copies a permalink; opening one shows the whole thread
  landed on that comment — marked, its ancestors open, its siblings folded, with a
  "viewing one comment — see the whole thread" bar. In the Bluesky view a pasted reply link
  now opens its thread from the top, focused on the reply, instead of the reply alone.
  (plan 2026-08-29-plan-post-and-thread, branch E)
- 2026-08-29 **Threads read like threads.** The full-height collapse gutter is gone: a
  comment's replies hang off its avatar on a rail, each reply drawing its own elbow, and a
  comment that has replies carries one ⊖ on its action row (⊕ *n replies hidden* when
  folded). A direct reply to the post has no rail at all. The vote is one control — a
  `▲ 35` pill on posts, a count-over-arrow pill under a comment's avatar — that presses
  like a button and reads as a plain count when you cannot vote. A like buzzes on phones
  that can (Settings → Buzz on like; off with reduced motion). A quote-response is a
  walled comment with the same header and controls, plus a ⟳ that really reposts. (plan
  2026-08-29-plan-post-and-thread, branch C)
- 2026-08-29 **The ⋯ menu.** Every post row and comment has one — a popover on a desktop, a
  bottom sheet on a phone. Copy text · Copy link · Open on bsky.app · Save, then Mute thread
  · Mute words & tags, Hide for me, Mute account · Block account · Report. Save is your
  Bluesky bookmark (private, server-side); Mute words writes your Bluesky muted-words
  setting; Hide is this device only; Report goes to your moderation service through a
  sheet, not a `prompt()`. A signed-out reader sees the three things anyone can do. On the
  memory demo the same menu holds Save · Report and the steward actions. Save, Report and
  the steward buttons left the comment action row. (plan 2026-08-29-plan-post-and-thread,
  branch B)
- 2026-08-29 **Posts and comments open with a byline** — the author's picture (initials
  until it loads, or when the account has none), their name, a bare time (`1d`), and a
  ⋯ slot top-right, the same on a board row and on every comment; the masthead's account
  control shows your real picture. The ⋯ does nothing yet — its menu is the next
  landing. (plan 2026-08-29-plan-post-and-thread, branch A)
- 2026-08-29 The sign-in sheet's front page is the servers you can join from here — Bluesky,
  Blacksky and, new, EuroSky (`eurosky.social`, open signups). Invite-only servers
  (Northsky) moved behind **Another provider**, next to the handle field, still with Sign
  in. The sheet asks you to choose your *atmo* provider, and glosses the word.
- 2026-08-29 Records are validated against their lexicon on read-back, because a real PDS
  accepts a `fyi.forage.tagsub` record missing every required field with a 200 — a lexicon
  binds the app that wrote it and nobody else (W17).
- 2026-08-29 A hashtag subscription can be private or public, chosen per tag (P5).
- 2026-08-28 Ring boards separate Posts · Replies · Reposts, and a reply links its parent.
- 2026-08-28 The literal `[image]` placeholder is never printed where the media can show.
- 2026-08-28 The ring ladder is a left nav, and `/` follows a landing rule.
- 2026-08-27 Counts read as English; auto-collapse is retired and the score is what it is —
  likes; downvotes are gone from both populations (DL-011 retired).
- 2026-08-27 The skin picker is family-shaped — one identity per row, light and dark as
  entries, the ☾/☀ control visibly disabled where a family has one palette.
- 2026-08-27 The signed-out front door — sheet, hero, an emblem sized for a phone — and the
  guest surface hides what a reader cannot use.
- 2026-08 Hashtag discovery in four phases: trending (derived from the trending feeds,
  cached hourly), each hashtag section on its own page, a bounded word cloud, and
  hashtags become joinable — local today, `fyi.forage.tagsub` tomorrow.
