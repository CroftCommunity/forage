// The wave planner — how a people-scope reel asks the network (plan
// 2026-09-14-plan-clips, § B and D1 (a)).
//
// At World the reel is the board's own posts, narrowed. At a people-scope —
// me, mutuals, follows, one hop out — the scope's MEMBERS are the source list:
// each is asked for their author feed with the mode's filter (the network
// offers `posts_with_video` and `posts_with_media`, lexicon-verified
// 2026-09-14), and the answers are dealt across people. Skylight's CTO says
// their following feed is "like half of our production workload"; with no
// index, forage's answer is BACKPRESSURE: a wave of a few members at a time,
// the next wave only when the reader reaches the end of what they have. A
// reader who watches five clips costs a handful of requests, never the scope.
//
// Pure. The cursor is a STRING so the board can hold it exactly as it holds a
// feed's cursor — More needs nothing new — and it carries the whole state:
// the member order, how far the fresh asks have got, and the continuation
// cursors of members who answered with frames and have more.

export const FILTER = Object.freeze({ clip: 'posts_with_video', gram: 'posts_with_media' });

// Known posters first (the device's register, js/media-posters.js), in the
// order given; then everyone else in the scope's order. A cold device asks in
// scope order, which at Mutuals is small by construction.
export function orderMembers(members, known) {
  const seen = new Set();
  const out = [];
  for (const did of members) { if (known.has(did) && !seen.has(did)) { seen.add(did); out.push(did); } }
  for (const did of members) { if (!seen.has(did)) { seen.add(did); out.push(did); } }
  return out;
}

// Continuations first: a member who answered with frames and still has a
// cursor is the surest next frame. Then fresh members from `at`. Never more
// than `size` asks in one wave.
export function nextWave({ order, at, cursors }, size) {
  const asks = [];
  for (const [did, cursor] of Object.entries(cursors)) { if (asks.length < size) asks.push({ did, cursor }); }
  let i = at;
  while (asks.length < size && i < order.length) asks.push({ did: order[i++] });
  return { asks, at: i, done: asks.length === 0 };
}

export function encodeCursor(state) { return JSON.stringify(state); }

export function decodeCursor(str) {
  let s;
  try { s = JSON.parse(str); } catch { throw new Error('reel cursor: not readable'); }
  if (!s || !Array.isArray(s.order) || !Number.isInteger(s.at) || typeof s.cursors !== 'object' || s.cursors === null) {
    throw new Error('reel cursor: not a reel cursor');
  }
  return s;
}

// The deal for a reel: one frame per person per round, in the order the
// people were ASKED (known posters, then the scope's order) — not
// js/mix-deal.js's, whose tie-break sorts sources by id and put the tenth
// follow before the ninth (journey, 2026-09-21). A frame dealt twice (a repost
// of a clip beside the clip) shows once.
export function roundRobin(queues) {
  const live = queues.map((q) => ({ posts: q.posts || [], at: 0 }));
  const out = [];
  const seen = new Set();
  let dealt = true;
  while (dealt) {
    dealt = false;
    for (const q of live) {
      while (q.at < q.posts.length) {
        const post = q.posts[q.at++];
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        out.push(post);
        dealt = true;
        break;
      }
    }
  }
  return out;
}
