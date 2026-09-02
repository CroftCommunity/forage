// The RENDERING MATRIX — every post shape × every surface that draws it.
//
// Why this exists (owner, 2026-09-01, mid-fix): "we should build in tests for
// rendering expectations bc we keep fixing them bit by bit and I'm worried one
// is breaking or can break another." That is the honest history. Each of these
// arrived as its own repair, each with its own narrow check, and none of them
// could see the others:
//
//   2026-08-28  an image post's thread page rendered no image at all
//   2026-08-30  the picture the thread page rendered was missing from the feed
//   2026-08-30  a native video opened on bsky.app instead of playing in place
//   2026-09-01  a link card with no og:image produced no media and a dead link
//   2026-09-01  a quote post showed neither what it quoted (in the feed) nor
//               the quoted post's video (anywhere)
//   2026-09-01  a REPLY drew its words and nothing else: no picture, no video,
//               no link card, and not the post it quoted
//
// Every one of those is the SAME question asked about a different shape: given
// this embed, what does each surface draw? So it is asked once, as a table.
// The table is the contract: a shape with no row is not covered, and a row that
// declares nothing about a surface is a row that has not been thought about —
// both fail here rather than shipping quietly.
//
// The THREE surfaces are the three the owner reads: the FEED ROW (/f/<feed>),
// the POST PAGE head (/p?uri=), and the REPLY NODE in the thread under it.
// They are separate renderers over the same shape, which is exactly why they
// drift, so every shape is asserted on all three.
//
// The reply node joined on 2026-09-01, the day this file's own two-surface
// version shipped — and it joined because of a bug the two-surface version
// could not have caught. The owner's report: hookcity's wordless reply, whose
// whole content is a quote of a picture post, drew a byline over an empty row
// on forage.fyi while bsky.app drew the picture. The matrix had asked "what
// does the feed row draw?" and "what does the post page draw?" of every shape,
// and never "what does a reply draw?" of any of them — so a surface that drew
// NOTHING for eleven of the seventeen shapes was green. A surface left off the
// table is not covered by the table; that is the whole lesson, and it is why
// `expect` fails a shape that leaves any of the three undeclared.
//
// Reading a row: the counts are of ELEMENTS scoped to that post's own subtree.
// `own*` is the post's own media; `quoted*` is media belonging to the post it
// quotes. Keeping them apart is the point — a quoted video is not the quoting
// post's video, and a check that counted `.stage` would have passed all along.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const T = '2026-09-01T10:00:00Z';
const DID = 'did:plc:aa';
const AV = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const uriOf = (rkey) => `at://${DID}/app.bsky.feed.post/${rkey}`;

const postView = (rkey, text, embed) => ({
  uri: uriOf(rkey), cid: `cid-${rkey}`,
  author: { did: DID, handle: 'aa.test', displayName: 'A A', avatar: AV },
  record: { $type: 'app.bsky.feed.post', text, createdAt: T }, indexedAt: T,
  replyCount: 0, repostCount: 0, likeCount: 1, quoteCount: 0,
  ...(embed ? { embed } : {}),
});

// ---- the embed views, exactly as the AppView hydrates them ----------------
const img = (n, aspectRatio) => ({ thumb: `https://cdn.test/${n}-t.jpg`, fullsize: `https://cdn.test/${n}.jpg`, alt: `picture ${n}`, aspectRatio });
const images = (...list) => ({ $type: 'app.bsky.embed.images#view', images: list });
const video = (n, aspectRatio = { width: 1280, height: 720 }, playlist = `https://video.cdn.test/${n}/playlist.m3u8`) =>
  ({ $type: 'app.bsky.embed.video#view', cid: `cid-v-${n}`, playlist, thumbnail: `https://cdn.test/${n}-t.jpg`, aspectRatio });
const external = ({ uri, title, description = 'a description', thumb = 'https://cdn.test/e-t.jpg' }) =>
  ({ $type: 'app.bsky.embed.external#view', external: { uri, title, description, ...(thumb ? { thumb } : {}) } });
