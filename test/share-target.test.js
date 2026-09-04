// The share-target parser. Every case here is a payload a real share sheet can
// produce, and the two that matter most are the ones a spec reading alone would
// get wrong:
//
//   - Android puts the URL in `text`, not `url` (Chrome's own docs). A parser
//     that reads `url` works in a demo and never once on a phone.
//   - Bluesky's share link carries a HANDLE most of the time and a DID when the
//     author's handle is invalid (social-app `src/lib/routes/links.ts:6-18`).
//     Both are real; only one of them needs resolving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTarget, directPath, threadPath, isDid, firstLink, sharedFields,
} from '../js/share-target.js';

const POST = 'https://bsky.app/profile/leahmcelrath.bsky.social/post/3lxabcd2xyz';

test('the Android payload: a bare post URL arriving in `text`, not `url`', () => {
  // social-app/src/lib/sharing.ts shares with Share.share({message: url}) —
  // one string, no subject — and Android's share system has no url extra, so
  // Chrome hands it to us as `text`. This is THE case the feature exists for.
  assert.deepEqual(extractTarget({ text: POST }),
    { kind: 'post', handle: 'leahmcelrath.bsky.social', rkey: '3lxabcd2xyz' });
});

test('the spec-shaped payload: the same URL arriving in `url`', () => {
  assert.deepEqual(extractTarget({ url: POST }),
    { kind: 'post', handle: 'leahmcelrath.bsky.social', rkey: '3lxabcd2xyz' });
});

test('and in `title`, which Chrome documents as "occasionally"', () => {
  assert.deepEqual(extractTarget({ title: POST }),
    { kind: 'post', handle: 'leahmcelrath.bsky.social', rkey: '3lxabcd2xyz' });
});

test('`url` wins over `text` when a sheet fills both', () => {
  const t = extractTarget({ url: POST, text: 'https://bsky.app/profile/other.test/post/zzz' });
  assert.equal(t.handle, 'leahmcelrath.bsky.social', 'the spec field is preferred when present');
});

test('a link wrapped in a sentence still resolves', () => {
  // Bluesky shares a bare URL, but plenty of apps do not, and a reader pasting
  // by hand adds words. The extractor scans for the link rather than requiring
  // the whole field to be one.
  const t = extractTarget({ text: `look at this ${POST} it is good` });
  assert.deepEqual(t, { kind: 'post', handle: 'leahmcelrath.bsky.social', rkey: '3lxabcd2xyz' });
});

test("a sentence's trailing punctuation is not part of the rkey", () => {
  const t = extractTarget({ text: `read this: ${POST}.` });
  assert.equal(t.rkey, '3lxabcd2xyz', 'the full stop belonged to the sentence');
});

test('a did in the handle position is recognised and needs no lookup', () => {
  // makeProfileLink falls back to the did when the handle is invalid, so this
  // shape is not exotic — it is what a shared post from a handle-less account
  // looks like.
  const t = extractTarget({ text: 'https://bsky.app/profile/did:plc:44ybard66vv44/post/3kabc' });
  assert.deepEqual(t, { kind: 'post', handle: 'did:plc:44ybard66vv44', rkey: '3kabc' });
  assert.ok(isDid(t.handle), 'and it is spotted as one, so the view skips resolveHandle');
});

test('isDid says no to a handle that merely mentions did', () => {
  assert.equal(isDid('did.bsky.social'), false);
  assert.equal(isDid(''), false);
  assert.equal(isDid('did:plc:abc'), true);
});

test('the HOST is not checked: a Blacksky (or any fork) post link works the same', () => {
  // Blacksky, deer.social and every other social-app descendant share
  // routes.ts, so the path shape is the identity. An allowlist would be wrong
  // the day someone stands up another client and no more correct in the
  // meantime — the handle is resolved against the real network either way.
  for (const host of ['blacksky.community', 'deer.social', 'main.bsky.dev', 'some.fork.example']) {
    assert.deepEqual(extractTarget({ text: `https://${host}/profile/alice.test/post/3k1` }),
      { kind: 'post', handle: 'alice.test', rkey: '3k1' }, host);
  }
});

test("social-app's post sub-pages name the same post", () => {
  // /liked-by, /reposted-by, /quotes are real routes (routes.ts:36-38) and all
  // three are about one post. Refusing them would refuse a share that is not
  // ambiguous in any way.
  for (const tail of ['liked-by', 'reposted-by', 'quotes']) {
    assert.deepEqual(extractTarget({ text: `${POST}/${tail}` }),
      { kind: 'post', handle: 'leahmcelrath.bsky.social', rkey: '3lxabcd2xyz' }, tail);
  }
});

test('an at:// post uri is a destination with nothing to resolve', () => {
  // bsky.app's developer mode shares exactly this, and it is already the
  // language /p speaks.
  const uri = 'at://did:plc:aa/app.bsky.feed.post/3kabc';
  assert.deepEqual(extractTarget({ text: uri }), { kind: 'thread', uri });
  assert.equal(directPath({ kind: 'thread', uri }), `/p?uri=${encodeURIComponent(uri)}`);
});

test('a feed link becomes the shareable /f/@creator/rkey form (3v)', () => {
  assert.deepEqual(extractTarget({ text: 'https://bsky.app/profile/skyfeed.test/feed/aaaotfjzjply' }),
    { kind: 'feed', handle: 'skyfeed.test', rkey: 'aaaotfjzjply' });
  assert.equal(directPath({ kind: 'feed', handle: 'skyfeed.test', rkey: 'aaaotfjzjply' }),
    '/f/@skyfeed.test/aaaotfjzjply');
});

