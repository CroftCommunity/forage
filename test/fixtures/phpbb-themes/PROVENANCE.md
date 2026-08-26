# Vendored phpBB theme fixtures

Inputs for the phpBB style importer's tests (`test/import-phpbb.test.js`). They
are committed so the suite reads them **offline** — the importer's tests must
never reach the network, and Phase 0's corpus lived only in a scratchpad.

## What is here, and why only these two

Phase 0 measured **four** styles. Only these two are vendored, per the owner's
OQ1 decision (2026-08-26): **ship in-repo only our own or GPL-compatible work;
the importer is a local tool users run on themes they have licensed.**

| Theme | Source | Ref | Licence | Retrieved |
|---|---|---|---|---|
| prosilver | [phpbb/phpbb](https://github.com/phpbb/phpbb) `phpBB/styles/prosilver/theme/` | `74a864a9f6288edc4d0abb3c6c1e1471fef12d8f` (master) | GPL-2.0 | 2026-08-26 |
| subsilver2 | [phpbb/phpbb](https://github.com/phpbb/phpbb) `phpBB/styles/subsilver2/theme/` | `0d349a82ca646cc2eebbfaf9a573ab1c8e32b6f6` (3.0.x) | GPL-2.0 | 2026-08-26 |

Files:

- `prosilver/colours.css` — the isolated colour layer (import #12 of 14 in
  prosilver's `stylesheet.css`). 1224 lines, plain CSS, no custom properties.
- `prosilver/common.css` — carries the font stack, which `colours.css` does not.
- `subsilver2/stylesheet.css` — subsilver2 has **no** `colours.css`; the whole
  theme is one file. That is precisely why it is here (Finding 0.1: resolve by
  selector across all theme CSS, never by filename).

Verified byte-identical to the pinned refs at vendoring time.

## Deliberately NOT vendored

`we_universal` (inventea) and `freecad-dark` (FreeCAD-Homepage) were measured in
Phase 0 and are **not** here: their licences are not GPL-compatible or not
stated. What they taught is written down instead, because it shaped the design:

- **we_universal** — a modern responsive 3.2 style with no `colours.css` at all;
  colour is inlined across `common/content/cp/forms.css`. It also sets
  `#wrap { background: none; border: 0 }`, i.e. it genuinely has no content
  surface — which is why `surface` and `border` are FALLBACK roles rather than
  extraction failures.
- **freecad-dark** — authored in SCSS, shipped compiled, with a site-wide layer
  above the forum layer. Resolving roles independently across those layers
  paired a foreground and a background that never co-occur (1.19:1, against the
  theme's true 16.17:1). That is the origin of the same-origin coherence rule.

## Refreshing these

Re-fetch from the pinned refs and diff. They are fixtures: if upstream changes,
the importer's expectations get re-examined deliberately, never auto-updated.

```
curl -sL https://raw.githubusercontent.com/phpbb/phpbb/74a864a9f6288edc4d0abb3c6c1e1471fef12d8f/phpBB/styles/prosilver/theme/colours.css
curl -sL https://raw.githubusercontent.com/phpbb/phpbb/74a864a9f6288edc4d0abb3c6c1e1471fef12d8f/phpBB/styles/prosilver/theme/common.css
curl -sL https://raw.githubusercontent.com/phpbb/phpbb/0d349a82ca646cc2eebbfaf9a573ab1c8e32b6f6/phpBB/styles/subsilver2/theme/stylesheet.css
```
