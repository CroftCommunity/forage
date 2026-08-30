# Forage

<img src="assets/logo-wordmark-800.jpg" alt="Forage — wordmark with a rook in a wreath as the O" width="640">

**Forage the open web.**

Forage is a topic-driven aggregation site in the Reddit structural family — a left nav
of boards beside one column of posts, community-scoped posting, boost-only rating
(there is no downvote — DL-011 retired 2026-08-27, because Bluesky has likes and no
dislikes and two populations disagreeing about that was worse than losing the arrow),
hot ranking with time decay, deeply nested collapsible comments, volunteer stewards
with a public audit log.

It is **one of two things at a time** — a live lens over Bluesky (the domain
default) or a local sandbox — and which one is a device-local choice at `/mode`. The
two never mix: the sandbox is not a demo of the lens, and the lens is not a backend
for the sandbox. Details in *The front door, and the two populations* below.

## Run it

No build step. Use the bundled preview server — it mirrors GitHub Pages, including
serving `404.html` for unknown paths, which is what makes clean-path deep links
(`/f/@creator/rkey`, `/h/gardening`) behave locally the way they do in production:

```sh
npm run preview        # http://127.0.0.1:8737
```

Any static server works for the front page, but one without the 404 fallback will
404 on every deep link. (ES modules need a server, not `file://`.) Signing in works
from `127.0.0.1` too: the app builds a loopback OAuth client_id, so you authorize
against the real Bluesky auth server from your machine.

Tests run on the pinned Node (`.nvmrc`, enforced by `engine-strict`; `fnm install` reads
the pin). The **app itself ships zero runtime dependencies** — no build step, no
framework, no bundler. Dev dependencies exist only for the browser tier (Playwright,
axe, Stryker), so `npm test` and `npm run conformance` run on a bare checkout and only
`npm run workflows` needs `npm install`:

```sh
npm test              # units, characterization, purity + invariant scans, scenarios
npm run conformance   # replay the scenario library on two substrates, compare observables
npm run workflows     # the journeys: the app in a real browser over a hermetic shim,
                      # including an axe accessibility pass per skin
```

CI runs all three as the gate on every PR and push to `main`.

