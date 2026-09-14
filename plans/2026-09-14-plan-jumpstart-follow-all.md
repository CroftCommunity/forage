# Plan: Follow all on a jumpstart — the first follow graph Forage changes for someone

date: 2026-09-14
**Status:** DRAFT — owner review of § Decisions and § Open questions before Phase 0. Written
in `CroftC/worktrees/jumpstart-follow-all/forage` on `claude/jumpstart-follow-all`; nothing
built yet. Deferred from `plans/2026-09-08-plan-feed-index-and-jumpstarts.md` (D-follow: *"its
own plan, later"*) and shaped by the owner in `TODO.md` § Needs the owner (2026-09-08).
repo: `CroftCommunity/forage`
baseline: `main` @ `2a8a2bf` (the feed index landed, #66/#68; the first harvest committed)
branch: `claude/jumpstart-follow-all`

## Problem Statement

**Alice** opens a jumpstart in Forage — say a curator's *Gardeners of the Pacific Northwest*,
137 people and two feeds. The feeds she can open here. The people she cannot follow here: the
page says *following everyone in it happens there; Forage does not change your follows* and
links out to bsky.app, where the official client's **Follow all** lives. She leaves Forage
to do the one thing the jumpstart was made for, and comes back to a page that still cannot
tell her she did it.

The feed-index plan left it there on purpose. Everything that plan built is **read-only**:
a file, a search, a page. Following 137 people is the first time Forage would change
someone's follow graph on their behalf, and a bulk write on someone's behalf is a different
capability from a Follow button on one profile — it deserves its own confirm step, its own
argument in `test/invariants.test.js` (which counts every lens write), and its own plan.

**What "Follow all" is on the network.** A jumpstart (`app.bsky.graph.starterpack`) names a
list (`app.bsky.graph.list`); its members are that list's items, up to 150. Following one of
them is one `app.bsky.graph.follow` record in *your* repo, `subject` = their did. The
lexicon (verified 2026-09-14, § Evidence E1) carries an optional `via` — a strong ref to the
record you followed *through* — and the official client fills it with the starter pack. So
"Follow all" is N follow records, each saying which jumpstart it came from, written to your
own repo. Nothing is written to the curator's, nothing to the members'.

**What the owner decided (2026-09-08, `TODO.md`).** A signed-in forager taps it on
`/j/<handle>/<rkey>`; a confirm step lists who they are about to follow; then a batch of
follow writes through the PDS proxy — session-gated like `/h/`; a guest sees the button
explained and cannot press it. Until it exists the jumpstart page links out. This plan is
that shape, decided to the level a build needs.

## Approach

### A. Two pages, one button

```
/j/<handle>/<rkey>                         /j/<handle>/<rkey>/follow
┌──────────────────────────────┐           ┌──────────────────────────────────┐
│ Gardeners of the PNW         │           │ ← Back to the jumpstart          │
│ by @curator · 137 members    │           │ Follow 131 people                │
│                              │  tap ──▶  │ Forage will add 131 follow       │
│ [Follow everyone in it]      │           │ records to your account, in      │
│ Open on bsky.app ↗           │           │ batches of 50. Already following │
│                              │           │ 4 · skipped 2 (you, blocked).    │
│ Feeds it names (2) …         │           │ ┌ @a  Ada Lovelace         ─┐    │
│ People (137) — sample of 12  │           │ │ @b  Bob                   │ …  │
└──────────────────────────────┘           │ └ (131 rows, 44px each)   ─┘    │
                                           │ [Follow 131 people]  (primary)   │
                                           └──────────────────────────────────┘
```

The confirm step is a **page**, not a modal: the navigation law (`croft-pwa/docs/DESIGN.md`)
admits the native `<dialog>` sheet only for a *choose-one step that returns you where you
were*, and a list of 131 people with a commit button is a destination — it needs a scrollbar,
a back link, and a URL a reader can leave and return to. A guest reaches the same page and
reads the same list; the button is the door (`openAuthSheet`, board-cards decision 1's shape),
and the sentence above it says why it is closed.

### B. The list is live, and the plan of who to follow is pure

The index carries no members (feed-index rule: bands only, no per-row counts, nothing that
churns weekly), so the confirm page reads the list **live**: `app.bsky.graph.getList` on the
jumpstart's `list` uri, paginated at 100 (≤ 150 members, so ≤ 2 pages), each item a
`profileView` whose `viewer` block — present only with a session — says whether I already
follow them, block them, am blocked by them, or mute them (§ Evidence E2).

`js/follow-all.js` is the pure core: `planFollows(members, { myDid, posture })` splits the
list into **follow** and **skipped-with-reason** (me · already following · blocking or
blocked by · muted · hidden by my moderation settings) — the official client's four skips
(§ Evidence E3) plus posture, because posture is the authority on what Forage shows and it
would be strange to follow someone the page refuses to render. `chunk(records, 50)` and
`followRecord(did, via, now)` are the other two functions. All three are testable with no
network, and they are where the counts on the page come from.

### C. The write — `com.atproto.repo.applyWrites`, creates only

One new lens method, `followAll(dids, { via })`, sends the follow records to the session's
own PDS as `com.atproto.repo.applyWrites` calls of ≤ 50 `#create` operations each (the
official client's chunk; § Evidence E3), collection `app.bsky.graph.follow`, rkey left to the
PDS, `validate` unset (the default validates a known lexicon). Each `createResult` carries
the record's uri, which the page keeps so that the members' rows can say *Following* without
a refetch — and so that Undo (D4) can name exactly what it wrote.

A **new kind of write** in `lens.js` means the invariants test moves first: `applyWrites` is
neither a `createRecord` nor a `call(` procedure, so today's regexes would not see it. The
pin is: exactly one `applyWrites` caller, bound to `FOLLOW_COLLECTION`, `#create` ops only
(and `#delete` only under Undo), every op's record built by the pure `followRecord`, `repo:
session.did` like every other write.

**Failure is per chunk and stops the run.** `applyWrites` is one commit per call — a chunk
lands whole or not at all. A failed chunk (a 429 from the PDS write budget, a network drop)
stops the loop; the page reports *Followed 50 of 131; the rest did not go through — <reason>*
with a **Try the rest** button that re-reads the list (the 50 now carry `viewer.following`
and are skipped) — idempotence by re-reading, not by remembering. No silent retry loop (fail
loud, fail early).

**The budget.** A PDS charges 3 points per create against 5,000 per hour and 35,000 per day
(§ Evidence E4). A full jumpstart is 150 × 3 = 450 points, under a tenth of the hour. Two in
an hour is fine; a reader who follows eleven jumpstarts in an hour meets a 429 on the
twelfth, and the failure path above is what they see.

### D. Undo — the same endpoint, the same chunks, the uris we already hold

If D4 is taken: the result state offers **Undo — unfollow these 131**, which sends
`applyWrites` `#delete` ops for exactly the uris the creates returned, in the same chunks.
Session-only (the uris live in the page; a reload loses the button, and the profile page's
Unfollow still exists one at a time). It is the one thing that makes a bulk write on a phone
forgivable: the confirm page guards against the wrong tap, Undo guards against the right tap
you regret.

### E. Where it lands, what it changes

- `js/follow-all.js` (new, pure) · `test/follow-all.test.js`
- `js/substrates/lens.js`: `listMembers(listUri)`, `followAll(dids, { via })`,
  (`unfollowAll(uris)` under D4) · `test/lens-writes.test.js` · `test/invariants.test.js`
- `js/ui/lens-views.js`: the button on `lensJumpstartView` (the link-out stays, its sentence
  changes), `lensJumpstartFollowView` · `js/main.js` route `/j/:handle/:rkey/follow`
  (`blueskyOnly`) · `test/nav.test.js` or wherever routes are pinned
- `e2e/follow-all.workflow.mjs` (hermetic — guest door, the plan of who to follow, the
  chunked bodies, the result, Undo, a failed second chunk) · `e2e/follow-all-live.workflow.mjs`
  (`LIVE=1`, O1)
- `scripts/mock-snaps.mjs` route `jumpstart-follow` · `plans/mocks/jumpstart-follow.html`
  (Current from main = `/j/` as it is + the route's honest absence; Proposed = the confirm
  page against a 150-member stress population, the result, the guest state)
- `AGENTS.md` write table (+1, +1 under D4) · `docs/adr/0005-feed-index.md` line 85 ·
  `docs/FEED-INDEX.md` · `CHANGELOG.md` · `TODO.md` (the item closes)

## Decisions

| # | Question | Options | Recommendation |
|---|---|---|---|
| **D1** | The write | (a) `applyWrites`, ≤ 50 creates per call; (b) N × `createRecord`, the profile button's write in a loop | **(a).** Same rate-limit points either way (3 per create), but 3 HTTP calls instead of 150, one commit per chunk instead of 150 commits, and a failure that is whole-chunk rather than mid-list. It is what the official client does. Cost: a new write kind to pin in the invariants |
| **D2** | `via` on each record | (a) set it to the jumpstart's `{ uri, cid }`; (b) leave it off | **(a).** The lexicon's field exists for this; the official client sets it; a follow that says where it came from is honest provenance and costs nothing. Note `via` is a `strongRef`, so the jumpstart's **cid** is needed — `getStarterPack` returns it and `lens.jumpstart()` already keeps it |
| **D3** | Who is skipped | (a) the official client's four: me, already following, blocking/blocked-by, muted; (b) those plus anyone my moderation settings hide; (c) nobody but me — follow the list as written | **(b).** (a) is the network's own behaviour and the reader expects it; posture on top because Forage never renders a hidden account and should not follow one either. Every skip is COUNTED on the page with its reason, never silent |
| **D4** | Undo | (a) yes — a session-only *Undo* on the result, `applyWrites` deletes of the uris we hold; (b) no — unfollow one at a time on profiles | **(a).** Cheap (same endpoint, same chunks, uris already in hand) and it is the difference between a bulk write a person can trust on a phone and one they cannot. The invariants pin the deletes to the same uris-we-wrote shape: a delete op is built only from a `followAll` result, never from a parsed uri |
| **D5** | The confirm step | (a) a page, `/j/<handle>/<rkey>/follow`; (b) the `<dialog>` sheet; (c) inline on `/j/` behind a reveal | **(a).** The navigation law: pages, not modals, and the sheet exception is for choose-one steps. A 150-row list with a commit button is a page. (c) puts 150 rows under the jumpstart head and makes the URL lie about what is on screen |
| **D6** | Per-row opt-out | (a) all-or-nothing, as the owner's shape says ("Follow all"); (b) a checkbox per row, default on | **(a) for this plan.** A reader who wants some of them has the profile pages; (b) is a natural follow-up if the owner wants it, and the pure core is written so the follow list is an input, not a constant |
| **D7** | A failed chunk | (a) stop, report the count, offer *Try the rest* which re-reads the list; (b) retry with backoff; (c) continue with the next chunk | **(a).** A 429 means the account's write budget is spent; retrying spends it faster. Re-reading makes the retry idempotent without Forage remembering anything |

## Phases

### Phase 0 — the pure core · `js/follow-all.js` · `test/follow-all.test.js`
RED first: `planFollows` with a list that holds me, someone I follow, someone I block, someone
who blocks me, someone muted, someone posture-hides, and four plain members → four to follow,
six skipped with the right reasons and counts; `chunk` at 50 (0, 1, 50, 51, 150 members);
`followRecord` produces `{ $type, subject, createdAt, via }` and nothing else. Guest input
(no `viewer` blocks) plans every non-me member.

### Phase 1 — the lens · `lens.js` · `test/lens-writes.test.js`, `test/invariants.test.js`
The invariants change FIRST and fail: one `applyWrites`, bound to the follow constant, creates
only (deletes under D4), `repo: session.did`. Then `listMembers` (paginated, shaped with the
viewer state), `followAll` (chunks, returns `Map<did, uri>` from the `createResult`s, stops at
the first failed chunk and throws with the count so far in the message), `unfollowAll` (D4).
A 429 reads as words; a guest call is refused before any request.

### Phase 2 — the pages · `lens-views.js`, `main.js`
The button on `/j/` (signed in: a link to the follow page; guest: the door). The follow page:
the plan's counts as a sentence, the rows (≥ 44 px, avatar, name, handle), the primary button
with the number in it, `aria-live` progress (*Following… 50 of 131*), the result state with
Undo, the failed-chunk state with *Try the rest*, the hidden-jumpstart and no-list empty
states. The link-out sentence on `/j/` changes to say the link is the network's page, not the
only place to follow.

### Phase 3 — journeys and the mock · `e2e/follow-all.workflow.mjs`, `scripts/mock-snaps.mjs`
Hermetic, on the tagsub-pds pattern (an in-page fetch patch with a live repo in
`localStorage`): the guest door; the plan of who to follow against a two-page list; the
`applyWrites` bodies (two chunks for 51); the result and the rows flipping to *Following*;
Undo's delete bodies; a second chunk that fails and the *Try the rest* re-read. Mock
`plans/mocks/jumpstart-follow.html`: Current from `main` beside Proposed, one route per
invocation, 390 × 844 and 1280 × 900, against a 150-member population built to stress the
page (long names, a labelled member, a blocked one).

### Phase 4 — the live proof · `e2e/follow-all-live.workflow.mjs` (`LIVE=1`)
Against the standing test account and a jumpstart made of our own test accounts (O1): follow
all, read the follows back through `listRecords` and check each carries `via`, Undo, read back
empty as the last assertion. Claim `testbed--forage-test-account` first.

### Phase 5 — the documents
`AGENTS.md` write table; ADR-005's "not built" line; `docs/FEED-INDEX.md`; `CHANGELOG.md`
entry under 2026-09; `TODO.md` item closed with the date; this plan's Status.

## Not doing

- **Creating or editing jumpstarts.** Forage reads them; the curator's tools are the
  network's.
- **Following the curator, or the feeds.** The feeds have their own Join on `/f/`; the
  curator is one profile page away. The official client follows neither on Follow all.
- **Per-row opt-out** (D6b) and **a remembered undo across reloads** — follow-ups if wanted.
- **Rate-limit budgeting across jumpstarts.** The PDS keeps the count; Forage reports the
  refusal with words rather than modelling the budget.

## Reasoning

**Why a page and not the sheet.** The sheet exists for choosing a sign-in provider — a fork
in the road you take and forget. A list of 131 people is something a reader scrolls, reads
names in, and might leave to check one profile and come back to. That is a document with a
URL. The navigation law was written for exactly this distinction and this plan is its first
test on a write.

**Why the invariants move first.** `test/invariants.test.js` is the argument that the lens
can only do the writes the repo has decided it can do; a new endpoint that its regexes cannot
see is the hole the test exists to close. Widening it in the same commit as the code, with
the count and the binding named, is how every previous write got in (the like, the post, the
tagsub, the block, the repost, the follow, the mix). This one is bigger than the others —
one call, fifty records — which is a reason to pin it tighter (creates only, follow only,
records from the pure core), not looser.

**Why live members and not the index.** The index is a weekly file of hints; a follow is a
record with a did in it. The moment the file's member list and the real list disagree,
Forage would follow the wrong people or miss some. Reading the list live also brings the
viewer state that decides who to skip — the file cannot know who *you* already follow.

**Why the official client is the reference and not the spec.** The lexicons say what a valid
follow is; `bsky.app` says what the network actually does on Follow all (the four skips, the
chunk of 50, `via`). Where they agree this plan follows both; posture is the one place Forage
adds a skip, because Forage's promise about what it shows is its own.

**Why Undo.** The confirm page makes a mistaken Follow all unlikely; it does not make it
cheap. Without Undo, 131 wrong follows are 131 profile pages. With the uris the write returns,
Undo is one more tap on the same endpoint, and the deletes are pinned to the uris we wrote —
so the widening is exactly one shape, not "the lens can now bulk-delete".

## Evidence (verified 2026-09-14)

- **E1 — `app.bsky.graph.follow`** (`bluesky-social/atproto` `lexicons/app/bsky/graph/follow.json`,
  fetched from `main`): key `tid`; required `subject` (did) and `createdAt`; optional `via`
  (`com.atproto.repo.strongRef`). *"Duplicate follows will be ignored by the AppView."*
- **E2 — `app.bsky.graph.getList`** (`getList.json`, `defs.json`, `actor/defs.json`): params
  `list`, `limit` 1–100 (default 50), `cursor`; items are `listItemView { uri, subject:
  profileView, subjectOptedOut? }`; `profileView.viewer` is `viewerState { muted, blockedBy,
  blocking (at-uri), following (at-uri), followedBy, … }` — *"only has meaningful content for
  authed requests"*. `starterPackView.list.listItemCount` is the member count `lens.jumpstart()`
  already reads.
- **E3 — the official client** (`bluesky-social/social-app` `src/screens/Onboarding/util.ts`
  `bulkWriteFollows`, `src/screens/StarterPack/StarterPackScreen.tsx` `onFollowAll`, read
  from `main`): fetches every list member, filters `did !== me && !blockedOrBlocking &&
  !muted && !viewer.following`, builds follow records with `via = { uri, cid }` of the
  starter pack, sends `com.atproto.repo.applyWrites` in chunks of 50 (`#create`, a client-
  minted TID rkey), then waits for the AppView to index before repainting. No confirm step —
  the button follows immediately. The confirm step is the owner's addition.
- **E4 — rate limits** (`bluesky-social/bsky-docs` `docs/advanced-guides/rate-limits.md`):
  content writes per account 5,000 points/hour and 35,000/day; CREATE 3, UPDATE 2, DELETE 1;
  `applyWrites` operations are summed individually. Follow all of 150 = 450 points; Undo = 150.
- **E5 — `com.atproto.repo.applyWrites`** (`applyWrites.json`): input `repo`, `writes[]` of
  `#create { collection, rkey?, value }` / `#update` / `#delete { collection, rkey }`,
  optional `validate`, optional `swapCommit`; output `results[]` of `createResult { uri, cid,
  validationStatus? }` in order. Error `InvalidSwap` only.
- **E6 — the starter pack record** (`starterpack.json`): `list` is required, `feeds` ≤ 3.
  The 150-member cap is the official client's, not the lexicon's; the page must not assume
  two pages — it paginates until no cursor.
- **E7 — what exists in forage today**: `lens.follow(did)` / `unfollow(uri)` (feed-row v7,
  one record, the profile page); `lens.jumpstart(uri)` keeps `cid` and `listUri`;
  `feedDisposition(sp, posture)` is the hide/warn shape; the invariants test pins six
  `createRecord`, seven `deleteRecord`, one `putRecord`, seven procedures, and every
  `repo:` argument as `session.did`.

## Open questions — owner

- **O1 — the live proof's jumpstart.** Phase 4 needs a jumpstart whose members are accounts we
  may follow and unfollow from the test account without spamming strangers — a starter pack
  made of the Croft test accounts, created once on bsky.app (Forage does not write starter
  packs) and its uri recorded in `CroftC/.claude/TESTBED.md`. Who creates it, and from which
  account?
- **O2 — D4 (Undo)** is the one decision that widens the write beyond the owner's stated
  shape. Yes or no.
- **O3 — the button's words.** *Follow everyone in it* on `/j/`, *Follow 131 people* on the
  confirm page. The gloss stays *jumpstart (what the network calls a starter pack)* once per
  page.

## Review Log

### Pass 1 — the plan (2026-09-14)

Written after the feed-index plan's Pass 4 (landed, first harvest committed). Inputs read:
`TODO.md` § Needs the owner (the owner's shape), the four lexicons and the rate-limit page
(E1–E6, fetched from upstream `main` per CLAUDE.md § External APIs), the official client's
Follow all (E3), and forage's own write discipline (`test/invariants.test.js`, the AGENTS.md
write table, the tagsub-pds hermetic pattern, the mixes-on-the-pds plan as the template). No
code written. The device row from the feed-index plan (the index in the shell cache on a phone)
is unrelated to this plan and stays in `TODO.md` § Device queue.
