# Plan: sorting, filtering and time windows — for feed discovery and for boards

date: 2026-08-26
status: DRAFT — research filed, phases proposed, awaiting owner Pass 2. No code written.
Execution in worktrees/forage/feed-discovery-sorts (branch claude/feed-discovery-sorts)
repo: `CroftCommunity/forage`, local checkout `CroftC/forage`
baseline: `main` @ `f08fa9d` (clean tree)
prior plan: `plans/2026-08-25-1-plan-backend-modes-bsky-writes.md` (3j built the
discovery page this plan extends; 3i built the board window-sort it upgrades)
backlog: partially answers **E139** (Jetstream v2 freshness) — see § "E139: answered
for discovery, still open for posts"
planning workflow: `phase-plan` skill. Single plan file.

## Problem Statement

`/feeds` (`lensFeedsView`, `js/ui/lens-views.js:646`) makes exactly one call —
`app.bsky.unspecced.getPopularFeedGenerators` — and renders the server's order. It
shows `likeCount` and never sorts on it. There is a search box and nothing else: no
sort, no filter, no time window.

The owner asked (2026-08-26) whether we have options for **filtering, sorting and
ordering** feed discovery on dimensions like most-liked and most-posts over
24h/7d/30d, which dimensions differ by source, and what Jetstream v2 adds. And
then: give the boards (`/f/`, `/h/`) the same time windows if we can.

Two gaps sit underneath that ask:

1. **Discovery is single-dimensional.** Everything the AppView already hands us —
   builder platform, feed age, creator, labels, video mode — is dropped on the
   floor by the mapper at `js/substrates/lens.js:624`.
2. **Board sorts are honest but small.** `sortWindow` (`js/substrates/lens.js:288`)
   re-orders only the *loaded* posts, and says so in the UI. "Top this week" today
   means "top of the ~30 posts we happened to fetch." For `/h/` hashtag boards
   that limitation turns out to be unnecessary — see D3 below.

A third gap surfaced during the research and is a correctness bug, not a feature:

3. **Feed labels never reach the moderation posture.** `discoverFeeds` drops
   `f.labels` entirely, and `labelDisposition` is only ever applied inside
   `shapeLensPost`/`shapeLensThread`/`shapeLensFeed` — i.e. to posts. 3 of the top
   100 popular feeds carry a `porn` label and 2 carry `sexual` (measured, D1). An
   account with `adultContentPref.enabled = false` sees them in discovery anyway.

## Approach

