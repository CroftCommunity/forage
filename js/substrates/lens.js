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
import { RUNG_IDS, membersFor, scopeMembers, labelFor } from '../rings.js';
import { sortItems } from '../engines/rank.js';
import { gifOf, parseAlt } from '../gif.js';

export const LENS_PERMS = Object.freeze({
  viewerId: null, loggedIn: false, admin: false, probation: false,
  isSteward: false, isOwner: false, bannedHere: false, banInfo: null,
  canView: true, canVote: false, canComment: false, canPost: false,
  canReport: false, canCreateFeed: false, canModerate: false,
  canManageFeed: false, canSuspendAccount: false, canCloseFeed: false,
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
  mutedDids: new Set(), blockedDids: new Set(), blockUriByDid: new Map(), hideBadges: false,
  hiddenUris: new Set(), // 4b "Hide for me": device-local, never a request
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
    // Phase 4a: unblock deletes a RECORD, so the menu needs each block's uri —
    // getBlocks carries it as viewer.blocking (D2-verified).
    blockUriByDid: new Map(blocks.filter((u) => u.viewer?.blocking).map((u) => [u.did, u.viewer.blocking])),
    hideBadges: !!verifPref?.hideBadges,
    // OQ5: a signed-in account carries NO floor — its own settings govern.
    floor: null,
    listMuteCount: listMutes.length, listBlockCount: listBlocks.length,
  };
}

// The ring rides ON the posture rather than inside buildPosture, because it is
// not one of the D10 moderation payloads: it is computed from the social graph,
// it changes when the reader moves the pill, and it must be replaceable without
// re-fetching mutes and blocks. Pure — a new posture comes back, the old one is
// untouched.
//
// `members: null` is World: the ring does not narrow. That is NOT "unfiltered"
// — this guard is the last of four, and blocks, mutes, muted words and label
// prefs have all already run by the time it is consulted. An empty Set is a
// third thing again: narrow to nobody, a legitimate (if quiet) ring that paints
// an empty board. js/rings.js owns that distinction and this preserves it
// rather than collapsing the two into a falsy check.
export function withRing(posture, { members = null, exemptKinds = [] } = {}) {
  return {
    ...posture,
    ring: {
      members: members == null ? null : new Set(members),
      exemptKinds: new Set(exemptKinds),
    },
  };
}

