# Plan: rename Graze → Forage and move graze.ing → forage.fyi

date: 2026-08-21
status: READY — for an executing agent in a fresh session
repo: `CroftCommunity/graze` (to become `CroftCommunity/forage`), local checkout `CroftC/graze`
baseline: `main` @ `3c14ae5` (== origin/main, re-verified 2026-08-23). Tree carries two
untracked items: `plans/` (this plan) and `assets/rook_banner.png` (5.0MB PNG, appeared
2026-08-23 — see Open Questions OQ4; not part of this plan's baseline)

## Problem statement

The forum project's name is **decided and acted**: Forage, at **forage.fyi** (purchased
2026-08-21; see `discovery/alpha/NAMING.md` → "Forum-layer naming (2026-08-21)" and
`discovery/alpha/research/forage-name-clearance-2026-08.md`). This repo is the Graze-era
behavior-scale mock — a static, client-side persona-switch PWA served by GitHub Pages at
graze.ing — and it was deliberately **frozen under the old name** while the Amble clearance
was pending (NAMING.md do-not-propagate discipline; ROADMAP_TODO E73). The clearance gate
is now resolved by the Forage decision, so the freeze lifts: the mock must be renamed and
re-homed at forage.fyi, and graze.ing's disposition (ROADMAP_TODO E122(c)) executed.

## Approach

A mechanical, single-PR rename of every name-bearing surface (strings, keys, icon glyph,
manifest, README), then the serving cutover (CNAME file → Pages cname → DNS at Porkbun →
HTTPS), then the old-domain retirement, then the close-out stamps. No feature
work, no CI additions, no route changes ride along. Default decisions are stated inline so
the agent never blocks; the two genuinely owner-shaped calls (DNS records at the registrar,
the graze.ing disposition) are marked **OWNER STEP** with exact instructions the owner can
paste.

## Reasoning

- **Why mechanical-only:** the mock is a behavioral prototype with no backend and no test
  suite; the rename's risk is not logic but *missed surfaces* (a stale cache key serving
  the old shell, a CNAME/DNS mismatch taking the site dark). So the plan is organized as an
  exhaustive surface inventory (below, grounded in a grep of the actual tree at `3c14ae5`)
  plus serving-order discipline, not as a refactor.
- **Why rename the GitHub repo too:** repo content belongs under its real name
  (workspace rule), and GitHub redirects old repo URLs after a rename, so the cost is one
  remote update. Leaving the repo named `graze` would recreate the confusion the
  do-not-propagate freeze existed to prevent — permanently.
- **Why cutover order matters:** GitHub Pages issues the TLS cert only after the custom
  domain is set *and* DNS resolves to Pages. Changing the CNAME file before DNS exists
  takes forage.fyi dark-with-cert-errors; changing DNS before the CNAME file 404s.
  The order below (DNS first, then CNAME/Pages, then wait for cert, then enforce HTTPS)
  is the no-dark-window sequence. Note the current config has `https_enforced: false`
  even for graze.ing — fix that for forage.fyi as part of this work.
- **Why localStorage keys change without a migration shim:** the stored state is a
  disposable prototype event-log for whoever visited the mock; carrying a
  `graze.*` → `forage.*` migration forever to preserve throwaway demo state is negative
  value. State loss on first visit post-rename is accepted and invisible (seed data
  regenerates).
- **Why the service-worker cache key must bump:** returning visitors' SWs will otherwise
  serve the cached Graze shell from `graze-v2` indefinitely. A new cache name
  (`forage-v3`) plus the existing activate-time cleanup is the standard bust.

## Surface inventory (grounded at `3c14ae5` — verify with the grep in Phase 1)

