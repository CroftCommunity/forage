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
//   tenor — the same idea with a different spelling. Tenor encodes the format
//     in the id's SUFFIX (AAAAC gif, AAAP3 webm, AAAP1 mp4). Probed 2026-09-02
//     against two independent real ids, on tenor's OWN host:
//
//       Zc-ZTPzlEHo   gif    66,865 B   webm 37,761 B   mp4 20,255 B   3.3x
//       r2ZObFlQ5I4   gif 4,160,427 B   webm 79,370 B   mp4 77,723 B    52x
//
//     both 200 with `access-control-allow-origin: *`. This rung was left
//     unbuilt when gif-embeds landed precisely because it had NOT been probed;
//     it is written now because it has been.
//
//   .gif — everything else, on the record's OWN uri with nothing constructed.
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

// tenor's video URLs: the same path with the id's format suffix swapped.
//
// The suffix is REQUIRED to be at the end, which is stricter than social-app's
// `id.replace('AAAAC', …)`. That rewrites the first match, so an id merely
// CONTAINING AAAAC earlier would be mangled into a url that 404s — a silently
// broken player, the exact failure this whole two-rung split exists to avoid.
// Requiring the suffix makes such an id fall back to the image instead, which
// is correct rather than broken.
//
// The filename is taken from `pathname` and never decoded: a real one is
// `i-don%27t-know-idk.gif`, and decoding then re-encoding it is how a working
// url turns into a 404.
const TENOR_GIF_CODE = 'AAAAC';
const TENOR_FORMATS = [['AAAP3', 'webm', 'video/webm'], ['AAAP1', 'mp4', 'video/mp4']];

function tenorVideo(urlp) {
  if (urlp.hostname !== 'media.tenor.com') return null;

  // tenor's shape is exactly /{id}/{filename} — nothing deeper, nothing else
  const [, id, filename, ...rest] = urlp.pathname.split('/');
  if (!id || !filename || rest.length) return null;
  if (!id.endsWith(TENOR_GIF_CODE) || !filename.toLowerCase().endsWith('.gif')) return null;

  const h = Number(urlp.searchParams.get('hh'));
  const w = Number(urlp.searchParams.get('ww'));
  if (!(h > 0) || !(w > 0)) return null;

  const stem = id.slice(0, -TENOR_GIF_CODE.length);
  const base = filename.slice(0, -'.gif'.length);
  const sources = TENOR_FORMATS.map(([code, ext, type]) => ({
    src: `${urlp.origin}/${stem}${code}/${base}.${ext}`, type,
  }));
  return { kind: 'video', sources, aspect: { w, h } };
}

// Is this external uri an animation, and what plays? `null` leaves the embed an
// ordinary link card — the caller must not invent a GIF out of a news article.
export function gifOf(uri) {
  if (typeof uri !== 'string' || !uri) return null;
  let urlp;
  try { urlp = new URL(uri); } catch { return null; }

  const video = klipyVideo(urlp) || tenorVideo(urlp);
  if (video) return video;

  // A klipy or tenor uri that failed the checks above is still a .gif, so it
  // still animates — one rung down, never a dead card.
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
