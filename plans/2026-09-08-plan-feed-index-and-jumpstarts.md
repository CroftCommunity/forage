# Plan: the feed index — feeds and jumpstarts as one CI-built graph the PWA carries

date: 2026-09-08
**Status:** PLANNED — research complete (two crawls, every number below measured live),
no code yet. Owner decisions taken during research are recorded in § Decisions; the ones
still open are in § Open questions. Execution on `claude/feed-index`
(worktree `worktrees/feed-index/forage`).
repo: `CroftCommunity/forage` — plus a **new** repo this plan asks for (§ Phase 0)
baseline: `main` @ `d8ff6a9` (mixes landed, #62)
parents: `plans/2026-08-26-1-plan-feed-discovery-sorts.md` (built `/feeds`, D1–D10 there
are assumed here and not re-measured); `docs/adr/0004-constellation-backlinks.md` (the
pack↔feed signal this plan carries offline); `plans/2026-08-25-1-plan-backend-modes-bsky-writes.md`
3g (starter packs registered as a frontier — this plan builds it); `plans/2026-09-08-plan-mixes.md`
(the left bar this plan extends, not re-plans).
backlog: no `ROADMAP_TODO` row exists for feed seeding or starter packs — this plan IS the
shaped work (TRACKING.md § Two piles); it partially answers E139's *discovery* half only.
dimensions touched: CI-PATTERN (a scheduled workflow), VERIFICATION (the empty-set guard),
SUPPLY-CHAIN (a second origin), SHARED-CODE (read; nothing crosses the boundary but JSON),
DESIGN (a new browse surface and a new noun), MOCKS (two surfaces need captures).

## Problem Statement

`/feeds` shows what `app.bsky.unspecced.getPopularFeedGenerators` lists: **117 feeds**.
The network has at least **56,128** a guest can search for (D1), and the AppView's own
search misses popular ones — 19 of the 117, up to 21,171 likes, never came back for any of
324 queries (D3). Starter packs are a second discovery surface with the same shape: **144,908**
exist (D6), the client got a search tab for them on 2026-09-04, and forage renders none.

The owner, 2026-09-01, then 2026-09-04:

> "we are missing feeds that are not directly discoverable via the means we are using
> now, I'm thinking we pull together a seed list of feed providers and even feeds that
> travels with the site that can be added to but gets things going"

> "I want to work these in together … the right side can be a couple of user choosable
> panels say and by default it's trending 'jumpstarts' which is what we'll call
> starterpacks for now … I'm not in love with the serverside part of this for runtime,
> even tho we have to preload SOMETHING to find other things, so I'm wondering what's the
> compromise between a list that can be built in CI on deploy and can be used to find and
> heavily cache locally in the PWA and broaden the horizons and better the search, rather
> than introduce a server side component for a pure spa/pwa + pds+appview experience with
> no 'middle man'"

Three facts underneath the ask, all measured:

1. **Topic and language do not exist in the protocol.** A generator record has no
   language field; Bluesky's own taxonomy (`getTaggedSuggestions`, 23 tags) has zero
   feed-typed rows (D4). Whatever groups feeds has to be authored.
2. **Popularity alone is an English filter.** At a likes ≥ 100 floor, Thai, Greek, Arabic,
   Hebrew, Devanagari, Tamil and Bengali feeds number **zero**; Japanese gets 13 of 1,674 (D5).
3. **Starter packs already rank feeds — differently from likes.** 30% of packs name up
   to three feeds; across 51k packs that is 6,344 distinct feeds, **1,873 of which the
   AppView's search cannot find at all** and 5,428 of which a likes-100 seed lacks (D7).
   ADR-004 already trusts this signal, one Constellation request per feed.

## Approach

**A static index is not a middleman.** The compromise the owner asked for is a line
between what a file can say and what only a live call can:

```
  ┌─ INDEX (CI, weekly; a file on a CDN) ───────────┐  ┌─ LIVE (AppView, per request) ─────┐
  │ identity: feed + jumpstart at-uris               │  │ feed content, pack members         │
  │ topic · language · community · editorial note    │  │ likeCount, joinedAllTimeCount       │
  │ pack ↔ feed EDGES                                │  │ liveness, labels as applied now     │
  │ a stable rank hint (all-time, coarse)            │  │ trending topics (already wired)     │
  └──────────────────────────────────────────────────┘  └────────────────────────────────────┘
        answers no query · sees no user · degrades to the shipped fallback
```

The client's AppView calls stay exactly as direct as today; the index only widens *which
URIs the client knows to ask about*. Nothing sits between forage and the AppView.

```
  CroftCommunity/forage-index  (NEW; § Phase 0)          CroftCommunity/forage  (main)
  ┌───────────────────────────────────────────┐          ┌─────────────────────────────────┐
  │ providers.json   hand: accounts, tags     │          │ data/feed-index-fallback.json   │
  │ queries.json     hand: the sweep's input  │          │   150 feeds + 50 packs, ~10 KB  │
  │ harvest.mjs      Node stdlib, zero deps   │          │   ships in the shell, offline   │
  │   ↓ cron weekly + workflow_dispatch       │  fetch   │                                 │
  │ index.json  ──── GitHub Pages ────────────┼─────────►│ lens.js: fallback first, index  │
  │   ~1,470 feeds · ~1,340 packs · edges     │  CORS *  │ supersedes; local search first  │
  │   ~220 KB gzip · sorted · no timestamps   │          │ sw.js: opt-in cache of that URL │
  └───────────────────────────────────────────┘          └─────────────────────────────────┘
                never merged into forage
```

Two files, two lifecycles: `providers.json` and `queries.json` are **hand-authored and
small** (a human reviews 150 lines); `index.json` is **generated and never hand-edited**,
the idiom `DEPLOYED.md` and `DEVICE-QUEUE.md` already use.

Surfaces (§ The units): the left bar gains one row (Browse jumpstarts — Mixes, Feeds,
Hashtags and the browse rule are already there since #62); the right rail becomes
panel-choosable with **Popular jumpstarts** as the default panel; `/jumpstarts` is a browse
page shaped like `/feeds`; a feed row can say "in N jumpstarts" and a jumpstart row can
list its feeds, both from the index, both offline.

## Reasoning

**Why an index and not a live crawl.** Enumerating either corpus is a batch job: 1,159
requests for feeds (68 s), 300+ sequential cursor pages for packs (8–42 min). Neither
belongs in a page load, and the public AppView is rate-limited per IP. Doing it once a
week on a runner and shipping the result costs the user nothing and the network almost
nothing.

**Why it is safe to call deterministic.** The same 324 queries run 15 minutes apart
returned the same 56,128 feeds — 0.00% set churn, identical 1,313 at the 100 floor (D2).
The search index is not sharded or randomized. Variance between weekly runs will be
real-world change, which is what the cadence exists to capture.

**Why no `likeCount` or `joinedAllTimeCount` inside the index.** A count moved on a feed
within 15 minutes (D2). On a weekly cadence most rows would churn, and the diff — the
one review artifact a periodic job produces — becomes unreadable. Both counts are free at
runtime: `getFeedGenerators` hydrates 25 per call and `lens.js` already does it
(`feedInfo`), `getStarterPacks` does the same for packs. The index carries a coarse
**rank hint** (a band, not a number) so a first paint has an order before hydration.

**Why the edges are the fold.** Pack inclusion is a curation signal, not a popularity
proxy: *Discover* has 39,410 likes and sits in **1** pack; *Bluesky Team* has 5,850 likes
and sits in **637**; *Popular With Friends* in 2,907 (D7). ADR-004 reads exactly this
number from Constellation per feed, degrade-to-absent. The index answers it with zero
requests and adds the reverse direction (a pack's feeds) that Constellation cannot. One
graph, two doors — which is why this is one plan and not two.

**Why "popular jumpstarts", not "trending".** 52 packs in 144,908 have any weekly joins,
and that board is NSFW-heavy (D6). A default panel over 52 rows most of which posture
hides is an empty panel. All-time joins are meaningful for ~1,340 packs. Trending *content*
exists and is already sourced (`getTrendingTopics` → generators, `lens.js` 3g); it is a
second panel, not the default.

**Why the second origin is acceptable under ADR-002/004.** ADR-004 already admits a second
read host for feed signals, strictly additive and degrade-to-absent. The index is
narrower still: it is our own file, it carries no viewer identity, and its failure mode
is the shipped fallback. It is a *dependency* (SUPPLY-CHAIN) but not a data plane.

**Why the fallback ships in `main` and the index does not.** `sw.js` ignores cross-origin
requests by design (`if (url.origin !== location.origin) return;`), so a cold, offline, or
index-host-down load must have something. 150 feeds + 50 packs is ~10 KB gzipped and is
regenerated deliberately, rarely, by hand — it is what "travels with the site" buys; the
published index is the enhancement. The owner's "never merged" (2026-09-01) is honoured by
construction: the index has no path into forage's history.

**Why the guard is not optional.** `app.bsky.unspecced.*` carries no stability guarantee,
and a throttled or reshaped run that writes a near-empty index is VERIFICATION shape 3 — a
green job that graded an empty set. The harvest refuses to publish when the union is below
80% of the currently-published counts or below an absolute floor (500 feeds, 300 packs),
and exits non-zero. Rate limiting from GitHub's shared runner IPs is the one thing **not**
measured (every probe ran from a residential address); the guard is what turns that unknown
into a loud failure instead of a silent corpus collapse.

**Why nothing crosses the repo boundary but JSON (SHARED-CODE, read 2026-09-08).** The
harvest is tempted to copy `tidTime`, the script heuristic, or `feedDisposition` from
forage; each would be a registered copy (rule 4), and the alternative — forage as an npm
package pinned by commit (rules 1–2) — is a library job for three helpers in a repo that is
`private` and exports nothing. The harvest owns its own logic: it never renders and never
applies posture, so it needs none of forage's. If the app ever needs harvest logic at
runtime, the register names croft-pwa as the library home.

**Why a hand-authored providers list and not only a floor.** Search sees ~66% of what a
creator actually publishes: `getActorFeeds` returned 1.51× the feeds search knew about
for the same 400 creators, zero errors (D3). Seeding *accounts* and expanding them is one
request each, self-refreshing (a trusted curator's new feed appears on the next run), and
never ships a dead pin. Pinned at-uris are reserved for the 19 popular feeds search cannot
find and for the community feeds (Blacksky, Eurosky) whose value is not their like count.

## Evidence (probed live, unauth `public.api.bsky.app` unless noted)

Feed probes 2026-09-01; pack probes 2026-09-04 (this session) and 2026-09-04 (the prior
session's 145k crawl, its numbers re-verified here from its data, not taken on trust).

### D1 — the feed universe, by enumeration lever

| Corpus | Size | Cost |
|---|---|---|
| browse (`getPopularFeedGenerators`, no query) | 117 | 2 req, 0.65 s |
| `unspecced.getSuggestedFeeds` (editorial) | 24 (14 not in browse) | 1 req |
| 324-query search sweep (letters, digits, ~290 topic/language/community words) | **56,128** | 1,159 req, 68 s, 0 errors |
| creator expansion (`getActorFeeds`, projected) | ~79,000 | ~1 req/creator |
| relay `listReposByCollection` | 22,799 DIDs (west) / 21,841 (east) | 12 req, 3.9 s |

The relay list is **not** ground truth: the two relays disagree, and 18,005 creators with
live generator records (confirmed via `getActorFeeds`) are absent from it. The DIDs only the
relay knows are mostly deleted or zero-like utility feeds (sampled 8: three returned no
feeds; the rest "stalk", "urn", "Only posts", and a Korean cluster at 0 likes).

Providers (the service DID): 1,067 distinct; skyfeed.me 67.9%, api.graze.social 7.1%,
blueskyfeedcreator.com 5.7%, bluefacts.app 5.6%, then a long tail. Creators: 28,952;
bimodal — bsky.app 99k likes over 5 feeds, clarabelle.xyz 47k/64, bsky.art 40k/16,
skyfeed.eu 39k/26, rude1.blacksky.team 34k/6; against **bluetrends.bsky.social with 2,966
feeds for 3,421 likes** and `handle.invalid` (deleted accounts) holding 619. Any creator
expansion needs a per-creator cap or it inherits thousands of machine rows.

Labels: **270 of 56,128 feeds** (0.5%) carry any — porn 184, sexual 76, nudity 11 — while
the top-20 popular-but-unlisted feeds visibly include unlabeled adult feeds. A label in the
index is a hint, never the authority.

### D2 — determinism and churn

Identical 324-query sweep, 15 minutes apart: 56,128 → 56,128 feeds, **0 only-in-run-1,
0 only-in-run-2**; at the 100 floor 1,313 → 1,313, 0 membership churn; `likeCount`
changed on 1 of 1,313 (by 1).

### D3 — what search cannot see, and the lever that can

19 of the 117 browse feeds were never returned by any query — OnlyPosts (21,171 likes),
What's Hot Classic (10,368), The 'Gram (8,276), Mentions (7,731), Latest From Follows,
Best of Follows … Popularity does not buy presence in the search index.

`getActorFeeds` on 400 random creators: search knew 719 of their feeds, the endpoint
returned **1,088 (1.51×)**, 0 errors, 1 creator needed a second page. Named cases:
skyfeed.eu 80 vs 26, clarabelle.xyz 73 vs 64, why.bsky.world 34 vs 18.

### D4 — grouping metadata that does and does not exist

| Dimension | Source | Verdict |
|---|---|---|
| builder platform | `did` | free; `/feeds` already renders "built on …" |
| popularity | `likeCount` (all-time) | free, live |
| labels · video · age | `labels` · `contentMode` (382 video, 29 media) · `indexedAt` | free |
| **topic** | — | **absent**; `getTaggedSuggestions` = 23 tags, all `subjectType: user`, 0 feed rows |
| **language** | — | **absent**; script detection works (7.8% non-Latin: Japanese 4.9%, CJK 2.2%, Hangul 0.4%); Latin-script needs a stopword heuristic (pt 3.8%, pl 1.3%, fr/de/es 0.6% each) |

### D5 — the floor, liveness, and the language cliff

Liveness by `getFeed` on 120 feeds per like band: **1000+: 85% live · 100–999: 87% ·
10–99: 78% · 2–9: 59% · 0–1: 52%** (live = newest post < 7 d; the rest dead > 90 d,
stale, empty, or silent 4xx/502). 100 is the knee; below 10 is a coin flip.

Bare `likes ≥ 100` = 1,313 feeds, 60 KB gzipped. Non-Latin scripts clearing it unaided:
Hiragana 13 of 1,674, CJK 9 of 1,247, Katakana 2 of 1,071, Hangul 2 of 217, **Thai / Greek /
Arabic / Hebrew / Devanagari / Tamil / Bengali: 0**. A top-25-per-script rescue below the
floor adds 135 rows. Union with browse (+19) and suggested (+2): **1,469 feeds, 60 KB gzip**
without counts, 65 KB with.

Third-party directories are not a cheap seed: goodfeeds.co, blueskydirectory.com and
ikada.net are client-rendered with zero at-uris in their HTML, `goodfeeds.co/api/all`
returns the app shell, blueskyfeeds.com did not answer. Out of scope.

### D6 — the jumpstart universe (both crawls)

Prior session (2026-09-04, `q=*` wildcard, 1,500-page cap): **144,908 packs, not
exhausted, 42 min.** Re-verified from its data here: 92% zero all-time joins; **1,341 ≥ 10
joins; 84 ≥ 100; 52 with any weekly joins**; 21.0% carry ≥ 1 feed (the lexicon caps at 3);
among packs with ≥ 10 joins, 26% carry feeds.

This session (2026-09-04, 300 wildcard pages + 64 themed queries, capturing feed URIs):
**51,083 packs in 464 s**; 29.9% carry feeds. `searchStarterPacksV2` is unauth, returns
the full `starterPackView` (record, creator, `joinedAllTimeCount`, `joinedWeekCount`,
`labels`, `feeds[]`, `list.listItemCount`, a 12-member sample), takes only `q`/`limit`/
`cursor` — no sort parameter (the prior session tested `sort=top|joined|popular`, byte-
identical). `unspecced.getSuggestedStarterPacks` returns 3 rotating packs regardless of
limit: a sample, not a leaderboard. Wildcard order is popularity-weighted but rough (first
10 pages hold ~40% of the true top 10).

Seed sizing from this crawl (projected ×1.6 for the full corpus is the upper bound):

| joins floor | packs | gzip | carrying feeds |
|---|---|---|---|
| ≥ 100 | 59 | 6 KB | 15 |
| ≥ 20 | 432 | 46 KB | 110 |
| **≥ 10** | **818** (≈1,341 full) | **86 KB** (≈140 full) | 208 |
| ≥ 5 | 1,634 | 171 KB | 408 |

### D7 — the edges

From the 51k crawl: **6,344 distinct feeds referenced by packs.** 4,471 are in the 56k
search corpus; **1,873 are not** — feeds only a pack can lead you to. 916 are in a
likes-100 seed; **5,428 are not**.

Top feeds by pack inclusion, against their like count: Popular With Friends 2,907 packs /
41,323 likes · Science 1,638 / 29,442 · Mutuals 1,569 / 28,778 · Artists: Trending 1,504 /
32,777 · News 1,275 / 23,975 · **Bluesky Team 637 / 5,850** · BookSky 622 / 25,684 ·
Blacksky 563 / 28,106 · Gardening 499 / 13,794. And the other way: **Discover, 39,410
likes, in 1 pack**; For You, 52,693 likes, in 131. The two rankings disagree, which is the
point.

### D8 — publishing: what a browser can fetch

| host | public | CORS | verdict |
|---|---|---|---|
| Actions artifact | no (token) | — | ✗ and expires |
| Release asset | yes | **no `access-control-allow-origin`** on the final hop (`release-assets.githubusercontent.com`) | ✗ `fetch()` blocked |
| raw.githubusercontent.com | yes | `*`, max-age 300 | ✓ but not a production CDN |
| **GitHub Pages** | yes | `*`, max-age 600 | ✓ (measured on forage.fyi) |

### D9 — the client cost

1,313 rows: JSON parse 1.5 ms, substring scan **0.085 ms per query**, 5.9 MB heap (Node;
a phone is slower but not by the factor that would matter). No index structure, no library.
`sw.js` precaches ~60 shell files today; ~220 KB more is within its existing budget.

## Decisions (owner, during research)

- **D-floor:** `likes ≥ 100` for feeds (2026-09-01) — with the D5 carve-outs, since a
  bare floor is an English filter. Packs: `joins ≥ 10`, the analogous knee (D6).
- **D-labels:** include labeled feeds and packs, **tag them in the index** (2026-09-01).
  The tag saves a round-trip; `feedDisposition` and the account posture remain the
  authority (DL-035 unchanged: no discovery-local toggle).
- **D-publish:** the index is published and fetched, **never merged** into forage
  (2026-09-01). D8 makes that a Pages site.
- **D-noun:** starter packs are **"jumpstarts"** in forage's copy "for now" (2026-09-04).
  `docs/NAMING.md` is canonical and gets the entry (§ Phase 5); the UI glosses it once.
- **D-fold:** feeds and jumpstarts are one plan, one index, one graph (2026-09-04).
- **D-runtime:** no server-side component; CI-built, PWA-cached (2026-09-04).

## The units

Every unit is RED-first. Pure functions in `js/` get `node --test` units; the harvest gets
its own suite in its own repo; anything with a DOM gets a workflow journey under `e2e/`.
Each phase leaves both repos green and is landable alone.

### Phase 0 — the index repo exists (blocked on the owner: § Open questions Q1)

- [ ] `CroftCommunity/forage-index` (name: Q1), Pages enabled, `CNAME` decided (Q2).
- [ ] `harvest.mjs`, Node stdlib only, `.nvmrc` + `engine-strict` per CI-PATTERN rule 7.
  Inputs: `providers.json`, `queries.json`. Output: `index.json`, sorted by `uri`, fixed
  key order, no timestamps in the payload (a sibling `meta.json` carries `generatedAt` and
  the counts). Steps: sweep → browse → suggested → creator expansion (cap 25 feeds per
  creator) → language rescue → packs wildcard (cap 400 pages) + themed → edges → guard.
- [ ] **The guard**: refuse and exit non-zero when feeds < 80% of published or < 500, or
  packs < 80% or < 300; 429-aware backoff; whole log to a file, exit status branched on
  (VERIFICATION shape 1).
- [ ] Workflow: `schedule` weekly + `workflow_dispatch`; `permissions: contents: read` at
  the top, `pages: write` + `id-token: write` only on the publish job; `timeout-minutes`
  on every job; actions pinned by SHA (SUPPLY-CHAIN). Pull the dispatch hatch once.
- [ ] Both crawler scripts move here from the two scratchpads (they are not "ported"
  anywhere — this is their first home); the D-numbers above cite this plan.

### Phase 1 — the schema and the hand-authored half

- [ ] `index.json` schema, versioned (`"v": 1`):
  `feeds[] {uri, name, desc≤160, creator, platform, band, tags[], lang?, labels?, video?}` ·
  `jumpstarts[] {uri, name, desc≤160, creator, members, band, tags[], labels?}` ·
  `edges[] [packUri, feedUri]` · `providers[] {handle, kind, tags[]}` — a JSON Schema in
  the index repo, and forage validates on the way **in** (LEXICONS.md rule 4 applied to
  our own artifact: a malformed index is our bug, and it must fail loud, not render
  garbage).
- [ ] `providers.json` v1: ~150 rows — the top-25 curators by total likes, the community
  accounts (bsky.app, bsky.art, rude1.blacksky.team, eurosky.social, furryli.st,
  skyfeed.eu, why.bsky.world, aendra.com, bossett.social, jnascim.info …), the
  official-but-unlisted pins (D3's 19), each with `tags` from a **fixed vocabulary** that
  starts from Bluesky's own 23 (D4) plus `lang:*` and `community:*`.
- [ ] `queries.json` v1: the 324 from D1, as data.
- [ ] `band`: 0–4 from all-time likes/joins at harvest time, so a first paint has an
  order and the diff never carries a raw count.

### Phase 2 — forage consumes the index

- [ ] `data/feed-index-fallback.json`: 150 feeds + 50 jumpstarts, generated by the same
  harvest with `--fallback`, committed by hand; added to `sw.js` `SHELL`.
- [ ] `js/substrates/index.js` (new): load fallback → fetch published index →
  validate → merge; exposes `feeds()`, `jumpstarts()`, `feedsInPack(uri)`,
  `packsWithFeed(uri)`, `search(q)`; every result carries `source: 'fallback' | 'index'`
  and the index's `generatedAt`, so the UI can say how old what it shows is.
- [ ] `sw.js`: an explicit allow-list for the index origin, stale-while-revalidate — the
  ONE cross-origin exception, stated at the site (as the nav file states its one).
- [ ] `lens.js discoverFeeds`: browse corpus ∪ index feeds, a provenance chip
  ("Bluesky lists it" / "in the index" / "in N jumpstarts"), posture applied in the shape
  layer exactly as 4a. Hydrate counts via `getFeedGenerators` in batches of 25 as rows
  enter the viewport (the 4c idiom).
- [ ] `/feeds` search: index first (instant, offline), then "look wider on Bluesky" as the
  existing passthrough — the honest wording from 4b stays.
- [ ] Journeys: index-host-down → fallback with words; malformed index → refused with
  words, fallback shown; offline → cached index.

### Phase 3 — jumpstarts

- [ ] `/jumpstarts`: a browse page shaped like `/feeds` — search, sort (popular · newest ·
  most members · most feeds), the platform chip replaced by a **creator** chip; posture
  applied to pack labels through the same disposition path.
- [ ] `/j/<handle>/<rkey>`: one jumpstart — its description, its feeds (from the index,
  then hydrated), its member sample (live, `getStarterPack`), and a "follow all" that is
  honest about what a guest can do (nothing) and what a session can (a batch of follows
  — session-gated, D-tier as `/h/`).
- [ ] `nav.js`: `item('jumpstarts', 'Browse jumpstarts', …)` beside Browse all feeds.
- [ ] Feed row → "in N jumpstarts" from `packsWithFeed`; the Constellation count (4g)
  stays as the *live* number where the rail's adoption block already shows it — the two
  can disagree (index age vs now) and the UI says which is which.

### Phase 4 — the right rail as panels

- [ ] `rail.js`: the stored word grows from `on|off` to an ordered list of panel ids,
  device-local like the card size; corrupt value → default, never an empty rail.
- [ ] Panels: `jumpstarts` (Popular jumpstarts, default first), `trending` (topics →
  boards, the existing source), `suggestions` (today's), `signin` (guest only, unchanged).
- [ ] Settings row: the existing "Side panel" switch becomes a small ordered chooser.
- [ ] Mock per MOCKS.md: Current beside Proposed at 390×844 and 1280×900, one skin, a
  population whose packs carry the widest counts and a labeled row.

### Phase 5 — naming, copy, records

- [ ] `docs/NAMING.md`: "jumpstart" — the noun, why not "starter pack" (the network's
  word for the network's object; ours is a forum's door), the gloss the UI shows once.
- [ ] `docs/adr/0005-…`: the index as a second origin — narrower than ADR-004, our own
  file, degrade-to-fallback; amends nothing in ADR-002.
- [ ] `CHANGELOG.md` `[Unreleased]` entries per landing phase; ledger rows for the two
  new dispositions (index-vs-live disagreement; a labeled row from the index).
- [ ] `TODO.md`: the device debt — the index fetch and sw cache on a phone on cellular
  `[device: android x2]`.

### NOT doing

- A server, a proxy, an AppView fork, Jetstream (E139 stays a post-stream question).
- Importing third-party directories (D5 — not machine-readable; terms unread).
- Trending jumpstarts as a default (D6 — 52 rows, NSFW-heavy). It can be a sort.
- A discovery-local adult toggle (DL-035 stands).
- Making forage an npm package for the harvest's sake (SHARED-CODE rules 1–2 — nothing
  crosses the boundary but JSON).
- `likeCount`/`joinedAllTimeCount` inside the index (D2 — churn).

## Open questions — owner

- **Q1 — the repo's name.** `forage-index` is the placeholder. It will be public and its
  Pages URL is user-visible in devtools; a name that reads as forage's is fine.
- **Q2 — the host name.** `index.forage.fyi` (a CNAME, one DNS row, cert by Pages) or the
  bare `croftcommunity.github.io/<repo>/`. The former survives a repo rename; the latter
  needs no DNS. Memory says this machine's resolver lies about new domains — verify
  against the authoritative NS.
- **Q3 — fallback regeneration cadence.** By hand, when someone notices — or a reminder
  in `DEVICE-QUEUE`-style generated register? Proposal: by hand, with `meta.json`'s
  `generatedAt` shown in Settings so staleness is visible.
- **Q4 — "follow all" on a jumpstart.** Build it in Phase 3 (a batch of `app.bsky.graph.follow`
  writes through the PDS proxy, session-gated) or defer to a plan of its own? It is the one
  write this plan introduces.

## Review Log

### Pass 1 — research (2026-09-01 → 2026-09-08)

Two sessions. Feeds: this session, 2026-09-01 (sweep ×2, relay enumeration, creator
expansion, liveness sample, sizing, CORS). Packs: a prior session's 145k crawl 2026-09-04
(re-verified from its data), and this session's 51k edge-capturing crawl the same day.
The owner's decisions (§ Decisions) were taken in conversation on 2026-09-01 and
2026-09-04; the fold and the no-middleman constraint on 2026-09-04. SHARED-CODE landed
mid-plan (2026-09-08) and was read before this file was written; its consequence is one
paragraph in § Reasoning and one line in § NOT doing. Mixes (#62) landed the same day and
changed the left bar this plan extends — the nav section was re-read at `d8ff6a9`.
