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
    cid: post.cid ?? null, likeUri: post.viewer?.like ?? null, // 3c: the boost write pair's inputs
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

// ---- intake (6c): AppView readers, guest or session (ADR-002) ----

const GUEST_APPVIEW = 'https://public.api.bsky.app';

// D6-measured: warm parallel author-feed fan-out is 80–420ms at N=25; the cap
// is a BOARD-NOISE bound, not a latency one. Beyond-cap is honest overflow.
export const RING_CAP = 25;

// Pure: follows ∩ followers, in follows order.
export function computeMutuals(follows, followers) {
  const fans = new Set(followers);
  return follows.filter((did) => fans.has(did));
}

// OQ1: a lens Field's slug is the feed/list rkey (or the author handle).
const slugForSource = (source) => {
  if (source.kind === 'author') return source.actor;
  if (source.kind === 'timeline') return 'following';
  return source.uri.split('/').pop();
};

// A lens over the AppView. Guest (no session): the unauth-200 surface only.
// With a session — the OAUTH shape { did, handle, fetchHandler } from
// js/auth/session.js — every read flows through the DPoP-bound fetchHandler
// with a RELATIVE /xrpc path (the library owns auth headers, tokens, and
// refresh; the lens builds none of it) and the personal surfaces (fields,
// search, timeline) open up.
// THE one write pair (DL-013): boost = a real Bluesky like. The ONLY records
// the lens ever writes are its own likes — test/invariants.test.js narrows the
// read-only proof to exactly this pair.
const LIKE_COLLECTION = 'app.bsky.feed.like';

