# Plan: share a Bluesky post to Forage and read it here

date: 2026-09-04
status: **Phases 0–5 planned.**
repo: `CroftCommunity/forage`
baseline: `main` @ `0d5e744` (the ring pill, #55)
branch: `claude/bluesky-share-forage-pwa-1r74go`

## Problem Statement

The owner, 2026-09-04, with a screenshot of the Bluesky Android app's share sheet open on a
post (Send via chat · **Share via…** · Copy link to post):

> "I want to be able to share from the official Bluesky app or the Bluesky mobile website or
> Blacksky mobile website or Blacksky app and share with Forage as a target when it's installed
> as a PWA, and have that same content open in Forage. So like if I see a comment thread that's
> like the 1/2/3 thing, I could share the number one straight to Forage and then just read it as
> one plain post, right, and see the thread kind of in that fashion."

Forage already renders exactly the thing being asked for. `lensThreadView` hoists an author's
own `1/3 · 2/3 · 3/3` chain into the body of one post (`shapeLensThread`, "the poster
self-thread … is the BODY of the post in forum shape, not comments"), and `lens.thread()`
already refetches from the root when it is handed a reply's uri, so *any* part of a numbered
thread opens the whole thing. **What is missing is the door**: there is no way to get a post
from the Bluesky app into Forage except copying a link, switching apps, and pasting it into
an address bar — and pasting a `bsky.app` URL into Forage does nothing, because Forage's
thread address is `/p?uri=at://…` and nothing translates one into the other.

## What the platform actually gives us (grounded)

**Web Share Target** is the mechanism, and it is a W3C draft, not a Bluesky feature. From the
spec (`w3c.github.io/web-share-target/`): a manifest declares a `share_target` member with
`action`, `method`, `enctype` and `params`; `params` names the query parameters the browser
should put `title`, `text` and `url` into. The action "must be within scope" and on a
potentially-trustworthy origin, and for `GET` the browser "serializes entries using the
urlencoded serializer and appends the result to the URL's query component". The spec's own
guidance is to use `GET` "when the target drafts a message for user approval" — which is what
opening a post for reading is — and `POST` only for side effects. So: `GET`.

**It needs the PWA installed.** MDN, *share_target*: "Your PWA can only act as a web share
target if it has been installed." That is not a limitation we can design around; it is the
feature's precondition, and it matches the owner's ask ("when it's installed as a PWA").

**Support, from `mdn/browser-compat-data`** (`manifests/webapp/share_target.json`, read
2026-09-04):

| | version_added |
|---|---|
| Chrome Android | 76 |
| Chrome (desktop) | 89 |
| Edge / Samsung Internet | mirror (Chrome) |
| Opera Android | 63 |
| **Firefox / Firefox Android** | **false** |
| **Safari / Safari iOS** | **false** |

**This will not work on iPhone, and there is no version of it that will.** Safari has never
shipped Web Share Target and iOS gives no other route for a web app to appear in the system
share sheet. An honest feature therefore says so somewhere a reader can find it, rather than
letting an iPhone owner conclude their install is broken. That is a phase below, not a footnote.

**On Android the URL does not arrive in `url`.** Chrome's own documentation
(`developer.chrome.com/docs/capabilities/web-apis/web-share-target`): "on Android, the `url`
field will be empty because it's not supported in Android's share system. Instead, URLs will
often appear in the `text` field, or occasionally in the `title` field." This is the single
detail that decides whether the feature works at all, and it is invisible from the spec.

**What Bluesky actually shares.** Per invariant 12, the client is the source of truth for what
the network does. `bluesky-social/social-app`, read 2026-09-04:

- `src/lib/sharing.ts` — `shareUrl(url)` on Android is `Share.share({message: url})`. The
  payload is the bare URL as `text/plain`, with no subject and no surrounding prose.
- `src/components/PostControls/ShareMenu/ShareMenuItems.tsx:49-63` — the shared string is
  `toShareUrl(makeProfileLink(postAuthor, 'post', rkey))`.
- `src/lib/routes/links.ts:6-18` — `makeProfileLink` uses the **handle** when it is valid and
  the **did** otherwise, so both `/profile/alice.bsky.social/post/<rkey>` and
  `/profile/did:plc:…/post/<rkey>` are real shapes in the wild.
- `src/lib/strings/url-helpers.ts:91` — `toShareUrl` prefixes `https://bsky.app`.

So the Android payload for the owner's screenshot is exactly:

```
text = "https://bsky.app/profile/leahmcelrath.bsky.social/post/3lxxxxxxxxx"
```

**The mobile website is a different story and the plan must not overstate it.**
`ShareMenuItems.web.tsx` offers only "Copy link to post" — there is no `navigator.share` call
on the post menu (the only `navigator.share` in the whole client is
`src/components/Lightbox/Lightbox.web.tsx:287`, for images). A reader on `bsky.app` in Chrome
Android therefore reaches Forage through **the browser's own Share**, which shares the address
bar — correct when they have opened the post, the feed's URL when they have not. We support it
by accepting whatever URL arrives; we do not claim the post menu does something it does not.

**Blacksky.** Blacksky (Rudy Fraser; `blackskyweb.xyz` marketing, `blacksky.community` app,
`blacksky.app` PDS, `rsky` in Rust) is a separate deployment on the same protocol. Its app is
a social-app-family client, so its post links carry the same `/profile/:name/post/:rkey` path
shape. Rather than keep a host allowlist that is wrong the day someone stands up another
client — and there are several: `deer.social`, `main.bsky.dev`, forks yet to exist —
**we match on the PATH SHAPE and ignore the host**, then resolve the handle against the real
network. A bogus host with a coincidentally identical path fails at `resolveHandle` with words.
An allowlist would have to be maintained forever to be no more correct than that.

Route shapes come from `social-app/src/routes.ts` (read 2026-09-04) and are shared by every
fork of it:

| bsky-family path | Forage destination |
|---|---|
| `/profile/:name/post/:rkey` | `/p?uri=at://<did>/app.bsky.feed.post/<rkey>` |
| `/profile/:name/feed/:rkey` | `/f/@<name>/<rkey>` (3v, resolves cold already) |
| `/profile/:name` | `/u/<name>` |
| `/hashtag/:tag` | `/h/<tag>` |
| `at://<did>/app.bsky.feed.post/<rkey>` (the dev-mode "Share at:// URI") | `/p?uri=…` |

## Decisions

**D1 — `GET /share`, one route, in the Bluesky population.** The spec prefers GET for a target
that shows something for approval; GET also means the payload is a normal query string, so
`/share?text=…` is a link anyone can test by typing it, and the service worker's existing
navigate handler answers it from the cached shell with no change. In the memory sandbox
`/share` gates with words through `blueskyOnly`, exactly as `/p` does — populations do not mix,
and a `bsky.app` link is not a thing the sandbox can honour.

**D2 — read `url`, then `text`, then `title`, and scan for a URL rather than trusting the
field.** The spec says a URL goes in `url`; Chrome says on Android it does not. Both are true
of different platforms, so the parser coalesces all three and extracts the first `https://` or
`at://` token it finds. This also survives the case a share sheet does add prose ("Check this
out https://…"), which some Android apps do.

**D3 — `replaceState`, never push.** `/share` is a doorway, not a page. If it stayed in the
history, Back from the thread would land on `/share`, which would immediately resolve forward
again — an inescapable loop. This is the same reasoning the landing rule already uses at `/`
(V5), and the same call: `replacePath` then `dispatch`.

**D4 — resolve `handle → did` explicitly, the way `resolveFeed` already does.** The AT-URI
syntax permits a handle in the authority position, but whether the AppView resolves one inside
`getPostThread` is not something this repo has measured, and shipping on an unmeasured
assumption is how the `/f/` cold-resolve bug happened. `com.atproto.identity.resolveHandle` is
unauth-200 and already proven here (3v). A segment that already starts with `did:` is not
looked up again.

**D5 — the parser is a pure module with no network and no DOM.** `js/share-target.js`.
Everything the feature can get wrong — which URL shape is which, where the URL was hiding, a
trailing slash, a `?ref_src=`, a percent-encoded tag — is decidable from a string, and a string
is testable without a browser. The view does the two things a string cannot: one network call,
and one navigation.

**D6 — close the `hiddenReason: 'scope'` loop, because this feature is what makes it visible.**
`shapeLensPost` already returns `{hidden: true, hiddenReason: 'scope'}` for a post outside the
reader's ring, and its comment says why: "a thread reached by direct link whose root your ring
hides needs a different empty state from a post that does not exist. It carries no wording; the
view owns that." **No view owns it.** `grep -rn hiddenReason` finds the two lines that write it
and nothing that reads it, so today a reader whose ring is set to Follows, opening a stranger's
post by direct link, gets a head byline reading `[removed]` above an empty heading. A share
target is a machine for producing exactly that situation — every shared post arrives by direct
link, and most of them are from strangers. Shipping the door without this would ship a feature
whose most common failure mode looks like a broken app. So the thread view reads the token and
says what happened, with the thread's own ring pill right there to widen it.

The ring itself is NOT special-cased for shared posts. A tempting alternative — open a shared
thread at World — was rejected: it would make `/share` and a pasted `/p` link behave differently
on the same post, which is a divergence with no reader-visible justification, and it would
override a choice the reader made on purpose. Say what happened and hand them the control.

**D7 — an unrecognised share is not an error.** A plain-text share, a link to a news site, a
YouTube URL: none of these are Forage destinations today, and none of them are the reader's
mistake. The landing shows what arrived, says Forage opens Bluesky posts, and offers the
original link out. Losing the payload silently would be the worst possible answer, since by
then the reader has left the app it came from.

## Phases

### Phase 0 — the parser (`js/share-target.js`) · `test/share-target.test.js`

`extractTarget({title, text, url})` → one of:

```
{ kind: 'post',     handle, rkey }      needs one resolveHandle
{ kind: 'thread',   uri }               an at:// post uri — no resolution needed
{ kind: 'feed',     handle, rkey }      → /f/@handle/rkey
{ kind: 'profile',  handle }            → /u/handle
{ kind: 'hashtag',  tag }               → /h/tag
{ kind: 'internal', path }              a forage.fyi link → that path
{ kind: 'unknown',  shared, link }      what arrived, and a link out if there was one
```

plus `directPath(target)` for every kind that needs no network. Pure; no `Date.now()`, no
`fetch`, no `document`.

### Phase 1 — the manifest and the service worker

`manifest.webmanifest` gains the `share_target` member (GET, action `/share`, params
`title`/`text`/`url`). `sw.js` adds `/js/share-target.js` to `SHELL` (`test/shell.test.js`
enforces this mechanically) and bumps `CACHE` — an installed PWA whose manifest changed needs
Chrome to re-read it, and a stale precache is the other half of the same staleness.

### Phase 2 — `/share` (`lensShareView` in `js/ui/lens-views.js`, route in `js/main.js`)

Resolve, `replacePath`, `dispatch`. A skeleton while the one network call is out; an empty
state with the original link when it fails.

### Phase 3 — the scoped-out head (D6)

`lensThreadView` reads `p.hiddenReason === 'scope'` and renders a named empty state above the
thread's ring pill instead of a `[removed]` byline over nothing.

### Phase 4 — the documents

`README.md` (a "Share to Forage" section under the Bluesky surfaces, including the iOS
boundary), `CHANGELOG.md`, `ledger/divergence.js` **DL-038** (share-to-Forage is a Bluesky-
population door with no sandbox analogue — invariant 8), `FEATURE.md`.

### Phase 5 — the journey (`e2e/share-target.workflow.mjs`, invariant 6b)

Over the hermetic shim: a `text=`-carried `bsky.app` post URL lands on `/p?uri=at://…` with the
post rendered and `/share` gone from the history; a `did:` in the handle position skips
`resolveHandle`; a profile, a feed, a hashtag and an `at://` uri each land on their route; an
unrecognised share says so and keeps the link; and the manifest really declares the target.

## Verification

`npm test` · `npm run conformance` · `npm run workflows`. No mutation is added (this is a read
path), so invariants 5 and 6 do not engage; invariant 6b does, and Phase 5 is it.
