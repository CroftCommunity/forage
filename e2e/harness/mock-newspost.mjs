// The population the post-text mock is judged against (CroftC/.claude/MOCKS.md P2 —
// built to STRESS the surface, not to smoke it).
//
// Why this exists, and why it is not mock-thread.mjs: mock-thread's root is an
// images post whose text is one flat sentence. Neither of the two things the
// owner's 2026-09-01 comparison turned on can happen to it — it has no line
// structure to lose and no link facet to leave dead. The post they compared
// (bsky.app vs forage.fyi, VGC on Sony and digital ownership) has both, and the
// head rendered it as one 26px serif run with an inert URL in the middle.
//
// The load, every item measured off the live network the same day (a 60-post
// sample of f/whats-hot, 2026-09-01):
//
//   - the VGC record VERBATIM: three blocks split by \n\n, ending in the
//     truncated display URL Bluesky's composer writes, with the #link facet
//     over exactly those bytes (237-280) carrying the full uri. 30% of live
//     posts carry line structure; 30% carry facets
//   - its real counts that day: 213 replies, 693 reposts+quotes, 338 likes
//   - a 298-character flat post with NO embed — the longest text in the sample,
//     the p90 is 260
//   - an external embed with NO thumbnail: the lens's card is guarded on
//     `external?.thumb`, so this post's link has nowhere to render
//   - a single-\n list post (the "vs / time / channel" shape, 4 of 60)
//   - replies carrying a link, a #tag and an @mention — a thread node's shape
//     drops `facets` entirely, so every one of them is dead text
//   - a reply with its own \n\n (comments go through mdLite, which keeps the
//     break) — the contrast that shows the HEAD is the surface out of step
//   - the names people choose at the lengths the network allows
//
// Shared by scripts/mock-snaps.mjs (the pictures) and e2e/mock-posttext.workflow.mjs
// (the claims), so the frame the owner approves is of the tree the gate runs.
// Hermetic: every Bluesky host is fenced by the shim; a miss fails the run.
const AV = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const WH = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

const NAMES = {
  'videogameschronicle.com': 'VGC',
  'averyveryverylonghandle.bsky.social': 'A Very, Very, Very Long Display Name Indeed',
  'quietcartographer.bsky.social': 'The Quiet Cartographer of the Northern Fenlands & Bog Society',
  'erislovesgardens.bsky.social': 'Eris 🌿🐸',
  'briarpatchradio.bsky.social': null,
};

// The same picture trick mock-board.mjs uses: an SVG data URI at the declared
// aspect ratio, so a stage shows contain-fit instead of a broken image.
const svg = (n, { width, height }) => {
  const hue = (n.charCodeAt(0) * 37) % 360;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},20%,72%)"/><stop offset="1" stop-color="hsl(${(hue + 30) % 360},18%,40%)"/></linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/><rect x="${width * 0.16}" y="${height * 0.34}" width="${width * 0.68}" height="${height * 0.3}" rx="${height * 0.04}" fill="hsl(0,0%,96%)"/>` +
    `<rect x="${width * 0.16}" y="${height * 0.58}" width="${width * 0.68}" height="${height * 0.1}" rx="${height * 0.02}" fill="hsl(0,0%,18%)"/></svg>`);
};

// `thumb` is optional ON PURPOSE — the no-thumbnail case is one of the loads.
const external = ({ uri, title, description, n, aspect }) => ({ $type: 'app.bsky.embed.external#view',
  external: { uri, title, description, ...(n ? { thumb: svg(n, aspect) } : {}) } });

