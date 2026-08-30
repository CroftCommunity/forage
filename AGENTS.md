# Agent Instructions: Forage

## Identity (workspace architecture)

**Scope:** The social forum (forage.fyi, /f/ convention, behavior-scale build; events per `docs/adr/`).
**Not this repo:** generic atproto auth (workspace prior art — DECISIONS.md). Forage
runs the vendored official `@atproto/oauth-client-browser`; loopback OAuth against the
real auth server is live-verified. Identity is MULTI-HOST and the front door says so:
`js/auth/hosts.js` is the registry (posture probed, not inferred), the sheet routes to a
server in a chosen intent (`prompt=create` verified end to end), and any other atproto
host is reachable by handle. Forage has no accounts of its own.
**Provides:** the forage site. **Consumes:** AppView pulls (ADR 0002).
Card + altitudes: `CroftC/.claude/ARCHITECTURE.md`.

Forage is a behavior-scale build (method: `discovery/alpha/thinking/behavior-scale/`
in the workspace). One behavioral contract, substrates per capability, scope as the
tier dial. This page is the law agents execute against; it is deliberately short.

Sources of truth, in order: `js/schema.js`, `scenarios/`, `js/config/routing.js`,
`ledger/divergence.js`. For the lens specifically, two more own their own
meaning: `js/rings.js` defines what a RUNG is (cumulative unions ordered by real
containment — the shipped rings did not nest, and `test/rings.test.js` keeps the
counterexample runnable), and `lexicons/fyi.forage.*` defines what a record IS,
including `tagsub`. Hashtag subscriptions are **two disjoint sets**: local
(`js/tagsubs.js`, this device, never leaves it — a destination, not a waiting
room) and published (`fyi.forage.tagsub` records, the repo is the truth, every
Forage client sees the same set). `js/tagsubs-pds.js` owns the boundary, and PDS
Save *moves* a tag rather than copying it — which is why a row's status is one
unambiguous word and why there are no tombstones to reconcile. Why each of our
own types exists: `docs/LEXICON-REGISTER.md`. **A lexicon is a convention, not an
enforcement** — measured 2026-08-29 (W17 P4): a real PDS accepted a
`fyi.forage.tagsub` with neither required field, 200. So records are validated on
the way IN, by `js/lexicon.js` against the schema, and a constraint a lexicon
declares but the validator ignores fails `test/lexicon-validate.test.js`. Modes are named routing tables (`MODES` there) with a
store-side lifecycle: network modes are RAM-only and `forage.state` is written by
the memory mode alone (`test/store-modes.test.js` is the teeth). When these disagree
with any document **including this one**, they win; fix the document.

## Invariants

1. All mutations MUST flow through the actions adapter. No component writes state
   or calls a backend directly.
2. Policy (visibility, blocking, gating) MUST live in selectors, NEVER in
   components.
3. Reducers and scenarios MUST NOT call `Date.now()` or any randomness. Time and
   randomness are inputs resolved at dispatch or replay.
