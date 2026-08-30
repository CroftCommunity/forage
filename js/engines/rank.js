// Ranking engines (spec §6). Pure, variant-swappable. Formulas carried verbatim
// from the build spec §7 (reddit-archive `_sorts.pyx`) — [source] claims.

const EPOCH = 1134028003; // reddit epoch, build spec §7.1

// DOWNVOTES ARE GONE (plan 2026-08-27-1, owner). Every formula below came
// verbatim from reddit's `_sorts.pyx`, which assumes a two-sided vote; with one
// side the arithmetic collapses. The collapses are stated rather than silently
// applied, because each is a place where the [source] claim above stops holding
// literally:
//
//   hot         s = likes - downs  ->  s = likes, never negative. `sign(s)` is 1
//               whenever it matters and 0 exactly where log10(max(likes,1)) is
//               already 0, so the helper became UNREACHABLE, not merely
//               redundant — which is why it is deleted rather than inlined.
//   confidence  n = likes + downs  ->  n = likes and p = 1 — and with p = 1 the
//               Wilson bound reduces to 1/(1+z²/n), strictly increasing in n:
//               Best ordered a thread exactly as Top did. RETIRED (plan
//               2026-08-29 post-and-thread, decision 9): Hot took its place,
//               with ENGAGEMENT as the order term — see engagement() below.
//   rising      votes = likes + downs  ->  votes = likes.
//   top         likes - downs  ->  likes.
//   controversy DELETED. It was the only sort DEFINED by the split rather than
//               merely consuming it, so it has no one-sided form at all. That
//               is the feature the owner chose to lose, not a casualty.
//
// Outputs for the inputs that still exist are UNCHANGED, and
// test/engines.test.js keeps the same literal expectations to hold that: a
// simplification that moves its own numbers is a behaviour change wearing a
// refactor's clothes.

// Hot: submission-time based, the same decay as reddit's. [source §7.1] The
// first argument is a SCORE — likes on reddit; here engagement() on a board
// and in a thread alike (decision 9). Shape unchanged, so the measured pins in
// test/engines.test.js still hold.
export function hot(score, createdSec) {
  const order = Math.log10(Math.max(score, 1));
  const seconds = createdSec - EPOCH;
  return round7(order + seconds / 45000);
}

// Hot's signal: likes + replies + reposts (owner, 2026-08-29). The shaped reply
// count (`commentCount`, both tiers) wins over a thread node's `children`
// array; a missing field is 0, never NaN. No Wilson bound: with no
// denominator that means "disapproval", a confidence interval on a count is a
// monotone reshaping of the count — the finding that retired Best.
export function engagement(item) {
  const replies = item.commentCount ?? item.replyCount ?? item.children?.length ?? 0;
  return (item.likes ?? 0) + replies + (item.repostCount ?? 0);
}

// Rising: ours to tune (archived code lacks it, §7.2). Hot restricted to posts
// younger than 6h with a minimum vote velocity.
export function rising(likes, createdSec, nowSec) {
  const ageH = (nowSec - createdSec) / 3600;
  if (ageH > 6) return -Infinity;
  const velocity = likes / Math.max(ageH, 0.1); // likes per hour
  if (velocity < 2) return -Infinity;          // minimum velocity gate
  return velocity + hot(likes, createdSec) * 0.001;
}

function round7(n) { return Math.round(n * 1e7) / 1e7; }

// Sort a list of items each exposing {likes, createdSec, commentCount?,
// repostCount?} by the named sort. An unknown sort falls back to hot, and that
// fallback is load-bearing: it is what keeps a shared `?sort=controversial` —
// or, since 2026-08-29, `?sort=best` (O7) — link, or a stored preference
// written before the change, landing on a working board instead of stranding
// someone on a sort that no longer exists.
export function sortItems(items, sort, nowSec) {
  const arr = items.slice();
  const by = (fn) => arr.sort((a, b) => fn(b) - fn(a));
  switch (sort) {
    case 'new':    return arr.sort((a, b) => b.createdSec - a.createdSec);
    case 'top':    return by((i) => i.likes);
    case 'rising': return by((i) => rising(i.likes, i.createdSec, nowSec));
    case 'hot':
    default:       return by((i) => hot(engagement(i), i.createdSec));
  }
}
