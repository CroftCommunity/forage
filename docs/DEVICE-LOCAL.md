# Browser-only state — the register

Everything Forage keeps in this browser and nowhere else, one row per storage key, with
what the row's **account half** is: the record on the reader's own atmo provider that
would let the thing follow them between devices. Owner, 2026-09-14: *"we keep adding config
or personal things that are browser only for a start with an eye towards PDS persistence,
we should build a practice around keeping track of them so we don't forget."* This file is
that practice, and `test/device-local-register.test.js` is what keeps it honest: it
**harvests** every `'forage.…'` key from `js/` and fails on a key with no row, or a row
whose key left the code. A new store cannot land unregistered.

## The vocabulary (the fourth column)

| Half | Means |
|---|---|
| `record` | an account half exists today; the row names its collection. Local is still a destination — a reader publishes on purpose (the tagsub rule) |
| `planned` | owed an account half; the row points at the plan or TODO item that decides its shape |
| `cache` | a local copy of something the network or the account already holds; the account is the truth, so it needs no half |
| `device` | device-only by design — the row says why syncing it would be wrong |
| `undecided` | a decision owed. Batch these for the owner rather than deciding one at a time; the row says what the question is |

**The decision recorded here for `forage.feedindex`** (owner, 2026-09-14) is the template
for the others: browser-local is the default; a reader who wants it to follow them chooses
between a whole-file record and a pointer record; Forage's own shipped version is always
available as long as they keep upgrading, but once selected away from it never retakes the
default.

## The rows