4. Substrate selection (and therefore a build's tier) MUST happen only in the
   routing config.
5. Every mutation type MUST exist in the shared schema before any implementation
   uses it.
6. Every new mutation MUST land with at least one scenario exercising it.
6b. Every unit shipping user-visible behavior MUST add or extend a workflow
    journey (`e2e/`) in the same unit; a unit with no workflow surface says so
    explicitly in its plan entry. (Browser-level sibling of invariant 6.)
7. Deferring a path and registering its frontier MUST be the same commit.
8. Behavior present only at one tier MUST carry a proposal (or frontier) entry
   before it renders.
9. Conformance MUST pass (or differences be ledgered as tolerances) before a
   capability change merges on either side.
10. Results from a tier below the intended production scale MUST NEVER be cited as
    evidence for performance, concurrency, capacity, or any scale claim. The mock
    answers "does it behave and feel right," never "does it hold up."
11. When documentation and behavior disagree, behavior (schema plus scenario suite)
    wins and the documentation is corrected. Prose is never the source of truth.
12. **For anything about Bluesky, there are TWO sources of truth and they answer
    different questions.** The official *lexicons*
    (`bluesky-social/atproto/lexicons/…`) say what is **legal** — required fields,
    limits, shapes. The official *client*
    (**`bluesky-social/social-app`** — verified to be what drives bsky.app:
    `homepage: https://bsky.app`, MIT, actively maintained) says what the network
    **actually does** — defaults, conventions, what other clients will expect. Ask
    the lexicon before writing a record; ask the client before deciding how a field
    should behave. Every wrong assumption this repo has shipped lived in the gap
    between them: the lexicon does not mention content languages at all, and only
    social-app's `src/state/persisted/schema.ts` shows they are app-local (DL-026),
    that tags are 2-letter with the region stripped, and that a post's language
    defaults to the device's. Where we differ from the client, **differ on purpose
    and write down why** — forage does not default content languages to the device
    (we never narrow what you see unasked) and does not fall back to `'en'` (we say
    nothing rather than claim a language we do not know).
    Read it with:
    `gh api search/code?q=<term>+repo:bluesky-social/social-app` then
    `gh api repos/bluesky-social/social-app/contents/<path> --jq .content | base64 -d`.
    Cite file:line, and record match-or-diverge. Workspace-level entry:
    `CroftC/.claude/DECISIONS.md` § Prior-art router.

## Procedures

### Adding a user-visible function

1. Define the event(s) and payloads in the schema.
2. Write or extend the reducer; state derives, nothing is hand-maintained.
3. Expose reads as selectors, with policy enforced there.
4. Add the action through the adapter; wire the UI with all four states (skeleton,
   empty, error, gated).
5. Author a scenario touching the new mutation, with seat-level assertions.
6. Run conformance if any affected capability is on `api` or `hybrid`.
7. Run the acceptance checklist items for the affected screens.

### Changing an engine (ranking, recommendations, limits)

1. Implement the change as a variant alongside the current version.
2. Run both variants over the scenario library; record the output diff.
3. If the diff violates a contractual assertion, either revise or ledger a
   tolerance with reason.
4. Promote the variant; keep the diff record with the change.

### Scaling a capability (moving it up the continuum)

1. Implement the API against the schema for that capability's events and selectors.
2. Flip the routing config to `hybrid`.
3. Run conformance on every scenario touching the capability; ledger tolerances
   explicitly.
4. Flip to `api`. Keep the memory implementation; it is still the substrate for the
   mock and small tiers.
5. Add the capability's scenarios to the backend CI as fixtures.

### Escalation

On schema conflicts, tolerance ambiguity, or any case where the procedure
underdetermines the choice: STOP, surface the question, and log it as an ADR rather
than inventing an answer. An invented convention that ships is drift with a head
start.

## Surfaces (Bluesky population)

Clean paths (3n) — no `#` fragments; `404.html` mirrors `index.html` for Pages
deep links and the service worker upgrades them to 200s. One route namespace,
resolved by the active presentation mode (`js/mode.js`):
`/` **the landing rule, not a page** — a logged-out reader falls through to the
directory; a returning one is `replaceState`d onto the board they left; a first
sign-in lands on `/r/fol` (`js/last-board.js`, plan 2026-08-26-4 V5) ·
`/trending` the directory itself, which needs its own address precisely BECAUSE
`/` redirects away from it · `/r/:rung` a ring board, one address per rung
(`js/rings.js`) · `/f/@creator/:rkey` feed board (the SHAREABLE form) ·
`/f/:slug` the same board in-session · `/h/:tag` hashtag board · `/hashtags`
browse hashtags · `/p?uri=` thread · `/u/:handle` profile · `/me` your session,
accounts, moderation mirror **and Preferences** (E144 — `/settings` redirects
here in the lens; the memory population keeps its own) · `/feeds` discovery ·
`/mode` · `/frontiers` (the divergence ledger, rendered). Cross-population
routes gate with words.

**Navigation is a left nav, not a masthead** (plan 2026-08-26-4 V4). Every board
is a row with exactly one job — the two-half strip it replaced died of a control
that was a tab AND a menu opener, so switching always opened a menu. On a phone
the nav is a drawer, which costs no vertical space until opened. The masthead
carries a hamburger, the skin toggle and ONE account control: a 44px avatar —
the account's own picture, initials underneath as the not-yet-loaded state (plan
2026-08-29 post-and-thread, decision 8) — because the bar fits a single row at
320px only just.

**Everything in the nav is a BOARD**, and boards differ only in where the posts
come from: a feed generator, a hashtag, or your own graph at some reach. There
is no views-vs-feeds axis — `CURATED[0]` is `{slug:'whats-hot', title:'Discover'}`,
one object, so "Discover" is a feed with a good name rather than a category. One MODAL surface rides the
signed-out lens: the host sheet (`<dialog>`, opened from the sidebar sign-in card), which
is absent — not hidden — signed in. A feed link must carry its
CREATOR to survive being pasted: an rkey has no DID, and nothing resolves one
without a repo (3v). Human aliases still route.

Two generations of link stay alive on purpose, because both were shared before
the current scheme existed: `#/…` fragments bridge to their clean path at boot
AND live (`hashchange`), and the `/lens/…` prefix redirects to its unprefixed
equivalent. Neither is a route to write new links against; both exist so old
ones do not rot. An OAuth fragment response (`code` + `state`) is never mistaken
for a route — that bridge explicitly refuses it, which is what stops it eating a
sign-in callback.

