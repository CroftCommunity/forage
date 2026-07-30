// Limits engine (spec §6 / §11). Rolling windows over the viewer's own events.
// Base: 1 comment/60s, 1 post/5min. Doubled in probation... but "doubled in
// probation" means the *cooldown* is doubled (stricter), halved past the
// reputation threshold (looser). Plus a cooling-off slowdown after rapid burying.

export const REP_FAST_THRESHOLD = 500; // past this, cooldowns halve
export const RAPID_BURY_COUNT = 5;     // downvotes...
export const RAPID_BURY_WINDOW = 60;   // ...within this many seconds triggers cool-off
export const RAPID_BURY_PENALTY = 30;  // extra seconds added to next action

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
             probation: false, reason: 'logged-out', coolOff: false };
  }
  const f = factor(rep, probation);
  const commentCooldown = Math.round(BASE_COMMENT_COOLDOWN * f);
  const postCooldown = Math.round(BASE_POST_COOLDOWN * f);

  const mine = events.filter((e) => e.actor === viewerId);
  const sec = (e) => Math.floor(e.ts / 1000); // event ts is ms; the clock is seconds
  const lastComment = last(mine, 'comment.created');
  const lastPost = last(mine, 'post.created');

  // cooling-off: rapid burying (value === -1) in the recent window
  const recentBuries = mine.filter(
    (e) => e.type === 'vote.set' && e.payload.value === -1 && nowSec - sec(e) <= RAPID_BURY_WINDOW
  ).length;
  const coolOff = recentBuries >= RAPID_BURY_COUNT;
  const penalty = coolOff ? RAPID_BURY_PENALTY : 0;

  const commentSince = lastComment ? nowSec - sec(lastComment) : Infinity;
  const postSince = lastPost ? nowSec - sec(lastPost) : Infinity;
  const commentWaitSec = Math.max(0, commentCooldown + penalty - commentSince);
  const postWaitSec = Math.max(0, postCooldown + penalty - postSince);

  return {
    canComment: commentWaitSec === 0,
    canPost: postWaitSec === 0,
    commentWaitSec, postWaitSec,
    commentCooldown, postCooldown,
    probation, coolOff,
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
