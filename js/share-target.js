// Share to Forage — turning whatever a share sheet hands us into a destination.
//
// The mechanism is the W3C Web Share Target draft (w3c.github.io/web-share-target):
// manifest.webmanifest declares a `share_target` whose `params` name the query
// parameters the browser fills with `title`, `text` and `url`, and the browser
// navigates the installed app to `/share?…`. Two facts about it decide the
// shape of this module, and neither is guessable from the code that calls it:
//
//  1. THE URL DOES NOT ARRIVE IN `url` ON ANDROID. Chrome's own documentation
//     is explicit — "on Android, the `url` field will be empty because it's not
//     supported in Android's share system. Instead, URLs will often appear in
//     the `text` field, or occasionally in the `title` field"
//     (developer.chrome.com/docs/capabilities/web-apis/web-share-target). The
//     spec says one thing, the platform does another, and both are true; so we
//     read all three fields and go looking for the URL rather than trusting a
//     field to hold it. Android is also the ONLY platform this feature runs on
//     in practice (Safari and Firefox have never shipped share_target), which
//     means the non-spec behaviour is the common case, not the edge.
//
//  2. THE PAYLOAD IS A BARE URL, from Bluesky at least. social-app's
//     `src/lib/sharing.ts` shares a post with `Share.share({message: url})` and
//     nothing else — no subject, no prose. Other apps are less tidy and put the
//     link inside a sentence, so the extractor scans for a URL token instead of
//     requiring the whole string to be one.
//
// WHY THE HOST IS NOT CHECKED. Bluesky's own client is one of several
// interoperating clients — Blacksky (blacksky.community), deer.social, forks
// yet to be written — and they are social-app's descendants, so they share its
// route table (`src/routes.ts`: `/profile/:name/post/:rkey`, `/hashtag/:tag`,
// `/profile/:name/feed/:rkey`). A host allowlist would be wrong the day someone
// stands up another one, and would still not be more correct than what happens
// anyway: the handle is resolved against the real network, and a shape that
// matched by coincidence fails there with words. So this matches on the PATH
// SHAPE and lets identity resolution be the check that it already is.
//
// Pure by construction: no fetch, no DOM, no clock. Everything this feature can
// get wrong about a link is decidable from a string, and a string is testable
// without a browser. js/ui/lens-views.js does the two things a string cannot —
// one resolveHandle, and one navigation.

// A post's canonical identity on the network. Accepted directly because
// bsky.app's developer mode shares exactly this ("Copy at:// URI"), and because
// it is what Forage's own /p route already speaks.
const AT_POST = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)/;

// The first http(s) or at:// token in a blob of text. Deliberately loose about
// what ends it — whitespace and the characters a sentence wraps a link in —
// because the alternative is a URL grammar, and a share sheet is not a parser.
const URLISH = /\b(?:https?:\/\/|at:\/\/)[^\s<>"')\]]+/i;

// Trailing punctuation a human's sentence leaves stuck to a link ("look at
// https://bsky.app/…!"). Stripped from the END only — a legitimate path never
// needs one there, and a percent-encoded tag is untouched because % is not here.
const TRAILING = /[.,;:!?)\]}'"]+$/;

// The app's own domains. A link to Forage that comes back to Forage through a
// share sheet is a real thing — someone shares a thread from Forage to
// themselves — and it should open where it points rather than being treated as
// something we cannot read.
const OWN_HOSTS = new Set(['forage.fyi', 'www.forage.fyi']);

// Percent-decode without letting a malformed escape throw. A share payload is
// arbitrary text; `decodeURIComponent('%')` is a URIError, and a doorway that
// throws on a bad character is a doorway that eats the reader's link.
function decode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// The candidate strings, in the order the platform makes them likely to hold
// the link. `url` is what the spec promises; `text` is where Android actually
// puts it; `title` is Chrome's documented "occasionally". Trying all three in
// that order costs nothing and is the difference between working on a phone and
// working only in a spec.
export function sharedFields({ title = '', text = '', url = '' } = {}) {
  return [url, text, title].map((v) => String(v ?? '').trim()).filter(Boolean);
}

// The first link in the payload, or null. Exported because the unknown-share
// landing needs it too: if we could not route it, we can at least hand the
// reader back the thing they shared rather than swallowing it.
export function firstLink(fields) {
  for (const field of fields) {
    const m = URLISH.exec(field);
    if (m) return m[0].replace(TRAILING, '');
    // A bare at-uri does not match \b the same way on some inputs, so the
    // whole-field case is checked directly rather than relying on the scan.
    if (AT_POST.test(field)) return field;
  }
  return null;
}

