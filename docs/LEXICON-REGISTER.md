# The `fyi.forage.*` register

Forage defines record types of its own. That is a permission with an obligation
attached (owner, 2026-08-29):

> forage is going to need records of its own as we go, no help for it, esp with
> our handling of hashtags, but let's keep it to a minimum and highlight every
> one created and defined for ourselves so we are intentional about it and so we
> can reflect on overlap with the ecosystem.

So every type we define is listed here with three things: **what it holds**,
**why it is ours**, and **what was checked in the ecosystem first**. The third is
the one that costs something, and it is the reason the register exists — an
`fyi.forage.*` type that duplicates an official lexicon is a fork of the network
wearing a namespace.

`test/lexicons.test.js` enforces this: the register and the pinned collection set
in that file are asserted to be the same list, and every entry must carry all
three fields. A missing entry fails the gate.

**The nine pre-register checks were done on 2026-08-29, and the exemption list is now
empty** — it could only shrink, and it reached zero. They were checked against the real
corpora rather than from memory: **26 record types** among the 435 official lexicons
(`bluesky-social/atproto@main`) and **9** in `community.lexicon.*`
(`lexicon-community/lexicon@main`). Everything else in both repos is XRPC — queries and
procedures — which matters more than it sounds, because a namespace can look like a
perfect fit and contain nothing you can put in a repo. The one command that settles it:
`defs.main.type == 'record'`.

**Which namespace to reach for, in order (owner, 2026-08-29).** The preference is for
community standards; the nuance is that Forage exists partly to mirror Bluesky as an alt
view, and mirroring imposes a visibility requirement no shared namespace can satisfy:

1. **`app.bsky.*`** when the thing must be **visible in the Bluesky client**. Only official
   collections are read by official clients, so this outranks everything else for content a
   Bluesky user should see. `fyi.forage.vote` is the worked example: the lens writes a real
   `app.bsky.feed.like` for a boost, and that is the requirement met rather than a
   compromise.
2. **`community.lexicon.*`** otherwise — *"when possible, I do prefer to use community
   standard lexicons"*. Preferred over minting even when minting would be easy.
3. **`fyi.forage.*`** only when neither fits, with an entry on this page saying which of the
   two was ruled out and why.

**A community type is still not automatically right**: `community.lexicon.bookmarks.bookmark`
matches our save field-for-field and publishes to the repo, where Bluesky's equivalent is
private and server-side. Rule 2 is a preference between *candidates that fit*, not a reason
to skip asking whether one does.

**Read every entry below with this in mind: nine of these ten types have never been written
to a real PDS.** `fyi.forage.tagsub` is the only one any code sends over a network. The other
nine are the declared wire shape for the **memory tier** — the sandbox population, which
persists to `forage.state` in localStorage and has no repo at all. That is why a reader can
work on this app for weeks without encountering `fyi.forage.mod`: it models stewards
removing posts and banning users in a population that lives in one browser.

The register still applies to them — a shape agreed before anyone holds records is an edit,
and after is a migration — but an entry saying "adoptable" is a claim about a **future**
write, never a description of one happening today.

**Two of the nine turned up real candidates and are recorded as adoptable rather than
justified**, and the one I expected to be adoptable was refuted outright. A register that
never finds anything is not doing its job.

---

## fyi.forage.post

**Holds:** a top-level post in a Forage feed — title, body, the feed it belongs to. Edits
ride an `editedAt`; deletion is the record deleted.

**Why ours:** a Forage post is addressed to a **board**, and its identity includes that
board. The two candidates that carry a container both carry the wrong kind of one.

**Ecosystem check (2026-08-29):**

| Candidate | What it holds | Why it does not fit |
|---|---|---|
| `app.bsky.feed.post` | text, facets, langs, reply refs, embeds | no container at all — a skeet belongs to its author and nothing else, and there is no field to add one to without forking the type |
| `site.standard.document` | **the near miss.** `site` (required uri), `title`, `publishedAt`, `path`, `contributors`, `coverImage`, `textContent` | it has a container, and the container is a **publication** — a blog or website with a `url`, one publishing surface. A forum post is written *by a member into a shared place* with membership and moderators. It also models an article, which is a different artifact |
| `app.bsky.feed.generator` | — | a generator is a query, and you cannot post *into* a query |

