// Ranking engines (spec §6). Pure, variant-swappable. Formulas carried verbatim
// from the build spec §7 (reddit-archive `_sorts.pyx`) — [source] claims.

const EPOCH = 1134028003; // reddit epoch, build spec §7.1

// DOWNVOTES ARE GONE (plan 2026-08-27-1, owner). Every formula below came
// verbatim from reddit's `_sorts.pyx`, which assumes a two-sided vote; with one
// side the arithmetic collapses. The collapses are stated rather than silently
// applied, because each is a place where the [source] claim above stops holding
// literally:
//
//   hot         s = ups - downs  ->  s = ups, never negative. `sign(s)` is 1
//               whenever it matters and 0 exactly where log10(max(ups,1)) is
//               already 0, so the helper became UNREACHABLE, not merely
//               redundant — which is why it is deleted rather than inlined.
//   confidence  n = ups + downs  ->  n = ups and p = 1. Still a Wilson lower
//               bound; it now measures evidence rather than ratio.
//   rising      votes = ups + downs  ->  votes = ups.
//   top         ups - downs  ->  ups.
//   controversy DELETED. It was the only sort DEFINED by the split rather than
//               merely consuming it, so it has no one-sided form at all. That
//               is the feature the owner chose to lose, not a casualty.
//
// Outputs for the inputs that still exist are UNCHANGED, and
// test/engines.test.js keeps the same literal expectations to hold that: a
// simplification that moves its own numbers is a behaviour change wearing a
// refactor's clothes.

// Hot: submission-time based; rank changes only on vote events. [source §7.1]
export function hot(ups, createdSec) {
  const order = Math.log10(Math.max(ups, 1));
  const seconds = createdSec - EPOCH;
  return round7(order + seconds / 45000);
}

// Confidence / Best (comments): Wilson lower bound, z = 1.281551565545. [source §7.3]
export function confidence(ups) {
  if (ups === 0) return 0;
  const z = 1.281551565545;
  const left = 1 + (z * z) / (2 * ups);
  const right = z * Math.sqrt((z * z) / (4 * ups) / ups);
  const under = 1 + (z * z) / ups;
  return (left - right) / under;
}

// Rising: ours to tune (archived code lacks it, §7.2). Hot restricted to posts
// younger than 6h with a minimum vote velocity.
export function rising(ups, createdSec, nowSec) {
  const ageH = (nowSec - createdSec) / 3600;
  if (ageH > 6) return -Infinity;
  const velocity = ups / Math.max(ageH, 0.1); // boosts per hour
  if (velocity < 2) return -Infinity;          // minimum velocity gate
  return velocity + hot(ups, createdSec) * 0.001;
}

function round7(n) { return Math.round(n * 1e7) / 1e7; }

// Sort a list of items each exposing {ups, createdSec} by the named sort.
// An unknown sort falls back to hot, and that fallback is now load-bearing:
// it is what keeps a shared `?sort=controversial` link — or a stored preference
// written before this change — landing on a working board instead of stranding
// someone on a sort that no longer exists.
export function sortItems(items, sort, nowSec) {
  const arr = items.slice();
  const by = (fn) => arr.sort((a, b) => fn(b) - fn(a));
  switch (sort) {
    case 'new':    return arr.sort((a, b) => b.createdSec - a.createdSec);
    case 'top':    return by((i) => i.ups);
    case 'best':   return by((i) => confidence(i.ups));
    case 'rising': return by((i) => rising(i.ups, i.createdSec, nowSec));
    case 'hot':
    default:       return by((i) => hot(i.ups, i.createdSec));
  }
}
