// An external embed that is really an animation (owner, 2026-09-02: "the gif
// shuld show a play/pause overlay … not just tha tpost, but that TYPE of post").
//
// Bluesky's GIF button attaches the animation as an ordinary
// `app.bsky.embed.external`, so the lens has been drawing a frozen JPEG
// thumbnail with a link out. This file decides, from the uri alone, whether a
// card is really a GIF and what should be played.
//
// Two rungs, and the split is about what has been VERIFIED rather than about
// who the provider is:
//
//   klipy — the record carries the true dimensions (`hh`/`ww`) and a filename
//     slug per video format (`mp4=`, `webm=`). Measured 2026-09-02 on the
//     owner's own post: 953,992 B webm and 1,458,814 B mp4 against 8,773,093 B
//     for the .gif — 9.2x — and static.klipy.com serves all three itself with
//     `access-control-allow-origin: *`. So where the record hands us the slugs,
//     the video is what plays.
//
//   .gif — everything else, on the record's OWN uri with nothing constructed.
//     Tenor has a cheaper video form (social-app rewrites AAAAC->AAAP1/AAAP3
//     and serves it from t.gifs.bsky.app), but that rewrite could not be
//     exercised from here against a real tenor record, and CLAUDE.md § External
//     APIs forbids writing code against an unconfirmed url shape. A guess that
//     404s is a silently broken player; an image is merely a bigger one.
//
// D3: forage uses `static.klipy.com`, not social-app's `k.gifs.bsky.app` proxy.
// Both answer with identical bytes and open CORS, and the origin host is
// already named in the record — so reading a post trusts nobody new, and there
// is no third-party cache for forage to depend on.
//
// Pure: no network, no DOM, no storage. `mediaOf` in js/substrates/lens.js is
// the only caller.

// The last path segment's extension, lowercased. `.gif` must be the EXTENSION —
// "/gifts" and "/a.gif.html" are not animations.
function extensionOf(pathname) {
  const last = pathname.split('/').pop() || '';
  const dot = last.lastIndexOf('.');
  return dot === -1 ? '' : last.slice(dot + 1).toLowerCase();
}

// klipy's video URLs: the same directory, the last segment swapped for the
// slug this format was published under. Klipy keys each format separately
// (tenor derives all of them from one id), which is why the slugs ride in the
// query string rather than being computable from the .gif's own name.
function klipyVideo(urlp) {
  if (urlp.hostname !== 'static.klipy.com' || !urlp.pathname.startsWith('/ii/')) return null;

  const h = Number(urlp.searchParams.get('hh'));
  const w = Number(urlp.searchParams.get('ww'));
  if (!(h > 0) || !(w > 0)) return null; // NaN, 0 and negatives all fail this

  const named = (slug, ext, type) => {
    if (!slug) return null;
    const u = new URL(urlp.href);
    u.search = ''; // hh/ww/mp4/webm are metadata for us, not for the CDN
    const parts = u.pathname.split('/');
    parts[parts.length - 1] = `${slug}.${ext}`;
    u.pathname = parts.join('/');
    return { src: u.href, type };
  };

  // webm first: a browser plays the first source it supports, and webm is the
  // smaller of the two everywhere it is understood.
  const sources = [
    named(urlp.searchParams.get('webm'), 'webm', 'video/webm'),
    named(urlp.searchParams.get('mp4'), 'mp4', 'video/mp4'),
  ].filter(Boolean);
  if (!sources.length) return null;

  return { kind: 'video', sources, aspect: { w, h } };
}

// Is this external uri an animation, and what plays? `null` leaves the embed an
// ordinary link card — the caller must not invent a GIF out of a news article.
export function gifOf(uri) {
  if (typeof uri !== 'string' || !uri) return null;
  let urlp;
  try { urlp = new URL(uri); } catch { return null; }

  const video = klipyVideo(urlp);
  if (video) return video;

  // A klipy uri that failed the checks above is still a .gif, so it still
  // animates — one rung down, never a dead card.
  if (extensionOf(urlp.pathname) !== 'gif') return null;
  return { kind: 'image', src: uri, aspect: null };
}

// Bluesky's composer hides alt text inside the external `description` behind a
// prefix whose CASE carries the meaning (social-app/src/lib/gif-alt-text.ts,
// read 2026-09-02):
//
//   "Alt: <text>"  the author WROTE this        -> authored
//   "ALT: <text>"  auto-filled from the title   -> a duplicate of the title
//
// The owner's two reported posts both carry the all-caps form, which is why
// their cards printed the same words twice. That is the case the alt-text
// setting defaults to hiding.
//
// An unprefixed description on a GIF is still its alt — the field is where alt
// lives for this embed type — it simply was not written by a person. This
// function is NOT applied to ordinary link cards, whose `description` is
// genuine `og:description` page content and is never hidden.
const AUTHORED = 'Alt: ';
const AUTOFILLED = 'ALT: ';

export function parseAlt(description) {
  const d = typeof description === 'string' ? description : '';
  if (d.startsWith(AUTHORED)) return { text: d.slice(AUTHORED.length), authored: true };
  if (d.startsWith(AUTOFILLED)) return { text: d.slice(AUTOFILLED.length), authored: false };
  return { text: d, authored: false };
}