**The distinction worth keeping:** `site.standard.*` models **publishing** — one voice, many
readers. A forum models **posting into a commons** — many voices, one shared place,
moderators. They look adjacent, and the difference is the whole product.

## fyi.forage.comment

**Holds:** a reply beneath a post or another comment, in the commenter's repo.

**Why ours:** its parent is a `fyi.forage.post`, which is ours. **This gap is inherited, not
independent** — said plainly rather than restating the post argument as if it were a second
finding.

**Ecosystem check (2026-08-29):** `app.bsky.feed.post`'s `reply` (root + parent strongRefs)
is a good threading model and we are not improving on it — our comment uses the same shape.
Nothing else among the 26 record types threads at all. **If `fyi.forage.post` is ever retired
for an official type, this type retires with it, and not before.**

## fyi.forage.vote

**Holds:** one boost of a post or comment. Boost-only since 2026-08-27; retraction is the
record deleted.

**Why ours:** **WEAKER THAN IT WAS** — a real candidate now exists.

**Ecosystem check (2026-08-29):**

| Candidate | What it holds | Verdict |
|---|---|---|
| `app.bsky.feed.like` | `subject` strongRef + `createdAt` | for Bluesky content, and the lens already uses the real thing — a boost there **is** an `app.bsky.feed.like`. It cannot address a `fyi.forage.post` |
| `community.lexicon.interaction.like` | `subject` **strongRef** + `createdAt` — "a like interaction with **another AT Protocol record**" | **the candidate.** Deliberately generic, which is exactly our gap |

**What blocks adoption today, stated so it can be checked rather than believed:** its
`subject` is a `com.atproto.repo.strongRef` — a uri **and a cid**. Ours is a bare at-uri, and
the memory tier synthesises records rather than committing them, so there is no cid to put
there. A real obstacle, not a preference.

**~~And a finding about our own type~~ — DONE 2026-08-29: `value` is gone.** It was an enum
of exactly `[1]`, a required field whose only legal value was a constant once bury was
removed on 2026-08-27. **Presence IS the vote:** a retraction is the record deleted, so a
vote record that exists can only mean a boost. The event layer keeps its `value` (0 retracts,
1 boosts, and `js/reducers.js` branches on it) — the two layers model retraction differently
on purpose, and only the record layer had a constant.

That narrows the divergence from `community.lexicon.interaction.like` to exactly one field:
its `subject` is a strongRef (uri **and** cid) where ours is a bare at-uri.

**And a constraint that outranks the cid, supplied by the owner 2026-08-29:** *"I want the
likes to show the same in bsky client as on forage."* **Only `app.bsky.feed.like` appears in
the Bluesky client.** A `community.lexicon.interaction.like` is invisible there — no official
client reads that collection — so adopting it for lens content would silently stop boosts
showing up in Bluesky, which is the opposite of the requirement.

That settles it in the direction the lens already goes: a boost on Bluesky content **is** a
real `app.bsky.feed.like`, and that is not a compromise but the requirement met. The
community type would only ever be a candidate for memory-tier content, which does not exist
on Bluesky and therefore cannot show there whatever we write.

**Retire by:** nothing, for lens content — the current answer is correct. If the memory tier
ever gains real records, revisit then. The vestigial `value` is worth dropping on its own
merits either way.

## fyi.forage.save

**Holds:** a saved post, one record per save; unsaving is the record deleted.

**Why ours:** **NO LONGER JUSTIFIED — this type should be retired.**

**Ecosystem check (2026-08-29):**

| Candidate | What it holds | Verdict |
|---|---|---|
| `app.bsky.bookmark.*` | `createBookmark` / `deleteBookmark` / `getBookmarks` | **not a record type at all** — bookmarks on Bluesky are server-side XRPC, so there is nothing to put in a repo. The name misleads; the `defs.main.type` does not. **In use via XRPC since plan 2026-08-29 post-and-thread, Phase 4a** — the ⋯ menu's Save; probed live 2026-08-29 (`test/fixtures/atproto/bookmarks.json`): 200 with an empty body, `viewer.bookmarked` on the way back |
| `community.lexicon.bookmarks.bookmark` | `subject` (uri) + `createdAt`, optional `tags` | **a strict superset of ours** |

