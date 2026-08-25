# ADR-001: Actor-scoped event and entity ids
Tags: events, ids, atproto, schema

Date: 2026-08-24
Status: accepted

## Context

Ids were a per-device sequence (`ev_<seq>_<len>`, `p_<seq>_<len>`) — deterministic on
one device, guaranteed to collide the moment logs from two devices meet. The
behavior-scale destination is one atproto data plane at three scopes
(`plans/2026-08-24-1-plan-behavior-scale-scaffolding.md`), so ids must at minimum be
collision-free across *actors* before any log ever leaves a device. Invariant 3
forbids randomness in anything replayed, which rules out UUIDs.

## Decision

`<prefix>_<actorId>_<perActorSeq>`, generated at dispatch by `store.genId`:

- the actor id is embedded, so ids from different actors are disjoint by
  construction;
- the per-actor sequence is derived by counting the actor's events in the log — no
  mutable counter, no randomness; the same prior log always yields the same next id;
- `store.commit` stamps event ids the same way (`ev_<actorId>_<n>`); payload ids for
  entity events use the entity prefix (`p_`, `c_`, `f_`, `rep_`) with the same
  sequence.

Schema hardening (2b) rejects actorless events on every type except
`account.registered`, so every generated id has a real actor scope.

## Limitation (stated, accepted)

One actor writing from two devices concurrently can still collide: both devices see
the same log length for that actor and mint the same sequence number. Accepted for
the memory tier, where a log lives in one browser's storage. Revisit at phase 5's
split, when ids meet atproto record keys (rkeys) and the member's own PDS becomes
the id authority — probe evidence decides whether rkeys subsume this scheme.

## Consequences

- The old `_seq` counter is deleted; nothing depends on device-global ordering.
- Seed ids (`sd_<n>`, hand-authored) remain valid — the schema requires id
  *presence*, not this format; generated ids only apply at dispatch.
- `genId` is O(log length) per call; interactive-commit scale, irrelevant. If it
  ever shows up in a profile, a per-actor count cache derived in `rebuild()` is the
  fix — same determinism.
