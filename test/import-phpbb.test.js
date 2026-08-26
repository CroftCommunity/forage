// Phase 4B (plan 2026-08-26-1) — the phpBB style importer.
//
// The importer turns a real phpBB style into a Forage skin. It is faithful in
// PALETTE, TYPOGRAPHY and CHROME — never in layout, because Forage keeps its
// own DOM. Everything asserted here follows from Phase 0's measurements over
// four real styles; the fixtures are the two GPL ones (see
// test/fixtures/phpbb-themes/PROVENANCE.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLES, TOKEN_FOR, readRules, resolveRoles, gate, emit, contrast,
} from '../scripts/import-phpbb-style.mjs';
import { skinScan, declaredTokens } from '../js/skins.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (p) => readFileSync(join(root, 'test/fixtures/phpbb-themes', p), 'utf8');

const prosilver = () => [
  { name: 'colours.css', css: fixture('prosilver/colours.css') },
  { name: 'common.css', css: fixture('prosilver/common.css') },
];
const subsilver2 = () => [
  { name: 'stylesheet.css', css: fixture('subsilver2/stylesheet.css') },
];

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

test('4B: prosilver resolves to its own documented values', () => {
  const { roles } = resolveRoles(prosilver());
  assert.equal(roles['page-bg'].value, '#f5f5f5');
  assert.equal(roles['page-ink'].value, '#47536b');
  assert.equal(roles.link.value, '#0f4d8a');
  assert.equal(roles['link-hover'].value, '#d41142');
  assert.equal(roles['band-fill'].value, '#4688ce');
  assert.equal(roles['row-odd'].value, '#edf4f7');
  assert.equal(roles['row-even'].value, '#dbe9f0');
  assert.equal(roles['nav-fill'].value, '#c9dee8');
});

test('4B: subsilver2 resolves BY SELECTOR, though it has no colours.css at all', () => {
  // The case that kills a filename-based importer: the whole theme is one file.
  const { roles } = resolveRoles(subsilver2());
  assert.equal(roles.link.value, '#006597');
  assert.equal(roles['link-hover'].value, '#D46400');
  assert.equal(roles['band-fill'].value, '#006699');
  assert.equal(roles['row-odd'].value, '#ECECEC');
  assert.equal(roles['row-even'].value, '#DCE1E5');
  assert.match(roles['font-body'].value, /Lucida Grande/);
});

test('4B: every role reports HOW it was resolved — direct, derived, or absent', () => {
  const { roles } = resolveRoles(subsilver2());
  for (const name of Object.keys(ROLES)) {
    assert.ok(['direct', 'derived', 'absent'].includes(roles[name].how),
      `${name} must carry provenance, got ${JSON.stringify(roles[name]?.how)}`);
  }
  // subsilver2 genuinely has no content surface or nav fill: those are DERIVED
  // through a declared chain, not silently invented and not reported as direct.
  assert.equal(roles.surface.how, 'derived');
  assert.equal(roles['nav-fill'].how, 'derived');
  assert.ok(roles.surface.via.length > 0, 'a derived role says what it was derived from');
  assert.equal(roles.link.how, 'direct');
});

test('4B: a theme that explicitly says "no surface" is not read as a hit', () => {
  // we_universal sets #wrap { background: none; border: 0 } — it HAS no content
  // surface. `none`/`transparent`/`0` must not be mistaken for a colour.
  const { roles } = resolveRoles([
    { name: 'a.css', css: 'body{background-color:#fff;color:#111}#wrap{background:none;border:0}a{color:#00f}a:hover{color:#f00}' },
  ]);
  assert.equal(roles.surface.how, 'derived', 'an explicit none falls through to the chain');
});

// ---------------------------------------------------------------------------
// Coherence — Phase 0, Finding 0.4
// ---------------------------------------------------------------------------

test('4B: paired roles resolve from the SAME origin, never spliced across files', () => {
  // This is the freecad-dark defect, reduced to a fixture: a site-wide layer
  // sets body{color} while the forum layer sets body{background-color}. Reading
  // each role independently pairs an ink and a ground that never co-occur and
  // reports a contrast that exists in no real theme (1.19:1 vs a true 16.17:1).
  const { roles, warnings } = resolveRoles([
    { name: 'forum.css', css: 'html,body{color:#141414;background-color:#f0f0f0}' },
    { name: 'site.css', css: 'body{color:#dddddd;background:transparent}' },
  ]);
  assert.equal(roles['page-ink'].origin, roles['page-bg'].origin,
    'ink and ground must come from one origin');
  assert.equal(roles['page-ink'].value, '#141414');
  assert.equal(roles['page-bg'].value, '#f0f0f0');
  assert.ok(contrast(roles['page-ink'].value, roles['page-bg'].value) > 10,
    'the coherent pair is the readable one');
  assert.ok(warnings.some((w) => /site\.css/.test(w)),
    'the discarded later declaration is REPORTED, not silently dropped');
});