Four tiers of dimension, ordered by cost. Ship inner tiers first; each is useful
alone.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ T0  the payload we already fetch          0 extra requests               │
│     likes(all-time) · feed age · builder platform · creator · video      │
├──────────────────────────────────────────────────────────────────────────┤
│ T1  getLikes on the generator URI         1 req/feed  → RISING 7d/30d    │
│ T1b getFeed                               1 req/feed  → live/stale/dead  │
├──────────────────────────────────────────────────────────────────────────┤
│ T2  constellation.microcosm.blue          1 req/feed  → shares · packs   │
│     (third-party host — needs an ADR)                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ ──  jetstream2                            REJECTED for discovery (D5)    │
└──────────────────────────────────────────────────────────────────────────┘
```

For boards, the two kinds split and must not be conflated:

- **`/h/` hashtag boards** ride `searchPosts`, which takes `sort=top` plus
  `since`/`until` **server-side**. A true top-of-the-last-7-days is one query over
  the whole corpus (D3). This is a real upgrade out of `sortWindow`.
- **`/f/` generator boards** have no such lever — `getFeedSkeleton` takes only
  `limit`/`cursor`. The only path is paging backwards and sorting locally, whose
  cost varies by two orders of magnitude between feeds (D4). The honest shape is a
  **budgeted deepening** that reports what it actually reached.

## Reasoning

**Why client-side sorting is not a compromise here.** The popular-feeds corpus is
finite and small: 117 feeds, 2 requests, 0.62s, then `cursor: null` (D1). The whole
thing fits in memory. So for browse mode the question was never "will the server
order this for us" — it is only "what data can we attach to 117 rows." That is why
T0 is free and why every T1/T2 dimension is a bounded fan-out rather than an
indexing project. (Search mode is the opposite: `query=` switches to a real search
index over the entire generator population — `query=a` still had more after 1,500
rows — so search results are *not* a bounded corpus and get lazy, viewport-scoped
enrichment only.)

**Why `getLikes` and not snapshots.** The obvious way to get "likes gained in 7d" is
to snapshot `likeCount` on a schedule and diff. That needs storage, a scheduler, and
a cold-start problem for every new visitor. It turns out not to be necessary:
`app.bsky.feed.getLikes` accepts a **feed-generator URI** and returns the like
records themselves, newest-first, with timestamps (D2). The window is a count over
one page. No history to accumulate, no server, nothing to babysit.

**Why liveness is `getFeed` and not `isOnline`.** The intuitive filter — hide feeds
whose generator is down — turns out to read a field that is never false: across 915
distinct search-result feeds, `isOnline` and `isValid` were `false` **zero** times
(D6), including for 138 feeds with no likes at all. The signal is real but it lives
somewhere else: `getFeedGenerator` 400s on an unresolvable service DID, and `getFeed`
502s, returns empty, or returns months-old posts. Measured over a stratified sample,
about a third of search-result feeds are dead or stale (D6). So the filter the owner
asked about is worth building — just not on the field it looks like it should use.

**Why no adult toggle.** Owner direction, 2026-08-26: adult content is governed by
the moderation posture we import from the account's own settings; if it is off there
it must not be re-surfaceable anywhere in Forage as a setting, toggle, or filter.
This is the piggy-back principle (D10 in the prior plan) applied to a surface that
currently ignores it. Feed rows go through the same `labelDisposition` the posts
already do; there is no discovery-local control, because a discovery-local control
would be a second source of truth for a decision the account already made.

## Evidence (probed live 2026-08-26, unauth AppView unless noted; session probes used
the registered test account `ngvalidation2112.bsky.social`, `.claude/TESTBED.md`)

### D1 — the browse corpus is bounded, and T0 is free

`getPopularFeedGenerators`: **117 feeds, 2 requests, 0.62s**, `limit` max 100 (101 →
400). Default order is NOT `likeCount` (cursor is a bare integer score, `9884`), so
an explicit "Most liked" sort produces a visibly different page.

Per-row fields available at zero extra cost, over the top 100:

| Field | Gives | Measured |
|---|---|---|
| `likeCount` | Most liked, all time | 52,591 → 593 |
| `indexedAt` | Newest / oldest feed | 2023-05-19 → 2026-08-23 |
| `did` (service host) | **Filter by builder platform** | skyfeed.me 49, api.graze.social 14, discover.bsky.app 7, blueskyfeedcreator 5, bsky.one 4, +7 |
| `labels` | Posture input (§3 above) | `porn` ×3, `sexual` ×2 |
| `contentMode` | Video feeds | 4 |
| `acceptsInteractions` | Feeds that take feedback | 17 |
| `creator.*` | Group by creator, verified-creator filter | — |

### D2 — `getLikes` works on a feed-generator URI

```
getLikes?uri=at://…/app.bsky.feed.generator/for-you&limit=100
  → 200 unauth · newest-first (verified) · {actor, createdAt, indexedAt} · cursor
```

Full-corpus run: **117 feeds × (getFeedGenerator + getLikes) = 234 requests,
concurrency 16, 22.5s wall, zero errors.**

The ranking genuinely differs from all-time:

```
                          24h   7d   30d    all-time   all-time rank
  For You                  31  100+  100+     52,591        #1
  Discover                  6    34  100+     39,380       #27
  Art: What's Hot           4    17    60     11,792       #14
  Popular With Friends      3    22    92     41,314        #2
  Fungi Friends             2     6    12      2,012       #50   ← rank 50, top-10 rising
