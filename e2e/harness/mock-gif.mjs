// The population the gif-embeds mock is judged against (CroftC/.claude/MOCKS.md
// P2 — built to STRESS the surface, not to smoke it).
//
// Why it is not mock-newspost.mjs: that fixture's externals are news pages, and
// a news page is exactly the case this change must NOT touch. The load here is
// the case the owner reported, twice, on 2026-09-02 — and the control that
// proves an og:description still shows.
//
// The load. The first two records are the owner's OWN, verbatim from the
// network (did:plc:bqmixtqt7niypsaj6h7yy6ju, read 2026-09-02):
//
//   - the reported post: a klipy GIF, LANDSCAPE (498x415), whose description is
//     "ALT: <its own title>" — the duplication that prompted the whole thing
//   - the second reported post: klipy, PORTRAIT (260x343). One orientation
//     proving the stage sizes correctly proves nothing; a tall GIF on a wide
//     card is where the letterboxing shows
//   - a GIF with alt a person actually WROTE ("Alt: " — the other prefix), long
//     enough to wrap: the case where showing alt text is worth doing
//   - a tenor .gif: no verified video form, so it plays as an image. The rung
//     below, rendered beside the rung above so they can be told apart
//   - a GIF with a 96-character title, because the caption is one link and the
//     title is its accessible name
//   - a NEWS card with a real og:description: the control. The alt-text setting
//     must not touch it in either state
//   - the reported shape in its reported PLACE: a GIF on a REPLY, not on a head
//
// Both GIF uris are real, so js/gif.js does its actual parsing here rather than
// against something shaped like klipy. Nothing is fetched: scenario.mjs fences
// every off-origin request with a silent 204, so the video sources resolve to
// nothing and the <video> shows its poster — which is what the paused frame is
// anyway.
//
// Shared by scripts/mock-snaps.mjs (the pictures) and e2e/mock-gif.workflow.mjs
// (the claims), so the frame the owner approves is of the tree the gate runs.
const AV = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const WH = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

const NAMES = {
  'msjulesb.bsky.social': '💛💜JB💛💜 🦋',
  'dirkvanderwoude.bsky.social': 'Dirk van der Woude',
  'thekeeper.bsky.social': 'The Keeper of Small Bogs',
  'averyveryverylonghandle.bsky.social': 'A Very, Very, Very Long Display Name Indeed',
  'videogameschronicle.com': 'VGC',
};

// A poster at the GIF's declared ratio, as an SVG data URI — the trick
// mock-board.mjs and mock-newspost.mjs already use, so a stage shows a
// contain-fit picture instead of a broken image, hermetically.
const svg = (n, { width, height }) => {
  const hue = (n.charCodeAt(0) * 53) % 360;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},42%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},38%,32%)"/></linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
    `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="rgba(255,255,255,.28)"/></svg>`);
};

const external = ({ uri, title, description = '', n, aspect }) => ({ $type: 'app.bsky.embed.external#view',
  external: { uri, title, description, ...(n ? { thumb: svg(n, aspect) } : {}) } });