// #viewRecord is the hydrated quoted POST: its own embeds ride along in `embeds`
const viewRecord = (rkey, text, embeds = [], displayName = 'Orig Poster') => ({
  $type: 'app.bsky.embed.record#viewRecord',
  uri: `at://did:plc:orig/app.bsky.feed.post/${rkey}`, cid: `cid-q-${rkey}`,
  author: { did: 'did:plc:orig', handle: 'orig.test', avatar: AV, ...(displayName ? { displayName } : {}) },
  value: { $type: 'app.bsky.feed.post', text, createdAt: T },
  labels: [], likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0, indexedAt: T,
  ...(embeds.length ? { embeds } : {}),
});
const quoting = (record) => ({ $type: 'app.bsky.embed.record#view', record });

// ---- the matrix ----------------------------------------------------------
// row  — what the FEED ROW must draw
// post — what the POST PAGE must draw
// reply — what the REPLY NODE in a thread must draw
// All three are declared for every shape; `expect()` below fails a shape that
// leaves any of them out, so "we forgot to think about the other surface"
// is a red test rather than a silent gap.
const NOTHING = { ownStage: 0, ownGrid: 0, ownExt: 0, ownGif: 0, gifPlayer: null, carousel: 0, strip: 0, quoted: 0, quotedStage: 0, quotedExt: 0,
  quotedWho: null, quotedHandle: null };
