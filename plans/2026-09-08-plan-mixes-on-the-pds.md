# Plan: mixes on the PDS — a mix follows the reader, not the device

date: 2026-09-08
**Status:** PHASES 0–5 and 7 BUILT (2026-09-08; owner: "agreed to all 4"); the live proof
passed against the real PDS. **Phase 6 (socialize) is the owner's to post** — the draft is
in § F below. Acts: investigate DONE · validate DONE · publish is the namespace's owed act,
unchanged (D3) · socialize DRAFTED. On `claude/mixes`, PR #62. Follows
`plans/2026-09-08-plan-mixes.md`, whose D4 was *"device local for now, yes, pds later, yes"* —
this is the "later".
repo: `CroftCommunity/forage`
baseline: `claude/mixes` @ `f1fc180` (Phases 0–9 of the mixes plan)
branch: `claude/mixes` (the doc and the work — the owner kept PR #62 open on the branch)

## Problem Statement

A mix lives in one browser's storage today. **Alice** tunes Home on her laptop — Science to
More, the noisy hashtag off, a Weekend mix of three rows — and opens Forage on her phone:
Home is there, complete, because Home needs no stored definition, but it is at Normal
everywhere, the hashtag is back, and Weekend does not exist. A tag subscription would have
followed her: `fyi.forage.tagsub` is a record in her repo, and `effectiveTags()` reads the
union of the local list and the published one. A mix should follow her the same way.

The reason it does not yet is the reason the first plan deferred it: minting a record type
is *cheap and permanent* (LEXICONS.md), and the four acts that make one legitimate —
investigate, publish, socialize, validate — are a week of work that should follow a shape,
not precede it. The shape has now existed for a day. This plan is the four acts, plus the
plumbing that makes a mix a two-halves object like a tag subscription.

**What the record is not.** It is not a feed. A `fyi.forage.mix` record says *how this reader
composes their own subscriptions*; it is readable by anyone (every repo record is) but
meaningful only to a client that has the reader's subscriptions to compose. Nobody else can
open Alice's Weekend and see what she sees, because the rows point at *her* follows, *her*
saved feeds, *her* tags. That matters for act 3: it is not a shareable thing pretending to
be private, and it is not a private thing accidentally published.

## Act 1 — Investigate (DONE 2026-09-08)

Three corpora, per LEXICONS.md § 1, and what was opened in each:

| Candidate | What it holds | Why it does not fit |
|---|---|---|
| `app.bsky.actor.defs#savedFeedsPrefV2` (opened: `lexicons/app/bsky/actor/defs.json`) | `items[]` of `{ id, type: feed \| list \| timeline, value, pinned }` — the saved-feeds list itself | It is the **subscription list**, one flat set; no hashtag type (already the reason `tagsub` exists), no weight, no on/off, and no second list — a reader has exactly one. A mix is a *view over* this list, and there is no room in it for a second view, let alone a named one. It is also a **preference**, not a record: a private, server-side blob the official client owns and rewrites wholesale on every save |
| `app.bsky.actor.defs#feedViewPref` (same file) | per-feed display switches: `hideReplies`, `hideReposts`, `hideQuotePosts`, `hideRepliesByLikeCount` | The closest thing in the official namespace to "a setting about one feed", and it is about *what to hide inside a feed*, keyed by one feed at a time. No composition, no weight, and the same preference-blob problem |
| `app.bsky.feed.generator` (opened: `lexicons/app/bsky/feed/generator.json`) | a feed **service** declaration: `did`, `displayName`, `description`, `avatar`, `contentMode` | A generator is a server that answers `getFeedSkeleton`; a mix is composed in the client from the reader's own subscriptions and has no server. **Skyfeed's precedent was checked:** its builder stores a `skyfeedBuilder.blocks[]` block *on* the generator record (extra fields are permitted by the Lexicon object model) and every such feed resolves to `did:web:skyfeed.me`, i.e. it is still a real generator with a real server. A mix has neither, so riding the generator record would declare a feed nobody can fetch |
| `app.bsky.graph.list` + `listitem` | curated **people** | A list of accounts is one *source kind* a mix can hold, not the mix |
| `community.lexicon.*` — **the GitHub repo `lexicon-community/lexicon` is ARCHIVED (2026-07-27); development moved to `tangled.org/lexicon.community/lexicons`** — opened at the new home: `app`, `bookmarks`, `calendar`, `interaction`, `location`, `payments`, `preference` | app profiles/listings/localization; bookmarks and bookmark queries; events and RSVPs; generic likes; places; web-monetization; AI-use preference | Nothing composes feeds and nothing subscribes to anything (the same finding the `tagsub` check made, re-confirmed at the new home). `preference.ai` is the only preference type and it is about data use, not reading |
| Namespaces we consume | `exchange.recipe.*` (arecipe) | Not this domain |

**The pattern the rejections share, which is the actual justification:** the ecosystem models
*what you subscribed to* (savedFeeds, lists, follows, our tagsub) and *what a feed is*
(generator). Nothing models *how one reader arranges their own subscriptions into a board*.
That object exists only in the reader's client, and today only in one browser of it.

**Preference order (LEXICONS.md, owner 2026-08-29):** `app.bsky.*` only when the record must be
visible in an official client — a mix never is, so no. `community.lexicon.*` otherwise —
nothing there holds it, and proposing a *"how one client composes its subscriptions"* type to
the shared namespace is worth raising (act 3) but is exactly the nuance the owner named
(*"sometimes it's nuanced esp with our desire with forage for mirroring bsky"*): the rows point
at Bluesky-specific source kinds. So: **own namespace, `fyi.forage.mix`, with this table as its
register entry.**

**A finding for this repo's register, corrected once already:** the first draft of this
paragraph said the workspace's `LEXICONS.md` pointed at the archived GitHub repo. It does not —
it names the local `discovery/alpha/experiments/lexicon-community/` work and no URL. The stale
citations are in **`docs/LEXICON-REGISTER.md`** (its corpus note and the `tagsub` entry's
*"re-run against `lexicon-community/lexicon@main`"*), which now say the corpus moved to Tangled
on 2026-07-27 and the archived repo is a historical citation. (Checked by grep before
claiming it; the first claim was written from memory of the register, not the doc.)

## Approach

### A. The record — `lexicons/fyi.forage.mix.json`

```
fyi.forage.mix  (record, key: see D1)
  name        string, 1–60 graphemes
  home        boolean — this record holds Home's OVERRIDES (see D2); at most one per repo
  rows        array of row, max 200
    row       { source: union, on: boolean, weight: number ∈ {0.5, 1, 2} }
    source    #timeline {}  |  #feed { uri: at-uri }  |  #list { uri: at-uri }  |  #hashtag { tag: string }
  createdAt   datetime
  updatedAt   datetime
```

One record per mix. The row's `source` is a **closed union of four kinds**, one per
subscription kind the mix model already has (`js/mixes.js` `sourceId`/`sourceFromId` are the
codec and do not change). `weight` is enumerated in the schema, so the three notches are the
schema's rule and not a hand-rolled clamp — the same reason `tagsub.tag` carries `minLength`.

**Home** (D2, recommended): a record with `home: true` holding only the overridden rows,
exactly what the device stores today. Absent record = untouched Home. The client refuses to
write a second `home: true` and, on read, takes the newest by `updatedAt` and reports the rest.

### B. Two halves, the tagsub pattern

`js/mixes.js` keeps the local half unchanged. A new `js/mixes-pds.js` mirrors
`js/tagsubs-pds.js`: a per-DID cache of published mixes (`forage.mixes.pds`), `refreshPublished`,
`publishMix(slug)` (create or update the record, then drop the local copy), `unpublishMix`,
and **`effectiveMixes(did)`** — the one list the rest of the app reads: published wins on a
slug collision, local otherwise. The Mixes page grows the same *Save to PDS* / *Remove from
PDS* control the hashtag panel has, per mix, and Home's overrides are published or local as
one unit.

Why per-mix and not all-or-nothing: the tagsub precedent (*local by default, published per
item on purpose*), and a mix a reader is still fiddling with should not round-trip to the PDS
on every notch.

### C. The lens writes — `lens.js` + `test/invariants.test.js`

`saveMix(record)` → `com.atproto.repo.putRecord` (create or replace at a known rkey) or
`createRecord` (D1 decides which); `removeMix(rkey)` → `deleteRecord`; `mixRecords()` pages
`listRecords`. `test/invariants.test.js` counts every lens write by regex — adding a
collection means arguing for it there first (AGENTS.md); this plan is the argument, and the
count moves from six `createRecord` to whatever D1 makes it.

### D. Validate on read — act 4

Every record read is validated against `lexicons/fyi.forage.mix.json` before it becomes a
mix (`js/lexicon.js` already does this for tagsub; a real PDS accepted a tagsub record
missing every required field, 200). A record that fails is reported with words on the Mixes
page (*"one published mix could not be read"*) and never silently dropped or silently repaired.

### E. Publish — act 2

`fyi.forage.*` is **unpublished** today (register: *"unpublished is a stage, not a
destination"*). This plan does not change that by itself (D3), but it must say which stage
it is in: `mix` joins `tagsub` as a type that carries user data in a namespace whose
`_lexicon.forage.fyi` TXT record and `com.atproto.lexicon.schema` records do not yet exist.
Publishing the namespace is one act for all of `fyi.forage.*`, and it is owed by the
register's own TODO, not by this plan.

### F. Socialize — act 3 (the owner's to post; draft below)

Before the record carries a second reader's data: a post on the lexicon.community forum
(`discourse.atmosphere.community/c/lexicon-community/31`, the repo's stated home for
discussion). The answer is recorded in the register entry either way. Draft, to post as-is
or reword:

> **A per-reader "mix" of subscriptions — is a shared shape wanted?**
>
> Forage (forage.fyi, a forum-shaped Bluesky reader) is adding a record for how one reader
> arranges their own subscriptions into a single board: the Following timeline, saved feeds
> and lists, and hashtag subscriptions, each as a row with an on/off switch and a weight
> (`less | normal | more`). One record per mix, keyed by the mix's slug. It is meaningful
> only to a client holding the writer's subscriptions — nobody else can open it and see the
> same board — so it is not a feed and not a share; it is closer to a preference that
> happens to need to follow the reader between devices, which `savedFeedsPrefV2` (a
> server-side preference blob the official client rewrites whole) cannot do.
>
> We looked at `savedFeedsPrefV2`, `feedViewPref`, `app.bsky.feed.generator` (and Skyfeed's
> builder-on-the-record pattern), `graph.list`, and the seven `community.lexicon.*`
> namespaces at their new home, and found nothing that composes subscriptions. We are
> minting `fyi.forage.mix` for now. If a shared shape for "one client's composition over
> Bluesky subscription kinds" is something this community would want under
> `community.lexicon.*`, we would rather contribute it there than keep it ours — with the
> caveat that its rows name Bluesky-specific kinds. Schema:
> `github.com/CroftCommunity/forage/blob/main/lexicons/fyi.forage.mix.json`.

## Decisions

| # | Question | Options | Recommendation |
|---|---|---|---|
| **D1** | The record key | (a) `tid` — a new record per mix, the slug inside; (b) `literal:<slug>` — the rkey **is** the slug, `putRecord` creates or replaces | **(b).** A mix is addressed by its slug everywhere (`/m/<slug>`, `/mixes/<slug>`, the nav id); a `tid` key means a second index from slug to rkey and a rename that leaves an orphan. With the slug as key, publishing Weekend twice is one record, and a rename is a delete plus a create — which is what a rename of an *address* is. Slugs are already lowercase `[a-z0-9-]`, which is a valid rkey |
| **D2** | Is Home a record? | (a) yes, `home: true`, overrides only; (b) no — Home stays device-local, only custom mixes publish | **(a).** The thing Alice loses across devices is *Home's tuning*, not Weekend. A Home that does not follow her is the whole problem restated |
| **D3** | Does this plan publish the namespace? | (a) no — mint the type, keep the register honest about the stage; (b) yes — do the TXT record and schema records for all of `fyi.forage.*` here | **(a), and say so.** Publication is one act for the namespace, already owed by the register's TODO, and bundling it here couples a lexicon-wide act to one feature. But the register line for `mix` must read *unpublished (stage)* on the day it lands, not *published* |
| **D4** | Weight on the wire | (a) the multiplier as a number `{0.5, 1, 2}`; (b) a string enum `less \| normal \| more` | **(b).** A schema enum of strings survives a fourth notch (add a word) and cannot be written as `1.5` by another client; the number is the client's business (`js/mixes.js` maps both ways). This is the one place the on-device shape and the record differ |

## Phases

### Phase 0 — DONE 2026-09-08 — the schema · `lexicons/fyi.forage.mix.json` · `test/lexicons.test.js`, `test/lexicon-validate.test.js`
Pinned in `js/lexicons.js`; the register gains its entry (Act 1's table); the pinned
collection set and the register are the same list (the existing test); validation accepts a
full record, rejects a missing `rows`, a fifth source kind, a weight outside the enum, two
`home: true` records.

### Phase 1 — DONE 2026-09-08 — the codec · `js/mixes.js` · `test/mixes.test.js`
`toRecord(mix)` / `fromRecord(record)`: round-trips Home (overrides only) and a custom mix;
maps weights to and from the enum; refuses a record that fails validation with words.

### Phase 2 — DONE 2026-09-08 — the lens writes · `lens.js` · `test/invariants.test.js`, `test/lens-writes.test.js`
`saveMix`, `removeMix`, `mixRecords`; the invariant count moves and the argument is recorded.

### Phase 3 — DONE 2026-09-08 — the two halves · `js/mixes-pds.js` · `test/mixes-pds.test.js`
Mirrors `test/tagsubs-pds.test.js`: cache per DID, refresh, publish (write then drop local),
unpublish, `effectiveMixes`, a failed refresh never remembered as "no mixes", a write failure
leaves the local copy in place.

### Phase 4 — DONE 2026-09-08 — the Mixes page · `lensMixesView`, `lensMixEditView`
A *Save to PDS* / *Remove from PDS* control per mix and on Home; the *where* chip the hashtag
rows have; a published mix's edits write through.

### Phase 5 — DONE 2026-09-08 (passed against bsky.social) — the live proof · `e2e/mixes-pds-live.workflow.mjs` (`LIVE=1`)
The tagsub-pds-live shape: publish Weekend to the standing test account, read it back
through `listRecords`, validate it, unpublish, read-back-empty as the last assertion. Claim
`testbed--forage-test-account` first.

### Phase 6 — OWNER — socialize
The forum post (Act 3), and its outcome in the register entry.

### Phase 7 — DONE 2026-09-08 — the documents
Register entry; `AGENTS.md` write table; CHANGELOG; the first plan's D4 closed as done.

## Not doing

- **Publishing `fyi.forage.*`** (D3). One act for the namespace, owed elsewhere.
- **Sharing a mix with another reader.** The rows point at *the writer's* subscriptions;
  a shared mix would need a source kind that names a public thing. A later plan, if ever.
- **A mix as a real feed generator.** That is Skyfeed's shape and needs a server.

## Reasoning

**Why a record and not a preference.** `savedFeedsPrefV2` shows what the official namespace
does with "how I read": a private, server-side preference blob, rewritten whole by the
official client on every save. A mix stored there would be overwritten the next time the
Bluesky app saved a feed. A record in the reader's repo is theirs, addressable, and untouched
by other clients — which is also why it is world-readable, and why § Problem Statement says
what that does and does not expose.

**Why the slug is the key.** Every surface already addresses a mix by slug. A key that is not
the slug is a second identity for one thing, and the first plan's whole model (`sourceId` as a
stable key) exists to avoid second identities.

**Why weights are words on the wire.** A number invites arithmetic another client would do;
an enum is a vocabulary. The first plan chose notches over a slider for the thumb; the record
chooses them over a number for the same reason at the other end.

**Why act 1 is recorded as a table and not a sentence.** LEXICONS.md's own example: *"no
existing lexicon covers this"* does not survive someone finding a fifth candidate; *what was
opened and why each failed* does. The finding that the community repo moved is the kind of
thing only opening it produces.

## Review Log

- **2026-09-08 — drafted; act 1 done.** Six candidates opened across the three corpora
  (table above). Found in passing: `lexicon-community/lexicon` on GitHub archived 2026-07-27,
  schemas now on Tangled — this repo's register cited the archived repo; amended the same
  day. Awaiting D1–D4.
- **2026-09-08 — Phases 0–5 and 7 built** ("agreed to all 4"). What the building found:
  1. **The Lexicon spec does not allow an inline object as an array's items.** The
     reference validator (`@atproto/lexicon`, via `tools/lexicon-reference-gate.mjs`)
     refused the first draft of `fyi.forage.mix`; the row moved to `defs.row` and the record
     refs it. Our mirror validator had never needed `ref` and learned it — sibling refs only,
     an external ref refused rather than skipped — with the pinned runtime copy becoming the
     whole `defs` block, because a ref without its target is half a schema.
  2. **`putRecord` was forbidden by the write invariant** ("the lens edits no records").
     The invariant meant Bluesky's records; a slug-keyed record of our own is the case it
     did not foresee. It now admits exactly one, bound to `MIX_COLLECTION`, and the argument
     is in the test beside the count.
  3. **Live, the PDS did what D1 assumed:** a put at a slug key created, a second put at the
     same key replaced (one record listed, `createdAt` kept), delete read back empty.
  4. A global text replace in a test rewrote a helper as a call to itself; five red tests,
     one line. Recorded because it is the kind of red that looks like the code's fault.