// Last policy in the order, and the weakest: it can only ever remove, and it
// never restores. A posture with no ring, or a ring set to World, does no
// NARROWING of its own — everything the three policies above it hid stays
// hidden.
//
// The exemption tests the SOURCE, not the post. A feed or a hashtag is a board
// the reader went and asked for by name, so by default it arrives whole; the
// reader can turn that off, at which point a quiet feed renders empty and that
// is the setting working (owner, 2026-09-03).
function outsideRing(post, src, posture) {
  const r = posture.ring;
  if (!r || r.members === null) return false;
  if (src?.feedKind && r.exemptKinds.has(src.feedKind)) return false;
  return !r.members.has(post.author?.did);
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

// post-text (2026-09-01): the trailing URL the card already IS.
//
// Bluesky's composer writes a shortened display string into the text
// ("www.videogameschronicle.com/news/sony-sa...") and puts the full uri in a
// #link facet, then attaches the same uri as an external embed. Forage renders
// the card WITH its title, description and host, so printing the raw url
// directly above it says the same thing twice — and at 390px that 43-character
// token has to break mid-word to fit. Trim it, and only it:
//
//   - the LAST facet only, and only when it ends the text (bar whitespace) —
//     an author who wrote a sentence around the link keeps their sentence
//   - only when the uri is the card's own (ignoring a trailing slash)
//   - never down to nothing: a url-only post would otherwise render blank
//
// Pure, and byte-honest: facet offsets are UTF-8, so the cut is made on bytes
// and decoded back, never on a UTF-16 index that an emoji would shift.
export function trimCardLink(text, facets, cardUri) {
  if (!text || !cardUri || !(facets || []).length) return { text, facets: facets || [] };
  const same = (a, b) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  const last = [...facets].sort((a, b) => (a.index?.byteStart ?? 0) - (b.index?.byteStart ?? 0)).at(-1);
  const feat = (last.features || [])[0] || {};
  if ((feat.$type || '').split('#').pop() !== 'link') return { text, facets };
  if (!feat.uri || !same(feat.uri, cardUri)) return { text, facets };
  const end = last.index?.byteEnd ?? 0;
  // the facet must run to the end of the text — trailing whitespace is allowed
  if (new TextDecoder().decode(bytes.slice(end)).trim() !== '') return { text, facets };
  const kept = new TextDecoder().decode(bytes.slice(0, last.index?.byteStart ?? 0)).replace(/\s+$/, '');
  if (!kept) return { text, facets }; // a url-only post keeps its url
  return { text: kept, facets: facets.filter((f) => f !== last) };
}

const maskedByViewer = (post) =>
  !!(post.author?.viewer?.muted || post.author?.viewer?.blockedBy || post.viewer?.muted);

// One bsky post view -> our post shape. `src` names the Feed this lens
// surface renders as: { feedId, feedSlug, feedTitle }.
// board-cards Phase 5a: the embed's `aspectRatio {width,height}` as `{w,h}`, so
// the media stage can size its frame BEFORE the picture loads. Absent, zero, or
// not a number (string widths exist on old records) is null — never NaN, never
// a coerced string — and a null stage sizes from the picture on load instead.
function aspectOf(ar) {
  const w = ar?.width, h = ar?.height;
  if (typeof w !== 'number' || typeof h !== 'number') return null;
  if (!(w > 0) || !(h > 0)) return null;
  return { w, h };
}

// 3i: one embed VIEW -> the media shape every surface renders. Extracted from
// shapeLensPost 2026-09-01 (quote-embed) because a QUOTED post's embed has to
// come out the same door as the quoting post's — the owner's report was a quote
// of a video that rendered as words alone, and a second copy of this ladder is
// how the two would drift. recordWithMedia gives up its media half; the record
// half is quotedOf's business.
function mediaOf(embedView) {
  const e = embedView?.$type === 'app.bsky.embed.recordWithMedia#view' ? embedView.media : embedView;
  if (e?.$type === 'app.bsky.embed.images#view') {
    return { kind: 'images', items: (e.images || []).map((i) => ({ thumb: i.thumb, full: i.fullsize, alt: i.alt || '', aspect: aspectOf(i.aspectRatio) })) };
  }
  // v13 decision 30: the playlist is what plays in place (HLS; Safari natively, elsewhere through vendored hls.js)
  if (e?.$type === 'app.bsky.embed.video#view') {
    return { kind: 'video', thumb: e.thumbnail || null, aspect: aspectOf(e.aspectRatio), playlist: e.playlist || null };
  }
  // 4i: `title` rides along because it is the external card's only human name,
  // and the view needs one — an <a> around a decorative thumbnail is otherwise
  // an unnamed link (SERIOUS, live 2026-08-26). Explicitly null when absent,
  // never the uri: distinguishing "no title" from a title that looks like a url
  // is what lets the view name the link honestly instead of inventing one.
  // post-text (2026-09-01): `thumb` is explicitly null when the page had no
  // og:image — the card renders its words without a stage. The guard here used
  // to be `external?.thumb`, so such a post produced no media at all and its
  // link went nowhere (press releases, statements).
  if (e?.$type === 'app.bsky.embed.external#view' && e.external?.uri) {
    // gif-embeds (owner, 2026-09-02): Bluesky's GIF button attaches the
    // animation as an ORDINARY external embed, so this branch has been drawing
    // a frozen JPEG thumbnail with a link out. Ask first whether the uri is
    // really an animation; a GIF is its own kind because it has sources, a
    // loop, a play state and a true aspect ratio that a link card never had.
    //
    // Deciding it HERE is what makes a quoted GIF, a reply GIF and a feed GIF
    // one piece of work — mediaOf is the one door (3i), and the alternative
    // was every view learning Bluesky's "ALT: " description hack for itself.
    const gif = gifOf(e.external.uri);
    if (gif) {
      const { text, authored } = parseAlt(e.external.description);
      return { kind: 'gif', player: gif.kind, thumb: e.external.thumb || null, uri: e.external.uri,
        title: e.external.title || null, aspect: gif.aspect,
        ...(gif.kind === 'video' ? { sources: gif.sources } : { src: gif.src }),
        // the alt is the description with Bluesky's prefix taken off; `authored`
        // separates alt a person wrote from the GIF's own title auto-filled in,
        // which is the duplication the owner reported
        alt: text, altAuthored: authored };
    }
    return { kind: 'external', thumb: e.external.thumb || null, uri: e.external.uri,
      title: e.external.title || null, description: e.external.description || '' }; // v13 decision 31: the card's words
  }
  return undefined;
}

// What an embed QUOTES, whichever wrapper it arrives in. Extracted 2026-09-02
// (self-thread embeds) for the same reason mediaOf was extracted for quote-embed:
// a second copy of this two-line ladder is how the two surfaces drift apart, and
// the hoisted self-thread part needs exactly the same answer the head needs.
function quotedIn(emb) {
  return quotedOf(emb?.$type === 'app.bsky.embed.record#view' ? emb.record
    : emb?.$type === 'app.bsky.embed.recordWithMedia#view' ? emb.record?.record : null);
}

// 3e inbound: what a quote post is quoting. quote-embed (owner, 2026-09-01):
// the quoted record arrives HYDRATED — #viewRecord carries `embeds[]`, the same
// #view unions mediaOf already reads — so the quoted post's picture, video or
// link card is ours for free, and dropping it was why a quote of a video read
// as words alone on both surfaces.
//
// The guard is the $type, not the uri. #viewNotFound, #viewBlocked and
// #viewDetached all carry a uri and no words, and so do the non-post embeds (a
// feed generator, a list, a starter pack, a labeler): keying on `uri` drew every
// one of them as a post card reading "[unknown]" over an empty excerpt. A quote
// whose target is gone is a real state and says so in a word; a quote of a feed
// is not a quoted post at all and shapes to nothing.
const QUOTE_GONE = {
  'app.bsky.embed.record#viewNotFound': 'notFound',
  'app.bsky.embed.record#viewBlocked': 'blocked',
  'app.bsky.embed.record#viewDetached': 'detached',
};
function quotedOf(rec) {
  const gone = QUOTE_GONE[rec?.$type];
  if (gone) return { uri: rec.uri, unavailable: gone };
  if (rec?.$type !== 'app.bsky.embed.record#viewRecord' || !rec.uri) return undefined;
  // The first embed that yields media wins: `embeds` is a list because a record
  // can carry recordWithMedia, and only one of them is ever the picture.
  const media = (rec.embeds || []).reduce((found, e) => found || mediaOf(e), undefined);
  return {
    uri: rec.uri,
    author: rec.author?.handle || '[unknown]',
    // feed-row v2's rule, for the quoted author too (owner, 2026-09-01, on the
    // quote-embed v1 mock: "the name in the quote box … should be the human
    // readable alias name"): the name they CHOSE, null when blank, so the view
    // falls back to the handle rather than printing nothing. The handle stays
    // beside it — it is the identity; the name is only the label, and a display
    // name is not unique.
    authorName: rec.author?.displayName?.trim() || null,
    excerpt: (rec.value?.text || '').slice(0, 200),
    ...(media ? { media } : {}),
  };
}

export function shapeLensPost(post, src, posture = EMPTY_POSTURE) {
  const record = post.record || {};
  const createdTs = Date.parse(record.createdAt || post.indexedAt);
  const labels = new Set((post.labels || []).map((l) => l.val));
  const external = post.embed?.external;
  const text = record.text || '';
  const base = {
    id: post.uri, feedId: src.feedId, feedSlug: src.feedSlug, feedTitle: src.feedTitle,
    ...(src.feedKind ? { feedKind: src.feedKind } : {}),
    format: external ? 'link' : 'text', tagId: null,
    nsfw: [...labels].some((l) => NSFW_LABELS.has(l)), spoiler: false,
    createdTs, createdSec: Math.floor(createdTs / 1000),
    locked: false, pinned: false, edited: false,
    removed: false, deleted: false, held: false,
    // Was `downs: 0` under DL-011 ("lens scores are likes-only"). That
    // tolerance RETIRED 2026-08-27 when the sandbox dropped downvotes too: the
    // two populations agree now, so there is no divergence to pin a zero for.
    likes: post.likeCount ?? 0,
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
    // Phase 4a (plan 2026-08-29 post-and-thread): Save IS Bluesky's private
    // bookmark — viewer.bookmarked on the way in, the createBookmark /
    // deleteBookmark procedures on the way out (D1-verified).
    saved: !!post.viewer?.bookmarked,
    commentCount: post.replyCount ?? 0,
    repostCount: post.repostCount ?? 0,
    quoteCount: post.quoteCount ?? 0, // v12 decision 25: the ⟳ figure is reposts + quotes, bsky.app's
    repostUri: post.viewer?.repost ?? null, // 4a-iii: the unrepost input, like likeUri
    threadMute: !!post.viewer?.threadMuted, // 4b: Mute thread / Unmute thread (named so no "muted" string reaches a shaped board — lens-posture.test pins that)
    // Decision 8 (plan 2026-08-29 post-and-thread): the byline draws the
    // author's PICTURE; null (never undefined) when the account has none, so
    // the component falls back to initials on one check.
    avatar: post.author?.avatar || null,
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
  if (maskedByViewer(post) || posture.mutedDids.has(post.author?.did) || posture.hiddenUris?.has(post.uri)) {
    return { ...base, title: '', body: '', url: '', author: null, authorId: null, maskedRemoved: true, hidden: true };
  }
  if (posture.mutedWords.some((w) => mutedWordHits(w, post))) {
    return { ...base, title: '', body: '', url: '', author: null, authorId: null, maskedRemoved: true, hidden: true };
  }
  // blocks -> mutes -> RING -> display (owner, 2026-09-03). Last, so that
  // anything an earlier policy hid stays hidden whatever the ring says.
  //
  // Absent, not badged, for the same reason a mute is: a row reading "outside
  // your ring" would cost the reader a line of attention and announce exactly
  // what was withheld. `hiddenReason` is a machine token for the ONE caller
  // that has to tell the cases apart — a thread reached by direct link whose
  // root your ring hides needs a different empty state from a post that does
  // not exist. It carries no wording; the view owns that.
  if (outsideRing(post, src, posture)) {
    return { ...base, title: '', body: '', url: '', author: null, authorId: null, hidden: true, hiddenReason: 'scope' };
  }
  // 3e inbound: a quote post carries its quoted original in the embed — the
  // context renders for free (D7); the uri links to the original's thread.
  // 3i: media embeds surface as post.media (card mode renders them; compact
  // and text-only surfaces skip them). recordWithMedia splits into both.
  const emb = post.embed;
  const quoted = quotedIn(emb);
  const media = mediaOf(emb);
  // an image/video-only post titles from its alt text, never renders blank.
  // When even the alt is missing the title is a PLACEHOLDER — a name for
  // surfaces that cannot show the media (compact rows, the thread head) —
  // and the shaper says so, because a surface that renders the media itself
  // shows "[image]" above the actual image otherwise (live 2026-08-28).
  const altTitle = media?.items?.find((i) => i.alt)?.alt;
  const placeholder = !text && !altTitle
    && (media?.kind === 'images' || media?.kind === 'video');
  const displayTitle = text
    || altTitle
    || (media?.kind === 'images' ? '[image]' : media?.kind === 'video' ? '[video]' : text);
  return {
    ...base,
    title: displayTitle, body: text, url: external?.uri || '',
    author: post.author?.handle || '[unknown]', authorId: post.author?.did || null,
    // feed-row v2: the name they chose; null when blank, so a view falls back
    // to the handle instead of printing nothing
    authorName: post.author?.displayName?.trim() || null,
    removedReason: '',
    // 3i: rows never duplicate the title as a preview — bluesky text posts ARE
    // their title (300/300). Thread/comment rendering keeps using body.
    // v13 (E/H): an external post's words are its text, the card is the link — nothing is previewed twice
    preview: '',
    ...(media ? { media } : {}),
    ...(placeholder ? { placeholderTitle: true } : {}),
    ...(quoted ? { quoted } : {}),
    ...(disp?.mode === 'warn' ? { warnLabels: disp.labels } : {}),
  };
}

// 3q: how a thread node is drawn. A quote-response is a top-level thread ON
// the post (the OG post stays the container), so it is MARKED as quoted
// material; a reply is not. `walled` keeps its name from 3q, when the mark was
// a left wall outside the avatar column; since feed-row v14 decision 34 the
// mark is the node's own rail painted in the brand ink (css/app.css,
// `.comment.quote > .avcol .line`). The flag still answers one question: is
// this node quoted material?
export function threadNodeStyle(node) {
  // 3r: marked at ANY depth. A quote can itself be quoted, so the mark says the
  // KIND of material, never its position — a cascade of quotes nests marks the
  // way a cascade of replies nests elbows.
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
    likes: p.likes, myVote: p.myVote, saved: p.saved, cid: p.cid,
    likeUri: p.likeUri, // the unlike input, as on the head post — dropped here until 2026-08-29
    repostCount: p.repostCount, quoteCount: p.quoteCount ?? 0, repostUri: p.repostUri,
    body: p.body, author: p.author, authorId: p.authorId, authorName: p.authorName ?? null, avatar: p.avatar,
    // post-text (2026-09-01): a reply's own facets. The node shape dropped them,
    // so every link, #tag and @mention in every comment on every thread was
    // inert text — the row had been faceted since feed-row v13 and the thread
    // under it had not. The memory tier passes none and renders as it did.
    facets: p.facets || [],
    // reply-embeds (owner, 2026-09-01, on a wordless reply that quoted a
    // picture post): a reply's EMBED is its content. This shape carried the
    // reply's words alone, so every picture, video, link card and quoted post
    // in every thread was dropped here — before any view could decline to draw
    // it. A reply with words lost its picture; a reply with no words but an
    // embed rendered as a byline over an empty row, which is what the owner
    // saw. Same door as every other surface: mediaOf/quotedOf already ran in
    // shapeLensPost, and this simply stops throwing the answer away.
    ...(p.media ? { media: p.media } : {}),
    ...(p.quoted ? { quoted: p.quoted } : {}),
    ...(p.maskedRemoved ? { maskedRemoved: true, title: p.title } : { removedReason: '' }),
    depth,
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
    // A hoisted part is the post's BODY, so it renders like one: its words AND
    // whatever it carried. Until 2026-09-02 this shape was { uri, text, facets }
    // and an author who answered their own post with a picture, a clip, a link
    // card or a GIF had the embed silently dropped — the same drop quote-embed
    // fixed for quoted posts on 2026-09-01, arriving from the other direction.
    // `author` and `id` ride along because mediaNode builds a video's link out
    // of them; without them a hoisted clip linked to undefined/post/undefined.
    selfThread.push({
      uri: chain.post.uri,
      id: chain.post.uri,
      author: chain.post.author?.handle || '[unknown]',
      text: chain.post.record?.text || '',
      facets: chain.post.record?.facets || [],
      media: mediaOf(chain.post.embed),
      quoted: quotedIn(chain.post.embed),
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
      // A quote node's target is ALWAYS the node directly above it — the head
      // post at depth 0, the quote it answers deeper in the cascade — so it
      // carries no quoted card of its own: drawing one would repeat the post
      // the reader is already looking at. Its own media still travels (a quote
      // with a picture of its own is a real shape). `quoted: undefined` is
      // deliberate and not a leftover: node() now sets it for replies, and
      // this is where a quote opts out.
      ...node(p, depth, { kind: 'quote', quoteUri: p.id, quoted: undefined }),
      children: kids,
      deferred: expandable ? 0 : own.length,
    };
  };
  const quoteNodes = (quotes || []).map((q) => buildQuote(q, 0)).filter(Boolean);
  const comments = [...replies, ...quoteNodes].sort(order);
  return { post, perms: LENS_PERMS, sort: 'lens', locked: false, comments, total,
    selfThread, quoteCount: root.post.quoteCount ?? 0 };
}

// Plan 2026-08-28-1: an author-feed/timeline item is an ENVELOPE —
// { post, reply?, reason? } — and reading only item.post is how a reply
// rendered as a post with its conversation unreachable, and a repost rendered
// as a post BY its original author. Pure classification; the view only draws.
// replyTo carries what the envelope already paid for: the parent arrives as a
// full postView (author + text for the context line) or as a
// notFoundPost/blockedPost (uri alone — still enough to link the thread). A
// bare post whose RECORD carries reply refs (search-style wrapping hands us
// {post} only) still classifies, linking by uri alone.
export function feedItemMeta(item) {
  if ((item.reason?.$type || '').endsWith('#reasonRepost')) {
    return { itemKind: 'repost', repostBy: item.reason.by?.handle || null };
  }
  const parent = item.reply?.parent;
  if (parent?.uri) {
    const full = !!parent.record; // postView; notFound/blocked carry no record
    return { itemKind: 'reply', replyTo: { uri: parent.uri,
      author: full ? (parent.author?.handle || null) : null,
      excerpt: full ? (parent.record.text || '').slice(0, 200) : '' } };
  }
  const recParent = item.post?.record?.reply?.parent;
  if (recParent?.uri) {
    return { itemKind: 'reply', replyTo: { uri: recParent.uri, author: null, excerpt: '' } };
  }
  return { itemKind: 'post' };
}

// One bsky feed page -> our feed result shape.
export function shapeLensFeed(feedResponse, src, { sort = 'lens', timeframe = 'all' } = {}, posture = EMPTY_POSTURE) {
  const posts = (feedResponse.feed || [])
    .filter((item) => !posture.blockedDids.has(item.post?.author?.did)) // blocked: never renders
    .map((item) => ({ ...shapeLensPost(item.post, src, posture), ...feedItemMeta(item) }))
    .filter((p) => !p.hidden); // label-hidden: dropped from lists
  return {
    scope: `lens:${src.feedSlug}`, sort, timeframe,
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
  if (!['feed', 'new', 'top', 'hot'].includes(sort)) {
    throw new Error(`unknown window sort: ${sort} (known: feed, new, top, hot)`);
  }
  if (sort === 'feed') return posts;
  let window = posts;
  // the window applies to the score-ranked sorts — top, and hot (plan
  // 2026-08-29 post-and-thread, decision 9: engagement over the loaded window)
  if ((sort === 'top' || sort === 'hot') && timeframe !== 'all') {
    const span = TIMEFRAME_MS[timeframe];
    if (!span) throw new Error(`unknown timeframe: ${timeframe} (known: day, week, month, year, all)`);
    const cutoff = nowMs - span;
    window = posts.filter((p) => p.createdTs >= cutoff);
  }
  if (sort === 'hot') {
    // shaped posts carry createdSec; a caller that only has createdTs gets it derived
    const items = window.map((p) => (p.createdSec != null ? p : { ...p, createdSec: Math.floor(p.createdTs / 1000) }));
    return sortItems(items, 'hot', Math.floor(nowMs / 1000));
  }
  return [...window].sort((a, b) => (sort === 'new' ? b.createdTs - a.createdTs : b.likes - a.likes));
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
// 4h: what a compact `f/…` link calls a registered source — the NAME, falling
// back to the slug. It ended up showing a record key (owner, 2026-08-26)
// because the sidebar reached for `slug` while every other surface used
// `title`.
//
// A name here is a FALLBACK held in the registry, not the truth: the network
// owns these names and changes them. Both hardcoded entries were already wrong
// when this was written — the generator at rkey `whats-hot` reports
// "Discover", and the account at `bsky.app` reports "Bluesky", not the
// "What's Hot" and "Bluesky Team" this repo had been shipping. The rkey and
// the handle stay the route, the href and the title attribute; they are
// identifiers, not labels. e2e/curated-names-live.workflow.mjs (LIVE=1) is what
// notices when a fallback drifts again.
//
// Authors were briefly special-cased to their handle, on the grounds that
// handles are unique and stable where display names are neither. The owner
// overruled it: that argument is about identifiers, and a sidebar is for
// reading. The identifier is still one hover away.
export function sourceLabel(entry) {
  const label = entry && (entry.title || entry.slug);
  if (!label) throw new Error(`sourceLabel needs a source entry with a title or a slug (got ${JSON.stringify(entry)})`);
  return label;
}

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
//
// v11 (owner, 2026-09-01): a feed whose description is written TO an account —
// Discover's "Trending content from your personal network" — is describing a
// result a signed-out reader is not getting, because there is no network of
// theirs to trend over. Quoting it at a guest is the one case where DL-025's
// "render the feed's own words verbatim" states something false, so signed out
// those feeds show no description at all rather than a substituted one: we do
// not know what the generator serves a viewerless request, and inventing a
// sentence about it would trade one false claim for another.
//
// A SET of uris, not a heuristic over the prose. A "does it say 'your'?" rule
// would have caught this string and also caught every feed that merely writes
// in the second person, and the owner's instruction was explicit that this is
// about Discover and not about descriptions in general.
// e2e/curated-names-live.workflow.mjs (LIVE=1) is where a drift in this
// description would surface, the same way it surfaces a drifted name.
export const GUEST_BLIND_BLURBS = new Set([
  'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot',
]);

export function feedCardModel(info, { signedIn = true } = {}) {
  const a = affordanceFor({ kind: 'feed', info });
  const blurbHidden = !signedIn && GUEST_BLIND_BLURBS.has(info.uri);
  return {
    avatar: info.avatar || null,
    headline: a.headline,
    // feed-row v7: the curator, and where they live — the card links them out
    creator: info.creator || null,
    // v11 (owner: "is there a human readable version?"): there is, and it is
    // the account's OWN displayName — probed 2026-09-01, bsky.app reports
    // "Bluesky". Not "Bluesky Team", which this repo shipped for a while and
    // the account has never called itself (the same drift sourceLabel records
    // above). The handle stays the link and the hover: a card is for reading,
    // the identifier is one pointer away.
    creatorName: info.creatorName || null,
    creatorUrl: info.creator ? `https://bsky.app/profile/${encodeURIComponent(info.creator)}` : null,
    likeCount: info.likeCount || 0,
    blurb: blurbHidden ? null : a.detail,
    blurbIsOwnWords: Boolean(info.description),
    degraded: info.online === false || info.valid === false,
  };
}

// OQ1: a lens Feed's slug is the feed/list rkey (or the author handle).
const slugForSource = (source) => {
  if (source.kind === 'author') return source.actor;
  if (source.kind === 'timeline') return 'following';
  return source.uri.split('/').pop();
};

// A lens over the AppView. Guest (no session): the unauth-200 surface only.
// With a session — the OAUTH shape { did, handle, fetchHandler } from
// js/auth/session.js — every read flows through the DPoP-bound fetchHandler
// with a RELATIVE /xrpc path (the library owns auth headers, tokens, and
// refresh; the lens builds none of it) and the personal surfaces (feeds,
// search, timeline) open up.
// THE write pair (DL-013): boost = a real Bluesky like.
const LIKE_COLLECTION = 'app.bsky.feed.like';
const FOLLOW_COLLECTION = 'app.bsky.graph.follow';

// 3w: THE publish write. The second kind of record the lens creates, and the
// one that makes Forage a forum rather than a reader. Deliberately narrow:
// our own repo, this one collection, a record built by the pure composer, and
// no deletes — nothing here can remove anything. test/invariants.test.js pins
// the count so a third kind cannot appear unnoticed.
const POST_COLLECTION = 'app.bsky.feed.post';

// P5: THE EIGHTH WRITE, and the first record type Forage defined for itself
// that actually reaches a repo. It is argued for in docs/LEXICON-REGISTER.md
// § fyi.forage.tagsub: across the official lexicons a subscription always
// points at a thing that EXISTS — a record or an identity — and a hashtag is
// neither, it is a query. Deliberately narrow, like the two above it: our own
// repo, this one collection, create and delete only — it edits nothing.
const TAGSUB_COLLECTION = 'fyi.forage.tagsub';
// Phase 4a (plan 2026-08-29 post-and-thread, decision 3): the ⋯ menu's writes.
// A block is a RECORD — public, visible to the blocked account, which is why
// the menu item's copy says so — where a mute is a private procedure.
const BLOCK_COLLECTION = 'app.bsky.graph.block';
// 4a-iii (O6): the ⟳ on a quote is a real repost, the like pair's shape.
const REPOST_COLLECTION = 'app.bsky.feed.repost';

// 4b (O5): "Mute words & tags" writes Bluesky's OWN mutedWordsPref — the store
// the label promises (app.bsky.actor.defs#mutedWord: value + targets, verified
// against the lexicon 2026-08-29). A leading # means a tag mute; a bare word
// mutes text and tags, the official app's default. Pure; read-modify-write so
// nothing else in the blob is disturbed. Returns null when already muted.
export function withMutedWord(preferences, word) {
  const raw = String(word || '').trim();
  const isTag = raw.startsWith('#');
  const value = isTag ? raw.slice(1) : raw;
  if (!value) return null;
  const type = 'app.bsky.actor.defs#mutedWordsPref';
  const existing = preferences.find((p) => p.$type === type);
  if ((existing?.items || []).some((i) => i.value.toLowerCase() === value.toLowerCase())) return null;
  const item = { value, targets: isTag ? ['tag'] : ['content', 'tag'], actorTarget: 'all' };
  if (!existing) return [...preferences, { $type: type, items: [item] }];
  return preferences.map((p) => (p === existing ? { ...p, items: [...(p.items || []), item] } : p));
}

// 4b: the six reasons a person can pick, mapped to the lexicon's reasonType
// (com.atproto.moderation.defs, verified 2026-08-29). Ozone's finer taxonomy is
// deliberately not offered — those are a moderation service's words.
export const REPORT_REASONS = Object.freeze({
  spam: 'com.atproto.moderation.defs#reasonSpam',
  rude: 'com.atproto.moderation.defs#reasonRude',
  violation: 'com.atproto.moderation.defs#reasonViolation',
  misleading: 'com.atproto.moderation.defs#reasonMisleading',
  sexual: 'com.atproto.moderation.defs#reasonSexual',
  other: 'com.atproto.moderation.defs#reasonOther',
});

export function createLens({ session = null, transport = fetch, hiddenUris = new Set() } = {}) {
  // hiddenUris rides on the posture so the shape layer applies it like a mute;
  // the caller owns persisting it (a substrate never reaches for localStorage).
  let posture = { ...EMPTY_POSTURE, hiddenUris };
  // 3x: rings are expensive — mutuals+1 is one getFollows per mutual, so a
  // full ring is 26+ graph reads before a single post loads, and it was paid
  // again on every visit to the dial. The follow graph changes slowly, so the
  // answer is remembered for the life of this lens (i.e. this session on this
  // device; a sign-out builds a new lens). The PROMISE is cached, not the
  // result, so two callers racing a cold ring share one computation — and a
  // rejected promise is dropped, because a transient 502 must never be
  // remembered as an empty ring.
  const ringCache = new Map();
  // The GRAPH is cached separately from the sets derived from it, because the
  // same walk now answers two questions — the capped board set and the uncapped
  // filter set — and a reader who scopes the site to their follows should not
  // pay for getFollows twice to find that out.
  const graphCache = new Map();

  async function post(path, body, verb) {
    if (!session) throw new Error(`lens: ${verb} needs a session — sign in first`);
    const res = await session.fetchHandler(`/xrpc/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`lens: ${verb} failed HTTP ${res.status}`);
    return res.json();
  }

  // A write PROCEDURE: a 200 with an empty body is success (bookmarks and
  // mutes answer exactly that — D1/D2-verified), so unlike post() this never
  // parses a body. test/invariants.test.js pins every caller by name.
  async function call(path, body, verb) {
    if (!session) throw new Error(`lens: ${verb} needs a session — sign in first`);
    const res = await session.fetchHandler(`/xrpc/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`lens: ${verb} failed HTTP ${res.status}`);
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
    // feedKind rides along so a view can link a row back to the KIND of board
    // it came from — an author board's rows link `/u/<handle>`, not a feed
    // path nothing resolves (feed-row v1, 2026-08-30: forage.fyi/f/pds.ls)
    return { feedId: `lens:${slug}`, feedSlug: slug, feedTitle: title || slug, feedKind: source.kind };
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
      if (slug) { src.feedSlug = slug; src.feedId = `lens:${slug}`; } // 3i: display slug override
      return { ...shapeLensFeed(data, src, {}, posture), ...src };
    },

    // 3f: pull the account's whole moderation posture (one round per session
    // entry). Guests keep the permissive default; failures throw with words —
    // the caller decides whether to run unfiltered.
    async loadPosture() {
      if (!session) { posture = { ...EMPTY_POSTURE, hiddenUris }; return posture; }
      const [prefs, mutes, blocks, listMutes, listBlocks] = await Promise.all([
        get('app.bsky.actor.getPreferences'),
        get('app.bsky.graph.getMutes', { limit: 100 }),
        get('app.bsky.graph.getBlocks', { limit: 100 }),
        get('app.bsky.graph.getListMutes', { limit: 100 }),
        get('app.bsky.graph.getListBlocks', { limit: 100 }),
      ]);
      posture = { ...buildPosture({
        preferences: prefs.preferences, mutes: mutes.mutes, blocks: blocks.blocks,
        listMutes: listMutes.lists, listBlocks: listBlocks.lists,
      }, Date.now()), hiddenUris };
      return posture;
    },
    posture: () => posture,
    // 4b "Hide for me": local, immediate, no request. Returns the set so the
    // caller can persist it.
    hide(uri, on) {
      if (on) hiddenUris.add(uri); else hiddenUris.delete(uri);
      return hiddenUris;
    },
    // 4b: Report — a procedure to the account's moderation service, with a
    // strongRef subject. Refuses an unknown reason before any request.
    async report({ uri, cid }, reasonKey, detail = '') {
      const reasonType = REPORT_REASONS[reasonKey];
      if (!reasonType) throw new Error(`lens: not a report reason: ${JSON.stringify(reasonKey)}`);
      await call('com.atproto.moderation.createReport', {
        reasonType, reason: String(detail || ''),
        subject: { $type: 'com.atproto.repo.strongRef', uri, cid },
      }, 'report');
    },

    // 3r: the thread, then its quote cascade. The cascade is opt-in (onCascade)
    // and lands AFTER the first paint — a quote of a quote is worth showing,
    // never worth waiting for. Each level costs requests, so two things bound
    // it: QUOTE_CASCADE_DEPTH, and the counts the appview already gave us —
    // a quote reporting no replies and no quotes is never asked about.
    async thread(uri, src, { onCascade } = {}) {
      const source = src || { feedId: 'lens:thread', feedSlug: 'thread', feedTitle: 'Thread' };
      let [data, quotesRes] = await Promise.all([
        get('app.bsky.feed.getPostThread', { uri, depth: 10 }),
        get('app.bsky.feed.getQuotes', { uri, limit: 50 }).catch(() => null), // degrade, never break the thread
      ]);
      // Phase 13 (plan 2026-08-29 post-and-thread, decision 10): a reply uri
      // used to open as an orphan root. If the fetched head is itself a reply,
      // the page is its ROOT's thread and the reply is the focus — Reddit's
      // shape, one meaning of "the thread". The response's own parent chain is
      // still discarded; the root refetch is the whole thread from the top.
      let focus;
      const rootUri = data.thread?.post?.record?.reply?.root?.uri;
      if (rootUri && rootUri !== uri) {
        console.info(`forage: /p opened on a reply — showing its thread from ${rootUri}`);
        try {
          [data, quotesRes] = await Promise.all([
            get('app.bsky.feed.getPostThread', { uri: rootUri, depth: 10 }),
            get('app.bsky.feed.getQuotes', { uri: rootUri, limit: 50 }).catch(() => null),
          ]);
        } catch (e) {
          throw new Error(`lens: this reply's root (${rootUri}) could not be loaded — ${e.message}`);
        }
        focus = uri;
      }
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
      return focus ? { ...shape(), focus } : shape();
    },

    // The lens Feeds list: pinned/saved feeds + lists from preferences,
    // display names resolved through getFeedGenerators. Session-only.
    async feeds() {
      if (!session) throw new Error('lens: Feeds come from your saved feeds — needs a session');
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
      // World has no member list — null means "do not filter", where [] would
      // mean "filter to nobody". js/rings.js owns that distinction.
      if (ring === 'world') return Promise.resolve({ members: null });
      if (!RUNG_IDS.includes(ring)) {
        return Promise.reject(new Error(`lens: unknown rung: ${ring} (known: ${RUNG_IDS.join(', ')})`));
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
    forgetRings() { ringCache.clear(); graphCache.clear(); },

    // The graph walk, cached by ringMembers above. This function FETCHES; it
    // does not decide what a rung means — js/rings.js does, purely, which is
    // what let the containment property be tested without a network.
    //
    // The second hop is fetched only for the rung that needs it. Every tighter
    // rung is a union over data the first two calls already returned, so 'me',
    // 'mut' and 'fol' cost exactly two requests between them.
    async computeRing(ring) {
      return membersFor(ring, await this.ringGraph(ring === 'hop'));
    },

    // The uncapped set, for the display scope (plan 2026-09-03). Same walk,
    // different consumer: RING_CAP bounds the board's one-request-per-member
    // fan-out, and a filter fans out nothing, so carrying the cap here would
    // silently stop a reader with 300 follows from seeing 275 of them.
    scopeMembersFor(scope) {
      if (scope === 'world') return Promise.resolve({ members: null });
      if (!RUNG_IDS.includes(scope)) {
        return Promise.reject(new Error(`lens: unknown rung: ${scope} (known: ${RUNG_IDS.join(', ')})`));
      }
      if (!session) return Promise.reject(new Error('lens: rings are computed from YOUR graph — needs a session'));
      const key = `scope:${scope}`;
      const cached = ringCache.get(key);
      if (cached) return cached;
      const pending = this.ringGraph(scope === 'hop')
        .then((graph) => scopeMembers(scope, graph))
        .catch((e) => { ringCache.delete(key); throw e; }); // a failure is not an answer
      ringCache.set(key, pending);
      return pending;
    },

    // The walk itself, cached. The second hop is fetched only for the rung that
    // needs it: every tighter rung is a union over data the first two calls
    // already returned, so 'me', 'mut' and 'fol' cost exactly two requests
    // between them. A hop graph is a superset of a base one, so a base caller
    // arriving after a hop caller reuses it rather than re-walking.
    ringGraph(needsHop) {
      const key = needsHop ? 'hop' : 'base';
      const cached = graphCache.get(key) || (needsHop ? null : graphCache.get('hop'));
      if (cached) return cached;
      const pending = (async () => {
        const [follows, followers] = await Promise.all([
          pagedGraph('getFollows', session.did),
          pagedGraph('getFollowers', session.did),
        ]);
        const hopFollows = new Map();
        if (needsHop) {
          for (const m of computeMutuals(follows, followers)) {
            hopFollows.set(m, await pagedGraph('getFollows', m));
          }
        }
        return { me: session.did, follows, followers, hopFollows };
      })().catch((e) => { graphCache.delete(key); throw e; });
      graphCache.set(key, pending);
      return pending;
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
    async ringFeed(ring, { cursor, onPage, timeoutMs = 8000, tags = [] } = {}) {
      // WHY 'fol' DELEGATES INSTEAD OF FANNING OUT, stated because it is the
      // one place the ladder's set and the board's FETCH differ. js/rings.js
      // defines 'fol' as me ∪ mutuals ∪ everyone I follow. Fanning out over
      // that set would be one getAuthorFeed per follow — hundreds of requests
      // for an ordinary account, which is the cost RING_CAP exists to bound and
      // is why 'hop' is capped at all. `getTimeline` is the network's own answer
      // to the same question in ONE request, so the rung is fetched that way.
      //
      // The honest consequence: containment is a property of the MEMBER SETS
      // (proven in test/rings.test.js), not of the rendered boards, because the
      // timeline is Bluesky's composed following feed rather than a literal
      // union of author feeds. Every other rung fans out and is literal. If
      // that difference ever matters to a reader, the fix is to say so on the
      // board, not to make the fan-out unaffordable.
      if (ring === 'fol') {
        const board = await this.feed({ kind: 'timeline' }, { title: 'My follows' });
        return { ...board, ring, failures: [] };
      }
      // V3: World is the widest rung, and the only one whose members are not
      // people. It draws the COMPOSITION — your timeline plus every feed you
      // have saved — merged and unsqueezed. That is what the owner's
      // definition requires: "everybody's interactions on this combination of
      // my own posts, my follows posts, my mutuals, and like feeds I follow".
      // Not the firehose: the composition is the boundary, which is why
      // nothing global is fetched here.
      //
      // Same failure discipline as the member fan-out: one dead source is
      // NAMED and the rest of the board still paints. A composition of nothing
      // is an empty board, not an error — a reader who has saved no feeds and
      // follows nobody has an empty world, honestly.
      if (ring === 'world') {
        if (!session) throw new Error('lens: World is your composition — needs a session');
        const saved = await this.feeds().catch(() => []);
        // Subscribed hashtags are PASSED IN rather than read here: they live
        // in device storage (js/tagsubs.js) and a substrate that reaches for
        // localStorage is a substrate that cannot be replayed or tested
        // headlessly. The caller knows them; this only knows how to weave.
        const sources = [
          { key: 'timeline', source: { kind: 'timeline' }, title: 'Following' },
          ...saved.filter((f) => f.kind === 'feed')
            .map((f) => ({ key: f.slug || f.id, source: { kind: 'feed', uri: f.id }, title: f.title })),
          ...tags.map((t) => ({ key: `h:${t}`, stream: { kind: 'hashtag', key: t }, title: `#${t}` })),
        ];
        const failures = [];
        const pages = await Promise.all(sources.map(async (s) => {
          try {
            const b = s.stream
              ? await this.stream(s.stream)
              : await this.feed(s.source, { title: s.title, slug: s.key });
            if (onPage && b.posts.length) onPage(b.posts);
            return b.posts;
          } catch { failures.push(s.key); return []; }
        }));
        const posts = pages.flat().sort((x, y) => {
          const t = String(y.createdTs).localeCompare(String(x.createdTs));
          if (t) return t;
          const a = String(x.author).localeCompare(String(y.author));
          return a || String(x.id).localeCompare(String(y.id));
        });
        return { posts, ring, failures, feedTitle: 'World', feedSlug: 'ring:world', cursor: null };
      }
      const resumed = cursor ? JSON.parse(atob(cursor)) : null;
      const ringInfo = resumed ? { members: Object.keys(resumed.m) } : await this.ringMembers(ring);
      const cursors = resumed ? resumed.m : Object.fromEntries((ringInfo.members ?? []).map((d) => [d, undefined]));
      const failures = [];
      const src0 = { feedId: `lens:ring:${ring}`, feedSlug: `ring:${ring}`, feedTitle: labelFor(ring) };
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
          onPage(items.map((i) => ({ ...shapeLensPost(i.post, src0, posture), ...feedItemMeta(i) }))
            .filter((p) => !p.hidden));
        }
        return { did, items, next: data.cursor };
      }));
      const items = pages.flatMap((p) => p.items);
      // A repost merges at its REPOST time (reason.indexedAt) — the network's
      // own author-feed order — never the original post's, which would sink a
      // fresh repost of an old post to the bottom of the board (plan 2026-08-28-1).
      const mergeTs = (i) => i.reason?.indexedAt || i.post.indexedAt;
      items.sort((x, y) => {
        const t = String(mergeTs(y)).localeCompare(String(mergeTs(x)));
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

    // ---- Phase 4a: the ⋯ menu's writes (plan 2026-08-29 post-and-thread) ----
    // Save = Bluesky's private, server-side bookmark. No record, no repo write;
    // getBookmarks is the only reader and it needs auth.
    async bookmark(uri, cid, on) {
      if (on) await call('app.bsky.bookmark.createBookmark', { uri, cid }, 'bookmark');
      else await call('app.bsky.bookmark.deleteBookmark', { uri }, 'unbookmark');
    },
    async muteActor(did, on) {
      if (on) await call('app.bsky.graph.muteActor', { actor: did }, 'mute');
      else await call('app.bsky.graph.unmuteActor', { actor: did }, 'unmute');
    },
    async muteThread(rootUri, on) {
      if (on) await call('app.bsky.graph.muteThread', { root: rootUri }, 'mute thread');
      else await call('app.bsky.graph.unmuteThread', { root: rootUri }, 'unmute thread');
    },
    // A block is a record in MY repo. Refused before any request when the
    // subject is me — the guard holds when block() is called directly, the
    // deletePost pattern.
    async block(did) {
      if (!session) throw new Error('lens: blocking needs a session — sign in first');
      if (did === session.did) throw new Error('lens: you cannot block yourself');
      const data = await post('com.atproto.repo.createRecord', {
        repo: session.did, collection: BLOCK_COLLECTION,
        record: { $type: BLOCK_COLLECTION, subject: did, createdAt: new Date().toISOString() },
      }, 'block');
      return { blockUri: data.uri };
    },
    async unblock(blockUri) {
      if (!session) throw new Error('lens: unblocking needs a session — sign in first');
      const m = /^at:\/\/(did:[^/]+)\/app\.bsky\.graph\.block\/([^/]+)$/.exec(String(blockUri || ''));
      if (!m || m[1] !== session.did) throw new Error('lens: that block record is outside your repo');
      const parsed = { did: m[1], rkey: m[2] };
      await post('com.atproto.repo.deleteRecord', {
        repo: session.did, collection: BLOCK_COLLECTION, rkey: parsed.rkey,
      }, 'unblock');
    },
    // 4a-iii (O6): repost — the like pair's shape on app.bsky.feed.repost.
    async repost(uri, cid) {
      const data = await post('com.atproto.repo.createRecord', {
        repo: session?.did, collection: REPOST_COLLECTION,
        record: { $type: REPOST_COLLECTION, subject: { uri, cid }, createdAt: new Date().toISOString() },
      }, 'repost');
      return { repostUri: data.uri };
    },
    async unrepost(repostUri) {
      const rkey = repostUri.split('/').pop();
      await post('com.atproto.repo.deleteRecord', {
        repo: session?.did, collection: REPOST_COLLECTION, rkey,
      }, 'unrepost');
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

    async publish({ text, tag, langs, navLang, images, replyTo, quote } = {}) {
      if (!session) throw new Error('lens: publishing needs a session — sign in first');
      const record = buildPost({ text: tag ? withTag(text, tag) : text, langs, navLang, images, replyTo, quote });
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
    // feed-row v7 (owner, 2026-08-31): Follow, on the profile page. One record in
    // MY repo naming the account by did; unfollow deletes it (the like's shape).
    async follow(did) {
      const data = await post('com.atproto.repo.createRecord', {
        repo: session?.did, collection: FOLLOW_COLLECTION,
        record: { $type: FOLLOW_COLLECTION, subject: did, createdAt: new Date().toISOString() },
      }, 'follow');
      return { followUri: data.uri };
    },
    async unfollow(followUri) {
      const rkey = followUri.split('/').pop();
      return post('com.atproto.repo.deleteRecord', {
        repo: session?.did, collection: FOLLOW_COLLECTION, rkey,
      }, 'unfollow');
    },

    // P5: your published hashtag subscriptions. The repo IS the set — that is
    // what makes "published means synced" true across every Forage client, and
    // it is why js/tagsubs-pds.js treats its own cache as display only.
    // Paginated, because a reader with a hundred subscriptions is a reader we
    // would otherwise silently truncate.
    async tagSubs() {
      if (!session) throw new Error('lens: reading your saved hashtags needs a session — sign in first');
      const out = [];
      let cursor;
      do {
        const data = await get('com.atproto.repo.listRecords', {
          repo: session.did, collection: TAGSUB_COLLECTION, limit: 100, cursor,
        });
        for (const r of data.records || []) {
          out.push({ tag: r.value?.tag, rkey: String(r.uri || '').split('/').pop(), createdAt: r.value?.createdAt });
        }
        cursor = data.cursor;
      } while (cursor);
      return out;
    },

    // Publish one subscription. The rkey comes back because Remove needs it and
    // a refetch to learn your own write is a round trip for nothing.
    async saveTagSub(tag) {
      if (!session) throw new Error('lens: saving a hashtag needs a session — sign in first');
      const data = await post('com.atproto.repo.createRecord', {
        repo: session.did, collection: TAGSUB_COLLECTION,
        record: { $type: TAGSUB_COLLECTION, tag, createdAt: new Date().toISOString() },
      }, 'save hashtag');
      return { uri: data.uri, rkey: String(data.uri || '').split('/').pop() };
    },

    // Unpublish one subscription. Its ABSENCE is the deletion — there is no
    // tombstone, because no client keeps a merged list to reconcile against.
    async removeTagSub(rkey) {
      if (!session) throw new Error('lens: removing a hashtag needs a session — sign in first');
      return post('com.atproto.repo.deleteRecord', {
        repo: session.did, collection: TAGSUB_COLLECTION, rkey,
      }, 'remove hashtag');
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
        const src = { feedId: `lens:h:${key}`, feedSlug: `h:${key}`, feedTitle: `#${key}` };
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
        // v11: the curator's own name, for the card to READ out. Null when the
        // account has never set one — the handle is then the only name it has.
        creatorName: v.creator?.displayName || null,
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
    // 4b (O5): the THIRD preferences write — see withMutedWord.
    async muteWord(word) {
      if (!session) throw new Error('lens: muting a word needs a session — sign in first');
      const prefs = await get('app.bsky.actor.getPreferences');
      const next = withMutedWord(prefs.preferences || [], word);
      if (!next) return false;
      await post('app.bsky.actor.putPreferences', { preferences: next }, 'mute word');
      return true;
    },

    // 3k: a user's profile card — the persistent /u/<handle> surface. Read
    // only: editing lives on bsky.app (the lens tenet).
    async profile(actor) {
      const v = await get('app.bsky.actor.getProfile', { actor });
      return {
        did: v.did, handle: v.handle, displayName: v.displayName || v.handle,
        avatar: v.avatar || null, banner: v.banner || null, description: v.description || '',
        followers: v.followersCount ?? 0, following: v.followsCount ?? 0, posts: v.postsCount ?? 0,
        followingUri: v.viewer?.following || null, // feed-row v7: my follow of them, if any
        verified: v.verification?.verifiedStatus === 'valid' ? 'valid'
          : v.verification?.trustedVerifierStatus === 'valid' ? 'trusted' : null,
      };
    },

    async search(q, { limit = 30 } = {}) {
      if (!session) throw new Error('lens: search needs a session (403 unauth — probe-verified)');
      const data = await get('app.bsky.feed.searchPosts', { q, limit });
      const src = { feedId: 'lens:search', feedSlug: 'search', feedTitle: `Search: ${q}` };
      return { posts: (data.posts || [])
        .filter((p) => !posture.blockedDids.has(p.author?.did))
        .map((p) => shapeLensPost(p, src, posture))
        .filter((p) => !p.hidden) };
    },
  };
}