// A bsky-family URL's path, split. Returns null for anything that is not an
// absolute http(s) URL — including the at:// form, which is handled before this
// is ever called.
function pathSegments(link) {
  let u;
  try { u = new URL(link); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const segs = u.pathname.split('/').filter(Boolean).map(decode);
  return { host: u.hostname.toLowerCase(), segs, search: u.search, hash: u.hash };
}

// The one entry point. Give it the three share_target fields; get back what to
// do about them.
//
//   { kind: 'post',     handle, rkey }   one resolveHandle away from /p
//   { kind: 'thread',   uri }            already an at-uri — nothing to resolve
//   { kind: 'feed',     handle, rkey }   /f/@handle/rkey (3v resolves it cold)
//   { kind: 'profile',  handle }         /u/handle
//   { kind: 'hashtag',  tag }            /h/tag
//   { kind: 'internal', path }           a forage.fyi link — go there
//   { kind: 'unknown',  shared, link }   what arrived, and a way back out
//
// `shared` on the unknown case is the payload as the reader would recognise it,
// because the landing shows it back to them: by the time a share fails they have
// already left the app it came from, and "we could not read that" without saying
// what "that" was is a dead end.
export function extractTarget(payload = {}) {
  const fields = sharedFields(payload);
  const link = firstLink(fields);
  const shared = fields[0] || '';
  if (!link) return { kind: 'unknown', shared, link: null };

  const at = AT_POST.exec(link);
  if (at) return { kind: 'thread', uri: `at://${at[1]}/app.bsky.feed.post/${at[2]}` };

  const parsed = pathSegments(link);
  if (!parsed) return { kind: 'unknown', shared, link };
  const { host, segs, search } = parsed;

  if (OWN_HOSTS.has(host)) {
    // Its own address, brought home. Query and all — /p?uri=… is the shape most
    // worth surviving this trip, and it lives entirely in the query string.
    //
    // Except the doorway itself. A shared `forage.fyi/share?…` would send this
    // function straight back into itself: it terminates (each hop consumes a
    // level of nesting and the string is finite), but re-entering a doorway is
    // never the answer to anything, and a route that can dispatch to itself is
    // one refactor away from being a loop.
    if (segs[0] === 'share') return { kind: 'unknown', shared, link };
    const path = `/${segs.join('/')}${search || ''}`;
    return { kind: 'internal', path: path === '/' ? '/' : path };
  }

  // /profile/<name>/post/<rkey>[/liked-by|/quotes|…] — the trailing segment is
  // one of social-app's sub-pages (liked-by, reposted-by, quotes) and names the
  // same post, so it is ignored rather than refused.
  if (segs[0] === 'profile' && segs[1]) {
    const handle = String(segs[1]).replace(/^@/, '');
    if (!handle) return { kind: 'unknown', shared, link };
    if (segs[2] === 'post' && segs[3]) return { kind: 'post', handle, rkey: segs[3] };
    if (segs[2] === 'feed' && segs[3]) return { kind: 'feed', handle, rkey: segs[3] };
    if (!segs[2] || segs[2] === 'rss') return { kind: 'profile', handle };
    // A list, a labeler, followers, a profile search: real pages with no Forage
    // equivalent. The PROFILE is the honest nearest thing and it is one press
    // from where they were, so land there rather than refusing the whole share.
    return { kind: 'profile', handle };
  }

  if (segs[0] === 'hashtag' && segs[1]) {
    // The tag is the identity, and it is the literal string (3n). bsky.app
    // links it without the '#'; a reader who typed one keeps it out of the
    // route, because /h/ takes the bare tag.
    const tag = String(segs[1]).replace(/^#/, '');
    if (tag) return { kind: 'hashtag', tag };
  }

  // /search?q=%23gardening is how bsky.app's own search links a tag, and it is
  // a hashtag board when the query is nothing but a tag. A real search phrase
  // is NOT one — Forage's guest search is 403 unauthenticated (DL-014), so
  // pretending otherwise would land a guest on an empty page with no reason.
  if (segs[0] === 'search') {
    const q = decode(new URLSearchParams(search).get('q') || '').trim();
    if (/^#?[^\s#]+$/.test(q) && q.startsWith('#')) return { kind: 'hashtag', tag: q.slice(1) };
  }

  return { kind: 'unknown', shared, link };
}

// Every destination that needs no network. `post` is absent on purpose: an rkey
// has no did, and Forage's thread address is an at-uri, so that one case has to
// go and ask. Returning a half-built path for it would hand out the broken link
// that /f/ already learned not to (3v).
export function directPath(target) {
  if (!target) return null;
  switch (target.kind) {
    case 'thread': return `/p?uri=${encodeURIComponent(target.uri)}`;
    case 'feed': return `/f/@${encodeURIComponent(target.handle)}/${encodeURIComponent(target.rkey)}`;
    case 'profile': return `/u/${encodeURIComponent(target.handle)}`;
    case 'hashtag': return `/h/${encodeURIComponent(target.tag)}`;
    case 'internal': return target.path;
    default: return null;
  }
}

// The thread address for a post whose author has been resolved to a did. Kept
// here beside directPath so both spellings of "/p?uri=" live in one file.
export function threadPath(did, rkey) {
  return `/p?uri=${encodeURIComponent(`at://${did}/app.bsky.feed.post/${rkey}`)}`;
}

// Whether the handle segment is already a did and needs no lookup. The share
// payload carries one whenever the author's handle was invalid at share time —
// social-app's makeProfileLink falls back to the did, so both shapes are real
// in the wild and neither is an error.
export function isDid(handle) {
  return /^did:[a-z0-9]+:/.test(String(handle || ''));
}
