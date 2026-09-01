# Changelog — Forage

What changed for a reader of `forage.fyi`. Forage deploys from `main` (Pages), so landing
*is* releasing: there is no unreleased window, and sections are months, each entry dated
by its landing. Per `CroftC/.claude/CHANGELOGS.md`, the branch that changes something a
reader runs adds its entry here before it lands. Started 2026-08-29; the August entries
below are the landings of that month, and everything earlier is in `git log`.

## 2026-09

- 2026-09-01 **The thread's guide lines meet again on a phone.** Under every reply that has
  replies of its own, a line runs down from the avatar and each child branches out of it into
  its own. On a narrow screen that branch was drawn eight pixels to the left of the line it was
  supposed to leave — a short hook hanging in the margin beside the rail rather than joining it,
  which is why a thread read as two sets of guides ignoring each other. On a desktop it had
  always been right, which is why it went unnoticed: the offset was a fixed number that only
  matched the wider indent. It is now derived from the indent, so the two meet at any width.
  Replies on a phone are indented exactly as before, and the branch there is a straight
  continuation rather than a curve: at that indent the reply's own avatar begins where the line
  comes down, and there is no room to curve into it without pushing deep replies off a small
  screen.
  (owner, on a phone frame: "why do these thread guides not line up?")

- 2026-09-01 **A reply shows what it is showing you.** A reply's picture, its video, its
  link card and the post it quotes never rendered in a thread here: the reply's words came
  through and everything else was dropped before any of it reached the screen. With words
  above it the loss was quiet — a sentence where bsky.app showed a sentence and a photograph.
  With no words it was total: a reply whose entire content is a picture, or a quote of
  somebody else's picture, drew a name, a timestamp and an empty row. All of it renders now,
  through the same stage, carousel, link card and quote card the feed and the post page
  already used, so a reply is worth the same as a post — the reader's picture-size and
  "pictures at once" settings included. A quote-response still shows no card for the post it
  quotes, because that post is the one directly above it.
  (owner, with a live example: "reply with an image that doesn't load")

- 2026-09-01 **A quote post shows what it quotes — the video included.** When someone posts a
  comment on top of somebody else's post, the feed used to show only the comment: a sentence
  like "is it so bad to expect our leaders to have a decent command of the English language?"
  standing over nothing, with no way to tell what it was about without opening the thread. Now
  the quoted post travels with it, in the feed and on the post page alike, and it brings its
  own picture, video or link card with it — the clip a quote post exists to point at plays
  right there, in place, instead of being invisible on one screen and absent on the other.
  Two smaller honesties came with it: a quote whose original has been deleted, blocked or
  detached now says so in a line of plain words rather than drawing an empty card attributed
  to "[unknown]", and quoting a *feed* (not a post) no longer draws a blank post card at all.
  The quoted author is named the way everyone else in the app is named, too: by the name they
  chose, with their handle kept in the tooltip and read out by a screen reader beside it —
  this card was the one place still printing a raw `handle.bsky.social` at people, and its
  author link now goes to their board here rather than out to bsky.app.
  (owner, with a live example: "we are not representing the quoted content … until you enter
  the post page, both in terms of showing what's being quoted and rendering the video", and
  "the name in the quote box … should be the human readable alias name")

