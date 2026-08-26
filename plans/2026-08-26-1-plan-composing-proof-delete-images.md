# Composing, proved and completed: live proof → delete → images

**Status:** ✅ **COMPLETE — phases 1, 2 and 3 all executed 2026-08-26**, each live-proved against the real network. Not yet landed on main.
**Repo:** `forage` (CroftCommunity/forage) · worktree `worktrees/forage/modes-bbs`
**Predecessor:** `plans/2026-08-25-1-plan-backend-modes-bsky-writes.md` (3w shipped composing)

## Problem Statement

3w gave Forage the ability to write posts, and shipped to forage.fyi at
`main @ 1eef03f` / `forage-v25`. It left three things unfinished, in an order
the owner chose (2026-08-26: *"do 1, 2 then 3"*).

**1. Composing has never written a post.** Every rule around it is verified —
lexicon limits, byte-indexed facets, reply refs, the narrowed write invariant —
but no `app.bsky.feed.post` record has ever hit the network from this code. All
five journeys drive a fetch shim; the shim's fixtures were written by the same
author as the code they check, so they can be wrong in the same direction. This
is the only claim in the shipped feature resting on tests rather than evidence,
and it is exactly the class of gap that
[`experiment-verdict-hygiene`](../../../plaude-cli-config/projects/-Users-cpettet-git-chasemp-CroftC/memory/experiment-verdict-hygiene.md)
records as producing wrong findings past green tests.

**2. You can write but not unwrite.** There is no way to remove a post made
from Forage. This is deliberate as far as it goes — `deleteRecord` stayed bound
to unliking, and the invariant test pins that — but "post something, regret it
immediately, no way to remove it" is a bad property for a forum, and it gets
worse the moment anyone other than the owner can post. It is also a trust
property: a client that can write and not delete is asking for more faith than
it earns.

**3. You cannot post an image.** Boards render images well (3t even added a
size slider), which makes the asymmetry conspicuous: Forage displays media it
cannot produce. For a forum whose most-used boards are visual (the owner's own
example feed was "Funny"), text-only composing is a visible half-feature.

**Constraint carried from the predecessor plan:** feeds get no compose
affordance (DL-025 — a feed's inclusion criteria are unpublished, so promising
entry would be a lie). Everything here applies to hashtag boards and thread
replies only.

## Reasoning

