// The wide lens (6b): PURE shapers from bsky AppView views into the exact
// result shapes our selectors emit, so the standing UI renders the owner's
// Bluesky as a forum unchanged. Read-first: every permission that would write
// is false (writes stay on `memory`; boost-as-like is a ledgered frontier).
// Divergences from the memory tier are ledgered: scores are likes-only
// (DL-011), ordering is the feed generator's (DL-010), membership is the
// saved-feeds preference (DL-012).

// Lens surfaces are read-only; the write gates all stay shut (frontier chips,
// never dead buttons — the UI renders these as deferred, invariant 7).
import { buildPost, withTag, IMAGE_LIMITS } from '../compose.js';

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

// OQ5 (owner, 2026-08-26): a LOGGED-OUT visitor gets the strictest stance, not
// a permissive default. They have no account to mirror, so the piggy-back
// principle has nothing to piggy-back on — and the honest answer to "what would
// this person have chosen" is "the safe thing", not "everything".
//
// This floor is bluebird's, deliberately: same set, same rules
// (CroftC/bluebird/src/feed/labels.ts, the "label floor"). Its reasoning holds
// here too — we HIDE rather than blur-with-reveal, because a tap-to-reveal
// control is a decoy door: it presents the material as one gesture away while
// pretending to withhold it.
//
// Signed in, this does NOT apply. The account's own settings govern, including
// the choice to turn things ON. Mirroring that is the whole point.
export const GUEST_FLOOR = Object.freeze(new Set([
  // adult / sexual
  'porn', 'sexual', 'nudity', 'sexual-figurative',
  // violence / graphic / self-harm
  'graphic-media', 'gore', 'self-harm', 'torture', 'corpse',
  // system-level moderation actions
  '!hide', '!takedown', '!warn',
]));

export const EMPTY_POSTURE = Object.freeze({
  mutedWords: [], labelPrefs: new Map(), adultEnabled: false,
  mutedDids: new Set(), blockedDids: new Set(), hideBadges: false,
  // OQ5: the guest posture IS the floor. A session replaces this wholesale.
  floor: GUEST_FLOOR,
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
    adultEnabled: adult ? !!adult.enabled : false,
    mutedDids: new Set(mutes.map((u) => u.did)),
    blockedDids: new Set(blocks.map((u) => u.did)),
    hideBadges: !!verifPref?.hideBadges,
    // OQ5: a signed-in account carries NO floor — its own settings govern.
    floor: null,
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

// Label disposition under the posture: 'hide' | 'warn' | null. Takes anything
// that carries atproto `labels` — a post view OR a feed-generator view; the
// rules are identical by construction, which is the point (4a).
// Effective label values on a thing AND on whoever authored it. Two rules that
// were missing before OQ5:
//   - `neg: true` is a RETRACTION. The labeller took it back; treating it as
//     live is simply wrong, and it was silently over-hiding.
//   - an account can be labeled without its individual posts being labeled, so
//     the author's labels count as much as the post's. A feed generator's
//     creator is the same relationship.
function effectiveLabels(labelled) {
  const own = labelled.labels || [];
  const byAuthor = labelled.author?.labels || labelled.creator?.labels || [];
  return [...own, ...byAuthor].filter((l) => !l.neg).map((l) => l.val);
}

function labelDisposition(labelled, posture) {
  let warn = null;
  for (const val of effectiveLabels(labelled)) {
    // OQ5: the guest floor comes FIRST and admits no reveal.
    if (posture.floor?.has(val)) return { mode: 'hide' };
    if (ADULT_LABELS.has(val) && !posture.adultEnabled) return { mode: 'hide' };
    const v = posture.labelPrefs.get(val);
    if (v === 'hide') return { mode: 'hide' };
    if (v === 'warn') warn = warn ? { mode: 'warn', labels: [...warn.labels, val] } : { mode: 'warn', labels: [val] };
  }
  return warn;
}

// 4a: the feed-facing name for the same rule. A feed generator publishes
// `labels` exactly as a post does, and discovery used to drop them — so an
// account with adult content off still saw adult-labelled feeds. There is no
// Forage-side adult toggle: the account's imported posture decides, and for a
// guest (EMPTY_POSTURE) the answer is off.
export const feedDisposition = (view, posture) => labelDisposition(view, posture);

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
    // 3u: the post's SELF-DECLARED language(s) — app.bsky.feed.post.langs,
    // verified present in the lexicon and live. Optional: a post that said
    // nothing has an empty list, and is never treated as foreign.
    langs: Array.isArray(record.langs) ? record.langs : [],
    verified: posture.hideBadges ? null
      : post.author?.verification?.verifiedStatus === 'valid' ? 'valid'
      : post.author?.verification?.trustedVerifierStatus === 'valid' ? 'trusted' : null,
    saved: false, // bookmarks are not public API surface yet — frontier
    commentCount: post.replyCount ?? 0,
  };
  // 3f: the posture applies here — policy in the shape layer, never components.
  const disp = labelDisposition(post, posture);
  if (disp?.mode === 'hide') {
    return { ...base, title: '', body: '', url: '', author: null, authorId: null, maskedRemoved: true, hidden: true };
  }
  // OWNER, 2026-08-26: muting makes content ABSENT, never present-with-a-label.
  // The old rendering left a row reading "[muted — matches your muted words]",
  // which defeats the mute twice: the row still costs the reader a line of
  // attention, and it announces exactly what is being withheld. A muted word or
  // a muted account is client-side rendering guidance — "do not show me this" —
  // and the only rendering that honours it is nothing at all. `hidden` is what
  // the boards filter on, which is how blocked authors already disappear.
  if (maskedByViewer(post) || posture.mutedDids.has(post.author?.did)) {
    return { ...base, title: '', body: '', url: '', author: null, authorId: null, maskedRemoved: true, hidden: true };
  }
  if (posture.mutedWords.some((w) => mutedWordHits(w, post))) {
    return { ...base, title: '', body: '', url: '', author: null, authorId: null, maskedRemoved: true, hidden: true };
  }
  // 3e inbound: a quote post carries its quoted original in the embed — the
  // context renders for free (D7); the uri links to the original's thread.
  // 3i: media embeds surface as post.media (card mode renders them; compact
  // and text-only surfaces skip them). recordWithMedia splits into both.
  const emb = post.embed;
  const quoteRec = emb?.$type === 'app.bsky.embed.record#view' ? emb.record
    : emb?.$type === 'app.bsky.embed.recordWithMedia#view' ? emb.record?.record : null;
  const quoted = quoteRec?.uri
    ? { uri: quoteRec.uri, author: quoteRec.author?.handle || '[unknown]',
        excerpt: (quoteRec.value?.text || '').slice(0, 200) }
    : undefined;
  const mediaEmb = emb?.$type === 'app.bsky.embed.recordWithMedia#view' ? emb.media : emb;
  const media = mediaEmb?.$type === 'app.bsky.embed.images#view'
    ? { kind: 'images', items: (mediaEmb.images || []).map((i) => ({ thumb: i.thumb, full: i.fullsize, alt: i.alt || '' })) }
    : mediaEmb?.$type === 'app.bsky.embed.video#view'
      ? { kind: 'video', thumb: mediaEmb.thumbnail || null }
      : mediaEmb?.$type === 'app.bsky.embed.external#view' && mediaEmb.external?.thumb
        ? { kind: 'external', thumb: mediaEmb.external.thumb, uri: mediaEmb.external.uri }
        : undefined;
  // an image/video-only post titles from its alt text, never renders blank
  const displayTitle = text
    || media?.items?.find((i) => i.alt)?.alt
    || (media?.kind === 'images' ? '[image]' : media?.kind === 'video' ? '[video]' : text);
  return {
    ...base,
    title: displayTitle, body: text, url: external?.uri || '',
    author: post.author?.handle || '[unknown]', authorId: post.author?.did || null,
    removedReason: '',
    // 3i: rows never duplicate the title as a preview — bluesky text posts ARE
    // their title (300/300). Thread/comment rendering keeps using body.
    preview: text && external?.uri ? text : '',
    ...(media ? { media } : {}),
    ...(quoted ? { quoted } : {}),
    ...(disp?.mode === 'warn' ? { warnLabels: disp.labels } : {}),
  };
}

