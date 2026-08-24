# TODO

Deferred work surfaced by `plans/2026-08-24-1-plan-behavior-scale-scaffolding.md`
(closed 2026-08-25) — full context lives there and in the ledger.

## Needs the owner

- **Push `main`** — ~50 local commits; pushing deploys forage.fyi (Pages serves main).
  On the first push, **pull the `workflow_dispatch` hatch once** (1d's pending item —
  the workflow must be on the remote default branch first).
- **`CroftC/.claude/CI-PATTERN.md`** — the forage row is stale (now: 2 workflows-worth
  of gate discipline in one workflow, all nine rules). Meta-repo commit, on request.
- **ATProto Spaces feasibility** (user-named, post-plan): the privacy variant of the
  scoped tier; probe the alpha, diff membership semantics against the roster+masking
  built here; its own plan.

## Ledgered (see `ledger/divergence.js`)

- **DL-013 boost-as-like** — the first lens WRITE; promote when write-scope opens.
- **DL-014 guest lens search** — chip until a session; real search works signed-in.
- **DL-015 lens saves** — bookmarks aren't public API surface yet.
- **DL-009 deleted-post title retention** (proposal) — decide when a scenario cares.

## Scoped-tier deployment (the "ten friends" instance)

- Register a session-bound atproto substrate in `js/config/routing.js` (the codec,
  intake, and writer all exist and are live-proven; what's missing is session plumbing
  and a deploy story).
- Optional freshness channel: the filtered Jetstream live tail (676ms write→event,
  probe-proven) over the pull baseline.

## Lens polish

- Real OAuth replaces the in-memory app-password sign-in (croft's connect OAuth
  machinery is the workspace precedent).
- Comment author links inside lens threads still point at `#/u/<handle>` (memory
  profiles) — route them to bsky.app profiles or a lens profile view.
- Lens pagination (cursors are plumbed through `lens.feed`, UI has no "more" yet).

## Small

- Wrong-node `engine-strict` refusal recorded untested (only v22.23.2 + broken system
  node installed locally).
- One trivial mutation-audit residual: the rising-dispatch fixture's input order
  coincides with its expected order (2i write-up).
- 5e(1) commit message lost the word "held" to zsh backtick expansion (cosmetic).