const SHAPES = [
  { key: 'text', why: 'a plain text post draws no media anywhere',
    text: 'just words, no embed at all', embed: null,
    row: { ...NOTHING, words: true }, post: { ...NOTHING, words: true },
    reply: { ...NOTHING, words: true } },

  { key: 'onepic', why: 'one picture is one stage — on EVERY surface (the 2026-08-28 and 2026-08-30 repairs, together)',
    text: 'one picture', embed: images(img('a', { width: 1600, height: 1200 })),
    row: { ...NOTHING, ownStage: 1, words: true }, post: { ...NOTHING, ownStage: 1, words: true },
    reply: { ...NOTHING, ownStage: 1, words: true } },

  { key: 'fourpic', why: 'more pictures than the reader asked to see at once fold into ONE carousel, never four stages (js/pictures.js owns the rule; the default is 1)',
    text: 'four pictures',
    embed: images(img('4a', { width: 1600, height: 1200 }), img('4b', { width: 1080, height: 1920 }),
      img('4c', { width: 1920, height: 1080 }), img('4d', { width: 1200, height: 1200 })),
    row: { ...NOTHING, ownStage: 1, carousel: 1, words: true },
    post: { ...NOTHING, ownStage: 1, carousel: 1, words: true },
    reply: { ...NOTHING, ownStage: 1, carousel: 1, words: true } },

  { key: 'videoplays', why: 'v13 decision 30: a native video PLAYS IN PLACE, so it is a stage, never the link-out strip',
    text: 'a clip', embed: video('v'),
    row: { ...NOTHING, ownStage: 1, words: true }, post: { ...NOTHING, ownStage: 1, words: true },
    reply: { ...NOTHING, ownStage: 1, words: true } },

  { key: 'videonoplaylist', why: 'a video with no playlist has nothing to play: the honest fallback is the strip that links out',
    text: 'a clip we cannot play', embed: video('vn', { width: 1280, height: 720 }, null),
    row: { ...NOTHING, strip: 1, words: true }, post: { ...NOTHING, strip: 1, words: true },
    reply: { ...NOTHING, strip: 1, words: true } },

  { key: 'extcard', why: 'a link card is a card with a stage for its og:image',
    text: 'a link', embed: external({ uri: 'https://example.test/a', title: 'A page' }),
    row: { ...NOTHING, ownExt: 1, ownStage: 1, words: true }, post: { ...NOTHING, ownExt: 1, ownStage: 1, words: true },
    reply: { ...NOTHING, ownExt: 1, ownStage: 1, words: true } },

  { key: 'linknothumb', why: 'post-text 2026-09-01: no og:image is a card of WORDS, not no card — the link used to go nowhere',
    text: 'a statement with no picture', embed: external({ uri: 'https://example.test/b', title: 'A statement', thumb: null }),
    row: { ...NOTHING, ownExt: 1, words: true }, post: { ...NOTHING, ownExt: 1, words: true },
    reply: { ...NOTHING, ownExt: 1, words: true } },

  { key: 'klipygif', why: 'gif-embeds 2026-09-02: a klipy GIF is a PLAYER on every surface, not a frozen link card — and it plays klipy\'s own video, 9.2x cheaper than the .gif',
    text: 'a gif', embed: external({ uri: 'https://static.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/61/56/RiZHW3kybKsT6j.gif?hh=415&ww=498&mp4=8pcPaPB1Eow6fc&webm=0Ds0ULMJw0vWjEZ6NMLN',
      title: 'Warrior Nun Ava Running Through Water', description: 'ALT: Warrior Nun Ava Running Through Water' }),
    row: { ...NOTHING, ownExt: 1, ownGif: 1, ownStage: 1, gifPlayer: 'video', words: true },
    post: { ...NOTHING, ownExt: 1, ownGif: 1, ownStage: 1, gifPlayer: 'video', words: true },
    reply: { ...NOTHING, ownExt: 1, ownGif: 1, ownStage: 1, gifPlayer: 'video', words: true } },

  { key: 'tenorgif', why: 'gif-embeds follow-up 2026-09-02: tenor has a probed video form too (52x on one measured id), served from tenor\'s OWN host',
    text: 'a tenor gif', embed: external({ uri: 'https://media.tenor.com/Zc-ZTPzlEHoAAAAC/i-don%27t-know-idk.gif?hh=220&ww=320', title: 'I Dont Know' }),
    row: { ...NOTHING, ownExt: 1, ownGif: 1, ownStage: 1, gifPlayer: 'video', words: true },
    post: { ...NOTHING, ownExt: 1, ownGif: 1, ownStage: 1, gifPlayer: 'video', words: true },
    reply: { ...NOTHING, ownExt: 1, ownGif: 1, ownStage: 1, gifPlayer: 'video', words: true } },

  { key: 'plaingif', why: 'gif-embeds: a .gif we have no verified video for still animates — on its OWN uri, never a constructed one (CLAUDE.md § External APIs)',
    text: 'a giphy gif', embed: external({ uri: 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif', title: 'Shrug' }),
    row: { ...NOTHING, ownExt: 1, ownGif: 1, ownStage: 1, gifPlayer: 'image', words: true },
    post: { ...NOTHING, ownExt: 1, ownGif: 1, ownStage: 1, gifPlayer: 'image', words: true },
    reply: { ...NOTHING, ownExt: 1, ownGif: 1, ownStage: 1, gifPlayer: 'image', words: true } },

  { key: 'quotetext', why: 'quote-embed 2026-09-01: the FEED ROW shows what the post quotes — before this it showed nothing',
    text: 'look at this', embed: quoting(viewRecord('qt', 'the quoted words')),
    row: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', words: true }, post: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', words: true },
    reply: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', words: true } },

  { key: 'quotevideo', why: 'the owner’s report: a quote of a VIDEO post — the quoted video renders on both surfaces',
    text: 'is it so bad to expect a decent command of the language?',
    embed: quoting(viewRecord('qv', 'the quoted words', [video('qv')])),
    row: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedStage: 1, words: true },
    post: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedStage: 1, words: true },
    reply: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedStage: 1, words: true } },

  { key: 'quotenoname', why: 'a quoted author who chose no display name falls back to their handle — a blank name is not a name (feed-row v2), and printing nothing would be worse than printing the handle',
    text: 'they have no name set', embed: quoting(viewRecord('qnn', 'the quoted words', [], null)),
    row: { ...NOTHING, quoted: 1, quotedWho: 'orig.test', quotedHandle: 'orig.test', words: true },
    post: { ...NOTHING, quoted: 1, quotedWho: 'orig.test', quotedHandle: 'orig.test', words: true },
    reply: { ...NOTHING, quoted: 1, quotedWho: 'orig.test', quotedHandle: 'orig.test', words: true } },

  { key: 'quotepic', why: 'a quoted picture comes through the same door as a quoted video',
    text: 'this picture', embed: quoting(viewRecord('qp', 'the quoted words', [images(img('q', { width: 1600, height: 1200 }))])),
    row: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedStage: 1, words: true },
    post: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedStage: 1, words: true },
    reply: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedStage: 1, words: true } },

  { key: 'quoteext', why: 'a quoted link post shows the quoted card, and the quoting post has none of its own',
    text: 'this article', embed: quoting(viewRecord('qe', 'read this', [external({ uri: 'https://example.test/c', title: 'C' })])),
    row: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedExt: 1, quotedStage: 1, words: true },
    post: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedExt: 1, quotedStage: 1, words: true },
    reply: { ...NOTHING, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedExt: 1, quotedStage: 1, words: true } },

  { key: 'rwm', why: 'recordWithMedia is BOTH: the post’s own picture and the post it quotes, neither swallowing the other',
    text: 'my picture, their post',
    embed: { $type: 'app.bsky.embed.recordWithMedia#view',
      media: images(img('rw', { width: 1600, height: 1200 })),
      record: { record: viewRecord('rw', 'the quoted words', [video('rwv')]) } },
    row: { ...NOTHING, ownStage: 1, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedStage: 1, words: true },
    post: { ...NOTHING, ownStage: 1, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedStage: 1, words: true },
    reply: { ...NOTHING, ownStage: 1, quoted: 1, quotedWho: 'Orig Poster', quotedHandle: 'orig.test', quotedStage: 1, words: true } },

  { key: 'quotegone', why: 'a deleted target is ONE honest line — never a card reading "[unknown]" over nothing',
    text: 'quoting something that went away',
    embed: quoting({ $type: 'app.bsky.embed.record#viewNotFound', uri: 'at://did:plc:orig/app.bsky.feed.post/gone', notFound: true }),
    row: { ...NOTHING, quoted: 1, gone: 'notFound', words: true },
    post: { ...NOTHING, quoted: 1, gone: 'notFound', words: true },
    reply: { ...NOTHING, quoted: 1, gone: 'notFound', words: true } },

  { key: 'quotefeed', why: 'a quoted FEED is not a quoted post: it carries a uri and no words, and used to draw an empty post card',
    text: 'this feed is good',
    embed: quoting({ $type: 'app.bsky.feed.defs#generatorView', uri: 'at://did:plc:orig/app.bsky.feed.generator/g',
      cid: 'cid-g', displayName: 'Discover', creator: { did: 'did:plc:orig', handle: 'orig.test' }, indexedAt: T }),
    row: { ...NOTHING, words: true }, post: { ...NOTHING, words: true },
    reply: { ...NOTHING, words: true } },

  { key: 'altonly', why: 'a wordless picture WITH alt text titles from the alt — the surface has words to show, so it shows them',
    text: '', embed: images(img('alt', { width: 1600, height: 1200 })),
    row: { ...NOTHING, ownStage: 1, words: true }, post: { ...NOTHING, ownStage: 1, words: true },
    // a reply has no heading to fall back into: the alt text names the picture
    // to a screen reader (it is the img's alt) and is not a caption the author wrote
    reply: { ...NOTHING, ownStage: 1, words: false } },

  { key: 'noalt', why: 'no words and no alt: the title is a PLACEHOLDER ("[image]") and drops where the picture itself shows — "[image]" above the actual image names nothing (live 2026-08-28)',
    text: '', embed: images({ thumb: 'https://cdn.test/na-t.jpg', fullsize: 'https://cdn.test/na.jpg', alt: '', aspectRatio: { width: 1600, height: 1200 } }),
    row: { ...NOTHING, ownStage: 1, words: false }, post: { ...NOTHING, ownStage: 1, words: false },
    reply: { ...NOTHING, ownStage: 1, words: false } },
];

