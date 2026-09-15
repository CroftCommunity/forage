# Plan: Clips — a short-form video presentation of any board, from your ring out to World

date: 2026-09-14
**Status:** DRAFTED, NOT STARTED — a proposal for owner decision. Nothing is built. The
research half (how Skylight does it, § Prior art) is done and sourced; the forage half
rests on six live probes (§ Verified assumptions) and six decisions the owner has not
made (§ Open decisions). Phase 0 is measurement and must run before D2 can be decided.
repo: `CroftCommunity/forage`
baseline: `main` @ `c3a4abe` (follow-all landed, #77)
branch: `claude/video-view`
Claim: none — a plan on a branch is not a contested surface.

---

## Problem Statement

**Alice** opens Skylight. She sees one vertical clip filling her phone, playing; a swipe
brings the next. She never chooses a feed, never reads a byline first, never presses
play. After five minutes she has seen thirty clips from people she has never heard of.

**Alice** opens forage. Her Home mix is thirty rows, and four of them are clips — a
poster with a ▶ on a stage, which plays in place when pressed (feed-row v13 decision 30,
`mountVideo` in `js/ui/lens-views.js`). To see the next clip she scrolls past twenty-six
posts that are not clips. To see clips from *people she follows* she picks the Follows
stop on the ring pill, which narrows Home to her follows and leaves her with, on a good
day, one clip on the page. To see clips from the wider network she opens `/feeds`, ticks
*video* (the index carries 25 feeds whose generator declares
`contentMode: contentModeVideo`), joins one, and reads it as rows.

Everything the second Alice needs is already in forage — the posts, the player, the
ring, the mixes, the moderation posture — and none of it is arranged for the thing the
first Alice is doing. The owner's question (2026-09-14) is two questions:

1. **How does Skylight do it?** Do they host the videos, or watch the network and catalog
   what they find? (§ Prior art answers this with sources.)
2. **How does forage get the same effect** — first over the social tree (the ring's
   people-scopes: me · mutuals · follows · +1), then at World (the composition: every
   feed and hashtag you subscribed to)?

The constraint that shapes every answer below is the one every forage plan carries:
**no server-side component at runtime** (ADR-005), **AppView pull, not a Jetstream-fed
index** (ADR-002), and the ring is a **display scope over every surface**, never a
destination (plan 2026-09-03). A clip surface that needed a catalog would be a different
product; this plan is what forage can do as forage.

## Prior art: how Skylight does it

Researched 2026-09-14 (a subagent's web sweep plus direct probes of the public network:
`describeRepo`/`listRecords` on Skylight-dedicated accounts, `getPosts` hydration, HLS
fetches from `video.bsky.app`, `describeFeedGenerator` on Skylight's feed hosts). Founder
statements are Bluesky replies, cited by post URL; probe evidence is marked **[probe]**.

**The one-line answer to the owner's question: neither.** Skylight does not host the
videos and it does not merely watch the firehose. It is, in its CTO's words, "basically a
different UI for Bluesky infra" and "a very video-friendly Bluesky client"; the videos
live on the poster's PDS and play from Bluesky's CDN, and Skylight's own backend is a
selective index plus feed generators plus a rented ranking model.

```
 Skylight app ──OAuth──▶ user's PDS ◀── blob written by video.bsky.app (service token)
      │  app.bsky.feed.post + app.bsky.embed.video (the ordinary record; shows on bsky.app)
      │
      ▼
 Skylight backend (Cloudflare Workers + Durable Objects): indexes video posts, likes,
 reposts, follows, feed-generator likes — NO AppView, NO PDS, NO video pipeline
      ├── feed generators (did:web:feed.skylight.social, …rcharmeyer.workers.dev)
      ├── "For You" = Graze's getSortedSkeleton (watch-time prediction model)
      └── LIVE NOW = Streamplace
 playback: video.bsky.app/watch/<did>/<cid>/playlist.m3u8  (BunnyCDN; 360p + 720p H.264)
```

1. **Where the files live — the poster's PDS, transcoded and served by Bluesky.** Tori
   White, 2025-06-19, to "where is it stored?": "It's stored on your PDS… For you, since
   you have a '.bsky.social' username, this server is owned by Bluesky"
   (<https://bsky.app/profile/buildwithtori.com/post/3lrypec2nok2e>; also
   `…/3lkqnuexy4k2x`, 2025-03-19: "You can have Bluesky host your videos or you can
   self-host"). Reed Harmeyer, 2026-01-30: "I'd love to have our own PDS we just couldn't
   afford it especially with how many people would use it and upload videos"
   (<https://bsky.app/profile/reedharmeyer.bsky.social/post/3mdn65eiyms2s>). **[probe]**
   Skylight-dedicated accounts carry ordinary `app.bsky.embed.video` blobs on
   `*.host.bsky.network`; `getBlob` answers the source mp4; the AppView hydrates them to
   `video.bsky.app` playlists (two renditions, 4 s segments, `server: BunnyCDN`). No
   `api.`/`video.`/`cdn.` host under `skylight.social` resolves. That Skylight calls
   `app.bsky.video.uploadVideo` is an inference from the record shape — no founder says
   it outright — but it is the only public path that yields a blob the AppView hydrates,
   and the press names Skylight among the clients that gained the 2026-08 10-minute /
   300 MB raise (<https://techcrunch.com/2026/08/26/bluesky-now-lets-you-upload-10-minute-long-videos/>).
2. **What it writes — standard records, on purpose.** Reed, 2026-01-30, declining a
   `social.skylight.source` marker: "I don't think we're going to have a separate post
   lexicon in the way Spark does… We don't want it to be a silo"
   (<https://bsky.app/profile/reedharmeyer.bsky.social/post/3mdnz3lb5ak27>); "The big
   reason we haven't created one is simply because we didn't need one!"
   (`…/3mdnytj77dk27`). **[probe]** `describeRepo` on Skylight accounts lists only
   `app.bsky.*` collections; the sole `social.skylight.*` records on the network are a
   Dec-2025 `space.page`/`space.link` prototype in Reed's own repo, and
   `_lexicon.skylight.social` TXT is empty. Their public GitHub org holds two auth forks
   (`oatproxy`, `aip-2`) and nothing else.
3. **How the feed is built — a selective index, not an AppView; ranking rented.** Reed,
   2025-09-27: Skylight "doesn't have an App View because we haven't really found the
   use case for one given we can just index data without an App View"
   (<https://bsky.app/profile/reedharmeyer.bsky.social/post/3lzrrpwmw422s>). Backend is
   Cloudflare Workers + Durable Objects ("scaled it up to near enterprise usage",
   `…/3mcnhcki6yc2l`). It indexes video posts, likes, reposts, follows and likes of feed
   generators (which it treats "like follows", `…/3m2z63hj57s27`); playback URLs come
   from Bluesky's hydration, so nothing is mirrored. Whether the ingest is Jetstream, the
   relay firehose or polling is stated nowhere. The "For You" order was first an in-house
   watch-time model ("retrained about every 10 minutes", `buildwithtori.com/post/3lkqo5xedes2x`),
   then abandoned — "trying to make a better algorithm… turned out to be a bit of a
   fool's errand… what we actually need is to empower users to become content curators"
   (`…/3lthynqp6b222`, 2025-07-08) — and is now Graze's `getSortedSkeleton`, a
   watch-time prediction model over a normal feed skeleton
   (<https://graze.leaflet.pub/3m2umcvzjts2z>). Curators are reposts plus custom feeds
   (v2.0, 2025-08; <https://techcrunch.com/2025/08/26/skylights-tiktok-alternative-adds-community-curators-to-the-mix/>),
   and feed authors signal form factor with `contentMode`: "We want to display feeds in a
   way that matches the author's intent" (`…/3lx6vq5vcuk2q`). **[probe]** Their feed
   generators — `videos` ("The newest video posts on Bluesky"), `discovery`,
   `following` ("Video posts from people you follow on Skylight Social") — are declared
   in the founders' repos; the two Workers-hosted ones answered Cloudflare error 1042
   today, and `feed.skylight.social` an empty skeleton unauthenticated.
4. **The datapoint that matters most for this plan.** Skylight's *following* feed —
   exactly the social-tree question the owner asked — is, per Reed, "like half of our
   production workload" (quoted from why.bsky.world; `…/3m2z63hj57s27`). With an index
   it is a join over every follow's posts; without one it is a fan-out per follow. That
   is the cost § B bounds with backpressure, and the reason it is bounded rather than
   pretended away.
5. **Adjacent apps, for the pattern.** Bluescreen and Flashes follow Skylight's model
   (standard records, Bluesky's video service, a filtered view). Spark (ex-Reelo) is the
   opposite: its own lexicon, PDS, relay, AppView and CDN, cross-posting one-minute cuts
   to Bluesky. Streamplace runs its own AppView for live. Forage sits with the first
   group by construction — and further along it than Skylight, since forage has no index
   at all.

Not found: an architecture write-up or talk (Reed's ATmosphereConf 2025 talk was not
transcribable); what "we shut down servers in November" (2025) meant; whether the
promised "post collections" lexicon shipped.

## Approach

### A. A reel is a presentation of a board, not a new source

Forage's law is that everything in the nav is a **board**, and boards differ only in
where the posts come from. Clips keeps that law: **Clips is a way of showing a board**,
the same posts the board would show, narrowed to the ones carrying a video, laid out one
clip per screen. The ring scope applies exactly as it does to rows. Moderation applies
exactly as it does to rows. Nothing is written.

```
                 the same board, two presentations
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ Home  ·  [Me|Mut|Fol|+1|World]│   │        (one clip, 9:16)        │
│ ───────────────────────────── │   │                                │
│ @a  text post …               │   │                                │
│ @b  ▶ poster        (clip)    │   │           ▶ playing            │
│ @c  photo                     │   │                                │
│ @d  ▶ poster        (clip)    │   │                                │
│ @e  reply …                   │   │  @b · 2h            ♥ 128      │
│ @f  text post …               │   │  the post's words…   ↩ 4       │
│ ⋮                             │   │  [🔇]                ⟳ 9  ⤴    │
│                       [Clips] │   │  ▲ swipe · [Rows]  scope pill  │
└───────────────────────────────┘   └───────────────────────────────┘
        /m/home                             /m/home?view=clips
```

Two new pure concerns, and nothing else new in the substrate for World:

- **A kind filter, `video`.** `media.kind === 'video'` on the shaped post (already
  produced by `shapeLensPost` for `app.bsky.embed.video#view`, `js/substrates/lens.js:268`).
  A pure `clipsOf(posts)` sibling of the retired posts/replies/reposts classification and
  of the `/feeds` *video* tick.
- **A reel renderer, `js/ui/reel.js`.** A vertical scroll-snap stack, one `<section>` per
  clip, an `IntersectionObserver` that plays the clip on screen and pauses the rest, a
  preload window of one clip ahead, `mountVideo` reused for playback (Safari native HLS,
  vendored hls.js elsewhere — the W30 routing decision, untouched).

### B. Where the clips come from, by scope

This is the part that is not free, and it is where the owner's two questions diverge.

**World** has no member list: its boundary is the composition. Clips at World is the
board's own sources, dealt as the mix already deals them (`js/mix-deal.js`), then
kind-filtered. Cheap in requests, **sparse in yield**: a feed page is 30 posts and a
general feed carries a handful of clips. The video feeds in the index help, but measured
2026-09-14 they are not what their flag promises — SkyTok's first page carried an
external link and a quote-with-media beside three clips, and bsky.app's own *Video* feed
answered **502** unauthenticated all day (§ V4). So the client-side filter is mandatory
regardless of `contentMode`, and a World reel pages deeper than a World board to fill a
screen. "More" is the mix's cursor map, already built.

**The people-scopes** (me · mut · fol · hop) have member lists, and a member list is a
source list: `fetchSource` already fetches `author` sources. The AppView's
`getAuthorFeed` takes `filter=posts_with_video` (lexicon, § V1) and it does what it says —
25 of 25 items on a video-heavy account were clips, unauthenticated, paged (§ V2). So at a
people-scope the reel can be fed by **fan-out over the scope's members with the video
filter**, dealt round-robin across people so a prolific poster does not own the reel
(the retired World board's lesson, recorded in `mix-deal.js`).

```
scope = fol                      members = scopeMembersFor('fol')   (rings.js chain)
        │                                   │ 701 dids
        ▼                                   ▼
  ┌─ wave 1 ───────────────────────────────────────────────────────┐
  │ getAuthorFeed?actor=…&filter=posts_with_video   × 6 in flight   │──▶ deal ──▶ reel
  └────────────────────────────────────────────────────────────────┘      ▲
  the next wave starts only when the reader is within N clips of the end ─┘  (backpressure)
```

Fan-out is the cost the retired ring board died of (RING_CAP, plan 2026-09-03 § 3), so
the plan bounds it three ways, and Phase 0 measures whether the bound holds:

1. **Backpressure, not a bulk fetch.** The reel asks for the next wave of members only
   when the reader is within a few clips of the end. A reader who watches five clips
   costs a handful of requests, not 701.
2. **Order the waves by who has answered with a clip before.** A device-local register
   (`forage.clip-posters`, a new `DEVICE-LOCAL.md` row — did → last clip seen) puts known
   clip-posters first and everyone else after; the first wave on a cold device is the
   scope's tightest ring (mutuals), which is small by construction.
3. **The scope decides the source, not the board** — see D1. At `me`/`mut` the fan-out
   is small; at `fol` it is the follows; at `hop` it is potentially thousands and may
   need its own cap with words, which is a Phase 0 number.

On the **pds-walker** path (Beta features, plan 2026-09-08) the same fan-out is
`com.atproto.repo.listRecords` on `app.bsky.feed.post` per member with a local
`app.bsky.embed.video` test, and the playlist is **derivable from the record**: the view's
playlist URL is `https://video.bsky.app/watch/<did>/<blob cid>/playlist.m3u8` and the blob
cid in the raw record matched the view's cid exactly (§ V3). That reel would carry no
counts (ADR-002's second reason — a repo cannot know how the network responded), which is
honest and says so. Named as a later phase (P6), not the MVP: the Beta switch today
changes the ring's *membership* only, and widening it to content is its own decision.

### C. What the reel promises and refuses

- **Autoplay is muted, in-view only, and governed by the reader's autoplay choice.**
  `forage.gifautoplay` is a *GIF* preference; a clip is a video post. Proposal (D3): a
  second key, `forage.clipautoplay`, default **on** inside Clips only — the point of the
  surface — and the row presentation unchanged (a row's clip still waits for the press).
  With it off, the reel is posters with a ▶, and it fetches nothing until pressed — the
  same promise `js/ui/stage.js` makes for GIFs.
- **A labeled clip never autoplays.** The posture already blurs a `warn` verdict on a
  row; in a reel, a miss is a video playing full-screen rather than a thumbnail behind a
  blur. So the reel's rule is stricter than the row's: a clip carrying any warn-or-hide
  verdict shows the blur and the label and waits for a press, whatever the autoplay
  setting. The adult share of the index's video feeds (roughly a third of the 25 by
  name) is why this is a rule and not a nicety.
- **No algorithm, no telemetry.** Order is the deal (D4's default), or New, or Top over
  the loaded window — the sorts a board already has. Nothing about what was watched, for
  how long, or skipped leaves the device or ranks the next clip. Skylight's "for you" is
  precisely the thing forage does not build.
- **Reduced motion is honoured.** `prefers-reduced-motion: reduce` disables autoplay in
  the reel (the reader still swipes and presses); scroll-snap stays because a swipe is
  the reader's own motion.
- **Pages, not modals.** The reel is a page state of the board — the back button returns
  to the rows, the URL says which board and that it is Clips, and it is shareable. No
  overlay, no focus trap.
- **Captions ride the record.** `app.bsky.embed.video` carries `captions` (WebVTT blobs)
  but the `#view` does not (lexicon, § V1), so whether a caption reaches the reel depends
  on the HLS playlist carrying a subtitle track — a Phase 0 probe (0c).
- **Sound is a press.** Browsers refuse unmuted autoplay; the reel starts muted and one
  44px control unmutes, and the choice persists for the session, not across it.

## Reasoning

**Why a presentation and not a new board.** Three alternatives were weighed:

1. *A dedicated `/clips` board fed by the index's video feeds.* Rejected: it is a
   category, and forage retired the views-vs-feeds axis on purpose (`CURATED[0]` is
   Discover as a feed with a good name). A clip board would also lose the ring: at
   `fol` scope a video feed yields nothing, which is the starved second Alice again.
2. *A "Clips" kind tab beside Posts / Replies / Reposts.* Those tabs rode the ring
   BOARD (`ringBoard`, plan 2026-08-28) and retired with it on 2026-09-03; nothing in
   `js/ui/lens-views.js` carries `.ring-tabs` today. Reviving a tab row for one tab is
   the wrong shape, and a tab is a filter over rows, not a change of layout.
3. *A presentation flag on any board (`?view=clips`).* Chosen. The board's identity,
   ring stop, sort and cursor state carry over; one route namespace stays one; and
   `?focus=` is the precedent for a query that changes how a page reads without changing
   what it is (D2 asks the owner to confirm the spelling).

**Why fan-out with a video filter at the people-scopes, rather than the board's own
sources narrowed.** The strict reading — "a scope only ever narrows the board" — is the
law for rows, and it is starved for clips: Home at `fol` filtered to video is a page of
one. A people-scope's members are a source list forage already knows how to fetch, the
network already offers the video-only author feed (§ V2, no client-side waste), and the
result is still inside the scope by construction — every clip's author is a member — so
E159's rule (a mix is never exempt from the ring) is kept. The cost is the fan-out, and
the plan's answer is backpressure and measurement rather than a cap that hides people
(DL-016). D1 puts the choice to the owner because it is the one place Clips reads the
ring differently from rows.

**Why no index file of clip posters (yet).** The feed index (ADR-005) is the precedent
for a weekly CI-built file with no runtime server, and a file of *accounts that post
clips* (bands, no content) would be the same shape and would seed a World reel with
creators rather than feeds. It is an editorial act, though — whose clips a stranger sees
first — and forage's discovery already has one such act under review. Parked as D5;
the MVP proves the mechanism with the reader's own composition and ring.

**Why not Jetstream or a catalog.** ADR-002 stands: replay is token-gated, a filtered
stream cannot compute other people's engagement, and a catalog is a server. Skylight's
answer (§ Prior art) is the answer of an app with an AppView; forage's is the answer of
a lens with none, and the two are not in tension — they are different products.

**Why the memory population has no Clips.** The seeded sandbox carries no video embeds,
so `?view=clips` there is an honest empty page ("no clips in this board"). Behaviour
present at one tier carries a frontier entry (invariant 8): the ledger row is part of P2.

## Verified assumptions (2026-09-14, live probes)

| # | fact | evidence |
|---|---|---|
| V1 | `app.bsky.feed.getAuthorFeed` takes `filter` with known value `posts_with_video`; `getTimeline`, `getFeed`, `searchPosts` take **no** media filter; `app.bsky.feed.generator` carries `contentMode` (`contentModeVideo`); `app.bsky.embed.video` record has `video` (mp4 blob, ≤300 MB), `captions`, `alt`, `aspectRatio`, `presentation` (`default`/`gif`); the `#view` has `cid`, `playlist`, `thumbnail`, `alt`, `aspectRatio`, `presentation` — no captions | `bluesky-social/atproto` lexicons via `gh api`, read this day |
| V2 | `getAuthorFeed?filter=posts_with_video` unauthenticated on `public.api.bsky.app` returned 25/25 items with `app.bsky.embed.video#view`, a cursor, no repost reasons; the same account's default filter was 37 clips in 50 | probe against `did:plc:je2teto5zvcroz7uswcia3j6` |
| V3 | The view's `playlist` is `https://video.bsky.app/watch/<did>/<cid>/playlist.m3u8` and `thumbnail` is `…/thumbnail.jpg`, where `<cid>` equals the raw record's `embed.video.ref.$link` (PDS `getRecord`, `fibercap.us-west.host.bsky.network`; 18.4 MB mp4) | same post, both hosts |
| V4 | bsky.app's *Video* feed (`…/app.bsky.feed.generator/thevids`, `contentMode: contentModeVideo`, 7,059 likes, `isOnline: true`) answered `getFeed` with HTTP 502 *Upstream server responded with a 500 error* unauthenticated, twice; SkyTok (`mmccue.bsky.social`) answered 200 with a mixed first page (external, recordWithMedia, 3 video) | probes |
| V5 | `shapeLensPost` maps `app.bsky.embed.video#view` → `{ kind:'video', thumb, aspect, playlist }`; `mediaNode` mounts `mountVideo` on press; `e2e/video-playback.workflow.mjs` pins the player routing hermetically (W30) | `js/substrates/lens.js:268`, `js/ui/lens-views.js:555–567` |
| V6 | `fetchSource` handles `author`/`list`/`timeline`/`feed`/`hashtag`; `mix()` fans out with `withTimeout` and a cursor map and stamps `mixSource`; `deal()` is pure round-robin by share; `scopeMembersFor(scope)` returns `{ members }` or `null` at World; the ring filter tests `members.has(post.author.did)` | `js/substrates/lens.js:1330–1470`, `:133`, `js/mix-deal.js`, `js/rings.js` |
| V7 | The e2e fence covers `bsky.social`, `public.api.bsky.app`, `bsky.network`, `constellation…`, `plc.directory`; `video.bsky.app` is **not** fenced — the reel journey must stub the player as W30 does (recording `window.Hls`, no segment fetched) | `e2e/harness/shim.mjs:33` |
| V8 | Index: 1,773 feeds, 25 flagged `video` (from `contentMode`), ~8 adult by name | `data/feed-index.json`, counted |

## Open decisions (the owner's)

- **D1 — source by scope.** At a people-scope, does Clips (a) fan out over the scope's
  members with the video filter (proposed), or (b) strictly narrow the board's own
  sources? (a) is the only one that fills a screen; (b) is the only one where Clips and
  rows read the ring identically. Proposal: (a), with the reel's count line saying
  *clips from 701 people you follow* so the difference is visible.
- **D2 — the address.** `?view=clips` on any board route (proposed), or a route of its
  own. The query keeps one namespace and survives a paste; a route reads better in a
  share sheet. Either way the back button returns to the rows.
- **D3 — autoplay.** A separate `forage.clipautoplay` key, default on inside Clips only
  (proposed); or reuse `forage.gifautoplay` (default off) so one switch governs all
  motion; or default off everywhere and let the reel ask once.
- **D4 — order.** Default = the deal (round-robin across sources or people), with New and
  Top over the loaded window as the board already offers (proposed). Or New only.
- **D5 — a clip-posters index.** Park (proposed), or plan a weekly file of accounts that
  post clips (bands, no content) as ADR-005's shape, to seed World with creators.
- **D6 — the word.** *Clips* (proposed — already what the code calls a Bluesky video;
  not a competitor's trademark). Alternatives: *Video* (the network's own word,
  `contentModeVideo`, the feed named *Video*), *Shorts* (a trademark elsewhere).

## Phases

### Phase 0 — Discovery (measure; the Discovery Exemption applies, throwaway scripts)

Run against the standing test account (`TESTBED.md` § Accounts; never the owner's) and
record every number in the Review Log. These decide D1's cost and the wave bounds.

- **0a. Yield of the board path.** Page Home (the mix) and the timeline 10 pages deep
  (~300 posts): clips per page. This is what World and strict-scope Clips can offer.
- **0b. Yield of the fan-out path.** Over the account's follows, `posts_with_video`
  limit 25 each: how many members answer with ≥1 clip, requests per 20 clips, wall time
  at 6 in flight, and the `hop` member count — whether `hop` needs a cap with words.
- **0c. Captions.** Fetch one `playlist.m3u8` whose record carries `captions`: does the
  master playlist declare a subtitle track? (Decides whether the reel can show them.)
- **0d. The official Video feed.** Is `thevids` auth-gated or down? One `getFeed` through
  the test account's PDS proxy. (Decides whether it is worth naming anywhere.)
- **0e. Device autoplay.** A throwaway page with three muted `playsinline` HLS clips in a
  scroll-snap stack on the Samsung and the Pixel (claim `testbed--samsung` /
  `testbed--pixel` first; seat the device queue): does in-view autoplay start without a
  gesture after the first press, and does hls.js keep up at 2 Mbit? `[device: android x2]`.

Disposition: throwaway, numbers into this plan. Exit: D1 and the wave bound decided.

### Phase 1 — Substrate, pure (RED first)

Changes: `js/clips.js` (new: `clipsOf(posts)`, the wave planner over a member list and
the clip-posters register — pure, takes the register as input); `js/substrates/lens.js`
(`fetchSource` `author` gains `filter`; a `clips(scope, board, { cursors, ahead })` method
that fans out per D1 with `withTimeout`, deals, stamps `mixSource`, returns a cursor map
and a `members` progress); `js/clip-posters.js` (device-local register, `read`/`write`,
`forage.clip-posters` in `docs/DEVICE-LOCAL.md`).
Tests: `test/clips.test.js` (filter; deal fairness across people; backpressure — the
planner asks for wave 2 only when `ahead < N`; a member with no clips is not asked again
this session), `test/lens-clips.test.js` (a shim `get` recording calls: World issues no
author calls; `fol` issues one per member of wave 1 with `filter=posts_with_video`;
timeouts degrade to `failures` with words), `test/device-local-register.test.js` (the new
key has its row).
RED: each test names a module or method that does not exist.

### Phase 2 — Presentation (RED first, hermetic)

Changes: `js/ui/reel.js` (the stack; `IntersectionObserver`; preload window of one;
autoplay per D3 and the labeled-clip rule; sound toggle; the controls column — author,
words, like, reply, repost, share, open thread — every target ≥44px); `js/ui/lens-views.js`
(the `[Clips]`/`[Rows]` switch on the board toolbar; `?view=clips` per D2; the count
line); `css/app.css` (scroll-snap, the 9:16 stage, safe-area insets, reduced-motion);
`ledger/divergence.js` (memory population: Clips is an honest empty page — frontier row).
Tests: `test/reel.test.js` under Node with a stubbed observer (one `data-player` at a
time; a warn-labeled clip never receives `play()`; autoplay off → no `src` until press);
`test/css-classes.test.js` sees the new literals.

### Phase 3 — Workflow journey (invariant 6b)

`e2e/clips.workflow.mjs`: a shim feed carrying text posts, two clips, one labeled clip,
one repost of a clip; signed-in Home at `fol` with a shim graph. Asserts: the rows page
shows the switch; `?view=clips` shows exactly the clips; the labeled one is blurred and
unplayed; exactly one `<video>` has `data-player` at a time as the stack scrolls; the
fan-out calls carry `filter=posts_with_video` and stop when the reel is ahead (the shim
records hits, as `mixes.workflow.mjs` does); back returns to the rows at the same scroll
position (`feed-position` P2b's promise). `window.Hls` is the W30 recording double — no
segment leaves the page (V7). Reduced-motion variant: no `play()` call.

### Phase 4 — Mock, then the phone

`plans/mocks/clips.html` per `MOCKS.md`: Current (the rows, `mock-baseline`) beside
Proposed (the reel, `mock-proposal`), both `forage@<sha>`, 390×844 and 1280×900, one
skin, a population built to stress it — a portrait clip, a landscape clip, a clip with
alt and a long post text, a labeled clip, a clip whose author has no avatar. Handed over
as its full path on disk. Then one look on the Samsung and the Pixel `[device: android x2]`
— 0e's page was a throwaway; this is the engine.

### Phase 5 — Gate and the record

`npm test`, `npm run conformance`, `npm run workflows`, `npm run reference-gate` (the
declared gate, named in the output). `CHANGELOG.md` `[Unreleased]` entry; `AGENTS.md`
surfaces paragraph (a presentation flag, not a route; **no new writes** — the invariants
table is untouched, like/repost/reply reuse the existing calls); `docs/DEVICE-LOCAL.md`
rows; this plan's Status. PR, ask to merge.

### Phase 6 (later, its own decision) — Clips on the pds-walker path

`listRecords` over `app.bsky.feed.post` per member, local `app.bsky.embed.video` test,
playlist derived per V3, no counts and the count line says so. Rides the Beta switch and
widens it from membership to content — argue for it in the Beta plan before building.

## Documentation impact

`AGENTS.md` (surfaces; the Clips promise list belongs in `croft-pwa/docs/DESIGN.md` if
the pattern is reused — a flow with a recorded exception to "nothing fetched before the
press"); `docs/DEVICE-LOCAL.md` (two keys); `CHANGELOG.md`; `CroftC/.claude/DESIGN.md`
if the reel becomes a Components entry (a second surface would make it one);
`discovery/alpha/ROADMAP_TODO.md` — an E-row for D5 if the owner parks it there rather
than here.

## Review Log

- 2026-09-14 — drafted from the owner's question, the Skylight research (§ Prior art),
  and the probes in § Verified assumptions. Awaiting D1–D6 and Phase 0.