// 3q: how a thread node is drawn. A quote-response is a top-level thread ON
// the post (the OG post stays the container), so it gets a left WALL — the
// same grammar the feed blurb uses: a wall means quoted material. A reply gets
// the collapse gutter instead. Never both: with a bare quote node above them,
// the walled replies below read as if they hung off the quote (2026-08-26).
export function threadNodeStyle(node) {
  // 3r: walled at ANY depth. A quote can itself be quoted, so the wall marks
  // the KIND of material, never its position — a cascade of quotes nests walls
  // the way a cascade of replies nests gutters.
  const isQuote = node.kind === 'quote';
  return { kind: isQuote ? 'quote' : 'reply', walled: isQuote };
}

// 3r: how far a quote cascade renders inline before it becomes a link. Each
// level costs a getPostThread + a getQuotes per quote, so this is a real
// budget, not a style choice; past it the node says how many it is hiding.
export const QUOTE_CASCADE_DEPTH = 3;

// 3r: how many quotes per level we expand. Quote counts are long-tailed — the
// first handful carry the conversation, the rest are drive-by reposts.
const CASCADE_BREADTH = 10;

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
    ...(p.maskedRemoved ? { maskedRemoved: true, title: p.title } : { removedReason: '' }),
    depth,
    autoCollapsed: false,
    children: [], deferred: 0,
    kind: 'reply',
    ...extra,
  });
  const build = (nodes, depth) => (nodes || []).map((n) => {
    if (!n.post) return null; // blocked / notFound stubs
    if (posture.blockedDids.has(n.post.author?.did)) return null; // never renders
    const p = shapeLensPost(n.post, src, posture);
    // Muted and label-floored nodes vanish here the same way a blocked author
    // already does — subtree included. Keeping a named placeholder in a thread
    // would re-announce what the mute asked us not to show.
    if (p.hidden) return null;
    total += 1;
    return {
      ...node(p, depth),
      children: depth >= 10 ? [] : build(n.replies, depth + 1),
      deferred: depth >= 10 ? (n.replies || []).length : 0,
    };
  }).filter(Boolean);
  // 3i: the poster self-thread (1/3, 2/3, 3/3 — the author replying to their
  // own post in a chain) is the BODY of the post in forum shape, not comments.
  // Only the unbroken same-author chain hoists; replies to hoisted parts
  // re-root as top-level comments; an author reply to someone ELSE stays a
  // comment.
  const rootDid = root.post?.author?.did;
  const selfThread = [];
  let topLevel = root.replies || [];
  let chain = topLevel.find((n) => n.post?.author?.did === rootDid && n.post);
  topLevel = topLevel.filter((n) => n !== chain);
  const reRooted = [];
  while (chain) {
    selfThread.push({
      uri: chain.post.uri,
      text: chain.post.record?.text || '',
      facets: chain.post.record?.facets || [],
    });
    const kids = chain.replies || [];
    const next = kids.find((n) => n.post?.author?.did === rootDid && n.post);
    reRooted.push(...kids.filter((n) => n !== next));
    chain = next;
  }
  const replies = build([...topLevel, ...reRooted], 0);
  // 3r: a quote cascade. A repost-with-comment collects replies of its own and
  // can itself be quoted, so a quote entry is a threadViewPost (post+replies)
  // plus its own quotes, and this walks the whole continuation. One ordering
  // rule the entire way down; a blocked author drops their branch, exactly as
  // a blocked replier already does.
  const order = (a, b) => (a.createdTs - b.createdTs)
    || String(a.authorId).localeCompare(String(b.authorId))
    || String(a.id).localeCompare(String(b.id));
  const buildQuote = (entry, depth) => {
    if (posture.blockedDids.has(entry.post?.author?.did)) return null;
    total += 1;
    const p = shapeLensPost(entry.post, src, posture);
    const own = (entry.quotes || []);
    const expandable = depth < QUOTE_CASCADE_DEPTH;
    const kids = [
      ...build(entry.replies, depth + 1),
      ...(expandable ? own.map((q) => buildQuote(q, depth + 1)).filter(Boolean) : []),
    ].sort(order);
    return {
      ...node(p, depth, { kind: 'quote', quoteUri: p.id, quoted: p.quoted }),
      children: kids,
      deferred: expandable ? 0 : own.length,
    };
  };
  const quoteNodes = (quotes || []).map((q) => buildQuote(q, 0)).filter(Boolean);
  const comments = [...replies, ...quoteNodes].sort(order);
  return { post, perms: LENS_PERMS, sort: 'lens', locked: false, comments, total,
    selfThread, quoteCount: root.post.quoteCount ?? 0 };
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

