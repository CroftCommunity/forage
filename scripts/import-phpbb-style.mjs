#!/usr/bin/env node
// Import a phpBB style as a Forage skin (Phase 4B, plan 2026-08-26-1).
//
//   npm run import-phpbb -- <path-to-style-dir-or-css> [--name <id>] [--out <file>]
//
// WHAT TRANSFERS, AND WHAT DOES NOT. A phpBB style ships four things and only
// one of them is portable:
//
//   colour-bearing CSS   YES  — stable selectors, plain values
//   fonts / radii        PART — extractable where declared
//   template/*.html      NO   — Forage's DOM is .card/.postrow/.masthead; a
//                              rule for `.forumbg .topiclist li.row` matches
//                              nothing here
//   theme/images sprites NO   — different icon system
//
// So an imported skin is faithful in PALETTE, TYPOGRAPHY and CHROME — never in
// LAYOUT. Forage keeps its own DOM and its own responsive grid. Say that
// plainly: "reuse phpBB themes" otherwise promises a pixel-identical forum that
// this cannot deliver.
//
// Three findings from Phase 0 (measured over prosilver, subsilver2,
// we_universal and freecad-dark) are built into the design:
//
//   0.1  Do NOT key off filenames. Only 1 of 4 real styles has a colours.css;
//        subsilver2 is one monolithic file, we_universal inlines colour across
//        four, freecad authors in SCSS. Resolve by SELECTOR across all CSS.
//   0.3  A missing role is often ABSENT BY DESIGN, not unfound — we_universal
//        sets `#wrap { background: none; border: 0 }` and truly has no content
//        surface. Hence declared fallback chains plus per-role provenance,
//        rather than a binary mapped/unmapped.
//   0.4  Roles must resolve as a COHERENT SET. Reading each independently can
//        splice a foreground from one file onto a background from another and
//        report a contrast that exists in no real theme (freecad-dark measured
//        1.19:1 that way, against its true 16.17:1).
//
// The output is subject to the same static scan as a hand-written skin
// (js/skins.js skinScan) — the tool gets no exemption.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

// ---------------------------------------------------------------------------
// The role vocabulary, as DATA. Candidate selectors run in dialect order:
// prosilver 3.x first, subsilver2 second, generic last. Adding a role or a
// dialect is a table edit, never a new branch.
// ---------------------------------------------------------------------------

export const ROLES = Object.freeze({
  'page-bg': [['body', 'background-color'], ['html', 'background-color'], ['#wrap', 'background-color']],
  'page-ink': [['body', 'color'], ['html', 'color']],
  surface: [['.wrap', 'background-color'], ['#page-body', 'background-color'], ['.forumline', 'background-color'], ['.bodyline', 'background-color']],
  border: [['.wrap', 'border-color'], ['.panel', 'border-color'], ['.forumline', 'border-color']],
  link: [['a', 'color'], ['a:link', 'color']],
  'link-hover': [['a:hover', 'color']],
  'band-fill': [['.headerbar', 'background-color'], ['.forumbg', 'background-color'], ['.forabg', 'background-color'], ['th', 'background-color'], ['.cat', 'background-color']],
  'band-ink': [['.headerbar', 'color'], ['th', 'color'], ['.cattitle', 'color']],
  'band-link': [['.forumbg .header a', 'color'], ['.forabg .header a', 'color'], ['th a', 'color']],
  'nav-fill': [['.navbar', 'background-color'], ['.nav', 'background-color']],
  panel: [['.panel', 'background-color'], ['.row3', 'background-color']],
  'row-odd': [['.bg1', 'background-color'], ['.row1', 'background-color']],
  'row-even': [['.bg2', 'background-color'], ['.row2', 'background-color']],
  'row-head': [['.bg3', 'background-color'], ['.row3', 'background-color']],
  'font-body': [['body', 'font-family'], ['html', 'font-family']],
});

// Roles that MUST come from one origin, because a contrast pair spliced across
// files is the Finding 0.4 defect. Each group names the selectors that carry
// them together.
const COHERENT = [
  { roles: ['page-bg', 'page-ink'], props: { 'page-bg': 'background-color', 'page-ink': 'color' } },
];