export function createLens({ session = null, transport = fetch } = {}) {
  async function post(path, body, verb) {
    if (!session) throw new Error(`lens: ${verb} needs a session — sign in first`);
    const res = await session.fetchHandler(`/xrpc/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`lens: ${verb} failed HTTP ${res.status}`);
    return res.json();
  }

  async function get(path, params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, v);
    const suffix = qs.toString() ? `?${qs}` : '';
    const res = session
      ? await session.fetchHandler(`/xrpc/${path}${suffix}`)
      : await transport(`${GUEST_APPVIEW}/xrpc/${path}${suffix}`, { headers: {} });
    if (!res.ok) throw new Error(`lens: ${path} failed HTTP ${res.status}`);
    return res.json();
  }

  // ---- 3a: ring membership (aperture over the social graph) ----

  async function pagedGraph(method, actor) {
    const out = [];
    let cursor;
    do {
      const data = await get(`app.bsky.graph.${method}`, { actor, limit: 100, cursor });
      out.push(...(data[method === 'getFollowers' ? 'followers' : 'follows'] || []).map((u) => u.did));
      cursor = data.cursor;
    } while (cursor);
    return out;
  }

  const srcCtx = (source, title) => {
    const slug = slugForSource(source);
    return { fieldId: `lens:${slug}`, fieldSlug: slug, fieldTitle: title || slug };
  };

  return {
    // source: {kind:'feed'|'list', uri} | {kind:'author', actor} | {kind:'timeline'}
    async feed(source, { cursor, title } = {}) {
      let data;
      if (source.kind === 'author') data = await get('app.bsky.feed.getAuthorFeed', { actor: source.actor, limit: 30, cursor });
      else if (source.kind === 'list') data = await get('app.bsky.feed.getListFeed', { list: source.uri, limit: 30, cursor });
      else if (source.kind === 'timeline') {
        if (!session) throw new Error('lens: the Following timeline needs a session');
        data = await get('app.bsky.feed.getTimeline', { limit: 30, cursor });
      } else data = await get('app.bsky.feed.getFeed', { feed: source.uri, limit: 30, cursor });
      const src = srcCtx(source, title);
      return { ...shapeLensFeed(data, src), ...src };
    },

    async thread(uri, src) {
      const data = await get('app.bsky.feed.getPostThread', { uri, depth: 10 });
      return shapeLensThread(data, src || { fieldId: 'lens:thread', fieldSlug: 'thread', fieldTitle: 'Thread' });
    },

    // The lens Fields list: pinned/saved feeds + lists from preferences,
    // display names resolved through getFeedGenerators. Session-only.
    async fields() {
      if (!session) throw new Error('lens: Fields come from your saved feeds — needs a session');
      const prefs = await get('app.bsky.actor.getPreferences');
      const saved = (prefs.preferences || []).find((p) => (p.$type || '').includes('savedFeedsPref'));
      const items = saved?.items || [];
      const feedUris = items.filter((i) => i.type === 'feed').map((i) => i.value);
      const gens = feedUris.length
        ? (await get('app.bsky.feed.getFeedGenerators', Object.fromEntries(feedUris.map((u, i) => [`feeds[${i}]`, u])))).feeds || []
        : [];
      const titleOf = new Map(gens.map((g) => [g.uri, g.displayName]));
      return items.map((i) => ({
        id: i.value, kind: i.type, pinned: !!i.pinned,
        slug: slugForSource(i.type === 'author' ? { kind: 'author', actor: i.value } : i.type === 'timeline' ? { kind: 'timeline' } : { kind: i.type, uri: i.value }),
        title: i.type === 'timeline' ? 'Following' : titleOf.get(i.value) || i.value.split('/').pop(),
      }));
    },

    // ring: 'world' | 'following' | 'mutuals' | 'mutuals+1'. world/following
    // bypass the graph (their boards come from sources/timeline). mutuals =
    // follows ∩ followers; mutuals+1 adds each mutual's follows under
    // RING_CAP with HONEST overflow (the true pre-cap count — never silent).
    async ringMembers(ring) {
      if (ring === 'world' || ring === 'following') return { members: null };
      if (ring !== 'mutuals' && ring !== 'mutuals+1') {
        throw new Error(`lens: unknown ring: ${ring} (known: world, following, mutuals, mutuals+1)`);
      }
      if (!session) throw new Error('lens: rings are computed from YOUR graph — needs a session');
      const [follows, followers] = await Promise.all([
        pagedGraph('getFollows', session.did),
        pagedGraph('getFollowers', session.did),
      ]);
      const mutuals = computeMutuals(follows, followers);
      if (ring === 'mutuals') return { members: mutuals };
      const seen = new Set(mutuals);
      for (const m of mutuals) {
        for (const did of await pagedGraph('getFollows', m)) seen.add(did);
      }
      const all = [...seen];
      if (all.length <= RING_CAP) return { members: all };
      return { members: all.slice(0, RING_CAP), overflow: { capped: true, total: all.length } };
    },

    // 3b: the merged ring board. One page = one fan-out round over the ring's
    // members (parallel, per-member failures REPORTED, never board-fatal),
    // time-interleaved with a deterministic tie order (indexedAt desc, then
    // author DID, then uri). The cursor is the per-member cursor map, base64 —
    // resuming advances each member from its own cursor, so no duplicates;
    // exhausted members drop out.
    async ringFeed(ring, { cursor } = {}) {
      if (ring === 'world') {
        throw new Error('lens: the world ring has no merged board — its board is the sources/feeds surface');
      }
      if (ring === 'following') {
        const board = await this.feed({ kind: 'timeline' }, { title: 'Following' });
        return { ...board, ring, failures: [] };
      }
      const resumed = cursor ? JSON.parse(atob(cursor)) : null;
      const ringInfo = resumed ? { members: Object.keys(resumed.m) } : await this.ringMembers(ring);
      const cursors = resumed ? resumed.m : Object.fromEntries((ringInfo.members ?? []).map((d) => [d, undefined]));
      const failures = [];
      const pages = await Promise.all(Object.entries(cursors).map(async ([did, cur]) => {
        try {
          const data = await get('app.bsky.feed.getAuthorFeed', { actor: did, limit: 10, cursor: cur });
          return { did, items: data.feed || [], next: data.cursor };
        } catch {
          failures.push(did);
          return { did, items: [], next: undefined };
        }
      }));
      const items = pages.flatMap((p) => p.items);
      items.sort((x, y) => {
        const t = String(y.post.indexedAt).localeCompare(String(x.post.indexedAt));
        if (t) return t;
        const a = String(x.post.author?.did).localeCompare(String(y.post.author?.did));
        if (a) return a;
        return String(x.post.uri).localeCompare(String(y.post.uri));
      });
      const nextMap = Object.fromEntries(pages.filter((p) => p.next).map((p) => [p.did, p.next]));
      const src = { fieldId: `lens:ring:${ring}`, fieldSlug: `ring:${ring}`, fieldTitle: ring === 'mutuals' ? 'Mutuals' : 'Mutuals +1' };
      return {
        ...shapeLensFeed({ feed: items }, src), ...src,
        ring, failures,
        ...(ringInfo.overflow ? { overflow: ringInfo.overflow } : {}),
        cursor: Object.keys(nextMap).length ? btoa(JSON.stringify({ m: nextMap })) : undefined,
      };
    },

    // boost: create MY like of the post (D1-pinned shape). Returns the like's
    // at-uri so the UI can unboost without a refetch.
    async like(uri, cid) {
      const data = await post('com.atproto.repo.createRecord', {
        repo: session?.did, collection: LIKE_COLLECTION,
        record: { $type: LIKE_COLLECTION, subject: { uri, cid }, createdAt: new Date().toISOString() },
      }, 'like');
      return { likeUri: data.uri };
    },

    // unboost: delete MY like by its exact rkey.
    async unlike(likeUri) {
      const rkey = likeUri.split('/').pop();
      return post('com.atproto.repo.deleteRecord', {
        repo: session?.did, collection: LIKE_COLLECTION, rkey,
      }, 'unlike');
    },

    async search(q) {
      if (!session) throw new Error('lens: search needs a session (403 unauth — probe-verified)');
      const data = await get('app.bsky.feed.searchPosts', { q, limit: 30 });
      const src = { fieldId: 'lens:search', fieldSlug: 'search', fieldTitle: `Search: ${q}` };
      return { posts: (data.posts || []).map((p) => shapeLensPost(p, src)) };
    },
  };
}