// Both the row selector and the shim's fixture routing address a shape by its
// key as a SUBSTRING of a url. So a key that is a prefix of another key grades
// the wrong post — silently, and in the passing direction. It happened twice on
// this file's first run ("video" inside "videonopl", in the selector and again
// in the getPostThread routing), so the hazard is asserted rather than
// remembered.
for (const a of SHAPES) {
  for (const b of SHAPES) {
    if (a !== b) assert.ok(!b.key.startsWith(a.key), `shape key "${a.key}" is a prefix of "${b.key}" — url-substring matching would grade the wrong post`);
  }
}

const FEED = { feed: SHAPES.map((s) => ({ post: postView(s.key, s.text, s.embed) })) };

// ---- surface 3's fixture: one thread, every shape as a reply -------------
// A reply is by SOMEONE ELSE, deliberately. shapeLensThread HOISTS an unbroken
// same-author reply chain out of the comments and into the post's body (the
// 1/3-2/3-3/3 self-thread), so replies authored by the root's author would
// have swallowed the first shape into the head and re-rooted the rest. The
// bug under test is about replies; the fixture has to actually produce them.
const REPLIER = 'did:plc:bb';
const replyUri = (rkey) => `at://${REPLIER}/app.bsky.feed.post/${rkey}`;
const replyView = (rkey, text, embed) => ({
  uri: replyUri(rkey), cid: `cid-r-${rkey}`,
  author: { did: REPLIER, handle: 'bb.test', displayName: 'B B', avatar: AV },
  record: { $type: 'app.bsky.feed.post', text, createdAt: T }, indexedAt: T,
  replyCount: 0, repostCount: 0, likeCount: 1, quoteCount: 0,
  ...(embed ? { embed } : {}),
});
const ROOT = 'threadroot';
const THREAD = { thread: { $type: 'app.bsky.feed.defs#threadViewPost',
  post: postView(ROOT, 'a thread whose replies are every shape', null),
  replies: SHAPES.map((s) => ({ $type: 'app.bsky.feed.defs#threadViewPost',
    post: replyView(s.key, s.text, s.embed), replies: [] })) } };

