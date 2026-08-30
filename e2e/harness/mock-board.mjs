// The lens BOARD a mock is judged against (CroftC/.claude/MOCKS.md P2 — built to
// stress the surface, not to smoke it). The sibling of mock-thread.mjs, for the
// surfaces board-cards and post-and-thread § A/E draw on a feed:
//
//   - a plain post with a 30-character handle and a two-line title
//   - a reply row (the "↩ replying to" context line, parent as a full postView)
//   - a repost row (the reason envelope, a different handle in the byline)
//   - a portrait picture (the media stage's tallest case) and a four-picture
//     post (the carousel / grid setting), images fenced so no bytes load —
//     the stage must hold its size from the aspect ratio alone
//   - counts at both widths: 0 and 4-digit likes, 0 and many replies
//
// Shared by scripts/mock-snaps.mjs and any workflow that wants this board.
const AV = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const WH = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const T = (h) => `2026-08-30T${String(h).padStart(2, '0')}:00:00Z`;

const post = (rkey, did, handle, ts, text, { likes = 0, replies = 0, reposts = 0, embed = null, reply = null } = {}) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`,
  author: { did, handle, avatar: AV },
  record: { text, createdAt: ts, ...(reply ? { reply } : {}) }, indexedAt: ts,
  // the hydrated embed (#view) sits on the POST, beside the record — the raw
  // record's embed is the blob ref, which the lens never reads (a fixture that
  // put it in the record rendered no stage at all, 2026-08-30)
  ...(embed ? { embed } : {}),
  replyCount: replies, repostCount: reposts, likeCount: likes,
});
const img = (n, aspectRatio) => ({ thumb: `https://cdn.test/${n}-thumb.jpg`, fullsize: `https://cdn.test/${n}.jpg`, alt: `picture ${n}`, aspectRatio });
const images = (...list) => ({ $type: 'app.bsky.embed.images#view', images: list });

const plain = post('plain', 'did:plc:plain', 'quietcartographer.bsky.social', T(9),
  'If we invent the Pneumatic Pie Tube Network today it will still be 49 years too late to follow up on the good work of the original proposal.',
  { likes: 1284, replies: 40, reposts: 12 });
const parent = post('parent', 'did:plc:parent', 'thefrostwarning.bsky.social', T(7), 'Garlic went in yesterday; the frost warning has me second-guessing the last of the brassicas.', { likes: 3 });
const replyRow = post('reply', 'did:plc:reply', 'averyveryverylonghandle.bsky.social', T(8),
  'Fleece over the beans and they will be fine.', { likes: 0, reply: { root: { uri: parent.uri, cid: parent.cid }, parent: { uri: parent.uri, cid: parent.cid } } });
const reposted = post('reposted', 'did:plc:orig', 'briarpatchradio.bsky.social', T(6), 'Broad beans and a late row of spinach. The garlic can take a frost; the beans are the gamble.', { likes: 21, replies: 2 });
const portrait = post('portrait', 'did:plc:pic', 'erislovesgardens.bsky.social', T(5), 'the bog, this morning', { likes: 9, embed: images(img('p', { width: 1080, height: 1920 })) });
const four = post('four', 'did:plc:four', 'misterhooperspecial.bsky.social', T(4), 'four from the allotment',
  { likes: 0, replies: 0, embed: images(img('4a', { width: 1600, height: 1200 }), img('4b', { width: 1080, height: 1920 }), img('4c', { width: 1920, height: 1080 }), img('4d', { width: 1200, height: 1200 })) });

export const FEED = { feed: [
  { post: plain },
  { post: replyRow, reply: { root: parent, parent } },
  { post: reposted, reason: { $type: 'app.bsky.feed.defs#reasonRepost', by: { did: 'did:plc:rp', handle: 'moss.bsky.social', avatar: AV }, indexedAt: T(8) } },
  { post: portrait },
  { post: four },
] };

export const BOARD_PATH = '/f/whats-hot';

export const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getFeedGenerator?': { view: { uri: WH, displayName: 'Discover', description: 'trending',
    likeCount: 39382, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
  'getFeed?': FEED, 'getFeed': FEED,
  'getPostThread': { thread: { post: plain, replies: [] } },
  'getQuotes': { posts: [] },
  'constellation.microcosm.blue/links?target=': { total: 0, linking_records: [] }, // the feed card's quote / starter-pack counts
  'describeRepo': { handle: 'me.test' },
  'getPreferences': { preferences: [] },
  'getProfile?actor=did%3Aplc%3Ame': { did: 'did:plc:me', handle: 'me.test', avatar: AV },
  'getMutes': { mutes: [] }, 'getBlocks': { blocks: [] },
  'getListMutes': { lists: [] }, 'getListBlocks': { lists: [] },
};
