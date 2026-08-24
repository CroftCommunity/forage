// The wide lens (6b): PURE shapers from bsky AppView views into the exact
// result shapes our selectors emit, so the standing UI renders the owner's
// Bluesky as a forum unchanged. Read-first: every permission that would write
// is false (writes stay on `memory`; boost-as-like is a ledgered frontier).
// Divergences from the memory tier are ledgered: scores are likes-only
// (DL-011), ordering is the feed generator's (DL-010), membership is the
// saved-feeds preference (DL-012).

// Lens surfaces are read-only; the write gates all stay shut (frontier chips,
// never dead buttons — the UI renders these as deferred, invariant 7).
export const LENS_PERMS = Object.freeze({
  viewerId: null, loggedIn: false, admin: false, probation: false,
  isSteward: false, isOwner: false, bannedHere: false, banInfo: null,
  canView: true, canVote: false, canComment: false, canPost: false,
  canReport: false, canCreateField: false, canModerate: false,
  canManageField: false, canSuspendAccount: false, canCloseField: false,
  reportWeight: 0,
});

const NSFW_LABELS = new Set(['porn', 'sexual', 'nudity', 'graphic-media', 'gore']);

const maskedByViewer = (post) =>
  !!(post.author?.viewer?.muted || post.author?.viewer?.blockedBy || post.viewer?.muted);

// One bsky post view -> our post shape. `src` names the Field this lens
// surface renders as: { fieldId, fieldSlug, fieldTitle }.
export function shapeLensPost(post, src) {
  const record = post.record || {};
  const createdTs = Date.parse(record.createdAt || post.indexedAt);
  const labels = new Set((post.labels || []).map((l) => l.val));
  const external = post.embed?.external;
  const text = record.text || '';
  const base = {
    id: post.uri, fieldId: src.fieldId, fieldSlug: src.fieldSlug, fieldTitle: src.fieldTitle,
    format: external ? 'link' : 'text', tagId: null,
    nsfw: [...labels].some((l) => NSFW_LABELS.has(l)), spoiler: false,
    createdTs, createdSec: Math.floor(createdTs / 1000),
    locked: false, pinned: false, edited: false,
    removed: false, deleted: false, held: false,
    ups: post.likeCount ?? 0, downs: 0, score: post.likeCount ?? 0, // DL-011: likes-only
    myVote: post.viewer?.like ? 1 : 0,
    saved: false, // bookmarks are not public API surface yet — frontier
    commentCount: post.replyCount ?? 0,
  };
  if (maskedByViewer(post)) {
    return { ...base, title: '[muted account]', body: '', url: '', author: null, authorId: null, maskedRemoved: true };
  }
  return {
    ...base,
    title: text, body: text, url: external?.uri || '',
    author: post.author?.handle || '[unknown]', authorId: post.author?.did || null,
    removedReason: '',
  };
}

// One bsky threadViewPost tree -> our thread result shape.
export function shapeLensThread(threadResponse, src) {
  const root = threadResponse.thread;
  const post = shapeLensPost(root.post, src);
  let total = 0;
  const build = (nodes, depth) => (nodes || []).map((n) => {
    if (!n.post) return null; // blocked / notFound stubs
    total += 1;
    const p = shapeLensPost(n.post, src);
    return {
      id: p.id, postId: post.id, parentId: null,
      createdTs: p.createdTs, createdSec: p.createdSec, edited: false,
      removed: false, deleted: false,
      ups: p.ups, downs: 0, score: p.score, myVote: p.myVote, saved: false,
      body: p.body, author: p.author, authorId: p.authorId,
      ...(p.maskedRemoved ? { maskedRemoved: true } : { removedReason: '' }),
      depth,
      autoCollapsed: false,
      children: depth >= 10 ? [] : build(n.replies, depth + 1),
      deferred: depth >= 10 ? (n.replies || []).length : 0,
    };
  }).filter(Boolean);
  const comments = build(root.replies, 0);
  return { post, perms: LENS_PERMS, sort: 'lens', locked: false, comments, total };
}

// One bsky feed page -> our feed result shape.
export function shapeLensFeed(feedResponse, src, { sort = 'lens', timeframe = 'all' } = {}) {
  return {
    scope: `lens:${src.fieldSlug}`, sort, timeframe,
    perms: LENS_PERMS,
    posts: (feedResponse.feed || []).map((item) => shapeLensPost(item.post, src)),
    cursor: feedResponse.cursor,
  };
}
