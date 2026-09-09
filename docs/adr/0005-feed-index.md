# ADR-005: The feed index — a CI-built graph committed to `main`, the forager's to replace

Tags: appview, discovery, ci, index, jumpstarts

Date: 2026-09-08
Status: accepted
Beside: ADR-004 (the same pack↔feed signal, offline); amends nothing in ADR-002 (no new data plane)
Gates: `plans/2026-09-08-plan-feed-index-and-jumpstarts.md`

## Context

`/feeds` showed what one AppView call lists as popular: 117 feeds. The network has at
least 56,128 a guest can search for, and the AppView's own search misses popular ones —
19 of the 117 never came back for any of 324 queries. Starter packs are a second surface
of the same shape: 144,908 exist, 30% name feeds, and 1,873 of the feeds they name are
ones search cannot find at all. Nothing in the protocol says what a feed is about or in
what language; only a person can.

The owner's constraints (2026-09-01 → 2026-09-08): find more, cache it in the PWA, make
search better — with **no server-side component for forage at runtime**, nothing merged
by hand every week, and the whole thing **user-manageable**, so a forager can dump ours
and use their own: "that's the only way this stays equitable … and independence from a
central authority."

## Decision

1. **Discovery starts from a file.** `data/feed-index.json` names feeds and jumpstarts,
   what they are about (topic, language, community tags), and which jumpstart names which
   feed. It carries **no counts** — a band is the rank hint — because counts churn the one
   diff a weekly job produces and are free at read time.
2. **The file is built by forage's own CI and committed to `main`** by the workflow
   (`.github/workflows/feed-index.yml`), weekly, `contents: write` on that job alone. Pages
   serves it like any other file; the service worker caches it with the shell. It is the
   workspace's first CI commit to a `main`; `COORDINATION.md` names what it touches and
   that a session conflicting with it regenerates rather than hand-merges.
3. **A guard stands between the harvest and the write.** A run materially smaller than
   the committed file (under 80%) or under an absolute floor (500 feeds, 300 jumpstarts)
   exits 2 with nothing written — a green run that graded an empty set is the failure
   this exists for. The first real run refused for exactly this reason (a laptop slept
   mid-walk); the file test in the gate is the second half.
4. **One validator, both sides.** The harvest validates before it writes; the app
   validates on the way in and refuses a malformed file with the row and the reason,
   falling back to the live browse corpus — never garbage, never an empty page.
5. **The index is the forager's to replace** (Advanced → Discovery index): add theirs
   over ours, replace ours, or off. Their file goes through the same validator. Every row
   on a browse surface says whose it is. The harvest takes any providers file, so a
   community can build and hand around its own. Device-local now; a PDS record that
   follows the reader is the named follow-up.
6. **A label in the file is a hint, never the authority.** 0.5% of feeds carry any label
   on the network; the account's posture (or the guest floor) decides, and re-applies on
   the live view.

## Reasoning

**A file is not a middleman.** It answers no query and sees no user; forage's AppView
calls stay as direct as before. The line between what the file says (identity, topic,
language, edges, a band) and what only a live call can (content, counts, liveness) is the
whole design.

**Why `main` and not a second repo or a `gh-pages` deploy job.** Same-origin dissolves a
cross-origin fetch, a service-worker exception, a separate fallback file, and a second
dependency under SUPPLY-CHAIN. The alternatives were weighed in the plan and set aside:
a second repo (the first draft — retired when the owner corrected the premise), a deploy
job (the croft-pwa pattern; forage deliberately has none and Pages serves `main`), a
weekly PR (the ritual the owner declined).

**Why the bands.** Identical sweeps 15 minutes apart returned identical corpora but one
count had moved; on a weekly cadence most rows would move. The diff must read as
membership.

**Why user-manageable is cheap here.** The index is a file with a versioned shape and one
validator; "your own" is the same file from a different source. The cost was a settings
surface and a storage decision, and the storage decision had a precedent (mixes:
device-local first, PDS next).

## Consequences

- `/feeds` is the popular list ∪ the index; `/jumpstarts` and `/j/<handle>/<rkey>` exist;
  the right rail is panel-choosable with Popular jumpstarts first.
- A weekly bot commit lands on `main`; the regular gate runs on it.
- The one unmeasured risk — rate limiting from GitHub's shared runner IPs — is caught by
  the guard, not prevented; the first scheduled run is the datapoint.
- "Follow all" on a jumpstart is not built; the jumpstart page links out (`TODO.md`).
