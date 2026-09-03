// The SELF-THREAD load a mock is judged against (CroftC/.claude/MOCKS.md — the
// surface's hermetic population, built to STRESS the surface, not to smoke it).
//
// Why this exists (owner, 2026-09-03, with four screenshots of forage.fyi):
//
//   "if I write a comment I don't see it right away … in some cases it's
//    actually showing up as part of the original post? but still says 1 reply?
//    it's confusing and wrong"
//
// and, a message later, the part that made it urgent:
//
//   "deleting that 'comment' did in fact delete the post"
//
// Every existing thread fixture misses this. `mock-thread.mjs` has no
// self-reply at all; `mock-deepthread.mjs` has a same-author SPINE but nested
// under a quote, where the hoist never fires. The one shape that breaks the
// head — the poster answering their OWN post at the top level — was in no
// population, which is why four surfaces could each be green while the owner's
// post got deleted by the only button on the card.
//
// The load is measured, not chosen. 1,641 real self-replies from 246 authors,
// sampled off the public discover feed through the appview on 2026-09-03, and
// the 958 of them that are top-level replies to the author's own root — which
// is exactly what forage hoists:
//
//   gap to the parent   43% under 10s (a composer posts a chain in ONE batch,
//                       so createdAt ties are the common case, not the rare
//                       one), p50 38s, p75 4.6m, p90 1.0h, and 10% land more
//                       than an hour later — the owner's own was 3h17m
//   chain length        2 and 3 parts; 76% of popular roots carry one at all
//   replies on a root   median 11, max 239
//   explicit "1/3"      3.7% — so the numbering is never in the words
//
// The frame therefore carries: a chain of three (the root is part 1/3), one
// part posted in the same batch (a 0s tie) and one posted 3h17m later; a part
// that carries a PICTURE; a DECOY self-reply that is newer than the real part
// two but returned FIRST, because getPostThread ranks its replies and the
// network's rule is oldest-first; the OP answering somebody ELSE, which must
// stay a comment; a reply UNDER a part, which re-roots; and eleven top-level
// replies at the median, at the handle and name lengths the network hands us.
//
// Signed in AS THE POSTER, because the delete hazard only exists for the
// person who can see a Delete button.
//
// Shared by scripts/mock-snaps.mjs (the pictures) and e2e/self-thread.workflow.mjs
// (the claims), so the picture the owner approves is of the tree the gate runs.
// Hermetic: every Bluesky host is fenced by the shim; misses fail.
import { img, images } from './mock-board.mjs';
export { FAKE_SIGNED_IN } from './mock-thread.mjs';
const AV = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const WH = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

// The poster IS the signed-in viewer (mock-thread's FAKE_SIGNED_IN did), so
// every Delete the head and the parts can offer actually renders.
const OP = 'did:plc:me';
const OP_HANDLE = 'fieldnotesfromtheedge.bsky.social'; // 33 chars — the long end of the range

const NAMES = {
  [OP_HANDLE]: 'Wren Halloway 🛠️ (field notes)',
  'chakatsilverstreak.bsky.social': 'Chakat Silverstreak (Commissions Open!)',
  'nine.wang': 'nine 🧡',
  'aunthesperides.bsky.social': '🌸 Aunt Hesperides of the Golden Apples 🌸',
  'quietcartographer.bsky.social': 'The Quiet Cartographer',
  'magerightsactivist.bsky.social': 'Miriam/Markus (she/her, he/him, ze/hir)',
  'p.bsky.social': 'p',
};

// 08:00 is the post. The measured shape: part two ties with it (one batch),
// part three lands 3h17m later — the owner's own gap, to the minute.
const T = (mins) => new Date(Date.UTC(2026, 8, 3, 8, mins)).toISOString();
const post = (rkey, did, handle, ts, text, { likes = 0, replies = 0, reposts = 0, quotes = 0, embed = null, view = null } = {}) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`, ...(view ? { embed: view } : {}),
  author: { did, handle, avatar: AV, ...(NAMES[handle] ? { displayName: NAMES[handle] } : {}) },
  record: { text, createdAt: ts, ...(embed ? { embed } : {}) }, indexedAt: ts,
  replyCount: replies, repostCount: reposts, likeCount: likes, quoteCount: quotes,
});
const leaf = (p) => ({ post: p, replies: [] });
const op = (rkey, ts, text, opts) => post(rkey, OP, OP_HANDLE, ts, text, opts);

export const ROOT = `at://${OP}/app.bsky.feed.post/root`;

// The root is an IMAGE POST WITH NO WORDS — the owner's exact case. It matters:
// when the only words on the card came from the hoisted part, the part did not
// look like a continuation of the post, it looked like the post.
const root = op('root', T(0), '',
  { likes: 214, replies: 13, reposts: 9,
    view: images(img('root', { width: 2016, height: 2016 })) });