```

Bounds, both measured:

- **A 24h window is nearly signal-free.** Only **9 of 117** feeds got ≥2 likes in
  24h; most are tied at zero. 7d and 30d separate them. → ship 7d/30d; 24h is a
  novelty at best.
- **The page caps at 100** (101 → 400). Exactly **1 of 117** feeds hit the cap
  inside 7d. Reaching 30d on that one feed took 10 pages / 6.3s. → 24h and 7d are
  exact for essentially everything; 30d displays `100+` rather than paging.
- `createdAt` vs `indexedAt` on likes agreed to a **median 0.0s** (p90 0.7s, max
  4.2s), so either is safe for windowing — unlike posts, where the sample contained
  `createdAt` values in the *future*. Use `indexedAt`.

**These windows are ours, not the server's.** There is no time-bucketed aggregate
anywhere in the API; the only server-side aggregate is the cumulative `likeCount`.
What is indexed remotely is likes-by-subject in reverse-chronological order — which
is precisely why one request suffices and why the count is exact only while it is
under 100.

### D3 — `searchPosts` DOES have server-side top + time windows (session)

Probed with a live session against the PDS proxy:

| Params | Result |
|---|---|
| `sort=top` | 200 — returns high-engagement posts (likes 1,600 / 4,647 / 1,783 …) |
| `sort=latest` | 200 — minutes old |
| `sort=top&since=<7d ago>` | 200 — top *within the window* |
| `sort=top&since=…&until=…` | 200 |
| `+tag=`, `+lang=` | 200, composes |
| `sort=bogus` | 400 `InvalidRequest` |

So `/h/` boards can offer a **true** "Top · this week" in one query, over the whole
corpus rather than the loaded window. Caveat to render honestly: `sort=top` is an
engagement-weighted *relevance* ranking, not a `likeCount` sort — the returned order
was 152, 113, 1478, 122, 168 likes. It is "top" in Bluesky's sense, not "most liked."

### D4 — `/f/` generator boards: deepening cost varies by 100×

Paging `getFeed` backwards until the window is covered (budget 40 pages):

```
feed             window     result  pages  posts reached_h   sec
Astronomy           24h         ok      1     98      29.2   2.1
Science             24h         ok      2    200      24.0   1.6
Gardening           24h  exhausted      2    111      24.0   2.7   ← feed has only 111 posts
Birds!              24h         ok     26    758      24.9  39.0
Game Dev            24h budget-hit     40   3488      15.3  56.5
Blacksky            24h        ERR     30   3000      —     —      ← errored mid-paging
Astronomy          168h         ok      5    487     168.5   6.5
Science            168h         ok     13   1300     170.0  17.3
Blacksky           168h budget-hit     40   4000       3.6  21.7
```

Three distinct outcomes, all of which the UI must be able to say: **covered**,
**exhausted** (the feed has no more), **budget hit** (it posts faster than we page).
Deep paging is also not reliable — two feeds errored mid-run.

### D5 — Jetstream v2, measured and rejected for this purpose

All five endpoints open (227–489ms). `cursor=<unix µs>` replay works, draining at
**~10× realtime**.

```
30s live tail, wantedCollections=app.bsky.feed.like
  9,316 events · 310/sec · 159 KB/s · likes on feed generators: 0

7.6 min replayed (45s wall)
  135,593 events · 68.3 MB · likes on feed generators: 2
```

Extrapolated: **~380 generator likes per day, network-wide, across all feeds.**
Computing "trending feeds by 24h likes" that way means ~1.3 GB and ~2.4 hours of
draining for a few hundred data points — to get an answer `getLikes` returns per
feed in one request. Jetstream cannot filter by subject (only `wantedCollections`
and `wantedDids`), so there is no cheaper slice. **Closed: Jetstream is not the
freshness channel for feed discovery.**

### D6 — liveness: `isOnline`/`isValid` is not the signal

Over **915 distinct search-result feeds**: `isOnline` false **0 times**, `isValid`
false **0 times** — including across 138 feeds with zero likes. 13 were non-200,
and those carry the real signal: `400 InvalidRequest: could not resolve identity:
did:web:<host>` — dead ngrok tunnels, dead railway apps, `did:web:did:web:…`
typos.

Stratified sample of 160 feeds, calling `getFeed` instead:

```
   band  live  stale>7d  empty  http-err        (http: 502 ×9, 400 ×3, transport ×3)
      0    16        15      3         6        ← 40% live
    1-9    22         7      6         5
  10-99    29         8      0         3
   100+    28        11      0         1
