# logged-out-refine — the signed-out board, as the owner read it

**Scope:** forage. Owner review of forage.fyi without an account, 2026-09-01. Seven items:

1. Discover's own description ("Trending content from your personal network") is a
   promise a guest has no account to cash — hidden signed out, for that feed only.
2. "Curated by @bsky.app" → the human-readable name (probed: "Bluesky", not the
   "Bluesky Team" this repo once shipped); the handle stays one hover away.
3. Right-align the curator inside the feed card's box, not just inside its text block.
4. Drop "Bluesky" from the left nav's Feeds list; move "Trending" into its place.
5. Remove the rail's Feeds card — it duplicates the left nav.
6. Top's month / year / all-time on a `/f/` board: measured (the backward walk reaches
   29.4h on Discover, so week/month/year rank one identical list and All time ranked
   fewer than any of them). A board now offers what its window can answer.
7. Independent-scrolling centre column, like reddit.com.

**Branch:** `claude/logged-out-refine`
