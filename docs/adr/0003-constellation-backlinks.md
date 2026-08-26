# ADR-003: Feed-adoption signals read from Constellation, a second read host

Tags: appview, atproto, backlinks, third-party

Date: 2026-08-26
Status: accepted
Amends: ADR-002 (wide-lens intake is AppView pull)
Gates: 4g of `plans/2026-08-26-1-plan-feed-discovery-sorts.md` (OQ2)

## Context

ADR-002 fixed wide-lens intake as **AppView pull** — `public.api.bsky.app` for a
guest, the PDS proxy for a session — with no second data plane. That decision
was about *ingesting posts*, and it has held.

Feed discovery raises a different question. The owner asked (2026-08-26) which
dimensions we can sort and filter feeds on. Probing (plan D1–D8) found that the
AppView exposes exactly one popularity signal for a feed generator: `likeCount`,
plus the 7d/30d windows we now count ourselves off `getLikes` (4c). It exposes
nothing about how feeds are *used* or *recommended*, and DL-029 records why that
gap is permanent: joining a feed writes `savedFeedsPrefV2`, which is per-actor
private, and `app.bsky.feed.save` holds **zero** records network-wide.

`constellation.microcosm.blue` — an atproto-wide index of record backlinks,
17.6B links over 575 days of firehose — answers questions the AppView cannot,
for the same feed URI (probe-verified 2026-08-26, ~0.15s per call):

```
app.bsky.feed.post         .embed.record.uri        4,287   posts quoting the feed
app.bsky.graph.starterpack .feeds[].uri               965   starter packs including it
app.bsky.feed.generator    .skyfeedBuilder…feedUri       4   feeds built ON this feed
app.bsky.feed.like         .subject.uri            52,558   (agrees with likeCount)
```

Those first two are genuinely different from a like: a quote is a person
recommending a feed in their own words, and a starter-pack inclusion is a
curator staking their pack on it. And they are time-windowable at no extra
cost, because Constellation returns `{did, collection, rkey}` newest-first and
an atproto rkey is a **TID encoding a microsecond timestamp** — decoded values
matched `getLikes` `createdAt` to 0.15s.

## Decision

Forage reads **feed-adoption signals** from Constellation, as a strictly
additive, strictly optional second read host. Concretely:

1. **Scope is narrowed to backlink counts on feed generators.** Constellation is
   not an intake path. No post, thread, profile, or timeline content comes from
   it. ADR-002 stands unamended for everything it actually decided.
2. **Every Constellation-derived signal degrades to absent.** If the host is
   slow, down, or gone, the affected sorts disappear with words and the rest of
   discovery is unchanged. Nothing on the page waits on it.
3. **The user-agent identifies us**, as the operator asks: project name and the
   owner's contact.
4. **Nothing is sent that the AppView did not already receive** — the request
   carries a public feed URI and nothing about the viewer. No session, no DID,
   no preferences. A guest's Constellation request is indistinguishable from
   anyone else's.

## Reasoning

Three reasons this is worth a second host when ADR-002 refused one.

- **It answers a question with no other answer.** ADR-002 rejected Jetstream
  because a DID-filtered stream cannot compute other people's engagement — the
  AppView had already done that job. Here the AppView has *not* done the job and
  structurally will not: no endpoint counts quotes-of-a-feed or pack-inclusions.
  The reasoning that rejected the earlier second plane argues *for* this one.
- **The cost shape is nothing like an index.** ADR-002's rejected option was a
  local index we would have to build, fill, and keep fresh. This is one HTTP GET
  per feed against someone else's already-built index, on a surface the user
  opted into by choosing a sort.
- **The failure mode is a missing sort, not a broken app.** Because it is
  additive and per-signal, the blast radius of the dependency is bounded by
  construction — which is exactly what ADR-002's "no second data plane" was
  protecting against.

The honest cost, recorded rather than argued away: this is a **volunteer-run
public instance** with no uptime commitment, and it is a party that learns which
feeds Forage users are curious about. Point 4 bounds the second concern to what
is already public; the first is why point 2 is non-negotiable.

## Consequences

- Discovery gains "Most shared" and "In starter packs", each time-windowable via
  TID decoding, and each able to vanish without taking the page with it.
- A TID decoder enters the codebase. It is pure, testable, and verifiable
  against `getLikes` timestamps — that cross-check is a test, not a one-off.
- If Constellation disappears permanently, 4g is deleted and DL-029 stands
  unchanged: adoption goes back to being unmeasurable, which it already is.
- Revisit if Bluesky ever exposes quote-of-feed or pack-inclusion counts
  directly, at which point this host stops earning its place.
