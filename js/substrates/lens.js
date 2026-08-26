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

// ---- 3f: the account's moderation posture (piggy-back principle, D10) ----
// Forage stores NO moderation state: the posture derives from the account's
// own preferences + graph endpoints and applies IN THE SHAPE LAYER.

const ADULT_LABELS = new Set(['porn', 'sexual', 'nudity', 'sexual-figurative']);

export const EMPTY_POSTURE = Object.freeze({
  mutedWords: [], labelPrefs: new Map(), adultEnabled: true,
  mutedDids: new Set(), blockedDids: new Set(), hideBadges: false,
});

// Pure: the D10 payloads → one posture object. Expired muted words drop at
// build time (the posture is rebuilt per session entry, not long-lived).
export function buildPosture({ preferences = [], mutes = [], blocks = [], listMutes = [], listBlocks = [] } = {}, nowMs) {
  const t = (x) => (x.$type || '').replace('app.bsky.actor.defs#', '');
  const mutedWords = preferences.filter((p) => t(p) === 'mutedWordsPref')
    .flatMap((p) => p.items || [])
    .filter((w) => !w.expiresAt || Date.parse(w.expiresAt) > nowMs);
  const labelPrefs = new Map(preferences.filter((p) => t(p) === 'contentLabelPref')
    .map((p) => [p.label, p.visibility]));
  const adult = preferences.find((p) => t(p) === 'adultContentPref');
  const verifPref = preferences.find((p) => t(p) === 'verificationPrefs');
  return {
    mutedWords, labelPrefs,
    adultEnabled: adult ? !!adult.enabled : true,
    mutedDids: new Set(mutes.map((u) => u.did)),
    blockedDids: new Set(blocks.map((u) => u.did)),
    hideBadges: !!verifPref?.hideBadges,
    listMuteCount: listMutes.length, listBlockCount: listBlocks.length,
  };
}

// A muted-word entry hits this post? targets: 'content' (text) and/or 'tag';
// actorTarget 'exclude-following' spares authors the viewer follows.
function mutedWordHits(w, post) {
  if (w.actorTarget === 'exclude-following' && post.author?.viewer?.following) return false;
  const needle = w.value.toLowerCase();
  const tags = (post.record?.tags || []).map((x) => String(x).toLowerCase());
  if ((w.targets || []).includes('tag') && tags.includes(needle)) return true;
  if ((w.targets || []).includes('content') && String(post.record?.text || '').toLowerCase().includes(needle)) return true;
  return false;
}

// Label disposition under the posture: 'hide' | 'warn' | null.
function labelDisposition(post, posture) {
  let warn = null;
  for (const l of post.labels || []) {
    if (ADULT_LABELS.has(l.val) && !posture.adultEnabled) return { mode: 'hide' };
    const v = posture.labelPrefs.get(l.val);
    if (v === 'hide') return { mode: 'hide' };
    if (v === 'warn') warn = warn ? { mode: 'warn', labels: [...warn.labels, l.val] } : { mode: 'warn', labels: [l.val] };
  }
  return warn;
}

// ---- 3f: facets are BYTE-indexed (UTF-8), not UTF-16 — decode via bytes ----
// Returns [{text, facet?}] where facet = {type:'link'|'mention'|'tag', value}.
export function facetSegments(text, facets) {
  const bytes = new TextEncoder().encode(text);
  const dec = new TextDecoder();
  const spans = (facets || []).map((f) => {
    const feat = (f.features || [])[0] || {};
    const type = (feat.$type || '').split('#').pop();
    const value = type === 'link' ? feat.uri : type === 'mention' ? feat.did : type === 'tag' ? feat.tag : null;
    return { start: f.index?.byteStart ?? 0, end: f.index?.byteEnd ?? 0, type, value };
  }).filter((sp) => sp.value != null).sort((a, b) => a.start - b.start);
  const out = [];
  let at = 0;
  for (const sp of spans) {
    if (sp.start > at) out.push({ text: dec.decode(bytes.slice(at, sp.start)) });
    out.push({ text: dec.decode(bytes.slice(sp.start, sp.end)), facet: { type: sp.type, value: sp.value } });
    at = sp.end;
  }
  if (at < bytes.length) out.push({ text: dec.decode(bytes.slice(at)) });
  return out.length ? out : [{ text: '' }];
}

const maskedByViewer = (post) =>
  !!(post.author?.viewer?.muted || post.author?.viewer?.blockedBy || post.viewer?.muted);

