// W-self-thread-embeds — a hoisted self-thread part keeps what it carried.
//
// forage hoists an unbroken same-author reply chain into the head as the post's
// BODY (forum shape, lens.js § selfThread). Until 2026-09-02 the shape it built
// was { uri, text, facets } — no media, no quote — so an author who answered
// their own post with a picture, a clip, a link card or a GIF had the words
// rendered and the embed SILENTLY DROPPED. Found while building gif-embeds,
// when a fixture accidentally built that structure and the GIF vanished.
//
// Same family as the quote-embed drop fixed 2026-09-01 ("a quote of a video
// read as words alone"), arriving from the other direction. The shaping is held
// by test/lens.test.js; this holds the RENDER, because a shape that carries
// media and a head that never draws it is the same bug with a green unit test.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const AV = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const T = '2026-09-02T08:00:00Z';
const OP = 'did:plc:op';
const KLIPY = 'https://static.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/61/56/RiZHW3kybKsT6j.gif?hh=415&ww=498&mp4=8pcPaPB1Eow6fc&webm=0Ds0ULMJw0vWjEZ6NMLN';
const pic = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#5a7d5a"/></svg>');

const post = (rkey, did, text, embed = null) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`, ...(embed ? { embed } : {}),
  author: { did, handle: did.slice(8) + '.test', avatar: AV },
  record: { $type: 'app.bsky.feed.post', text, createdAt: T }, indexedAt: T,
  replyCount: 0, repostCount: 0, likeCount: 0, quoteCount: 0,
});

// the author answering themselves: 1/3 words, 2/3 a picture, 3/3 a GIF
const THREAD = { thread: {
  post: post('root', OP, 'A thread about the thing. 1/3'),
  replies: [{
    post: post('p2', OP, 'Here is the chart. 2/3', { $type: 'app.bsky.embed.images#view',
      images: [{ thumb: pic, fullsize: pic, alt: 'the chart', aspectRatio: { width: 1600, height: 900 } }] }),
    replies: [{
      post: post('p3', OP, 'And how I feel about it. 3/3', { $type: 'app.bsky.embed.external#view',
        external: { uri: KLIPY, title: 'Warrior Nun Ava Running Through Water',
          description: 'ALT: Warrior Nun Ava Running Through Water', thumb: pic } }),
      replies: [] }] }] } };

const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getPostThread': THREAD,
  'getQuotes': { posts: [] },
  'constellation.microcosm.blue/links?target=': { total: 0, linking_records: [] },
  'getPreferences': { preferences: [] },
  'getMutes': { mutes: [] }, 'getBlocks': { blocks: [] },
  'getListMutes': { lists: [] }, 'getListBlocks': { lists: [] },
};

export async function run() {
  const s = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    const { page } = s;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${s.origin}/p?uri=${encodeURIComponent(THREAD.thread.post.uri)}`);
    await page.waitForSelector('.card:has(.head-byline)');
    const head = page.locator('.card:has(.head-byline)').first();

    // the chain hoists as the body — the words were never the broken half
    const words = await head.textContent();
    for (const part of ['1/3', '2/3', '3/3']) {
      assert.ok(words.includes(part), `part ${part} is hoisted into the head`);
    }

    // ...and now so is what each part CARRIED
    assert.equal(await head.locator('.stage[data-stage="images"]').count(), 1,
      'the picture on part 2/3 renders — it used to vanish entirely');
    const gif = head.locator('[data-gifcard] .stage[data-stage="gif"]');
    assert.equal(await gif.count(), 1, 'the GIF on part 3/3 renders');
    assert.equal(await gif.getAttribute('data-gif'), 'video',
      'and it is a real player, not a still: a hoisted part is a body, so it renders like one');
    assert.equal(await gif.locator('[data-gifplay]').count(), 1, 'with its play/pause control');

    // order: each part's media follows ITS words, not all of it at the bottom
    // querySelectorAll returns DOCUMENT order, which is the question being asked
    const order = await head.evaluate((h) => [...h.querySelectorAll('.posttext, [data-gifcard], .stage[data-stage="images"]')]
      .map((n) => n.matches('[data-gifcard]') ? 'gif'
        : n.matches('.stage[data-stage="images"]') ? 'pic'
        : 't:' + n.textContent.trim().slice(-3)));
    const ix = (v) => order.indexOf(v);
    assert.ok(ix('t:2/3') !== -1 && ix('pic') > ix('t:2/3'), `the chart follows its own words (${order.join(' ')})`);
    assert.ok(ix('gif') > ix('t:3/3'), `the GIF follows its own words (${order.join(' ')})`);
    assert.ok(ix('pic') < ix('t:3/3'), `and 2/3's picture comes before 3/3's words (${order.join(' ')})`);

    s.consoleErrors(); s.errors();
  } finally { await s.close(); }
}
