// The DEEP thread a mock is judged against (CroftC/.claude/MOCKS.md — the
// surface's hermetic population, built to STRESS the surface, not to smoke it).
//
// Why this exists (owner, 2026-09-02, with a screenshot of forage.fyi):
//
//   "we have deep nested threads not collapsed by default … it can get a
//    little hard to follow and read"
//
// `mock-thread.mjs` is four deep by design — enough for the elbows and the
// phone's 14px step, which is what it was built for. It cannot show this: at
// four levels the indent has not yet eaten the column. The screenshot's chain
// ran seven, and every step of it was a comment with EXACTLY ONE reply, which
// is the shape this fixture exists to carry.
//
// One more thing the screenshot showed and no fixture did: the depth came
// through a QUOTE. forage renders the quote cascade as comment nodes
// (js/substrates/lens.js `buildQuote`), and a quote's own reply chain nests
// UNDER it — so a reader's depth is cascade depth + reply depth. The deep
// spine here therefore hangs off a quote, not off the post.
//
// The load is measured, not chosen. Read from the owner's own thread
// (at://did:plc:aht75weh3zbaihskxuv4wkgv/app.bsky.feed.post/3mrsaxfqth22a and
// the quote cascade under it) through the public appview on 2026-09-03:
//
//   handles      10 chars (twink.wang) … 30 (chakatsilverstreak.bsky.social)
//   display names up to 45 chars, emoji throughout ("Cirice Gray @House of
//                the Underworld out now!", "🌸 Skippy The Bush Kangaroo 🌸")
//   likes        0 … 7368 on the root, 1158 on the quote, 121 on a reply
//   reposts      up to 171 on the quote
//   text         2 chars ("😭") … 270
//   chains       single-reply runs of 5 inside a quote's own thread, on top of
//                the cascade depth the quote already sits at
//
// The content is written, not copied: the shape is the owner's, the words are
// not two real people's conversation checked into a repo.
//
// Shared by scripts/mock-snaps.mjs (the pictures) and e2e/mock-depth.workflow.mjs
// (the claims), so the picture the owner approves is of the tree the gate runs.
// Hermetic: every Bluesky host is fenced by the shim; misses fail.
import { img, images } from './mock-board.mjs';
export { FAKE_SIGNED_IN } from './mock-thread.mjs';
const AV = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const WH = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

// The names people chose, at the lengths the network hands us — emoji and all,
// because a byline is judged on the widest one, never on "briar".
const NAMES = {
  'thegildedgorgon.bsky.social': 'Thessaly Vane 🐍',
  'chakatsilverstreak.bsky.social': 'Chakat Silverstreak (Commissions Open!)',
  'nine.wang': 'nine 🧡',
  'aunthesperides.bsky.social': '🌸 Aunt Hesperides of the Golden Apples 🌸',
  'quietcartographer.bsky.social': 'The Quiet Cartographer',
  'magerightsactivist.bsky.social': 'Miriam/Markus (she/her, he/him, ze/hir)',
};

