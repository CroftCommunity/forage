// 3w: composing a post. The FIRST thing Forage writes that is not a like.
//
// VERIFIED against the official lexicon (app/bsky/feed/post.json, fetched
// 2026-08-26), not inferred:
//   • required: ["text", "createdAt"]
//   • text: maxLength 3000 (BYTES) AND maxGraphemes 300 — two different
//     limits, and the grapheme one is what a person experiences. A naive
//     text.length counts UTF-16 code units and is wrong for both.
//   • facets: byte-indexed annotations (app.bsky.richtext.facet), the same
//     shape the reader already decodes in facetSegments.
//   • tags: "Additional hashtags, in addition to any included in post text
//     and facets" — so a tag in the text needs a FACET, not this field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST_LIMITS, graphemes, byteLength, detectFacets, withTag, buildPost } from '../js/compose.js';

const utf8 = (s) => new TextEncoder().encode(s);

test('3w: the limits are the lexicon’s, and graphemes are counted as people see them', () => {
  assert.deepEqual(POST_LIMITS, { graphemes: 300, bytes: 3000 });
  assert.equal(graphemes('hello'), 5);
  // one family emoji is ONE character to a person and 11 UTF-16 units to JS
  assert.equal(graphemes('👨‍👩‍👧‍👦'), 1);
  assert.equal('👨‍👩‍👧‍👦'.length, 11, 'the naive count that would have been wrong');
  assert.equal(graphemes('café'), 4);
  assert.equal(graphemes(''), 0);
  // bytes are the OTHER limit, and they are utf-8 bytes
  assert.equal(byteLength('hello'), 5);
  assert.equal(byteLength('日本語'), 9);
});

test('3w: hashtags in the text become BYTE-indexed tag facets', () => {
  const text = 'planting #garlic today';
  const facets = detectFacets(text);
  assert.equal(facets.length, 1);
  const f = facets[0];
  assert.equal(f.features[0].$type, 'app.bsky.richtext.facet#tag');
  assert.equal(f.features[0].tag, 'garlic', 'the tag value carries NO # — the lexicon wants the bare tag');
  // the indices must slice the # and the tag back out of the UTF-8 BYTES
  const bytes = utf8(text);
  const sliced = new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
  assert.equal(sliced, '#garlic');
});

test('3w: byte indices survive text that is not ASCII — the trap this exists to avoid', () => {
  const text = '日本語の庭 #gardening です';
  const [f] = detectFacets(text);
  const sliced = new TextDecoder().decode(utf8(text).slice(f.index.byteStart, f.index.byteEnd));
  assert.equal(sliced, '#gardening', 'a UTF-16 offset here would land mid-character');
  assert.notEqual(f.index.byteStart, text.indexOf('#gardening'), 'and it is genuinely different from the JS index');
});

test('3w: links are faceted too, and trailing punctuation is not part of the url', () => {
  const facets = detectFacets('see https://example.com/a-b?c=1, then go');
  assert.equal(facets.length, 1);
  assert.equal(facets[0].features[0].$type, 'app.bsky.richtext.facet#link');
  assert.equal(facets[0].features[0].uri, 'https://example.com/a-b?c=1');
});

test('3w: multiple facets come back in text order, non-overlapping', () => {
  const facets = detectFacets('#a and #b and https://x.test');
  assert.deepEqual(facets.map((f) => f.features[0].tag || f.features[0].uri), ['a', 'b', 'https://x.test']);
  for (let i = 1; i < facets.length; i += 1) {
    assert.ok(facets[i].index.byteStart >= facets[i - 1].index.byteEnd, 'facets never overlap');
  }
});

test('3w: withTag adds the board’s tag only when the writer did not', () => {
  assert.equal(withTag('hello', 'garden'), 'hello #garden');
  assert.equal(withTag('hello #garden', 'garden'), 'hello #garden', 'already there — do not double it');
  assert.equal(withTag('hello #Garden', 'garden'), 'hello #Garden', 'hashtags are matched case-insensitively');
  assert.equal(withTag('hello #gardening', 'garden'), 'hello #gardening #garden', 'a longer tag is a DIFFERENT tag');
  assert.equal(withTag('   ', 'garden'), '#garden');
});

test('3w: buildPost produces a record the lexicon accepts, and nothing else', () => {
  const rec = buildPost({ text: 'planting #garlic', langs: ['en'], now: new Date('2026-08-26T12:00:00.000Z') });
  assert.equal(rec.$type, 'app.bsky.feed.post');
  assert.equal(rec.text, 'planting #garlic');
  assert.equal(rec.createdAt, '2026-08-26T12:00:00.000Z');
  assert.equal(rec.facets.length, 1);
  assert.deepEqual(rec.langs, ['en']);
  assert.equal(rec.tags, undefined, 'a tag written in the text is a FACET, never also the tags field');
  assert.equal(rec.embed, undefined, 'no media in this unit — absent, not null');
  assert.equal(rec.reply, undefined);
});

