# Hosting, domain & brand ops — forage.fyi

date: 2026-08-24 (as-built after the graze→forage cutover;
provenance: `plans/2026-08-21-1-plan-rename-graze-to-forage.md` + its Execution log)

## Serving model

GitHub Pages, **legacy build from `main` @ `/`** — every merge to `main` deploys.
No CI, no build step (static ES modules). The `CNAME` file at the repo root is the
custom-domain source of truth (`forage.fyi`); GitHub auto-commits changes to it when
the domain is edited via the Pages API/UI.

- Custom domain: **forage.fyi**, HTTPS enforced (http and www 301 to the https apex).
- Certificate: Let's Encrypt via GitHub, covers **apex + www**, auto-renews.
- Config check: `gh api repos/CroftCommunity/forage/pages`
- DNS diagnosis: `gh api repos/CroftCommunity/forage/pages/health` — the `alt_domain`
  block is the www verdict. This endpoint is what finally explains a stuck cert.

## Domain (Porkbun)

**forage.fyi** — purchased 2026-08-21, **premium tier**: ~$16.90/yr renewal in
perpetuity (never drops to base .fyi pricing). **Keep auto-renew on** — lapsed premium
dictionary words are drop-caught within hours. Registrar DNS (Porkbun, Cloudflare-backed
nameservers):

| Type | Host | Answer |
|---|---|---|
| A ×4 | apex | `185.199.108.153` `.109.153` `.110.153` `.111.153` |
| AAAA ×4 | apex | `2606:50c0:8000::153` … `:8003::153` |
| CNAME | `www` | `croftcommunity.github.io` |

## The two cert lessons (hard-won 2026-08-23/24 — do not re-learn)

1. **The `www` record is required, not optional.** GitHub provisions ONE cert covering
   apex + www. With no `www` record, issuance sticks at `approved` forever and the
   Pages UI shows `InvalidDNSError` for www.
2. **`www` must CNAME to `croftcommunity.github.io` — never to the apex.** The
   www→apex mirror (used by arecipe.app) serves fine but fails GitHub's checker
   (`is_cname_to_github_user_domain: false`, detected as "proxied"), which loops the
   cert at `dns_changed` indefinitely and silently disables `https_enforced`.
   (arecipe.app likely has this latent issue today.)

Recovery for a genuinely stuck cert: remove and re-add the custom domain. Via API,
`PUT {"cname": null}` may not work — `DELETE /repos/.../pages` removes the WHOLE Pages
site; recreate with `POST /pages {"source":{"branch":"main","path":"/"}}` then
`PUT -f cname=forage.fyi`. This is safe (the site rebuilds from main) and doubles as a
clean provisioning reset.

**Verifying DNS from a dev machine:** beware interfering resolvers (OpenDNS intercepts
new domains with 146.112.x.x block pages). Trust only the authoritative NS
(`dig @maceio.ns.porkbun.com …`) or a pinned-IP probe
(`curl --resolve forage.fyi:443:185.199.108.153 https://forage.fyi`).

## graze.ing (the predecessor domain)

**Retired dark 2026-08-24** (owner decision, no redirect): all DNS records removed,
registration kept. Renew-or-lapse is an open owner decision at renewal time
(discovery ROADMAP_TODO E122). Do not point anything at it.

## Service worker & deploys

Assets are hashless; the SW (`sw.js`) serves the shell stale-while-revalidate, so a
normal deploy is picked up on the visitor's next load. **Bump `CACHE`**
(`forage-vN`) whenever you need a forced clean re-cache on first load — shell
changes, icon/manifest changes, anything a returning visitor must see immediately.

## Brand assets

- In-repo, web-ready: `icons/` (favicon-32, 192/512, maskable-512 with real paper
  margins, apple-touch-180), `assets/logo-wordmark.jpg` (hero), `assets/banner-forum.jpg`
  (About page + og:image), `assets/rook_banner_web.jpg` (spare wide banner).
- **Originals** (5MB/2.9MB/2.2MB, byte-verified): discovery repo,
  `alpha/seeds/forage-brand/` — never re-add them here.
- Palette: warmed toward the illustration in the 2026-08 brand pass — tokens and the
  AA-validated pairs live in `css/tokens.css` (both dark selectors must stay in sync).
- Social card: og/twitter meta in `index.html`, absolute URLs required.