```

Roughly **a third of search-result feeds are dead or stale**, concentrated in the
zero-like band. Caveat: three of the "transport" failures were client-side timeouts
under 16-way concurrency, not proven server truth — a real implementation needs
per-feed timeouts and must not report its own timeout as the feed being down.

### D7 — Constellation: signals no Bluesky endpoint exposes

`constellation.microcosm.blue` — atproto-wide backlink index (17.6B links, 575 days
indexed). `links/all/count?target=<feed uri>` for the For You feed:

```
app.bsky.feed.like         .subject.uri            52,558   (matches likeCount)
app.bsky.feed.post         .embed.record.uri        4,287   ← posts quoting the feed
app.bsky.graph.starterpack .feeds[].uri               965   ← starter packs including it
app.bsky.feed.generator    .skyfeedBuilder…feedUri       4   ← feeds built ON this feed
computer.aetheros.settings .columns[].params…          53   ← third-party client adoption
app.skydeck.deck / com.shadowsky.columns / net.anisota.* / co.goodfeeds.*  …
```

"Most shared" and "most starter-packed" measure curator endorsement rather than a
one-click like, and exist nowhere in the AppView.

They are time-windowable **for free**: Constellation returns `{did, collection,
rkey}` newest-first, and atproto rkeys are TIDs encoding a microsecond timestamp.
Verified against `getLikes`:

```
TID-decoded : 2026-08-26T19:02:27.312007+00:00
getLikes    : 2026-08-26T19:02:27.165Z          ← 0.15s apart
```

For You: 5 quotes in 24h / 55 in 7d; 8 starter-pack adds in 24h / 44 in 7d.

### D8 — what does not exist

- **Subscriber / "joined" counts.** Joins live in `savedFeedsPrefV2`, which is
  private per-actor. Constellation confirms it network-wide: `app.bsky.feed.save
  .feed` = **0 records**. `likeCount` is the only public adoption signal and it is a
  proxy — same family of honesty as DL-025.
- **Topics / categories.** No taxonomy exists. `getTrendingTopics` and `getTrends`
  are about content, not feeds.
- `app.bsky.unspecced.searchFeedGenerators`, `getTrendingFeeds`,
  `getPopularFeedGeneratorsSkeleton` — all **501 MethodNotImplemented**.
- `getSuggestedFeeds` (both the `unspecced` and `feed` namespaces) IS 200 unauth and
  is a separately-curated corpus — a candidate second tab, not in scope here.

## The units

Each unit carries invariant 6 (a scenario per new mutation — most of these are read
paths, so most add selectors + characterization instead) and invariant 6b (a
workflow journey in `e2e/`, or an explicit note that the unit has no workflow
surface).

**4a — feed labels reach the posture (the bug).** `discoverFeeds` and `feedInfo`
carry `labels` through; a shared `feedDisposition(feed, posture)` applies the same
`ADULT_LABELS` / `labelPrefs` rules `labelDisposition` applies to posts. Hidden feeds
do not render; warned feeds render behind the existing warn affordance. No toggle,
no setting, no filter — per owner direction. Test: an account with
`adultContentPref.enabled=false` cannot see a `porn`-labelled feed in discovery or
on its `/f/` header card. **Blocks nothing else, ships first.**

**4b — T0 sorts and filters.** Fetch both pages up front (117 rows, 0.62s), sort
client-side: Popular (server order, default) · Most liked · Newest · Oldest. Filters:
builder platform (`did`), video-only (`contentMode`), creator. Reuses the
`boardToolbar` idiom. No new network shape at all.

**4c — T1 Rising.** `getLikes` fan-out with a concurrency cap and a short-lived
cache; sorts "Rising · 7 days" and "Rising · 30 days". 24h is NOT offered (D2). 30d
counts at the cap display `100+`. Words on the control, in the `sortWindow` spirit:
likes gained in the window; joins are private, so likes are the only public signal.

**4d — T1b liveness.** `getFeed` probe per feed → live / stale / empty / unreachable,
with per-feed timeouts, degrading per feed rather than globally (2 of 16 popular
feeds are `401 AuthRequiredError` unauth — personalized feeds are not broken feeds
and must not be labelled as such). Default ON for **search** results, off for browse
(0 of 117 popular feeds are dead). This is the answer to "filter or an option next to
the search bar": it is a filter *on search*, defaulted on, with a visible "showing N
of M — K stale or unreachable" line so the filtering is never silent.

**4e — `/h/` true top windows.** `stream({kind:'hashtag'})` gains `sort`/`since`/
`until` passthrough to `searchPosts`; the board toolbar's Top+timeframe stops being
a window re-sort for hashtag boards and becomes a real query. The "Sorted within the
loaded posts" line must NOT render on this path — it would now be a lie. Needs a new
tolerance (below) because `/f/` and `/h/` boards no longer mean the same thing by
"Top."

**4f — `/f/` budgeted deepening.** Page `getFeed` until the window is covered or a
budget (pages + wall-clock) is hit, then sort locally and report which of the three
outcomes happened (D4). Exhausted and budget-hit get distinct words.

**4g — T2 Constellation.** Gated behind the ADR below. "Most shared" and "In starter
packs", with TID-decoded windows.

## Ledger entries this plan owes

- **DL-027 tolerance** — discovery ordering is Forage-local. The AppView's popular
  order is an opaque score; every sort we offer above it is computed here.
- **DL-028 tolerance** — "Top" means two different things by board kind after 4e:
  a whole-corpus server ranking on `/h/`, a budgeted local sort on `/f/`. Names
  DL-010 as the reason `/f/` cannot do better.
- **DL-029 frontier** — feed adoption is unmeasurable: `app.bsky.feed.save` = 0
  records network-wide, `savedFeedsPrefV2` is private, so "most joined" cannot be
  built. Sibling of DL-025.
- **DL-030 proposal** (only if 4g ships) — a non-Bluesky read dependency.

## Open questions — owner

- **OQ1 — the guest adult default.** With no session there is no imported posture:
  `EMPTY_POSTURE` sets `adultEnabled: true`, so a signed-out visitor would see
  adult-labelled feeds. The "no separate toggle" rule is unambiguous for a signed-in
  account and silent for a guest. Options: default guests to adult-off (matches
  bsky.app logged-out behaviour, and is a *default* rather than a toggle), or leave
  permissive. **Not inventing an answer — AGENTS.md escalation.**
- **OQ2 — Constellation as a dependency.** T2 is the only tier that reaches a
  non-Bluesky host. ADR-002 fixed lens intake as AppView pull; adding
  `constellation.microcosm.blue` is an amendment to that, not a quiet addition.
  Wants `docs/adr/0003-*.md` + a `CroftC/.claude/DECISIONS.md` row in the same
  change. Their operator asks for a project name + contact in the user-agent.
- **OQ3 — is `getLikes`-on-a-generator contractual?** It is not `unspecced`, but no
  Bluesky surface uses it this way, so it could change without notice. 4c is the
  whole "Rising" feature; worth deciding whether it degrades to Most-liked silently
  or says so.
- **OQ4 — rate limits, unmeasured.** The 234-request and 915-request runs were
  clean, but one clean run is not a limit. Wants a measured ceiling before 4d ships
  a fan-out over search results.

## E139: answered for discovery, still open for posts

E139 asks how forage's content streams stay fresh with Jetstream v2. D5 closes the
feed-discovery half: Jetstream is the wrong instrument, by three orders of magnitude,
for ranking feeds — `getLikes` already answers it per feed in one request. E139's
real target survives untouched: keeping **post** streams (`/f/`, `/h/`, ring boards)
fresh, where the events are the 310/sec that Jetstream is good at rather than the
0.004/sec it is not. Recommend the E139 row be narrowed to that, citing D5.

## Review Log

### Pass 1: Research + plan development — 2026-08-26
Live probes against the AppView (unauth), the PDS proxy (test-account session),
Jetstream v2 (all five endpoints), and Constellation. Findings D1–D8 above; every
number in this plan is measured, not inferred. Three things changed the shape of the
plan away from where it started:
(a) the browse corpus is 117 feeds, not an unbounded list — client-side sorting is
    the correct architecture, not a fallback;
(b) `getLikes` accepts generator URIs, which removed the snapshot/scheduler design
    entirely;
(c) `isOnline`/`isValid` is never false, so the liveness filter had to be rebuilt on
    `getFeed`.
Owner input incorporated during the session: both T1 items approved; T2 approved;
adult content is posture-governed with no toggle anywhere (drove 4a, which turned
out to be an existing bug); board time windows wanted (drove 4e/4f).