test('3w: buildPost REFUSES over-limit text, naming which limit and by how much', () => {
  const long = 'x'.repeat(301);
  assert.throws(() => buildPost({ text: long, now: new Date() }), /301.*300|300.*301/);
  // 300 family emoji are 300 characters to a person and 7500 bytes on the
  // wire: under the grapheme cap, over the byte cap. This is exactly the case
  // a grapheme-only check would let through and the network would reject.
  const fat = '👨‍👩‍👧‍👦'.repeat(300);
  assert.equal(graphemes(fat), 300);
  assert.ok(byteLength(fat) > POST_LIMITS.bytes);
  assert.throws(() => buildPost({ text: fat, now: new Date() }), /byte/i);
  // empty is not a post
  assert.throws(() => buildPost({ text: '   ', now: new Date() }), /empty|nothing/i);
});

test('3w: a reply carries root and parent, both with cid — the lexicon requires both', () => {
  const parent = { uri: 'at://did:plc:a/app.bsky.feed.post/p1', cid: 'cid-p1' };
  const root = { uri: 'at://did:plc:a/app.bsky.feed.post/r0', cid: 'cid-r0' };
  const rec = buildPost({ text: 'agreed', replyTo: { root, parent }, now: new Date('2026-08-26T12:00:00.000Z') });
  assert.deepEqual(rec.reply, { root, parent });
  // replying to the top of a thread makes it its own root
  const top = buildPost({ text: 'agreed', replyTo: { root: parent, parent }, now: new Date() });
  assert.equal(top.reply.root.uri, top.reply.parent.uri);
  // a parent without a cid is unusable — refuse rather than write a broken ref
  assert.throws(() => buildPost({ text: 'x', replyTo: { root, parent: { uri: parent.uri } }, now: new Date() }), /cid/i);
});

// ---- Phase 1 live-proof findings (2026-08-26) ----
// The smoke run against the real network wrote a post whose record carried NO
// `langs`. That is what this code does when no Forage content-language is set,
// and it is wrong in a way the tests could not see: every other client declares
// a language, language filters everywhere key off it, and a post declaring
// nothing is invisible to all of them — including our own 3u filter. The
// browser already knows what language the writer is working in; not passing it
// was an omission, not a decision.

test('phase-1 finding: a post declares a language — the browser’s, when nothing else is set', () => {
  const rec = buildPost({ text: 'planting garlic', navLang: 'en-US', now: new Date() });
  assert.deepEqual(rec.langs, ['en'], 'the region is dropped — the language is the claim, not the locale');

  // an explicit Forage content-language wins over the browser
  const pref = buildPost({ text: 'x', langs: ['ja'], navLang: 'en-US', now: new Date() });
  assert.deepEqual(pref.langs, ['ja']);

  // and when we genuinely know nothing, we say nothing rather than guessing
  const unknown = buildPost({ text: 'x', now: new Date() });
  assert.equal(unknown.langs, undefined, 'no source of truth means no claim');
});

// ---- Phase 3: images ----
// Phase 3.0 probed the REAL PDS rather than trusting the lexicon's prose.
// Five findings, all of which shaped these rules:
//   A. uploadBlob returns {$type:'blob', ref:{$link}, mimeType, size}
//   B. the PDS SNIFFS the type — an octet-stream upload of a PNG came back
//      mimeType image/png, so an accurate Content-Type is not load-bearing
//   C. uploadBlob returns 200 for an OVERSIZED blob; the refusal arrives later
//      at createRecord: "blob too big (maximum 2000000, got 2100928)". So a
//      client-side size check is not belt-and-braces, it is the only thing
//      standing between a user and an upload that fails after it finishes.
//   D. a post with images and EMPTY TEXT is accepted — so "empty is not a
//      post" has to relax when there is an image to carry it
//   E. alt is enforced by the SERVER: omitting it fails with
//      'Missing required key "alt"'. Requiring it is not our stylistic
//      preference; it is what the network demands.
import { IMAGE_LIMITS } from '../js/compose.js';

const blob = (size = 268, mime = 'image/png') => ({
  $type: 'blob', ref: { $link: 'bafkreidaka7xogx2hzv5okhgy3zqwnj6rum3aseubqp23owl6umnou7m5y' },
  mimeType: mime, size,
});

