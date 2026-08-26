// The divergence ledger (BSM §7, Appendix B). One list, three kinds:
//   frontier  — a path deliberately deferred; renders as a dashed chip and at
//               #/frontiers (invariant 7: deferring and registering are one commit)
//   proposal  — behavior one tier wants that the contract doesn't bless yet
//   tolerance — a named, bounded way two substrates/engine-variants may differ
//               and still pass conformance (invariant 9)
// The conformance harness refuses any observable difference not covered by an
// ACTIVE tolerance here. Adding an entry is a reviewed, committed act — that
// is the point: drift is either refused or documented, never silent.

export const LEDGER = [
  // ---- frontiers (js/frontier.js folded in, 2026-08-24) ----
  { id: 'DL-001', kind: 'frontier', capability: 'posting', label: 'Media upload',
    description: 'Post format tab is present but locked. Storage budget decision deferred; text and link posts only in v1.' },
  { id: 'DL-002', kind: 'frontier', capability: 'search', label: 'Search facets',
    description: 'Beyond the type filter (post/comment). Field, author, date facets require the scaled side.' },
  { id: 'DL-003', kind: 'frontier', capability: 'feeds', label: 'Custom multi-Field feeds',
    description: 'Build spec §13 deferred this. Saved feed compositions arrive with the api substrate.' },
  { id: 'DL-004', kind: 'frontier', capability: 'moderation', label: 'Metamoderation-style steward review',
    description: 'Deferred in build spec §10.4. Community review of steward actions needs the scaled side.' },
  { id: 'DL-005', kind: 'frontier', capability: 'moderation', label: 'Vote-ring detection',
    description: 'Build spec §11 out-of-scope list. Requires the scaled side.' },
  { id: 'DL-006', kind: 'frontier', capability: 'moderation', label: 'IP reputation',
    description: 'Build spec §11 out-of-scope list. Requires the scaled side.' },
  { id: 'DL-007', kind: 'frontier', capability: 'moderation', label: 'ML spam filtering',
    description: 'Build spec §11 out-of-scope list. Requires the scaled side.' },

  // ---- proposals ----
  { id: 'DL-009', kind: 'proposal', capability: 'posting',
    description: 'Deleted-post title retention differs by tier: memory keeps the original title on the tombstone ("[deleted]" body, real title); the scoped tier CLEARS the title from the wire record (content really leaves the repo). No scenario observes a deleted post\'s title yet — when one does, pick a side and promote this to a tolerance or unify.',
    reason: 'Privacy leans toward clearing; continuity leans toward keeping. Deferred until a scenario cares.',
    date: '2026-08-25', status: 'open' },

  // ---- the wide lens (phase 6): tolerances + frontiers, chips in js/ui/lens-views.js ----
  { id: 'DL-010', kind: 'tolerance', capability: 'feed-ranking', tier: 'wide',
    description: 'Lens feed ORDER is the feed generator\'s own ranking, not our hot/top/best; membership (which posts appear) is the generator\'s too.',
    reason: 'The lens renders the owner\'s existing experience; re-ranking it would misrepresent the source.',
    tolerance: 'shape-contract only (no order comparison against memory)',
    date: '2026-08-25', status: 'active' },
  { id: 'DL-011', kind: 'tolerance', capability: 'voting', tier: 'wide',
    description: 'Lens scores are likes-only: ups = likeCount, downs = 0. Bury counts do not exist on the network; controversial ranking is undefined at this tier.',
    reason: 'Bluesky has no downvote; pretending otherwise would fabricate data.',
    tolerance: 'score fields present, downs pinned 0',
    date: '2026-08-25', status: 'active' },
  { id: 'DL-012', kind: 'tolerance', capability: 'fields', tier: 'wide',
    description: 'Lens Field membership is the saved-feeds preference (pinned/saved feeds and lists), not a roster; memberCount is undefined.',
    reason: 'Fields = Feeds at this tier by design.',
    tolerance: 'field shape without roster-derived counts',
    date: '2026-08-25', status: 'active' },
  { id: 'DL-013', kind: 'frontier', capability: 'voting', tier: 'wide', label: 'Boost = like (write)',
    description: 'SHIPPED 2026-08-25 (plan 2026-08-25-1, 3c): boosting a lens post creates a real app.bsky.feed.like via the OAuth session; unboost deletes it by exact rkey. The invariant scan names this pair as the lens\' ONLY writes. Bury remains without an analogue (DL-011 likes-only).',
    date: '2026-08-25', status: 'shipped' },
  { id: 'DL-014', kind: 'frontier', capability: 'search', tier: 'wide', label: 'Guest lens search',
    description: 'searchPosts is 403 unauthenticated (probe-verified twice); guest search renders as a chip, sessions get real search.' },
  { id: 'DL-015', kind: 'frontier', capability: 'saving', tier: 'wide', label: 'Lens saves',
    description: 'Bookmarks are not public API surface; lens saved=false with a chip on the lens home.' },

  // ---- tolerances ----
  { id: 'DL-008', kind: 'tolerance', capability: 'feed-ranking',
    appliesTo: { probe: 'feedIds' },
    description: 'Feed ORDER may differ between ranking-engine variants or substrates; MEMBERSHIP may not.',
    reason: 'Ranking formulas are declared variant-swappable (engines are pure and pluggable); which posts are visible is policy and must agree exactly.',
    tolerance: 'set-equality',
    date: '2026-08-24', status: 'active' },

  { id: 'DL-018', kind: 'proposal', capability: 'commenting', tier: 'wide',
    description: 'Quote-respond as a first-class schema event: the wide tier renders quotes as thread continuation (3e) but the memory/BBS contract has replies only. The BBS idiom (quote-to-reply) wants this as a schema event; until then it is wide-tier-only rendering.',
    reason: 'Invariant 8 — behavior present at one tier carries a proposal before it renders. Decide when the BBS mode (phase 5) or a scenario cares.',
    date: '2026-08-25', status: 'open' },

  { id: 'DL-019', kind: 'tolerance', capability: 'moderation', tier: 'wide',
    description: 'The wide tier\'s moderation posture is ACCOUNT-derived (getPreferences + graph endpoints — muted words, label filters, adult toggle, mutes, blocks), while the memory tier\'s is EVENT-derived (local mod events). Same masking semantics, different source of authority; Forage stores no wide-tier moderation state (piggy-back principle, D10).',
    reason: 'A word muted on bsky.app must be muted here with no Forage UI — one posture, owned by the account.',
    tolerance: 'masking outcomes only; the authority source is not compared',
    date: '2026-08-25', status: 'active' },

  { id: 'DL-020', kind: 'proposal', capability: 'feeds', tier: 'wide',
    description: 'The trending rail rides app.bsky.unspecced.getTrendingTopics — an API Bluesky may break without notice (D8). The rail degrades to absent-with-words; each topic resolves to a feed generator (a /f/-kind stream, not a third kind).',
    reason: 'Invariant 8 — wide-only behavior, registered. Watch for the endpoint stabilizing or vanishing.',
    date: '2026-08-25', status: 'open' },
  { id: 'DL-021', kind: 'tolerance', capability: 'search', tier: 'wide',
    description: '/h/ hashtag boards are session-gated at the wide tier (searchPosts is 403 unauthenticated, probe-verified) while memory-mode /h/ is open to all seats (a local selector).',
    reason: 'The network gates search; the sandbox has no reason to.',
    tolerance: 'access gating only; board shapes match',
    date: '2026-08-25', status: 'active' },
  { id: 'DL-022', kind: 'frontier', capability: 'feeds', tier: 'wide', label: 'List-backed Fields',
    description: 'A Bluesky list (app.bsky.graph.list) is a member-curated board — philosophically a hand-curated ring. Deferred: needs its own probe (getListFeed shapes) and a unit.',
    date: '2026-08-25', status: 'open' },
  { id: 'DL-023', kind: 'frontier', capability: 'feeds', tier: 'wide', label: 'Starter packs',
    description: 'Bundles of feeds + people — a Field collection. Deferred until list-backed Fields exist.',
    date: '2026-08-25', status: 'open' },

  { id: 'DL-024', kind: 'frontier', capability: 'moderation', tier: 'wide', label: 'Manage moderation FROM forage',
    description: 'The Moderation panel is read-only by design (mirror + edit-on-bsky.app links, the lens tenet). Managing the posture from forage via putPreferences — round-trip proven at D10 — is this frontier.',
    date: '2026-08-25', status: 'open' },

  { id: 'DL-025', kind: 'frontier', capability: 'feeds', tier: 'wide', label: 'Feeds are not targetable; hashtags are',
    description: 'VERIFIED 2026-08-26 three ways: the app.bsky.feed.generator lexicon carries no criteria field (did, displayName, description, descriptionFacets, avatar, acceptsInteractions, labels, contentMode, createdAt — acceptsInteractions is feedback signals, contentMode is video-vs-text); describeFeedGenerator returns only a service DID + feed URIs + policy links; and the third-party builders (skyfeed.me/.xyz, graze.social, blueskyfeedcreator) publish NO definition records in their creators\' public repos — configs stay server-side. A feed is a black box behind getFeedSkeleton. CONSEQUENCE: /h/ hashtags are targetable BY CONSTRUCTION (write #x, you are in the #x stream) while /f/ feeds are not — the only inclusion instructions live in the human description prose, which is why the feed card renders it whole. Any future compose-to-feed affordance can only parse that prose heuristically and must be labeled a guess.',
    date: '2026-08-26', status: 'open' },

  { id: 'DL-026', kind: 'tolerance', capability: 'feeds', tier: 'wide', label: 'Content language is Forage-local, because the account has none',
    description: 'VERIFIED 2026-08-26 against the official lexicons and a live probe. (a) app.bsky.feed.post.langs EXISTS — array, maxLength 3, items format "language" — so a post SELF-DECLARES its language; a getPosts probe returned record.langs=["en"]. (b) app.bsky.feed.searchPosts accepts a `lang` parameter ("Filter to posts in the given language... server may override language detection"), so search-backed boards could filter server-side. (c) app.bsky.actor.defs contains NO language preference: the complete def list is adultContentPref, contentLabelPref, savedFeedsPref, savedFeedsPrefV2, personalDetailsPref, declaredAgePref, feedViewPref, threadViewPref, interestsPref, mutedWordsPref, hiddenPostsPref, labelersPref, bskyAppStatePref, postInteractionSettingsPref, verificationPrefs — and the string "lang" appears nowhere in the file. CONSEQUENCE: the official app\'s "content languages" setting is app-local, not account state. Forage can neither read nor honour it, so Forage\'s language preference is its own, device-local, and the profile panel says so. Divergence from the mirror-the-account principle, accepted because the account has nothing to mirror. Revisit if atproto adds a language pref.',
    date: '2026-08-26', status: 'open' },

  // ---- the ring dial (plan 2026-08-25-1, 3b) ----
  { id: 'DL-016', kind: 'frontier', capability: 'feeds', tier: 'wide', label: 'Ring beyond the cap',
    description: 'mutuals+1 draws the first 25 members (D6-measured cap; latency is not the bound — board noise is). The chip reports the TRUE member count; drawing the full ring (sampling, rotation, or paging members) is this frontier.',
    date: '2026-08-25', status: 'open' },
  // ---- feed discovery: sorts, windows, liveness (plan 2026-08-26-1) ----
  { id: 'DL-027', kind: 'tolerance', capability: 'feeds', tier: 'wide', label: 'Discovery ordering is Forage-local',
    description: 'The AppView\'s popular-feeds order is an opaque internal score (its cursor is a bare integer, and the list is NOT sorted by likeCount — probed 2026-08-26). Forage renders that order untouched as "Popular" and computes every other sort itself over the loaded corpus. It can do so honestly because the browse corpus is BOUNDED: 117 feeds, 2 requests, 0.62s, then cursor:null. A search query is the opposite — a real index over the whole generator population — so the sorts DISABLE on search and the server\'s relevance order stands.',
    reason: 'Re-deriving a ranking we did not compute would misrepresent it; sorting a slice of an unbounded index would present itself as a ranking of everything that matched.',
    tolerance: 'discovery list order is not compared against memory',
    date: '2026-08-26', status: 'active' },
  { id: 'DL-028', kind: 'tolerance', capability: 'feed-ranking', tier: 'wide', label: '"Top" means two different things by board kind',
    description: 'On a /h/ hashtag board, Top is a SERVER ranking over the whole corpus: app.bsky.feed.searchPosts takes sort=top plus since/until (probe-verified with a session 2026-08-26), so "Top · this week" ranks every post that matched. On a /f/ generator board there is no such lever — getFeedSkeleton takes only limit and cursor (DL-010) — so Top is a local sort over what we could page in. The two surfaces therefore answer the same control differently, and each says which it did: the /h/ board names Bluesky as the ranker (and that its "top" weighs engagement, not likes alone — a probe returned 152, 113, 1478, 122, 168 likes in that order), while the /f/ board keeps the "sorted within the loaded posts" caveat.',
    reason: 'One of the two surfaces can do better than DL-010 and it would be dishonest to hold it back — but equally dishonest to let the /f/ board imply it did the same thing.',
    tolerance: 'board order compared per board kind, never across',
    date: '2026-08-26', status: 'active' },
  { id: 'DL-029', kind: 'frontier', capability: 'feeds', tier: 'wide', label: 'Feed adoption is unmeasurable',
    description: 'There is no public "how many people use this feed" anywhere. Joining a feed writes savedFeedsPrefV2, which is per-actor PRIVATE, and the network-wide backlink index confirms app.bsky.feed.save holds ZERO records (constellation.microcosm.blue, 2026-08-26). likeCount — and the 7d/30d windows Forage counts off getLikes — is the only public adoption signal that exists, and it is a proxy. Sibling of DL-025: what a feed is cannot be read off the network, and neither can who uses it.',
    date: '2026-08-26', status: 'open' },
  { id: 'DL-017', kind: 'frontier', capability: 'feeds', tier: 'wide', label: 'Ring criteria beyond the follow graph',
    description: 'Rings are follow-graph-shaped (mutuals, mutuals+1). Criteria like interaction density, lists, or shared-feed affinity are deferred until a ring proves too coarse.',
    date: '2026-08-25', status: 'open' },
];

export const frontiers = () => LEDGER.filter((e) => e.kind === 'frontier');
export const tolerances = () => LEDGER.filter((e) => e.kind === 'tolerance' && e.status === 'active');

// The named tolerance comparators. 'set-equality': order-insensitive equality
// over arrays of ids; anything else must be added HERE, in the same commit as
// the ledger entry that names it.
export const COMPARATORS = {
  'set-equality': (a, b) =>
    Array.isArray(a) && Array.isArray(b) &&
    a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]),
};
