# ADR-006: With the Beta switch on, a people-scope reel's content comes from the data servers — amends ADR-002

Tags: appview, atproto, pds, beta, ingestion, reel

Date: 2026-09-25
Status: accepted
Amends: ADR-002 (wide-lens intake is AppView pull) — the default is unchanged; this names the
one path that reads content from the repos, and what it can and cannot know.
Gates: Phase 6 of `plans/2026-09-14-plan-clips.md`

## Context

ADR-002 fixed the wide lens's intake as AppView pull: replay was token-gated, and a filtered
stream cannot compute other people's engagement. The Beta switch *Direct social tree PDS
query* (plan 2026-09-08-plan-beta-pds-walker) later read one thing from the data servers —
the ring's **membership** — and its plan promised "the rings and nothing else; feed content
still comes from the AppView".

The view-modes work gave a people-scope reel a member list as its source (plan
2026-09-14-plan-clips, D1: at Me, Mutuals, Follows or +1 the reel asks each member for their
clips or pictures). That is exactly the read the walker path can make without the AppView.
The owner, 2026-09-25: "we want the pds walker path to be viable for all content and formats
— I'm not sure why it would even be different here."

## Decision

1. **With the Beta switch on, a people-scope reel reads its members' posts from their own
   data servers** (`js/substrates/pds-posts.js`: `com.atproto.repo.listRecords` over
   `app.bsky.feed.post`, 100 a page, at most three pages an ask), filtered the way the
   AppView's author-feed filter would, and translated to the post view the lens already shapes
   (`js/pds-posts.js`), with **every URL derived from the record's own blob cids** on the
   network's own patterns (probed against the AppView's hydration 2026-09-14 and 2026-09-25;
   the patterns are pinned by `test/pds-posts.test.js`).
2. **Counts and labels are hydrated from the AppView** (`getPosts`, 25 uris a call) when it
   answers. When it does not, the reel still frames every post, the count line says *no
   counts or labels: the network's view did not answer*, and the row's counts read as
   unknown — never zero.
3. **The seam is `createLens({ postsSource })`**, the sibling of `graphSource`: `null` for a
   member falls through to the AppView for that member alone. With the switch off, nothing
   changes: ADR-002's default stands for every surface.

## Reasoning

**Why this is an amendment and not a reversal.** ADR-002's two reasons still hold: replay is
still token-gated (unused here — a repo is read directly, not replayed), and a repo still
cannot know how the network answered a post — which is why counts and labels are hydrated
from the AppView and said unknown without it, rather than invented. What changed is the
shape of the read: a people-scope reel has a *bounded member list*, so "read each member's
repo" is a finite, cacheable fan-out, not an index.

**Why it was held apart until now.** Not a technical reason: the Beta plan had promised
membership-only, and widening a shipped switch's promise is the owner's call. It is made.

**Why hydration rather than purity.** The point of the path is independence from the
AppView when it is down; the point of the counts is honesty when it is up. Doing both — read
from the repos, hydrate when possible, say so when not — costs one `getPosts` call per wave
and loses nothing either way.

## Consequences

- The Beta switch's settings copy and `TODO.md` row say it now serves content too.
- The count line names the read (*from their data servers*) so a reader can tell the paths
  apart on the surface; the frames are otherwise identical.
- The labeled-frame veil cannot fire when labels are unknown; blocks and mutes (dids) still
  apply. Recorded on the count line.
- `e2e/view-modes.workflow.mjs` claim 11 runs the path against a faked data server both
  with the AppView answering and with it down.
