# Plan: your discovery index on the PDS — the file, or a link to it, follows you

date: 2026-09-21
**Status:** REVIEWED 2026-09-21 (owner, Pass 2: O1–O3 decided, D4 and D7 confirmed) — ready for Phase 0 on the owner's go; **no code before it**.
The evidence below was probed against the real lexicons, the PDS source, and a live write
to the standing test account (undone), so the decisions rest on measurements rather than
on readings.
repo: `CroftCommunity/forage`
baseline: `main` @ `7a5090f`
branch: `claude/own-index-pds`
serves: `TODO.md` § Needs the owner, "Your discovery index on the PDS"; feed-index plan
(`plans/2026-09-08-plan-feed-index-and-jumpstarts.md`) Phase 2b's named follow-up;
`docs/DEVICE-LOCAL.md` row `forage.feedindex` (`planned`).

## Problem Statement

**Alice** runs a gardening community. She built her own discovery index — a file naming the
feeds and jumpstarts her people care about, made with `npm run harvest -- --providers
gardeners.json` — and pasted it into Forage on her laptop under *Advanced → Discovery
index*. Browse feeds now starts from her list, laid over Forage's. On the train she opens
Forage on her phone: Forage's index, nothing of hers. The file lives in one browser's
`localStorage` (`js/index-prefs.js`), so her choice is a per-browser fact, and every new
browser starts from Forage's editorial act again. Worse for the point of the feature: if
forage.fyi went away, nothing she built survives it anywhere but on the one laptop.

**Bob** does not keep a file at all. His community publishes its index at
`https://gardeners.example/index.json` and regenerates it monthly. He wants Forage to read
*that* — on every device he signs in on — without pasting anything, and to refresh it when
he asks.

**What the owner decided (2026-09-14, recorded in `TODO.md` and `docs/DEVICE-LOCAL.md`):**
browser-local stays the default; a reader who wants the index to follow them chooses
between a **whole-file record** and a **pointer record** — both, their choice; **Forage's
shipped index is always available as long as they keep upgrading, but once selected away
from it never retakes the default.** In the owner's words: *"both plus an option to keep
it local in the browser… the forage upstream one should always be available as long as
they are upgrading, just never takes back over as default when selected away from… make
the local browser one the default."* The pointer is fetched over HTTPS only and goes
through the same validator as a pasted file.

This plan is that decision taken to the level a build needs: what the record is, why the
whole file cannot be *in* the record, how a pointer is fetched safely from a browser,
which half wins when a device and the account disagree, and what "never retakes the
default" means as tests.

## Approach

### A. Three places an index can live; the reader picks one

```
  on this browser (DEFAULT)        on your account — the file          on your account — a link
┌──────────────────────────┐    ┌───────────────────────────────┐    ┌───────────────────────────────┐
│ localStorage             │    │ your repo                     │    │ your repo                     │
│  forage.feedindex        │    │  fyi.forage.feedindex/self    │    │  fyi.forage.feedindex/self    │
│   { mode, own:{index} }  │    │   { kind:"file", file:<blob>, │    │   { kind:"url",               │
│                          │    │     mode, name, … }           │    │     url:"https://…/index.json"│
│ as today (D-own)         │    │  + the blob: the JSON bytes   │    │     mode, name, … }           │
└──────────────────────────┘    └───────────────────────────────┘    └───────────────────────────────┘
        stays put                 follows you: any device reads the     follows you: any device fetches
                                  record, then the blob from your PDS   the link (HTTPS, CORS), on demand
```

Whichever place holds it, the bytes go through `validateIndex` (`js/feed-index.js`) on the
way in and are stored in the browser afterwards exactly as a pasted file is today — so
offline, `/feeds` and `/jumpstarts` answer from the copy, and the service worker needs no
change (`sw.js` line 70 lets cross-origin fetches through untouched; the copy in
`localStorage` is what works offline, as it already does).

**The new device.** Alice signs in on her phone. Forage reads
`com.atproto.repo.getRecord` for `fyi.forage.feedindex/self` (public; one call). A record
exists → Forage fetches the file it names (the blob from her PDS, or the link), validates
it, stores it, and browse starts from *her* index with *her* mode. No record → the device's
own state, as today. The choice followed her; nothing was pasted.

### B. The record — `lexicons/fyi.forage.feedindex.json`

One type, key `literal:self` (one choice per reader), on the `mix` row's shape — a `kind`
word plus the field that kind needs, because the mirror validator (`js/lexicon.js`) has
`enum` and `ref` and no `union`, and the shape reads the same either way:

```json
{ "$type": "fyi.forage.feedindex",
  "kind": "file" | "url",
  "file": { "$type": "blob", "ref": { "$link": "bafkrei…" }, "mimeType": "application/json", "size": 1074115 },
  "url":  "https://gardeners.example/index.json",
  "mode": "add" | "replace",
  "name": "Gardeners of the PNW",
  "createdAt": "…", "updatedAt": "…" }
```

- `kind` (required, enum `file | url`) — which of `file` / `url` is present. Exactly one
  is, and the **app** enforces it: a lexicon cannot say one-of, so the rule lives in the
  codec's `fromRecord`, the way `mix`'s `kind` ↔ `uri`/`tag` already does.