// Declared fallback chains. `@mix:a:b:t` blends, `@contrast:x` picks the more
// readable of white/near-black against x, `@keep` leaves Forage's own value.
export const FALLBACKS = Object.freeze({
  surface: ['page-bg'],
  border: ['row-head', '@mix:page-ink:page-bg:0.15'],
  'nav-fill': ['band-fill'],
  'band-ink': ['@contrast:band-fill'],
  'band-link': ['band-ink'],
  'row-even': ['row-odd'],
  'row-odd': ['surface', 'page-bg'],
  'row-head': ['row-even', 'row-odd'],
  panel: ['surface', 'page-bg'],
  'band-fill': ['page-bg'],
  'link-hover': ['link'],
  'font-body': ['@keep'],
});

// Role -> the Forage token it becomes. This is the whole mapping: the token
// vocabulary was named FOR these roles (Phase 2), so it is near-identity.
export const TOKEN_FOR = Object.freeze({
  'page-bg': '--bg',
  'page-ink': '--text',
  surface: '--card',
  border: '--border',
  link: '--link',
  'link-hover': '--link-hover',
  'band-fill': '--band-fill',
  'band-ink': '--band-ink',
  'band-link': '--band-link',
  'nav-fill': '--nav-fill',
  panel: '--panel',
  'row-odd': '--row-odd',
  'row-even': '--row-even',
  'row-head': '--row-head',
  'font-body': '--font-body',
});

// Pairs the AA gate grades. Everything at 4.5 — the band INCLUDED. Finding 0.5
// graded bands at 3.0 (WCAG's large-text floor) because prosilver's own band
// measures 3.41 and 3.70 under white; but forage's masthead paints its nav
// links at 14px normal weight, which is body text to WCAG and to axe, and CI's
// per-skin axe pass refused a hand-authored skin at exactly prosilver's
// #4688CE (2026-08-30, plan warm-skins decision 7). A gate that admits what
// the surface then refuses is the miscalibration. Consequence, deliberate:
// importing prosilver verbatim exits non-zero on the band unless
// --allow-contrast-failures — the finding skins/phpbb.css and cornflower.css
// each answered by hand with #3A78BC. Exported so the test can pin the floors.
export const GATE_PAIRS = [
  ['page-ink', 'page-bg', 'body text', 4.5],
  ['page-ink', 'row-odd', 'text on odd rows', 4.5],
  ['page-ink', 'row-even', 'text on even rows', 4.5],
  ['link', 'surface', 'link on surface', 4.5],
  ['link-hover', 'surface', 'link hover on surface', 4.5],
  ['band-ink', 'band-fill', 'band text (14px nav links sit on it)', 4.5],
  ['band-link', 'band-fill', 'band link (14px)', 4.5],
];

// ---------------------------------------------------------------------------
// A small CSS reader. Not a full parser — enough to walk rule blocks and keep
// declarations, tracking which file each came from.
// ---------------------------------------------------------------------------

export function readRules(css, origin = '?') {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let depth = 0, buf = '', selector = '';
  for (const c of clean) {
    if (c === '{') {
      if (depth === 0) { selector = buf.trim(); buf = ''; } else buf += c;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        if (selector.startsWith('@')) {
          for (const r of readRules(buf, origin)) rules.push({ ...r, inAt: true });
        } else {
          rules.push({ selector, body: buf, origin, inAt: false });
        }
        buf = ''; selector = '';
      } else buf += c;
    } else buf += c;
  }
  return rules;
}

const strip = (v) => String(v).replace(/!important/gi, '').trim();
const isBlank = (v) => /^(none|transparent|0|inherit|initial|unset)$/i.test(strip(v));

function declsOf(rule) {
  const out = new Map();
  for (const d of rule.body.split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    out.set(d.slice(0, i).trim().toLowerCase(), strip(d.slice(i + 1)));
  }
  // `background: #fff url(...)` also carries a colour.
  const bg = out.get('background');
  if (bg && !out.has('background-color')) {
    const m = bg.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i);
    if (m) out.set('background-color', m[0]);
  }
  const bd = out.get('border');
  if (bd && !out.has('border-color')) {
    const m = bd.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i);
    if (m) out.set('border-color', m[0]);
  }
  return out;
}

