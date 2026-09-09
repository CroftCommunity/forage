# The feed index — the file, its shape, and how to bring your own

**This file is canonical** for `data/feed-index.json`: what it is, what it is not, how it
is built, and how a forager (or a community) replaces it. Plan:
`plans/2026-09-08-plan-feed-index-and-jumpstarts.md`; the pure core is `js/feed-index.js`.

## What it is

A file, built weekly by CI and committed to `main`, that says **what feeds and jumpstarts
exist and what they are about** — so `/feeds` and `/jumpstarts` can show thousands of
things instead of the 117 the AppView lists as popular, search them instantly and offline,
and say which jumpstart names which feed. It is served from forage.fyi like every other
file and cached by the service worker with the shell.

It is **not** a server. It answers no query and sees no user. Everything live — a feed's
content, its like count, a jumpstart's members, whether a feed is still alive — still
comes from the AppView, per request, exactly as before. The file only widens *which
things the app knows to ask about*.

It carries **no counts**. Likes and joins are free at read time and moved on a feed
within fifteen minutes of a run, so a count inside the file would churn the weekly diff
that is the whole review artifact. A **band** (0–4, a decimal magnitude at harvest time)
is the rank hint instead.

## The shape (`"v": 1`)

```json
{"v":1,
"feeds":[
{"uri":"at://did:plc:…/app.bsky.feed.generator/…","name":"…","desc":"≤160 chars","creator":"handle",
 "platform":"skyfeed.me | null","band":2,"tags":["topic:art","lang:pt"],"lang":"pt","labels":["sexual"],"video":true}
],
"jumpstarts":[
{"uri":"at://did:plc:…/app.bsky.graph.starterpack/…","name":"…","desc":"…","creator":"handle","members":44,"band":1,"tags":[]}
],
"edges":[
["at://…/app.bsky.graph.starterpack/…","at://…/app.bsky.feed.generator/…"]
],
"providers":[
{"handle":"bsky.app","kind":"official","tags":["official"]}
]
}
```

- Rows are **unique and sorted by `uri`**; `edges` are `[jumpstart, feed]` and both ends
  must be rows in the same file; `providers[].kind` is one of `curator | community |
  official | platform`. `lang`, `labels`, `video` are optional. Nothing else is read.
- `js/feed-index.js` → `validateIndex(obj)` is the one validator, on both sides: the
  harvest runs it before writing, the app runs it on the way in. A file that fails is
  **refused with words** — the page shows the live list alone and says which row and why.
- A `labels` value is a **hint** that saves a round-trip. Only 0.5% of feeds carry any
  label on the network while adult feeds visibly exceed that, so the app's moderation
  posture — the account's own settings, or the guest floor — is the authority, and it
  re-applies once the live view arrives.

`data/feed-index-meta.json` beside it carries `generatedAt`, the counts, and the cost of
the run. It is the only place a timestamp lives; the index itself is byte-stable for the
same corpus.

## How it is built

`npm run harvest` (`scripts/harvest-feeds.mjs`, Node stdlib, no dependencies) reads two
**hand-maintained** inputs and writes the two generated files:

- `data/feed-providers.json` — accounts the harvest expands with `getActorFeeds` (search
  sees only ~66% of what a creator publishes), builder platforms for the record, and
  `pins`: feed at-uris kept regardless of likes.
- `data/feed-queries.json` — the search terms swept against `getPopularFeedGenerators`
  and `searchStarterPacksV2`.

Then: sweep → the AppView's own browse and suggested lists (kept regardless of floor) →
provider expansion → a wildcard walk over jumpstarts plus themed queries → the feeds only
a jumpstart leads to, hydrated → the floors (100 likes, 10 joins; a top-25-per-script
rescue below the floor so a bare floor is not an English filter; 25 feeds per creator so
one machine account cannot ship thousands of rows) → validate → **the guard** → write.

**The guard** refuses to write when the harvest is materially smaller than the committed
file (under 80%) or under an absolute floor (500 feeds, 300 jumpstarts), and exits 2 —
a run that graded an empty set must not be green. The first real run (2026-09-08) hit
exactly this: a laptop slept mid-walk, the pack corpus came back at 291, nothing was
written. `.github/workflows/feed-index.yml` runs it weekly and commits the result to
`main` only on exit 0.

## Bring your own

The index is an editorial act — whoever writes `feed-providers.json` decides what a
forager finds first. So it is yours to dump. Under **Advanced** on your account page:

- **Add** your file over Forage's (yours wins where a `uri` collides);
- **Replace** Forage's with yours alone;
- **Off** — the live list, nothing prepopulated.

Your file goes through the same validator; a refused one leaves the previous good one in
place and tells you which row and why. Every row on `/feeds` says whose it is. This is
device-local today, like the card size; a record on your PDS that follows you between
devices is the named follow-up (`TODO.md`).

To build your own from your own list: `npm run harvest -- --providers my-providers.json
--out my-index.json` (and `--queries` to sweep different terms). The file format, not our
hosting, is the interface — a community can build one and hand it around.
