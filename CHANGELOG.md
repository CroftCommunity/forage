# Changelog — Forage

What changed for a reader of `forage.fyi`. Forage deploys from `main` (Pages), so landing
*is* releasing: there is no unreleased window, and sections are months, each entry dated
by its landing. Per `CroftC/.claude/CHANGELOGS.md`, the branch that changes something a
reader runs adds its entry here before it lands. Started 2026-08-29; the August entries
below are the landings of that month, and everything earlier is in `git log`.

## 2026-08

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