const matches = (rule, sel) =>
  rule.selector.split(',').map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
    .includes(sel.replace(/\s+/g, ' ').trim().toLowerCase());

// Last base-level declaration wins; at-rule content only if nothing else did.
function lastHit(rules, sel, prop) {
  const hits = [];
  for (const r of rules) {
    if (!matches(r, sel)) continue;
    const v = declsOf(r).get(prop);
    if (v === undefined || isBlank(v)) continue;
    if (prop !== 'font-family' && !toRgb(v)) continue;
    hits.push({ value: v, origin: r.origin, inAt: r.inAt, via: `${sel} { ${prop} }` });
  }
  const base = hits.filter((h) => !h.inAt);
  return (base.length ? base : hits).at(-1) ?? null;
}

// ---------------------------------------------------------------------------
// Colour maths (WCAG)
// ---------------------------------------------------------------------------

export function toRgb(v) {
  const s = strip(v).toLowerCase();
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = s.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return Number.isFinite(p[0]) ? [p[0], p[1], p[2]] : null;
  }
  if (s === 'white') return [255, 255, 255];
  if (s === 'black') return [0, 0, 0];
  return null;
}

const lum = (rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a, b) {
  const ra = toRgb(a), rb = toRgb(b);
  if (!ra || !rb) return null;
  const [hi, lo] = [lum(ra), lum(rb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a, b, t) => {
  const ra = toRgb(a), rb = toRgb(b);
  if (!ra || !rb) return null;
  return `#${ra.map((c, i) => Math.round(c * t + rb[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
};

const pickInk = (fill) => {
  const w = contrast('#ffffff', fill), k = contrast('#1a1a1a', fill);
  if (w == null || k == null) return null;
  return w >= k ? '#ffffff' : '#1a1a1a';
};

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export function resolveRoles(sources) {
  const rules = sources.flatMap((s) => readRules(s.css, s.name));
  const roles = {};
  const warnings = [];

  // 1. Coherent groups first (Finding 0.4): take the LAST rule that carries the
  //    whole group, so a pair can never be spliced across files.
  for (const group of COHERENT) {
    let winner = null;
    for (const [sel] of ROLES[group.roles[0]]) {
      for (const r of rules) {
        if (!matches(r, sel)) continue;
        const d = declsOf(r);
        const complete = group.roles.every((role) => {
          const v = d.get(group.props[role]);
          return v !== undefined && !isBlank(v) && toRgb(v);
        });
        if (complete) winner = { rule: r, sel };
      }
      if (winner) break;
    }
    if (!winner) continue;
    const d = declsOf(winner.rule);
    for (const role of group.roles) {
      roles[role] = {
        value: d.get(group.props[role]),
        via: `${winner.sel} { ${group.props[role]} }`,
        origin: winner.rule.origin,
        how: 'direct',
      };
    }
    // Report any LATER declaration we deliberately discarded to stay coherent.
    for (const role of group.roles) {
      const solo = lastHit(rules, winner.sel, group.props[role]);
      if (solo && solo.origin !== winner.rule.origin) {
        warnings.push(
          `${role}: ignored a later '${group.props[role]}' from ${solo.origin} (${solo.value}) — ` +
          `kept ${roles[role].value} from ${winner.rule.origin} so the pair stays coherent`);
      }
    }
  }

  // 2. Everything else, independently.
  for (const [role, candidates] of Object.entries(ROLES)) {
    if (roles[role]) continue;
    roles[role] = { value: null, via: null, origin: null, how: 'absent' };
    for (const [sel, prop] of candidates) {
      const hit = lastHit(rules, sel, prop);
      if (!hit) continue;
      roles[role] = { value: hit.value, via: hit.via, origin: hit.origin, how: 'direct' };
      break;
    }
  }

  // 3. Declared fallback chains for what is genuinely absent (Finding 0.3).
  for (const [role, chain] of Object.entries(FALLBACKS)) {
    if (roles[role]?.how !== 'absent') continue;
    for (const step of chain) {
      if (step === '@keep') {
        roles[role] = { value: null, via: 'kept Forage default', origin: null, how: 'derived' };
        break;
      }
      if (step.startsWith('@contrast:')) {
        const src = roles[step.slice(10)];
        const ink = src?.value ? pickInk(src.value) : null;
        if (ink) { roles[role] = { value: ink, via: `contrast-picked against ${step.slice(10)}`, origin: null, how: 'derived' }; break; }
      } else if (step.startsWith('@mix:')) {
        const [, a, b, t] = step.split(':');
        const v = (roles[a]?.value && roles[b]?.value) ? mix(roles[a].value, roles[b].value, Number(t)) : null;
        if (v) { roles[role] = { value: v, via: `mix(${a} ${Number(t) * 100}%, ${b})`, origin: null, how: 'derived' }; break; }
      } else if (roles[step]?.value) {
        roles[role] = { value: roles[step].value, via: `follows ${step}`, origin: roles[step].origin, how: 'derived' };
        break;
      }
    }
  }

  // 4. Fail loudly if the theme yielded nothing usable. A skin emitted with
  //    silent holes is worse than a refusal with words.
  const stillAbsent = Object.keys(ROLES).filter((r) => roles[r].how === 'absent');
  if (!roles['page-bg']?.value || !roles['page-ink']?.value) {
    throw new Error(
      `no palette found: page-bg and page-ink are required and could not be resolved. ` +
      `Absent roles: ${stillAbsent.join(', ') || 'none'}. ` +
      `Looked for ${ROLES['page-bg'].map(([s, p]) => `${s}{${p}}`).join(', ')}.`);
  }
  return { roles, warnings, absent: stillAbsent };
}

// ---------------------------------------------------------------------------
// The AA gate. Survives the theme/skin collapse: it no longer has to bless a
// SYNTHESISED dark palette (one skin, one palette), but it still grades each
// imported palette on its own terms — which is how Finding 0.4 was caught.
// ---------------------------------------------------------------------------

export function gate(roles, pairs = GATE_PAIRS) {
  const results = [];
  for (const [fg, bg, label, min] of pairs) {
    const a = roles[fg]?.value, b = roles[bg]?.value;
    const ratio = (a && b) ? contrast(a, b) : null;
    results.push({ label, fg, bg, ratio, min, ok: ratio == null ? true : ratio >= min });
  }
  return { ok: results.every((r) => r.ok), pairs: results };
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

export function emit({ roles, meta = {}, warnings = [] }) {
  const g = gate(roles);
  const derived = Object.entries(roles).filter(([, r]) => r.how === 'derived');
  const absent = Object.entries(roles).filter(([, r]) => r.how === 'absent');

  const lines = [];
  lines.push(`/* ${meta.name ?? 'imported'} — generated from a phpBB style by`);
  lines.push('   scripts/import-phpbb-style.mjs. Do not hand-edit: re-import instead,');
  lines.push('   or copy it to a new name and own it.');
  lines.push('');
  lines.push(`   Source:  ${meta.source ?? 'unknown'}`);
  if (meta.version) lines.push(`   Version: ${meta.version}`);
  lines.push(`   Licence: ${meta.licence ?? 'UNSTATED — check before redistributing'}`);
  lines.push('');
  lines.push('   WHAT THIS IS FAITHFUL TO: palette, typography, and chrome.');
  lines.push('   WHAT IT IS NOT: layout. Forage keeps its own DOM and responsive');
  lines.push('   grid — a phpBB template targets markup that does not exist here,');
  lines.push('   so this reads as the theme\'s COLOURS on Forage\'s structure.');
  lines.push('');
  lines.push('   Provenance per role:');
  for (const [role, r] of Object.entries(roles)) {
    const mark = r.how === 'direct' ? 'direct ' : r.how === 'derived' ? 'derived' : 'ABSENT ';
    lines.push(`     ${mark} ${role.padEnd(11)} ${r.value ?? '(Forage default)'}${r.via ? `   <- ${r.via}` : ''}`);
  }
  if (derived.length) {
    lines.push('');
    lines.push(`   ${derived.length} role(s) were DERIVED through a declared fallback chain,`);
    lines.push('   not read from the theme. That is usually correct — a theme may');
    lines.push('   genuinely have no content surface or nav strip — but it is stated');
    lines.push('   here rather than hidden.');
  }
  if (absent.length) {
    lines.push('');
    lines.push(`   ${absent.length} role(s) could NOT be resolved: ${absent.map(([k]) => k).join(', ')}.`);
  }
  lines.push('');
  lines.push('   Contrast gate:');
  for (const p of g.pairs) {
    lines.push(`     ${p.ratio == null ? '  n/a' : p.ratio.toFixed(2).padStart(5)} >= ${p.min}  ${p.label}${p.ok ? '' : '   FAILS'}`);
  }
  for (const w of warnings) lines.push(`   ! ${w}`);
  lines.push('*/');
  lines.push('');
  lines.push(':root {');
  for (const [role, token] of Object.entries(TOKEN_FOR)) {
    const r = roles[role];
    if (!r?.value) continue;
    lines.push(`  ${token}: ${r.value};`);
  }
  // A palette implies its native chrome; without this a dark import keeps light
  // scrollbars and form controls.
  const ink = roles['page-ink']?.value, bg = roles['page-bg']?.value;
  if (ink && bg) {
    const dark = toRgb(bg) && lum(toRgb(bg)) < 0.5;
    lines.push(`  --color-scheme: ${dark ? 'dark' : 'light'};`);
  }
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function collectCss(target) {
  const st = statSync(target);
  if (!st.isDirectory()) return [{ name: basename(target), css: readFileSync(target, 'utf8') }];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) { walk(p); continue; }
      if (extname(p).toLowerCase() !== '.css') continue;
      out.push({ name: p.slice(target.length + 1), css: readFileSync(p, 'utf8') });
    }
  };
  walk(target);
  // Read colour layers LAST so they win the cascade, mirroring prosilver's own
  // import order (colours.css is #12 of 14). Everything else keeps disk order.
  out.sort((a, b) => Number(/colours?\.css$/i.test(a.name)) - Number(/colours?\.css$/i.test(b.name)));
  return out;
}

