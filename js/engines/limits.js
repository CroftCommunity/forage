// Limits engine (spec §6 / §11). Rolling windows over the viewer's own events.
// Base: 1 comment/60s, 1 post/5min. Doubled in probation... but "doubled in
// probation" means the *cooldown* is doubled (stricter), halved past the
// reputation threshold (looser).
//
// There used to be a fourth rule: a cooling-off slowdown after five downvotes
// in sixty seconds. Downvotes are gone (plan 2026-08-27-1), so the rule keyed
// on an act that can no longer happen. It is REMOVED rather than left inert,
// and `coolOff` is gone from the returned shape rather than pinned to false —
// a field that is always false is a question the caller keeps having to ask.
// This narrowed the rule set; test/engines.test.js pins that the remaining
// cooldowns did not move, because "removed the dead rule" and "loosened the
// live ones" look identical in a diff.

export const REP_FAST_THRESHOLD = 500; // past this, cooldowns halve

const BASE_COMMENT_COOLDOWN = 60;
const BASE_POST_COOLDOWN = 300;

function factor(rep, probation) {
  if (probation) return 2;               // stricter
  if (rep >= REP_FAST_THRESHOLD) return 0.5; // looser
  return 1;
}

// events: the full log (chronological). nowSec: current replay clock.
// Returns budget info for the viewer.
export function limits(viewerId, events, rep, probation, nowSec) {
  if (!viewerId) {
    return { canComment: false, canPost: false, commentWaitSec: 0, postWaitSec: 0,
             probation: false, reason: 'logged-out' };
  }
  const f = factor(rep, probation);
  const commentCooldown = Math.round(BASE_COMMENT_COOLDOWN * f);
  const postCooldown = Math.round(BASE_POST_COOLDOWN * f);

  const mine = events.filter((e) => e.actor === viewerId);
  const sec = (e) => Math.floor(e.ts / 1000); // event ts is ms; the clock is seconds
  const lastComment = last(mine, 'comment.created');
  const lastPost = last(mine, 'post.created');

  const commentSince = lastComment ? nowSec - sec(lastComment) : Infinity;
  const postSince = lastPost ? nowSec - sec(lastPost) : Infinity;
  const commentWaitSec = Math.max(0, commentCooldown - commentSince);
  const postWaitSec = Math.max(0, postCooldown - postSince);

  return {
    canComment: commentWaitSec === 0,
    canPost: postWaitSec === 0,
    commentWaitSec, postWaitSec,
    commentCooldown, postCooldown,
    probation,
    reason: probation ? 'probation' : rep >= REP_FAST_THRESHOLD ? 'trusted' : 'normal',
  };
}

function last(list, type) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].type === type) return list[i];
  return null;
}

export function humanWait(sec) {
  if (sec <= 0) return 'now';
  if (sec < 60) return `${Math.ceil(sec)}s`;
  return `${Math.ceil(sec / 60)}m`;
}