**The shapes match. The BEHAVIOUR does not, and the first version of this entry missed it**
(owner, 2026-08-29: *"I thought saves in bsky app were actually handled separately from the
PDS and private"*). They are, and the lexicons say so in as many words:

| | Bluesky's bookmarks | `community.lexicon.bookmarks.bookmark` | ours today |
|---|---|---|---|
| Where it lives | the **service** — `createBookmark` / `deleteBookmark` are procedures, and there is no record | **your repo**, `key: tid` | the memory tier's local store |
| Who can read it | **you only** — "Creates a **private** bookmark"; `getBookmarks` requires auth | **anyone**, like a follow | nobody but this browser |
| Enumerable by another client | no | yes | n/a |

So adopting the community type would not be a schema cleanup — **it would publish everything
anyone has ever saved.** Bluesky deliberately keeps saves off the repo; the community type
deliberately puts them on it. Two coherent designs with opposite privacy postures, and the
field lists are identical either way.

**Corrected verdict:** the shape is a strict superset and that remains true; adopting it is a
**product decision about publicity**, not a cleanup, and it is the owner's. The nearest thing
to a free win is the tagsub precedent — local by default, published per item on purpose —
which is the same question this app already answered once.

*Recorded as a correction rather than edited away, because the failure is instructive: I
compared field lists and called it an ecosystem check. Two types can match field-for-field
and mean opposite things, and nothing in the schema says which.*

## fyi.forage.feed

**Holds:** a board — its name, description, and settings — in its founder's repo.

**Why ours:** a Forage feed is a **place with members and moderators**. Every candidate is
either a query or a website.

**Ecosystem check (2026-08-29):**

| Candidate | What it holds | Why it does not fit |
|---|---|---|
| `app.bsky.feed.generator` | `did` of the service that runs it, `displayName`, `description` | a generator is a **query executed by a service**, and the required `did` is that service's. A place nobody queries for cannot be expressed |
| `site.standard.publication` | required `url` + `name`, theme, preferences | a website. The required `url` is the tell — a publication is somewhere on the web; a board is somewhere in the app |
| `app.bsky.graph.list` | a curated list of actors | lists people, not a place they post into |

## fyi.forage.membership

**Holds:** joining a board, one record per membership; leaving is the record deleted.

**Why ours:** its subject is a `fyi.forage.feed` — but the sharper reason is **who writes
it**, and that one survives even if the feed type is ever replaced.

**Ecosystem check (2026-08-29):**

| Candidate | What it holds | Why it does not fit |
|---|---|---|
| `site.standard.graph.subscription` | `publication` (required at-uri) + `createdAt` | the closest shape in the ecosystem, and it fails on its subject: a publication, which a board is not (see `fyi.forage.feed`) |
| `app.bsky.graph.listitem` | `subject` (did) + `list` (at-uri) + `createdAt` | **inverted authorship.** A listitem is written by the list's OWNER, to put someone on a list. A membership is written by the JOINER, to put themselves in a place. Same fields, opposite direction |

**The distinction worth keeping:** curation and membership have identical shapes and opposite
meanings. A model that conflates them lets a board acquire members who never joined.

## fyi.forage.mod

**Holds:** one moderation action by a steward, in the steward's own repo — the whole `mod.*`
family in one collection with an `action` enum.

**Why ours:** the record lives in the repo of the person who acted, which is what makes it
auditable without a service.

**What it actually is today, because the name promises more than it delivers:** the wire
shape for the memory tier's `mod.*` events — `removed`, `approved`, `locked`, `unlocked`,
`pinned`, `unpinned`, `banned`, `unbanned`, `stewardAdded`, `stewardRemoved`
(`js/schema.js`). The lens references it **zero times**; there is no moderation on the
Bluesky population, whose moderation is Bluesky's. Nothing has ever written one of these to a
repo.

**Ecosystem check (2026-08-29):** **the candidate I expected to win does not exist as a
record.**
`tools.ozone.moderation.*` is twenty-odd lexicons and **not one is a record type**; they are
queries and procedures against an Ozone instance (`emitEvent`, `getEvent`, `queryStatuses`).
`chat.bsky.moderation.*` is the same. The ecosystem's moderation model is **service-side by
construction**: actions live in a service's database, not in anyone's repo.

**This was flagged as the most likely adoption on the page and it is the least.** Recorded
that way because the expectation was reasonable and wrong, and because the fact that settles
it takes one command to re-check.

## fyi.forage.report

**Holds:** a filed report, in the reporter's repo.

**Why ours:** the same reason as `fyi.forage.mod`, confirmed by the same measurement.

**Ecosystem check (2026-08-29):** `com.atproto.moderation.createReport` is a **procedure** —
a report is something you send to a service, which then owns it. There is no report record
among the 26. Keeping ours in the reporter's repo is a deliberately different posture: the
reporter keeps their own copy of what they said.

## fyi.forage.roster

**Holds:** the scoped tier's membership, keyed `self` in the founding DID's repo.

**Why ours:** **ADOPTABLE WITH RESHAPING** — recorded honestly rather than defended.

**Ecosystem check (2026-08-29):**

| Candidate | What it holds | Verdict |
|---|---|---|
| `app.bsky.graph.list` + `listitem` | a list record plus one record per member | **this could hold it.** The cost is shape, not capability: one record per member instead of a singleton, and `key=tid` instead of `literal:self` |
| `app.bsky.graph.starterpack` | a list plus feeds, for onboarding | a different purpose wearing a similar shape |

**No blocker was found, so none is claimed.** The singleton is a convenience — one read gets
the whole roster — and convenience is a reason, not a justification. If the scoped tier
outgrows a toy, `list` + `listitem` is the interoperable answer and this type should go.

## fyi.forage.tagsub

**Holds:** one subscribed hashtag — the tag, bare and lowercase, plus the time
you subscribed. One record per subscription; unsubscribing is the record deleted.

**Why ours:** across the official lexicons, **a subscription always points at a
thing that exists** — a record, or an identity. A hashtag is neither. It is a
query, and nothing in the ecosystem models a subscription to a query.

**Ecosystem check (2026-08-29):** four candidates were read and rejected, and the
pattern they share is the actual justification:

| Candidate | What it holds | Why it does not fit |
|---|---|---|
| `site.standard.graph.subscription` | a subscription to a **publication**, as an at-uri | a hashtag has no record and therefore no at-uri |
| `app.bsky.notification.putActivitySubscription` | a subscription to an **actor** | its subject is a DID; a hashtag is not an identity |
| `app.bsky.actor.defs#savedFeedsPrefV2` | `feed \| list \| timeline`, one value each | no hashtag type, and no room to add one |
| `app.bsky.graph.list` + `listitem` | curated **people** | a list of accounts, not a subject |

**Amended 2026-08-29 — the original check searched one corpus and read as if it had
searched the field.** It named four official types and never looked at
`community.lexicon.*`, the ecosystem's shared namespace, in a workspace whose `discovery`
repo had been contributing `community.lexicon.attest.*` drafts for weeks. Re-run against
`lexicon-community/lexicon@main`, whose **nine** record types are:

`app.entry` · `app.profile` · `app.profileLocalization` · `bookmarks.bookmark` ·
`calendar.event` · `calendar.rsvp` · `interaction.like` · `payments.webMonetization` ·
`preference.ai`

**The conclusion survives, and now it has actually been tested.** None subscribes to
anything. The nearest, `bookmarks.bookmark`, points at a `uri` — a thing that exists, the
same pattern the four official candidates showed. One detail worth carrying: it has an
optional `tags` array, so the ecosystem models *tags on a saved thing* and still not *a
subscription to a tag*. The distinction this type exists for holds across both corpora.

*Recorded rather than quietly fixed, because a check whose stated scope is wider than its
actual scope is the failure this register exists to prevent — and it happened in the first
entry written under the rule.*

**First write under the rule.** This is the type that took Forage's lens write
count from seven to eight, which `AGENTS.md` and `test/invariants.test.js` make
an argued step rather than an incidental one.
