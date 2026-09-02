# feed-position — come back to your place in the feed, and be told what changed

**Scope:** forage. The owner, 2026-09-01:

> "Right now when I'm browsing, you know, a feed or a combination of feeds, and I click
> into a post and I read it and I come hit the back button it takes me back out to either
> a refreshed feed or all the way back out to the top. Ideally for me I want to browse the
> feed, go into a particular post, hit back and come back to my place in the feed … but
> then also I guess we have to think about like, okay, then how does the feed actually
> update."

Measured on 2026-09-01 (probes in the plan's Measurements section): the offset IS saved by
the browser and IS restored — into a document that `render()` has already emptied, so it
clamps to 0. Three losses, not one: the offset, the paged-in posts, and the identity of the
feed itself (Back refetches).

**Plan:** `plans/2026-09-01-plan-feed-position-and-updates.md`
**Branch:** `claude/feed-position`
