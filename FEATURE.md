# share-to-forage — a Bluesky post shared from the app opens here

**Scope:** forage. The owner's report, 2026-09-04, with the Bluesky Android share sheet open
on a post:

> "I want to be able to share from the official Bluesky app or the Bluesky mobile website or
> Blacksky mobile website or Blacksky app and share with Forage as a target when it's installed
> as a PWA, and have that same content open in Forage. So like if I see a comment thread that's
> like the 1/2/3 thing, I could share the number one straight to Forage and then just read it
> as one plain post, right, and see the thread kind of in that fashion."

Forage already renders that page — `shapeLensThread` hoists an author's own chain into the body
of one post, and `lens.thread()` refetches from the root when handed a reply. What was missing
was the door. This branch is the door: a W3C Web Share Target at `GET /share`, a pure parser
for whatever a share sheet hands over, and the empty state for a shared post your ring hides.

**Branch:** `claude/bluesky-share-forage-pwa-1r74go`
**Plan:** `plans/2026-09-04-plan-share-to-forage.md`
**Ledger:** DL-038 (the door exists in the Bluesky population, and on Android alone)
