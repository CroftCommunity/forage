// Ranking engines (spec §6). Pure, variant-swappable. Formulas carried verbatim
// from the build spec §7 (reddit-archive `_sorts.pyx`) — [source] claims.

const EPOCH = 1134028003; // reddit epoch, build spec §7.1

function sign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }

// Hot: submission-time based; rank changes only on vote events. [source §7.1]
export function hot(ups, downs, createdSec) {
  const s = ups - downs;
  const order = Math.log10(Math.max(Math.abs(s), 1));
  const seconds = createdSec - EPOCH;
  return round7(sign(s) * order + seconds / 45000);
}

// Confidence / Best (comments): Wilson lower bound, z = 1.281551565545. [source §7.3]
export function confidence(ups, downs) {
  const n = ups + downs;
  if (n === 0) return 0;
  const z = 1.281551565545;
  const p = ups / n;
  const left = p + (z * z) / (2 * n);
  const right = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const under = 1 + (z * z) / n;
  return (left - right) / under;
}

// Controversial: (ups+downs) ** (min/max); zero if one-sided. [source §7.2]
export function controversy(ups, downs) {
  if (downs <= 0 || ups <= 0) return 0;
  const magnitude = ups + downs;
  const balance = ups > downs ? downs / ups : ups / downs;
  return Math.pow(magnitude, balance);
}

// Rising: ours to tune (archived code lacks it, §7.2). Hot restricted to posts
// younger than 6h with a minimum vote velocity.
export function rising(ups, downs, createdSec, nowSec) {
  const ageH = (nowSec - createdSec) / 3600;
  if (ageH > 6) return -Infinity;
  const votes = ups + downs;
  const velocity = votes / Math.max(ageH, 0.1); // votes per hour
  if (velocity < 2) return -Infinity;            // minimum velocity gate
  return velocity + hot(ups, downs, createdSec) * 0.001;
}

function round7(n) { return Math.round(n * 1e7) / 1e7; }

// Sort a list of items each exposing {ups, downs, createdSec} by the named sort.
export function sortItems(items, sort, nowSec) {
  const arr = items.slice();
  const by = (fn) => arr.sort((a, b) => fn(b) - fn(a));
  switch (sort) {
    case 'new':           return arr.sort((a, b) => b.createdSec - a.createdSec);
    case 'top':           return by((i) => i.ups - i.downs);
    case 'controversial': return by((i) => controversy(i.ups, i.downs));
    case 'best':          return by((i) => confidence(i.ups, i.downs));
    case 'rising':        return by((i) => rising(i.ups, i.downs, i.createdSec, nowSec));
    case 'hot':
    default:              return by((i) => hot(i.ups, i.downs, i.createdSec));
  }
}