Deployed on GitHub Pages at [forage.fyi](https://forage.fyi/) and installable as a PWA.
Every asset path is **absolute** — a route-relative `./icons/x.png` would resolve against
`/f/` on a deep link, so `test/invariants.test.js` scans for them; this is the trade for
clean URLs, and it means the app expects to live at a domain root. Append `?nosw` to
bypass the service worker. Domain, DNS, certificate, and brand-asset operations:
[docs/HOSTING.md](docs/HOSTING.md).

## How it works (the memory sandbox)

This section describes the **sandbox** — the contract layer. The Bluesky view is a lens
over someone else's data plane and works differently; see *The tiers* below.

Identity in the sandbox is a **dev-bar dropdown**, not a login. Every UX path is walkable
from every seat. (In the Bluesky view, identity is a real OAuth session.)

- **Event vocabulary** (`js/schema.js`) — the build spec's data model becomes an append-only
  event log. Scores, comment counts, reputation and unread badges are *derived*, never
  stored: state is a pure fold over the log (`js/reducers.js`), so drift is impossible.
- **Selector contract** (`js/selectors.js`) — the read API of the future, expressed as pure
  functions now. Policy (the §10 permission matrix, removal masking, ban read-only, rate
  limits) lives here so it holds on every surface.
- **Action contract** (`js/actions.js`) — the write side. Every action resolves its
  capability's substrate through the routing table (`js/config/routing.js`, all `memory`
  today) and dispatches to it (`js/substrates/memory.js` is the only module that touches
  the store's commit); the dev bar's latency toggle and Fail-Next wrap that dispatch, so
  the optimistic-vote rollback path is observable on any substrate.
- **Engines** (`js/engines/`) — the ranking math as pure, swappable functions. Hot (the
  build spec's decay, on engagement — likes + replies + reposts — since 2026-08-29), Top,
  New and Rising; Best (Wilson) and Controversial retired with downvotes, because without a
  denominator both reduced to Top. The Limits engine runs rolling-window rate limits over
  the event log.

## Skins

A skin is a **token-sheet swap** (Settings → Skin, device-local): an extra
stylesheet that may only reassign the design tokens in `css/tokens.css` —
`test/skins.test.js` scans every registered skin and refuses smuggled component
rules. That restriction is the point: a skin can restyle anything and
restructure nothing, so it can never hide a moderation notice or a gate.

**A skin carries exactly one palette.** Light and dark are not a second axis;
they are skins (ADR-003). A skin may declare a **sibling** — its opposite-palette
twin — and the upper-right toggle swaps to it, or reads as disabled where none
exists. Shipping: **Forage (light)** ↔ **Forage (dark)**, **phpBB (classic
board)** ↔ **phpBB (after hours)**, **Classic BBS** (amber terminal),
**Usenet gray** (newsprint), the warm set — **Rosewater**, **Lavender**,
**Apricot** and **Seaglass**, inspired by the classic phpBB era's colour
variants under our own values — and **Cornflower**, the phpBB blue on the same
grammar beside the classic board, each with both sides
(`plans/2026-08-30-plan-warm-skins.md`; captures in `plans/mocks/warm-skins.html`). Skins and modes stay independent
axes — the phpBB board in the Bluesky view is legal, just off-theme.

New skins are cheap: one CSS file plus one registry line in `js/skins.js`.

### Importing a phpBB style

```
npm run import-phpbb -- <style-dir-or-css> [--name id] [--out file] [--licence L]
```

Reads a real phpBB style and emits a Forage skin. It resolves by **selector**
across every CSS file in the style — not by filename, because only one of the
four styles surveyed actually has a `colours.css` (subsilver2 is monolithic,
modern styles inline colour, some author in SCSS).

An imported skin is faithful in **palette, typography and chrome — never in
layout.** Forage keeps its own DOM, so a phpBB template targets markup that does
not exist here. The result reads as that theme's colours on Forage's structure;
row density is a registered frontier (DL-028), not an oversight.

Every generated file states its own provenance: source, licence, and per-role
whether each value was read from the theme (`direct`), resolved through a
declared fallback chain (`derived`), or not found (`absent`). The tool exits
non-zero on an unresolved role or a failed contrast gate — `--allow-contrast-
failures` emits anyway, knowingly.

Only GPL-compatible skins ship in this repo. The importer is a local tool for
themes you have licensed. See `docs/SKINS.md` for the role vocabulary and
`test/fixtures/phpbb-themes/PROVENANCE.md` for what is vendored and why.

## Testing

`npm test` (units + invariant scans) · `npm run conformance` (memory↔codec worlds)
· `npm run workflows` (the journey corpus: the app in a real browser over a
hermetic network shim — `e2e/`; `LIVE=1` / `DOCKER=1` unlock the credentialed and
spaces-PDS journeys locally).

Three things the suites enforce that are easy to lose:

- **Every runtime module is precached** in `sw.js`'s `SHELL`, and no two entries
  may resolve to the same URL — a duplicate makes `Cache.addAll` reject the whole
  install *silently*. See [docs/HOSTING.md](docs/HOSTING.md).
- **Every asset reference is absolute**, because a relative one breaks on deep links.
- **Every write the lens makes is counted**, so a new one cannot appear unnoticed —
  the list is in `AGENTS.md`.

Mutation testing (`npx stryker run`) is a periodic audit rather than a gate: read the
survivors, and say which are equivalent mutants and which are real gaps.

## The dev bar

Above the header, dashed to mark it as scaffolding — and rendered in the **memory
population only**, since none of it means anything against live network data:

- **Mode** — memory | bbs (network modes are RAM-only; Seed/Import/Delete All and
  the persona switch are pinned outside memory). Switching *population* is not here;
  it lives at `/mode`.
- **Persona** — switch seats; re-derives every viewer-dependent view in one place.
- **Seed / Delete All** — replay the scenario library (`scenarios/` — the same
  deterministic, assertion-carrying scenarios the test suite and conformance harness
  run), or clear to the genuine empty state.
- **Export / Import** — round-trip the whole event log as JSON.
- **Latency** — 0 / 250 / 600 ms simulated write latency.
- **Fail Next** — arm a one-shot write failure to watch optimistic UI roll back.
- **Frontiers / SW unregister** — toggle deferred-feature chips; drop the service worker.

## Personas (seats)

Memory sandbox only — the Bluesky view has one real account, not eight seats.

| Seat | Handle | Covers |
|---|---|---|
| — | Logged out | Public reads, auth-gates on every write |
| 1 | `admin.wren` | Site admin |
| 2 | `owner.sage` | Owner of `gardening` |
| 3 | `steward.briar` | Steward of `gardening` + plain member elsewhere (dual-hat) |
| 4 | `member.fern` | Established member — the default reader seat |
| 5 | `newbie.moss` | Probation: rate-limited, cannot create feeds |
| 6 | `banned.thorn` | Banned from `gardening`, active elsewhere |
| 7 | `heavy.aspen` | High reputation, at the post rate limit, saved items populated |
| 8 | `pristine.dove` | Never receives seed activity — first-run and empty states forever |

## Nomenclature

Both populations call the place posts live a **feed**. That was not always true —
the sandbox called it a *Field* until 2026-08-26 — and the rename went all the way
down, through the event vocabulary and the `fyi.forage.feed` lexicon, rather than
stopping at the labels. One product, one word.

What the two populations do *not* share is what a feed can promise:

| Concept | Memory sandbox | Bluesky view |
|---|---|---|
| The place posts live | **feed** (`/f/:slug`) | **feed** (`/f/@creator/:rkey`) or **hashtag** (`/h/:tag`) |
| Who governs it | its **stewards** — you join, they moderate, the audit log is public | nobody. A Bluesky feed is somebody else's program; you cannot join it in that sense, and you cannot post into it |
| Rating | **Like** (one arrow, no bury since 2026-08-27) | **Like** — a real like; Bluesky has no bury |
| Ranking | **Hot** on likes + replies + reposts; Top; New; Rising | the same Hot over the loaded window; Top; New; the feed's own order |
| The rendered stream | **board** | **board** |

So "feed" names the same *shape* in both, and the governance is what differs — which
is the honest split, because it is the part a reader can actually feel. The private
BBS (phase 5) is where a feed regains membership and gatekeeping.

Shared: a **post** is a post, a **thread** is a thread, and in the Bluesky view a
thread continues through quotes as well as replies, because a quote is a reply the
actor-centered view scattered onto someone else's profile.

## Where Bluesky's behavior is defined (two sources, two questions)

Forage is a lens onto Bluesky, so most of what it must get right is defined
somewhere else. There are two authorities and they answer different questions:

| Question | Source |
|---|---|
| What is **legal** — required fields, limits, record shapes | the official lexicons, `bluesky-social/atproto/lexicons/…` |
| What the network **actually does** — defaults, conventions, what other clients expect | the official client, [`bluesky-social/social-app`](https://github.com/bluesky-social/social-app) |

`social-app` is what drives bsky.app (its own repo metadata says so:
`homepage: https://bsky.app`, MIT, actively maintained), which makes it the
canonical reference for client behavior — the things a lexicon cannot tell you
because they were never a matter of legality.

Every wrong assumption this project has shipped lived in the gap between those
two. The lexicon does not mention content languages at all; only the client's
`src/state/persisted/schema.ts` shows they are stored **in the app**, that
language tags are two letters with the region stripped, and that a post's
language defaults to the device's.

Reading it:

```sh
gh api "search/code?q=contentLanguages+repo:bluesky-social/social-app"
gh api repos/bluesky-social/social-app/contents/src/state/persisted/schema.ts \
  --jq .content | base64 -d
```

**Differing from it is allowed; differing by accident is not.** Two places
Forage diverges on purpose, both recorded in the ledger: the official client
defaults your content languages to your device's, and Forage defaults to no
filter at all — narrowing what you see without being asked is the opposite of
the point. And where the client falls back to `'en'` when the device says
nothing, Forage says nothing, rather than claim a language it does not know.

Details and the full discipline: `AGENTS.md` invariant 12, `ledger/divergence.js`
(DL-026), and `CroftC/.claude/DECISIONS.md` § Prior-art router for the
workspace-wide entry.

## Boards: feeds and hashtags are NOT the same promise

Both render as boards — same rows, same sort bar, same card/compact view — and
differ in exactly one place, the strip at the top:

| | `/h/<tag>` hashtag | `/f/<feed>` feed |
|---|---|---|
| Who decides what appears | the tag itself | a program you cannot inspect |
| Can you get in on purpose | **yes** — include the tag | **not knowably** |
| Rules published | n/a (the tag IS the rule) | **no** — verified 2026-08-26 |
| Join | **yes, but only on your device** | subscribe (writes your Bluesky saved feeds) |

Feeds publish no machine-readable criteria: the `app.bsky.feed.generator`
record carries only name/description/avatar, `describeFeedGenerator` returns a
service DID, and the third-party builders keep configs server-side. The only
inclusion instructions that exist are the feed's own description prose — which
is why the feed board renders it verbatim and never offers a "post to this
feed" button (`ledger/divergence.js` DL-025).

Neither is a subreddit: a hashtag has no membership or moderators, a feed
cannot be posted into. The BBS mode (phase 5) is the surface where the full
forum contract — membership, gatekeeping, posting into a place — becomes real.

**Joining a hashtag is a local act, and that is a feature rather than a
shortfall.** Bluesky has nowhere to put it — there is no hashtag primitive, and
`savedFeed` stores a feed, a list or your timeline and nothing else. So a
subscription lives on the device, and **nobody can see what you follow**,
because it never left your machine.

**Publishing one is a separate, per-subscription choice.** Your account page
lists every subscription with where it lives and one control:

```
#harvest     Local only     [ PDS Save ]
#mycology    Saved to PDS   [ Remove from PDS ]
```

PDS Save writes a `fyi.forage.tagsub` record into your own repo
(`lexicons/fyi.forage.tagsub.json`). That makes the tag **visible to anyone,
exactly like a follow**, and the box says so above the buttons — "PDS Save" does
not carry "public" on its own. In exchange, every Forage client you sign into
sees the same set.

The two are **disjoint sets, not one list with a flag**: PDS Save *moves* a tag
off the device, and Remove from PDS moves it back to local-only on the device
that pressed it. Moving is what makes each row's status a single unambiguous
word, and it is why nothing here needs tombstones — a deleted record's absence
*is* the deletion. The one cost is stated rather than hidden: published tags need
the network, so offline the page shows the last set it read, says that is what it
is showing, and turns the buttons off rather than aiming a write at a set it
cannot currently see.

Local is a destination, not a waiting room. Neither half is the "real" one.

## Browsing hashtags

`/hashtags` has three sections, because there are exactly three honest sources
and they answer different questions:

| Section | Question | Works logged out |
|---|---|---|
| **Find a hashtag** | does a tag about X exist, and is anyone using it? | no — `searchPosts` is 403 without a session |
| **Trending now** | what is the network doing right now? | **yes** |
| **Hashtags loaded** | what do the boards I read talk about? | **yes** — any board you open feeds it |

**Bluesky publishes no hashtag ranking.** `app.bsky.unspecced.getTrends` looks
exactly like the endpoint that would — it carries a `postCount`, a `startedAt`
and a hot/cooling `status` — and every result is a *feed generator* with an
opaque record key where a tag would be (probed 2026-08-28). So "trending" here
means: fetch the trending feeds, harvest the tag facets off their posts, count.
The section says what it sampled, and calls itself a barometer of the network
rather than a chart of it. It refreshes on a dial, hourly by default.

"Hashtags loaded" counts every post on a board you opened — including below the
fold, and only what your language settings let through. **Not scrolling,
loading.** Background trending fetches never feed it: one list is what the
network is doing, the other is what you read, and merging them would make both
meaningless. Two tests pin that rule, because the next person adding a
background fetch will not read the comment.

## The front door, and the two populations

Forage is **one of two things at a time** — full populations, never mixed
(`/mode` switches; the routes `/`, `/f/`, `/h/`, `/p` mean whichever is
active):

- **Bluesky view** (the domain default): live network content, topic-first,
  readable with no account at all. Signed in (OAuth — you authorize on your own
  server and no credentials touch Forage), the **ring dial** chooses how far out
  your world goes — World / Following / Mutuals / Mutuals +1 (capped at 25 with
  honest overflow) — boosts are real likes, threads continue through replies
  AND quotes, your account's own moderation posture applies everywhere, `#tags`
  open `/h/` boards, and the trending rail opens topics as feed streams. What it
  writes is listed under *Writing*, and it writes only to your own repo.
- **Memory sandbox**: the local, seeded instrument — in-memory reducers,
  deterministic seeds, a persona switcher per seat, and nothing leaving the
  device. It is where the behavioral contract is defined and the baseline every
  other tier is proven against.

Your choice at `/mode` is device-local, and CLEARING it means the device
follows the domain default. A route that belongs to the other population gates
with words — no silent redirects, no mixed chrome.

**Identity surfaces** (Bluesky population): `/me` carries your session, the
account switcher (several fully separate accounts, one page), your content
languages, and the moderation mirror; `/u/<handle>` is any user's profile —
avatar, banner, counts, bio, and their posts — with editing linked out to
bsky.app. `/feeds` is feed discovery (searchable); every feed board carries its
card.

**Reading controls**, on every board: sort and timeframe (honestly scoped — they
sort the *loaded* window, and say so), card or compact view, a four-notch card
size (how much room a post takes, and how tall its pictures stand on their stage),
and content languages. A post declaring a language you do
not read is *annotated*, never hidden, until you choose otherwise — and when a
filter does hide something, the board says how many and links to the setting.

## Writing

Signed in, Forage writes to **your own** Bluesky repo and nowhere else:

- **Post** to a hashtag board. The board's tag is added if you did not write it,
  as a proper facet, so the network indexes it — which is the whole reason a
  hashtag is targetable and a feed is not.
- **Reply** in a thread. Root and parent are both carried, with cids, so the
  reply threads where you wrote it.
- **Images**, up to four. **Alt text is required** — not a nudge: the network
  refuses an image without it, and would silently accept a blank one, which is
  an inaccessible post wearing the shape of an accessible one.
- **Delete** anything you wrote. Two clicks, not a modal dialog. The delete
  parses the record's own at-uri and refuses one outside your repo, so the guard
  holds even if the button is bypassed.
- **Boost** (a real like), and **join** or **favorite** a feed — which are two
  different things, exactly as Bluesky models them: joining puts a feed in your
  list, favoriting pins it to your top row.

The character counter counts what will actually be *sent*, board tag included,
and goes negative rather than clamping — clamping hides that your words are
being cut. Both of the network's limits are enforced before anything is sent:
300 characters *and* 3000 bytes, which are genuinely different limits (300
family emoji are 300 characters and 7500 bytes).

Not built, deliberately, and each recorded in the ledger: editing a post (the
network has no edit — you delete and rewrite), video and gallery embeds,
@mention facets, self-labels, and posting *to a feed*, which cannot be promised
because feeds do not publish their criteria.

## URLs

Real paths, not hash fragments: `forage.fyi/h/gardening`,
`forage.fyi/f/@bsky.app/whats-hot`, `forage.fyi/u/alice.test`.

**`/` is a rule, not a page.** Logged out it falls through to the directory; a
returning reader is sent to the board they left; a first sign-in lands on
`/r/fol`. Which is why the directory has its own address at `/trending` — a page
reachable only from `/` would be unreachable for exactly the readers `/`
redirects. Rings are addresses too, one per rung (`/r/mut`, `/r/world`), so a
ring board can be reloaded and linked like anything else.

GitHub Pages has no rewrite rules, so `404.html` is a copy of `index.html` (a test
asserts they stay identical) and serves every deep link; the service worker answers
navigations from the cached shell, which makes those links real 200s and works
offline. A crawler's first hit still sees Pages' 404 status — see
[docs/HOSTING.md](docs/HOSTING.md).

**A feed link must carry its creator.** `/f/<rkey>` works while you are browsing but
cannot be pasted to anyone: a feed's identity is
`at://<did>/app.bsky.feed.generator/<rkey>`, rkeys are not unique across creators,
and nothing resolves one without a repo. So the shareable form is
`/f/@creator/<rkey>`, which resolves cold in two unauthenticated calls. Every link
the app hands out uses it.

Old links keep working, both generations: `#/…` fragments bridge to their clean path
at boot and live, and `/lens/…` redirects to its unprefixed equivalent. The bridge
explicitly refuses an OAuth fragment response, so a sign-in callback is never
mistaken for a route.

Every asset reference must be absolute — a route-relative `./icons/x.png` resolves
against `/f/` on a deep link, so `test/invariants.test.js` scans for it.

## Modes

The running app has **modes** — named routing tables over the same capabilities
(`MODES` in `js/config/routing.js`) plus a dataset lifecycle (`js/store.js`):

- **memory** (the default): the local sandbox. The only mode that persists —
  everything lives under the `forage.state` key.
- **bbs** (experimental, phase 5): the private-board mode. RAM-only: entering it
  suspends persistence structurally, the dataset dies on exit/reload, and
  `forage.state` is provably untouched (byte-identical round-trip under test).
- The **Bluesky view** (`/`) is deliberately NOT a mode — it is a read
  surface over the live network with its own session; nothing from it enters the
  event fold. Identity is an **atproto account on a server someone else runs**
  (the official OAuth flow via the vendored `@atproto/oauth-client-browser`,
  drift-checked in `test/vendor.test.js`): you authorize on your own server, no
  credentials touch Forage, and the session survives reloads. The masthead keeps
  the one-tap Bluesky path; the sidebar card's **Use another provider** opens the
  host sheet ("Choose your atmo provider", *atmo* glossed as a Personal Data Server
  provider in the open social Atmosphere), whose front page offers the open-signup hosts — Bluesky, Blacksky
  and EuroSky — and whose **Another provider** panel carries the invite-only ones
  (Northsky, sign-in only) above a handle field for any other atproto host. Forage has no accounts
  of its own — `js/auth/hosts.js` is the registry and
  `e2e/hosts-live.workflow.mjs` (LIVE=1) is what notices when a host's posture
  changes. Works on forage.fyi and localhost (the OAuth client is origin-bound;
  other origins are read-only).

The dev bar's store-mode control is scaffolding, and the dev bar itself renders in the
memory population only; the PRESENTATION mode (which population the app *is*) lives at
`/mode`.

## The tiers

One behavioral contract, one atproto data plane — **scope is the tier dial**
(`js/config/routing.js`):

- **Mock** (`memory`): the permanent in-browser instrument — hermetic CI/CD, behavior
  and workflow testing, and the conformance baseline every other tier is proven
  against. Reachable at `/mode`; not the domain default any more.
- **Scoped** (atproto, small aperture, all public): Forage's write vocabulary as
  `fyi.forage.*` records (`lexicons/`) in members' own PDS repos; a `fyi.forage.roster`
  record in the founding DID's repo is the aperture; intake is unauthenticated
  `listRecords` over exactly the roster's DIDs; moderation is steward action records
  applied as masking at fold time (nobody deletes another member's records). The
  substrate (`js/substrates/atproto.js`) is a pure event↔record codec plus a
  session-bound writer — proven by conformance against `memory` over the whole scenario
  library, and live on a real PDS with two DIDs. **Built and proven, not wired into
  the app**: deferred deliberately in favour of the private-BBS direction.
- **Wide** (atproto, network aperture): **shipped, and the domain default.** The same
  UI as a lens over your own Bluesky — feeds and hashtags are boards, replies and
  quotes are one thread, boost rides likes, moderation rides your account's own
  mutes/blocks/labelers/muted-words through the same masking selectors. It reads far
  more than it writes, and every write it makes is listed in `AGENTS.md`.
- **Private BBS** (atproto Spaces, phase 5 — paused): the surface where the full forum
  contract becomes real — membership, gatekeeping, posting into a place. Paused behind
  public-site work; the split is drafted and approved.

Differences between tiers are refused by the conformance harness
(`npm run conformance`) unless the divergence ledger (`ledger/divergence.js`, rendered
at `/frontiers`) names them. The ledger is not a backlog — it is the record of every
place a tier knowingly differs, and why.

---

*Find the good stuff.* · [forage.fyi](https://forage.fyi)
