# Plan: forum-chrome tokens, the phpBB skin, and a phpBB style importer

date: 2026-08-26
status: PHASE 0 COMPLETE (2026-08-26) — vocabulary ratified on measured evidence; OQ1/OQ4/OQ5 decided by owner. Phases 1–4 awaiting go.
Execution in `worktrees/forage/skin-chrome` (branch `claude/skin-chrome`)
repo: `CroftCommunity/forage`, local checkout `CroftC/forage`
baseline: `main` @ `f08fa9d` (rebased 2026-08-26 from `f6012bf`; main moved when
claude/modes-bbs landed 3p-3u, which touched `css/app.css` and `sw.js`)
parent plan: `plans/2026-08-25-1-plan-backend-modes-bsky-writes.md` — this plan is the
**expansion of that plan's Phase 4 (Skins)**, whose 4a (mechanism) and 4b (bbs +
usenet skins) both SHIPPED. Nothing here contradicts 4a; it widens the token
vocabulary 4a deliberately left narrow.
planning workflow: `phase-plan` skill. Single plan file.

## Problem Statement

The owner wants a **phpBB skin** for Forage, always available in the registry, built
from the classic phpBB look (subSilver's `#DEE3E7`/`#98AAB1`/`#006699` banding and
orange link-hover; prosilver's blue gradient masthead and category bars). Beyond the
one skin, the ask (2026-08-26, owner) is:

> "if we could somehow align our skinning to be compability or have a translation
> layer to reuse skins like this that woudl be swell" — referencing
> <https://designsmaz.com/best-responsive-phpbb-themes/>

So the deliverable is not one stylesheet. It is: **(a)** a skin vocabulary rich enough
to express real forum chrome, **(b)** the phpBB skin as its first proof, and **(c)** a
translation layer that turns a real phpBB style into a Forage skin.

Two hard constraints are already in place and are load-bearing, not incidental:

1. **A skin may only assign tokens declared in `css/tokens.css`.** `js/skins.js`
   `skinScan()` statically rejects any component property or undeclared token, and
   `test/skins.test.js` runs that scan over every registered skin. This is the
   mechanism's whole integrity story — skins cannot smuggle component rewrites.
2. **The current token set cannot express forum chrome.** It has no token for a
   masthead fill, a category band, row striping, a link-hover colour, or a bevel; and
   most radii in `css/app.css` are hardcoded (`4px` at lines 20/37/44/134/214,
   `8px`/`10px` at 59/61/62, `999px`/`50%` at 57/71/75/304 — re-verified against
   `f08fa9d`; the last two shifted from 198/282 when 3p-3u grew the file 282→304),
   so `--radius-card: 0` alone cannot square the UI. A phpBB skin written today would be a palette swap on
   Forage's shapes.

The gap is therefore in the **vocabulary**, not the mechanism.

## Reasoning

### Why extend tokens rather than relax the scan

The tempting shortcut is to let skins ship component CSS. That trades the one property
that makes skins safe — a skin can restyle but never restructure or hide behaviour —
for convenience. A skin that can write `.card { display: none }` can hide a moderation
notice or a gate. Keep the scan absolute; widen what it permits by *declaring more
tokens*. Every phase below keeps `skinScan()` red on component properties, and the
negative test in `test/skins.test.js` (which already proves the scan bites) stays.

### Why the token vocabulary should be phpBB's vocabulary

This is the plan's central design decision, and it is what makes the "translation
layer" honest rather than lossy.

prosilver's `theme/stylesheet.css` imports **`colours.css` as a discrete layer**
(import #12 of 14, after every structural file, before `responsive.css`/`bidi.css` —
verified against `phpbb/phpbb@master`). That isolation is deliberate: it is the file
derivative themes override. It is 1224 lines of plain CSS with **no custom properties**
(verified: 2 occurrences repo-wide, neither a design token).

Its colour-bearing selectors are a small, stable set — and they are simply *the
generic vocabulary of a forum*:

| prosilver `colours.css` | value | what it is |
|---|---|---|
| `html, body { background-color }` | `#f5f5f5` | page ground |
| `html, body { color }` | `#47536b` | body ink |
| `.wrap { background-color / border-color }` | `#ffffff` / `#ededed` | content surface + rule |
| `a { color }` | `#0f4d8a` | link |
| `a:hover { color }` | `#d41142` | link hover |
| `.headerbar, .forumbg { background-color }` | `#4688ce` | masthead + category band |
| `.headerbar { color }` | `#eaf8ff` | ink on band |
| `.forumbg .header a { color }` | `#ffffff` | link on band |
| `.navbar { background-color }` | `#c9dee8` | nav strip |
| `.panel { background-color / color }` | `#f0f3f5` / `#29303d` | panel surface |
| `.bg1` | `#edf4f7` | row, odd |
| `.bg2` | `#dbe9f0` | row, even |
| `.bg3` | `#c9dee8` | row header |
| `h3 { color }` | `#0059b3` | heading accent |

If Forage's new tokens are named for *these roles*, the importer is a near-identity
mapping instead of a translation with judgement in it. Choose the vocabulary any other
way and every imported theme needs a human to interpret it. **So: derive the token
names from this table.** The vocabulary is general (it is forum chrome, not phpBB
chrome) — it would serve a Discourse or a Lemmy import equally.

### What can and cannot be reused — the scope boundary, stated plainly

A phpBB style ships four things. Only one is portable:

| Part | Portable? | Why |
|---|---|---|
| colour-bearing CSS (wherever it lives) | **Yes** | Stable selectors, plain values. *Corrected by Phase 0 Finding 0.1: only 1 of 4 real themes actually has a `colours.css`; resolve by selector across all theme CSS, never by filename.* |
| `theme/*.css` (structural) | Partly | Fonts/radii/borders extractable; layout rules are phpBB-DOM-specific |
| `template/*.html` (Twig) | **No** | Forage's DOM is `.card`/`.postrow`/`.masthead`/`.comment`; a rule targeting `.forumbg .topiclist li.row` matches nothing here |
| `theme/images/` sprites | **No** | Different icon system |

Therefore an imported skin is faithful in **palette, typography, and chrome treatment
— never in layout.** Forage keeps its own DOM and its own responsive grid. This must
be written into the importer's own output header and the docs, because "reuse phpBB
themes" otherwise sets an expectation of a pixel-identical forum that we will not meet,
and a promise we quietly under-deliver is worse than a narrower promise kept
(invariant 11: behaviour wins over prose — so the prose must match what behaves).

A second honesty constraint: several themes on the owner's reference page are **not**
plain prosilver derivatives — Volare is described as Material UI, BBOOTS as
Bootstrap-based, Milk as "unlimited colors" (likely a generator, not a static
`colours.css`). The importer must therefore **report what it could not map rather than
guess a value**, per the workspace "fail loud, fail early — no silent fallbacks" rule.
A skin emitted with silent holes is exactly the "green-model" failure the workspace
enforcement dimension warns about.

### Why hand-author the phpBB skin *before* building the importer

Phase 2 hand-writes `skins/phpbb.css`; Phase 3 builds the importer and then
**regenerates that same skin and diffs it against the hand-authored file.** The
hand-authored skin is the importer's test oracle. This ordering also fails fast: if the
vocabulary from Phase 1 cannot express the classic look by hand, no importer will
rescue it, and we learn that before writing a line of the tool.

### Skins subsume themes (owner redirect, 2026-08-26)

Light/dark and skins collapse into ONE concept: a skin carries exactly one palette.
`forage-light` and `forage-dark` become ordinary registry entries; the upper-right
toggle stays, but as a shortcut that swaps to the current skin's declared **sibling**
(`phpbb` ↔ `phpbb-dark`), and is *visibly disabled* on a skin that ships only one.

Why this is right, not merely simpler:

- **It matches the domain.** A phpBB style has exactly one palette. FreeCAD ships
  `freecad` and `freecad-dark` as two separate *styles* — measured in Phase 0, not
  assumed. Modelling a skin as one palette is modelling what forum themes actually are.
- **It deletes the importer's hardest problem instead of gating it.** Under two axes,
  one skin had to serve two palettes, so an imported single-palette theme needed a
  mechanically derived dark variant defended by a contrast gate (OQ4). One-skin-
  one-palette makes the mapping 1:1 and removes that failure mode entirely. The AA gate
  survives — it still grades each palette on its own terms.
- **It removes a drift hazard rather than testing it.** `tokens.css` hand-syncs the
  same palette across three blocks (`:root`, `[data-theme="dark"]`, and a duplicated
  `prefers-color-scheme` block). Deleting the duplication beats asserting it stays
  in sync.

Costs, accepted with eyes open:

- **`color-scheme` must become skinnable.** It is a real CSS property, so `skinScan()`
  rejects it today — no skin can control native scrollbars or form controls. Phase 1B
  adds a `--color-scheme` token. Without this, dark skins get light scrollbars.
- **Flash risk.** The inline head script (`index.html:25`, `404.html:25`) sets an
  attribute synchronously today; a skin is a `<link>`, which is not synchronous.
  Phase 1C injects the link pre-paint and keeps the default palette inline so the
  common case loads flash-free.
- **OS-dark no longer follows you into every skin.** A user on OS-dark who picks a
  light-only skin gets light. This is a real accessibility consequence; it is why the
  toggle is *visibly* disabled rather than silently inert, and why pairing exists.

Rejected: keeping both axes (retains the contrast gate and the three-way sync);
toggling back to Forage light/dark from any skin (silently discards a deliberate user
choice); hiding the toggle under skins (removes the affordance that motivated keeping
it). **Supersedes** parent plan 4a's "composing WITH light/dark where the skin permits"
— recorded as an ADR in Phase 6, not changed quietly.

### Dark mode is a real design problem, not a detail

A phpBB theme has exactly one palette. Forage has light and dark. An importer that
mechanically inverts a theme into a dark variant will produce contrast failures — the
existing skins carry recorded AA ratios (`usenet.css` documents ~13:1) and that
standard should not lapse for imported skins. *Superseded by the collapse above — retained for the record of how the question was
reasoned before one-skin-one-palette dissolved it.*

## Verified Assumptions

Established this session against real sources, not memory:

- **VA1** — `js/skins.js` restricts skins to declared-token assignment; `skinScan()`
  names violations; `test/skins.test.js` runs it over every registered skin and has a
  proven-biting negative case. *(read in-repo)*
- **VA2** — prosilver's `stylesheet.css` imports 14 files, `colours.css` at #12.
  *(fetched `phpbb/phpbb@master`)*
- **VA3** — `colours.css` is 1224 lines, plain CSS, no design custom properties; the
  role table above is transcribed from its actual declarations. *(fetched, inspected)*
- **VA4** — A phpBB 3.3 style is identified by `style.cfg` (INI-shaped: `name`,
  `style_version`, `phpbb_version`, `parent`). On `master` (4.0 dev) that file is gone
  and the style root carries `composer.json` instead — **the importer must accept
  both**. *(fetched both refs)*
- **VA5** — prosilver is **GPL-2.0** (`style.cfg` header). Licensing of derived skins
  is OQ1.
- **VA6** — `css/app.css` hardcodes radii at the lines listed in the Problem
  Statement, so squaring the UI requires tokenizing them. *(read in-repo; re-verified
  against `f08fa9d` after the rebase — two line refs had gone stale, which is why the
  plan cites line numbers with a commit rather than bare)*

Not yet verified, and Phase 0 exists to verify it:

- **UA1** — that non-prosilver-derivative themes (Volare/BBOOTS/Milk) still expose a
  mappable colour layer, and at what coverage. Assumed *partial*; measured in Phase 0.

## Concurrency Map

Sequential spine: Phase 0 → 1A → 1B → 1C → 1D → 2 → 3A → 3B → 4A → 4B → [5 || 6]

Phases 1A–4B are strictly sequential: each reads what the prior wrote. 1A→1D is an
expand/contract migration (1B adds the new path alongside the old; 1D removes the old),
so every intermediate phase leaves a working app. Phase 3A consumes Phase 2's tokens;
Phase 4A supplies the fixtures Phase 4B's tests read; Phase 4B's oracle consumes
Phase 3A's skin.

Parallel set {5, 6}:
- **Disjoint write-sets:** 5 writes `e2e/skins.workflow.mjs`;
  6 writes `README.md`, `docs/SKINS.md`, `AGENTS.md`. No overlap.
- **Shared-state contract:** Both run in worktrees off `claude/skin-chrome`. Neither
  invokes `git checkout` / `git stash` / `git rebase` in the parent worktree, and
  neither runs `git worktree` mutations there. Phase 5 runs Playwright: it binds a
  local preview port (`npm run preview`) and writes only under its own worktree —
  Phase 6 binds no ports and runs no browser. Disjoint tmp paths. Neither touches
  `forage.state` or any localStorage-backed fixture.
- **Re-entry verification:** parent-repo HEAD equals the pre-dispatch SHA;
  `git status` clean in `worktrees/forage/skin-chrome`; `git worktree list` shows only
  the expected worktrees; no orphan `chromium`/`playwright` process still holding the
  preview port; neither phase wrote `forage.state` or any localStorage-backed fixture
  (`git diff --stat` on `test/fixtures/` empty for both).

Cross-session: `css/tokens.css` and `css/app.css` (Phase 1) are workspace-shared
surfaces. `worktrees/forage/modes-bbs` is clean and zero-ahead of `main` (verified
2026-08-26) so it is not a live claim, but a session resuming it would contend on
exactly those two files.

## Phases

Each phase leaves the tree working and green. RED first, every phase.

### Phase 0 — Evidence: does the mapping generalize? — ✅ COMPLETE 2026-08-26

Corpus (4 real styles, deliberately spanning the dialect range):
prosilver 3.4-dev (GPL), subsilver2 3.0.x (GPL), we_universal 3.2 (modern responsive),
freecad-dark (real-world derivative, SCSS-built, ships light+dark in one output).
Probe: `probe-coverage.mjs` + `probe-v2.mjs` (scratchpad; seeds the Phase 3 importer).

**Finding 0.1 — `colours.css` is NOT a reliable input. Key off selectors, not filenames.**
Only 1 of 4 themes has a `colours.css`. subsilver2 is one monolithic `stylesheet.css`
(the file 404s); we_universal inlines colour into `common/content/cp/forms.css`;
freecad-dark authors in SCSS (`_colours.scss`) and ships a compiled bundle. The
importer must parse **all CSS in the theme directory and resolve by selector**, not
open a named file. This invalidates the naive design the plan originally implied in
"What can and cannot be reused" — that row is corrected below.

**Finding 0.2 — Role resolution: 15/15 on all four themes.** Direct extraction ranges
67–100%; declared fallbacks close the rest. Nothing was guessed.

| | prosilver | subsilver2 | we_universal | freecad-dark |
|---|---|---|---|---|
| direct from theme | 15/15 | 12/15 | 10/15 | 12/15 |
| derived via declared fallback | 0 | 3 | 5 | 3 |
| absent (unresolvable) | 0 | 0 | 0 | 0 |

**Finding 0.3 — the three "missing" roles are absent BY DESIGN, not unfound.**
`surface`, `border`, `nav-fill` miss on 3 of 4 themes because those themes genuinely
have no such surface: we_universal sets `#wrap { background: none; border: 0 }`,
freecad's `#wrap` border is `transparent`, and subsilver2 has no `.forumline` rule in
CSS at all (subSilver carried it as HTML `bgcolor` attributes in templates). So
mapping `surface → page-bg` is *correct behaviour*, not a fudge. This is why the
importer needs **declared fallback chains** with provenance reported per role
(`direct` / `derived` / `absent`), rather than a binary mapped/unmapped.

Ratified chains: `surface→page-bg`; `border→row-head→mix(page-ink 15%, page-bg)`;
`nav-fill→band-fill`; `band-ink→contrast-pick vs band-fill`; `band-link→band-ink`;
`row-even→row-odd`; `panel→surface→page-bg`; `font-body→keep Forage default`.

**Finding 0.4 — the AA gate works, and earned its keep on the first run.**
It flagged freecad-dark at 1.19:1 body text. Investigated: **that is a probe defect,
not a theme defect.** `freecad.css` (the FreeCAD *site* layer) sets
`body { color: #ddd }` for the website while the forum's ground comes from
`html, body { background-color: #f0f0f0 }` in the phpBB layer — the probe paired a
foreground and a background that never co-occur. The theme's real pair is
`#141414` on `#f0f0f0` = **16.17:1**.

The lesson is a hard requirement for Phase 3: **roles must be resolved as a coherent
set, preferring same-origin (same rule, then same file) pairs.** Independent per-role
last-wins can synthesise a combination that exists nowhere in the source theme. A gate
that catches this before emit is exactly the "green-real vs green-model" distinction
the workspace enforcement dimension asks for.

**Finding 0.5 — gate thresholds must be role-aware.** Grading band text at 4.5 failed
prosilver (3.41) and subsilver2 (3.16). Band text is large/bold UI, which WCAG grades
at 3.0; at the correct threshold both pass. The gate carries a per-pair threshold, not
one global number.

**Finding 0.6 — the plan's remembered subSilver hexes were wrong.** Corrected from the
real 3.0.x source: `a:link #006597` (not `#006699`), `a:hover #D46400` (not `#DD6900`),
`th { background #006699; color #FFA34F }`, `.row1 #ECECEC`, `.row2 #DCE1E5`,
`.row3 #C0C8D0`, `.cat #C7D0D7`, body ink `#323D4F`. Phase 2 uses these.

**Disposition of Phase 0 code and data** (required; was missing until Pass 3):
- `probe-coverage.mjs`, `probe-v2.mjs` (role table, CSS reader, fallback chains,
  contrast maths) — **promote**. They become `scripts/import-phpbb-style.mjs` in
  Phase 4B, where TDD applies to the promoted code (RED first). The probes themselves
  are not retro-tested.
- prosilver + subsilver2 sources (GPL-2.0) — **keep-as-fixture**, vendored in Phase 4A.
- we_universal + freecad-dark — **throwaway**. Licences are not GPL-compatible or
  unstated, so per OQ1 they were probe-only and are not vendored. Their measured
  findings survive in this document; the files do not enter the repo.

**Ratified vocabulary (15 roles)** — `page-bg`, `page-ink`, `surface`, `border`,
`link`, `link-hover`, `band-fill`, `band-ink`, `band-link`, `nav-fill`, `panel`,
`row-odd`, `row-even`, `row-head`, `font-body`. Kill criterion not triggered:
coverage generalised across all four dialects, so Phase 3 stays broad rather than
narrowing to prosilver-lineage.


### Phase 1A — One registry: skins subsume themes

**Goal:** Make the skin registry the single palette authority, with sibling pairing.
**Changes:**
- [ ] **RED:** `test/skins.test.js` — a skin entry declares `palette: 'light'|'dark'`
      and optional `pairedWith`; pairing is **symmetric and validated** (if
      `phpbb.pairedWith === 'phpbb-dark'` then the reverse must hold, and a dangling
      pair id fails loudly with the offending ids named — same posture as the existing
      `hrefFor` "unknown skin" error). Assert the *absence* of a pair is legal and
      reports as such, since that is what disables the toggle.
- [ ] **RED:** OS-preference resolution — with no stored choice and `prefers-color-
      scheme: dark`, the resolved skin is `forage-dark`; with light, `forage-light`.
      Boundary: an explicit stored choice always beats the OS, both directions.
- [ ] **GREEN:** `js/skins.js` gains `palette`, `pairedWith`, `siblingOf(id)`, and
      OS-aware default resolution. One key (`forage.skin`); `forage.theme` retires
      (pre-1.0, no compat shim per workspace rule).
**Call chain:** `js/main.js` boot → `skins.activeSkin()` → resolution (stored → OS →
`forage-light`) → `apply()`. Toggle path: `skins.siblingOf(active)` → `setSkin()`.
**Wiring test:** a test that drives `activeSkin()` through all three resolution inputs
(stored / OS-dark / OS-light) and asserts the id — proving resolution is reachable from
the boot entry point, not just that the helpers work in isolation.
**Depends on:** Phase 0.
**Read-set:** `js/skins.js`, `js/theme.js`, `test/skins.test.js`.
**Write-set:** `js/skins.js`, `test/skins.test.js`. *(2 files)*
**Shared-state contract:** Reads `matchMedia` and `localStorage`; writes only
`forage.skin`. Never writes `forage.state`. No ports, no git ops in the parent.
**Validation strategy:** unit tests only — this phase adds no rendering. Proportionate:
nothing user-visible changes yet.
**Done when:**
- *Behaviourally:* the registry can answer "which palette, and what is its sibling"
  and resolves a default from the OS.
- *Verified by:* `npm test`.
**Risks:** Asymmetric pairing data. Mitigated by the symmetry assertion being RED first.

### Phase 1B — Palettes become skins (expand)

**Goal:** Ship `forage-dark` as a real skin and make `color-scheme` skinnable —
**without** removing the legacy path, so the app keeps working.
**Changes:**
- [ ] **RED:** assert `--color-scheme` is a declared token and that a fixture skin
      assigning it passes `skinScan()`. This is the blocker: `color-scheme` is a real
      CSS property, so today the scan **rejects** it and no skin can control native
      scrollbars or form controls.
- [ ] **GREEN:** declare `--color-scheme` in `css/tokens.css`; `css/app.css` consumes
      it as `:root { color-scheme: var(--color-scheme); }`.
- [ ] **GREEN:** `skins/forage-dark.css` — today's dark palette, lifted verbatim from
      the existing `[data-theme="dark"]` block so the values are provably unchanged.
- [ ] **Expand, do not contract yet:** the legacy `[data-theme]` and
      `prefers-color-scheme` blocks STAY. Both paths work simultaneously. Phase 1D
      removes the old one. This is what keeps each phase's app green.
**Call chain:** `skins.apply()` → `<link href="/skins/forage-dark.css">` → token
reassignment → `app.css` rules, including `color-scheme`.
**Wiring test:** load the app with `forage-dark` active and assert the *computed*
`color-scheme` on `:root` is `dark` — the property, not the token. A token-only
assertion would pass while native controls stayed light, which is the exact bug.
**Depends on:** Phase 1A.
**Read-set:** `css/tokens.css`, `css/app.css`, `js/skins.js`.
**Write-set:** `css/tokens.css`, `css/app.css`, `skins/forage-dark.css`. *(3 files)*
**Shared-state contract:** Adds a skin file; does not touch `sw.js` (Phase 1C does, so
the SHELL edit stays in one place). No ports, no git ops in the parent.
**Validation strategy:** tests plus a browser check of scrollbar and `<select>`
rendering in both palettes — computed-style assertions cannot fully prove native
control chrome.
**Done when:**
- *Behaviourally:* `forage-dark` is selectable and correct, including native controls;
  the legacy toggle still works unchanged.
- *Verified by:* `npm test`, `npm run workflows`.
**Risks:** Palette drift while copying. Mitigated by lifting values verbatim and
diffing against the legacy block.

### Phase 1C — Boot path: no flash of the wrong palette

**Goal:** Non-default skins must not flash the default palette on load.
**Changes:**
- [ ] **RED:** a workflow assertion that first paint already carries the active skin's
      background — the regression this phase exists to prevent.
- [ ] **GREEN:** rewrite the inline head script in `index.html` and `404.html`. Today
      (`index.html:25`, `404.html:25`) it reads `forage.theme` and sets an attribute —
      synchronous and cheap. A skin is a `<link>`, which is **not** synchronous, so the
      script must inject the `<link>` into `<head>` before first paint rather than let
      `js/skins.js` add it after module load.
- [ ] Keep the default palette inline in `tokens.css` (no link, no flash for the common
      case); only non-default skins load a sheet.
- [ ] `sw.js` SHELL gains `/skins/forage-dark.css`. Assert the SHELL list is
      duplicate-free — `f6012bf`, this plan's baseline, is a fix for exactly that bug.
**Call chain:** browser parses `<head>` → inline script reads `forage.skin` → injects
`<link>` → first paint already correct → `js/skins.js` later adopts the existing element
rather than creating a second one.
**Wiring test:** the workflow assertion above, run against a reload with a non-default
skin stored. This is the only test that can catch a flash; a unit test cannot see paint.
**Depends on:** Phase 1B (the skin file must exist to be preloaded).
**Read-set:** `index.html`, `404.html`, `sw.js`, `js/skins.js`.
**Write-set:** `index.html`, `404.html`, `sw.js`. *(3 files)*
**Shared-state contract:** `sw.js` SHELL is a live cache manifest — a duplicate or
missing URL breaks SW install. Binds the preview port during validation. No git ops.
**Validation strategy:** browser reload with throttled network (DevTools) to make a
flash visible if present — at full speed a flash can hide. Plus SW install check.
**Done when:**
- *Behaviourally:* reloading on a non-default skin shows no flash of the default
  palette, and the SW installs cleanly.
- *Verified by:* `npm run workflows` and a throttled manual reload.
**Risks:** Double `<link>` injection (inline script + module). Mitigated by the module
adopting the existing element by id — the same `LINK_ID` pattern `apply()` already uses.

### Phase 1D — Toggle and picker (contract)

**Goal:** Point the UI at skins and delete the legacy theme path.
**Changes:**
- [ ] **RED:** toggle behaviour — on a skin WITH a sibling it swaps to the sibling; on
      a skin WITHOUT one it is **disabled and visibly so**, never a dead control. Assert
      the disabled state is expressed (attribute + title), not merely inert.
- [ ] **GREEN:** `js/main.js` (toggle at lines 32 and 69) calls `skins.siblingOf()`.
- [ ] **GREEN:** `js/ui/views.js:549` picker groups by palette so light/dark siblings
      read as pairs rather than as unrelated entries in one flat list.
- [ ] **Contract:** delete `js/theme.js` and the legacy `[data-theme]` /
      `prefers-color-scheme` blocks from `tokens.css`. Pre-1.0 — no shim, no alias.
**Call chain:** toggle click → `skins.siblingOf(activeSkin())` → `setSkin()` →
`apply()` → `<link>` swap. Picker: `<select>` change → `setSkin()`.
**Wiring test:** a workflow that clicks the real toggle on `phpbb`, lands on
`phpbb-dark`, reloads, and is still there — end-to-end through the actual control.
**Depends on:** Phase 1C.
**Read-set:** `js/main.js`, `js/ui/views.js`, `js/theme.js`, `css/tokens.css`.
**Write-set:** `js/main.js`, `js/ui/views.js`, `js/theme.js` (deleted). *(3 files)*
**Shared-state contract:** Removes the `forage.theme` key from use; does not migrate it
(pre-1.0). Writes only `forage.skin`. No ports beyond validation, no git ops.
**Validation strategy:** workflow plus manual toggle across every registered skin,
including one with no sibling, to confirm the disabled state reads as deliberate.
**Done when:**
- *Behaviourally:* the upper-right toggle swaps palette within the current skin, is
  visibly disabled where no sibling exists, and `js/theme.js` is gone.
- *Verified by:* `npm test`, `npm run workflows`.
**Risks:** A skin with no sibling leaves users stuck on one palette — accepted and
stated (see Reasoning); the disabled control is what makes it legible rather than
mysterious.

### Phase 2 — The forum-chrome token vocabulary

**Goal:** Declare the 15 ratified roles as tokens and teach `app.css` to consume them,
with today's rendering byte-identical.
**Changes:**
- [ ] **RED:** extend `test/skins.test.js` — assert each ratified token is declared in
      all three blocks `tokens.css` keeps hand-synced (`:root`, `:root[data-theme=
      "dark"]`, and the `prefers-color-scheme` block). A token declared in only one is
      the drift this test exists to catch.
- [ ] **RED:** default-is-unchanged assertion — with no skin sheet, every new token
      resolves to the value reproducing current output. This is the safety net for
      tokenizing `app.css`; it catches a wrong default hex.
- [ ] **GREEN:** declare the tokens in `css/tokens.css` (all three blocks).
- [ ] **GREEN:** consume them in `css/app.css`, including tokenizing the hardcoded
      radii (VA6) behind `--radius-sm` / `--radius-media` / `--radius-round`.
- [ ] Bevel chrome as a `box-shadow` **value** token (`--card-shadow`, default `none`)
      so `app.css` owns the property and skins own only the value — the scan stays
      absolute.
**Call chain:** `index.html` → `<link css/tokens.css>` → `css/app.css` rules consuming
`var(--token)` → rendered DOM. Skin path: `js/skins.js apply()` → managed `<link
id="skin-sheet">` → token reassignment cascades into the same `app.css` rules.
**Wiring test:** `test/skins.test.js` — a fixture skin that reassigns `--band-fill` is
accepted by `skinScan()` against the REAL `tokens.css`, proving the new token is
reachable by a skin and not merely declared. RED before the token exists.
**Depends on:** Phase 1D (the collapse — this phase adds tokens to a single-palette
sheet, not three hand-synced blocks), Phase 0 (ratified vocabulary).
**Read-set:** `css/tokens.css`, `css/app.css`, `js/skins.js`, `skins/bbs.css`,
`skins/usenet.css`.
**Write-set:** `css/tokens.css`, `css/app.css`, `test/skins.test.js`. *(3 files)*
**Shared-state contract:** No git operations beyond commits on the phase branch. Binds
no ports. Touches no localStorage keys (`forage.skin` untouched). No env vars.
**Validation strategy:** `npm test` green, plus a manual browser pass at the preview
(`npm run preview`) comparing against `f6012bf` in both themes — the default-unchanged
test proves token values, only the eye proves the rendering did not shift.
**Done when:**
- *Behaviourally:* a skin can set a masthead fill, band, row striping, link-hover and
  bevel; the default look is unchanged; `bbs.css` and `usenet.css` still pass untouched.
- *Verified by:* `npm test` (all green) and `npm run workflows` (no regression).
**Risks:** A wrong default hex silently shifts the default skin. Mitigated by the
default-is-unchanged test being written RED first.

### Phase 3A — `skins/phpbb.css` (light), hand-authored

**Goal:** The classic phpBB skin, and the proof Phase 2's vocabulary is sufficient.
**Changes:**
- [ ] **RED:** register `phpbb` in `SKINS` (`js/skins.js`) with `palette: 'light'` and
      NO `pairedWith`, before the file exists. The existing suite goes red on its own —
      `test/skins.test.js` "files exist" does `readFileSync` per registered skin. A
      genuine RED from the existing generic loop, not a new test written to fail.
- [ ] **GREEN:** author `skins/phpbb.css` from the Phase 0 **verified** values —
      `a:link #006597`, `a:hover #D46400`, band `#006699` with `#FFA34F` ink, rows
      `#ECECEC`/`#DCE1E5`, `.row3 #C0C8D0`, `.cat #C7D0D7`, body ink `#323D4F`, with the
      prosilver band fill per OQ5. Verdana stack, squared corners, bevel via
      `--card-shadow`, `--color-scheme: light`. Recorded AA ratios in the header, as
      `usenet.css` does.
- [ ] `sw.js` SHELL gains `/skins/phpbb.css`; assert the list stays duplicate-free.
- [ ] **Deliberate intermediate state:** with no sibling yet, the toggle is *disabled*
      on this skin. That is the Phase 1D disabled path being exercised for real, in
      production, before Phase 3B supplies the pair — a free end-to-end test of the
      state that is otherwise hardest to reach.
**Call chain:** picker (`js/ui/views.js:549`, data-driven over `SKINS`) →
`skins.setSkin('phpbb')` → `apply()` → `<link>` → tokens → `app.css`.
**Wiring test:** the per-skin scan loop resolves `phpbb` against the real `tokens.css`
and passes — proving registered, present, and token-only. Plus a workflow assertion
that the toggle renders disabled on this skin.
**Depends on:** Phase 2 (tokens), Phase 1A (palette metadata), Phase 1D (disabled path).
**Read-set:** `css/tokens.css`, `skins/usenet.css` (format precedent), `js/skins.js`.
**Write-set:** `skins/phpbb.css`, `js/skins.js`, `sw.js`. *(3 files)*
**Shared-state contract:** `sw.js` SHELL is a live cache manifest — duplicates break SW
install (`f6012bf`). No ports beyond validation, no git ops in the parent.
**Validation strategy:** tests plus a real browser load with the SW active; a unit test
cannot catch a broken SW install.
**Done when:**
- *Behaviourally:* `phpbb` is selectable, renders the classic look, persists across
  reload, SW installs cleanly, and its toggle reads as deliberately disabled.
- *Verified by:* `npm test`, `npm run workflows`, and DevTools → Application → Service
  Workers showing activated.
**Risks:** SW SHELL duplication (see contract); contrast miss — mitigated by recorded
ratios.

### Phase 3B — `skins/phpbb-dark.css` and the pairing

**Goal:** Give phpBB a dark sibling and light up the toggle on it.
**Changes:**
- [ ] **RED:** pairing symmetry — `phpbb.pairedWith === 'phpbb-dark'` and the reverse;
      the Phase 1A validator fails loudly if only one side is set. Plus a workflow
      assertion that the toggle on `phpbb` now lands on `phpbb-dark` and back.
- [ ] **GREEN:** author `skins/phpbb-dark.css` — a hand-authored dark reading of the
      classic palette with `--color-scheme: dark` and recorded AA ratios. **Hand-
      authored, not derived:** OQ4's mechanical inversion is exactly what the collapse
      removed, and Finding 0.4 showed synthesised palettes can be incoherent.
- [ ] Register with symmetric `pairedWith`; `sw.js` SHELL gains the file.
**Call chain:** toggle → `skins.siblingOf('phpbb')` → `setSkin('phpbb-dark')` →
`apply()`.
**Wiring test:** the workflow above — click the real toggle on phpbb, land on
phpbb-dark, reload, still there. Exercises registry, pairing, toggle and persistence in
one path.
**Depends on:** Phase 3A.
**Read-set:** `skins/phpbb.css`, `js/skins.js`, `css/tokens.css`.
**Write-set:** `skins/phpbb-dark.css`, `js/skins.js`, `sw.js`. *(3 files)*
**Shared-state contract:** As 3A — SHELL manifest is the shared surface. No ports
beyond validation, no git ops.
**Validation strategy:** tests plus manual toggling in a real browser, checking native
scrollbars and `<select>` chrome follow `--color-scheme`.
**Done when:**
- *Behaviourally:* the toggle swaps phpbb ↔ phpbb-dark, both pass AA, native controls
  follow the palette.
- *Verified by:* `npm test`, `npm run workflows`.
**Risks:** Asymmetric registration — caught RED by the Phase 1A symmetry validator.

### Phase 4A — Vendor the theme corpus as fixtures

**Goal:** Give Phase 3B real, licence-clean inputs to test against, offline.
**Changes:**
- [ ] Vendor prosilver `colours.css` + `common.css` and subsilver2 `stylesheet.css`
      under `test/fixtures/phpbb-themes/` — both GPL-2.0, the only two of the Phase 0
      corpus that OQ1 permits in-repo.
- [ ] `test/fixtures/phpbb-themes/PROVENANCE.md` — per-theme source URL, upstream ref,
      licence, and retrieval date. This is the artifact OQ1's posture rests on; without
      it the repo carries third-party CSS with no recorded licence.
**Call chain:** `npm test` → `test/import-phpbb.test.js` → `readFileSync` on these
fixtures. (Phase 4B adds the consumer; this phase adds the input.)
**Wiring test:** none of its own — this phase adds data, not behaviour. Its correctness
is proven by Phase 4B's tests failing to run without it. *Declared explicitly rather
than left blank: a data-only phase with no wiring test is acceptable only when the very
next phase consumes it, which is the case here.*
**Depends on:** Phase 0 (which selected and licence-checked the corpus).
**Read-set:** Phase 0 scratchpad downloads.
**Write-set:** `test/fixtures/phpbb-themes/` (3 CSS files),
`test/fixtures/phpbb-themes/PROVENANCE.md`. *(2 units)*
**Shared-state contract:** Adds files only; touches no existing module, no ports, no
git ops in the parent. Network is used once here (retrieval) and never again at test
time — this phase is what makes Phase 3B's no-network guarantee true.
**Validation strategy:** confirm each vendored file is byte-identical to its upstream
ref recorded in PROVENANCE.md, and that `npm test` still passes (fixtures unused yet).
**Done when:**
- *Behaviourally:* the two GPL themes are in-repo with recorded provenance, and tests
  can read them with no network.
- *Verified by:* `npm test` green; `curl` of each recorded URL diffs clean against the
  vendored copy.
**Risks:** Vendoring a non-GPL theme by mistake — mitigated by PROVENANCE.md being a
required same-phase artifact, not a follow-up.

### Phase 4B — The translation layer: `scripts/import-phpbb-style.mjs`

**Goal:** Turn a real phpBB style into a scan-passing Forage skin.
**Changes:**
- [ ] **RED:** `test/import-phpbb.test.js` over fixture CSS — each role resolves;
      provenance is reported per role (`direct`/`derived`/`absent`); a malformed sheet
      fails loudly; **the coherence rule holds** (Finding 0.4): a fixture pairing a
      foreground and background from different origins must NOT produce a synthesised
      pair. This test encodes the defect Phase 0 found.
- [ ] **GREEN:** the importer. Input: a style directory (accepting `style.cfg` *or*
      `composer.json`, VA4) or a bare stylesheet. Resolves **by selector across all
      theme CSS** (Finding 0.1), never by filename.
- [ ] Role table and fallback chains as **data**, so a new role or dialect is a table
      edit.
- [ ] Role-aware AA thresholds (Finding 0.5); derived-dark behind the hard gate per
      OQ4, falling back to light-only with a stated warning.
- [ ] **Boundary cases named (mutation resistance).** The gate is threshold code, so
      single-point assertions would survive a `>=`→`>` mutation. Tests assert the
      edges: body text refused at 4.49, admitted at 4.50 and 4.51; large/UI refused at
      2.99, admitted at 3.00 and 3.01. Same for the light-only fallback trigger.
- [ ] **Exit codes are part of the contract.** The tool exits non-zero when any role is
      `absent` or the AA gate fails; the degraded light-only emit requires an explicit
      `--allow-light-only` flag. A warning printed alongside exit 0 is the silent
      fallback the workspace fail-loud rule forbids, and would be scripted wrong.
- [ ] Generated header records source theme, version, license, tool commit, and the
      per-role provenance list — the artifact carries its own honesty.
- [ ] **Oracle test:** importing prosilver's `colours.css` reproduces its documented
      values; and `skins/phpbb.css` (Phase 2) is reproducible from subsilver2 source
      values. Divergence = a mapping bug.
- [ ] `package.json` gains `"import-phpbb": "node scripts/import-phpbb-style.mjs"`.
**Call chain:** `npm run import-phpbb -- <path>` → `scripts/import-phpbb-style.mjs`
`main()` → `readTheme()` → `resolveRoles()` → `gate()` → writes `skins/<name>.css` →
consumed thereafter by `js/skins.js` exactly like a hand-written skin.
**Wiring test:** a test that runs the importer over a fixture theme and feeds its
OUTPUT to the real `skinScan()` from `js/skins.js` — the tool's product is subject to
the same gate as hand-written skins, with no exemption. This is the field that stops
the importer becoming a generator nobody's output is checked against.
**Depends on:** Phase 4A (fixtures), Phase 3A (the oracle skin), Phase 0 (role table,
fallback chains — `promote` disposition).
**Read-set:** `js/skins.js`, `css/tokens.css`, `skins/phpbb.css`, `package.json`,
`test/fixtures/phpbb-themes/` (Phase 4A), Phase 0 probes (`promote` disposition).
**Write-set:** `scripts/import-phpbb-style.mjs`, `test/import-phpbb.test.js`,
`package.json`. *(3 files)*
**Shared-state contract:** Reads only fixture files committed under `test/fixtures/`;
no network at test time (theme corpus is vendored as fixtures, not fetched). Writes
skins only to an explicit output path passed by the caller — never overwrites a
registered skin without an explicit flag. No ports, no git ops.
**Validation strategy:** tests plus one real end-to-end run against a vendored theme,
inspecting the emitted file by eye and loading it in the browser.
**Done when:**
- *Behaviourally:* `npm run import-phpbb -- <path>` emits a scan-passing skin and
  prints its own per-role provenance and gate result.
- *Verified by:* `npm test` including the oracle and coherence tests.
**Risks:** Silent mis-mapping. Mitigated by the oracle test and by provenance being
printed rather than inferred.

### Phase 5 — The workflow journey

**Goal:** Prove the skin path at browser level (invariant 6b).
**Changes:**
- [ ] **Trap, recorded ahead of time (peer session, 2026-08-26):** if this phase adds
      `@axe-core/playwright` (the workspace WEB-TESTING dimension specifies
      "Playwright `^1.61.1` + axe"), it pulls its own `playwright-core`, which npm
      hoists to 1.62.0 while `@playwright/test` nests 1.61.1 — two copies whose `Page`
      types are incompatible under `exactOptionalPropertyTypes`. Fix is
      `overrides: {"playwright-core": "1.61.1"}` in `package.json`. forage has no
      axe-core today, so the trap is dormant until this phase springs it. Adding the
      override moves `package.json` into this phase's write-set (1 file → 2).
- [ ] **Extend** `e2e/skins.workflow.mjs` — it already exists (verified 2026-08-26);
      this phase adds the `phpbb` case: select → applies → persists across reload →
      applies in another mode. Hermetic tier only; never live (workspace WEB-TESTING).
**Call chain:** `e2e/run.mjs` → `e2e/skins.workflow.mjs` → preview server → real
browser → picker → `setSkin` → `<link>` swap → asserted computed style.
**Wiring test:** the journey itself is the wiring test for the whole feature.
**Depends on:** Phase 3B (both skins registered and paired).
**Read-set:** `e2e/run.mjs`, `e2e/harness/`, `js/skins.js`, `skins/phpbb.css`.
**Write-set:** `e2e/skins.workflow.mjs`. *(1 file)*
**Shared-state contract:** Binds the preview port via `npm run preview`; launches a
browser process. Must not leave an orphan browser or a held port. Writes only under its
own worktree. No git ops in the parent.
**Validation strategy:** `npm run workflows` green, run twice to confirm no port leak.
**Done when:**
- *Behaviourally:* a real browser selects phpbb, sees it applied, reloads and still
  sees it.
- *Verified by:* `npm run workflows`.
**Risks:** Port/browser leak on failure — covered by the re-entry verification.

### Phase 6 — Documentation and the ADR

**Goal:** Docs match behaviour (invariant 11).
**Changes:**
- [ ] `docs/adr/NNNN-skins-subsume-themes.md` — NEW. Records the collapse, its why, and
      what it supersedes (parent plan 4a: skins composing WITH light/dark). Required by
      the workspace DECISIONS dimension: absent from DECISIONS.md → owning repo's
      `docs/adr/`, ADR + registry row in the same change.
- [ ] `README.md` — skins section: the vocabulary, the importer, and **the layout
      boundary in the owner's terms** (palette/typography/chrome, never layout).
- [ ] `docs/SKINS.md` (new) — the 15 roles, the fallback chains, the phpBB mapping
      table, the AA gate, and the OQ1 licensing posture.
- [ ] `AGENTS.md` — the skin token contract, if Phase 1 changed its shape.
- [ ] **Frontier entry for the deferred density/structural layer (OQ3)** — invariant 7
      requires the deferral and its frontier registration to be the same commit.
**Call chain:** n/a (documentation).
**Wiring test:** n/a — but the mapping table in `docs/SKINS.md` must be generated from
or checked against the importer's role table, so the doc cannot drift from the code.
**Depends on:** Phases 1A–4B (documents what they built).
**Read-set:** `README.md`, `AGENTS.md`, `scripts/import-phpbb-style.mjs`,
`css/tokens.css`.
**Write-set:** `README.md`, `docs/SKINS.md`, `AGENTS.md`. *(3 files)*
**Shared-state contract:** None. No ports, no browser, no git ops in the parent.
**Validation strategy:** read the docs against the shipped behaviour; confirm every
claim is one the tests prove.
**Done when:**
- *Behaviourally:* a reader can import a theme and know what they will and will not get.
- *Verified by:* `grep` for the layout-boundary statement in README and docs; `npm test`
  still green (no doc-driven code drift).
**Risks:** The classic end-of-plan docs phase is the most-skipped. It is parallel with
Phase 4 rather than last-in-line partly for that reason.

## Documentation Impact

- `README.md` — skins section (vocabulary, importer, boundary). **Phase 5.**
- `docs/SKINS.md` — NEW. Roles, chains, mapping table, AA gate, licensing. **Phase 5.**
- `AGENTS.md` — skin token contract, only if Phase 1 changes its shape. **Phase 5.**
- `plans/2026-08-25-1-plan-backend-modes-bsky-writes.md` — Phase 4 cross-reference to
  this plan as its expansion. **Phase 5.**
- `sw.js` — not a doc, but a manifest that goes stale the moment a skin file is added.
  **Phase 1C** (forage-dark), **Phase 3A** (phpbb) and **Phase 3B** (phpbb-dark), each in
  the same commit as its skin.
- `test/fixtures/phpbb-themes/PROVENANCE.md` — NEW. Source, ref, licence, date per
  vendored theme. **Phase 4A**, same phase as the vendoring (this is the same-phase doc
  update the anti-pattern rule asks for).
- Grepped for other references to `skins/` — hits are `sw.js:12-13`, `js/skins.js`,
  `js/devbar.js:28`, `js/ui/views.js:549`, and the parent plan. No other docs reference
  the skin registry.

## Open Questions

- **OQ1 — DECIDED (owner, 2026-08-26).** Licensing: ship in-repo only our own or
  GPL-compatible skins; the importer is a local tool users run on themes they have
  licensed.
- **OQ2 — [CONFIRMED: ADVISORY] (owner, 2026-08-26): registry-only.** phpBB appears
  only when picked; no mode auto-applies it. Skins and modes stay independent axes.
  Original framing: Should any mode default to the phpBB skin (as bbs
  mode defaults to bbs via `js/devbar.js:28` `setTransient`), or is it registry-only?
  *Plan assumes registry-only per "a skin always available"; changing it later is a
  one-line edit, so it does not gate any phase.*
- **OQ3 — [CONFIRMED: ADVISORY] (owner, 2026-08-26): record as a frontier, not now.**
  A density/structural layer is a known deferred path and gets a registered frontier
  entry (invariant 7: deferring a path and registering its frontier are the same
  commit). Phases 1-5 ship as planned; the token layer is additive so nothing is
  reworked if it is picked up later. Original framing: Is a later *structural* layer wanted (a density
  token making post rows read table-like, closer to a real forum)? *Deferred; would be
  a frontier entry, not silent scope. Nothing in Phases 1–5 depends on the answer.*
- **OQ4 — SUPERSEDED (owner, 2026-08-26) by the theme/skin collapse.** The derived-dark
  question only existed because one skin had to serve two palettes. Under one-skin-
  one-palette a source theme maps 1:1 to a skin, so the importer never derives a dark
  variant and the mechanical-inversion failure mode is removed rather than gated. The
  AA gate itself SURVIVES — it still grades each imported palette on its own terms
  (Finding 0.4 proved it catches incoherent extraction), it simply no longer has to
  bless a synthesised palette. Prior decision (derive behind a hard gate) is retained
  above for the record.
- **OQ5 — DECIDED (owner, 2026-08-26).** subSilver palette with the prosilver band
  fill, using the Phase 0 verified hexes.
- **OQ6 — [CONFIRMED: ADVISORY -> actioned] (owner, 2026-08-26): fix now, before
  Phase 1.** Aligned as pre-work, outside the phase sequence. `package.json` claimed
  from the peer session (`design-registry-consolidation`) to avoid a concurrent edit.
  Original framing: `package.json` pins
  `@playwright/test` at exactly `1.61.0`, while the workspace WEB-TESTING dimension
  specifies `^1.61.1`. *Pre-existing drift, not caused by this plan, and Phase 4 does
  not depend on the difference. Flagged because Phase 5 is the plan's only Playwright
  consumer and this is the moment it is visible.*

## Review Log

### Pass 1: Plan development — 2026-08-26

Written from owner direction. Structure verified against `js/skins.js`,
`test/skins.test.js`, `css/tokens.css`, `css/app.css`; phpBB structure verified against
`phpbb/phpbb` `master` and `3.3.x` (VA1–VA6).

### Phase 0 executed — 2026-08-26

*(Originally mislabelled "Pass 2" — corrected in the Pass 2 entry below. Phase 0
execution is not the skill's Pass 2 gap analysis.)*

Ran the coverage probe over 4 real styles. Six findings recorded in the Phase 0 block;
three changed the design (0.1 filenames unreliable, 0.3 declared fallback chains,
0.4 coherent same-origin resolution), two corrected my inputs rather than the design
(0.5 thresholds, 0.6 subSilver hexes). Vocabulary ratified at 15 roles; kill criterion
not triggered. **Sequencing deviation, recorded honestly:** the skill runs
Pass 1 → 2 → 3 → execute; Phase 0 was executed after Pass 1, before Pass 2. Its outputs
are discovery findings and scratchpad probes — no production code — so the deviation
cost nothing, but it was out of order.

### Pass 2: Gap Analysis — 2026-08-26

**Found:**
- **Pass 1 was structurally incomplete.** Every phase was missing the required
  Read-set, Write-set, Shared-state contract, Call chain, Wiring test, Depends on,
  Validation strategy, and two-tier Done-when fields. Per `pass1.md` step 6 an empty
  Read/Write/Shared-state trio is "a plan defect, not a shortcut."
- **Hard-rule violation:** old Phase 4 touched 5 files (picker, e2e, README, docs,
  AGENTS) against the 4-file split rule. Old Phase 2 touched 4.
- **Planned work that does not exist:** old Phase 4 said "skin picker exposes phpbb."
  The picker at `js/ui/views.js:549` is already data-driven over `SKINS` — registering
  the skin exposes it automatically. Removed.
- **Planned work already done:** old Phase 4 said the e2e journey would be added.
  `e2e/skins.workflow.mjs` already exists — Phase 4 now *extends* it.
- **Missing RED path:** Phase 2 had no stated failing test. Found one in the existing
  suite: registering a skin whose file is absent makes `test/skins.test.js` throw on
  `readFileSync`. Genuine RED, no new test file.
- **Open Questions carried no severity recommendations**, required by `pass1.md` step 11.
- **New OQ6:** Playwright pin drift (`1.61.0` vs workspace `^1.61.1`).
- **`sw.js` risk was understated:** `f6012bf` — the current baseline — is literally a
  fix for duplicate SHELL URLs breaking SW install. Now named in Phase 2's contract.

**Concurrency:**
- Rewritten into the required format with an explicit sequential spine.
- **Missed parallelism surfaced:** Phases 5 and 6 have disjoint write-sets
  (`e2e/skins.workflow.mjs` vs `README.md`/`docs/SKINS.md`/`AGENTS.md`) and
  non-conflicting shared state. Proposed as parallel set {4, 5} with a re-entry check;
  owner decides whether to use it.
- Shared-state contracts upgraded from mechanisms to invariants: Phase 5 names the port
  bind and browser process, Phases 3A/3B name the SW SHELL manifest, Phase 4B names
  no-network-at-test-time.

**Changed:**
- Phases restructured to 5 (from 4), all ≤3 files. Every phase gained the required
  fields. Concurrency Map rewritten. OQ severities added. Review Log mislabel corrected.

**Confirmed:**
- Phases 1→2→3 ordering holds: each genuinely reads what the prior wrote, and the
  hand-author-before-importer sequencing (Phase 2 as Phase 3's oracle) survives review.
- VA1–VA6 re-checked against the code this pass; all still accurate.
- The token-only scan constraint holds across every phase — no phase needs to relax it.

### Pass 3: Quality Gates — 2026-08-26

**TDD ordering:**
- Every phase already opened RED; specificity held. One real gap: Phase 4B's AA gate is
  **threshold code**, and its test spec read as single-point assertions that a
  `>=`→`>` mutation would survive. Boundary cases now named explicitly (4.49/4.50/4.51
  body, 2.99/3.00/3.01 large-UI, plus the light-only fallback trigger).
- Phase 4A is data-only and has no wiring test. Rather than leave the field blank, the
  phase states *why* that is acceptable — the very next phase consumes it — so a reader
  cannot mistake the gap for an oversight.

**Observability:**
- Phase 3B's reporting was specified but its **exit codes were not**, which is the CLI
  form of a silent fallback: a warning printed alongside exit 0 gets scripted wrong.
  Now contractual — non-zero on any `absent` role or gate failure; the degraded
  light-only emit requires an explicit `--allow-light-only`.

**Debugging readiness:**
- Phase 2's default-is-unchanged test is the canary for Phases 3A–4B: any later
  regression in the default look surfaces there rather than in a browser.
- Each phase carries its own verification command, so a mid-execution break localises
  to one phase.

**Validation calibration:**
- Reviewed per phase; proportionate. Phase 3B (new external-ish tool) validates with a
  real run, not just tests. Phase 5 (docs) validates by reading. No change needed.

**Concurrency honesty:**
- Spine renumbered for Phase 3A. Write-sets re-checked after Pass 3 moved files: {5, 6}
  remain disjoint (`e2e/skins.workflow.mjs` vs `README.md`/`docs/SKINS.md`/`AGENTS.md`).
- Contracts were already invariants rather than mechanisms; one invariant ("touches no
  localStorage-backed fixture") had **no corresponding re-entry check** — added
  (`git diff --stat` on `test/fixtures/` empty for both), so the contract and the
  verification now map one-to-one.
- No further parallel candidates: 4A→4B is a true data dependency.

**Discovery:**
- **Defect found and fixed: Phase 0 declared no dispositions**, which Pass 3 calls a
  plan defect. Now explicit — probes `promote` into Phase 4B (TDD applies there),
  the two GPL themes `keep-as-fixture` via the new Phase 3A, and we_universal +
  freecad-dark are `throwaway` because OQ1 does not permit vendoring them.
- This exposed a genuine downstream gap: Phase 4B's tests had **no committed input**.
  The Phase 0 corpus lived only in the session scratchpad, so the plan as written would
  have reached execution with untestable tests. Phase 4A now supplies it.

**Coherence:**
- Plan still solves the stated problem; no scope creep. Reasoning reconstructible from
  the doc alone.
- All open questions carry a recommended severity; **none has yet been user-confirmed**
  — that walk-through is the gate on readiness, not a formality.

**Documentation impact:**
- `PROVENANCE.md` added under Phase 3A, same phase as the vendoring it documents.
- **Flagged, partially accepted:** Phase 6 is a documentation phase at the end, which
  Pass 3 names as an anti-pattern. Redistributed what the rule actually targets — stale
  *references* — into their triggering phases (`sw.js` in Phase 2, `PROVENANCE.md` in
  Phase 3A). What remains in Phase 6 is new explanatory prose (the vocabulary, the
  importer, the boundary), not reference cleanup, and Phase 6 runs *parallel* with
  Phase 5 rather than last-in-line. Recorded rather than silently accepted.

**Confirmed ready:** No — pending user confirmation of open-question severities
(OQ2, OQ3, OQ6). No BLOCKING items are outstanding; all three are recommended ADVISORY.

### USER REDIRECT — skins subsume themes — 2026-08-26

Owner: collapse light/dark and skins into one concept; `forage-light`/`forage-dark`
become skins; the upper-right toggle stays as a quick-change; light/dark and skins are
mutually exclusive. Toggle semantics resolved by owner the same day: skins declare a
**sibling**, the toggle swaps to it, and is visibly disabled where none exists.

**Changed:**
- New Reasoning section "Skins subsume themes" with the why, the three accepted costs
  (`color-scheme` scan blocker, flash risk, OS-dark no longer following into a skin),
  and the rejected alternatives.
- Four new phases 1A–1D ahead of the vocabulary work, structured **expand/contract**
  (1B adds the skin path beside the legacy one; 1D removes the legacy one) so every
  intermediate phase leaves a working app.
- Old Phase 1 → 2, Phase 2 → 3A/3B (a paired skin is two files plus registration plus
  the SHELL, which breaks the 4-file rule), 3A/3B → 4A/4B, 4 → 5, 5 → 6. Spine and all
  Depends-on references updated.
- **OQ4 superseded rather than deleted** — the derived-dark question only existed
  because one skin served two palettes.
- Phase 6 gains the ADR obligation: this supersedes parent plan 4a, and the workspace
  DECISIONS dimension requires ADR + registry row in the same change.

**Ordering rationale:** the collapse runs BEFORE the chrome vocabulary. Adding 15 tokens
to three hand-synced blocks and then collapsing them would do the dark-block work twice.

**Found while re-planning:**
- `color-scheme` is a hard blocker, not a detail — `skinScan()` rejects real CSS
  properties, so no skin can set it today. Named as Phase 1B's RED.
- Phase 3A now ships a skin with no sibling *deliberately*, exercising Phase 1D's
  disabled-toggle path in production before 3B supplies the pair — the state that is
  otherwise hardest to reach gets covered for free.

**Pre-work completed this session:** OQ6 actioned. `package.json` now carries the
canonical range `^1.61.1` with the lockfile pinned to **1.61.1**. Verified: a bare
caret resolved to **1.62.1**, which would have diverged forage from croft-pwa (1.61.1)
and required a firefox-1538 download absent from the local cache. 280 unit tests green.

### Phase 1A executed — 2026-08-26

Registry metadata, sibling pairing, and OS-preference resolution. Nothing visible
changes: `default` has no sibling until 1B, so the dark branch falls back to `default`.
11 unit tests + 1 wiring test (drives `activeSkin()` through stored / transient / OS
with storage, matchMedia and the minimum DOM stubbed).

**Mutation pass, 8 mutations, 7 killed on the first run.** The survivor is worth
recording: removing validatePairing's self-pair guard left the suite green, because a
self-pair trivially shares its own palette and the same-palette guard threw instead —
and the assertion matched only `/day/`, which both messages contain. Sharpened to
assert `/itself/`; the mutation now dies. Classified as a **real gap, not an equivalent
mutant**: both versions throw, but the message differs, and an inaccurate refusal
message is a behaviour regression under the workspace enforcement posture.

**Rebased onto `f08fa9d`** mid-phase after `claude/modes-bbs` landed 3p-3u. Clean —
no overlap with 1A's files. Two `css/app.css` line references in this plan had gone
stale (198→214, 282→304) and were corrected; suite went 292→314 tests on the new base.