// ---- the chain: three parts, the root being 1/3 ----------------------------
// Part two ties the root's timestamp to the second: 43% of real chains do,
// because a composer writes the whole thread in one batch. Part three lands
// 3h17m later, which is the case the owner hit and the case a clock-based
// rule would have got wrong.
const part3 = op('part3', T(197),
  'Addendum, three hours later, because two people asked: the bracket is M6, not M5. I measured it wrong the first time and I am not going to pretend otherwise.',
  { likes: 31, replies: 1, view: images(img('part3', { width: 1600, height: 1200 })) });

const underPart3 = leaf(post('under', 'did:plc:aunt', 'aunthesperides.bsky.social', T(210),
  'this is the single most useful correction anyone has posted this week', { likes: 12 }));

const part2 = op('part2', T(0),
  'The whole jig took an afternoon and about eleven dollars of hardware. Photos of the failures are in the replies, because the failures are the interesting part.',
  { likes: 58, replies: 2 });

// ---- the decoy: a LATER self-reply the appview happens to rank first --------
// getPostThread ranks its replies; it does not return them oldest-first. This
// one is newer than part two and stands first in the array, so the old
// `topLevel.find(same author)` hoisted THIS and rendered a two-part post back
// to front. The network's rule is explicit — the oldest contiguous line.
const decoy = leaf(op('decoy', T(140),
  'Someone asked for the supplier: they are called Fastenal and no, this is not sponsored, I wish it were.', { likes: 7 }));

// ---- the OP answering somebody ELSE: a comment, never a part ---------------
const opReply = leaf(op('opback', T(45),
  'Ha — you are right, I did put the washer on the wrong side. It is staying that way.', { likes: 4 }));

// ---- eleven top-level replies: the measured median -------------------------
const chatter = [
  leaf(post('c1', 'did:plc:c1', 'nine.wang', T(4), 'okay this is extremely my kind of nonsense', { likes: 22 })),
  { post: post('c2', 'did:plc:c2', 'quietcartographer.bsky.social', T(7),
      'Genuine question — what did you use to cut the slot? Every time I try this with a jigsaw I get a wobble I cannot sand out.', { likes: 63, replies: 1 }),
    replies: [opReply] },
  leaf(post('c3', 'did:plc:c3', 'magerightsactivist.bsky.social', T(11), '😭 the failures ARE the interesting part, thank you', { likes: 9 })),
  leaf(post('c4', 'did:plc:c4', 'chakatsilverstreak.bsky.social', T(15),
    'speaking as someone who has built four of these and thrown away four of these: the eleven dollars is a lie by the time you finish', { likes: 41 })),
  leaf(post('c5', 'did:plc:c5', 'p.bsky.social', T(19), 'saving this', { likes: 0 })),
  leaf(post('c6', 'did:plc:c6', 'aunthesperides.bsky.social', T(23),
    'The restraint of not cropping the third photo is what elevates this.', { likes: 17 })),
  leaf(post('c7', 'did:plc:c7', 'c7.bsky.social', T(28), 'how loud is it', { likes: 2 })),
  leaf(post('c8', 'did:plc:c8', 'thelongesthandleiveseen.bsky.social', T(33),
    'I have been putting this off for two years and I think you have just cost me a Saturday', { likes: 28 })),
  leaf(post('c9', 'did:plc:c9', 'c9.bsky.social', T(38), 'M5 surely?', { likes: 1 })),
];

export const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getFeedGenerator?': { view: { uri: WH, displayName: 'Discover', description: 'trending',
    likeCount: 39382, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
  'getFeed?': { feed: [{ post: root }] },
  // The decoy stands FIRST, exactly as a ranked appview response hands it over.
  'getPostThread': { thread: { post: root, replies: [
    decoy,
    { post: part2, replies: [{ post: part3, replies: [underPart3] }] },
    ...chatter,
  ] } },
  'getQuotes': { posts: [] },
  'describeRepo': { handle: OP_HANDLE },
  'getPreferences': { preferences: [] },
  [`getProfile?actor=${encodeURIComponent(OP)}`]: { did: OP, handle: OP_HANDLE, avatar: AV },
  'getMutes': { mutes: [] }, 'getBlocks': { blocks: [] },
  'getListMutes': { lists: [] }, 'getListBlocks': { lists: [] },
  'com.atproto.repo.createRecord': { uri: `at://${OP}/app.bsky.feed.post/3lk`, cid: 'lc' },
  'com.atproto.repo.deleteRecord': {},
};

export const THREAD_PATH = `/p?uri=${encodeURIComponent(ROOT)}`;
export const PART_URIS = [part2.uri, part3.uri];
export const DECOY_URI = decoy.post.uri;
export const OP_REPLY_URI = opReply.post.uri;
export const REROOTED_URI = underPart3.post.uri;