- `file` (`blob`, `accept: ["application/json"]`, `maxSize` per D7) — **the file itself,
  as a blob the record references.** Not inline: § Evidence E1–E2 — the reference PDS caps
  a `putRecord` body at 150 KiB and the protocol's own guidance caps a record at 1 MiB with
  "use a blob instead"; the shipped index is 1,074,115 bytes.
- `url` (`string`, `format: uri`, `maxLength` 2048) — the pointer. **`https:` only** is an
  app rule (a lexicon `uri` admits any scheme; E6), refused with words on the way in and
  never fetched otherwise.
- `mode` (required, enum `add | replace`) — laid over Forage's, or instead of it (D4).
- `name` (optional) — what the reader calls it; shown on the status line.
- `createdAt`, `updatedAt` — datetimes; `updatedAt` moves on every put.

**What the record does NOT hold:** `off` (D4 — a device preference, not a source), the
index's contents when `kind` is `url` (the link is the whole point), and a cache of
Forage's index (Forage's ships with the app; "always available as long as they keep
upgrading" is exactly that).

**Why the blob is safe to lean on** (E3, E5): a blob uploaded and not referenced within
minutes is deleted by the PDS, so a put that fails leaves no litter; once a record names
it, it is public and served with `Access-Control-Allow-Origin: *` from the reader's own
PDS with no auth (E4 — measured on a real host, and again in the probe); replacing the
record with a new blob deleted the old one **immediately** in the probe; deleting the
record deleted the blob. One record, one blob, and the PDS does the housekeeping.

### C. Two halves, the tagsub/mix pattern — `js/index-prefs.js` stays, `js/index-pds.js` arrives

`js/index-prefs.js` is the device half and never learns the network exists (unchanged but
for two RED-first fixes it is owed anyway, Phase 1). `js/index-pds.js` mirrors
`js/mixes-pds.js`: a per-DID cache of *the record and the fetched file*
(`forage.feedindex.pds`, a `cache` row in the register), `refresh(lens, did)`,
`publishFile` / `publishUrl` / `unpublish`, and the ONE `effective()` the store reads.

The halves are **disjoint** (D6): publishing moves the reader's file out of the device
half into the record — the local copy becomes the cache of what the account holds.
Unpublishing brings it back to the device, confirmed fresh, never from the cache (the
mix rule: offline, it refuses in words). With a record present, the device's own
`own`/`mode` are not consulted — the record is the thing that follows the reader, so it is
the thing that is true — except `off`, which is a device's "no index here" (D4).

```
                 effective(device, account)
  signed out ─────────────────────────────▶ device half, as today
  signed in, no record ───────────────────▶ device half, as today
  signed in, record, file cached ─────────▶ record's mode + the cached file (age shown)
  signed in, record, no cache, fetch ok ──▶ record's mode + the file, now cached
  signed in, record, no cache, fetch FAILS ▶ Forage's index + "yours could not be fetched
                                             (why); Forage's until it can" — the record
                                             and the mode are NOT rewritten (E. below)
  device mode = off ───────────────────────▶ no index on this device, record or not
```

### D. The lens — three writes and two reads, argued in `test/invariants.test.js`

- `uploadIndex(bytes)` — the **second `uploadBlob` caller**. The invariant currently pins
  exactly one (the image); the argument for two: the bytes are JSON the app already
  validated, bounded by D7's ceiling before the upload (the PDS accepts an oversized blob
  with a 200 and refuses only at the record — the same lesson `uploadImage` carries), and
  the returned `blob` object is used **verbatim** in the record (E5: a ref whose `size`
  disagrees with the store is refused `InvalidSize`; the PDS records the sniffed type with
  the declared one as fallback, and `application/json` round-tripped).
- `saveIndexRecord(record)` — the **second `putRecord`**, at `rkey: self`, validated
  against the pinned schema before the request (W17: a PDS accepts anything).
- `removeIndexRecord()` — the eighth `deleteRecord`.
- `indexRecord()` — `getRecord` at `self`; a missing record is `null`, not an error.
- `fetchIndexBlob(cid)` / `fetchIndexUrl(url)` — reads. The blob from the session's own PDS
  (`/xrpc/com.atproto.sync.getBlob?did=<me>&cid=`); the URL as a plain cross-origin
  `fetch` that requires the host to allow it (CORS) — a host that does not is refused with
  words naming the reason, never retried in a loop. Both are read through a **byte
  counter** that aborts past D7's ceiling, so a wrong link cannot pull a gigabyte onto a
  phone before the validator sees the first byte.

### E. "Never retakes the default", as tests rather than a sentence

1. A newer shipped index (a later `generatedAt`, a `sw.js` cache bump, an app upgrade)
   **never changes** the effective mode. Pinned on `index-prefs.current()` today and on
   `index-pds.effective()` here.
2. A fetch that fails **never rewrites** the record or the mode. It falls back to Forage's
   index *for this load*, says so in words, and retries on the next load. The reader's
   choice is a fact about the reader, not about the network's mood.