| File | What carries the name | Change |
|---|---|---|
| `CNAME` | `graze.ing` | → `forage.fyi` (Phase 3 — NOT before DNS exists) |
| `manifest.webmanifest` | name/short_name "Graze", description | → "Forage"; description: see copy defaults |
| `index.html` | `<title>`, meta description, `localStorage.getItem('graze.theme')` inline, noscript text | → Forage strings; key → `forage.theme` (must match `js/theme.js`) |
| `sw.js` | `const CACHE = 'graze-v2'` | → `'forage-v3'` (bump, don't just rename) |
| `js/storage.js` | `KEY = 'graze.state'`, 3 console.warn prefixes | → `forage.state`, `forage:` prefixes |
| `js/theme.js` | `KEY = 'graze.theme'` | → `forage.theme` |
| `js/main.js` | search placeholder "Search Graze…", wordmark text 'Graze' | → Forage |
| `js/devbar.js` | `graze-export.json` download name + toast | → `forage-export.json` |
| `js/ui/views.js` | 4 explainer strings (persona-switch "what", export "what", dev-bar intro "Graze v1", "Join Graze") | → Forage |
| `data/seed.js` | 8 fictional emails `@graze.ing` + 2 copy strings (line 58 "Site announcements from the Graze team."; line 132 post title "Graze is in prototype. Here is what works.") | → `@forage.fyi`; → Forage |
| `css/tokens.css` | 2 comment refs ("Graze design tokens", "Graze brand green") | → Forage (palette values unchanged — the green is name-independent) |
| `css/app.css` | 1 comment ref | → Forage |
| `README.md` | title, prose, "Graze term" table header, deploy line, footer tagline + links | → Forage + forage.fyi; copy defaults below |
| `icons/icon.svg` | serif "g" glyph on the brand green | → same composition, glyph "f" |
| GitHub repo | name `graze`, empty description/homepage | → `forage`, description + homepage set |
| GitHub Pages | cname `graze.ing`, `https_enforced: false` | → `forage.fyi`, enforced true |

Copy defaults (owner may override in PR review; do not block on them):
- Tagline: "Roam the open web. Feed your curiosity." → **"Forage the open web. Find the
  good stuff."** (keeps the two-beat shape; "find the good stuff" is the foraging verb's
  own promise).
- manifest/meta description: "Forage is a topic-driven aggregation site. Forage the open
  web. Find the good stuff."
- Do **not** rebrand terminology that is name-independent (three-column layout, event-log,
  personas, dev bar). Do **not** introduce `/f/` routes — the mock's hash routes
  (`#/popular`) are out of scope; `/f/` is a decision for the real product
  (NAMING.md 2026-08-21), not this prototype.

## Execution phases

### Phase 0 — preflight
1. `gh auth switch --user chasemp` (this repo is chasemp-identity: committer
   `Chase Pettet <chase@owasp.org>`, SSH host `github-personal`).
2. `cd CroftC/graze && git fetch origin && git status` — expect clean, `main` == `origin/main`
   @ `3c14ae5`. If not clean: STOP, another session's work may be present
   (workspace memory: peer sessions sweep loose files — work in a worktree if in doubt).
3. Confirm forage.fyi is in the owner's Porkbun account (owner purchased 2026-08-21).

### Phase 1 — the code rename (one branch, one PR)
1. Branch: `rename-forage`.
2. Apply every row of the surface inventory EXCEPT `CNAME` (Phase 3 — serving order).
2b. Brand banner (OQ4, owner-confirmed): produce a web-ready derivative of
   `assets/rook_banner.png` (target ≤~200KB — resize toward ~1400px wide and/or convert
   to lossy WebP/optimized PNG; verify visually) and commit the derivative in this PR.
   Do NOT add it to the `sw.js` SHELL precache list. Leave the 5.0MB original untracked
   here — Phase 6 archives it to discovery seeds. (The banner is brand art from the
   naming session's corvid material; wiring it into the page is NOT in scope — commit
   the asset only, unless the owner asks for placement in PR review.)
3. Re-grep to prove exhaustion: `grep -rin "graze" . --exclude-dir=.git` must return ONLY
   the `CNAME` file (still `graze.ing` at this point, by design) and this plan file.
4. Sanity-run the static site locally (`python3 -m http.server` from the repo root).
   Concrete pass criteria (behavioral, not vibes — there is no test suite; this manual
   pass + the exhaustion grep is the verification bar):
   - page loads with zero console errors; wordmark and `<title>` read Forage;
   - after toggling theme and interacting, DevTools → Application → Local Storage shows
     `forage.theme` / `forage.state` and **no `graze.*` keys** (the negative assertion is
     the one a missed file would fail);
   - dev-bar export downloads `forage-export.json`;
   - with the SW registered (serve over localhost, reload twice), DevTools → Application
     → Cache Storage shows only `forage-v3` (the activate cleanup removed `graze-v2`);
     `?nosw` still bypasses registration for debugging.
   Screenshot for the PR.
