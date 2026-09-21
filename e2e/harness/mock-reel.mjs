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

// ---- the people-scope population (D1 (a)): a Follows reel is the scope's
// people, asked a wave at a time. Ten follows (so one wave of eight leaves two
// for the next), two of them mutuals; six answer the video filter with clips,
// one answers with text (the network's filter is not trusted alone), three
// answer nothing. One clip carries a label the reader's settings say WARN on —
// the frame the veil rule exists for. The graph and the author feeds are
// keyed by actor so the shim answers each member its own page.
const MEMBERS = Array.from({ length: 10 }, (_, i) => `did:plc:m${i + 1}`);
export const GRAPH = { follows: MEMBERS, followers: [MEMBERS[0], MEMBERS[1]] };
const memberClip = (did, n, shape, text, extra = {}) => ({
  ...clip(`${did.split(':').pop()}c${n}`, `${did.split(':').pop()}.member.test`, text, shape, extra),
  author: { did, handle: `${did.split(':').pop()}.member.test`, avatar: AV },
  uri: `at://${did}/app.bsky.feed.post/c${n}`, cid: `cid-${did}-c${n}`,
});
export const LABELED = { ...memberClip(MEMBERS[3], 1, { width: 1080, height: 1920 }, 'the aftermath — not for everyone'),
  labels: [{ src: 'did:plc:labeler', uri: `at://${MEMBERS[3]}/app.bsky.feed.post/c1`, val: 'graphic-media', cts: '2026-08-30T00:00:00Z' }] };
const MEMBER_FEEDS = {
  [MEMBERS[0]]: [memberClip(MEMBERS[0], 1, { width: 1080, height: 1920 }, 'first light on the sphagnum'), memberClip(MEMBERS[0], 2, { width: 1920, height: 1080 }, 'the whole bog from the ridge')],
  [MEMBERS[1]]: [memberClip(MEMBERS[1], 1, { width: 1080, height: 1080 }, 'sundew, four seconds a frame')],
  [MEMBERS[2]]: [{ ...memberClip(MEMBERS[2], 1, { width: 1, height: 1 }, 'just words, no clip — the filter answered anyway'), embed: undefined }],
  [MEMBERS[3]]: [LABELED],
  [MEMBERS[6]]: [memberClip(MEMBERS[6], 1, { width: 1080, height: 1920 }, 'carrying the peat cores back')],
  [MEMBERS[8]]: [memberClip(MEMBERS[8], 1, { width: 1080, height: 1920 }, 'the ninth follow, the second wave')],
  [MEMBERS[9]]: [memberClip(MEMBERS[9], 1, { width: 1920, height: 1080 }, 'the tenth follow, the second wave')],
};
const feedPage = (posts) => ({ feed: posts.map((p) => ({ post: p })) });
// The shim answers the FIRST key the url contains and a spread keeps the first
// insertion's position, so the people's keys come first and the board's map
// follows minus anything overridden here (its own empty getPreferences would
// otherwise win, silently, and the veil would never show — 2026-09-21).
const PEOPLE = {
  // the `&` closes the actor: `actor=did%3Aplc%3Am1` is a substring of m10's url
  ...Object.fromEntries(MEMBERS.map((did) => [`getAuthorFeed?actor=${encodeURIComponent(did)}&`, feedPage(MEMBER_FEEDS[did] || [])])),
  'getAuthorFeed?actor=did%3Aplc%3Ame&': feedPage([]),
  'getFollows': { follows: GRAPH.follows.map((did) => ({ did, handle: `${did.split(':').pop()}.member.test` })) },
  'getFollowers': { followers: GRAPH.followers.map((did) => ({ did, handle: `${did.split(':').pop()}.member.test` })) },
  // the reader's settings: warn on graphic media — the veil's case
  'getPreferences': { preferences: [{ $type: 'app.bsky.actor.defs#contentLabelPref', label: 'graphic-media', visibility: 'warn' }] },
};
export const PEOPLE_RESPONSES = { ...PEOPLE, ...Object.fromEntries(Object.entries(RESPONSES).filter(([k]) => !(k in PEOPLE))) };
// the first wave's frames, dealt one per person per round in scope order
// (me, m1..m8): m1c1, m2c1, m4c1 (labeled), m7c1, then m1c2
export const FOL_WAVE_ONE = [
  `at://${MEMBERS[0]}/app.bsky.feed.post/c1`, `at://${MEMBERS[1]}/app.bsky.feed.post/c1`,
  `at://${MEMBERS[3]}/app.bsky.feed.post/c1`, `at://${MEMBERS[6]}/app.bsky.feed.post/c1`,
  `at://${MEMBERS[0]}/app.bsky.feed.post/c2`,
];
export const FOL_WAVE_TWO = [`at://${MEMBERS[8]}/app.bsky.feed.post/c1`, `at://${MEMBERS[9]}/app.bsky.feed.post/c1`];
export const inScope = (scope) => `try { localStorage.setItem('forage.ringscope', '${scope}'); } catch {}`;
export const autoplay = (on) => `try { localStorage.setItem('forage.clipautoplay', '${on ? 'on' : 'off'}'); } catch {}`;
// The player, doubled (W30's shape): present, so nothing vendored loads and no
// playlist leaves the page; what it was asked to load is recorded.
export const HLS_DOUBLE = `(() => {
  window.__hlsSources = [];
  window.Hls = class {
    static isSupported() { return true; }
    static get Events() { return { ERROR: 'hlsError' }; }
    on() {}
    loadSource(url) { window.__hlsSources.push(url); }
    attachMedia() {}
    destroy() {}
  };
})();`;
