# Plan: the warm set — five skin families with a lighter and a darker side

date: 2026-08-30
status: BUILT on `claude/warm-skins` (worktree `worktrees/warm-skins/forage`); landing via PR — the owner merges. Unit gate 646/646; skins workflow green; captures in `plans/mocks/warm-skins.html`.
repo: `CroftCommunity/forage`
baseline: `main` @ `fe2b77b`
parent: ADR-003 (`docs/adr/0003-skins-subsume-themes.md`) and plan `2026-08-26-1-plan-skin-chrome-and-phpbb-import.md`, which built the vocabulary this plan only fills.

## Problem Statement

The owner, 2026-08-30:

> "all of the skins for forage are pretty muted and darker colors, cn we get some more
> warm or feminine energy and maybe look at some old popular phpbb skins with some
> diversity to reimplement an inspired version from, each should have a lighter and a
> darker mode"

The registry bears that out. Four families ship: Forage (moss green on paper), Classic
BBS (amber on black, dark-only), Usenet gray (newsprint), phpBB (prosilver blue over
subsilver gray). Every one is cool or neutral; the one warm thing is the amber terminal,
and it has no light side. A reader who wants a forum that feels warm has nothing to pick.

Three constraints are fixed before this plan starts, and it changes none of them:

1. **A skin is a token-sheet swap** (docs/SKINS.md). It may only assign tokens
   `css/tokens.css` declares; `skinScan` refuses anything else. So a new family is
   eight-odd dozen declarations per side and nothing structural.
2. **One skin, one palette; the family is canonical** (ADR-003, `js/skins.js`). "Each
   should have a lighter and a darker mode" therefore means: each family registers two
   skins, and the ☾/☀ toggle is live on all of them. The dark side is **hand-authored**,
   never inverted — Phase 0 of the parent plan measured why (a synthesised palette
   produced a 1.19:1 pair against a true 16.17:1).
3. **The floor is AA, applied to the role.** Body text and links at 4.5, band text at
   3.0 — the same calibration the importer's gate uses, because grading a band at 4.5
   refuses prosilver's own shipping value.

## Approach

**Four families, eight skins, drawn from the classic era's colour variants under our
own names and values.** Inspiration, not import: no value below was measured from a
real style, and every file's header says so in those words, so that a reader who knows
`skins/phpbb.css` marks its MEASURED hexes does not assume the same here.

| Family | Light skin | Dark skin | Lineage it is inspired by |
|---|---|---|---|
| Rosewater | blush paper, raspberry links, rose band, Georgia display | plum ground, rose-pink links | the pink prosilver recolours (ColorizeIt and its long tail) |
| Lavender | lilac paper, aubergine ink, violet band, Trebuchet | violet-black ground, lilac links | the purple recolours; the night-sky subsilver2 styles (Milky Way) |
| Apricot | cream, terracotta band, rust links, Georgia display | cocoa ground, apricot links, burnt-orange band | the coffee styles (Latte) and subsilver2's orange hover made primary |
| Seaglass | sea-foam paper, teal band, coral hover, 10px corners | deep teal ground, seaglass links, coral hover | the white-and-mint prosilver descendants (Artodia Air, Aero) |
| Cornflower | sky-tinted paper, prosilver's measured band `#4688CE` and navbar `#C9DEE8`, white cards, 7px corners, Trebuchet headings | navy ground, sky links | prosilver itself — the phpBB blue on the warm set's grammar (added on review, see decision 7) |

All four keep the prosilver grammar the phpBB skin already proved the tokens can carry:
a filled masthead band (`--band-fill`), a pale tab strip (`--nav-fill`), white cards on a
tinted ground, striped rows, rounded corners, a soft card shadow. What varies is hue,
display face, and corner radius. Seaglass is cool on purpose — the ask was warmth *and*
diversity, and four warm skins is a mood, not a set.

**Ids follow the phpBB pair**: light is the bare family id (`rosewater`), dark is
`<family>-dark`. A test pins it, because the boot script and the SW shell derive hrefs
from the id.

**Two things beyond the eight files, both earned by the work:**

- **A role-level AA test over every skin.** `test/skins.test.js` graded body text on
  the ground for dark skins only; every other pair lived as a hand-typed table in the
  file header, which nothing recomputes. The new test grades 24 pairs on every
  registered skin (light too) at the threshold the role earns, skipping passthroughs.
  Its first run found `usenet-dark` inheriting the light `--danger` #9E2F26 onto its
  dark card at **1.93:1** — a real defect no header note and no fixture covered.
  Repaired in this landing with the values forage-dark uses for the role.
