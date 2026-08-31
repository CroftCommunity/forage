// W30 — which player a Bluesky clip mounts on.
//
// The owner's finding, live on forage.fyi 2026-08-31, Chrome for Android: the
// clip mounted, showed its poster, and then sat at 0:00 behind a broken-media
// glyph, silently. feed-row v13 decision 30 routed on
// `canPlayType('application/vnd.apple.mpegurl')` and treated any non-empty
// answer as proof of native HLS — and Chrome 147 answers "maybe" on Android
// and macOS while failing to demux the stream (video-dev/hls.js#7827). The
// reader got the one branch with no error path in it.
//
// This suite pins the ROUTING DECISION, which is the whole bug, and it pins it
// hermetically: the three inputs the decision reads — what canPlayType says,
// whether `ManagedMediaSource` exists, whether MSE can do H.264 — are stubbed
// per browser shape, and `window.Hls` is a recording double, so no playlist,
// no segment and no 385 KB of demuxer ever leaves the page. `data-player` on
// the mounted <video> is the decision, written once and never rewritten (the
// error-driven retry writes `data-player-fallback` instead), so an assertion
// on it cannot race a failing media element.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';

const T = '2026-08-26T10:00:00Z';
const PLAYLIST = 'https://video.cdn.test/clip/playlist.m3u8';
const FEED = { feed: [{ post: {
  uri: 'at://did:plc:aa/app.bsky.feed.post/clip', cid: 'cid-clip',
  author: { did: 'did:plc:aa', handle: 'aa.test' },
  record: { text: 'a clip', createdAt: T }, indexedAt: T,
  replyCount: 0, repostCount: 0, likeCount: 1,
  embed: { $type: 'app.bsky.embed.video#view', cid: 'bafyv', playlist: PLAYLIST,
    thumbnail: 'https://cdn.test/v-thumb.jpg', aspectRatio: { width: 720, height: 1280 } },
} }] };
const RESPONSES = { getFeed: FEED, getTrendingTopics: { topics: [] } };

// One browser SHAPE as the three answers the decision reads. Everything here
// is a lie the real browser would have told us; the point is that the app must
// believe only the combination that is actually evidence.
const shape = ({ canPlayType, managedMediaSource, mseCanH264 }) => `(() => {
  const real = HTMLMediaElement.prototype.canPlayType;
  HTMLMediaElement.prototype.canPlayType = function (type) {
    return /mpegurl|x-mpegURL/i.test(String(type)) ? ${JSON.stringify(canPlayType)} : real.call(this, type);
  };
  ${managedMediaSource
    ? "window.ManagedMediaSource = class { static isTypeSupported() { return true; } };"
    : "try { delete window.ManagedMediaSource; } catch {}"}
  const MSE = ${mseCanH264 ? 'true' : 'false'};
  if (MSE) { if (!window.MediaSource) window.MediaSource = class {}; window.MediaSource.isTypeSupported = () => true; }
  else if (window.MediaSource) window.MediaSource.isTypeSupported = () => false;
  // the demuxer, doubled: present, so loadHls() never fetches the vendored
  // build, and recording, so "went through hls.js" is an observation
  window.__hlsSources = [];
  window.Hls = class {
    static isSupported() { return true; }
    static get Events() { return { ERROR: 'hlsError' }; }
    on() {}
    loadSource(url) { window.__hlsSources.push({ url, viaFallback: document.querySelector('video')?.dataset?.playerFallback === 'hls' }); }
    attachMedia() {}
    destroy() {}
  };
})();`;

// mount the clip's player in a browser of the given shape and report what it chose
async function playerFor(name, opts) {
  const s = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES, initScripts: [shape(opts)] });
  try {
    const { page } = s;
    // no picture decodes and no playlist is ever requested (fulfilled, not
    // aborted — an abort logs a resource error the harness collects)
    await page.route('**/*.jpg', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.alloc(0) }));
    await page.route('**/*.m3u8', (r) => r.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-ENDLIST\n' }));
    await page.goto(`${s.origin}/f/whats-hot`);
    const clip = page.locator('.stage[data-stage="video"]');
    await clip.waitFor();
    assert.equal(await clip.locator('video').count(), 0, `${name}: no <video> before the press`);
    await clip.locator('button[data-play]').click();
    const video = clip.locator('video');
    await video.waitFor();
    const chose = await video.getAttribute('data-player');
    const nativeSrc = await video.evaluate((v) => v.getAttribute('src'));
    // The element under a `native` decision really does fail here — headless
    // Chromium has no HLS however loudly the stub claims otherwise — so the
    // safety net fires and its retry lands in the same list. Each recorded
    // source says which path it came down, and the DECISION is only ever the
    // one with viaFallback false.
    const hlsSources = await page.evaluate(() => window.__hlsSources);
    const decided = hlsSources.filter((h) => !h.viaFallback).map((h) => h.url);
    const retried = await video.getAttribute('data-player-fallback');
    s.consoleErrors();
    return { chose, decided, retried, nativeSrc };
  } finally { await s.close(); }
}

export async function run() {
  // THE REGRESSION. Chrome 147 on Android (and macOS): "maybe" to HLS, no
  // ManagedMediaSource, MSE that plays H.264 — the shape that shipped broken.
  const chrome = await playerFor('chrome-147', { canPlayType: 'maybe', managedMediaSource: false, mseCanH264: true });
  assert.equal(chrome.chose, 'hls', 'Chrome says "maybe" to HLS and cannot demux it — the clip goes through hls.js, not the element');
  assert.deepEqual(chrome.decided, [PLAYLIST], 'and the demuxer is handed the post’s playlist');
  assert.equal(chrome.nativeSrc, null, 'nothing is put on the element’s own src');

  // Firefox: never claimed HLS, and was already routed correctly. Kept so the
  // fix cannot be "read canPlayType backwards".
  const firefox = await playerFor('firefox', { canPlayType: '', managedMediaSource: false, mseCanH264: true });
  assert.equal(firefox.chose, 'hls', 'Firefox has no native HLS at all — the demuxer, as before');
  assert.deepEqual(firefox.decided, [PLAYLIST], 'on the post’s playlist');

  // Safari 17.1+: ManagedMediaSource is Safari's and Safari's alone, and there
  // native HLS is the better player — decision 30's "Safari plays it natively"
  // survives the fix, and 385 KB stays unfetched.
  const safari = await playerFor('safari-17', { canPlayType: 'probably', managedMediaSource: true, mseCanH264: true });
  assert.equal(safari.chose, 'native', 'Safari 17.1+ plays HLS on the element itself');
  assert.deepEqual(safari.decided, [], 'and never reaches for the demuxer to decide that');
  // and the safety net: this browser is NOT Safari, so the element it was
  // handed really did fail — and the reader got a second player rather than a
  // broken box. The net is what makes the gate above safe to be wrong about.
  assert.equal(safari.retried, 'hls', 'a browser that promised HLS and then failed the element is retried on the demuxer');

  // Older iOS Safari: claims HLS, has no MSE for hls.js to run on. Native is
  // not a preference here, it is the only thing there is.
  const ios = await playerFor('ios-16', { canPlayType: 'maybe', managedMediaSource: false, mseCanH264: false });
  assert.equal(ios.chose, 'native', 'an MSE-less browser that claims HLS gets the element — hls.js could not have helped');
  assert.deepEqual(ios.decided, [], 'and the demuxer is not fetched to find that out');
}
