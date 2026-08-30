# Changelog — Forage

What changed for a reader of `forage.fyi`. Forage deploys from `main` (Pages), so landing
*is* releasing: there is no unreleased window, and sections are months, each entry dated
by its landing. Per `CroftC/.claude/CHANGELOGS.md`, the branch that changes something a
reader runs adds its entry here before it lands. Started 2026-08-29; the August entries
below are the landings of that month, and everything earlier is in `git log`.

## 2026-08

- 2026-08-29 The sign-in sheet's front page is the servers you can join from here — Bluesky,
  Blacksky and, new, EuroSky (`eurosky.social`, open signups). Invite-only servers
  (Northsky) moved behind **Another provider**, next to the handle field, still with Sign
  in. The sheet asks you to choose your *atmo* provider, and glosses the word.
- 2026-08-29 Records are validated against their lexicon on read-back, because a real PDS
  accepts a `fyi.forage.tagsub` record missing every required field with a 200 — a lexicon
  binds the app that wrote it and nobody else (W17).
- 2026-08-29 A hashtag subscription can be private or public, chosen per tag (P5).
- 2026-08-28 Ring boards separate Posts · Replies · Reposts, and a reply links its parent.
- 2026-08-28 The literal `[image]` placeholder is never printed where the media can show.
- 2026-08-28 The ring ladder is a left nav, and `/` follows a landing rule.
- 2026-08-27 Counts read as English; auto-collapse is retired and the score is what it is —
  likes; downvotes are gone from both populations (DL-011 retired).
- 2026-08-27 The skin picker is family-shaped — one identity per row, light and dark as
  entries, the ☾/☀ control visibly disabled where a family has one palette.
- 2026-08-27 The signed-out front door — sheet, hero, an emblem sized for a phone — and the
  guest surface hides what a reader cannot use.
- 2026-08 Hashtag discovery in four phases: trending (derived from the trending feeds,
  cached hourly), each hashtag section on its own page, a bounded word cloud, and
  hashtags become joinable — local today, `fyi.forage.tagsub` tomorrow.