3. Forage's index is **always offered**: the settings dial always lists it, and `add` keeps
   it under the reader's. Choosing it back is one press — a press the reader makes.
4. `off` on a device stays `off` on that device until the reader changes it there.

### F. The settings surface — Advanced → Discovery index, extended not replaced

Current: a mode dial (Forage's · Add mine · Replace with mine · Off), a paste box, a file
picker, *Forget my file*, and a status line. Proposed adds ONE more choice under it —
**where it is kept** — with three plain-noun options (the noun is *your atmo provider account*, owner 2026-09-21, O1):

```
Discovery index
  Forage's index was built 2026-09-14 — 1,773 feeds, 1,351 jumpstarts. Yours is laid over it.
  Yours: Gardeners of the PNW — kept on your account as the file (1.0 MB, saved 2026-09-21).
  Which index    [ Add mine — my file laid over Forage's … ▾ ]
  Where it is kept
    (•) on this browser only
    ( ) on your atmo provider account — the file     ← uploads what is stored here
    ( ) on your atmo provider account — a link  [https://…            ] [Fetch]
  [Store pasted file] [Choose file] [Forget my file] [Refresh]
```

*Refresh* re-fetches a link (D5) or re-reads the record; the status line always says which
place is in use and how old the copy is. A guest sees the first option only and the
sentence *sign in to keep it on your atmo provider account*. Every control keeps the 44px floor at 390
(the dial already learned this the hard way — `mobile-fit.workflow.mjs`).

### G. Where it lands, what it changes

| Surface | Change |
|---|---|
| `lexicons/fyi.forage.feedindex.json` | new; pinned in `js/lexicons.js` (`FEEDINDEX_RECORD`), listed in `test/lexicons.test.js` COLLECTIONS, register entry |
| `js/lexicon.js` | learns `blob` (type), `accept`, `maxSize` — `ENFORCED` grows, `test/lexicon-validate.test.js` proves each; `tools/lexicon-reference-gate.mjs` `sampleFor` learns `blob` |
| `js/feed-index-record.js` | new, pure: `toRecord`, `fromRecord` (one-of, `https:` only, the ceiling), `isNewer` |
| `js/index-prefs.js` | unchanged shape; two fixes (Phase 1): a quota error is a worded refusal, not a "Stored" toast; `own()` stays re-validated |
| `js/index-pds.js` | new: the account half (cache per DID, refresh, publish ×2, unpublish, `effective`) |
| `js/substrates/lens.js` | the writes/reads in § D; `test/invariants.test.js` moves: 2 `uploadBlob`, 2 `putRecord`, 8 `deleteRecord`, `getBlob` named |
| `js/feed-index-store.js` | `loadIndex({ own })` takes `effective()`'s shape — no change to the file logic |
| `js/ui/lens-views.js` | `discoveryIndexSection` gains § F |
| `sw.js` | precache the two new modules; `CACHE` bump |
| `docs/FEED-INDEX.md` § Bring your own · `docs/DEVICE-LOCAL.md` (row → `record`, + the cache row) · `docs/LEXICON-REGISTER.md` · `AGENTS.md` write table · `CHANGELOG.md` · `docs/adr/0005-feed-index.md` Consequences · `TODO.md` | Phase 7 |

## Act 1 — Investigate (DONE 2026-09-21; LEXICONS.md § 1, three corpora)

Nothing in the ecosystem models *a reader's chosen source of a discovery directory* — a
file, or the place a file lives. What exists is either a private preference blob (the
official namespace) or a record pointing at ONE existing thing (the community namespace),
and the nearest official object is the thing our index *indexes*.

| Candidate | What it holds | Why it does not fit |
|---|---|---|
| `app.bsky.actor.defs#savedFeedsPrefV2` via `app.bsky.actor.putPreferences` | `items[] { id, type: feed \| list \| timeline, value, pinned }` — the reader's saved feeds | the subscription list itself, not a directory of what exists; and a **private, server-side preference** rewritten whole by the official client on every save — not a record, and anything beside it is overwritten (the `mix` finding, again) |
| `app.bsky.actor.defs#interestsPref` | `tags[]` of interest, for onboarding suggestions | a hint to the AppView; same blob; no file, no place |
| `app.bsky.graph.starterpack` | a `list` + `feeds` ≤ 3 + name/description | a curated **door addressed to others**, three feeds wide; ours is a reader's own choice of source, thousands of rows with tags — the starter pack is one of the things the index names |
| `app.bsky.feed.generator` | `did` of a feed **service**, `displayName`, `avatar` blob | a pointer to a server answering `getFeedSkeleton`, not to a file; and it is what our rows point at |
| `app.bsky.actor.profile` (`avatar`) / `feed.generator` (`avatar`) | a `blob` field with `accept` + `maxSize` | not a candidate — the **precedent** for a blob referenced from a record, which is the whole-file carrier here |
| `com.atproto.lexicon.schema` | a schema, keyed by NSID | no |
| `community.lexicon.*` — `app`, `bookmarks`, `calendar`, `interaction`, `location`, `payments`, `preference` (tangled.org, 2026-09-21; the GitHub mirror archived 2026-07-27) | app listings; a bookmark = one saved `uri` + tags; events/RSVPs; likes; places; Web Monetization; AI-use consent | none models a data source a client should load on the reader's behalf; `bookmarks.bookmark` is the nearest and points at one thing, not a directory |
| namespaces forage consumes (`app.bsky.*`, `com.atproto.*`) | — | covered above; forage mints into nothing else |
| our own `fyi.forage.mix` | how one reader arranges their subscriptions | a mix composes *subscriptions*; the index is a *directory of what exists* — putting a directory in a mix conflates the map with the route |

Order of preference applied (owner, 2026-08-29): `app.bsky.*` is ruled out because no
official client should or could read this (it is Forage's discovery surface, invisible
there by design); `community.lexicon.*` has no candidate and the type is not one the
ecosystem plausibly shares yet (it describes *Forage's* index format, `"v": 1`); so
**`fyi.forage.*`, third choice, with this table as the reason.**

## Decisions

| # | Question | Options | Recommendation |
|---|---|---|---|
| **D1** | The whole-file record's carrier | (a) the index JSON inline in the record; (b) a **blob** the record references | **(b) — and (a) is not available.** The reference PDS caps a `putRecord` body at 150 KiB (E2) and the protocol's own guide caps a record at 1 MiB with "use a blob instead" (E1); the shipped index is 1,074,115 bytes. Measured end to end in the probe (E5): upload, put, public read-back, byte-equal |
| **D2** | One type or two | (a) one `fyi.forage.feedindex` with `kind: file \| url`; (b) `…feedindex.file` and `…feedindex.url` | **(a).** One choice per reader is one record at one key; two types would need a rule about what two records at once mean. `kind` + the field it needs is the `mix` row's shape, which the mirror validator already speaks |
| **D3** | The record key | (a) `literal:self`; (b) `tid` | **(a).** The reader has one discovery index; `self` makes "is there one?" a single `getRecord` and "switch file → link" a put at the same key, never an orphan |
| **D4** | Does `mode` (add / replace) travel? Does `off`? | (a) both in the record; (b) `mode` in the record, `off` device-local; (c) neither | **(b) — CONFIRMED by the owner 2026-09-21 (O2).** *Add over Forage's* vs *instead of it* is part of the choice that should follow Alice to her phone. *Off* is "no index on this device" — a reading preference, E160's batch — and a record whose meaning is "load nothing" is a record for nothing |
| **D5** | When a link is fetched | (a) on demand — first time on a device, and when the reader presses *Refresh*; (b) every visit; (c) on a timer | **(a).** The feed-index plan already decided *"polling a forager's index URL — they refresh it; we never fetch on our own."* The status line shows the copy's age so "on demand" is visible, not hidden |
| **D6** | Which half wins when a device holds a file AND the account holds a record | (a) the record; (b) the device; (c) merge | **(a), and make it impossible to ask twice:** publishing MOVES the file out of the device half (the mix pattern), so the two are disjoint by construction; the device keeps only the cache of the account's copy |
| **D7** | The size ceiling — one number for the blob's `maxSize`, the link's byte counter, and the paste box | (a) 2,000,000 bytes; (b) 5,000,000 (just under the reference PDS's 5 MiB upload default, E3); (c) none | **(a) — DECIDED by the owner 2026-09-21 (O3: *"2MB should be fine"*); the Phase 0 measurement now only confirms the browser holds it — MEASURED 2026-09-21: Chromium and WebKit each stored and read back a 5,000,000-character `forage.feedindex` value beside 100 KB of other `forage.*` keys and refused at 6,000,000 (`QuotaExceededError`), so 2 MB is under half the quota.** The copy lands in `localStorage`, whose per-origin quota is on the order of 5 MB and counts UTF-16 units; the shipped index is 1.07 MB. A 5 MB file could be *accepted, uploaded, and then silently not stored* on the device (today `write()` swallows the quota error — Phase 1 fixes that either way). 2 MB gives the harvest ~1.9× headroom and a test pins the shipped index under half of it, so growth is watched rather than discovered. Raising it later is a schema edit; lowering it after records exist is a migration |
| **D8** | The type's name | (a) `fyi.forage.feedindex`; (b) `…discoveryindex`; (c) `…index` | **(a).** Matches the storage key `forage.feedindex`, `docs/FEED-INDEX.md`, `data/feed-index.json`, and the harvest — one word for one thing across the code and the docs |
| **D9** | Does this plan publish `fyi.forage.*`? | (a) no — mint the type, register it as *unpublished (stage)*; (b) yes | **(a)** — the mixes plan's D3, unchanged: publication is one act for the namespace, owed by the register's TODO (the account whose handle is `forage.fyi` + two TXT records), and coupling it to one feature was declined once already |
| **D10** | A guest, or a reader without a record | — | **As today.** The device half is the default by the owner's decision; nothing here changes a guest's page except one sentence under the new choice |

## Phases

Every phase RED first; the journey (Phase 5) is written before the settings change it
tests, as the follow-all plan did. Commit before each mutation round. Gate: `npm test &&
npm run conformance`, plus `npm run reference-gate` in Phase 0 (it is the only check that
needs a devDependency) and `npm run workflows` from Phase 5.

### Phase 0 — the schema, and two measurements · `lexicons/fyi.forage.feedindex.json` · `js/lexicon.js` · `test/lexicons.test.js`, `test/lexicon-validate.test.js`, `tools/lexicon-reference-gate.mjs`
- The lexicon file; pinned in `js/lexicons.js`; COLLECTIONS gains the line; the register
  gains the Act 1 table above; the pinned set and the register stay one list.
- `js/lexicon.js` learns `blob` (an object with `$type: "blob"`, `ref.$link`, `mimeType`,
  integer `size` > 0), `accept` (exact mime or `type/*`), `maxSize`. `ENFORCED` grows by
  one type and two keywords and `test/lexicon-validate.test.js` proves each refusal with
  words. The reference gate's `sampleFor` learns `blob` — **and this is where the gate may
  disagree**: `@atproto/lexicon` validates a `BlobRef` instance, not the JSON shape, so the
  gate may need to feed the reference `jsonToLex(value)`. The gate will say; whichever it
  says is recorded here.
- **Measurement 1 (D7):** how large a `forage.feedindex` value Chromium and WebKit will
  hold in `localStorage` beside Forage's other keys — measured in a headless browser, the
  number written into D7, the ceiling set from it.
- **Measurement 2 (E. 1):** a test that a newer shipped `generatedAt` leaves
  `index-prefs.current().mode` untouched — pinned before anything else moves.

### Phase 1 — the codec and the device half's two fixes · `js/feed-index-record.js` · `js/index-prefs.js` · `test/feed-index-record.test.js`, `test/index-prefs.test.js`
- `toRecord({ kind, blob | url, mode, name, createdAt? })` / `fromRecord(value)` —
  round-trips both kinds; refuses (with words) a record with neither or both of
  `file`/`url`, a non-`https:` url, a blob over the ceiling, a mode outside the enum; keeps
  `createdAt` and moves `updatedAt`.
- `index-prefs.setOwn`: a `localStorage` quota error becomes a worded refusal (*"your file
  is N bytes and this browser will not hold it"*), never a "Stored" toast over nothing;
  `parseOwnText` learns the ceiling so a too-big paste is refused before it is parsed.

### Phase 2 — the lens · `lens.js` · `test/lens-writes.test.js`, `test/invariants.test.js`
- `uploadIndex`, `saveIndexRecord`, `removeIndexRecord`, `indexRecord`, `fetchIndexBlob`,
  `fetchIndexUrl` (§ D). The invariant pins move with their arguments recorded in the test:
  two `uploadBlob` callers (image; index), two `putRecord` (mix; feedindex at `self`),
  eight `deleteRecord`, every `repo:` still `session.did`; `getBlob` named as a read.
- Tests: the upload sends `content-type: application/json` and returns the PDS's blob
  object untouched; the put validates first and refuses a malformed record before any
  request; `fetchIndexUrl` refuses `http:`, refuses past the ceiling mid-stream, and turns
  a CORS failure into words naming the host; guest refusals first, before any parsing.

### Phase 3 — the account half · `js/index-pds.js` · `test/index-pds.test.js`
- Mirrors `test/mixes-pds.test.js`: cache per DID; `refresh` (record + file, age kept);
  `publishFile` (upload → put → the device copy dropped only after the put succeeds; a
  refused put leaves the device exactly as it was); `publishUrl` (fetch once and validate
  BEFORE the put — a link that does not answer is never published); `unpublish` (fresh
  read, never the cache; the file comes back to the device); `effective()` per § C's table
  — every row a test, including "fetch fails, no cache → Forage's for this load, record and
  mode untouched, retried next load" (E. 2) and "device `off` wins" (E. 4).
- `feed-index-store.loadIndex` takes `effective()`'s output; `test/index-substrate.test.js`
  gains the record-backed cases.

### Phase 4 — the settings surface · `lens-views.js` `discoveryIndexSection` · `sw.js`
- § F. The three places as one radio group under the dial; the link field with *Fetch*;
  *Refresh*; the status line's new sentences; the guest sentence; `data-feedindex-where`,
  `data-feedindex-url`, `data-feedindex-refresh` hooks for the journey.
- **The mock per MOCKS.md:** `plans/mocks/own-index-pds.html`, Current beside Proposed at
  390×844 and 1280×900, one skin, `scripts/mock-snaps.mjs` gains the account page's
  Advanced section as a route with a population that STRESSES the status line (a stored
  file with the shipped index's own counts as "mine", a long name, a long link). Handed
  over as a full path on disk.

### Phase 5 — journeys, then the live proof · `e2e/own-index-pds.workflow.mjs` · `e2e/own-index-pds-live.workflow.mjs` (`LIVE=1`)
- Hermetic (the init-script fetch patch, a live repo in `localStorage`, `shimMisses()`
  empty): a record present on sign-in → the phone shows *yours* with nothing pasted; a
  `url` record whose host refuses CORS → words naming the host, Forage's index for this
  load, the record untouched; a regenerate of Forage's index → mode unchanged; fetch fails
  with a cache → the cache with its age; device `off` over a record; a paste over the
  ceiling refused before parsing; a quota refusal in words; the tap floor at 390 and no
  sideways scroll; axe clean; no row or sentence reads `null`/`undefined`.
- Live (claim `testbed--forage-test-account` first): publish the shipped index as the
  file from the standing test account through `lens` — never raw XRPC — read the record
  and the blob back **unauthenticated with an `Origin` header**, validate, switch the same
  key to a link at `https://forage.fyi/data/feed-index.json` (E7: Forage's own host allows
  cross-origin reads), read back, unpublish; read-back-empty is the last assertion.

### Phase 6 — socialize (LEXICONS.md act 3; scope: our own projects, owner 2026-09-08)
Raised here for arecipe (`exchange.recipe.*`, `app.arecipe.*`) and croft (`ing.croft.*`):
**does any of you model "a reader's chosen data source" — a file, or a link to one, that
a client should load on the reader's behalf and keep across devices?** Answer in your own
register or in forage's entry. The wide post, kept for the day the scope widens:

> `fyi.forage.feedindex` — one record per reader saying where their discovery index comes
> from: the index file itself as a blob in their repo, or an https link to one, plus
> whether it lays over the app's shipped index or replaces it. A directory the reader
> supplies, not a subscription list. Does anything in the ecosystem model a reader-supplied
> data source a client should load for them?

### Phase 7 — the documents
`docs/FEED-INDEX.md` § Bring your own (the three places; the record; the ceiling);
`docs/DEVICE-LOCAL.md` (`forage.feedindex` → `record`, collection named; `forage.feedindex.pds`
→ `cache`); `docs/LEXICON-REGISTER.md` (Holds / Why ours / the Act 1 table; *Stage:
unpublished*; *written to a real PDS* with the date); `AGENTS.md` write table (three rows);
`CHANGELOG.md`; `docs/adr/0005-feed-index.md` Consequences (decision 5's "named follow-up"
becomes a sentence with a date); `TODO.md` item closed; this plan's Status.

## Not doing

- **Publishing `fyi.forage.*`** (D9) — one act for the namespace, owed elsewhere.
- **A cache of Forage's index in the record.** Forage's ships with the app; the record
  names *the reader's* source only.
- **Polling a link** (D5) — the reader refreshes; Forage never fetches on its own.
- **Reading another reader's index** — *"use @curator's index"* is one `getRecord` away,
  because the record is world-readable and the blob is public; it is a real feature and a
  later plan (O4), not a side effect of this one.
- **The index in IndexedDB / the Cache API.** The copy stays where it is today; D7's
  ceiling is set from the measurement rather than the store being changed. If the harvest
  outgrows the ceiling, that is the plan that moves the store.
- **`off` in the record** (D4) — E160's batch, if anywhere.
- **A `sw.js` cross-origin exception** — the copy in `localStorage` is what works offline;
  the worker stays same-origin.

## Reasoning

**Why the file cannot be *in* the record, and why that is not a compromise.** Two limits
say so (E1, E2), and the blob is the protocol's own answer to "more than a few dozen KB":
referenced from a record, garbage-collected when unreferenced, public and CORS-open on the
reader's own PDS the moment a record names it. The probe walked the whole path with the
real 1 MB file. A record holding a blob ref is *exactly* the shape `avatar` already has.

**Why `mode` travels and `off` does not.** *Add* and *Replace* say what the reader wants
done with *their* index; *Off* says this device shows no index. One is a property of the
choice; the other is a property of the device. Moving `off` into the record would make a
phone's "no index here" a laptop's fact too.

**Why the halves are disjoint rather than merged.** A merge needs a rule for every pair of
states, and every rule is a place a reader's choice can be silently overridden — the exact
thing "never retakes the default" forbids. Moving the file is one rule: where it is kept
is where it is, and the status line says which.

**Why a failed fetch falls back *for this load* and rewrites nothing.** The alternative —
"the link is down, revert to Forage's" — is Forage retaking the default on the network's
behalf. The reader chose; the network being unreachable is not the reader changing their
mind. Forage's index shown with words is availability; a mode rewritten is a decision
taken from them.

**Why one ceiling in three places.** The blob's `maxSize`, the link's byte counter and the
paste box guard the same store from the same failure (a phone asked to hold what it
cannot); three numbers would be three ways to be wrong about one thing.

**Why the measurement comes before the number.** A quota is a claim about a browser; the
memory rule this workspace keeps (*measure, don't predict*) exists because five plan
claims in one repo were refuted by their own measurements. D7 names its number as pending
for that reason.

**Why act 1 is a table.** LEXICONS.md's own example: *"nothing covers this"* does not
survive a fifth candidate; *what was opened and why each failed* does. The finding that the
official namespace's answer to "what I chose" is a private blob, twice over, is what makes
a record — not a preference — the right carrier, and only opening `putPreferences` shows it.

## Evidence (verified 2026-09-21)

- **E1 — record size** (`atproto.com/guides/data-validation`, explicitly non-normative):
  *"try to keep individual records to a few dozen KBytes. If you need to store more data,
  even text data, consider using a blob instead. A reasonable maximum record size limit
  (`MAX_CBOR_RECORD_SIZE`) is 1 MiByte"*; and *"the `subscribeRepos` Lexicon limits
  `#commit` message block size to 2,000,000 bytes"*. `atproto.com/specs/record` is a 404;
  `specs/repository` carries no number.
- **E2 — the reference PDS's JSON body cap** (`packages/pds/src/index.ts`, `main`):
  `payload: { jsonLimit: 150 * 1024, textLimit: 100 * 1024, blobLimit: cfg.service.blobUploadLimit }`
  — a `putRecord` carrying the index inline cannot reach the reference PDS at all.
- **E3 — blobs** (`lexicons/com/atproto/repo/uploadBlob.json`; `specs/blob`;
  `packages/pds/src/config/config.ts`; `actor-store/blob/transactor.ts`; `repo/prepare.ts`):
  input `*/*`, *"The blob will be deleted if it is not referenced within a time window (eg,
  minutes). Blob restrictions (mimetype, size, etc) are enforced when the reference is
  created."* Upload limit `blobUploadLimit: env.blobUploadLimit ?? 5 * 1024 * 1024`
  (a self-hosted PDS may set less). The stored mime is the sniffed type with the declared
  `Content-Type` as fallback; at record creation `verifyBlob` refuses `InvalidMimeType` /
  `InvalidSize` against what was stored — **for any lexicon** — while a lexicon's own
  `maxSize`/`accept` run only for schemas the PDS bundles (`knownSchemas`; an unknown type
  returns `validationStatus: 'unknown'`, or fails with `Unknown lexicon type` if
  `validate: true` is sent — so the app never sends it). Dereferenced blobs are deleted
  (`deleteDereferencedBlobs`).
- **E4 — reading a blob from a browser** (`api/com/atproto/sync/getBlob.ts`; `index.ts`;
  measured): auth `authorizationOrAdminTokenOptional` — anonymous is fine; a taken-down or
  deactivated account answers `RepoTakendown` / `RepoDeactivated`; the PDS mounts
  `cors({ maxAge: DAY / SECOND })` with no origin list, i.e. `*`. Measured on
  `puffball.us-east.host.bsky.network` against a public avatar with `Origin:
  https://forage.fyi`: 200, `access-control-allow-origin: *`, `content-disposition:
  attachment`, `x-content-type-options: nosniff`, `cache-control: private`. (The spec says
  serving blobs straight to browsers *"is not a recommended or required pattern"*; here
  it is the reader's own file from their own PDS, once, then cached locally — recorded as a
  deliberate departure, not an oversight.)
- **E5 — the probe** (2026-09-21, standing test account, under claim, undone; script kept
  in the session scratchpad, numbers here): `uploadBlob` of the shipped index — 1,074,115
  bytes as `application/json` — 200 in 2.1 s, `mimeType: "application/json"`, size exact.
  `getBlob` **before** any record: **500 `InternalServerError`** (not the spec's clean
  refusal — a temporary blob is simply not servable). `putRecord` at
  `fyi.forage.feedindex/self` with the returned blob object verbatim: 200 in 4.1 s,
  `validationStatus: "unknown"`. `getRecord` unauthenticated: 200, the ref intact.
  `getBlob` unauthenticated with `Origin: https://forage.fyi`: 200 in 4.6 s,
  `access-control-allow-origin: *`, `content-type: application/json; charset=utf-8`, no
  `content-length` (chunked), body byte-equal to the upload and parses. A second put whose
  ref said `size + 1`: **400 `InvalidSize` — "Referenced Size does not match stored blob.
  Expected: 60, Got: 61"**. Replacing the record with a new small blob: the old cid
  answered **"Blob not found" immediately**. `deleteRecord`: the record gone
  (`RecordNotFound`), the small blob gone, `listRecords` 0.
- **E6 — the lexicon language** (`atproto.com/specs/lexicon`): `blob` — `accept` (*"list
  of acceptable MIME types. Each may end in `*` as a glob"*), `maxSize` (*"maximum size in
  bytes"*); string format `uri` — *"Flexible to any URI schema… Maximum length in Lexicons
  is 8 KBytes"* (so `https:` only is ours to enforce); record keys admit `literal:<value>`
  (`app.bsky.actor.profile` is keyed `literal:self`).
- **E7 — forage.fyi allows cross-origin reads**: `HEAD https://forage.fyi/data/feed-index.json`
  → 200, `access-control-allow-origin: *`, `content-type: application/json`,
  `content-length: 1074785` — so the simplest possible link is Forage's own file, and the
  live proof can use it.
- **E8 — Bluesky's own "what I chose"** (`app/bsky/actor/defs.json`, `putPreferences.json`):
  `preferences` is a union of 16 `object` defs (no `record` among them) written whole
  through the procedure *"Set the private preferences attached to the account"*;
  `savedFeedsPrefV2.items[]` = `{ id, type: feed \| list \| timeline, value, pinned }`.
- **E9 — the community namespace** (tangled.org `lexicon.community/lexicons`, the source
  of truth; GitHub mirror archived 2026-07-27): `app`, `bookmarks`, `calendar`,
  `interaction`, `location`, `payments`, `preference` — nothing else.
- **E10 — what exists in forage today**: `js/index-prefs.js` (modes `forage | replace |
  add | off`; `setOwn` validates then `write()` **swallows a quota error** — the toast says
  *Stored* regardless); `js/feed-index-store.js` (`loadIndex({ own })`);
  `discoveryIndexSection` (dial, paste, file, *Forget my file* — **no URL path**: Phase 2b's
  "paste a URL" was not built); `sw.js` line 70 (`url.origin !== location.origin → return`)
  and the index file not precached by design; `test/invariants.test.js` pins one
  `uploadBlob`, one `putRecord`, seven `deleteRecord`; `js/lexicon.js` `ENFORCED` knows no
  `blob`, `accept`, `maxSize` (and no `union`); `tools/lexicon-reference-gate.mjs`
  `sampleFor` has no `blob` case; `docs/DEVICE-LOCAL.md` row `forage.feedindex` is
  `planned`; `js/mixes-pds.js` is the two-halves template; the shipped index is 1,773
  feeds / 1,351 jumpstarts / 439 edges (`data/feed-index-meta.json`, 2026-09-14).

## Open questions — owner

- ~~**O1 — the three places' words.**~~ **DECIDED 2026-09-21** (owner: *"your account = atmo
  provider account"*): *on this browser only* / *on your atmo provider account — the file* /
  *on your atmo provider account — a link*. The mixes page's *Save to PDS* is a drift from the
  same noun, noted for its own thread.
- ~~**O2 — D4:** should *Off* follow the reader after all?~~ **DECIDED 2026-09-21** — no.
  Explained to the owner as: with a record, every browser she signs in on uses her index
  automatically; *Off* flipped on the laptop stays on the laptop, the phone still shows her
  index. Owner: *"great"*.
- ~~**O3 — D7:** the ceiling.~~ **DECIDED 2026-09-21** — 2,000,000 bytes (owner: *"2MB should
  be fine"*). The store stays in `localStorage`; the Phase 0 measurement confirms it holds
  the ceiling rather than choosing the number.
- **O4 — later:** *use @curator's index* (another reader's record, one `getRecord` away).
  Named in Not doing; a yes here becomes its own plan after this one lands.

## Review Log

### Pass 3 — the build (2026-09-21, in progress)

**Phase 0 DONE.** RED first: the collection pinned in `test/lexicons.test.js` (six failures,
all the right ones), the validator tests for the record, the regenerate pin in
`test/index-substrate.test.js` (which passed at once — it pins what the store already does,
which is the point). GREEN: `lexicons/fyi.forage.feedindex.json`, `FEEDINDEX_RECORD` pinned
in `js/lexicons.js`, `js/lexicon.js` learned `blob` / `accept` / `maxSize` (the
ENFORCED-vs-declared test forced it, as designed), the register entry, and the reference
gate. **The gate finding the plan predicted, settled:** `@atproto/lexicon` 0.7 validates a
blob as "is a `BlobRef` instance" and nothing more — so the JSON side now goes through
`jsonToLex` before the reference sees it, and a new gate test ASSERTS the reference does
not enforce `accept`/`maxSize` (the W17 pattern: assert the non-enforcement so the reason
cannot expire). The mirror is deliberately stricter there because nobody else checks. 41
unit tests in the three files, the gate 3/3, the whole suite 994/994. Measurement 1 is in
D7 above: 5 MB fits in both engines, 6 MB is refused, so the 2 MB ceiling has room.

### Pass 2 — the owner's review, in conversation (2026-09-21)

The owner's first reading took the plan for *"the base index of feeds in a PDS record"* —
the clarification that landed: Forage's index stays a CI-built file served from the domain,
unchanged; the record is the reader's own note (*my file*, or *a link*) so their bring-your-
own choice follows them between browsers instead of living in one. Then the three open
questions: O1 the noun is *your atmo provider account*; O3 the ceiling is 2 MB; O2 was the
one that needed the distinction drawn — "does the same reader on another browser
automatically use their own index?" Yes, always, with a record; O2 asked only whether the
*Off* dial position also travels, and it does not. D4 and D7 are confirmed; the schema is
unchanged by the review. Phase 0 starts on the owner's go.

### Pass 1 — the plan (2026-09-21)

Written phone-free in one worktree after the Follow all landing (#77). The three corpora
were opened (E8, E9, the official lexicons); the PDS *source* was read for the limits that
decide D1 (E2 — the 150 KiB body cap is not in any spec, only in `index.ts`); and the whole
blob path was walked against a real PDS with the real 1 MB file under the test-account
claim, then undone (E5). Two things the reading alone would have got wrong: a temporary
blob answers 500, not a worded refusal, so "is it public yet?" cannot be asked of `getBlob`
— the record is the act; and a dereferenced blob is gone *immediately*, so "switch file →
link" needs no cleanup step. One thing found on the way that is owed regardless of this
plan: today a file the browser cannot hold is toasted as *Stored* (E10) — Phase 1 fixes it
RED-first. Handed to the owner before any code, per the task.