// 4b: a runaway guard on discovery paging, not a product cap. The corpus
// measured 117 feeds and ended with cursor:null; this only bites if the
// AppView's popular list grows an order of magnitude or stops terminating.
const MAX_DISCOVERY_FEEDS = 1000;

// Pure: follows ∩ followers, in follows order.
export function computeMutuals(follows, followers) {
  const fans = new Set(followers);
  return follows.filter((did) => fans.has(did));
}

// 3i: display names collapse to shareable aliases — but a displayName is
// OWNER-EDITABLE generator metadata (not identity, not unique), so the alias
// is a convenience and the rkey slug stays the durable canonical URL.
export function slugifyFeedName(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return slug || null;
}

// 3i: window sorts. A generator owns its feed's TRUE ranking (DL-010); what
// we can do honestly client-side is re-sort THE FETCHED WINDOW — the loaded
// pages, nothing more (whole-feed live sorts are the Jetstream v2 frontier,
// E139). Pure; time injected.
const TIMEFRAME_MS = { day: 86400_000, week: 7 * 86400_000, month: 30 * 86400_000, year: 365 * 86400_000 };

export function sortWindow(posts, sort, timeframe, nowMs) {
  if (!['feed', 'new', 'top'].includes(sort)) {
    throw new Error(`unknown window sort: ${sort} (known: feed, new, top)`);
  }
  if (sort === 'feed') return posts;
  let window = posts;
  if (sort === 'top' && timeframe !== 'all') {
    const span = TIMEFRAME_MS[timeframe];
    if (!span) throw new Error(`unknown timeframe: ${timeframe} (known: day, week, month, year, all)`);
    const cutoff = nowMs - span;
    window = posts.filter((p) => p.createdTs >= cutoff);
  }
  return [...window].sort((a, b) => (sort === 'new' ? b.createdTs - a.createdTs : b.score - a.score));
}

// 4e: /h/ boards ride searchPosts, which takes sort=top|latest plus since/until
// SERVER-SIDE (probe-verified with a session 2026-08-26). So a hashtag board's
// "Top · this week" is a real query over the whole corpus, not a re-sort of the
// page we happened to load — the one place the DL-010 limitation genuinely
// lifts. /f/ generator boards have no equivalent: getFeedSkeleton takes only
// limit and cursor, which is what DL-032 records.
//
// NOTE on honesty: Bluesky's `top` is an engagement-weighted RELEVANCE ranking,
// not a likeCount sort — a probe returned 152, 113, 1478, 122, 168 likes in that
// order. It is "top" in Bluesky's sense, and the UI says whose ranking it is.
export function searchWindow(sort, timeframe, nowMs) {
  if (!['feed', 'new', 'top'].includes(sort)) {
    throw new Error(`unknown window sort: ${sort} (known: feed, new, top)`);
  }
  if (sort !== 'top') return { sort: 'latest' };
  if (timeframe === 'all') return { sort: 'top' };
  const span = TIMEFRAME_MS[timeframe];
  if (!span) throw new Error(`unknown timeframe: ${timeframe} (known: day, week, month, year, all)`);
  return { sort: 'top', since: new Date(nowMs - span).toISOString() };
}

// ---- 4g: adoption signals from Constellation (ADR-004) ----
// The AppView counts likes on a feed and nothing else about how it is USED —
// and DL-033 records why that gap is permanent. Constellation indexes atproto
// backlinks, so it can answer "how many people quoted this feed" and "how many
// starter packs include it": a recommendation in someone's own words, and a
// curator staking their pack on it. Neither exists anywhere in app.bsky.
//
// ADR-004 bounds the dependency: counts on feed generators only (never an
// intake path), degrade-to-ABSENT always, no viewer identity ever, and a
// user-agent that says who we are because the operator asks.
export const CONSTELLATION = 'https://constellation.microcosm.blue';
const CONSTELLATION_UA = 'forage (forage.fyi; chase@owasp.org)';
const BACKLINKS = [
  { key: 'quotes', collection: 'app.bsky.feed.post', path: '.embed.record.uri' },
  { key: 'packs', collection: 'app.bsky.graph.starterpack', path: '.feeds[].uri' },
];

// An atproto rkey is a TID: 13 base32-sortable chars, of which the top 53 bits
// (after the leading zero) are MICROSECONDS since the epoch and the low 10 are
// a clock id. So a backlink row carries its own timestamp and the window costs
// no extra request. Cross-checked against getLikes createdAt on the same
// record: 0.15s apart (probe 2026-08-26).
const TID_ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';
export function tidTime(rkey) {
  if (typeof rkey !== 'string' || rkey.length !== 13 || [...rkey].some((c) => !TID_ALPHABET.includes(c))) {
    throw new Error(`not a TID: ${JSON.stringify(rkey)}`);
  }
  let n = 0n;
  for (const c of rkey) n = n * 32n + BigInt(TID_ALPHABET.indexOf(c));
  return new Date(Number(n >> 10n) / 1000);
}

// Pure: windows a page of backlink rows by rkey alone. A row whose rkey will
// not decode is counted in the total and left out of the windows — it is a
// real link with an unreadable clock, not a reason to fail the whole signal.
export function countRecent(rows, nowMs) {
  let d7 = 0; let d30 = 0;
  for (const r of rows) {
    let age;
    try { age = nowMs - tidTime(r.rkey).getTime(); } catch { continue; }
    if (age < WINDOW_MS.d7) d7 += 1;
    if (age < WINDOW_MS.d30) d30 += 1;
  }
  return { d7, d30, total: rows.length };
}

// ---- 4b: sorting and filtering the discovery corpus (T0) ----
// Every dimension here is already in the getPopularFeedGenerators payload, so
// these cost NOTHING extra. They can be honest about the whole corpus because
// browse mode holds all of it: 117 feeds in 2 requests (measured 2026-08-26).
// Pure; no time input needed — indexedAt strings sort lexicographically as
// ISO-8601, which is why they are compared as strings and never parsed.

// 4c: the windows are OURS. There is no time-bucketed aggregate anywhere in
// the API — only the cumulative likeCount — so we count a page of likes here.
// getLikes returns newest-first with both createdAt and indexedAt; indexedAt is
// the AppView's own clock and the two agreed to a median 0.0s in probing, while
// post createdAt values are sometimes in the FUTURE. So: indexedAt.
export const LIKE_PAGE = 100;
const WINDOW_MS = { d7: 7 * 86400_000, d30: 30 * 86400_000 };

const withTimeout = (promise, ms) => Promise.race([promise,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms))]);