const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getFeedGenerator?': { view: { uri: 'at://x/app.bsky.feed.generator/whats-hot', displayName: 'Discover',
    description: 'trending', likeCount: 1, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
  // one thread per shape, keyed by its uri — first match wins in the shim, so
  // these must come BEFORE the bare 'getPostThread' catch-all
  ...Object.fromEntries(SHAPES.map((s) => [
    `getPostThread?uri=${encodeURIComponent(uriOf(s.key))}`,
    { thread: { $type: 'app.bsky.feed.defs#threadViewPost', post: postView(s.key, s.text, s.embed), replies: [] } },
  ])),
  [`getPostThread?uri=${encodeURIComponent(uriOf(ROOT))}`]: THREAD,
  'getFeed?': FEED, 'getFeed': FEED,
  'getPostThread': { thread: { post: postView('text', 'fallback', null), replies: [] } },
  'getQuotes': { posts: [] },
  'constellation.microcosm.blue/links?target=': { total: 0, linking_records: [] },
  'getPreferences': { preferences: [] },
  'getMutes': { mutes: [] }, 'getBlocks': { blocks: [] },
  'getListMutes': { lists: [] }, 'getListBlocks': { lists: [] },
};

// What each cell counts, scoped to one post's subtree. `:not(.quoted *)` is not
// a thing CSS can say, so the quoted media is counted first and subtracted —
// which is also the assertion that ownStage and quotedStage are different
// questions, the distinction the old checks did not draw.
async function observe(page, scope) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const n = (s) => el.querySelectorAll(s).length;
    const quotedCard = el.querySelector('.card.quoted');
    const inQuote = (s) => (quotedCard ? quotedCard.querySelectorAll(s).length : 0);
    return {
      ownStage: n('.stage') - inQuote('.stage'),
      ownGrid: n('.stage-grid') - inQuote('.stage-grid'),
      carousel: n('.stage.carousel') - inQuote('.stage.carousel'),
      ownExt: n('.extcard') - inQuote('.extcard'),
      // gif-embeds: a GIF card IS an .extcard (it keeps the card's identity,
      // D8), so ownExt still counts it — this says which of them animate, and
      // `gifPlayer` says whether the cheap video or the .gif itself is loaded.
      ownGif: n('[data-gifcard]') - inQuote('[data-gifcard]'),
      gifPlayer: (el.querySelector('[data-gifcard] .stage[data-stage="gif"]') || {}).getAttribute?.('data-gif') ?? null,
      strip: n('.media-strip') - inQuote('.media-strip'),
      quoted: n('[data-quoted]'),
      quotedStage: inQuote('.stage'),
      quotedExt: inQuote('.extcard'),
      gone: quotedCard?.getAttribute('data-quoted') !== '1' ? quotedCard?.getAttribute('data-quoted') ?? null : null,
      words: !!el.querySelector('.posttext')?.textContent.trim(),
      // who the quote card SAYS it is quoting, and the handle that node carries.
      // Two fields because they are two claims: people are named by the name
      // they chose, and the handle stays reachable beside it (whoNode's
      // contract, which every other byline in the app already keeps).
      quotedWho: quotedCard?.querySelector('.who')?.textContent.trim() ?? null,
      quotedHandle: quotedCard?.querySelector('.who')?.getAttribute('data-handle') ?? null,
    };
  }, scope);
}

