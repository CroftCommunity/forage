// The deal — a mix's Default order (plan 2026-09-08, § B).
//
// Weighted round-robin over one queue per source, each queue in its OWN order
// (the generator's for a feed, reverse-chron for the timeline, latest for a
// hashtag). In each round a source contributes up to its SHARE — ×½ deals 1,
// ×1 deals 2, ×2 deals 4 — heaviest first, ties by source id, so the deal is
// deterministic for one input. A queue that runs dry is skipped; a post
// already dealt (same id) is dropped, credited to the first source that dealt
// it (D8's Default half). Nothing is ever re-sorted across sources by time:
// that was the retired World board, and it belonged to whichever source
// posted most.
//
// Weight 0 is not a queue at all. The substrate never fetches an off row; this
// guard is for a caller that hands one over anyway.
//
// Pure. Re-dealing the same queues after a refill gives the same prefix, which
// is what lets "More" extend the board in place.

export const roundShare = (weight) => Math.max(0, Math.round(2 * weight));

export function deal(queues) {
  const live = queues
    .filter((q) => q && q.weight > 0 && Array.isArray(q.posts))
    .map((q) => ({ id: String(q.id), share: roundShare(q.weight), posts: q.posts, at: 0 }))
    .filter((q) => q.share > 0)
    .sort((a, b) => (b.share - a.share) || a.id.localeCompare(b.id));
  const out = [];
  const seen = new Set();
  let dealt = true;
  while (dealt) {
    dealt = false;
    for (const q of live) {
      let taken = 0;
      while (taken < q.share && q.at < q.posts.length) {
        const post = q.posts[q.at++];
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        out.push(post);
        taken += 1;
        dealt = true;
      }
    }
  }
  return out;
}