- 2026-09-01 **A post's own words, as its author wrote them.** A news post — the kind with a
  link card under it — used to render its whole text as a large bold serif headline with every
  blank line squeezed out of it and the article's own address printed, unlinked, in the middle.
  On a phone that headline filled the screen and the card the post was about sat below the fold.
  Now the post's words are words: the author's paragraph breaks are kept, links, `#tags` and
  `@mentions` are live wherever they appear, and the trailing address is left off when the card
  right below already carries it in full. The same is true in the replies, which until now
  showed every link in a comment as dead text, and a link whose page has no picture finally
  gets a card of its own instead of vanishing. The counts move too: how many replies, reposts and
  likes a post has now sit on the same line as Reply, at the bottom of the post — they used to have
  a row of their own between the words and the picture, which split the post from the thing it was
  about. (owner: "our version of this post is much less readable", and "can we move the reply count,
  repost count and upvote count down to the line where the reply button is now?"; mock post-text v2)

- 2026-09-01 **One line down a repost, not two.** A post that quoted the thread's post used to
  carry two vertical lines: a coloured bar on its outer edge, plus the grey rail every comment
  with replies draws under its avatar — with the bar's indent pushing the whole node right of
  everything around it. Now the repost's own rail *is* the mark: the line under its avatar is
  drawn in the accent colour, and it is there whether or not anyone answered — running into the
  first reply's elbow when there is one, and stopping at the bottom of the repost otherwise. The
  outer bar and its indent are gone, so a thread reads as one column of lines and a repost still
  says plainly that it is one. (owner: "so many lines"; mock feed-row v14, decision 34)

## 2026-08

- 2026-08-31 **Bluesky videos play on Chrome again.** A clip on Chrome — on Android especially —
  put up its poster and then went to a broken-media symbol at 0:00, with nothing said about why.
  Forage was asking the browser whether it could play the video and believing the answer; Chrome
  147 says yes and then cannot. Forage now decides for itself which player a clip needs, so
  Chrome, Edge and Firefox all get the small player that actually plays these videos, Safari
  keeps playing them itself (and still downloads nothing extra), and a browser that promises more
  than it can do is quietly retried on the other player instead of leaving a broken box.
  (owner, live on forage.fyi; upstream video-dev/hls.js#7827)
- 2026-08-30 **Tags in the text, not twice; the row opens the thread; links, YouTube and video
  play in place; a Bluesky skin; "Open on" follows your provider; bigger names.** A post's #tags,
  links and @mentions are now live in its text on the board, and the chip row that repeated the
  tags is gone. The post's words are text (a link post's included) and a press on the row's own
  ground opens the thread, the way bsky.app's card does. A link's card stands its picture on the
  stage, centred, with the title, description and host under it; a **YouTube** link says so and
  plays in place on a press; a **Bluesky video** plays in place too (Safari natively; other
  browsers load a small player on the press). Settings → Skin gains **Bluesky** (light and dim) —
  bsky.app's colours, and the like is a heart there. The ⋯ menu's "Open on …" names your
  signed-in provider's app when it has one (today: bsky.app; Blacksky, EuroSky and Northsky
  are providers without a web app, so it still says bsky.app). Bylines read at the post's size.
  (mock feed-row v13, decisions 27–33; E's hashtags as option 1)
- 2026-08-30 **⟳ reposts, or quotes with a comment.** In a thread every post and comment carries
  ⟳ with one figure — reposts and quotes together, the way bsky.app counts it. Pressing it opens a
  sheet: add a comment and **Post** to quote it (a post of yours that shows this one; it appears
  under it here once the thread refreshes), or Post with nothing to repost it as it is. A post you
  already reposted offers **Remove repost**. (mock feed-row v12, decision 25)
- 2026-08-30 **Reply at the bottom of the post; a quote's bar on the quote only; Browse hides
  the dead by default.** In a thread, **Reply** now sits at the bottom right of the post, under
  its picture and its quote; the like row stays under the text with the like at its right. A
  post that quoted the thread's post keeps its coloured left bar, but the replies under it no
  longer share it — they thread like any reply. **Browse feeds** starts with *Hide inactive*
  on for the popular list too (that day 46 of 111 were stale, empty or not answering); the line
  says how many went, and unchecking brings them back. (mock feed-row v11, decisions 23–24, 26)
- 2026-08-30 **The post under your pointer lights up.** On a desktop, moving the mouse over a
  post no longer underlines its text; the whole row takes a subtle highlight instead, the way
  bsky.app and reddit do it, in every skin's own colour. Phones are unchanged — a tap never
  leaves a row lit. (mock feed-row v10, decision 22)
- 2026-08-31 **The thread opens with who wrote it; the reply box is Bluesky's shape.** A thread's
  top line is now the author — picture, chosen name, provider mark, time — with the board's
  `f/…` link at the right; the like row keeps the reply count and Reply. On the reply page the
  box has Cancel · Send on top, **image · GIF · emoji** at the bottom left (images need alt text
  before Send; GIF takes a .gif from your device) and the **300-character count with a ring** at
  the bottom right. The box above a feed reads **39.4k likes · Curated by @bsky.app** on one
  line — the curator a link to their bsky.app profile — with the description under it, and
  is outlined. The `f/…` line under every post on a Bluesky board is gone (it named the board
  you were already on). A profile page (`/u/handle`) has **Follow**. In a thread, a comment's
  **like sits on its action row** beside Reply and share, not in the margin. (mock feed-row v9)
- 2026-08-30 **Two picture skins: Surf and Nebula.** Settings → Skin now offers **Surf** (sand,
  a sunset band with a line of foam along its edge, ocean-blue links; *night swell* after dark)
  and **Nebula** (a starfield with violet and teal nebula veils, an indigo-to-teal band, a soft
  cyan glow on the wordmark; *observatory* on the light side), each with both sides. These are
  the first skins that carry artwork, not only colour — and the artwork never sits under text:
  cards stay solid, and every colour in a band or page gradient is checked against the text on
  it. (plan 2026-08-30-plan-warm-skins § Graphical skins) [device: android]
- 2026-08-30 **Five new skins, each with a lighter and a darker side.** Settings → Skin
  now offers **Rosewater** (blush paper and raspberry links; plum after dark), **Lavender**
  (lilac and violet; twilight after dark), **Apricot** (cream and terracotta; espresso
  after dark), **Seaglass** (mint and white with a coral hover; deep water after dark) and
  **Cornflower** (the phpBB blue on white cards and sky-tinted paper, rounded rather than
  squared; midnight after dark), beside the four styles already there — the classic phpBB
  board included, unchanged. The ☾/☀ control switches sides on all five. The four warm ones
  are inspired by the pink, purple, orange and mint styles of the classic phpBB era, not
  copied from any of them, and every text pairing in every one clears AA. Also repaired:
  on Usenet gray after dark, a removal notice was painted in a red meant for a light page
  (1.93:1); it is now legible. (plan 2026-08-30-plan-warm-skins) [device: android]
- 2026-08-30 **The feed row agrees with the phone.** A post's picture now shows in the feed at
  both densities — Compact (the phpBB skin's preference) had dropped it and shown a 40px
  thumbnail or nothing, while the thread page showed the picture. A Bluesky post's text is set
  as text, not a bold heading, on the row and at the top of its thread. The action row is
  Bluesky's: replies · reposts · like · share in four equal cells, so it stays one line under
  four-digit counts and lines up row to row; the like sits where the heart does and loses its
  box; the replies cell shows the number, with "270 comments" as its name for a screen reader
  and a hover. On an author board a row's breadcrumb reads `@handle` and opens that board
  (`f/pds.ls` opened "Unknown feed"). Bylines show the **name a person chose** — the handle
  is the name's tooltip, and shows when no name was chosen — with a small **provider mark**
  beside it (the butterfly for a bsky.social account, an atmosphere ring otherwise);
  Settings → *Provider mark* switches the mark off. The share control's glyph is the
  tray-and-arrow icon, not the small ↗. **Replying is a page:** the thread's Reply sits at the
  right of the like's row and opens `/reply`, with the post you are answering above the box;
  under a comment, Reply drops a simple box — Send or Cancel. **A reply you started is kept
  in this browser** until you send or discard it (it survives Cancel and a reload). The dashed
  `DL-010` / `DL-011` chips over a board are gone — they belonged to the divergence ledger,
  not to readers. The board's sort now reads **Default** · Hot · New · Top ("Feed order" was
  the ledger's word for it). (mock feed-row v5, from the owner's 2026-08-30 phone screenshots; plan
  pending on the captures)
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