test('3.1: the image limits are the ones the PDS actually enforces', () => {
  assert.deepEqual(IMAGE_LIMITS, { count: 4, bytes: 2000000 });
});

test('3.1: images become an app.bsky.embed.images embed, alt and all', () => {
  const rec = buildPost({
    text: 'first tomato',
    images: [{ blob: blob(), alt: 'a red tomato on a vine', aspectRatio: { width: 16, height: 9 } }],
    now: new Date('2026-08-26T12:00:00.000Z'),
  });
  assert.equal(rec.embed.$type, 'app.bsky.embed.images');
  assert.equal(rec.embed.images.length, 1);
  assert.deepEqual(rec.embed.images[0].image, blob(), 'the blob ref goes through verbatim');
  assert.equal(rec.embed.images[0].alt, 'a red tomato on a vine');
  assert.deepEqual(rec.embed.images[0].aspectRatio, { width: 16, height: 9 });
  // omitted rather than nulled when not supplied
  const noRatio = buildPost({ text: 'x', images: [{ blob: blob(), alt: 'a' }], now: new Date() });
  assert.equal('aspectRatio' in noRatio.embed.images[0], false);
});

test('3.1: finding E — alt text is REQUIRED, and blank is not alt text', () => {
  for (const bad of [undefined, '', '   ']) {
    assert.throws(
      () => buildPost({ text: 'x', images: [{ blob: blob(), alt: bad }], now: new Date() }),
      /alt/i,
      `alt ${JSON.stringify(bad)} must be refused before the network refuses it`,
    );
  }
});

test('3.1: finding C — an oversized image is refused HERE, naming the limit and the overage', () => {
  let err;
  try {
    buildPost({ text: 'x', images: [{ blob: blob(2100928), alt: 'big' }], now: new Date() });
    assert.fail('an oversized image must be refused before it is uploaded');
  } catch (e) { err = e; }
  assert.match(err.message, /2100928/, 'says how big it actually is');
  assert.match(err.message, /2000000|2 MB/i, 'and what the limit is');
});

test('3.1: at most four images, and only images', () => {
  const four = Array.from({ length: 4 }, (_, i) => ({ blob: blob(), alt: `image ${i}` }));
  assert.equal(buildPost({ text: 'x', images: four, now: new Date() }).embed.images.length, 4);
  assert.throws(() => buildPost({ text: 'x', images: [...four, { blob: blob(), alt: 'fifth' }], now: new Date() }),
    /4|four/i);
  assert.throws(() => buildPost({ text: 'x', images: [{ blob: blob(268, 'video/mp4'), alt: 'a' }], now: new Date() }),
    /image/i, 'the lexicon accepts image/* and nothing else here');
});

test('3.1: finding D — an image post needs no words, but a wordless post needs an image', () => {
  const rec = buildPost({ text: '', images: [{ blob: blob(), alt: 'just a picture' }], now: new Date() });
  assert.equal(rec.text, '', 'the lexicon accepts empty text when an embed carries the post');
  assert.ok(rec.embed);
  // without an image, empty is still nothing to say
  assert.throws(() => buildPost({ text: '   ', now: new Date() }), /empty|nothing/i);
});

test('3.2 finding: aspectRatio is passed when known and omitted when not', () => {
  // The appview returned aspectRatio: null for our probe post, because we sent
  // none. Clients use it to reserve space before the image loads; without it a
  // viewer's feed jumps as each picture arrives. We already load the file to
  // preview it, so the dimensions are free — but they must be INTEGERS ≥ 1
  // (lexicon app.bsky.embed.defs#aspectRatio) and absent when unknown, never
  // guessed.
  const b = { $type: 'blob', ref: { $link: 'x' }, mimeType: 'image/png', size: 10 };
  const withRatio = buildPost({ text: 'x', images: [{ blob: b, alt: 'a', aspectRatio: { width: 1600, height: 900 } }], now: new Date() });
  assert.deepEqual(withRatio.embed.images[0].aspectRatio, { width: 1600, height: 900 });

  // a zero or fractional dimension is not a ratio the lexicon accepts — drop
  // it rather than send something that will be rejected or misread
  for (const bad of [{ width: 0, height: 10 }, { width: 10, height: 0 }, { width: 1.5, height: 2 }, { width: -4, height: 3 }]) {
    const rec = buildPost({ text: 'x', images: [{ blob: b, alt: 'a', aspectRatio: bad }], now: new Date() });
    assert.equal('aspectRatio' in rec.embed.images[0], false, `${JSON.stringify(bad)} is not a usable ratio`);
  }
});