// One bsky post view -> our post shape. `src` names the Field this lens
// surface renders as: { fieldId, fieldSlug, fieldTitle }.
export function shapeLensPost(post, src, posture = EMPTY_POSTURE) {
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
    facets: record.facets || [],
    verified: posture.hideBadges ? null
      : post.author?.verification?.verifiedStatus === 'valid' ? 'valid'
      : post.author?.verification?.trustedVerifierStatus === 'valid' ? 'trusted' : null,
    saved: false, // bookmarks are not public API surface yet — frontier
    commentCount: post.replyCount ?? 0,
  };
  // 3f: the posture applies here — policy in the shape layer, never components.
  const disp = labelDisposition(post, posture);
  if (disp?.mode === 'hide') {
    return { ...base, title: '[hidden by your filters]', body: '', url: '', author: null, authorId: null, maskedRemoved: true, hidden: true };
  }
  if (maskedByViewer(post) || posture.mutedDids.has(post.author?.did)) {
    return { ...base, title: '[muted account]', body: '', url: '', author: null, authorId: null, maskedRemoved: true };
  }
  if (posture.mutedWords.some((w) => mutedWordHits(w, post))) {
    return { ...base, title: '[muted — matches your muted words]', body: '', url: '', author: null, authorId: null, maskedRemoved: true };
  }
  // 3e inbound: a quote post carries its quoted original in the embed — the
  // context renders for free (D7); the uri links to the original's thread.
  const emb = post.embed;
  const quoted = emb?.$type === 'app.bsky.embed.record#view' && emb.record?.uri
    ? { uri: emb.record.uri, author: emb.record.author?.handle || '[unknown]',
        excerpt: (emb.record.value?.text || '').slice(0, 200) }
    : undefined;
  return {
    ...base,
    title: text, body: text, url: external?.uri || '',
    author: post.author?.handle || '[unknown]', authorId: post.author?.did || null,
    removedReason: '',
    ...(quoted ? { quoted } : {}),
    ...(disp?.mode === 'warn' ? { warnLabels: disp.labels } : {}),
  };
}

// One bsky threadViewPost tree -> our thread result shape.
// 3e: replies AND quotes are ONE continuation — a quote is a response the
// actor-centered view scattered onto the quoter's profile; the topic-centered
// view brings it home. Top-level nodes interleave time-ascending with a
// deterministic tie order (createdTs, authorId, id). A quote node carries
// quoteUri so it opens as its own thread. Detached quotes never appear: we
// render exactly what the appview returned, never re-derive.
export function shapeLensThread(threadResponse, src, { quotes, posture = EMPTY_POSTURE } = {}) {
  const root = threadResponse.thread;
  const post = shapeLensPost(root.post, src, posture);
  let total = 0;
  const node = (p, depth, extra = {}) => ({
    id: p.id, postId: post.id, parentId: null,
    createdTs: p.createdTs, createdSec: p.createdSec, edited: false,
    removed: false, deleted: false,
    ups: p.ups, downs: 0, score: p.score, myVote: p.myVote, saved: false,
    body: p.body, author: p.author, authorId: p.authorId,
    ...(p.maskedRemoved ? { maskedRemoved: true } : { removedReason: '' }),
    depth,
    autoCollapsed: false,
    children: [], deferred: 0,
    kind: 'reply',
    ...extra,
  });
  const build = (nodes, depth) => (nodes || []).map((n) => {
    if (!n.post) return null; // blocked / notFound stubs
    if (posture.blockedDids.has(n.post.author?.did)) return null; // never renders
    total += 1;
    const p = shapeLensPost(n.post, src, posture);
    return {
      ...node(p, depth),
      children: depth >= 10 ? [] : build(n.replies, depth + 1),
      deferred: depth >= 10 ? (n.replies || []).length : 0,
    };
  }).filter(Boolean);
  const replies = build(root.replies, 0);
  const quoteNodes = (quotes || [])
    .filter((q) => !posture.blockedDids.has(q.author?.did))
    .map((q) => {
      total += 1;
      const p = shapeLensPost(q, src, posture);
      return node(p, 0, { kind: 'quote', quoteUri: p.id, quoted: p.quoted });
    });
  const comments = [...replies, ...quoteNodes].sort((a, b) =>
    (a.createdTs - b.createdTs)
    || String(a.authorId).localeCompare(String(b.authorId))
    || String(a.id).localeCompare(String(b.id)));
  return { post, perms: LENS_PERMS, sort: 'lens', locked: false, comments, total,
    quoteCount: root.post.quoteCount ?? 0 };
}