const post = (rkey, did, handle, ts, text, { likes = 0, replies = 0, reposts = 0, quotes = 0,
  facets = null, view = null, verified = false } = {}) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`, ...(view ? { embed: view } : {}),
  author: { did, handle, avatar: AV, ...(NAMES[handle] ? { displayName: NAMES[handle] } : {}),
    ...(verified ? { verification: { verifiedStatus: 'valid', trustedVerifierStatus: 'none', verifications: [] } } : {}) },
  record: { text, createdAt: ts, langs: ['en'], ...(facets ? { facets } : {}) }, indexedAt: ts,
  replyCount: replies, repostCount: reposts, likeCount: likes, quoteCount: quotes,
});

// A facet over a run of the text, given as characters — converted to the UTF-8
// byte offsets a real record carries, because that is what facetSegments decodes.
const facetOver = (text, needle, feature) => {
  const at = text.indexOf(needle);
  if (at === -1) throw new Error(`fixture: "${needle}" is not in the text`);
  const enc = new TextEncoder();
  return { index: { byteStart: enc.encode(text.slice(0, at)).length,
    byteEnd: enc.encode(text.slice(0, at + needle.length)).length }, features: [feature] };
};
const link = (uri) => ({ $type: 'app.bsky.richtext.facet#link', uri });
const tag = (t) => ({ $type: 'app.bsky.richtext.facet#tag', tag: t });
const mention = (did) => ({ $type: 'app.bsky.richtext.facet#mention', did });

// ── The post the owner compared, verbatim ────────────────────────────────────
// at://did:plc:udi5cqdsuhu55agzykpvmdgv/app.bsky.feed.post/3muhdr6ithk2l
const NEWS_TEXT = 'Sony says "reasonable consumers" know they don’t own the digital PlayStation games they buy.\n\n'
  + 'It argues that it\'s "not plausible" to suggest that when they buy a digital game they actually believe they\'re "obtaining ownership" of it.\n\n'
  + 'www.videogameschronicle.com/news/sony-sa...';
const NEWS_URL = 'https://www.videogameschronicle.com/news/sony-says-reasonable-consumers-know-they-dont-own-the-digital-games-they-buy/';

const news = post('news', 'did:plc:vgc', 'videogameschronicle.com', '2026-09-01T11:43:43Z', NEWS_TEXT, {
  likes: 338, replies: 213, reposts: 618, quotes: 75, verified: true,
  facets: [facetOver(NEWS_TEXT, 'www.videogameschronicle.com/news/sony-sa...', link(NEWS_URL))],
  view: external({ uri: NEWS_URL, n: 'ps5', aspect: { width: 1200, height: 675 },
    title: 'Sony says ‘reasonable consumers’ know they don’t own the digital games they buy | VGC',
    description: 'It’s “not plausible” to suggest people believe they’re “obtaining ownership”…' }),
});

// ── The replies: what a thread node loses ────────────────────────────────────
const R1 = 'The filing is worth reading in full — www.courtlistener.com/docket/6913... — and @eff.org has a thread on it too. #digitalrights';
const r1 = { post: post('r1', 'did:plc:r1', 'averyveryverylonghandle.bsky.social', '2026-09-01T12:04:00Z', R1, {
  likes: 41, replies: 1, facets: [
    facetOver(R1, 'www.courtlistener.com/docket/6913...', link('https://www.courtlistener.com/docket/69134422/in-re-sony-digital-purchases/')),
    facetOver(R1, '@eff.org', mention('did:plc:eff')),
    facetOver(R1, '#digitalrights', tag('digitalrights')),
  ] }), replies: [] };

const r2 = { post: post('r2', 'did:plc:r2', 'quietcartographer.bsky.social', '2026-09-01T12:11:00Z',
  'The word doing the work here is "reasonable".\n\nEvery storefront in the world says BUY on the button and LICENCE in the terms, and then argues that nobody was fooled by the button.',
  { likes: 96, replies: 2 }), replies: [] };

const r3 = { post: post('r3', 'did:plc:r3', 'erislovesgardens.bsky.social', '2026-09-01T12:19:00Z',
  'I have bought roughly four hundred games on this account since 2013 and I would like someone under oath to explain to me which of the two words on the large blue button that says BUY NOW is the one that a reasonable consumer is supposed to read as a revocable licence with no resale rights at all.',
  { likes: 12 }), replies: [] };

const r4 = { post: post('r4', 'did:plc:r4', 'briarpatchradio.bsky.social', '2026-09-01T12:26:00Z',
  'Physical media forever.', { likes: 0 }), replies: [] };

// ── The board's other loads ──────────────────────────────────────────────────
const NOTHUMB = 'Our full statement on the ruling is up. It is short. press.example.org/statements/2...';
const nothumb = post('nothumb', 'did:plc:nt', 'quietcartographer.bsky.social', '2026-09-01T10:00:00Z', NOTHUMB, {
  likes: 88, replies: 9, reposts: 21,
  facets: [facetOver(NOTHUMB, 'press.example.org/statements/2...', link('https://press.example.org/statements/2026-09-01-digital-ownership'))],
  // an external embed the network handed us with NO thumbnail
  view: external({ uri: 'https://press.example.org/statements/2026-09-01-digital-ownership',
    title: 'Statement on In re Sony Digital Purchases', description: 'A short statement from our counsel.' }),
});

const LONGFLAT = '“Nothing says you understand the affordability crisis like arguing in federal court that the word buy has never meant buy,” said one attorney, who has spent the better part of a decade litigating exactly this question and who would very much like the industry to pick a single word and keep it.';
const longflat = post('longflat', 'did:plc:lf', 'averyveryverylonghandle.bsky.social', '2026-09-01T09:30:00Z', LONGFLAT, { likes: 244, replies: 31, reposts: 60 });

const list = post('list', 'did:plc:ls', 'erislovesgardens.bsky.social', '2026-09-01T09:00:00Z',
  'Oral argument is on the calendar.\n\n⚖️ In re Sony Digital Purchases\n⏰ 09:00 PT\n📺 streamed on the court’s channel',
  { likes: 57, replies: 4, reposts: 18 });

export const FEED = { feed: [{ post: news }, { post: nothumb }, { post: longflat }, { post: list }] };
export const BOARD_PATH = '/f/whats-hot';
export const ROOT = news.uri;
export const THREAD_PATH = `/p?uri=${encodeURIComponent(ROOT)}`;
export const NEWS = { uri: news.uri, url: NEWS_URL, text: NEWS_TEXT };
// Every comment the fixture renders, by id — a claim counts against this, never
// against ">= 1", so a node that silently drops is a failure.
export const NODE_IDS = [r1, r2, r3, r4].map((n) => n.post.uri);

export const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getFeedGenerator?': { view: { uri: WH, displayName: 'Discover', description: 'trending',
    likeCount: 39382, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
  'getFeed?': FEED, 'getFeed': FEED,
  'getPostThread': { thread: { post: news, replies: [r1, r2, r3, r4] } },
  'getQuotes': { posts: [] },
  'constellation.microcosm.blue/links?target=': { total: 0, linking_records: [] },
  'describeRepo': { handle: 'me.test' },
  'getPreferences': { preferences: [] },
  'getProfile?actor=did%3Aplc%3Ame': { did: 'did:plc:me', handle: 'me.test', avatar: AV },
  'getMutes': { mutes: [] }, 'getBlocks': { blocks: [] },
  'getListMutes': { lists: [] }, 'getListBlocks': { lists: [] },
};

// Signed in as did:plc:me, every PDS call routed through the fenced shim.
export { FAKE_SIGNED_IN } from './mock-thread.mjs';