export function likeWindow(likes, nowMs) {
  const ages = likes.map((l) => nowMs - Date.parse(l.indexedAt));
  return {
    d7: ages.filter((a) => a < WINDOW_MS.d7).length,
    d30: ages.filter((a) => a < WINDOW_MS.d30).length,
    // A full page is a FLOOR: the 101st like exists and this page cannot see
    // it. Measured, exactly 1 of 117 popular feeds hits this inside 7 days.
    capped: likes.length >= LIKE_PAGE,
  };
}

// 4d: liveness. `isOnline`/`isValid` is not the signal — across 915
// search-result feeds it was false ZERO times (probed 2026-08-26), including
// for 138 feeds with no likes at all. What getFeed DOES is the signal:
//   live    — its newest post is inside a week
//   stale   — it answers, but with months-old posts
//   empty   — it answers with nothing
//   silent  — it will not answer, and we do NOT know why. Its refusals are not
//             self-describing: the same personalized Bluesky feeds returned 502
//             and 400 across repeated probes, and a deleted feed returns 400
//             too. So this state is an absence of evidence, never a verdict of
//             death — and it is materially rarer with a session, because
//             personalized feeds answer 200 through the PDS proxy.
const STALE_AFTER_MS = 7 * 86400_000;

export function feedLiveness(items, nowMs) {
  if (!items.length) return 'empty';
  const newest = Math.min(...items.map((i) => nowMs - Date.parse(i.post?.indexedAt)));
  return newest > STALE_AFTER_MS ? 'stale' : 'live';
}

// Keeps what is alive AND what has not been probed yet — a feed is never
// hidden on the strength of no evidence.
export function liveFeeds(feeds, states) {
  const kept = feeds.filter((f) => {
    const st = states.get(f.uri);
    return st === undefined || st === 'live';
  });
  const count = (want) => feeds.filter((f) => states.get(f.uri) === want).length;
  return { kept, stale: count('stale'), silent: count('silent'), empty: count('empty') };
}

const FEED_SORTS = {
  // 'popular' is the AppView's own opaque score. We render it untouched rather
  // than re-deriving it — DL-010's principle applied one level up, to the list
  // of feeds instead of the posts inside one.
  popular: null,
  likes: (a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0),
  new: (a, b) => String(b.indexedAt || '').localeCompare(String(a.indexedAt || '')),
  old: (a, b) => String(a.indexedAt || '').localeCompare(String(b.indexedAt || '')),
  // 4c: measured against a window. A feed with no measurement yet sorts LAST
  // rather than as a zero — "we have not asked" and "nobody liked it" are
  // different facts, and the progressive paint depends on the distinction.
  rising7: null,
  rising30: null,
};
const RISING_KEY = { rising7: 'd7', rising30: 'd30' };

export function sortFeeds(feeds, sort, windows) {
  if (!(sort in FEED_SORTS)) {
    throw new Error(`unknown feed sort: ${sort} (known: ${Object.keys(FEED_SORTS).join(', ')})`);
  }
  const key = RISING_KEY[sort];
  if (key) {
    const score = (f) => windows?.get(f.uri)?.[key];
    return [...feeds].sort((a, b) => {
      const x = score(a); const y = score(b);
      if (x === undefined && y === undefined) return 0;
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      return y - x;
    });
  }
  const cmp = FEED_SORTS[sort];
  return cmp ? [...feeds].sort(cmp) : feeds;
}

export function filterFeeds(feeds, { platform, video } = {}) {
  return feeds.filter((f) => (!platform || f.platform === platform) && (!video || f.video));
}

// The builder-platform facet: which services host these feeds, most first.
// Measured over the top 100: skyfeed.me 49, api.graze.social 14, then a long
// tail — a genuinely useful narrowing, not a cosmetic one.
export function platforms(feeds) {
  const counts = new Map();
  for (const f of feeds) if (f.platform) counts.set(f.platform, (counts.get(f.platform) || 0) + 1);
  return [...counts.entries()].map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count);
}

// 3j/3s: joining a feed = SAVING it in savedFeedsPrefV2 (the same preferences
// blob the official app uses — piggy-back principle). Pure: the id is derived
// from the uri (deterministic, unique per feed, no randomness).
//
// 3s: joining does NOT pin. Bluesky models saved and pinned separately — saved
// is your list, pinned is the top row of tabs — and forcing pinned:true here
// rearranged that tab bar for anyone who joined a feed from Forage. Favoriting
// is withPinnedFeed, below.
const SAVED_PREF = (p) => (p.$type || '').endsWith('savedFeedsPrefV2');
const feedItem = (uri, pinned) => ({ type: 'feed', value: uri, pinned, id: `forage-${uri.split('/').pop()}` });

const withSavedItems = (preferences, mutate) => {
  const existing = preferences.find(SAVED_PREF);
  const items = mutate(existing?.items ? [...existing.items] : []);
  const next = { $type: 'app.bsky.actor.defs#savedFeedsPrefV2', ...(existing || {}), items };
  return existing ? preferences.map((p) => (SAVED_PREF(p) ? next : p)) : [...preferences, next];
};

export function withSavedFeed(preferences, uri, saved) {
  return withSavedItems(preferences, (items) => {
    const at = items.findIndex((i) => i.value === uri);
    if (saved && at === -1) items.push(feedItem(uri, false));
    if (!saved && at !== -1) items.splice(at, 1); // leaving takes the pin with it
    return items;
  });
}

// 3s: favoriting = pinning. Pinning a feed you never joined joins it too —
// pinned-but-unsaved is not a state the official app has.
export function withPinnedFeed(preferences, uri, pinned) {
  return withSavedItems(preferences, (items) => {
    const at = items.findIndex((i) => i.value === uri);
    if (at === -1) return pinned ? [...items, feedItem(uri, true)] : items;
    items[at] = { ...items[at], pinned };
    return items;
  });
}