test('a profile link becomes /u/, with or without the rss tail', () => {
  assert.deepEqual(extractTarget({ text: 'https://bsky.app/profile/alice.test' }),
    { kind: 'profile', handle: 'alice.test' });
  assert.deepEqual(extractTarget({ text: 'https://bsky.app/profile/alice.test/rss' }),
    { kind: 'profile', handle: 'alice.test' });
  assert.equal(directPath({ kind: 'profile', handle: 'alice.test' }), '/u/alice.test');
});

test('a profile sub-page with no Forage equivalent lands on the profile, not an error', () => {
  // followers, lists, a labeler, a profile search: the account is the honest
  // nearest thing, and it is where the reader was heading anyway.
  for (const tail of ['followers', 'follows', 'lists/3k1', 'search']) {
    assert.deepEqual(extractTarget({ text: `https://bsky.app/profile/alice.test/${tail}` }),
      { kind: 'profile', handle: 'alice.test' }, tail);
  }
});

test('an @ on the handle segment is conventional, not part of the handle', () => {
  assert.deepEqual(extractTarget({ text: 'https://bsky.app/profile/@alice.test/post/3k1' }),
    { kind: 'post', handle: 'alice.test', rkey: '3k1' });
});

test('a hashtag link becomes /h/, and the tag keeps its literal string', () => {
  assert.deepEqual(extractTarget({ text: 'https://bsky.app/hashtag/gardening' }),
    { kind: 'hashtag', tag: 'gardening' });
  // percent-encoded, which is how a non-ascii tag travels
  assert.deepEqual(extractTarget({ text: 'https://bsky.app/hashtag/%E5%9C%92%E8%8A%B8' }),
    { kind: 'hashtag', tag: '園芸' });
  assert.equal(directPath({ kind: 'hashtag', tag: 'gardening' }), '/h/gardening');
});

test('a search URL is a hashtag board only when the query is nothing but a tag', () => {
  assert.deepEqual(extractTarget({ text: 'https://bsky.app/search?q=%23gardening' }),
    { kind: 'hashtag', tag: 'gardening' });
  // A real phrase is not a tag. Guest search is 403 unauthenticated (DL-014),
  // so routing one would land a guest on an empty page with no reason given.
  assert.equal(extractTarget({ text: 'https://bsky.app/search?q=tomato%20blight' }).kind, 'unknown');
});

test("Forage's own link comes home with its query intact", () => {
  const uri = 'at://did:plc:aa/app.bsky.feed.post/3kabc';
  const t = extractTarget({ text: `https://forage.fyi/p?uri=${encodeURIComponent(uri)}` });
  assert.equal(t.kind, 'internal');
  assert.equal(t.path, `/p?uri=${encodeURIComponent(uri)}`,
    'the query is where /p keeps the post, so it must survive the round trip');
  assert.equal(directPath(t), t.path);
  assert.equal(extractTarget({ text: 'https://forage.fyi/' }).path, '/');
});

test('the doorway refuses to dispatch to itself', () => {
  // A shared forage.fyi/share?… link would re-enter this parser. It terminates
  // — each hop consumes a level of nesting — but a route that can dispatch to
  // itself is one refactor away from being a loop, and re-entering a doorway
  // was never the answer to anything.
  const t = extractTarget({ text: 'https://forage.fyi/share?text=https%3A%2F%2Fexample.com' });
  assert.equal(t.kind, 'unknown');
  assert.equal(directPath(t), null);
});

test('an unrecognised share keeps both the text and the link', () => {
  // By the time a share fails the reader has already left the app it came from.
  // "We could not read that" without saying what "that" was is a dead end.
  const t = extractTarget({ text: 'https://example.com/news/story' });
  assert.deepEqual(t, { kind: 'unknown', shared: 'https://example.com/news/story', link: 'https://example.com/news/story' });
  assert.equal(directPath(t), null, 'and there is nowhere to send it');
});

test('a share with no link at all is unknown, and says what arrived', () => {
  assert.deepEqual(extractTarget({ text: 'just some words' }),
    { kind: 'unknown', shared: 'just some words', link: null });
  assert.deepEqual(extractTarget({}), { kind: 'unknown', shared: '', link: null });
});

test('a malformed percent escape does not throw — the doorway must not eat the link', () => {
  // A share payload is arbitrary text and decodeURIComponent('%') is a URIError.
  assert.doesNotThrow(() => extractTarget({ text: 'https://bsky.app/hashtag/100%' }));
  assert.doesNotThrow(() => extractTarget({ text: '%%%' }));
});

test('a non-http scheme is not treated as a web link', () => {
  assert.equal(extractTarget({ text: 'mailto:someone@example.com' }).kind, 'unknown');
});

test('threadPath spells the at-uri the way /p reads it', () => {
  assert.equal(threadPath('did:plc:aa', '3kabc'),
    `/p?uri=${encodeURIComponent('at://did:plc:aa/app.bsky.feed.post/3kabc')}`);
});

test('sharedFields trims, drops empties, and keeps the platform order', () => {
  assert.deepEqual(sharedFields({ title: ' t ', text: '', url: 'u' }), ['u', 't']);
  assert.deepEqual(sharedFields(), []);
});

test('firstLink finds the first of several', () => {
  assert.equal(firstLink(['a https://one.example b https://two.example']), 'https://one.example');
  assert.equal(firstLink(['nothing here']), null);
});

test('the parser is pure — no clock, no fetch, no DOM', async () => {
  // Invariant 3's spirit at the module level: this is the one piece of the
  // feature that is decidable from a string, and the reason it is a separate
  // file is so it stays that way.
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const src = readFileSync(join(root, 'js/share-target.js'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const forbidden of ['Date.now', 'Math.random', 'fetch(', 'document.', 'localStorage']) {
    assert.ok(!src.includes(forbidden), `js/share-target.js must not reach for ${forbidden}`);
  }
});