// ---------------------------------------------------------------------------
// The AA gate — boundaries, because thresholds are where mutations hide
// ---------------------------------------------------------------------------

test('4B: the gate thresholds hold at the boundary, in both directions', () => {
  // Exact straddling greys against white (integer sRGB — see below):
  //   #767676 = 4.5422  admit at 4.5      #777777 = 4.4781  refuse at 4.5
  //   #949494 = 3.0335  admit at 3.0      #959595 = 2.9953  refuse at 3.0
  const g = (fg, min) => gate({ a: { value: fg }, b: { value: '#ffffff' } }, [['a', 'b', 'p', min]]).ok;

  assert.equal(g('#767676', 4.5), true, '4.5422 clears the body threshold');
  assert.equal(g('#777777', 4.5), false, '4.4781 does not');
  assert.equal(g('#949494', 3.0), true, '3.0335 clears the large/UI threshold');
  assert.equal(g('#959595', 3.0), false, '2.9953 does not');

  // NOTE on a mutation that cannot be killed here: `>=` -> `>` differs only at
  // EXACT equality, and no integer sRGB pair lands exactly on 4.5 or 3.0. It is
  // an equivalent mutant for colour inputs, recorded rather than papered over.
});

test('4B: band text is graded at 3.0, not 4.5 — the calibration Finding 0.5 fixed', () => {
  // A ratio between the two thresholds must PASS as band chrome and FAIL as
  // body text. Grading bands at 4.5 refuses prosilver's own shipping values
  // (measured 3.41 and 3.70 in Phase 0) — a miscalibrated gate, not a finding.
  const between = '#8a8a8a'; // ~3.5:1 on white
  const ratio = contrast(between, '#ffffff');
  assert.ok(ratio > 3.0 && ratio < 4.5, `fixture must sit between thresholds, got ${ratio.toFixed(2)}`);

  assert.equal(gate({ a: { value: between }, b: { value: '#ffffff' } },
    [['a', 'b', 'band (large/UI)', 3.0]]).ok, true, 'passes as band chrome');
  assert.equal(gate({ a: { value: between }, b: { value: '#ffffff' } },
    [['a', 'b', 'body text', 4.5]]).ok, false, 'and fails as body text');
});

test('4B: prosilver passes its own gate at the right thresholds', () => {
  const { roles } = resolveRoles(prosilver());
  const g = gate(roles);
  assert.equal(g.ok, true, `prosilver should pass: ${JSON.stringify(g.pairs.filter((p) => !p.ok))}`);
});

// ---------------------------------------------------------------------------
// Emission — the output is subject to the same gate as a hand-written skin
// ---------------------------------------------------------------------------

test('4B WIRING: an emitted skin passes the REAL skinScan', () => {
  // The tool's product gets no exemption: it must satisfy the same static scan
  // that every hand-written skin does, against the real tokens.css.
  const { roles } = resolveRoles(prosilver());
  const css = emit({ roles, meta: { name: 'prosilver', source: 'fixture', licence: 'GPL-2.0' } });
  const tokens = declaredTokens(readFileSync(join(root, 'css/tokens.css'), 'utf8'));
  const scan = skinScan(css, tokens);
  assert.deepEqual(scan.violations, [], 'a generated skin must be token-only like any other');
});

test('4B: the emitted file carries its own provenance, including what did NOT map', () => {
  const { roles } = resolveRoles(subsilver2());
  const css = emit({ roles, meta: { name: 'subsilver2', source: 'phpbb/phpbb 3.0.x', licence: 'GPL-2.0' } });
  assert.match(css, /subsilver2/);
  assert.match(css, /GPL-2\.0/);
  assert.match(css, /derived/i, 'roles resolved through a fallback chain are named in the header');
  assert.match(css, /layout/i, 'the file states the boundary: palette and chrome, never layout');
});

test('4B: every role maps to a token that tokens.css actually declares', () => {
  const tokens = declaredTokens(readFileSync(join(root, 'css/tokens.css'), 'utf8'));
  for (const [role, token] of Object.entries(TOKEN_FOR)) {
    assert.ok(tokens.has(token), `role ${role} maps to ${token}, which is not declared`);
  }
});

// ---------------------------------------------------------------------------
// Failing loudly
// ---------------------------------------------------------------------------

test('4B: a stylesheet with no recognisable roles fails loudly, naming them', () => {
  assert.throws(() => resolveRoles([{ name: 'empty.css', css: '/* nothing */' }]), (e) => {
    assert.match(e.message, /page-bg/);
    return true;
  });
});

test('4B: readRules survives @media nesting rather than mis-parsing it', () => {
  const rules = readRules('@media (max-width:5px){a{color:#111}}b{color:#222}', 'x.css');
  assert.equal(rules.filter((r) => r.selector === 'b').length, 1);
  assert.equal(rules.find((r) => r.selector === 'a').inAt, true, 'at-rule content is marked, not lost');
});