const T = (mins) => new Date(Date.UTC(2026, 7, 30, 8, mins)).toISOString();
const post = (rkey, did, handle, ts, text, { likes = 0, replies = 0, reposts = 0, quotes = 0, embed = null, view = null } = {}) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`, ...(view ? { embed: view } : {}),
  author: { did, handle, avatar: AV, ...(NAMES[handle] ? { displayName: NAMES[handle] } : {}) },
  record: { text, createdAt: ts, ...(embed ? { embed } : {}) }, indexedAt: ts,
  replyCount: replies, repostCount: reposts, likeCount: likes, quoteCount: quotes,
});
const leaf = (p) => ({ post: p, replies: [] });

export const ROOT = 'at://did:plc:gorgon/app.bsky.feed.post/gorgon';

const root = post('gorgon', 'did:plc:gorgon', 'thegildedgorgon.bsky.social', T(0),
  'four studies of a woman who has made her peace with the hair situation',
  { likes: 7368, replies: 91, reposts: 612, quotes: 14,
    view: images(img('gorgon', { width: 1600, height: 1000 })) });

// ---- ordinary top-level replies: the thread is not ALL spine ----------------
// A leaf with nothing under it (no rail, no fold), a two-character reply, and a
// BRANCH — two siblings under one parent, which is the case chain-flattening
// must leave alone. Without it a frame cannot show the rule declining to fire.
const chatter = [
  leaf(post('c1', 'did:plc:c1', 'nine.wang', T(6), 'okay but the third one is a whole mood', { likes: 22 })),
  leaf(post('c2', 'did:plc:c2', 'magerightsactivist.bsky.social', T(9), '😭', { likes: 4 })),
];
const branchKids = [
  leaf(post('b1a', 'did:plc:b1a', 'aunthesperides.bsky.social', T(14),
    'Conditioner. It has to be conditioner. You cannot put a detangling brush through a live animal and expect to keep the hand.', { likes: 31 })),
  leaf(post('b1b', 'did:plc:b1b', 'chakatsilverstreak.bsky.social', T(16),
    'speaking as someone with a great deal of hair: the brush is not the problem, the brush is never the problem', { likes: 8 })),
];
const branch = { post: post('b1', 'did:plc:b1', 'quietcartographer.bsky.social', T(12),
  'Genuine question for the artists in the room — what is she using on them', { likes: 63, replies: 2 }), replies: branchKids };

// ---- the spine: a quote, and under it a chain that never branches -----------
// Twelve deep. The first ten render (js/substrates/lens.js stops the tree at
// depth 10) and the eleventh becomes the "continue this thread" stub, so one
// frame carries the whole ladder: the indent, the fold, and the boundary.
//
// Two speakers alternating, one reply each, exactly as the owner's screenshot:
// this is a CONVERSATION, and every indent in it is the renderer saying
// "branch" about something that has never once branched.
const SPINE = [
  ['s1', 'aunthesperides.bsky.social', 'wait, is this the one that got quote-dunked into orbit last year', 14],
  ['s2', 'thegildedgorgon.bsky.social', 'that is the one. I still get replies about the shampoo', 31],
  ['s3', 'aunthesperides.bsky.social', 'the SHAMPOO', 96],
  ['s4', 'thegildedgorgon.bsky.social', 'people were extremely certain that I had not thought about the shampoo', 121],
  ['s5', 'aunthesperides.bsky.social', 'I need you to know that I have thought about the shampoo more than any of them and I did not even draw it', 40],
  ['s6', 'thegildedgorgon.bsky.social', 'you have thought about it more than I have and I am the one who has to keep answering for it', 12],
  ['s7', 'aunthesperides.bsky.social', 'sorry. what does one use. asking for a friend with a similar arrangement', 7],
  ['s8', 'thegildedgorgon.bsky.social', 'a mild castile soap, apparently, and never on the face', 19],
  ['s9', 'aunthesperides.bsky.social', 'never on the face is doing a lot of work in that sentence', 5],
  ['s10', 'thegildedgorgon.bsky.social', 'it is doing all of the work in that sentence', 3],
  ['s11', 'aunthesperides.bsky.social', 'okay I am going to go lie down about this', 2],
  ['s12', 'thegildedgorgon.bsky.social', 'same', 1],
];
const spine = SPINE.reduceRight((kid, [rkey, handle, text, likes], i) => ([{
  post: post(rkey, `did:plc:${rkey}`, handle, T(20 + i * 3), text, { likes, replies: kid.length }),
  replies: kid,
}]), [])[0];

// The quote the spine hangs off — the owner's screenshot exactly: a repost with
// a comment, its own rail in the brand ink, carrying a conversation of its own.
const quote = post('q1', 'did:plc:q1', 'nine.wang', T(18),
  'I just remembered how when I put this up the first time a stranger explained hair care to me for nine hours',
  { likes: 1158, replies: 1, reposts: 171, quotes: 0,
    embed: { $type: 'app.bsky.embed.record', record: { uri: ROOT, cid: 'cid-gorgon' } } });

export const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getFeedGenerator?': { view: { uri: WH, displayName: 'Discover', description: 'trending',
    likeCount: 39382, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
  'getFeed?': { feed: [{ post: root }] },
  [`getPostThread?uri=${encodeURIComponent(quote.uri)}`]: { thread: { post: quote, replies: [spine] } },
  'getPostThread': { thread: { post: root, replies: [...chatter, branch] } },
  [`getQuotes?uri=${encodeURIComponent(quote.uri)}`]: { posts: [] },
  'getQuotes': { posts: [quote] },
  'describeRepo': { handle: 'me.test' },
  'getPreferences': { preferences: [] },
  'getProfile?actor=did%3Aplc%3Ame': { did: 'did:plc:me', handle: 'me.test', avatar: AV },
  'getMutes': { mutes: [] }, 'getBlocks': { blocks: [] },
  'getListMutes': { lists: [] }, 'getListBlocks': { lists: [] },
  'com.atproto.repo.createRecord': { uri: 'at://did:plc:me/app.bsky.feed.post/3lk', cid: 'lc' },
  'com.atproto.repo.deleteRecord': {},
};

export const THREAD_PATH = `/p?uri=${encodeURIComponent(ROOT)}`;
export const QUOTE_URI = quote.uri;
// The spine by depth: SPINE_URIS[0] is the quote's own reply (depth 1) and
// SPINE_URIS[9] the last node the tree renders (depth 10). A frame or a claim
// addresses a rung by its depth, never by counting `.comment` in the DOM.
export const SPINE_URIS = SPINE.map(([rkey]) => `at://did:plc:${rkey}/app.bsky.feed.post/${rkey}`);
export const BRANCH_URI = branch.post.uri;
