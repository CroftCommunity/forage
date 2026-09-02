// gif-embeds phase 0 (owner 2026-09-02: "the gif shuld show a play/pause
// overlay … not just tha tpost, but that TYPE of post").
//
// An external embed that is really an animation. Two shapes, and the split is
// about what has been VERIFIED, not about who the provider is:
//
//   klipy  — the record carries `hh`/`ww` and `mp4=`/`webm=` slugs, and
//            static.klipy.com serves those videos itself (measured 2026-09-02:
//            953,992 B webm and 1,458,814 B mp4 against 8,773,093 B for the
//            .gif, all `access-control-allow-origin: *`). 9.2x cheaper, so the
//            video wins where the record hands us the slugs.
//   .gif   — anything else. The record's OWN uri, nothing constructed. Tenor
//            has a cheaper video form too, but its rewrite could not be
//            exercised from here (CLAUDE.md § External APIs), so it plays as
//            an image rather than as a guess that might 404.
//
// Pure: no network, no DOM, no localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gifOf, parseAlt } from '../js/gif.js';

// the owner's two posts, verbatim from the records (did:plc:bqmixtqt7niypsaj6h7yy6ju).
// Both reported 2026-09-02; the second confirmed the first was a TYPE and not a
// one-off. They are landscape and portrait on purpose — the stage sizes from
// hh/ww before anything loads, so one orientation proving it proves nothing.
const KLIPY = 'https://static.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/61/56/RiZHW3kybKsT6j.gif?hh=415&ww=498&mp4=8pcPaPB1Eow6fc&webm=0Ds0ULMJw0vWjEZ6NMLN';
const KLIPY_PORTRAIT = 'https://static.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/75/c5/PbsJs3z2wdMgRe6u.gif?hh=343&ww=260&mp4=ULTEdSmY5WVrY4&webm=5pnMJhe2bAm1ixZ';

test('gif: the second reported post is the same type, portrait', () => {
  const g = gifOf(KLIPY_PORTRAIT);
  assert.equal(g.kind, 'video');
  assert.deepEqual(g.aspect, { w: 260, h: 343 });
  assert.deepEqual(g.sources.map((s) => s.src), [
    'https://static.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/75/c5/5pnMJhe2bAm1ixZ.webm',
    'https://static.klipy.com/ii/4493325008d34b7bf8cd6813cd5c1619/75/c5/ULTEdSmY5WVrY4.mp4',
  ]);
});

test('gif: the owner\'s klipy post plays as video, from klipy\'s own host', () => {
  const g = gifOf(KLIPY);
  assert.equal(g.kind, 'video');
  // webm first: browsers take the first source they support, and it is the
  // smaller of the two. The slugs differ per format — klipy does not key them
  // off one id the way tenor does — so each filename comes from its own param.
  assert.deepEqual(g.sources, [
    { src: 'https://static.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/61/56/0Ds0ULMJw0vWjEZ6NMLN.webm', type: 'video/webm' },
    { src: 'https://static.klipy.com/ii/4e7bea9f7a3371424e6c16ebc93252fe/61/56/8pcPaPB1Eow6fc.mp4', type: 'video/mp4' },
  ]);
  // hh/ww are the true dimensions; the stage sizes from them BEFORE anything
  // loads, the same contract js/ui/stage.js already has for pictures
  assert.deepEqual(g.aspect, { w: 498, h: 415 });
});

test('gif: D3 — the origin host, never a third party', () => {
  // social-app rewrites klipy to its own CDN (k.gifs.bsky.app). Both answer
  // with identical bytes; forage takes the host already named in the record so
  // that reading a post trusts nobody new.
  for (const s of gifOf(KLIPY).sources) {
    assert.equal(new URL(s.src).hostname, 'static.klipy.com');
  }
});

test('gif: one slug is enough; the missing format is simply not offered', () => {
  const onlyMp4 = gifOf(KLIPY.replace('&webm=0Ds0ULMJw0vWjEZ6NMLN', ''));
  assert.equal(onlyMp4.kind, 'video');
  assert.deepEqual(onlyMp4.sources.map((s) => s.type), ['video/mp4']);

  const onlyWebm = gifOf(KLIPY.replace('mp4=8pcPaPB1Eow6fc&', ''));
  assert.equal(onlyWebm.kind, 'video');
  assert.deepEqual(onlyWebm.sources.map((s) => s.type), ['video/webm']);
});

test('gif: a klipy uri missing what video needs degrades to its own .gif, never to nothing', () => {
  // no slugs, no dimensions, or a path this parser does not know: the uri is
  // still a .gif, so it still animates — one rung down, not a dead card.
  for (const uri of [
    'https://static.klipy.com/ii/abc/61/56/RiZHW3kybKsT6j.gif?hh=415&ww=498',
    'https://static.klipy.com/other/abc/RiZHW3kybKsT6j.gif?hh=415&ww=498&mp4=x&webm=y',
    KLIPY.replace('hh=415&ww=498', 'hh=0&ww=498'),
    KLIPY.replace('hh=415', 'hh=notanumber'),
  ]) {
    const g = gifOf(uri);
    assert.equal(g.kind, 'image', uri);
    assert.equal(g.src, uri, 'the record\'s own uri, nothing constructed');
    assert.equal(g.aspect, null);
  }
});

test('gif: tenor, giphy and a bare link animate as images on their own uri', () => {
  for (const uri of [
    'https://media.tenor.com/AAAAC3q2Kn0AAAAC/warrior-nun.gif?hh=415&ww=498',
    'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif',
    'https://example.org/deep/path/dancing.GIF',
  ]) {
    const g = gifOf(uri);
    assert.equal(g.kind, 'image', uri);
    assert.equal(g.src, uri);
  }
});

test('gif: an ordinary link is not a gif', () => {
  for (const uri of [
    'https://www.videogameschronicle.com/news/sony-says-a-thing/',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://example.org/gifts',              // ends in "gif" + more, not ".gif"
    'https://example.org/a.gif.html',         // .gif is not the extension
    'https://example.org/photo.jpeg',
    'not a url at all',
    '',
    null,
    undefined,
  ]) {
    assert.equal(gifOf(uri), null, String(uri));
  }
});

// ---- the ALT: prefix (social-app/src/lib/gif-alt-text.ts, read 2026-09-02) ----
//
// Bluesky's composer hides alt text inside the external `description` behind a
// prefix whose CASE carries the meaning. The owner's post has the all-caps
// form, which is why its card printed the same eight words twice.

test('gif: "Alt:" is alt the author wrote; "ALT:" is the title auto-filled', () => {
  assert.deepEqual(parseAlt('Alt: a nun running through a shallow lake'),
    { text: 'a nun running through a shallow lake', authored: true });
  assert.deepEqual(parseAlt('ALT: Warrior Nun Ava Running Through Water'),
    { text: 'Warrior Nun Ava Running Through Water', authored: false });
});

test('gif: an unprefixed description on a gif is still its alt, just not authored', () => {
  assert.deepEqual(parseAlt('Warrior Nun Ava Running Through Water'),
    { text: 'Warrior Nun Ava Running Through Water', authored: false });
  assert.deepEqual(parseAlt(''), { text: '', authored: false });
  assert.deepEqual(parseAlt(undefined), { text: '', authored: false });
});

test('gif: the prefix is stripped once, and only from the front', () => {
  // "replace" on a bare string is first-match-only in social-app too, but a
  // prefix appearing mid-sentence must not be touched at all.
  assert.deepEqual(parseAlt('Alt: she said "ALT: no" and ran'),
    { text: 'she said "ALT: no" and ran', authored: true });
});