// One bsky feed page -> our feed result shape.
export function shapeLensFeed(feedResponse, src, { sort = 'lens', timeframe = 'all' } = {}, posture = EMPTY_POSTURE) {
  const posts = (feedResponse.feed || [])
    .filter((item) => !posture.blockedDids.has(item.post?.author?.did)) // blocked: never renders
    .map((item) => shapeLensPost(item.post, src, posture))
    .filter((p) => !p.hidden); // label-hidden: dropped from lists
  return {
    scope: `lens:${src.fieldSlug}`, sort, timeframe,
    perms: LENS_PERMS,
    posts,
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
  let posture = EMPTY_POSTURE;

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
      return { ...shapeLensFeed(data, src, {}, posture), ...src };
    },

    // 3f: pull the account's whole moderation posture (one round per session
    // entry). Guests keep the permissive default; failures throw with words —
    // the caller decides whether to run unfiltered.
    async loadPosture() {
      if (!session) { posture = EMPTY_POSTURE; return posture; }
      const [prefs, mutes, blocks, listMutes, listBlocks] = await Promise.all([
        get('app.bsky.actor.getPreferences'),
        get('app.bsky.graph.getMutes', { limit: 100 }),
        get('app.bsky.graph.getBlocks', { limit: 100 }),
        get('app.bsky.graph.getListMutes', { limit: 100 }),
        get('app.bsky.graph.getListBlocks', { limit: 100 }),
      ]);
      posture = buildPosture({
        preferences: prefs.preferences, mutes: mutes.mutes, blocks: blocks.blocks,
        listMutes: listMutes.lists, listBlocks: listBlocks.lists,
      }, Date.now());
      return posture;
    },
    posture: () => posture,

    async thread(uri, src) {
      const [data, quotesRes] = await Promise.all([
        get('app.bsky.feed.getPostThread', { uri, depth: 10 }),
        get('app.bsky.feed.getQuotes', { uri, limit: 50 }).catch(() => null), // degrade, never break the thread
      ]);
      const shaped = shapeLensThread(data,
        src || { fieldId: 'lens:thread', fieldSlug: 'thread', fieldTitle: 'Thread' },
        { quotes: quotesRes?.posts, posture });
      return quotesRes === null ? { ...shaped, quotesFailed: true } : shaped;
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
        ...shapeLensFeed({ feed: items }, src, {}, posture), ...src,
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

    // 3g: content streams — one abstraction, two keys. 'feed' opens any
    // feed-generator at-uri (trending topics resolve to these, D8);
    // 'hashtag' is searchPosts tag= (session-gated, worded refusal).
    async stream({ kind, key } = {}) {
      if (kind === 'feed') return this.feed({ kind: 'feed', uri: key });
      if (kind === 'hashtag') {
        if (!session) throw new Error('lens: hashtag streams need a session (search is 403 unauthenticated) — sign in first');
        const data = await get('app.bsky.feed.searchPosts', { q: `#${key}`, tag: key, limit: 30 });
        const src = { fieldId: `lens:h:${key}`, fieldSlug: `h:${key}`, fieldTitle: `#${key}` };
        return { ...shapeLensFeed({ feed: (data.posts || []).map((p) => ({ post: p })), cursor: data.cursor }, src, {}, posture), ...src };
      }
      throw new Error(`lens: unknown stream kind: ${kind} (known: feed, hashtag)`);
    },

    // 3g: the trending rail — unspecced API (may break without notice; the
    // caller degrades to absent-with-words). Each topic's link resolves to a
    // feed generator; a non-feed link keeps the topic without a board.
    async trending() {
      const data = await get('app.bsky.unspecced.getTrendingTopics', { limit: 10 });
      return (data.topics || []).map((t) => {
        const m = String(t.link || '').match(/^\/profile\/([^/]+)\/feed\/([^/?]+)$/);
        return {
          topic: t.topic, displayName: t.displayName || t.topic, description: t.description || '',
          feedUri: m ? `at://${m[1]}/app.bsky.feed.generator/${m[2]}` : null,
        };
      });
    },

    async search(q) {
      if (!session) throw new Error('lens: search needs a session (403 unauth — probe-verified)');
      const data = await get('app.bsky.feed.searchPosts', { q, limit: 30 });
      const src = { fieldId: 'lens:search', fieldSlug: 'search', fieldTitle: `Search: ${q}` };
      return { posts: (data.posts || [])
        .filter((p) => !posture.blockedDids.has(p.author?.did))
        .map((p) => shapeLensPost(p, src, posture))
        .filter((p) => !p.hidden) };
    },
  };
}
