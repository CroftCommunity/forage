# Skins: the role vocabulary and the phpBB importer

Companion to [ADR-003](adr/0003-skins-subsume-themes.md). The README has the
short version; this is the reference.

## What a skin may do

A skin is a stylesheet that may **only assign custom properties declared in
`css/tokens.css`**. `js/skins.js` `skinScan()` rejects any component property or
undeclared token, and `test/skins.test.js` runs that scan over every registered
skin — including files the importer generates. The tool gets no exemption.

The restriction is deliberate and load-bearing. A skin that could ship component
CSS could write `.card { display: none }` and hide a moderation notice or a
gate. So: a skin restyles anything and restructures nothing.

One consequence, stated plainly because it sets expectations: **a skin cannot
change layout.** Row density is a registered frontier (`DL-028`), not a gap
waiting to be filled by accident.

## One skin, one palette

Light and dark are not an axis. They are skins. A skin declares:

```js
phpbb: { label: 'phpBB (classic board)', file: 'skins/phpbb.css',
         palette: 'light', pairedWith: 'phpbb-dark' },
```

- `palette` — `'light'` or `'dark'`. Required.
- `pairedWith` — the opposite-palette twin. Optional; **absence is legal** and
  is what disables the toggle.

`validatePairing()` refuses asymmetric, dangling, self-, and same-palette pairs,
each naming the offending ids, and the suite runs it over the real registry.
Bad pairing data is otherwise silent breakage: a toggle that lands nowhere, or
bounces between two skins of the same tone.

The file must be `skins/<id>.css`. The pre-paint boot script in `index.html` and
`404.html` derives the href from the id by that convention (it cannot import the
registry), and a test pins the convention so it cannot drift.

## The role vocabulary

Fifteen roles, named for what a **forum** has rather than for Forage's
components. The names come from the selectors real phpBB styles carry, which is
what makes importing a near-identity mapping instead of a translation with
judgement in it.

| Role | Forage token | prosilver | subsilver2 |
|---|---|---|---|
| `page-bg` | `--bg` | `body{background-color}` | `body{background-color}` |
| `page-ink` | `--text` | `body{color}` | `body{color}` |
| `surface` | `--card` | `.wrap{background-color}` | *(absent — HTML attrs)* |
| `border` | `--border` | `.wrap{border-color}` | *(absent)* |
| `link` | `--link` | `a{color}` | `a:link{color}` |
| `link-hover` | `--link-hover` | `a:hover{color}` | `a:hover{color}` |
| `band-fill` | `--band-fill` | `.headerbar`/`.forumbg` | `th{background-color}` |
| `band-ink` | `--band-ink` | `.headerbar{color}` | `th{color}` |
| `band-link` | `--band-link` | `.forumbg .header a` | `th a{color}` |
| `nav-fill` | `--nav-fill` | `.navbar{background-color}` | *(absent)* |
| `panel` | `--panel` | `.panel{background-color}` | `.row3` |
| `row-odd` | `--row-odd` | `.bg1` | `.row1` |
| `row-even` | `--row-even` | `.bg2` | `.row2` |
| `row-head` | `--row-head` | `.bg3` | `.row3` |
| `font-body` | `--font-body` | `body{font-family}` | `body{font-family}` |

Plus chrome that is not a role: `--card-shadow` (bevels — a value token, because
`skinScan` rejects `box-shadow` as a property), and
`--radius-sm` / `--radius-media` / `--radius-round` / `--radius-card` /
`--radius-chip`, so a skin can square the UI.

Every default is a **passthrough** to whatever the rule used before, so the
default skin renders exactly as it did and only a skin changes anything.

## The importer

```
npm run import-phpbb -- <style-dir-or-css> [--name id] [--out file]
                        [--licence L] [--allow-contrast-failures]
```

Accepts a style directory (reading `style.cfg`, or `composer.json` for 4.0-dev
styles) or a single stylesheet.

Three properties, each earned from measuring four real styles:

**It resolves by selector, never by filename.** Only prosilver actually has a
`colours.css`. subsilver2 is one monolithic file; `we_universal` inlines colour
across four; freecad authors in SCSS and ships compiled. Colour layers are read
last so they win the cascade, mirroring prosilver's own import order.

**A missing role is usually absent by design.** `we_universal` sets
`#wrap { background: none; border: 0 }` — it genuinely has no content surface.
So roles resolve through **declared fallback chains** (`surface → page-bg`,
`nav-fill → band-fill`, `border → row-head → mix(page-ink 15%, page-bg)`, …) and
every role reports how it was resolved: `direct`, `derived`, or `absent`. The
generated file lists that per role. Nothing is guessed silently.

**Paired roles resolve from one origin.** Reading `page-ink` and `page-bg`
independently can splice a foreground from one file onto a background from
another and report a contrast that exists in no real theme — measured at 1.19:1
for a theme whose true pair is 16.17:1. Coherent groups resolve from a single
winning rule, and any later declaration deliberately discarded is warned about.

### The contrast gate

Each pair is graded at the threshold appropriate to it: body text at 4.5, band
text and band links at 3.0 (they are large/bold UI). Grading bands at 4.5
refuses prosilver's own shipping values — that is a miscalibrated gate, not a
finding.

Exit codes are part of the contract: **non-zero** on an unresolved role or a
failed gate. `--allow-contrast-failures` emits anyway. A warning printed beside
exit 0 is the CLI shape of a silent fallback, and it gets scripted wrong.

The gate is not theatre. Importing subsilver2 refuses, because its authentic
`a:hover` `#D46400` is 3.74:1 on white. The hand-authored `skins/phpbb.css`
ships `#BB5800` (4.66:1) for exactly that reason — the tool and the human
reached the same finding independently.

## Licensing

Only our own or GPL-compatible skins ship in this repo. The importer is a
**local tool** you run on themes you have licensed. `prosilver` and `subsilver2`
are vendored as test fixtures under GPL-2.0 with recorded provenance; see
`test/fixtures/phpbb-themes/PROVENANCE.md`.

A skin derived from a theme's stylesheet is plausibly a derived work. Check
before redistributing — the generated header records the licence you passed, or
says `UNSTATED` when you passed none.
