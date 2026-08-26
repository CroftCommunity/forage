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
