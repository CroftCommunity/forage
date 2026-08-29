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

**Nine types predate the rule.** Their ecosystem check reads `NOT DONE`, which is
the honest state and not a placeholder — back-filling nine checks I had not
actually performed would have made the register a fiction on the day it was
written. The test pins the list of types allowed to say that, it may only shrink,
and a new type may never join it. Closing one is a small piece of real work:
search the official lexicons for a type that already holds this, then replace the
line with what you found.

---

## fyi.forage.post

**Holds:** a top-level post in a Forage feed — title, body, the feed it belongs
to. Edits ride an `editedAt`; deletion is the record deleted.

**Why ours:** a Forage post is addressed to a *board*, and its identity includes
that board. `app.bsky.feed.post` has no such field and no room for one, so a
Forage post stored as a Bluesky post would lose the thing that makes it a forum
post rather than a skeet.

**Ecosystem check:** NOT DONE — predates the register (2026-08-29). Owed.

## fyi.forage.comment

**Holds:** a reply beneath a post or another comment, in the commenter's repo.

**Why ours:** threading in a forum is a tree with a stable parent, which is the
same shape `app.bsky.feed.post`'s `reply` carries — the gap is the same one
`fyi.forage.post` has, not a separate one.

**Ecosystem check:** NOT DONE — predates the register (2026-08-29). Owed.

## fyi.forage.vote

**Holds:** one boost of one post or comment. Boost-only since 2026-08-27;
retraction is the record deleted.

**Why ours:** the memory tier needs a vote it can count without a like-index, and
the subject is a `fyi.forage.post` uri rather than a Bluesky post uri.

**Ecosystem check:** NOT DONE — predates the register (2026-08-29). Owed.
Note the near-neighbour: the *lens* substrate does not use this type at all — a
boost there is a real `app.bsky.feed.like`, which is the register's rule working
in the direction it is supposed to.

## fyi.forage.save

**Holds:** a saved post, one record per save; unsaving is the record deleted.

**Why ours:** the same subject problem as `fyi.forage.vote`.

**Ecosystem check:** NOT DONE — predates the register (2026-08-29). Owed. Bluesky
has since grown a bookmark concept; whether it fits here is exactly the question
this line is owed for.

## fyi.forage.feed

**Holds:** a board — its name, description, and settings — in its founder's repo.

**Why ours:** `app.bsky.feed.generator` is a *query* run by a service, not a place
with members and moderators. A Forage feed is the place.

**Ecosystem check:** NOT DONE — predates the register (2026-08-29). Owed.

## fyi.forage.membership

**Holds:** joining a board, one record per membership; leaving is the record
deleted.

**Why ours:** the subject is a `fyi.forage.feed`, which is ours.

**Ecosystem check:** NOT DONE — predates the register (2026-08-29). Owed.

## fyi.forage.mod

**Holds:** one moderation action taken by a steward, in the steward's own repo —
the whole `mod.*` family in one collection with an `action` enum.

**Why ours:** moderation here is *in* the repo of the person who acted, which is
what makes it auditable without a service.

**Ecosystem check:** NOT DONE — predates the register (2026-08-29). Owed. The
obvious neighbour is `tools.ozone.moderation.*`, and it is the strongest
candidate on this page for actually being adoptable.

## fyi.forage.report

**Holds:** a filed report, in the reporter's repo.

**Why ours:** same reason as `fyi.forage.mod` — the record lives where the act
happened.

**Ecosystem check:** NOT DONE — predates the register (2026-08-29). Owed.
`com.atproto.moderation.createReport` is the neighbour to weigh.

## fyi.forage.roster

**Holds:** the scoped tier's membership, keyed `self` in the founding DID's repo.

**Why ours:** a singleton list belonging to one repo, which is a shape atproto
supports and nobody else's lexicon holds for us.

**Ecosystem check:** NOT DONE — predates the register (2026-08-29). Owed.

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

**First write under the rule.** This is the type that took Forage's lens write
count from seven to eight, which `AGENTS.md` and `test/invariants.test.js` make
an argued step rather than an incidental one.
