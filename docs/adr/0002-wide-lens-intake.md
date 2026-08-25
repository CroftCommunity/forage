# ADR-002: Wide-lens intake is AppView pull, not a Jetstream-fed index
Tags: appview, atproto, ingestion

Date: 2026-08-25
Status: accepted
Gates: phase 6 of `plans/2026-08-24-1-plan-behavior-scale-scaffolding.md` (OQ4)

## Context

The wide tier is a forum-shaped lens over the owner's own Bluesky experience,
read-first. Two intake models were candidates: pulling views from the AppView
(`public.api.bsky.app` unauth, PDS-proxied when signed in), or building a local
index fed by Jetstream v2 (replay-then-tail). The user directed a firsthand
exploration before choosing (OQ4, 2026-08-24).

## Evidence (probe, 2026-08-25 — fixtures in `test/fixtures/atproto/wide-*`)

- AppView unauth surface: `resolveHandle`, `getFeed`, `getPostThread(depth=10)`,
  `getAuthorFeed`, `getFollows` all 200 in 130–240ms, posts carrying
  reply/repost/like/quote counts precomputed. `searchPosts` 403 unauth, 200 with
  a session via the PDS proxy.
- Jetstream v2 live tail (`wss://jetstream.us-west.bsky.network/subscribe`):
  open, unauthenticated, server-side filtering; first matching event in ~2.4s.
- Jetstream v2 Network Replay (`/xrpc/network.bsky.jetstream.planSnapshot`):
  **401 invalid bearer credential** — the archive/replay path is token-gated and
  we hold no token.

## Decision

The wide lens reads from the **AppView** (unauth for the guest mode, session for
the personal mode). No lens-local index, no Jetstream dependency at this tier.

Two reasons, one practical and one structural:

1. Replay is token-gated today; the lens must ship without privileged access.
2. **A DID-filtered stream cannot compute other people's engagement.** The
   lens's scores ride like counts; counting likes on a post requires ingesting
   the whole network's likes, which is precisely the job the AppView has already
   done. A filtered personal index can know *what the owner touched*, never *how
   the network responded to it*.

Jetstream remains exactly right where the counts DO derive from a bounded set of
repos: the scoped tier, where the filtered live tail (676ms write→event, probe
5a) is a named optional freshness channel over the pull baseline.

## Consequences

- Guest boards are feed-URI / author / list sources (the unauth-200 surface);
  search and personal surfaces render as frontier chips when logged out.
- Lens freshness is poll-on-navigation; no background stream to babysit.
- Revisit only if a replay token materializes AND a lens feature genuinely needs
  archive traversal (none named today).