function expect(shape, surface, seen) {
  const want = shape[surface];
  assert.ok(want, `shape "${shape.key}" declares nothing for the ${surface} surface — every shape must say what ALL THREE surfaces draw`);
  assert.ok(seen, `shape "${shape.key}" did not render on the ${surface} surface at all`);
  for (const [k, v] of Object.entries(want)) {
    assert.equal(seen[k] ?? null, v ?? null,
      `${shape.key} · ${surface} · ${k}: expected ${JSON.stringify(v)}, saw ${JSON.stringify(seen[k] ?? null)}\n    (${shape.why})`);
  }
}

// The row for a shape, by its thread link. ENDS-with, not contains: `video` is
// a prefix of `videonopl`, so a substring match found two rows for one shape
// and the matrix graded the wrong post (caught on its first run).
const rowOf = (key) => `.postrow:has(a[href$="%2F${key}"])`;
const HEAD = '.card:has(.head-byline)';
// A reply node by its at-uri. The leading slash is what makes ends-with exact:
// without it `text` would also match `quotetext`, the same hazard the key
// prefix guard above exists for, arriving from the other end of the string.
const replyOf = (key) => `.comment[data-node-id$="/${key}"]`;

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    const { page } = s;
    // no picture ever decodes: the shapes are about STRUCTURE, and a fenced
    // image cannot make a stage appear or disappear
    await page.route('**/*.jpg', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(0) }));
    await page.setViewportSize({ width: 1280, height: 900 });

    // ---- surface 1: the feed row ----------------------------------------
    await page.goto(`${s.origin}/f/whats-hot`);
    await page.waitForSelector('.postrow');
    for (const shape of SHAPES) {
      assert.equal(await page.locator(rowOf(shape.key)).count(), 1, `one row for "${shape.key}"`);
      expect(shape, 'row', await observe(page, rowOf(shape.key)));
    }

    // ---- surface 1b: the same rows, compact ------------------------------
    // feed-row v1: compact tightens a row, it does not take the post's content
    // out of it. The owner's phone runs a skin that prefers compact and showed
    // a feed with no pictures beside a thread page with them.
    await page.evaluate(() => localStorage.setItem('forage.boardview', 'compact'));
    await page.reload();
    await page.waitForSelector('.postrow');
    for (const shape of SHAPES) {
      expect(shape, 'row', await observe(page, rowOf(shape.key)));
    }
    await page.evaluate(() => localStorage.setItem('forage.boardview', 'card'));

    // ---- surface 1c: "pictures shown at once" turns the carousel into a grid
    // The one reader setting that changes WHICH element a shape draws, so the
    // matrix's own claim ("four pictures are one element") is checked at both
    // notches rather than at the default alone.
    await page.evaluate(() => localStorage.setItem('forage.pictures', '4'));
    await page.reload();
    await page.waitForSelector('.postrow');
    const atFour = await observe(page, rowOf('fourpic'));
    assert.equal(atFour.ownGrid, 1, 'at "4 pictures at once" the four fold into one grid');
    assert.equal(atFour.carousel, 0, 'and the carousel is gone — one element either way, never both');
    assert.equal(atFour.ownStage, 0, 'a grid is not a stage');
    await page.evaluate(() => localStorage.removeItem('forage.pictures'));

    // ---- surface 2: the post page ---------------------------------------
    for (const shape of SHAPES) {
      await page.goto(`${s.origin}/p?uri=${encodeURIComponent(uriOf(shape.key))}`);
      await page.waitForSelector(HEAD);
      expect(shape, 'post', await observe(page, HEAD));
    }

    // ---- surface 3: the reply node ---------------------------------------
    // One thread, every shape as a reply under it. A reply's embed is its
    // CONTENT — a wordless reply whose whole body is a quote of a picture is a
    // real and common shape, and it drew an empty row here until 2026-09-01.
    await page.goto(`${s.origin}/p?uri=${encodeURIComponent(uriOf(ROOT))}`);
    await page.waitForSelector('.comment');
    for (const shape of SHAPES) {
      assert.equal(await page.locator(replyOf(shape.key)).count(), 1, `one reply node for "${shape.key}"`);
      expect(shape, 'reply', await observe(page, replyOf(shape.key)));
    }

    assert.deepEqual(await s.shimMisses(), [], 'the matrix is hermetic: every request had a fixture');
  } finally {
    await s.close();
  }
}