- **`--skin <id>` on `scripts/mock-snaps.mjs`.** MOCKS.md's rule is compare in ONE
  skin, the default one — because the skin is normally noise. Here the skin is the
  subject, so the capture script learns to dress the page (the same `forage.skin`
  init-script the skins workflow uses) and stamps the id into the file name and the
  manifest. `plans/mocks/warm-skins.html` shows every side of every family as a
  capture of the engine, and says which skin each frame is in.

## Reasoning

**Why inspired-by rather than imported.** The importer exists and works, but it maps a
real style's stylesheet — and the pink/purple/orange styles of that era were GPL
recolours of prosilver whose exact hexes are (a) unremarkable, (b) frequently below AA
(the era's saturated purple fails on every dark surface it was put on), and (c) a
licensing question per style (docs/SKINS.md § Licensing). What was worth taking is the
*grammar* and the *hue families*, and those are not copyrightable and not measured.
Naming the lineage in each header is the honest middle: it says where the idea came
from without claiming fidelity the values do not have.

**Why four and not two.** Two warm skins would answer "warm"; the ask also said
"diversity". Pink, violet, orange and mint are four distinct hue families that a
picker can tell apart at a glance and that do not collapse into each other on a phone.

**Why hand-author eight palettes instead of deriving four dark ones.** ADR-003's
decision, and its Phase 0 evidence, and the observed cost: the drafts here failed AA on
six pairs on the first grading, all in places a derivation would have produced and
shipped (a pale nav strip under a mid-saturation link; a hover fill that lightened
past what white text can sit on). A hand-authored palette is graded and adjusted; a
derived one is graded and shipped with a warning.

**Why the AA test is in scope.** The tag-chip test already established that the floor
applies to the role and that a computed pair nothing enumerates is a hole. Adding eight
skins with hand-typed tables would have added eight more places for a number to be
true when typed and false later. The test replaced the tables' authority, kept their
legibility (headers still carry them, marked as recomputed), and paid for itself on its
first run.

**Why `--skin` is a flag and not a second script.** One script, one manifest shape, one
`mergeManifest`. The flag is the only way the manifest can say which skin a frame is in,
and MOCKS.md's "the page says which skin" rule needs the manifest to know.

## Decisions (Review Log)

| # | Decision | Why |
|---|---|---|
| 1 | Family labels: Rosewater, Lavender, Apricot, Seaglass — no palette words, no parentheticals | `validateFamilies` refuses both; a family label reads for both sides |
| 2 | Skin labels carry the flavour: (blush)/(plum), (lilac)/(twilight), (cream)/(espresso), (foam)/(deep water) | the phpBB pair's shape — per-side flavour lives on the skin |
| 3 | No `prefersDensity` on any of the four | none of the lineages was a dense board; the reader's dial stands |
| 4 | Seaglass is cool | diversity, stated in the ask; three warm + one mint reads as a set |
| 5 | `usenet-dark` gets `--danger*` in this landing | found by this plan's test; leaving a known 1.93:1 for a separate PR helps nobody |
| 6 | SW `CACHE` bumped v62 → v63 | ten new shell URLs; a clean re-cache on next load |
| 7 | Cornflower is a fifth family, and the phpBB pair is untouched | owner on review (2026-08-30): "I do like them all, but want to keep my phpbb forum ones as well and refine along these lines … the blue one I mean", then "if you want to keep it as a blue family and just have the blue family showcase the phpbb blue that's great". The phpBB skin is a recorded choice (OQ5: subSilver gray, squares, bevel) and it prefers compact rows; a blue family beside it costs one registry row and rewrites nothing |
| 8 | Mock decisions 1–5 locked as proposed | same review: "I do like them all" — names, Seaglass, the serif display, the two radii, Apricot's band all stand |

## Owed

- Device check: the eight skins on the Samsung at 390 wide, in daylight — `[device: android]`
  on the CHANGELOG line. Contrast is computed, not seen; the warm grounds may read
  differently on an AMOLED panel.
- `docs/SKINS.md` still described the retired `pairedWith` / `validatePairing`; corrected
  to `family` / `validateFamilies` in passing here (three lines, a drift fix, flagged in
  the PR).