const post = (rkey, did, handle, ts, text, { likes = 0, replies = 0, reposts = 0, quotes = 0, view = null } = {}) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`, ...(view ? { embed: view } : {}),
  author: { did, handle, avatar: AV, ...(NAMES[handle] ? { displayName: NAMES[handle] } : {}) },
  record: { text, createdAt: ts, langs: ['en'] }, indexedAt: ts,
  replyCount: replies, repostCount: reposts, likeCount: likes, quoteCount: quotes,
});

// ── the two reported uris, verbatim ─────────────────────────────────────────
export const KLIPY_LANDSCAPE = 'https://static.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/61/56/RiZHW3kybKsT6j.gif?hh=415&ww=498&mp4=8pcPaPB1Eow6fc&webm=0Ds0ULMJw0vWjEZ6NMLN';
export const KLIPY_PORTRAIT = 'https://static.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/75/c5/PbsJs3z2wdMgRe6u.gif?hh=343&ww=260&mp4=ULTEdSmY5WVrY4&webm=5pnMJhe2bAm1ixZ';
const TENOR_GIF = 'https://media.tenor.com/AAAAC3q2Kn0AAAAC/shrug-i-dont-know.gif?hh=220&ww=320';

const LONG_TITLE = 'A Very Long GIF Title That Klipy Generated From The Scene Description And Nobody Trimmed';
const AUTHORED_ALT = 'Alt: a golden retriever wearing sunglasses gives a slow, deliberate thumbs-up to the camera and then falls over sideways into a pile of autumn leaves';

// ── the head ────────────────────────────────────────────────────────────────
// The root is by someone OTHER than the GIF repliers, deliberately. forage
// hoists an unbroken same-author reply chain into the head as the post's body
// (lens.js § selfThread), and `selfThread` carries only { uri, text, facets } —
// so a hoisted part's embed is dropped entirely. That is a real defect, it
// predates this branch, it hits pictures and video the same way, and it is
// FILED in TODO.md rather than fixed here: it belongs to the head's shaping,
// not to whether a GIF plays. A fixture that walked into it would have been
// grading that bug instead of this change.
const root = post('root', 'did:plc:dv', 'dirkvanderwoude.bsky.social', '2026-09-02T14:02:00Z',
  'Good morning ☕️ — I hope everyone has a wonderful day out there.', { likes: 31, replies: 4, reposts: 2 });

// ── the reported shape, in its reported PLACE: a GIF on a reply ──────────────
const r1 = { post: post('r1', 'did:plc:bqmixtqt7niypsaj6h7yy6ju', 'msjulesb.bsky.social', '2026-09-02T17:23:50Z',
  '😂😂😂… no problem… the end is in sight 😂😂😂', { likes: 1,
    view: external({ uri: KLIPY_LANDSCAPE, n: 'warrior', aspect: { width: 498, height: 415 },
      title: 'Warrior Nun Ava Running Through Water',
      description: 'ALT: Warrior Nun Ava Running Through Water' }) }), replies: [] };

const r2 = { post: post('r2', 'did:plc:bqmixtqt7niypsaj6h7yy6ju', 'msjulesb.bsky.social', '2026-09-02T15:10:00Z',
  '😂😂😂… don’t worry… I’ve arrived 😂😂😂', { likes: 4,
    view: external({ uri: KLIPY_PORTRAIT, n: 'giveup', aspect: { width: 260, height: 343 },
      title: 'Give Up Im Done', description: 'ALT: Give Up Im Done' }) }), replies: [] };

// alt a person actually wrote, long enough to wrap: the case the setting is FOR
const r3 = { post: post('r3', 'did:plc:tk', 'thekeeper.bsky.social', '2026-09-02T15:40:00Z',
  'this is how I feel about it', { likes: 12,
    view: external({ uri: KLIPY_LANDSCAPE.replace('RiZHW3kybKsT6j', 'ThumbsUpDogAAA'), n: 'dog',
      aspect: { width: 498, height: 415 }, title: 'Thumbs Up Dog', description: AUTHORED_ALT }) }), replies: [] };

// the rung below: no verified video form, so it animates as an image
const r4 = { post: post('r4', 'did:plc:av', 'averyveryverylonghandle.bsky.social', '2026-09-02T16:02:00Z',
  'honestly same', { likes: 3,
    view: external({ uri: TENOR_GIF, n: 'shrug', aspect: { width: 320, height: 220 },
      title: 'Shrug I Dont Know', description: 'ALT: Shrug I Dont Know' }) }), replies: [] };

// ── the board's other loads ─────────────────────────────────────────────────
const longtitle = post('longtitle', 'did:plc:tk', 'thekeeper.bsky.social', '2026-09-02T13:00:00Z',
  'the title on this one is absurd', { likes: 8, replies: 1,
    view: external({ uri: KLIPY_PORTRAIT.replace('PbsJs3z2wdMgRe6u', 'LongTitleAAAAAAA'), n: 'long',
      aspect: { width: 260, height: 343 }, title: LONG_TITLE, description: `ALT: ${LONG_TITLE}` }) });

// THE CONTROL. A news card with a genuine og:description: the alt-text setting
// governs alt, and an article summary is not alt. If this line ever disappears
// with the switch, the rule has been implemented as "hide the description".
const NEWS_URL = 'https://www.videogameschronicle.com/news/sony-says-reasonable-consumers-know-they-dont-own-the-digital-games-they-buy/';
const newscard = post('newscard', 'did:plc:vgc', 'videogameschronicle.com', '2026-09-02T11:43:00Z',
  'Sony says “reasonable consumers” know they don’t own the digital games they buy.', { likes: 338, replies: 213, reposts: 618,
    view: external({ uri: NEWS_URL, n: 'ps5', aspect: { width: 1200, height: 675 },
      title: 'Sony says ‘reasonable consumers’ know they don’t own the digital games they buy | VGC',
      description: 'It’s “not plausible” to suggest people believe they’re “obtaining ownership”…' }) });

export const FEED = { feed: [{ post: r1.post }, { post: r2.post }, { post: r4.post }, { post: longtitle }, { post: newscard }] };
export const BOARD_PATH = '/f/whats-hot';
export const ROOT = root.uri;
export const THREAD_PATH = `/p?uri=${encodeURIComponent(ROOT)}`;
// the reported post, as its own page — the head surface
export const GIF_POST_PATH = `/p?uri=${encodeURIComponent(r1.post.uri)}`;
export const NODE_IDS = [r1, r2, r3, r4].map((n) => n.post.uri);

export const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getFeedGenerator?': { view: { uri: WH, displayName: 'Discover', description: 'trending',
    likeCount: 39382, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
  'getFeed?': FEED, 'getFeed': FEED,
  'getPostThread': { thread: { post: root, replies: [r1, r2, r3, r4] } },
  'getQuotes': { posts: [] },
  'constellation.microcosm.blue/links?target=': { total: 0, linking_records: [] },
  'describeRepo': { handle: 'me.test' },
  'getPreferences': { preferences: [] },
  'getProfile?actor=did%3Aplc%3Ame': { did: 'did:plc:me', handle: 'me.test', avatar: AV },
  'getMutes': { mutes: [] }, 'getBlocks': { blocks: [] },
  'getListMutes': { lists: [] }, 'getListBlocks': { lists: [] },
};

export { FAKE_SIGNED_IN } from './mock-thread.mjs';
