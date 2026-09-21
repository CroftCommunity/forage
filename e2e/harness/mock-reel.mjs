// The view-modes population (plan 2026-09-14-plan-clips, mock v3). The board
// fixture (mock-board.mjs) plus what a reel is judged under (MOCKS.md P2): three
// clips at three shapes — a portrait, a landscape, a square with alt text a
// person wrote and the longest words on the board — beside the board's two
// picture posts (a portrait single and a four-picture post that folds into the
// carousel), so clip mode has to frame three aspect ratios and gram mode has
// to frame a carousel. Everything else on the board stays: the text posts,
// the link cards, the reply and the repost are what the kind filter must drop.
//
// The clips' playlists point at a fenced host: a frame proves the shape and
// the press, never playback (e2e/video-playback.workflow.mjs holds the player).
import { FEED as BOARD_FEED, RESPONSES as BOARD_RESPONSES, BOARD_PATH } from './mock-board.mjs';

export { BOARD_PATH };

const base = BOARD_FEED.feed.find((it) => it.post.uri.endsWith('/clip')).post;
const AV = base.author.avatar;
const clip = (rkey, handle, text, { width, height }, { likes = 0, replies = 0, reposts = 0, alt = null, ts = '2026-08-30T02:30:00Z' } = {}) => ({
  ...base,
  uri: `at://did:plc:${rkey}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`,
  author: { did: `did:plc:${rkey}`, handle, avatar: AV },
  record: { ...base.record, text, facets: [] }, indexedAt: ts,
  likeCount: likes, replyCount: replies, repostCount: reposts,
  embed: { $type: 'app.bsky.embed.video#view', cid: `cid-video-${rkey}`,
    playlist: `https://video.cdn.test/${rkey}/playlist.m3u8`, thumbnail: base.embed.thumbnail,
    aspectRatio: { width, height }, ...(alt ? { alt } : {}) },
});

export const LANDSCAPE = clip('wide', 'peatlandrestoration.bsky.social',
  'Two hours of the drainage board meeting cut to ninety seconds. The bit where the chair says the sphagnum "will be fine" is at 0:41.',
  { width: 1920, height: 1080 }, { likes: 1284, replies: 40, reposts: 212 });
export const SQUARE = clip('sq', 'averyveryverylonghandle.bsky.social',
  'Sundew closing on a fly, one frame every four seconds for an hour. No sound, nothing happens for the first twenty seconds, and then it does. #bog #sundew #timelapse #peatland #carnivorousplants',
  { width: 1080, height: 1080 }, { likes: 9, replies: 1, reposts: 0,
    alt: 'A time-lapse: a round-leaved sundew, red and glistening, slowly folds its tentacles over a small fly against a background of green sphagnum moss.' });

// The board's own order, with the two new clips where they would fall by time.
export const FEED = { feed: [
  ...BOARD_FEED.feed.slice(0, 3),      // quote, youtube, clip (portrait)
  { post: LANDSCAPE },
  ...BOARD_FEED.feed.slice(3, 7),      // book, plain, reply, repost
  { post: SQUARE },
  ...BOARD_FEED.feed.slice(7),         // portrait picture, four pictures
] };

export const CLIP_URIS = FEED.feed.filter((it) => it.post.embed?.$type === 'app.bsky.embed.video#view').map((it) => it.post.uri);
export const GRAM_URIS = FEED.feed.filter((it) => it.post.embed?.$type === 'app.bsky.embed.images#view').map((it) => it.post.uri);

export const RESPONSES = { ...BOARD_RESPONSES, 'getFeed?': FEED, 'getFeed': FEED };

// A page arriving already in a mode — the reader's stored choice, the way
// the skin and the ring stop arrive.
export const inMode = (mode) => `try { localStorage.setItem('forage.view', '${mode}'); } catch {}`;