function readStyleCfg(dir) {
  try {
    const cfg = readFileSync(join(dir, 'style.cfg'), 'utf8');
    const get = (k) => cfg.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm'))?.[1]?.trim();
    return { name: get('name'), version: get('style_version') };
  } catch { /* 4.0 dev styles carry composer.json instead; not required */ }
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'composer.json'), 'utf8'));
    return { name: pkg.name, version: pkg.version };
  } catch { return {}; }
}

export function main(argv) {
  const args = argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  const flag = (n) => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
  if (!target) {
    console.error('usage: import-phpbb-style <style-dir-or-css> [--name id] [--out file] [--licence L] [--allow-contrast-failures]');
    return 2;
  }
  const isDir = statSync(target).isDirectory();
  const cfg = isDir ? readStyleCfg(target) : {};
  const name = flag('name') ?? cfg.name ?? basename(target, '.css');
  const sources = collectCss(target);
  const { roles, warnings, absent } = resolveRoles(sources);
  const g = gate(roles);
  const css = emit({
    roles, warnings,
    meta: { name, source: target, version: cfg.version, licence: flag('licence') },
  });

  const out = flag('out') ?? `skins/${name}.css`;
  writeFileSync(out, css);

  const counts = Object.values(roles).reduce((a, r) => ({ ...a, [r.how]: (a[r.how] ?? 0) + 1 }), {});
  console.log(`${out}: ${counts.direct ?? 0} direct, ${counts.derived ?? 0} derived, ${counts.absent ?? 0} absent`);
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const p of g.pairs.filter((x) => !x.ok)) {
    console.log(`  CONTRAST FAIL  ${p.label}: ${p.ratio?.toFixed(2)} < ${p.min}`);
  }

  // Exit codes are part of the contract. A warning printed beside exit 0 is the
  // CLI shape of a silent fallback: it gets scripted wrong.
  if (absent.length) {
    console.error(`refusing: ${absent.length} role(s) unresolved — ${absent.join(', ')}`);
    return 1;
  }
  if (!g.ok && !args.includes('--allow-contrast-failures')) {
    console.error('refusing: the palette fails the contrast gate. ' +
      'Re-run with --allow-contrast-failures to emit it anyway, knowingly.');
    return 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv));