// Phase 2: who may delete what. The at-uri is the authority, not the label —
// a shape claiming to be ours while its uri points at another repo is not ours,
// and `null === null` must never resolve into a delete. Pure, so the button and
// the network call ask the same question.
const POST_URI = /^at:\/\/(did:[a-z0-9]+:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/;

export function parsePostUri(uri) {
  const m = POST_URI.exec(String(uri || ''));
  return m ? { did: m[1], rkey: m[2] } : null;
}

export function canDelete(post, session) {
  if (!session?.did || !post?.authorId) return false;
  if (post.authorId !== session.did) return false;
  const parsed = parsePostUri(post.id);
  return !!parsed && parsed.did === session.did;
}

// Phase-1 live-proof finding (2026-08-26): during the real smoke run, clicking
// Reply on a freshly-loaded thread did nothing — no composer, no message. The
// session was still restoring and the view re-rendered underneath the click.
// "Not signed in yet" and "not signed in at all" are different situations and
// deserve different words: the first is a wait, the second is an instruction.
// Pure so every session-gated control can share one answer.
export function sessionGateMessage({ signedIn, authState }, action) {
  if (signedIn) return null;
  if (authState === 'unknown' || authState === 'pending') {
    return `Still restoring your session — one moment, then you can ${action}.`;
  }
  return `Sign in to ${action} — it writes to your own Bluesky account.`;
}

// 3v: the canonical, SHAREABLE feed path. A feed's identity is
// at://<did>/app.bsky.feed.generator/<rkey>; an rkey alone is not resolvable
// (rkeys are not unique across creators, and no endpoint resolves one without
// a repo), so a link that omits the creator only works for whoever already had
// the feed in memory — which is exactly the bug found live on forage.fyi.
// No creator, no shareable path: returning the bare form would hand out the
// broken link.
export function feedPath({ creator, rkey, uri } = {}) {
  const handle = String(creator || '').trim().replace(/^@/, '');
  const key = rkey || (uri ? String(uri).split('/').pop() : '');
  if (!handle || !key) return null;
  return `/f/@${handle}/${key}`;
}

// Which shape of /f/ route this is. Two segments means creator-qualified (the
// leading @ is conventional, not load-bearing); one means a bare slug, which
// still works for in-session navigation and every link already shared.
export function parseFeedRoute(params = {}) {
  if (params.rkey) {
    return { kind: 'qualified', handle: String(params.handle || '').replace(/^@/, ''), rkey: params.rkey };
  }
  return { kind: 'slug', slug: params.slug };
}

// 3m: the affordance split (owner-ratified 2026-08-26). /f/ and /h/ share the
// board chrome and differ in ONE place — what each promises about getting in.
// A hashtag is targetable BY CONSTRUCTION (the tag is the membership rule); a
// feed is a program whose criteria are unpublished (DL-025), so we promise
// nothing and render its description verbatim, since that prose is the only
// inclusion instruction that exists anywhere.
export function affordanceFor(stream) {
  if (stream.kind === 'hashtag') {
    return {
      targetable: true,
      headline: 'Anyone can post here.',
      detail: `Include #${stream.key} in your post and it appears in this board.`,
      composeLabel: `Post to #${stream.key}`,
    };
  }
  const info = stream.info || {};
  return {
    targetable: false,
    headline: `Curated by @${info.creator || 'unknown'}.`,
    detail: info.description
      ? info.description
      : 'This feed does not say how it chooses posts. Feeds publish no machine-readable rules — only what their description states.',
    composeLabel: null,
  };
}

// 3p: ONE box above a feed board, not two (dupe observed 2026-08-26). The
// <h1> already names the feed, so the card never restates it; what the card
// adds is the logo, WHO curates it, how many like it, and the feed's own
// description — which is quoted, because it is the feed's words and the only
// inclusion rule that exists anywhere (DL-025). When the feed says nothing we
// substitute our own sentence, and blurbIsOwnWords goes false so the view
// does not put OUR prose in quotation marks.
export function feedCardModel(info) {
  const a = affordanceFor({ kind: 'feed', info });
  return {
    avatar: info.avatar || null,
    headline: a.headline,
    likeCount: info.likeCount || 0,
    blurb: a.detail,
    blurbIsOwnWords: Boolean(info.description),
    degraded: info.online === false || info.valid === false,
  };
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
// THE write pair (DL-013): boost = a real Bluesky like.
const LIKE_COLLECTION = 'app.bsky.feed.like';

// 3w: THE publish write. The second kind of record the lens creates, and the
// one that makes Forage a forum rather than a reader. Deliberately narrow:
// our own repo, this one collection, a record built by the pure composer, and
// no deletes — nothing here can remove anything. test/invariants.test.js pins
// the count so a third kind cannot appear unnoticed.
const POST_COLLECTION = 'app.bsky.feed.post';

export function createLens({ session = null, transport = fetch } = {}) {
  let posture = EMPTY_POSTURE;
  // 3x: rings are expensive — mutuals+1 is one getFollows per mutual, so a
  // full ring is 26+ graph reads before a single post loads, and it was paid
  // again on every visit to the dial. The follow graph changes slowly, so the
  // answer is remembered for the life of this lens (i.e. this session on this
  // device; a sign-out builds a new lens). The PROMISE is cached, not the
  // result, so two callers racing a cold ring share one computation — and a
  // rejected promise is dropped, because a transient 502 must never be
  // remembered as an empty ring.
  const ringCache = new Map();

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
    async feed(source, { cursor, title, slug } = {}) {
      let data;
      if (source.kind === 'author') data = await get('app.bsky.feed.getAuthorFeed', { actor: source.actor, limit: 30, cursor });
      else if (source.kind === 'list') data = await get('app.bsky.feed.getListFeed', { list: source.uri, limit: 30, cursor });
      else if (source.kind === 'timeline') {
        if (!session) throw new Error('lens: the Following timeline needs a session');
        data = await get('app.bsky.feed.getTimeline', { limit: 30, cursor });
      } else data = await get('app.bsky.feed.getFeed', { feed: source.uri, limit: 30, cursor });
      const src = srcCtx(source, title);
      if (slug) { src.fieldSlug = slug; src.fieldId = `lens:${slug}`; } // 3i: display slug override
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

    // 3r: the thread, then its quote cascade. The cascade is opt-in (onCascade)
    // and lands AFTER the first paint — a quote of a quote is worth showing,
    // never worth waiting for. Each level costs requests, so two things bound
    // it: QUOTE_CASCADE_DEPTH, and the counts the appview already gave us —
    // a quote reporting no replies and no quotes is never asked about.
    async thread(uri, src, { onCascade } = {}) {
      const source = src || { fieldId: 'lens:thread', fieldSlug: 'thread', fieldTitle: 'Thread' };
      const [data, quotesRes] = await Promise.all([
        get('app.bsky.feed.getPostThread', { uri, depth: 10 }),
        get('app.bsky.feed.getQuotes', { uri, limit: 50 }).catch(() => null), // degrade, never break the thread
      ]);
      const entries = (quotesRes?.posts || []).map((post) => ({ post }));
      const shape = () => {
        const t = shapeLensThread(data, source, { quotes: entries, posture });
        return quotesRes === null ? { ...t, quotesFailed: true } : t;
      };

      if (onCascade && entries.length) {
        const expand = async (level, depth) => {
          if (depth >= QUOTE_CASCADE_DEPTH) return;
          const targets = level
            .filter((e) => (e.post.replyCount || 0) > 0 || (e.post.quoteCount || 0) > 0)
            .slice(0, CASCADE_BREADTH);
          if (!targets.length) return;
          await Promise.all(targets.map(async (e) => {
            const qUri = e.post.uri;
            const [th, qs] = await Promise.all([
              (e.post.replyCount || 0) > 0
                ? get('app.bsky.feed.getPostThread', { uri: qUri, depth: 10 }).catch(() => null) : null,
              (e.post.quoteCount || 0) > 0
                ? get('app.bsky.feed.getQuotes', { uri: qUri, limit: 50 }).catch(() => null) : null,
            ]);
            e.replies = th?.thread?.replies || [];
            e.quotes = (qs?.posts || []).map((post) => ({ post }));
          }));
          onCascade(shape()); // paint what landed before going deeper
          await expand(targets.flatMap((e) => e.quotes || []), depth + 1);
        };
        // deliberately un-awaited: the caller already has a thread to draw
        expand(entries, 0).catch(() => {}); // a cascade failure never breaks the thread
      }
      return shape();
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
      // 4a: the SAME label rule the boards and discovery use. A feed joined
      // before the account turned adult content off still leaves the sidebar —
      // membership is not consent, and there is no Forage-side override.
      const hiddenUris = new Set(gens.filter((g) => feedDisposition(g, posture)?.mode === 'hide').map((g) => g.uri));
      // 3v: the same response already names the creator — keep it, so every
      // link the sidebar draws can be the shareable form.
      const creatorOf = new Map(gens.map((g) => [g.uri, g.creator?.handle || null]));
      const taken = new Set();
      return items.filter((i) => !hiddenUris.has(i.value)).map((i) => {
        const slug = slugForSource(i.type === 'author' ? { kind: 'author', actor: i.value } : i.type === 'timeline' ? { kind: 'timeline' } : { kind: i.type, uri: i.value });
        const title = i.type === 'timeline' ? 'Following' : titleOf.get(i.value) || i.value.split('/').pop();
        // the human alias: first feed with a name keeps it; a collision (or a
        // name that collapses to nothing, or to an existing rkey) gets NO
        // alias — an ambiguous link must never point at the wrong feed
        let humanSlug = slugifyFeedName(title);
        if (humanSlug && (taken.has(humanSlug) || humanSlug === slug)) humanSlug = humanSlug === slug ? humanSlug : null;
        if (humanSlug) taken.add(humanSlug);
        taken.add(slug);
        return { id: i.value, kind: i.type, pinned: !!i.pinned, slug, humanSlug, title,
          creator: creatorOf.get(i.value) || null };
      });
    },

    // ring: 'world' | 'following' | 'mutuals' | 'mutuals+1'. world/following
    // bypass the graph (their boards come from sources/timeline). mutuals =
    // follows ∩ followers; mutuals+1 adds each mutual's follows under
    // RING_CAP with HONEST overflow (the true pre-cap count — never silent).
    ringMembers(ring) {
      if (ring === 'world' || ring === 'following') return Promise.resolve({ members: null });
      if (ring !== 'mutuals' && ring !== 'mutuals+1') {
        return Promise.reject(new Error(`lens: unknown ring: ${ring} (known: world, following, mutuals, mutuals+1)`));
      }
      if (!session) return Promise.reject(new Error('lens: rings are computed from YOUR graph — needs a session'));
      const cached = ringCache.get(ring);
      if (cached) return cached;
      const pending = this.computeRing(ring)
        .catch((e) => { ringCache.delete(ring); throw e; }); // a failure is not an answer
      ringCache.set(ring, pending);
      return pending;
    },

    // 3x: forget the remembered rings — sign-out, account switch, or an
    // explicit refresh. The graph belongs to an account, not to a device.
    forgetRings() { ringCache.clear(); },

    // The actual graph walk, cached by ringMembers above.
    async computeRing(ring) {
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
    // 3l: onPage fires per member as its page lands (the board paints
    // opportunistically instead of waiting for the whole fan-out), and
    // timeoutMs bounds each member — D6 measured a ~20s cold-start stall, and
    // one slow member must never hold the board hostage.
    async ringFeed(ring, { cursor, onPage, timeoutMs = 8000 } = {}) {
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
      const src0 = { fieldId: `lens:ring:${ring}`, fieldSlug: `ring:${ring}`, fieldTitle: ring === 'mutuals' ? 'Mutuals' : 'Mutuals +1' };
      const withTimeout = (p, did) => new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => { if (!settled) { settled = true; failures.push(did); resolve(null); } }, timeoutMs);
        p.then((v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } })
         .catch(() => { if (!settled) { settled = true; clearTimeout(timer); failures.push(did); resolve(null); } });
      });
      const pages = await Promise.all(Object.entries(cursors).map(async ([did, cur]) => {
        const data = await withTimeout(get('app.bsky.feed.getAuthorFeed', { actor: did, limit: 10, cursor: cur }), did);
        if (!data) return { did, items: [], next: undefined };
        const items = data.feed || [];
        // paint this member's posts NOW — the caller renders as they arrive
        if (onPage && items.length) {
          onPage(items.map((i) => shapeLensPost(i.post, src0, posture)).filter((p) => !p.hidden));
        }
        return { did, items, next: data.cursor };
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
      const src = src0;
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

    // 3w: publish MY post. The composer decides what a post IS (limits,
    // facets, reply refs) and refuses before anything reaches the network;
    // this only carries it. Returns uri+cid so a reply can thread onto it
    // without a refetch.
    // Phase 3: put the bytes in the repo and get a blob ref back. The size and
    // type checks are HERE, before the upload, because the PDS accepts an
    // oversized blob with a 200 and only refuses when the record references it
    // (probe-verified 2026-08-26) — without this, a person uploads a large
    // photo, waits for it, and then watches the post fail.
    async uploadImage(file) {
      if (!session) throw new Error('lens: uploading needs a session — sign in first');
      const type = file?.type || '';
      if (!type.startsWith('image/')) throw new Error(`that is ${type || 'not a recognised file'} — only images can go in a post`);
      if (file.size > IMAGE_LIMITS.bytes) {
        throw new Error(`that image is ${file.size} bytes and the limit is ${IMAGE_LIMITS.bytes} — pick a smaller one`);
      }
      const res = await session.fetchHandler('/xrpc/com.atproto.repo.uploadBlob', {
        method: 'POST', headers: { 'content-type': type }, body: file,
      });
      if (!res.ok) throw new Error(`lens: upload failed HTTP ${res.status}`);
      const data = await res.json();
      if (!data.blob) throw new Error('lens: the upload returned no blob');
      return data.blob;
    },

    async publish({ text, tag, langs, navLang, images, replyTo } = {}) {
      if (!session) throw new Error('lens: publishing needs a session — sign in first');
      const record = buildPost({ text: tag ? withTag(text, tag) : text, langs, navLang, images, replyTo });
      const data = await post('com.atproto.repo.createRecord', {
        repo: session.did, collection: POST_COLLECTION, record,
      }, 'publish');
      return { uri: data.uri, cid: data.cid, record };
    },

    // Phase 2: remove MY post. Two independent gates, because a delete that can
    // reach another repo is a different capability wearing this one's name:
    // the uri must parse as an app.bsky.feed.post uri, AND its repo must be
    // this session's. Neither is a UI concern — both hold when called directly.
    async deletePost(uri) {
      if (!session) throw new Error('lens: deleting needs a session — sign in first');
      const parsed = parsePostUri(uri);
      if (!parsed) throw new Error(`lens: not a post uri: ${JSON.stringify(uri)}`);
      if (parsed.did !== session.did) throw new Error('lens: that post is not yours — Forage only deletes from your own repo');
      return post('com.atproto.repo.deleteRecord', {
        repo: session.did, collection: POST_COLLECTION, rkey: parsed.rkey,
      }, 'delete post');
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
    async stream({ kind, key, sort = 'feed', timeframe = 'all', nowMs = Date.now() } = {}) {
      if (kind === 'feed') return this.feed({ kind: 'feed', uri: key });
      if (kind === 'hashtag') {
        if (!session) throw new Error('lens: hashtag streams need a session (search is 403 unauthenticated) — sign in first');
        const win = searchWindow(sort, timeframe, nowMs);
        const data = await get('app.bsky.feed.searchPosts', { q: `#${key}`, tag: key, limit: 30, ...win });
        const src = { fieldId: `lens:h:${key}`, fieldSlug: `h:${key}`, fieldTitle: `#${key}` };
        // wholeCorpus: this ordering came from the server over EVERYTHING that
        // matched, so the board must not print the "sorted within the loaded
        // posts" caveat — it would be a lie here.
        return { ...shapeLensFeed({ feed: (data.posts || []).map((p) => ({ post: p })), cursor: data.cursor }, src, {}, posture), ...src, wholeCorpus: true };
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

    // 3j: the feed's own card. NOTE (probe-verified 2026-08-26): a feed
    // generator publishes NO machine-readable criteria — did, avatar,
    // createdAt, description, displayName and nothing else. How to get INTO a
    // feed lives in the description prose, which is why we render it whole.
    async feedInfo(uri) {
      const data = await get('app.bsky.feed.getFeedGenerator', { feed: uri });
      const v = data.view || {};
      const disp = feedDisposition(v, posture);
      return {
        uri: v.uri, title: v.displayName || v.uri?.split('/').pop(), description: v.description || '',
        avatar: v.avatar || null, likeCount: v.likeCount ?? 0,
        creator: v.creator?.handle || '[unknown]',
        online: data.isOnline !== false, valid: data.isValid !== false,
        ...(disp?.mode === 'hide' ? { hidden: true } : {}),
        ...(disp?.mode === 'warn' ? { warnLabels: disp.labels } : {}),
      };
    },

    // 3v: resolve a SHARED feed link cold — handle → did → feed. Both calls
    // are unauth-200 (verified live), so a stranger with the link gets the
    // board, which is the entire point of a shareable URL. A did in the handle
    // position is already resolved and is not looked up again.
    async resolveFeed({ handle, rkey }) {
      const did = String(handle || '').startsWith('did:')
        ? handle
        : (await get('com.atproto.identity.resolveHandle', { handle })).did;
      if (!did) throw new Error(`lens: could not resolve @${handle} to an account`);
      return this.feedInfo(`at://${did}/app.bsky.feed.generator/${rkey}`);
    },

    // 3j: discovery — popular generators, optionally searched. Unauth-200
    // (probe-verified), so guests browse too.
    // 4a: the account's posture applies HERE, in the shape layer, exactly as it
    // does to posts — a hidden feed never reaches a component, so there is
    // nothing for a discovery-local toggle to re-reveal.
    // 4b: BROWSE pages the whole corpus (bounded: 117 feeds, 2 requests, 0.62s
    // — measured 2026-08-26) so every sort is honest about all of it. A QUERY
    // hits a real search index over the entire generator population (`query=a`
    // still had more after 1,500 rows), so it takes one page and keeps the
    // server's relevance order — sorting a slice of that would present itself
    // as a ranking of everything that matched, which it is not.
    async discoverFeeds({ query, limit = 100 } = {}) {
      const collected = [];
      let cursor;
      do {
        const data = await get('app.bsky.unspecced.getPopularFeedGenerators', { limit, query, cursor });
        collected.push(...(data.feeds || []));
        cursor = query ? null : data.cursor;
      } while (cursor && collected.length < MAX_DISCOVERY_FEEDS);
      return collected.map((f) => {
        const disp = feedDisposition(f, posture);
        return {
          uri: f.uri, title: f.displayName || f.uri.split('/').pop(), description: f.description || '',
          avatar: f.avatar || null, likeCount: f.likeCount ?? 0, creator: f.creator?.handle || '[unknown]',
          creatorDid: f.creator?.did || null,
          // the service DID is the BUILDER: did:web:skyfeed.me, did:web:api.graze.social…
          platform: String(f.did || '').startsWith('did:web:') ? f.did.slice('did:web:'.length) : null,
          video: f.contentMode === 'app.bsky.feed.defs#contentModeVideo',
          acceptsInteractions: !!f.acceptsInteractions,
          indexedAt: f.indexedAt || null,
          ...(disp?.mode === 'hide' ? { hidden: true } : {}),
          ...(disp?.mode === 'warn' ? { warnLabels: disp.labels } : {}),
        };
      }).filter((f) => !f.hidden);
    },

    // 4c: one getLikes per feed, bounded concurrency, announced as each lands
    // so the view can repaint progressively (the ring board's idiom, 3l). A
    // feed that fails or times out stays UNMEASURED — never a silent zero.
    async likeWindows(uris, { nowMs = Date.now(), onWindow, concurrency = 8, timeoutMs = 8000 } = {}) {
      const out = new Map();
      const queue = [...uris];
      const worker = async () => {
        for (let uri = queue.shift(); uri !== undefined; uri = queue.shift()) {
          try {
            const data = await withTimeout(
              get('app.bsky.feed.getLikes', { uri, limit: LIKE_PAGE }), timeoutMs);
            const w = likeWindow(data.likes || [], nowMs);
            out.set(uri, w);
            onWindow?.(uri, w);
          } catch { /* unmeasured: the sort keeps it at the back, with words */ }
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, uris.length) }, worker));
      return out;
    },

    // 4f: widen a /f/ board's window by paging BACKWARDS, on a budget. A
    // generator publishes no window lever (getFeedSkeleton takes only limit and
    // cursor — DL-032), so this is the only way, and its cost varies by two
    // orders of magnitude between feeds: measured, Astronomy covered 24h in ONE
    // page while Blacksky reached 3.6h in forty. Deep paging is also not
    // reliable — two feeds errored mid-run — so a page that fails ends the walk
    // with what we have rather than throwing the board away.
    //
    // Three honest endings, and the caller renders whichever happened:
    //   covered   — we reached past the requested window
    //   exhausted — the feed ran out first (not a failure: it has no more)
    //   budget    — it posts faster than we can page
    async deepen(source, { toHours, nowMs = Date.now(), maxPages = 8, timeoutMs = 12000 } = {}) {
      const wantMs = toHours * 3600_000;
      const seen = new Set();
      const posts = [];
      let cursor;
      let pages = 0;
      let reachedMs = 0;
      let outcome = 'budget';
      const started = Date.now();
      while (pages < maxPages) {
        let batch;
        try {
          batch = await withTimeout(this.feed(source, { cursor }), timeoutMs);
        } catch {
          // a page that will not load ends the walk with what we already have
          break;
        }
        pages += 1;
        for (const p of batch.posts) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          posts.push(p);
        }
        if (posts.length) reachedMs = Math.max(...posts.map((p) => nowMs - p.createdTs));
        cursor = batch.cursor;
        if (!cursor || !batch.posts.length) { outcome = 'exhausted'; break; }
        if (reachedMs >= wantMs) { outcome = 'covered'; break; }
        if (Date.now() - started > timeoutMs) break;
      }
      return { posts, cursor, pages, outcome, reachedHours: Math.round(reachedMs / 3600_000) };
    },

    // 4g: the two adoption counts for one feed. Goes through the PLAIN
    // transport, never the session — a third-party host learns nothing about
    // who is looking (ADR-004 point 4). Returns null, never zeroes, when the
    // host will not answer: an absent signal must not render as "0 shares".
    async adoption(uri, { nowMs = Date.now(), timeoutMs = 6000 } = {}) {
      try {
        const pages = await Promise.all(BACKLINKS.map(async ({ collection, path }) => {
          const qs = new URLSearchParams({ target: uri, collection, path, limit: String(LIKE_PAGE) });
          const res = await withTimeout(
            transport(`${CONSTELLATION}/links?${qs}`, { headers: { 'user-agent': CONSTELLATION_UA } }),
            timeoutMs);
          if (!res.ok) throw new Error(`constellation: HTTP ${res.status}`);
          return res.json();
        }));
        return Object.fromEntries(BACKLINKS.map(({ key }, i) => [key, {
          ...countRecent(pages[i].linking_records || [], nowMs),
          total: pages[i].total ?? 0,
        }]));
      } catch {
        return null;   // ADR-004 point 2: degrade to absent, with words upstairs
      }
    },

    // 4d: one getFeed per feed, limit=1 — freshness needs the newest post, not
    // a page. Same bounded-concurrency, announce-as-it-lands shape as 4c.
    async liveness(uris, { nowMs = Date.now(), onState, concurrency = 8, timeoutMs = 8000 } = {}) {
      const out = new Map();
      const queue = [...uris];
      const worker = async () => {
        for (let uri = queue.shift(); uri !== undefined; uri = queue.shift()) {
          let state = 'silent';
          try {
            const data = await withTimeout(get('app.bsky.feed.getFeed', { feed: uri, limit: 1 }), timeoutMs);
            state = feedLiveness(data.feed || [], nowMs);
          } catch { /* silent: it did not answer, and we do not know why */ }
          out.set(uri, state);
          onState?.(uri, state);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, uris.length) }, worker));
      return out;
    },

    // 3j: join / leave a feed — the SECOND lens write (preferences, not
    // records). Read-modify-write so nothing else in the blob is disturbed.
    async setFeedSaved(uri, saved) {
      if (!session) throw new Error('lens: joining a feed needs a session — sign in first');
      const prefs = await get('app.bsky.actor.getPreferences');
      const next = withSavedFeed(prefs.preferences || [], uri, saved);
      await post('app.bsky.actor.putPreferences', { preferences: next }, saved ? 'join feed' : 'leave feed');
      return next;
    },
    joinFeed(uri) { return this.setFeedSaved(uri, true); },
    leaveFeed(uri) { return this.setFeedSaved(uri, false); },

    // 3s: favoriting = pinning it to the top row, the same row the official
    // app shows. Independent of joining, and it joins you if you weren't.
    async favoriteFeed(uri, on) {
      if (!session) throw new Error('lens: favoriting a feed needs a session — sign in first');
      const prefs = await get('app.bsky.actor.getPreferences');
      const next = withPinnedFeed(prefs.preferences || [], uri, on);
      await post('app.bsky.actor.putPreferences', { preferences: next }, on ? 'favorite feed' : 'unfavorite feed');
      return next;
    },

    // 3k: a user's profile card — the persistent /u/<handle> surface. Read
    // only: editing lives on bsky.app (the lens tenet).
    async profile(actor) {
      const v = await get('app.bsky.actor.getProfile', { actor });
      return {
        did: v.did, handle: v.handle, displayName: v.displayName || v.handle,
        avatar: v.avatar || null, banner: v.banner || null, description: v.description || '',
        followers: v.followersCount ?? 0, following: v.followsCount ?? 0, posts: v.postsCount ?? 0,
        verified: v.verification?.verifiedStatus === 'valid' ? 'valid'
          : v.verification?.trustedVerifierStatus === 'valid' ? 'trusted' : null,
      };
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
