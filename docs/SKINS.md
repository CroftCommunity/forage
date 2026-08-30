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
         palette: 'light', family: 'phpbb' },
```

- `palette` — `'light'` or `'dark'`. Required.
- `family` — the visual identity this skin is one side of, registered in
  `FAMILIES`. The sibling is **derived** (the opposite-palette member of the
  same family) and never declared; a family with one member is legal and is
  what disables the toggle.

`validateFamilies()` refuses a skin in an unregistered family, a family with no
members or with two of the same palette, and a family label that names a
palette — each naming the offending ids — and the suite runs it over the real
registry. Bad family data is otherwise silent breakage: a toggle that lands
nowhere, or bounces between two skins of the same tone.

Shipping families, 2026-08-30: Forage, Classic BBS (dark only), Usenet gray,
phpBB, the warm set — Rosewater, Lavender, Apricot, Seaglass — and Cornflower,
each of the last five with both sides (`plans/2026-08-30-plan-warm-skins.md`).
The warm set is **inspired by** the classic era's colour variants, not imported:
no value in those eight files was measured from a real style, and their headers
say so. Cornflower is the phpBB blue (prosilver's measured band and navbar) on
the warm set's grammar; the phpBB family itself is the classic board and stays
as it is.

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

## Art slots

A skin could move colours, fonts and radii and nothing else; a picture had no
token to ride on. Four slots (2026-08-30, plan `2026-08-30-plan-warm-skins`
§ Graphical skins), each a `<bg-image>` **layer list** that `css/app.css`
paints OVER the solid token it belongs to, so `none` renders byte-identically:

| Slot | Painted on | As | For |
|---|---|---|---|
| `--page-art` | `body` | `background: var(--page-art), var(--bg)` | a texture or gradient behind the cards |
| `--band-art` | `.masthead` | `background: var(--band-art), var(--band-fill)` | the banner — where a picture goes |
| `--card-art` | `.card` | `background: var(--card-art), var(--card)` | a faint grain at most |
| `--accent-glow` | wordmark, active nav | `text-shadow` | the neon a space skin is made of |

**Text never sits on a picture.** That is the rule, and `test/skins.test.js`
holds four pieces of it: a skin that paints the page keeps `--card` opaque hex;
every colour stop in an art gradient is graded against the ink on it (band at
4.5 — the masthead's nav links are 14px normal weight; page and card at 4.5);
a `url()` is same-repo (`/skins/art/<family>/…`) or an inline `data:` URI,
never a third party (a skin that fetched off-site would be a tracker wearing
a palette); and Surf and Nebula actually fill the slots, so the slots are
exercised by a shipping skin.

A `url()` image cannot be graded by the test. Two shapes are allowed, by
convention: a **veiled banner** on the band — the skin composes a gradient
from `--band-fill` over the image so the region under the wordmark and nav
stays at ≥ 4.5 — and a **low-contrast texture** on the page or card, within
the ground's luminance band (a sand grain, a starfield). The per-skin axe
workflow (`e2e/a11y-skins.workflow.mjs`) is the backstop. Asset spec: band
1600×120 and 800×120 WebP, subject weighted right, ≤ 150 KB; page texture a
512×512 seamless tile. Art files are NOT in the service-worker shell — they
are picked up by the same-origin stale-while-revalidate path — so a large
banner cannot fail the install. Only assets we own or GPL-compatible ship.

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

Every pair is graded at 4.5, the band included. The gate first graded bands
at 3.0 (WCAG's large-text floor) because prosilver's own band measures 3.41
and 3.70 under white — and that was the miscalibration: forage's masthead
paints its nav links at 14px normal weight, body text to WCAG and to axe, and
CI's per-skin axe pass refused a hand-authored skin at exactly prosilver's
`#4688CE` (2026-08-30). So importing prosilver verbatim now exits non-zero on
the band, which is the finding `skins/phpbb.css` and `skins/cornflower.css`
each answered by hand with `#3A78BC`.

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
