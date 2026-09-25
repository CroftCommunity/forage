// A raw `app.bsky.feed.post` record → the post VIEW the lens already shapes (plan
// 2026-09-14-plan-clips, Phase 6; owner 2026-09-25: "we want the pds walker path to be
// viable for all content and formats — I'm not sure why it would even be different
// here"). Pure: no network, no clock. The substrate (js/substrates/pds-posts.js) lists
// the records and resolves the author; this file only translates.
//
// EVERY URL IS DERIVED FROM THE RECORD'S OWN BLOB CIDS, on the network's own
// patterns — probed against the AppView's hydration on 2026-09-14 (video) and
// 2026-09-25 (pictures, avatars): the view's `playlist`, `thumbnail`, `thumb`,
// `fullsize` and `avatar` are exactly these strings. If Bluesky moves its CDN the
// tests here go red, which is the point of pinning them (CLAUDE.md § External APIs:
// never a pattern that was not confirmed).
//
// WHAT A RECORD CANNOT SAY. Like, reply and repost counts are the network's answer
// to a post, and a repo does not hold them; labels are a labeler's records, not the
// author's. So a view built here carries NO counts and NO labels — `undefined`, never
// zero — and says `viaPds: true`, so the lens can hydrate them from the AppView when it
// answers and say they are unknown when it does not (ADR-002's second reason, stated
// on the surface rather than hidden behind a zero).

const CDN = 'https://cdn.bsky.app/img';
const VIDEO = 'https://video.bsky.app/watch';

export const imageUrl = (did, cid, preset) => `${CDN}/${preset}/plain/${did}/${cid}`;
export const avatarUrl = (did, cid) => imageUrl(did, cid, 'avatar');
export const videoUrls = (did, cid) => ({
  playlist: `${VIDEO}/${encodeURIComponent(did)}/${cid}/playlist.m3u8`,
  thumbnail: `${VIDEO}/${encodeURIComponent(did)}/${cid}/thumbnail.jpg`,
});

// The handle is the DID document's `at://` alias (the first one is the handle the
// account presents); a document without one gives null and the lens prints the did.
export function handleFromDoc(doc) {
  const aka = (doc?.alsoKnownAs || []).find((a) => typeof a === 'string' && a.startsWith('at://'));
  return aka ? aka.slice('at://'.length) : null;
}

const cidOf = (blob) => blob?.ref?.$link || null;

// The media half of a record's embed, whichever wrapper it arrives in — the same
// two-line ladder mediaOf walks over VIEWS (js/substrates/lens.js).
function mediaOf(record) {
  const e = record?.embed;
  if (!e) return null;
  const m = e.$type === 'app.bsky.embed.recordWithMedia' ? e.media : e;
  if (m?.$type === 'app.bsky.embed.video' || m?.$type === 'app.bsky.embed.images') return m;
  return null;
}

// The AppView's author-feed filters, over a raw record. Only the two the reel uses are
// mirrored; the rest refuse by name rather than quietly matching everything.
export function matchesFilter(record, filter) {
  if (filter !== 'posts_with_video' && filter !== 'posts_with_media') throw new Error(`pds-posts: ${filter} is not a filter this path mirrors`);
  if (record?.reply) return false; // both filters exclude replies (the network's behaviour, lexicon: "posts_with_*")
  const m = mediaOf(record);
  if (!m) return false;
  if (filter === 'posts_with_video') return m.$type === 'app.bsky.embed.video';
  return true; // media: pictures AND clips (0f measured 444 clips inside 1,774 "media" posts)
}

function embedView(did, record) {
  const m = mediaOf(record);
  if (!m) return undefined;
  if (m.$type === 'app.bsky.embed.video') {
    const cid = cidOf(m.video);
    return { $type: 'app.bsky.embed.video#view', cid, ...videoUrls(did, cid),
      ...(m.aspectRatio ? { aspectRatio: m.aspectRatio } : {}), ...(m.alt ? { alt: m.alt } : {}) };
  }
  return { $type: 'app.bsky.embed.images#view',
    images: (m.images || []).map((i) => {
      const cid = cidOf(i.image);
      return { thumb: imageUrl(did, cid, 'feed_thumbnail'), fullsize: imageUrl(did, cid, 'feed_fullsize'), alt: i.alt || '',
        ...(i.aspectRatio ? { aspectRatio: i.aspectRatio } : {}) };
    }) };
}

// `author`: { handle, displayName, avatarCid } from the DID document and the profile
// record (`app.bsky.actor.profile/self`), resolved by the substrate and cached per did.
export function recordToView({ did, rkey, cid, record, author = {} }) {
  const embed = embedView(did, record);
  return {
    uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid,
    author: { did, handle: author.handle || did, displayName: author.displayName || null,
      avatar: author.avatarCid ? avatarUrl(did, author.avatarCid) : null },
    record,
    indexedAt: record?.createdAt || null,
    ...(embed ? { embed } : {}),
    viaPds: true,
  };
}
