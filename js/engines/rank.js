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
//   confidence  n = likes + downs  ->  n = likes and p = 1. Still a Wilson lower
//               bound; it now measures evidence rather than ratio.
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

// Hot: submission-time based; rank changes only on vote events. [source §7.1]
export function hot(likes, createdSec) {
  const order = Math.log10(Math.max(likes, 1));
  const seconds = createdSec - EPOCH;
  return round7(order + seconds / 45000);
}

// Confidence / Best (comments): Wilson lower bound, z = 1.281551565545. [source §7.3]
export function confidence(likes) {
  if (likes === 0) return 0;
  const z = 1.281551565545;
  const left = 1 + (z * z) / (2 * likes);
  const right = z * Math.sqrt((z * z) / (4 * likes) / likes);
  const under = 1 + (z * z) / likes;
  return (left - right) / under;
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

// Sort a list of items each exposing {likes, createdSec} by the named sort.
// An unknown sort falls back to hot, and that fallback is now load-bearing:
// it is what keeps a shared `?sort=controversial` link — or a stored preference
// written before this change — landing on a working board instead of stranding
// someone on a sort that no longer exists.
export function sortItems(items, sort, nowSec) {
  const arr = items.slice();
  const by = (fn) => arr.sort((a, b) => fn(b) - fn(a));
  switch (sort) {
    case 'new':    return arr.sort((a, b) => b.createdSec - a.createdSec);
    case 'top':    return by((i) => i.likes);
    case 'best':   return by((i) => confidence(i.likes));
    case 'rising': return by((i) => rising(i.likes, i.createdSec, nowSec));
    case 'hot':
    default:       return by((i) => hot(i.likes, i.createdSec));
  }
}