5. PR titled "Rename Graze → Forage (site strings, keys, icon; CNAME follows cutover)".
   Body links NAMING.md (forum-layer 2026-08-21) + this plan. Merge per repo norms
   (PRs #1–#3 were the pattern — reviewed, then merged).

### Phase 2 — DNS at Porkbun — **OWNER STEP** (or agent with Porkbun API creds)
For apex `forage.fyi`, create either:
- four `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
  `185.199.111.153` (+ optional `AAAA` `2606:50c0:8000::153` … `:8003::153`) —
  **this is what graze.ing runs on today (dig-verified 2026-08-23), so it is the
  proven configuration**; or
- `ALIAS` record, host blank (apex), answer `croftcommunity.github.io` (the repo is
  under the CroftCommunity org, so the Pages default domain is the org's — NOT
  chasemp.github.io; Porkbun supports ALIAS at apex, survives GitHub IP changes).
Optional but recommended: `www` CNAME → `croftcommunity.github.io`.
Verify before proceeding: `dig +short forage.fyi` returns GitHub Pages addresses.

### Phase 3 — Pages cutover (only after Phase 2 verifies)
0. Checkpoint for rollback: snapshot the current Pages config before mutating —
   `gh api repos/CroftCommunity/<repo>/pages > <scratchpad>/pages-before.json`.
1. On `main`: change `CNAME` file content to exactly `forage.fyi`; commit/PR per repo norms.
2. Set the Pages custom domain (the file alone is authoritative for legacy builds, but set
   it explicitly and verify):
   `gh api -X PUT repos/CroftCommunity/<repo>/pages -f cname=forage.fyi`
3. Poll cert state until issued (minutes to ~1h):
   `gh api repos/CroftCommunity/<repo>/pages --jq '{cname,https_enforced,status}'`
   and `curl -sI https://forage.fyi | head -3` until 200 over TLS.
4. Then enforce HTTPS (fixing the pre-existing `https_enforced: false`):
   `gh api -X PUT repos/CroftCommunity/<repo>/pages -F https_enforced=true`
   If cert provisioning stalls (>~1h with DNS verified), the documented recovery is to
   remove and re-add the custom domain in Pages settings to re-trigger the Let's
   Encrypt request.
5. Full verification: `curl -sI https://forage.fyi` → 200; manifest fetch
   `curl -s https://forage.fyi/manifest.webmanifest | grep Forage`; fresh-profile browser
   visit installs the PWA as "Forage"; a previously-visited browser gets the new shell
   after SW update (the `forage-v3` bust).

### Phase 4 — GitHub repo rename
1. `gh repo rename forage --repo CroftCommunity/graze --yes` (GitHub redirects the old
   name for clones/API/web).
2. Update the local remote: `git remote set-url origin git@github-personal:CroftCommunity/forage.git`.
3. Rename the local directory `CroftC/graze` → `CroftC/forage` (plain `mv` is fine — it is
   a repo root, not a worktree). Re-verify `git status` afterward.
4. Set metadata: `gh repo edit CroftCommunity/forage --description "Forage — topic-driven
   aggregation prototype (behavior-scale mock)" --homepage "https://forage.fyi"`.
5. Done when: `gh repo view CroftCommunity/forage` succeeds; the old URL redirects
   (`gh repo view CroftCommunity/graze` resolves to forage); `git pull` works on the
   updated remote; and `curl -sI https://forage.fyi` still returns 200 (the rename did
   not disturb Pages).

### Phase 5 — graze.ing retirement — **OWNER STEP** (E122(c) disposition: RETIRE DARK, owner-confirmed 2026-08-23)
Owner decision (OQ2, overriding the plan's earlier redirect default): **retire graze.ing
dark** — at Porkbun, remove graze.ing's four GitHub Pages A records (and any AAAA/www
records). No URL forward. Old graze.ing links break immediately; that is accepted.
Do NOT delete the graze.ing registration — whether to let it lapse at renewal remains a
separate, later owner decision.
Verify: `dig +short graze.ing` returns nothing (allow TTL propagation);
`curl -sI --max-time 10 http://graze.ing` fails to connect.

### Phase 6 — close-out (cross-repo: `CroftC/discovery` + the workspace meta-repo)
1. `alpha/ROADMAP_TODO.md`: stamp **E73** (disposition executed: **retired dark**,
   owner-confirmed 2026-08-23) and **E122** riders (c) done + note the repo rename.
2. `alpha/NAMING.md` → "Domain reconciliation": update the `graze.ing` bullet to its
   executed state; note the mock now lives at forage.fyi in the 2026-08-21 section's
   carried-forward paragraph.
3. `CroftC/.claude/CI-PATTERN.md`: update the workspace CI table row that lists `graze`
   among no-CI repos → `forage` (meta-repo file; found by the Pass 3 stale-reference
   grep).
3b. Archive the original `assets/rook_banner.png` (5.0MB) to
   `discovery/alpha/seeds/forage-brand/rook_banner_original.png` (byte-copy, then remove
   the untracked original from this repo's tree), and note it in the seeds filing per
   the PLAYBOOK.
4. Done when: `grep -rn "graze" alpha/ROADMAP_TODO.md alpha/NAMING.md` shows the E73/E122
   stamps present and no *live* (non-historical) graze.ing references; CI-PATTERN row
   reads forage.
5. Do not commit discovery or the meta-repo (or this repo beyond the PRs above) without
   the owner's ask — playbook §3b.

## Concurrency Map

All phases sequential — one site, one DNS zone, and each phase's verification is the next
phase's precondition. One safe-parallel candidate, flagged for the executing agent rather
than prescribed: **Phase 1 (code PR) ∥ Phase 2 (DNS)** have disjoint write-sets (repo
files vs the forage.fyi registrar zone) and independent verifications; running Phase 2 in
parallel shortens the cert wait. Phases 3–6 remain strictly sequential.

## Documentation Impact

From the Pass 3 proactive stale-reference grep across the workspace (2026-08-23):
- `CroftC/.claude/CI-PATTERN.md` — workspace CI table lists `graze` among no-CI repos →
  updated in **Phase 6.3**.
- `discovery/alpha/ROADMAP_TODO.md` (E73/E122) and `alpha/NAMING.md` (domain
  reconciliation) → updated in **Phase 6.1–6.2**.
- This repo's `README.md` → **Phase 1** (surface inventory row).
- Historical discovery artifacts (raw transcripts, RAW-ARTIFACTS-MANIFEST, COHESION
  entries, superseded NAMING sections) mention graze extensively — **deliberately NOT
  updated**: they are provenance records of the Graze era, not live references.
- No other live references found (grep covered `.claude/`, croft-pwa, croft; other
  workspace repos do not reference graze).

## Open Questions

Severities per the phase-plan convention (BLOCKING / PHASE-GATED / ADVISORY);
confirmation status tracked in the Pass 3 Review Log.

- **OQ1 [CONFIRMED 2026-08-23: PHASE-GATED, Phase 2]** DNS executor → **owner by hand**
  (paste-ready records in Phase 2).
- **OQ2 [CONFIRMED 2026-08-23: PHASE-GATED, Phase 5]** graze.ing disposition →
  **RETIRE DARK** (owner overrode the recommended redirect). Registration kept; lapse
  decision deferred to renewal. Phase 5 rewritten accordingly.
- **OQ3 [CONFIRMED 2026-08-23: ADVISORY]** Copy defaults → **accepted** (still
  overridable in PR review).
- **OQ4 [CONFIRMED 2026-08-23: PHASE-GATED, Phase 1]** `assets/rook_banner.png` →
  **optimize-then-commit**: web-ready derivative (≤~200KB) committed in Phase 1.2b,
  excluded from the SW precache; the 5.0MB original archived to discovery seeds in
  Phase 6.

## Out of scope (explicitly)
- `/f/` routing, any feature work, CI/workflows (read `CroftC/.claude/CI-PATTERN.md`
  before ever adding one), atproto handle wiring for forage.fyi, defensive-domain
  purchases (E122(a)), the real-product build.

## Risks & rollbacks
- **Dark window:** phases 2→3 out of order is the only way to take the site down; the
  order above prevents it. Rollback at any point before Phase 5: revert the CNAME commit
  and Pages cname to graze.ing (its DNS is untouched until Phase 5).
- **Repo-rename ripples:** GitHub redirects old URLs, but anything hardcoding
  `CroftCommunity/graze` (discovery docs do, historically) still reads correctly as
  history; only *live* references need updating (none found outside discovery indexes —
  Phase 6 covers those).
- **Stale SW:** if a visitor still sees Graze after cutover, confirm the SW picked up
  `forage-v3` (DevTools → Application → Service Workers → skipWaiting). The
  stale-while-revalidate asset strategy (#3) means one revisit refreshes.

## Review Log — Pass 2 (gap analysis, 2026-08-23)

Light Pass 2 per the `phase-plan` skill (Combined-with-Pass-1-context pattern; full
three-pass ceremony judged disproportionate for a mechanical rename — this log is the
gap-analysis record).

**Claims verified against the codebase:**
- Surface inventory re-derived by grep at `3c14ae5`: 41 refs across 13 files — matched,
  except one table gap, fixed: `data/seed.js` carries **2 copy strings** ("…the Graze
  team.", "Graze is in prototype…") beyond the 8 emails. Table row corrected.
- `sw.js` activate handler does delete non-current caches (the `forage-v3` bust works as
  claimed); assets are hashless + stale-while-revalidate, so the bump is belt-and-braces,
  not optional (the shell strings and theme key change).
- `index.html`'s inline theme read and `js/theme.js` share the `graze.theme` key — both
  are in the inventory; renaming one without the other would flash the wrong theme.
- CroftC meta-repo `.gitignore` uses ignore-everything-opt-in (`/*`), so the Phase 4
  local dir rename needs **no** meta-repo change (checked; earlier concern retired).

**External-fact claims verified (never-guess rule):**
- `gh repo rename <new-name> --repo OWNER/REPO --yes` — confirmed against `gh` help.
- Pages API object carries `cname` and `https_enforced` — confirmed via live GET; the
  PUT update shape stands.
- Repo rename with a custom domain: GitHub docs recommend a custom domain precisely so
  renames don't impact the site URL — Phase 4-after-Phase 3 ordering is safe.
- Porkbun ALIAS-at-apex ("ALIAS — CNAME flattening", blank host) confirmed; Porkbun URL
  forwarding **defaults to 302** (301 must be selected) and **conflicts with existing DNS
  records** — Phase 5 sharpened accordingly.
- GitHub Pages A/AAAA addresses are the long-documented stable set (185.199.108–111.153),
  and a live `dig graze.ing` (2026-08-23) confirmed graze.ing serves from exactly those
  four A records — the Phase 2 A-record option is the proven configuration.
- **Correction caught by this pass:** the Phase 2 ALIAS answer originally said
  `chasemp.github.io`; the repo is org-owned, so the Pages default domain is
  `croftcommunity.github.io`. Fixed in Phase 2 (both apex ALIAS and www CNAME), and the
  A-record option promoted to first position as the dig-verified path.

**Cross-phase dependency check:** Phase 3 hard-depends on Phase 2 (DNS before CNAME —
stated); Phase 5 must not run before Phase 3 verification (graze.ing keeps serving as
rollback until then — stated in Risks); Phase 4 is order-independent after Phase 3 but
kept after cutover so any rename-triggered Pages rebuild happens on an already-verified
config. No circular dependencies. Concurrency: all phases sequential by nature (single
site, single DNS zone) — no parallel sets to audit.

**Ship-alone coherence:** after Phase 1 alone the site still serves at graze.ing with
Forage branding (acceptable interim); after Phase 3 alone the repo is still named graze
(cosmetic only); after Phase 4 alone without Phase 5, graze.ing serves nothing after its
records are removed — which is why record removal lives in Phase 5 with the forward, not
earlier.

**Open items unchanged by review:** the two OWNER STEPs (Phase 2 DNS, Phase 5
disposition) and the copy defaults remain the only decision points.

### Pass 3: Quality Gates — 2026-08-23

**TDD ordering:** No test infrastructure exists and none is added (bounded rename of a
throwaway behavior mock; adding a harness would be scope creep). The TDD-analog applied
instead: Phase 1's manual verification was upgraded from vibes to concrete behavioral
pass criteria, including the **negative assertion** (no `graze.*` localStorage keys, no
`graze-v2` cache surviving activation) — the checks a missed surface would actually fail.
The wiring-test analog is intact: Phase 1 verifies through the served entry point (SW +
shell), Phase 3 through the live domain.

**Observability:** `?nosw` bypass documented in the Phase 1 criteria for SW debugging;
console.warn prefixes carry the new name (inventory row).

**Debugging readiness:** Phase 3.0 added — snapshot `pages-before.json` before mutation
(rollback artifact). Each phase already ends in a checkable state; Phase 4 and Phase 6
gained explicit Done-when criteria they lacked.

**Validation calibration:** Phase 3 (external integration) has end-to-end checks — right
weight. Phase 1 (internal rename) has grep + behavioral manual pass — right weight.
Phase 4/6 were under-specified — fixed. No Phase 0 discovery tasks exist (all unknowns
were resolved during planning passes).

**Concurrency honesty:** Concurrency Map added (was missing — template defect). All
sequential; one safe-parallel candidate flagged (Phase 1 ∥ Phase 2, disjoint write-sets),
left to the executing agent/user rather than restructured.

**Coherence:** Plan still solves the stated problem; no scope creep (assets/rook_banner
explicitly quarantined into OQ4 rather than absorbed). Baseline note updated for the
2026-08-23 re-verification and the new untracked file.

**Documentation impact:** Section added (was missing — template defect). Proactive grep
run: one live stale reference found (`CI-PATTERN.md` workspace table) and wired into
Phase 6.3; historical discovery artifacts deliberately excluded as provenance.

**Confirmed ready:** **YES** (2026-08-23). OQ1–OQ4 walked through with the owner
in-session: OQ1 owner-by-hand (as recommended), OQ2 **retire dark** (owner override of
the redirect recommendation — Phase 5 rewritten), OQ3 copy defaults accepted, OQ4
optimize-then-commit (as recommended — Phase 1.2b and Phase 6.3b added). No BLOCKING
items. PHASE-GATED items are owner steps inside their phases (2 and 5), not
preconditions to starting Phase 1.

## Execution log (2026-08-23 → 08-24) — plan EXECUTED, all phases complete

Executed by the planning session itself (owner present for OWNER STEPs). Outcome: the
site serves at **https://forage.fyi** (HTTPS enforced, cert covers apex + www),
**graze.ing retired dark**, repo renamed **CroftCommunity/forage**. PRs: #4 (Phase 1
rename), #5 (Phase 3 CNAME cut). Follow-on brand work (beyond this plan's scope) landed
as #6 (icon set / header glyph) and #7 (art integration + warmed palettes).

Deviations from plan, recorded honestly:

1. **The cert stalled twice, and the plan's DNS guidance was incomplete.** (a) The www
   record — "optional but recommended" — is effectively REQUIRED: GitHub provisions one
   cert covering apex + www, and its absence held issuance at "approved". (b) The
   arecipe.app mirror pattern (www CNAME → apex) that was then added fails GitHub's
   checker (`is_cname_to_github_user_domain: false`, reads as proxied) and looped the
   cert at "dns_changed" for hours. Fix: www CNAME → `croftcommunity.github.io`.
   Diagnostic that found it: `GET /repos/{o}/{r}/pages/health` (alt_domain block).
   Full detail: `docs/HOSTING.md`.
2. **The remove/re-add recovery, via API, deletes the whole Pages site** —
   `PUT {"cname":null}` 307'd (repo had been renamed mid-flight) and the fallback
   `DELETE /pages` removes the site, not just the domain. Recreating (POST + cname)
   worked and doubled as the clean provisioning reset. GitHub auto-commits
   Delete CNAME / Create CNAME to main when this happens.
3. **Phase 4 partially happened out of order**: the owner renamed the GitHub repo during
   the Phase 3 cert wait (harmless — custom domain made it URL-neutral, as Pass 2
   verified it would be).
4. **Local DNS verification was unreliable all session**: this machine's resolver is
   OpenDNS and intercepts new domains (146.112.x.x block-page IPs, fake redirects).
   All verification had to run against the authoritative NS (`@maceio.ns.porkbun.com`)
   or with `curl --resolve <domain>:443:185.199.108.153`.
5. **Phase 1.2b's asset kept growing**: two more owner art drops arrived mid-execution
   (wreath logo + icon JPEGs); both archived byte-identical to discovery
   `seeds/forage-brand/` alongside the banner original, per the same pattern.
6. **OQ2 executed as confirmed**: retire dark (records removed, no forward,
   registration kept).

Phase 6 close-out landed in discovery `3362e11` + meta-repo `4a46295` (E73 closed,
E122 stamped, NAMING executed-state, CI-PATTERN row, brand-art archive).
