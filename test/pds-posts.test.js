// Phase 6 (plan 2026-09-14-plan-clips; owner 2026-09-25: "we want the pds walker path to be
// viable for all content and formats"): a people-scope reel can read its members' clips
// and pictures straight from their data servers. This is the PURE half — a raw
// `app.bsky.feed.post` record becomes the post VIEW the lens already shapes, with every
// URL derived from the record's own blob cids (probed 2026-09-25: the AppView's
// `thumb`/`fullsize`/`avatar`/`playlist`/`thumbnail` are exactly these patterns).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordToView, matchesFilter, imageUrl, videoUrls, avatarUrl, handleFromDoc } from '../js/pds-posts.js';

const DID = 'did:plc:hyv5w3p74clcq6bc7srpqpta';
const blob = (cid, mimeType = 'image/jpeg') => ({ $type: 'blob', ref: { $link: cid }, mimeType, size: 1000 });
const IMG = 'bafkreicwoexxnnkdskoixxylvjjystgqohm4kpxddsyshsqmxia5mmsvii';
const VID = 'bafkreiehaaivlu2c5kf3f7vtiqe3uakfzriza7yonznxvd2cpxe5p6vp3m';

test('the URL derivations are the network’s own patterns (probed 2026-09-14 and 2026-09-25)', () => {
  assert.equal(imageUrl(DID, IMG, 'feed_thumbnail'), `https://cdn.bsky.app/img/feed_thumbnail/plain/${DID}/${IMG}`);
  assert.equal(imageUrl(DID, IMG, 'feed_fullsize'), `https://cdn.bsky.app/img/feed_fullsize/plain/${DID}/${IMG}`);
  assert.equal(avatarUrl(DID, IMG), `https://cdn.bsky.app/img/avatar/plain/${DID}/${IMG}`);
  assert.deepEqual(videoUrls(DID, VID), {
    playlist: `https://video.bsky.app/watch/${encodeURIComponent(DID)}/${VID}/playlist.m3u8`,
    thumbnail: `https://video.bsky.app/watch/${encodeURIComponent(DID)}/${VID}/thumbnail.jpg`,
  });
});

test('the handle is the DID document’s at:// alias; a document without one gives null', () => {
  assert.equal(handleFromDoc({ alsoKnownAs: ['at://fravery.bsky.social'] }), 'fravery.bsky.social');
  assert.equal(handleFromDoc({ alsoKnownAs: [] }), null);
  assert.equal(handleFromDoc({}), null);
});

test('matchesFilter mirrors the AppView’s author-feed filters over a raw record', () => {
  const video = { embed: { $type: 'app.bsky.embed.video', video: blob(VID, 'video/mp4') } };
  const images = { embed: { $type: 'app.bsky.embed.images', images: [{ image: blob(IMG), alt: '' }] } };
  const rwmVideo = { embed: { $type: 'app.bsky.embed.recordWithMedia', media: { $type: 'app.bsky.embed.video', video: blob(VID, 'video/mp4') }, record: {} } };
  const text = { text: 'words' };
  const reply = { ...video, reply: { root: {}, parent: {} } };
  assert.equal(matchesFilter(video, 'posts_with_video'), true);
  assert.equal(matchesFilter(rwmVideo, 'posts_with_video'), true);
  assert.equal(matchesFilter(images, 'posts_with_video'), false);
  assert.equal(matchesFilter(images, 'posts_with_media'), true);
  assert.equal(matchesFilter(video, 'posts_with_media'), true, 'the network’s media filter returns clips too (0f)');
  assert.equal(matchesFilter(text, 'posts_with_media'), false);
  assert.equal(matchesFilter(reply, 'posts_with_video'), false, 'the author-feed filters exclude replies');
  assert.throws(() => matchesFilter(video, 'posts_and_author_threads'), /posts_and_author_threads/);
});

test('a video record becomes a post view the lens shapes: derived playlist, thumbnail, aspect, alt; author from the doc and the profile', () => {
  const record = { $type: 'app.bsky.feed.post', text: 'a clip', createdAt: '2026-09-20T10:00:00Z', langs: ['en'],
    embed: { $type: 'app.bsky.embed.video', video: blob(VID, 'video/mp4'), aspectRatio: { width: 9, height: 16 }, alt: 'a bog at dawn' } };
  const view = recordToView({ did: DID, rkey: '3abc', cid: 'cid-1', record,
    author: { handle: 'fravery.bsky.social', displayName: 'Fravery', avatarCid: IMG } });
  assert.equal(view.uri, `at://${DID}/app.bsky.feed.post/3abc`);
  assert.equal(view.cid, 'cid-1');
  assert.deepEqual(view.author, { did: DID, handle: 'fravery.bsky.social', displayName: 'Fravery', avatar: avatarUrl(DID, IMG) });
  assert.equal(view.record, record);
  assert.equal(view.indexedAt, '2026-09-20T10:00:00Z');
  assert.deepEqual(view.embed, { $type: 'app.bsky.embed.video#view', cid: VID, ...videoUrls(DID, VID), aspectRatio: { width: 9, height: 16 }, alt: 'a bog at dawn' });
  // counts are NOT invented: absent, so the lens can say so rather than print zeros
  assert.equal(view.likeCount, undefined);
  assert.equal(view.replyCount, undefined);
  assert.equal(view.viaPds, true);
});

test('an images record becomes an images#view with thumb and fullsize per picture; a recordWithMedia gives up its media half', () => {
  const record = { $type: 'app.bsky.feed.post', text: 'two', createdAt: '2026-09-20T10:00:00Z',
    embed: { $type: 'app.bsky.embed.images', images: [{ image: blob(IMG), alt: 'one', aspectRatio: { width: 4, height: 3 } }, { image: blob(VID), alt: '' }] } };
  const view = recordToView({ did: DID, rkey: 'r', cid: 'c', record, author: { handle: 'h.test', displayName: null, avatarCid: null } });
  assert.equal(view.embed.$type, 'app.bsky.embed.images#view');
  assert.deepEqual(view.embed.images[0], { thumb: imageUrl(DID, IMG, 'feed_thumbnail'), fullsize: imageUrl(DID, IMG, 'feed_fullsize'), alt: 'one', aspectRatio: { width: 4, height: 3 } });
  assert.deepEqual(view.embed.images[1], { thumb: imageUrl(DID, VID, 'feed_thumbnail'), fullsize: imageUrl(DID, VID, 'feed_fullsize'), alt: '' });
  assert.equal(view.author.avatar, null, 'no avatar blob: null, never a made-up URL');
  const rwm = { ...record, embed: { $type: 'app.bsky.embed.recordWithMedia', media: record.embed, record: { record: { uri: 'at://x/y/z', cid: 'q' } } } };
  assert.equal(recordToView({ did: DID, rkey: 'r', cid: 'c', record: rwm, author: { handle: 'h.test' } }).embed.$type, 'app.bsky.embed.images#view');
});

test('a record without media has no embed view; a record the filter would not pass is still shapeable', () => {
  const view = recordToView({ did: DID, rkey: 'r', cid: 'c', record: { $type: 'app.bsky.feed.post', text: 'words', createdAt: '2026-09-20T10:00:00Z' }, author: { handle: 'h.test' } });
  assert.equal(view.embed, undefined);
  assert.equal(view.author.handle, 'h.test');
});
