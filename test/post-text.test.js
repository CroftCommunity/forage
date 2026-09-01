// post-text (2026-09-01): a Bluesky post's own WORDS, on every surface that
// shows them. The owner compared forage.fyi with bsky.app on a VGC news post
// and said ours "is much less readable"; the head had rendered its 280
// characters as one 26px serif run with the article's URL inert in the middle.
//
// Three pure questions live here — the rendering that consumes them is graded
// by e2e/mock-posttext.workflow.mjs against the same fixture the mock's
// pictures come from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facetSegments, trimCardLink, shapeLensPost } from '../js/substrates/lens.js';

const SRC = { feedId: 'f', feedSlug: 'whats-hot', feedTitle: 'Discover' };

// The record the owner compared, verbatim.
const NEWS_URL = 'https://www.videogameschronicle.com/news/sony-says-reasonable-consumers-know-they-dont-own-the-digital-games-they-buy/';
const NEWS_TEXT = 'Sony says "reasonable consumers" know they don’t own the digital PlayStation games they buy.\n\n'
  + 'It argues that it\'s "not plausible" to suggest that when they buy a digital game they actually believe they\'re "obtaining ownership" of it.\n\n'
  + 'www.videogameschronicle.com/news/sony-sa...';
const NEWS_FACETS = [{ index: { byteStart: 237, byteEnd: 280 },
  features: [{ $type: 'app.bsky.richtext.facet#link', uri: NEWS_URL }] }];

test('the record keeps its line structure — the shaped body is verbatim, breaks and all', () => {
  const p = shapeLensPost({ uri: 'at://d/app.bsky.feed.post/n', cid: 'c', author: { did: 'd', handle: 'h' },
    record: { text: NEWS_TEXT, createdAt: '2026-09-01T11:43:43Z', facets: NEWS_FACETS },
    embed: { $type: 'app.bsky.embed.external#view', external: { uri: NEWS_URL, title: 't', description: 'd' } } }, SRC);
  assert.equal(p.body, NEWS_TEXT);
  assert.equal(p.body.split('\n\n').length, 3, 'three blocks, as the author wrote them');
});

test('an external embed with NO thumbnail still gives the post a card to render', () => {
  // Observed on the live network: press releases and statement links often carry
  // no og:image. The lens guarded its card on `external.thumb`, so the whole
  // link — title, description, host — had nowhere to go and the post lost it.
  const p = shapeLensPost({ uri: 'at://d/app.bsky.feed.post/n', cid: 'c', author: { did: 'd', handle: 'h' },
    record: { text: 'statement is up', createdAt: '2026-09-01T10:00:00Z' },
    embed: { $type: 'app.bsky.embed.external#view',
      external: { uri: 'https://press.example.org/s/2', title: 'Statement', description: 'short' } } }, SRC);
  assert.equal(p.media?.kind, 'external');
  assert.equal(p.media.uri, 'https://press.example.org/s/2');
  assert.equal(p.media.title, 'Statement');
  assert.equal(p.media.thumb, null, 'no thumbnail: the card renders without a stage, it does not vanish');
});

test('a thread node carries its facets — a reply’s link, tag and mention are live too', () => {
  // The node shape dropped `facets` entirely, so every link in every reply on
  // every thread was inert text. The row had been faceted since feed-row v13.
  const p = shapeLensPost({ uri: 'at://d/app.bsky.feed.post/r', cid: 'c', author: { did: 'd', handle: 'h' },
    record: { text: 'see www.example.org/a... #tag', createdAt: '2026-09-01T12:00:00Z',
      facets: [{ index: { byteStart: 4, byteEnd: 22 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://www.example.org/article' }] }] } }, SRC);
  assert.equal(p.facets.length, 1);
});

// ---- trimCardLink: the trailing URL the card already is ----------------------

test('trimCardLink drops a trailing link facet that is the card’s own url', () => {
  const out = trimCardLink(NEWS_TEXT, NEWS_FACETS, NEWS_URL);
  assert.equal(out.text, NEWS_TEXT.slice(0, 233), 'the words stay; the duplicate url and its blank line go');
  assert.ok(out.text.endsWith('"obtaining ownership" of it.'), 'and nothing else is cut');
  assert.ok(!out.text.includes('videogameschronicle.com/news/sony-sa'));
  assert.equal(out.facets.length, 0, 'the facet goes with the text it indexed');
});

test('trimCardLink leaves a link that is NOT the card’s url', () => {
  const other = [{ index: { byteStart: 237, byteEnd: 280 },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.org/somewhere-else' }] }];
  const out = trimCardLink(NEWS_TEXT, other, NEWS_URL);
  assert.equal(out.text, NEWS_TEXT);
  assert.equal(out.facets.length, 1);
});

test('trimCardLink leaves a matching link that is NOT at the end', () => {
  // The author wrote around the link: trimming would cut the sentence in half.
  const text = 'www.example.org/a... is the filing, and it is worth your time.';
  const facets = [{ index: { byteStart: 0, byteEnd: 19 },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://www.example.org/a' }] }];
  const out = trimCardLink(text, facets, 'https://www.example.org/a');
  assert.equal(out.text, text);
  assert.equal(out.facets.length, 1);
});

test('trimCardLink with no card, no facets, or an empty text is the identity', () => {
  assert.equal(trimCardLink(NEWS_TEXT, NEWS_FACETS, null).text, NEWS_TEXT);
  assert.equal(trimCardLink(NEWS_TEXT, NEWS_FACETS, '').text, NEWS_TEXT);
  assert.equal(trimCardLink(NEWS_TEXT, [], NEWS_URL).text, NEWS_TEXT);
  assert.equal(trimCardLink('', [], NEWS_URL).text, '');
});

test('trimCardLink that would leave nothing keeps the text — a url-only post still says something', () => {
  const text = 'www.example.org/a...';
  const facets = [{ index: { byteStart: 0, byteEnd: 20 },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://www.example.org/a' }] }];
  const out = trimCardLink(text, facets, 'https://www.example.org/a');
  assert.equal(out.text, text, 'trimming to empty would erase the post');
  assert.equal(out.facets.length, 1);
});

test('trimCardLink matches a url the author wrote with a trailing slash difference', () => {
  const text = 'the ruling is out\n\nexample.org/ruling...';
  const facets = [{ index: { byteStart: 19, byteEnd: 40 },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.org/ruling/' }] }];
  const out = trimCardLink(text, facets, 'https://example.org/ruling');
  assert.equal(out.text, 'the ruling is out');
});

test('trimCardLink is byte-honest — an emoji before the link does not shift the cut', () => {
  const text = 'ruling ⚖️ is out\n\nexample.org/r...';
  const enc = new TextEncoder();
  const start = enc.encode(text.slice(0, text.indexOf('example.org'))).length;
  const facets = [{ index: { byteStart: start, byteEnd: enc.encode(text).length },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.org/r' }] }];
  const out = trimCardLink(text, facets, 'https://example.org/r');
  assert.equal(out.text, 'ruling ⚖️ is out');
});

test('facetSegments still decodes what trimCardLink leaves behind', () => {
  const out = trimCardLink(NEWS_TEXT, NEWS_FACETS, NEWS_URL);
  const segs = facetSegments(out.text, out.facets);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].facet, undefined);
  assert.equal(segs.map((s) => s.text).join(''), out.text);
});