The lens writes, and `test/invariants.test.js` counts every one of them —
adding another means arguing for it there first:

| Write | What | Since |
|---|---|---|
| `createRecord` → `app.bsky.feed.like` | boost | DL-013 |
| `deleteRecord` → `app.bsky.feed.like` | unboost | DL-013 |
| `createRecord` → `app.bsky.feed.post` | publish a post or reply | 3w |
| `deleteRecord` → `app.bsky.feed.post` | delete your OWN post or reply | phase 2 |
| `uploadBlob` | image bytes into your repo, referenced by the post | phase 3 |
| `putPreferences` (savedFeedsPrefV2) | join / leave a feed | 3j |
| `putPreferences` (savedFeedsPrefV2) | favorite / unfavorite (pin) | 3s |
| `createRecord` → `fyi.forage.tagsub` | save a hashtag subscription to your repo | P5 |
| `deleteRecord` → `fyi.forage.tagsub` | remove one from your repo | P5 |
| `app.bsky.bookmark.createBookmark` / `deleteBookmark` (procedures) | Save / Unsave — Bluesky's private, server-side bookmark; no record | post-and-thread 4a |
| `app.bsky.graph.muteActor` / `unmuteActor` (procedures) | Mute / unmute an account | post-and-thread 4a |
| `app.bsky.graph.muteThread` / `unmuteThread` (procedures) | Mute / unmute a thread | post-and-thread 4a |
| `createRecord` → `app.bsky.graph.block` | Block an account (a record — the blocked account can see it) | post-and-thread 4a |
| `deleteRecord` → `app.bsky.graph.block` | Unblock | post-and-thread 4a |
| `createRecord` → `app.bsky.feed.repost` | Repost (O6) | post-and-thread 4a |
| `deleteRecord` → `app.bsky.feed.repost` | Un-repost | post-and-thread 4a |

The eighth and ninth are the first records **Forage defined for itself** that
reach a repo. That step is argued for in `docs/LEXICON-REGISTER.md`, which every
`fyi.forage.*` type now needs an entry in: what it holds, why it is ours, and
what was checked in the ecosystem first (`test/lexicons.test.js` enforces all
three). A `fyi.forage.*` type that duplicates an official lexicon is a fork of
the network wearing a namespace.

No `putRecord` anywhere: the lens creates and deletes, and never edits a
record — changing a post means deleting it and writing another, which is what
the network itself does. **Every write addresses `session.did` and nothing
else**, and the post delete additionally parses the at-uri and refuses one
outside your repo; `test/invariants.test.js` asserts both, per occurrence. Joining and favoriting are DIFFERENT states — saved is your list,
pinned is the top row of tabs — and conflating them rearranged the official
app's tab bar for anyone who joined a feed here (3s).

## Verification

Every task ends with:

1. `npm test` — the whole gate (characterization, purity, invariant scans; CI runs
   the identical command).
2. `npm run conformance` — replays the scenario library on two substrates and
   compares observables (86 today). Live; not optional.
2a. `npm run reference-gate` — the lexicon validator cross-checked against
   `@atproto/lexicon` (LEXICONS.md rule 4). Separate from `npm test` on purpose: it is
   the only check needing a devDependency, and the unit gate installs nothing.
2b. `npm run workflows` — the workflow corpus (`e2e/*.workflow.mjs`): the app as
   a running system in a real browser, shim-backed and hermetic; LIVE=1/DOCKER=1
   unlock the credentialed/daemon-bound journeys locally.
3. The acceptance checklist items for affected screens. In the MEMORY population
   that means seat by seat via the dev-bar persona switcher (seat-level and
   observable: "switch to seat `newbie.moss`; Create feed is gated with the
   probation message"). The Bluesky population has no seats — it has one real
   account — so its equivalent is the signed-out / restoring / signed-in triad,
   and anything that writes is checked against a test account, never the owner's.
4. A report of results, including tolerated differences with ledger ids.

## Escalation

STOP and write an ADR to `docs/adr/` (NNNN-slug.md, registered in `CroftC/.claude/DECISIONS.md`) when: schema conflict, tolerance ambiguity,
procedure underdetermines the choice. Never invent a convention.

## Concurrent sessions (workspace norm)

Multiple agent sessions share the `CroftC/` workspace. Do multi-turn work in a dedicated
worktree — `git -C forage worktree add ../worktrees/forage/<slug> -b claude/<slug>` — never in
this checkout (peer sessions stage with `git add -A`; loose files get swept into unrelated
commits). Contested surfaces here — claim in `CroftC/.coordination/claims/` before
touching: **landing on `main`** (the Pages deploy at forage.fyi follows it). Full protocol
and the reasons behind it: `CroftC/.claude/COORDINATION.md`.
