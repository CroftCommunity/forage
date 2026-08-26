# ADR-003: Skins subsume themes — one skin carries one palette

Tags: skins, theming, accessibility

Date: 2026-08-26
Status: accepted
Gates: phases 1A–1G of `plans/2026-08-26-1-plan-skin-chrome-and-phpbb-import.md`

## Context

Forage carried **two independent axes**. A *theme* (`auto`/`light`/`dark`, stored
as `forage.theme`, applied as a `data-theme` attribute) and a *skin* (a
token-sheet swap, stored as `forage.skin`, applied as a managed `<link>`). Every
skin therefore had to ship both palettes, and `css/tokens.css` hand-synced the
same values across three blocks: `:root`, `:root[data-theme="dark"]`, and a
duplicated `@media (prefers-color-scheme: dark)` block.

The trigger was building a phpBB skin and an importer for real phpBB styles.
Phase 0 of that plan measured four styles (prosilver, subsilver2, we_universal,
freecad-dark) and surfaced the mismatch: **a phpBB style has exactly one
palette.** FreeCAD ships `freecad` and `freecad-dark` as two separate *styles*;
SCS ships a dark subsilver2 the same way. Nothing in that ecosystem models a
theme with two modes.

Under two axes, importing a single-palette theme meant mechanically deriving a
dark variant and defending it with a contrast gate. Phase 0 showed how badly
that can go: resolving roles independently across a theme's layers produced a
foreground/background pair that co-occurs nowhere in the real theme, measuring
1.19:1 against its true 16.17:1.

## Decision

**A skin carries exactly one palette.** Light and dark stop being an axis and
become ordinary registry entries. A skin may declare a **sibling** — its
opposite-palette twin — and the upper-right toggle swaps to that sibling.

- `forage-light` (the `default` entry, `file: null`) and `forage-dark` are skins.
- `phpbb` ↔ `phpbb-dark` are siblings, as are any future pairs.
- The toggle is **visibly disabled** on a skin with no sibling.
- The OS preference resolves *through the registry*: the dark default is
  whatever `default` is paired with.
- One preference key, `forage.skin`. `forage.theme` and `js/theme.js` retire
  with no migration shim (pre-1.0).

## Consequences

**Good.**

- Models the domain. Forum themes ship as light/dark *pairs of styles*; the
  registry now says so directly.
- Removes a failure mode instead of gating it: an imported theme maps 1:1 to a
  skin and no dark variant is ever synthesised. The AA gate survives and still
  grades each palette on its own terms — it is what caught the defect above.
- Removes a standing drift hazard: three hand-synced palette blocks become one.
  `css/tokens.css` went 147 → 86 lines.

**Costs, accepted knowingly.**

- **`color-scheme` had to become a token.** It is a real CSS property, so
  `skinScan` rejects it — no skin could set it, and every dark skin would have
  rendered with light scrollbars and light form controls. Now `--color-scheme`,
  consumed by `css/app.css`.
- **The boot path got harder.** Setting an attribute is synchronous; loading a
  `<link>` is not. The inline `<head>` script in `index.html` and `404.html` now
  injects the sheet before first paint. `default` keeps `file: null` so the
  common case loads no sheet and cannot flash.
- **OS dark no longer follows a user into every skin.** Choosing a light-only
  skin on a dark-preferring machine gives light. This is a real accessibility
  consequence. It is why pairing exists, and why the toggle is *visibly*
  disabled rather than silently inert — the limitation is legible instead of
  mysterious.

## Alternatives rejected

- **Keep both axes.** Retains the contrast gate over synthesised palettes and
  the three-way sync. Every imported theme still needs a dark variant invented
  for it.
- **Toggle returns to Forage light/dark from any skin.** Simplest, and the
  toggle always does something — but it silently discards a deliberate user
  choice from a control that looks non-destructive.
- **Hide the toggle whenever a skin is active.** Honest, but removes the
  quick-change affordance that motivated keeping the control at all.

## Supersedes

Phase 4a of `plans/2026-08-25-1-plan-backend-modes-bsky-writes.md`, which
specified skins "composing WITH light/dark where the skin permits". Skins and
**modes** remain independent axes, unchanged — that decision stands.
