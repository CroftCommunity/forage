# Plan: ring board kind tabs (posts · replies · reposts)

**Status:** **COMPLETE 2026-08-28.** All four phases shipped; execution notes in the Review Log.
**Origin:** owner request, 2026-08-28, with a screenshot of `/r/me` signed in: *"I would
like to separate out posts, replies (where I want a link to the comment being replied to
above it), and reposts — in a 3 tab row at the top of this feed page. this is the just me
ring page logged in."*
**Branch:** `claude/feed-tabs-posts-replies-reposts-pg7yzl`.

---

## Problem Statement

A ring board (`/r/:rung`) fans out `app.bsky.feed.getAuthorFeed` per member and renders
every item as a plain post row. But an author feed item is an **envelope** —
`{ post, reply?, reason? }` — and `shapeLensFeed` reads only `item.post`, so:

- **Replies render as posts.** The owner's screenshot shows it: "Thanks! Took that out on
  the trail…" is an answer to somebody, rendered with no parent in sight. The reader
  cannot tell a post from a reply, and cannot reach the conversation the reply belongs to.
- **Reposts render as posts by their original author.** `reason`
  (`app.bsky.feed.defs#reasonRepost`) is dropped, so nothing says the ring member merely
  repeated it — and the merge sort orders a repost by the *original* post's `indexedAt`,
  sinking a fresh repost of an old post to the bottom of the board.

## Reasoning

- **The envelope must survive shaping.** Policy lives in the substrate (invariant 2), so
  the classification — post / reply / repost — is a pure function over the feed item,
  exported and unit-tested, and `shapeLensFeed` spreads its result onto the shaped post.
  Every caller (feed boards, ring fan-out, the ring's progressive `onPage` paint) gets the
  same annotation for free; surfaces that ignore it are unchanged.
- **Tabs are a view concern, client-side over the loaded window.** Like `boardSort`, the
  active tab is per-page-load view state. Filtering happens over posts already fetched —
  the fan-out is unchanged, no new XRPC surface, no new writes (the invariants table is
  untouched). An empty tab says it is empty *of the loaded posts* and offers More, the
  same honesty rule as the window sort.
- **Reply context is a link, not a fetch.** `getAuthorFeed` already delivers the parent
  post view in `item.reply.parent` (author + text). We render one line above the reply —
  "↩ replying to @handle: “excerpt”" — linking to `/p?uri=<parent>`, the thread route,
  where the conversation actually lives. When the parent arrives as
  `notFoundPost`/`blockedPost` (uri only) the line still links, without the excerpt;
  a bare post that only carries `record.reply` classifies as a reply the same way.
- **Repost ordering follows the network.** With `reason` in hand, the merge key becomes
  `reason.indexedAt ?? post.indexedAt` — the repost *action* time, which is how the
  network itself orders an author feed. The reposts tab reads newest-repost-first instead
  of oldest-original-last.
- **All rungs, not just `me`.** The tabs ride `ringBoard`, so every rung gets the same
  chrome. `fol` (timeline) and `world` (composition) flow through `shapeLensFeed` too, so
  their envelopes annotate identically. Feed boards (`/f/`) keep their existing toolbar —
  this is ring chrome, where the owner asked for it.

## Verified assumptions

- `getAuthorFeed`/`getTimeline` items carry `reply.parent` as
  `app.bsky.feed.defs#postView` (or `notFoundPost`/`blockedPost`) and `reason` as
  `#reasonRepost` with `by` + `indexedAt` — per the lexicon
  (`app/bsky/feed/defs.json`: `feedViewPost.reply`, `reasonRepost`) and live behavior
  (bsky.app renders "Reposted by" from `reason.by`, orders by repost time).
- `shapeLensFeed` is the single funnel for every board the ring renders ('me'/'mut'/'hop'
  fan-out at `ringFeed`, 'fol' via `feed({kind:'timeline'})`, 'world' via `feed(...)`),
  plus the ring's own `onPage` fast path, which shapes items directly and needs the same
  spread.

## Phases

1. **RED → GREEN: substrate.** `feedItemMeta(item)` pure export + spread in
   `shapeLensFeed` + the `onPage` path + the repost-aware merge key. Unit tests in
   `test/lens-item-kinds.test.js`; ring passthrough asserted in `test/lens-rings.test.js`.
2. **RED → GREEN: view.** Tab row (`.ring-tabs`, three buttons, `aria-pressed`,
   default Posts) at the top of `ringBoard`; per-tab filtering incl. the progressive
   paint; reply-context line above reply rows; repost byline above repost rows; honest
   empty-tab wording. CSS in `css/app.css` (css-classes gate covers the literals).
3. **Workflow journey (invariant 6b).** `e2e/ring-tabs.workflow.mjs`: signed-in `/r/me`
   over a shim feed carrying one post, one reply (parent postView), one repost —
   asserts tab row present, per-tab membership, the parent link's href, the repost
   byline, and that switching back to Posts hides both.
4. **Gate.** `npm test`, `npm run conformance`, `npm run workflows`; acceptance triad on
   the ring screen (signed-out `/r/me` still renders the prose gate; tabs never render
   signed out).

## Review Log

- 2026-08-28 — plan drafted; phases 1–4 pending.
- 2026-08-28 — executed as planned, four notes from the doing:
  - `feedItemMeta` distinguishes a full parent from a stub by `parent.record`
    presence rather than by `$type` — `notFoundPost`/`blockedPost` both lack it, and
    a postView always carries it, so one check covers all three shapes.
  - The context line rides **inside** `.postrow` (a new explicit `aboveNode` opt on
    the shared `postRow`, like `bodyNode` — memory tier passes nothing) rather than
    wrapping the row: `.postrow:nth-child(odd/even)` striping counts children, and a
    wrapper div would have broken the alternation for every reply and repost.
  - The tab row reuses the existing `.tabs`/`.tab.active` chrome as `<button>`s with
    `aria-pressed` (per-page-load state like `boardSort`, a filter over the loaded
    window) — URL-state tabs were considered and declined because a tab press must
    not refetch the fan-out the board already paid for.
  - Gate: `npm test` 520/520 · conformance 86/86 · workflows 16 ok, 2 live-skipped,
    and `signin.workflow.mjs` failing **identically on a clean tree** in this
    sandbox (ERR_CONNECTION_RESET on the vendored OAuth client's resource loads —
    environmental, pre-existing, not this change).
