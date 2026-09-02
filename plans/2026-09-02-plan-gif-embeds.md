# Plan: a GIF should play like a GIF — and the reader decides whether it starts on its own

date: 2026-09-02
status: **Phases 0–5 planned, none started.**
repo: `CroftCommunity/forage`
baseline: `main` @ `05101a9` (the refresh check on return to a board, #51)
related: `TODO.md` "GIF search on the reply box (feed-row O9)" — the COMPOSE half, still
unprobed and deliberately untouched here; this plan is the READ half. `js/haptics.js` is the
precedent for a switch that a device setting can override.

## Problem Statement

The owner, on `forage.fyi`, 2026-09-02, looking at a reply that carries a GIF
([the post](https://bsky.app/profile/msjulesb.bsky.social/post/3mukhabf2lc2c)):

> "the gif shuld show a play/pause overlay and there should be a setting in use rproifle to
> play gifs by default or not"
>
> "not just tha tpost, but that TYPE of post"

and, a moment later:

> "additionally we should have an advanced setting checkbox to show or hide alt txt with hide
> as default"

Three things, one surface. Today forage renders that post as a **still link card**: a frozen
JPEG thumbnail, the GIF's title, an `ALT:` line repeating the title, and `static.klipy.com`.
Nothing moves and nothing can be made to move.

### Why it is still, and why that is a shaping problem rather than a styling one

The record is an ordinary external embed:

```json
"embed": { "$type": "app.bsky.embed.external#view",
  "external": {
    "uri": "https://static.klipy.com/ii/4e7bea.../RiZHW3kybKsT6j.gif?hh=415&ww=498&mp4=8pcPaPB1Eow6fc&webm=0Ds0ULMJw0vWjEZ6NMLN",
    "title": "Warrior Nun Ava Running Through Water",
    "description": "ALT: Warrior Nun Ava Running Through Water",
    "thumb": "https://cdn.bsky.app/img/feed_thumbnail/plain/.../bafkrei....jpeg" } }
```

`mediaOf` (`js/substrates/lens.js:230`) matches `external#view`, and `externalCard`
(`js/ui/lens-views.js:540`) draws the still `thumb` on a stage with a link out. There is no
GIF *kind* in the lens, so there is nothing for a player to hang off. **A GIF is arriving
dressed as a link card, and forage believes the costume.**

Three facts about that uri, all measured 2026-09-02, that decide the whole design:

| | bytes | content-type | CORS |
|---|---|---|---|
| the `.gif` itself | **8,773,093** | `image/gif` | `access-control-allow-origin: *` |
| `…/8pcPaPB1Eow6fc.mp4` (the `mp4=` slug) | **1,458,814** | `video/mp4` | `*` |
| `…/0Ds0ULMJw0vWjEZ6NMLN.webm` (the `webm=` slug) | **953,992** | `video/webm` | `*` |

The query string is not decoration: `hh`/`ww` are the true dimensions (415×498) and
`mp4=`/`webm=` are filename slugs for the same animation as video. Playing the `.gif` costs
**9.2× the webm**. Both video URLs are served by `static.klipy.com` itself — the host already
in the record — so nothing new is trusted to get them.

### The `ALT:` line is not a description

The second line on that card is the record's `description`, and Bluesky's composer writes
alt text into that field behind a prefix (`social-app/src/lib/gif-alt-text.ts`, read
2026-09-02):

```
"Alt: <text>"   the author WROTE alt text        -> isPreferred: true
"ALT: <text>"   auto-filled from the GIF's title -> isPreferred: false
```

This post carries the **all-caps** form, so the line is not a description anyone wrote — it
is the title again, and the card shows the same eight words twice. That is why the owner's
default is *hide*: the common case is duplication. It also fixes the rule's edge — a news
link's `og:description` is genuine page content and must be **unaffected**, so the setting is
governed by the prefix, not by the field.

### What "that TYPE of post" is

Not klipy, and not this uri. Any external embed that is really an animation:

- **klipy** (`static.klipy.com/ii/…` with `hh`,`ww` and an `mp4`/`webm` slug) — what
  Bluesky's own GIF button produces today, and the only shape whose video URLs are verified
  from here.
- **anything else whose uri is a `.gif`** — tenor, giphy, a direct link. Handled with the
  record's own uri and nothing constructed.

Tenor has a cheaper video form too (`social-app` rewrites `AAAAC`→`AAAP1`/`AAAP3` and serves
it from `t.gifs.bsky.app`), but that rewrite could not be exercised from here against a real
tenor record. Per CLAUDE.md § External APIs it is **not** written on inference — it is
recorded as follow-on work needing a probe, and tenor plays as an image in the meantime.

## Approach

One new media kind, one player, two settings, and no new host.

```
   app.bsky.embed.external#view
              │
              ▼
      js/gif.js  gifOf(uri)          ← pure; no network, no DOM
        │              │
   klipy: video    .gif: image        ┌───────────────────────────────┐
   sources from    the record's       │ null → stays an external card │
   static.klipy    own uri            └───────────────────────────────┘
        └──────┬───────┘
               ▼
   mediaOf → { kind:'gif', sources|src, thumb, aspect, alt, altIsAuthored, … }
               │                    (ONE door: quoted posts inherit it free)
               ▼
   mediaNode → gifCard → gifStage()  ← <video muted loop playsinline> or <img>
               │                        + a full-surface play/pause button
               ▼
      js/gif-autoplay.js   js/alt-text.js
      choice > device       choice > hide
```

**Phase 0 — the parser (`js/gif.js`, pure).** `gifOf(uri)` returns `{ kind:'video',
sources:[{src,type}], aspect }` for klipy, `{ kind:'image', src, aspect:null }` for a `.gif`,
`null` otherwise. Plus `parseAlt(description)` implementing the prefix rule above. Unit-tested
alone, no DOM.

**Phase 1 — the shape (`mediaOf`).** A `gif` branch **before** the external branch, carrying
the card's words plus the player's sources. Because `mediaOf` is the one door every surface
comes through (`lens.js:212`), a quoted GIF, a reply GIF and a feed GIF are the same work.

**Phase 2 — the player (`js/ui/stage.js` + `gifCard`).** A stage whose foreground is a
`<video muted loop playsinline preload="metadata" poster=thumb>` (klipy) or an `<img>`
(everything else), under a full-surface `<button>` that toggles play/pause and renames itself
("Play GIF" / "Pause GIF"). Paused shows the ▶ glyph and a scrim; a `GIF` badge marks the
kind, as bsky.app does. The card keeps its title and host — the owner asked for a player, not
for the card's identity to be removed.

**Phase 3 — autoplay (`js/gif-autoplay.js`).** DESIGN.md § Foundations: *defaults come from
the device; choices come from the person.* Stored `on`/`off` wins **including an explicit
`on`**, never a removed key; absent falls back to `prefers-reduced-motion: reduce` → off, else
on. A switch in `settingsView()`, so it is on `/me` and `/settings` both.

**Phase 4 — alt text (`js/alt-text.js`).** Default **hidden**, no device input — this is a
preference, not an accommodation. A checkbox in the **Advanced** disclosure on `/me`
(`lensProfileView`), beside Browse Hashtags. When on: the GIF card shows its alt line and a
picture shows a visible `alt` caption. When off (default): neither, and `<img alt>` is
untouched either way — hiding the visible caption must never take alt away from a screen
reader.

**Phase 5 — the record.** Mock `plans/mocks/gif-embeds.html` captured from this branch by
`scripts/mock-snaps.mjs`, a `CHANGELOG.md` entry under `## 2026-09`, the tenor probe filed in
`TODO.md`, and the gate green.

## Reasoning

**D1 — a new `kind`, not a flag on `external`.** A GIF has sources, a loop, a play state and
an aspect ratio the card never had. Threading those through `externalCard` would mean every
external card carrying five fields it cannot use, and the YouTube branch there is already the
warning: `externalCard` has one `yt` special case and adding a second is how a function
becomes a switchboard. A `kind` also gives the render matrix a row and the CSS a `data-stage`.

**D2 — video for klipy, image for the rest; never a constructed video URL.** The measured
9.2× is the reason to prefer video where the record hands us the slugs, and the External APIs
rule is the reason not to invent them where it does not. An unverified tenor rewrite that
404s would be a *silently broken player*, which is worse than a working image.

**D3 — `static.klipy.com`, not `k.gifs.bsky.app`.** social-app proxies klipy through its own
CDN; both hosts answer with identical bytes and open CORS (measured). Forage takes the origin
host because it is already the one in the record: no new third party at read time, nothing to
add to a CSP later, and no dependency on Bluesky operating a cache for us.

**D4 — muted, looping, `playsinline`.** A GIF has no audio, and autoplay is only permitted
unmuted after a gesture; `playsinline` stops iOS Safari taking the clip fullscreen. This is
what makes a `<video>` behave like the GIF it replaced rather than like a video post — and
forage's video embed stays exactly as it is, with its controls and its press.

**D5 — the autoplay default is the device's, the alt default is the owner's.** These look
alike and are not. Autoplay is a **motion** question, and `prefers-reduced-motion` is a person
already having answered it system-wide — `js/haptics.js:27` honours the same signal, so this
is forage's existing rule applied to a second surface. Alt visibility is a **layout taste**
with no device signal; the owner said hide, so it is hidden, and no media query gets a vote.

**D6 — an explicit "on" is stored as a value.** DESIGN.md's most-missed rule: a choice
recorded by *removing* a key reads as *never chose* and undoes itself on the next reload under
a device default. A reader with reduced motion on who deliberately turns GIF autoplay **on**
must keep it, so `on` is written, never inferred from absence.

**D7 — hiding the alt caption never touches `<img alt>`.** The setting governs a *visible*
caption. The accessible name is not a preference, and a gate that let a display toggle strip
alt from the accessibility tree would turn a reading choice into an accessibility regression.
`test/a11y-names.test.js` is the check that keeps this honest.

**D8 — the card keeps its title and host.** bsky.app hides them (`hideDetails: true`) and
shows the GIF alone. Forage does not, because the owner asked for a play/pause overlay and a
setting — not for the card to lose its name. With alt hidden by default the duplication that
prompted the report is already gone, which was the actual complaint. If the words should go
too, that is a decision on the mock, not an assumption in this plan.