**Why proof before more building.** Phase 1 is deliberately first and
deliberately cheap. If the record shape is wrong — a facet index off by the
BOM, a reply ref the appview rejects, a scope the token lacks — then phases 2
and 3 build on sand, and the cost of finding out grows with every unit stacked
on top. The rule this repo already follows for external APIs ("write a minimal
probe first, print the raw response, confirm field names before building logic
on top of it") applies to writes as much as reads; 3w skipped it because the
lexicon was unusually well-specified. Phase 1 pays that debt before it
compounds.

**Why the local preview and not production.** `authModeFor` (js/auth/session.js)
returns `'loopback'` for `127.0.0.1`, and `buildLoopbackClientId` builds a
`http://localhost?redirect_uri=…` client_id with an IP-literal redirect at the
origin root. So OAuth works against the real Bluesky auth server from the local
preview, against a real PDS, with a real token — the network is production, only
the page is local. That gives a true live proof without the first-ever write
happening on the public site.

**Why the test account and not the owner's.** `CroftC/.env` carries
`test_user1` / `test_pass1` / `test_did`, registered in `.claude/TESTBED.md`.
Writes are real and public: they appear on bsky.app under whatever account
authorizes them. The test account is the account whose public timeline we are
free to dirty, and phase 1 deletes what it writes.

**Why delete comes before images.** Two reasons, and the second is the stronger.
(a) Phase 1 needs a cleanup path anyway — it writes real posts to a real
account, and doing that cleanup through the app rather than a throwaway script
means the cleanup path is itself the feature. (b) Images make posts *heavier*:
a bad image post is more embarrassing and more expensive to leave lying around
than a bad text post. Shipping "you can post pictures" before "you can delete
what you posted" is the wrong order for a client asking people to trust it with
their account.

**Why alt text is required, not encouraged.** Verified from the lexicon:
`app.bsky.embed.images#image` has `required: ["image", "alt"]`. Alt is not
optional in the data model. A composer that lets you post an image without alt
text is one that either sends `alt: ""` — technically valid, practically a
blank — or fails at the network. Making it a required field in the UI matches
the lexicon and is the accessible default; the cost is one extra input, and
the alternative is a client that quietly ships inaccessible posts.

**Alternatives considered and rejected:**

- *Skip phase 1, trust the tests.* Rejected: the tests and the fixtures share
  an author, so they can be wrong together. The whole point of the phase is to
  introduce a source of truth that is not us.
- *Do the live proof against production forage.fyi instead of the preview.*
  Rejected for the proof itself (the first-ever write should not be a
  production event), but production re-verification stays in the Done-when of
  each phase after landing.
- *Delete via a "manage your posts" page listing everything you wrote.*
  Deferred, not rejected. `/u/<own handle>` already renders the author feed, so
  the listing exists; the delete control belongs on the post, where the post
  is. A dedicated management page is a bigger surface (bulk actions, filters)
  and can come later if wanted.
- *Soft-delete / hide-locally instead of a real `deleteRecord`.* Rejected as
  dishonest. The post lives in the user's own repo and is visible everywhere on
  the network; hiding it in Forage while it remains public would be exactly the
  kind of comfortable lie this codebase's ledger exists to prevent.
- *Client-side image compression to fit under the 2 MB cap.* Deferred to a
  frontier, not built. Re-encoding someone's photo silently changes what they
  posted. Phase 3 refuses an oversized file by name and says the limit, which
  is honest; an "optimize this for me" affordance can be added later as an
  explicit, visible choice.
- *Support all four images at once (the lexicon maximum).* Kept — four is the
  lexicon's cap and the grid is not meaningfully harder than one. But alt text
  is per-image, and the UI must not make three of them easy to skip.

**Assumption being made:** that the test account's PDS is `bsky.social` and its
blob limits match the lexicon's stated 2 MB. Phase 1 confirms the first as a
side effect of signing in; phase 3's discovery step confirms the second before
the UI is built, because a PDS may enforce something stricter than the lexicon
documents.

## Verified Assumptions

| Claim | How confirmed |
|---|---|
| `app.bsky.embed.images` takes at most **4** images | Official lexicon `app/bsky/embed/images.json`, fetched 2026-08-26: `images.maxLength: 4` |
| Each image **requires** both `image` and `alt` | Same file: `#image.required: ["image", "alt"]` |
| Image blobs are capped at **2,000,000 bytes**, `image/*` | Same file: `maxSize: 2000000`, `accept: ["image/*"]`, description "May be up to 2 MB, formerly limited to 1 MB" |
| `aspectRatio` is optional, `{width, height}`, integers ≥ 1 | `app/bsky/embed/defs.json#aspectRatio` |
| `com.atproto.repo.uploadBlob` is a procedure, `input.encoding: "*/*"`, requires auth, implemented by the PDS | Official lexicon `com/atproto/repo/uploadBlob.json` |
| **An uploaded blob is deleted if not referenced within minutes**, and blob restrictions are enforced when the *reference* is created, not at upload | Same file, description verbatim. Consequence: upload must be adjacent to publish, and an abandoned composer leaks nothing |
| OAuth works from `127.0.0.1` against the real auth server | `js/auth/session.js:22` `authModeFor` returns `'loopback'` for loopback hostnames; `buildLoopbackClientId` (`:31`) builds an IP-literal `redirect_uri` at the origin root with an explicit scope |
| The local preview serves on `127.0.0.1:8737` by default | `scripts/preview.mjs:11,31` (`PORT` env overridable) |
| A post's author DID is on the shape as `authorId` | `js/substrates/lens.js:170` — `authorId: post.author?.did || null`; masked/muted shapes set it to `null` |
| The lens already tolerates missing thread nodes | `js/substrates/lens.js` `build()` skips entries without `.post` ("blocked / notFound stubs") — a deleted post in a thread will not crash the view |
| Test credentials exist and are named | `CroftC/.env` defines `test_user1`, `test_pass1`, `test_did` (values never printed, never committed); registry in `CroftC/.claude/TESTBED.md` |
| `app.bsky.feed.post` requires `text` + `createdAt`; text capped at 3000 bytes AND 300 graphemes | `app/bsky/feed/post.json`, fetched 2026-08-26 (already encoded in `js/compose.js` and `test/compose.test.js`) |

**Explicitly NOT verified** (phase-gated, see Open Questions):
- Whether `bsky.social`'s PDS enforces a blob size stricter than the lexicon's 2 MB.
- Whether `uploadBlob` requires an accurate `Content-Type` header or sniffs the body.
- Whether the appview reflects a `deleteRecord` immediately in `getAuthorFeed`, or lags.

## Documentation Impact

- `AGENTS.md` — invariant 6b (per-unit journey convention) already covers the new
  journey segments; **check** whether the "the lens writes only likes" framing
  appears there and needs the 3w/4b widening. Phase 2 handles it if so.
- `TODO.md` — the "can't compose" and "can't delete" rows retire; a "live-proved"
  note replaces the 3w caveat. Phase 1 and phase 2 each update their own row.
- `ledger/divergence.js` — DL-027 (composing's frontier list) is edited by phase 2
  (delete leaves the list) and phase 3 (images leave the list; a new frontier for
  video/gallery/self-labels/mentions/editing remains). Each phase edits it in its
  own commit.
- `plans/2026-08-25-1-plan-backend-modes-bsky-writes.md` — its 3w entry gains a
  pointer to this plan's live proof. Phase 1.
- `docs/` — grepped for "compose", "publish", "uploadBlob": no matches outside
  the plan tree, so no other doc goes stale.
- `discovery/alpha/ROADMAP_TODO.md` (E138) — updated once at the end, with the
  queue's outcome. Not a per-phase item because it is a cross-repo doc and each
  edit is a separate commit in another repo.

## Concurrency Map

**Fully sequential. No parallelism.**

Phase 1 must complete before 2 and 3 because it is the proof the record shape
is right — building on an unproved shape is the risk it exists to remove. Phase
2 precedes 3 by the reasoning above (delete before heavier posts). All three
phases write `js/ui/lens-views.js`, `test/`, `e2e/`, `ledger/divergence.js`, and
`sw.js`, so their write-sets overlap almost completely; they could not run in
parallel even if the ordering were free.

**Shared external state across all phases:** the test account's public repo on
`bsky.social`. Every phase that writes must clean up after itself, and no two
phases may run against it at once — which sequential execution already
guarantees, since a single session runs them in order.

## Phases

### Phase 1: Live proof — a real post, a real reply, on a real PDS

**Goal:** Convert "composing works" from a test claim into an observed fact,
and find whatever the fixtures got wrong before anything is built on top.

**Discovery Exemption applies to the probe itself** — the smoke run is
throwaway operator work, not production code, and gets no tests of its own.
Anything it *finds* comes back as a RED test first, in this phase.

**Changes:**
- [ ] Run the local preview at `127.0.0.1:8737` from this worktree.
- [ ] Sign in via the loopback OAuth path as `test_user1` (credentials from
      `CroftC/.env`, never printed, never echoed into a transcript).
- [ ] Post once to a deliberately quiet hashtag — `#forage-smoke-<date>` — so
      the post lands in a board nobody else is reading.
- [ ] Capture the raw `createRecord` request and response: the record as sent,
      the returned `uri` and `cid`.
- [ ] Verify the written record independently of our own code:
      `com.atproto.repo.getRecord` for the exact rkey, and confirm the facet
      byte-indices slice back to `#forage-smoke-<date>` from the returned text.
- [ ] Open a thread and reply once; verify `reply.root` / `reply.parent` on the
      stored record, and that `getPostThread` on the root returns the reply
      nested where it belongs.
- [ ] Confirm both appear under the test account on bsky.app (a second,
      independent renderer — if bsky.app shows the hashtag as a live link, the
      facet is genuinely right).
- [ ] Delete both records to leave the account clean (API directly this phase;
      phase 2 makes it a product feature).
- [ ] For each discrepancy found: write the RED test first, then fix.
- [ ] Record the outcome in this plan's Review Log with the actual URIs.

**Call chain:** browser → `js/ui/lens-views.js` `composerCard` → `lens.publish`
→ `js/compose.js` `buildPost` → `com.atproto.repo.createRecord` on the test
account's PDS. This is the same chain the journeys drive; phase 1 replaces the
shim at the last hop with the real network.

**Wiring test:** none new *if nothing is found* — the existing journey segments
(`3w` in `e2e/bluesky-view.workflow.mjs`) already cover this chain against the
shim, and this phase's job is to check the shim against reality. **If a
discrepancy is found, the wiring test is the RED test that reproduces it
through the fixture**, so the journey catches that class forever after.

**Depends on:** nothing. First.

**Read-set:** `js/compose.js`, `js/substrates/lens.js`, `js/ui/lens-views.js`,
`js/auth/session.js`, `scripts/preview.mjs`, `CroftC/.env` (read, never echoed).

**Write-set:** `plans/2026-08-26-1-plan-composing-proof-delete-images.md`
(Review Log). Plus, **only if a discrepancy is found**: `js/compose.js`,
`test/compose.test.js`, `e2e/bluesky-view.workflow.mjs`.

**Shared-state contract:**
- **External, real:** the `test_user1` account's public repo on `bsky.social`.
  Two records created, both deleted before the phase closes. Nothing else in
  that repo is touched — no preferences, no follows, no likes.
- **Process:** binds `127.0.0.1:8737` for the preview; released at phase end.
- **Secrets:** reads `CroftC/.env`. Credentials are typed into the OAuth form,
  never logged, never written to a fixture, never included in a commit or a
  transcript.
- **Git:** no branch operations. Commits (if any) land on `claude/modes-bbs`.

**Risks:**
- *A real post is public the moment it is written.* Mitigated by the quiet
  hashtag and by deleting both records in the same session — but a post is
  federated immediately, so "deleted" means "removed from the repo", not
  "never existed". This is inherent, and is why the smoke text should be
  unremarkable.
- *OAuth on loopback may have drifted* since 2c validated it. If sign-in fails,
  that is itself a finding and this phase stops to fix it.
- *A discrepancy may be structural* (e.g. the appview rejects our facet shape
  outright). If so, this phase grows into a fix and phases 2–3 wait — which is
  precisely the value of doing it first.

**Done when:**
1. **Behavioral:** A post and a reply written through Forage's own composer
   exist on the real network under the test account, are rendered correctly by
   bsky.app (a renderer we did not write), and are then removed — with the sent
   record, the returned uri/cid, and the independently-fetched record all
   recorded in the Review Log.
2. **Verification:** `npm test && npm run conformance && node e2e/run.mjs` still
   green (proving any discovered fix is pinned), plus the raw `getRecord`
   output pasted into the Review Log. **A run that finds nothing is a result,
   not an absent one** — the Review Log must name what was checked and state
   that it held, or a future reader cannot tell this phase from an unrun one.

**Validation:** **Broad.** This phase *is* validation — external system,
real auth, real writes. Tests alone are definitionally insufficient here; that
is the entire premise.

---

### Phase 2: Delete your own post

**Goal:** A post you wrote from Forage can be removed from Forage.

**Changes:**
- [ ] RED: `test/compose.test.js` (or a new `test/lens-writes.test.js` block) —
      `canDelete(post, session)` is true only when `post.authorId === session.did`
      and the post is not masked; false for everyone else's posts, false with no
      session, false for a shape whose `authorId` is null (masked/muted).
- [ ] RED: `lens.deletePost(uri)` derives the rkey from the at-uri, refuses a uri
      whose repo is not the session DID (**never** delete from another repo, even
      if asked), and calls `deleteRecord` with `collection: POST_COLLECTION`.
- [ ] GREEN: implement both. `deletePost` lives beside `publish` under the
      publish marker.
- [ ] `test/invariants.test.js` — widen deliberately: **two** `deleteRecord`
      calls, one bound to `LIKE_COLLECTION` (unlike) and one to
      `POST_COLLECTION` (delete-own-post), each under its marker. The assertion
      that a delete is reachable only by unliking is replaced by a narrower,
      truer one: each delete binds to its own named collection, and neither can
      target a repo other than the session's. **Pass 2:** the current check uses
      `src.indexOf('deleteRecord')` (the FIRST occurrence) — with two deletes
      that silently inspects only one. Assert per occurrence.
- [ ] `AGENTS.md` — add the delete row to the write table (Pass 2 finding: the
      table went two commits stale before this plan existed).
- [ ] UI: a Delete control on posts you own — on the thread head and on your own
      comments — behind a confirm step, since it is irreversible.
- [ ] Journey (RED first): sign in, post to a hashtag, delete it, assert the
      `deleteRecord` request names the right collection and rkey, and that no
      delete control renders on a post authored by someone else.
- [ ] `ledger/divergence.js` — DL-027 loses "editing or deleting a post" and
      keeps editing (still not built; editing a post is `putRecord`, which the
      lens still does not do).
- [ ] `TODO.md` + `AGENTS.md` if the read-only framing needs updating.
- [ ] `sw.js` cache bump if any module is added.

**Call chain:** browser → thread/board row → Delete control (`lens-views.js`)
→ confirm → `lens.deletePost(uri)` → `com.atproto.repo.deleteRecord`. After
success the view refetches, and the deleted post is gone because the appview
stops returning it (or returns a notFound stub, which `build()` already skips).

**Wiring test:** journey segment in `e2e/bluesky-view.workflow.mjs` — clicking
the Delete control on an own-authored post issues a `deleteRecord` with
`collection: 'app.bsky.feed.post'` and the right rkey. Not a unit test on
`deletePost`; the click must reach the network layer.

**Depends on:** Phase 1 (the record shape is proved before we build management
on top of it). Phase 1 also *uses* deletion manually, so this phase turns a
manual step into a feature.

**Read-set:** `js/substrates/lens.js`, `js/ui/lens-views.js`, `js/ui/components.js`,
`test/invariants.test.js`, `ledger/divergence.js`.

**Write-set:** `js/substrates/lens.js`, `js/ui/lens-views.js`,
`test/lens-writes.test.js`, `test/invariants.test.js`,
`e2e/bluesky-view.workflow.mjs`, `ledger/divergence.js`, `TODO.md`, `sw.js`.

**Shared-state contract:** no shared mutable state beyond the file write-set.
The journey drives the fetch shim, so no real network. If a manual check is
done against the test account, it deletes what it creates.

**Risks:**
- *Deleting the wrong thing.* Mitigated by the repo guard in `deletePost` (the
  at-uri's DID must equal the session DID) plus the ownership check in the UI —
  two independent gates, and the unit test asserts the guard rejects a
  foreign-repo uri even when called directly.
- *Widening the delete invariant is a real loosening.* Mitigated by making the
  replacement assertion stronger where it can be: each delete binds to a named
  collection constant, and the repo is always the session's.
- *A deleted post may linger in the appview.* If observed, the UI says the post
  was deleted and may take a moment to disappear, rather than pretending it is
  gone or silently re-showing it.

**Done when:**
1. **Behavioral:** Signed in, you can delete a post you wrote from inside
   Forage, it disappears from the thread, and no delete control appears on
   anyone else's post.
2. **Verification:** `node e2e/run.mjs` — the journey segment that clicks Delete
   and asserts the `deleteRecord` request shape — plus `npm test` for the guard
   and the widened invariant.

**Validation:** **Moderate.** Wiring test + unit tests + one manual
delete against the test account on the local preview, confirming the post is
gone from bsky.app too.

---

### Phase 3: Images in posts

**Goal:** A post composed in Forage can carry up to four images, each with alt
text, and the boards that already render images render these.

**Phase 3.0 — discovery (Discovery Exemption applies, no TDD):**
- [ ] Probe `uploadBlob` against the test account with a small PNG: confirm the
      response shape (`blob` ref: `$type`, `ref.$link`, `mimeType`, `size`),
      and whether an explicit `Content-Type` is required or the body is sniffed.
- [ ] Probe the **actual** enforced size limit on `bsky.social` by referencing
      a blob just over 2 MB — the lexicon says restrictions are enforced when
      the reference is created, so the failure should come from `createRecord`,
      not `uploadBlob`. Record the exact error.
- [ ] Confirm whether `aspectRatio` affects rendering enough to be worth
      computing client-side (it is optional; the question is whether omitting it
      makes bsky.app or our own board lay the image out badly).
- [ ] Disposition: throwaway. Findings become Verified Assumptions in this plan
      and RED tests in 3.1.

**Phase 3.1 — the pure layer (TDD):**
- [ ] RED: `buildPost({ images })` produces `embed: { $type: 'app.bsky.embed.images', images: [...] }`;
      refuses more than 4 (naming the cap); refuses an image with no alt text
      (the lexicon requires it); refuses a non-`image/*` mime; refuses a blob
      over the confirmed limit; passes `aspectRatio` through when given and
      omits it when not.
- [ ] RED: a post with images but no text is legal (`text: ''` is allowed by the
      lexicon — confirm in 3.0 and pin whichever way it lands).
- [ ] GREEN: implement in `js/compose.js`.

**Phase 3.2 — the upload path and the UI (TDD):**
- [ ] RED: `lens.uploadImage(file)` posts the bytes to `uploadBlob` with the
      file's type, returns the blob ref, refuses without a session, and refuses
      a file over the limit **before** the upload (a client-side check that
      names the limit beats a server round-trip that fails).
- [ ] GREEN: implement beside `publish`.
- [ ] UI: a file picker in the composer, up to 4, each with a **required** alt
      text input and a thumbnail preview; the Post button stays disabled while
      any image lacks alt text, and says why.
- [ ] Upload happens on Post, not on select — the lexicon says an unreferenced
      blob is garbage-collected within minutes, so uploading early risks a
      blob that expires while someone is still typing.
- [ ] Journey (RED first): attach a fixture image, fill alt text, post, assert
      the `createRecord` body carries a well-formed `embed.images` with the blob
      ref and alt; assert Post is disabled with alt text missing; assert a
      5th image is refused with words. **Also assert an image on a REPLY** —
      the lexicon puts `embed` on the post record, so a reply carries images as
      naturally as a top-level post, and it is the same composer component
      (Pass 2 finding: this was unspecified).
- [ ] `e2e/harness/shim.mjs` is shared by all five journeys — after changing it
      for binary bodies, run all five, not just this one.
- [ ] `ledger/divergence.js` — DL-027 loses images; video, gallery, external
      link cards, self-labels, mention facets, and editing remain.
- [ ] `sw.js` cache bump.

**Call chain:** browser → composer file input (`lens-views.js`) → on Post:
`lens.uploadImage(file)` per image → `com.atproto.repo.uploadBlob` → blob refs
→ `buildPost({ images })` → `lens.publish` → `createRecord`. The rendered result
returns through the existing `mediaNode` path the boards already use.

**Wiring test:** journey segment — attaching a fixture image and clicking Post
produces one `uploadBlob` request per image followed by a `createRecord` whose
`record.embed.images[0].image` is the ref that upload returned. The ordering
matters and the test asserts it: a `createRecord` referencing a blob that was
never uploaded is exactly the failure this catches.

**Depends on:** Phase 2 (delete exists before heavier posts can be made) and
Phase 1 (record shape proved).

**Read-set:** `js/compose.js`, `js/substrates/lens.js`, `js/ui/lens-views.js`,
`js/ui/components.js` (`mediaNode`), `e2e/harness/shim.mjs`.

**Write-set:** `js/compose.js`, `js/substrates/lens.js`, `js/ui/lens-views.js`,
`test/compose.test.js`, `test/lens-writes.test.js`,
`e2e/bluesky-view.workflow.mjs`, `css/app.css`, `ledger/divergence.js`, `sw.js`.

**Shared-state contract:** 3.0 writes to the test account's repo (one blob, one
record, both cleaned up). 3.1/3.2 are shim-driven — no real network. The
journey needs a small binary fixture; it must be a data URI or a checked-in
file small enough to be uncontroversial, and `e2e/harness/shim.mjs` must handle
a non-JSON request body without assuming JSON.

**Risks:**
- *The shim assumes JSON bodies.* `uploadBlob` sends raw bytes. The harness may
  need a small change to record a binary hit without trying to parse it —
  a change to shared test infrastructure, so it must not break the other four
  journeys. Run all five after touching it.
- *Silent oversized-image failures.* Mitigated by the client-side check that
  names the limit before uploading, and by 3.0 confirming the real limit rather
  than trusting the lexicon's number.
- *Alt text as friction.* Accepted deliberately (see Reasoning). If it proves
  genuinely obstructive in use, the fix is better UX around it, not making it
  optional.
- *Scope creep into video/gallery.* Explicitly out. The union has other members;
  this phase implements exactly `app.bsky.embed.images`.

**Done when:**
1. **Behavioral:** Signed in on a hashtag board, you can attach up to four
   images with alt text, post them, and see them render in the board and on
   bsky.app; posting is blocked with a stated reason when alt text is missing
   or a file is too large or a fifth image is attached.
2. **Verification:** `node e2e/run.mjs` — the journey asserting upload-then-
   reference ordering and the embed shape — plus `npm test` for the pure rules,
   plus one real image posted from the local preview to the test account and
   confirmed on bsky.app, then deleted.

**Validation:** **Broad.** New external call (`uploadBlob`), binary payloads,
a shared-harness change, and a real-network confirmation. Tests are the floor.

## Open Questions

- [RECOMMENDED: PHASE-GATED — phase 1] Which hashtag should the smoke posts
  carry? *Recommendation: `#forage-smoke-<YYYYMMDD>`, which is almost certainly
  unused and self-explanatory if anyone stumbles on it. Rationale: a real tag
  like `#test` puts noise into a board people read.*
- [RECOMMENDED: PHASE-GATED — phase 3.0] Does `bsky.social` enforce a blob
  limit stricter than the lexicon's 2 MB? *Recommendation: probe before
  building the client-side check, so the number the UI states is the number the
  server actually applies. Rationale: stating a limit that is wrong in either
  direction is worse than stating none.*
- [RECOMMENDED: ADVISORY] Should a post with images but no text be allowed?
  *Recommendation: allow it if the lexicon does (confirm in 3.0) — an image
  post with no caption is an ordinary thing to want. Rationale: our own
  `buildPost` currently refuses empty text, so this is a deliberate exception
  that needs its own test either way.*
- [RECOMMENDED: ADVISORY] Should deleting a post you are currently reading in a
  thread navigate away, or leave you on a "this post was deleted" view?
  *Recommendation: leave you there with a plain statement and a link back to
  the board. Rationale: a surprise navigation is disorienting, and the thread's
  other posts may still be worth reading.*
- [RECOMMENDED: ADVISORY] Should phase 2 also allow deleting your own *reply*
  from within a thread? *Recommendation: yes — same record type, same guard,
  and a reply you regret is the more common case. Rationale: scoping delete to
  top-level posts would be an arbitrary distinction the data model does not
  make.*

## Review Log

### Pass 1: Plan development — 2026-08-26
Drafted after the owner chose the order ("do 1, 2 then 3"). Assumptions
verified up front against the official lexicons (`embed/images`,
`repo/uploadBlob`, `embed/defs`) and against this repo's own source
(`auth/session.js` loopback OAuth, `lens.js` `authorId`, `preview.mjs` port) —
recorded in Verified Assumptions with file:line or fetch provenance. Three
things the verification changed about the plan as first conceived:
(a) alt text moved from "encouraged" to **required**, because the lexicon
requires it; (b) blob upload moved from on-select to **on-post**, because an
unreferenced blob is garbage-collected within minutes; (c) a phase 3.0
discovery step was added, because the lexicon documents a 2 MB cap but says
restrictions are enforced at reference time — which means the PDS, not the
lexicon, is the authority on what actually fails.

### Pass 2: Gap analysis — 2026-08-26

Six findings, four fixed in the plan, one fixed in the repo immediately, one
accepted.

1. **Doc drift, already shipped (fixed in the repo, `bd964f4`).** `AGENTS.md`
   claimed "Two writes exist in the lens and only two" — untrue since 3s
   (favorite) and 3w (publish), both mine. Replaced with a table of every write
   and its origin, plus the rules that did survive (no `putRecord`; saved ≠
   pinned), and the shareable `/f/@creator/:rkey` route. This is the exact
   failure Documentation Impact exists to prevent, and it happened anyway
   because 3s/3w had no plan doc to carry the section. Consequence for this
   plan: **each phase updates `AGENTS.md`'s write table in its own commit**,
   phase 2 (delete) and phase 3 (images do not add a write, but the composer
   description changes).
2. **The invariant test's delete assertion breaks under two deletes.**
   `test/invariants.test.js` does `src.indexOf('deleteRecord')` and asserts the
   400 characters before it mention unlike. With a second `deleteRecord` that
   check silently keeps passing while only inspecting the first. Phase 2 must
   assert **per occurrence**, not on the first index. Added to phase 2's
   changes.
3. **Replies with images were unspecified.** The lexicon puts `embed` on the
   post record, so a reply can carry images as naturally as a top-level post,
   and the composer is one component used in both places. Phase 3 covers both;
   the journey asserts an image on a reply too.
4. **Phase 1 had no explicit "nothing found" outcome.** A live proof that finds
   nothing is a *result*, not an absence of one, and needs recording or a future
   reader cannot tell the phase from an unrun one. Done-when now requires the
   Review Log to name what was checked even when everything passed.
5. **`e2e/harness/shim.mjs` is shared by five journeys** and phase 3 changes it
   for binary bodies. Already in the risks; promoted to an explicit instruction
   to run all five after touching it.
6. **Accepted, not fixed:** phase 1 writes to a real public account and
   "deleted" means removed-from-repo, not never-federated. Inherent to proving
   anything against a real network; mitigated by an unremarkable smoke text and
   a quiet tag.

### Pass 3: Quality gates — 2026-08-26

- **TDD ordering:** every phase names its RED test before its implementation.
  Phase 1 and phase 3.0 are the two exceptions and both invoke the Discovery
  Exemption explicitly, with a stated disposition (throwaway) and a rule that
  anything *found* returns as a RED test first. Checked: no phase says "add
  tests" after a GREEN step.
- **Wiring tests:** phases 2 and 3 each name a journey segment that drives the
  entry point, not a unit test on the new function. Phase 1's wiring test is
  conditional by nature (there is nothing new to wire) and says so, rather than
  claiming a test it will not write.
- **Validation calibration:** phase 1 Broad, phase 2 Moderate, phase 3 Broad.
  Not uniform — phase 2 is a small guarded write against machinery already
  proved, and saying so is the point of the field.
- **Verification commands exercise entry points:** phase 2 and 3 verify with
  `node e2e/run.mjs` (the journey), not `node --test test/compose.test.js`.
  Phase 1 verifies with raw `getRecord` output, which is the only honest gate
  for a claim about the real network.
- **Diagnostic readiness:** phase 1 records the sent record, the returned
  uri/cid, AND the independently-fetched record — three artifacts, so a
  disagreement between them localizes the fault instead of just reporting one.
- **Isolation honesty:** the Concurrency Map declares full sequence and gives
  the real reason (near-total write-set overlap), not a mechanism.
- **Gate confirmed:** open questions are all PHASE-GATED or ADVISORY; none
  BLOCKING, so execution can start at phase 1.

### Phase 1 executed — 2026-08-26 — ✅ composing is PROVED, and it found two things

Ran against the real network: local preview on `127.0.0.1:8741`, loopback OAuth
through `bsky.social`'s real authorize screen, real token, real PDS, test
account `did:plc:xyfhcaweaeyew3zrgk6jaln7`.

**What was written and what came back.**

A post, composed through Forage's own composer on `/h/forage-smoke-20260826`:

```
SENT     {"$type":"app.bsky.feed.post",
          "text":"Checking that Forage can write a post. Ignore me. #forage-smoke-20260826",
          "createdAt":"2026-08-26T19:49:21.251Z",
          "facets":[{"index":{"byteStart":50,"byteEnd":72},
                     "features":[{"$type":"app.bsky.richtext.facet#tag",
                                  "tag":"forage-smoke-20260826"}]}]}

RETURNED 200 {"uri":"at://did:plc:xyfhc…/app.bsky.feed.post/3mtz43zvmqn2w",
              "cid":"bafyreidxbqrcs4h3gsvztw4r2f5mxxd6hgy4nkhuiovlk4eemecj7rkwe4",
              "validationStatus":"valid"}
```

`validationStatus: "valid"` is the PDS validating the record against the
lexicon — an authority that is not us.

Fetched back independently via `com.atproto.repo.getRecord`, the stored record
matched byte for byte, and — the check that mattered — the facet indices sliced
out of the **fetched** text (not ours) yield exactly `'#forage-smoke-20260826'`.
The byte-index handling is correct against the real thing.

A reply, composed in the thread:

```
SENT     reply:{"root":  {"uri":"…/3mtz43zvmqn2w","cid":"bafyreidxbqrc…"},
                "parent":{"uri":"…/3mtz43zvmqn2w","cid":"bafyreidxbqrc…"}}
RETURNED 200 uri …/3mtz4d3pvxl2w, validationStatus "valid"
```

`getPostThread` on the root then returned it **nested as a reply**, with its
refs pointing back at the root. Threading works against the real appview.

All three records (the post and two replies — two smoke runs each posted once)
were deleted afterwards; `listRecords` reports **0 posts** in the test repo.

**Finding 1 — posts declared no language.** The first record ever written
carried no `langs`. That is what the code did when no Forage content-language
was set, and tests could not see it because no test asserted a field's absence
mattered. It does: every other client declares a language, language filters key
off it — *including Forage's own 3u filter* — so an undeclared post is
invisible to all of them. Fixed test-first: `buildPost` now takes `navLang` and
claims the browser's language when nothing better is set, drops the region
(`pt-BR` → `pt`), lets an explicit Forage preference win, and still says nothing
when even the browser is unknown rather than guessing English.

**Finding 2 — a click during session restore vanished.** Clicking Reply on a
freshly-loaded thread did nothing at all: no composer, no message. The session
was still restoring and the view re-rendered underneath the click. "Not signed
in *yet*" and "not signed in *at all*" are different situations, and the code
was treating them as one. Fixed test-first with a pure `sessionGateMessage` —
restoring says *wait*, signed-out says *sign in* and names the action attempted
— now shared by both compose surfaces, with a journey assertion so the two can
never be conflated again. The ring dial already handled this window correctly
(3b); the compose surfaces did not inherit it.

**Neither finding was visible to the test suite before the live run**, which is
the phase's whole justification.

**Done-when, met:** post and reply written through the composer, rendered and
threaded correctly by an appview we did not write, then removed. 326 unit / 88
conformance / 5 journeys green with both fixes pinned.

### Phase 2 executed — 2026-08-26 — ✅ delete your own post

**Two independent gates, because a delete that can reach another repo is a
different capability wearing this one's name.** `canDelete` (pure) requires the
post's `authorId` to equal the session DID *and* the at-uri to parse as an
`app.bsky.feed.post` uri in that same repo — the uri is the authority, not the
label, so a shape claiming to be ours while pointing elsewhere is refused. And
`deletePost` re-checks the same thing at the network boundary, so the guard
holds when it is called directly rather than through a button. `null === null`
is explicitly excluded: a masked shape (whose `authorId` is null) can never
match a session with no DID.

**Confirmation is two clicks, not a dialog.** `confirm()` freezes the whole
page, and the browser-automation guidance in this workspace calls that out
directly; arming the button in place (`Delete` → `Really delete?`, coloured,
relaxing after 6s if unanswered) is the same safety at none of the cost.

**Replies too** (the plan's ADVISORY question, answered yes). A reply you
regret is the commoner case. `commentNode` grew one seam — `ctx.extraActions` —
which the memory tier does not pass, so its rows are untouched.

**The invariant widened deliberately, and got stronger where it could.** Two
`deleteRecord` calls now (unlike, delete-own-post), and the Pass 2 finding was
real: the old check used `src.indexOf('deleteRecord')` and would have silently
inspected only the first. It now asserts **per occurrence**, and adds the
assertion that actually matters — *every* write in the lens addresses
`session.did` and nothing else, checked by scanning every `repo:` argument.

**Two things the execution taught:**

- A reply to your *own* post cannot exercise reply-delete at all: 3i hoists an
  unbroken same-author chain into the post **body**, so it never becomes a
  comment. The journey fixture had to put the owned reply in someone else's
  thread. Worth remembering — "my post with my reply" is not a reachable shape
  in this UI.
- The first journey assertion raced the 3w reply's refetch: waiting on the
  reply's *text* could match the render being replaced. Waiting on the delete
  control itself is deterministic. Same class as the phase-1/3x flake — in this
  view, wait on the thing you are about to act on, never on text near it.

**Done-when, met:** signed in, a post or reply you wrote can be deleted from
inside Forage, the thread says so rather than silently navigating, and no
control appears on anyone else's post. 329 unit / 88 conformance / 5 journeys
green, journeys run 3× consecutively.

### Phase 3 executed — 2026-08-26 — ✅ images

**3.0 discovery probed the real PDS instead of trusting the lexicon's prose,
and it was worth doing — five findings, three of which changed the build:**

| # | Probe | Result |
|---|---|---|
| A | `uploadBlob` a small PNG | 200 → `{$type:'blob', ref:{$link}, mimeType:'image/png', size:268}` |
| B | Same bytes, `Content-Type: application/octet-stream` | 200, and the blob came back **`mimeType: image/png`** — the PDS **sniffs**, so an accurate header is not load-bearing (we send the real type anyway; lying gains nothing) |
| C | A 2,100,928-byte PNG | **`uploadBlob` returned 200.** The refusal came later, from `createRecord`: `blob too big (maximum 2000000, got 2100928) at $.record.embed.images[0].image` |
| D | A post with an image and **empty text** | **Accepted.** So "empty is not a post" had to relax when an image carries it |
| E | An image with `alt` **omitted** | **Refused:** `Missing required key "alt" at $.record.embed.images[0]` |

**Finding C is the one that mattered most.** The plan already guessed a
client-side size check was worth having; the probe proved it is the *only*
thing standing between a person and an upload that succeeds and then fails.
Without it you pick a large photo, watch it upload, and only then learn it was
never going to post. The gate now lives before the upload, and
`test/invariants.test.js` asserts it stays there.

**Finding E turned a design preference into a requirement.** The plan argued
alt text should be required on accessibility grounds; the server settles it —
a missing alt is refused outright. And a *blank* alt would be accepted, which
is an inaccessible post wearing the shape of an accessible one, so blank is
refused here too. Post stays disabled, with a stated reason, until every
attached image is described.

**Live-proved, same standard as phase 1.** A real image post written through
the composer on the local preview against the real PDS:

```
CREATED   200  at://did:plc:xyfhc…/app.bsky.feed.post/3mtz5gvdu772c
               validationStatus "valid"
STORED    text  'An image, written from Forage. Ignore me. #forage-smoke-20260826'
          langs ['en']                       ← the phase-1 fix, working live
          embed app.bsky.embed.images, 1 image
          alt   'a small blue and white test square'
          blob  {$link: bafkreih7bc7ayuo6hhkn7jfrrvulkmonao3zk2rkt4ocvgjweiwoac4nam,
                 mimeType: image/png, size: 96}
APPVIEW   app.bsky.embed.images#view — thumb ✓ fullsize ✓ alt survived ✓
```

The appview generated its own CDN renditions, which is the independent
confirmation that it is a real image post and not merely a record that parses.

**One gap the proof exposed, fixed before landing.** The appview returned
`aspectRatio: null`, because we sent none — and clients use it to reserve space
before an image loads, so without it a viewer's feed jumps as each picture
arrives. We already load the file to preview it, so the dimensions were free.
Now sent, validated as integers ≥ 1 per the lexicon, and dropped entirely
rather than guessed when what we have is not a usable ratio.

**Harness change:** `e2e/harness/shim.mjs` is shared by all five journeys and
had to learn about binary bodies — `String(aBlob)` is `"[object Blob]"`, which
is useless and quietly misleading. A binary body is now recorded as its type
and size, and `body` stays a string only when it genuinely is one. All five
journeys run green, three times consecutively.

**Two ordering bugs of my own, both the same shape.** The image block
referenced `strip`/`filePicker` from inside the `card` literal that was
declared above them — a TDZ ReferenceError that killed the composer silently.
Identical to the `openReply` mistake in 3w. In this file, a helper used by an
`el(...)` literal must be declared *above* it; the pattern is worth watching
for.

**Done-when, met:** up to four images with alt text, posted and rendered by an
appview we did not write; blocked with a stated reason when alt is missing, a
file is too large, or a fifth image is attached. 340 unit / 88 conformance / 5
journeys green. Test account cleaned: 0 posts remaining. `sw.js` at
`forage-v26`.