| Key | Store | Holds | Half | Plan · why |
|---|---|---|---|---|
| `forage.accounts` | localStorage | which accounts this device has signed in — the switcher's roster; each session itself lives in the OAuth library's own store | `device` | a roster of sessions is per device by nature; syncing "who is signed in here" makes no sense elsewhere |
| `forage.alttext` | localStorage | the alt-text display preference (Advanced on /me) | `undecided` | a reading preference; E160 (the preferences-record batch, decided together) |
| `forage.beta.pdswalker` | localStorage | the Beta switch: rings from the data servers instead of the AppView | `device` | a beta is opt-in per device on purpose — an experiment should not follow a reader onto a phone that cannot afford it |
| `forage.boardview` | localStorage | board density (compact / comfortable) | `undecided` | a reading preference; E160 (the preferences-record batch) |
| `forage.cardsize` | localStorage | the card size notch | `undecided` | a reading preference; E160 (the preferences-record batch) |
| `forage.feedindex` | localStorage | the reader's own discovery index and the mode (Add / Replace / Off) — plan 2026-09-08 feed-index Phase 2b | `planned` | TODO.md § Needs the owner "Your discovery index on the PDS" — shape DECIDED 2026-09-14 (see above): local default; whole-file record or pointer record on the account; Forage's index always available, never retakes the default |
| `forage.gifautoplay` | localStorage | whether GIFs play on their own | `undecided` | a reading preference; E160 (the preferences-record batch) |
| `forage.haptics` | localStorage | Buzz on like | `device` | a hardware feel; the phone that has a motor decides, and a laptop has none |
| `forage.hashtagsections` | localStorage | which hashtag sections show in the nav | `undecided` | a reading preference; E160 (the preferences-record batch) |
| `forage.hero.dismissed` | localStorage | that the guest hero was dismissed | `device` | a one-time dismissal on this screen; it is gone the moment a reader signs in anywhere |
| `forage.hidden` | localStorage | "Hide for me" — posts and accounts hidden on this device (lens-views 4b) | `undecided` | Bluesky already has mutes and blocks as the account's own hides; whether a Forage-only hide list should follow the reader is a question, not a preference |
| `forage.langs` | localStorage | the content-language filter | `undecided` | a reading preference; E160 (the preferences-record batch) — note Bluesky's own `contentLanguages` preference exists and may be the half |
| `forage.lastboard` | localStorage | the board the reader was on, for `/` to return them to | `device` | a place on this screen; deliberately survives sign-out (last-board.js) and would be wrong on another device |
| `forage.mixes` | localStorage | the device half of the reader's mixes | `record` | `fyi.forage.mix` — publishing MOVES a mix out of the device (mixes-pds.js); the two halves are disjoint by design |
| `forage.mixes.pds` | localStorage | the last read of the account's mix records | `cache` | display only; the repo is the set (plan mixes-on-the-pds) |
| `forage.mode` | localStorage | what the app IS on this domain — memory or bluesky | `device` | the population axis is a property of the deployment and the device, not of the account |
| `forage.pds-walker` | IndexedDB | rev-gated snapshots of the reader's follow graph read from the data servers (the beta) | `cache` | a warm start for the next walk; the graph itself lives in the accounts' repos |
| `forage.pictures` | localStorage | how many pictures a post shows before folding into a carousel | `undecided` | a reading preference; E160 (the preferences-record batch) |
| `forage.providermark` | localStorage | the atmo-provider mark beside handles, on or off | `undecided` | a reading preference; E160 (the preferences-record batch) |
| `forage.rail` | localStorage | the right rail's panel order, or off | `undecided` | a reading preference; E160 (the preferences-record batch) |
| `forage.ringexempt` | localStorage | ring scope: boards exempt from the scope | `undecided` | ring scope is a way of reading the account's graph; whether it follows the reader is the same question as E160, decided with it |
| `forage.ringopenthreads` | localStorage | ring scope: open threads regardless of scope | `undecided` | as `forage.ringexempt` |
| `forage.ringscope` | localStorage | the selected ring scope | `undecided` | as `forage.ringexempt` |
| `forage.view` | sessionStorage | how a board is shown THIS VISIT — forum (rows), clip, or gram; the top bar's dropdown | `device` | lasts the tab, never the account: the default below is the preference; plan 2026-09-14-plan-clips |
| `forage.viewdefault` | localStorage | the view a board opens in — forum unless chosen (Preferences › Default view) | `undecided` | a reading preference like the ring stop; E160 (the preferences-record batch); plan 2026-09-14-plan-clips, owner 2026-09-21 |
| `forage.clipautoplay` | localStorage | whether a clip starts on its own in Clip mode (muted, in view) | `undecided` | a reading preference like `forage.gifautoplay`; E160; plan 2026-09-14-plan-clips D3 |
| `forage.media-posters` | localStorage | who answered a reel with a frame before, per mode — a hint for which members to ask first | `device` | a cache of this device's own reading, never the account's; plan 2026-09-14-plan-clips § B |
| `forage.ringstops` | localStorage | the ring pill's stops | `undecided` | as `forage.ringexempt` |
| `forage.skin` | localStorage | the chosen skin (light and dark are skins too — ADR-003) | `undecided` | a reading preference; E160 (the preferences-record batch) — the one most readers would expect to follow them |
| `forage.state` | localStorage | the memory population's event log and dev state (the `memory` substrate) | `device` | the bbs/demo dataset is a device-local world by definition; nothing in it is the reader's account |
| `forage.tagstats` | localStorage | per-tag counts computed from what this device rendered | `cache` | capped and disposable (tag-stats.js): "nothing depends on it surviving" |
| `forage.tagstats.seen` | localStorage | post ids already counted into tagstats | `cache` | as `forage.tagstats` |
| `forage.tagstats.seq` | localStorage | the tagstats recency counter | `cache` | as `forage.tagstats` |
| `forage.tagsubs` | localStorage | the device half of the reader's hashtag subscriptions | `record` | `fyi.forage.tagsub` — PDS Save MOVES a tag to the repo; local is a destination with a privacy the repo cannot offer |
| `forage.tagsubs.pds` | localStorage | the last read of the account's tagsub records | `cache` | display only; the repo is the set |
| `forage.threadflatten` | localStorage | thread shape: flatten | `undecided` | a reading preference; E160 (the preferences-record batch) |
| `forage.threadfold` | localStorage | thread shape: fold depth | `undecided` | a reading preference; E160 (the preferences-record batch) |
| `forage.trendingtags` | localStorage | the trending-tags fetch result | `cache` | a network read with a TTL; refetched, never the truth |
| `forage.trendingttl` | localStorage | when `forage.trendingtags` expires | `cache` | as `forage.trendingtags` |

Not rows, and why: the service worker's cache (`forage-v82` in `sw.js`) holds the app's own
files and the index file — a cache of the deployment, versioned by name, never state; the
OAuth library's own IndexedDB store holds sessions under its own names and is the
library's, not ours. `forage.beta.<name>` is the pattern for future beta switches
(beta.js); each new one is a literal key and therefore a harvested row.

## The practice

1. **A new browser-only store is a row in the same change**, with its half named. The test
   makes forgetting impossible; naming the half honestly is the part that takes thought.
2. **`undecided` rows are batched.** Most are reading preferences; the natural half is ONE
   preferences record, decided once for all of them — filed as **E160** in
   `discovery/alpha/ROADMAP_TODO.md` (2026-09-14) (and checked against Bluesky's own
   `app.bsky.actor.defs` preferences first — LEXICONS.md act 1, so a thing the network
   already models is not re-minted). Until then a row says `undecided` and why.
3. **A `planned` row cites the plan** that decides its shape, and flips to `record` in the
   change that lands it — the same change updates the AGENTS.md write table.
4. **Local stays a destination.** A half existing never makes syncing automatic; the reader
   publishes on purpose (mixes, tagsubs), and the shipped default is Forage's, which never
   retakes a choice made away from it.
