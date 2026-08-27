// 4a: the skin mechanism (plan 2026-08-25-1). A skin is a token-sheet swap —
// a stylesheet that may ONLY assign custom properties DECLARED in
// css/tokens.css. The static scan is the teeth: skins cannot smuggle
// component rewrites. Skins and modes are independent axes (user 2026-08-25).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKINS, hrefFor, skinScan, declaredTokens, SKIN_KEY } from '../js/skins.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the registry: default is the no-op; every entry carries a label; files exist', () => {
  assert.ok(SKINS.default, 'default skin exists');
  assert.equal(SKINS.default.file, null, 'default = no stylesheet = todays look, zero behavior change');
  for (const [id, s] of Object.entries(SKINS)) {
    assert.ok(s.label, `${id} has a label`);
    if (s.file) readFileSync(join(root, s.file)); // throws if missing
  }
});

test('hrefFor: default → null (no link element); others → their file', () => {
  assert.equal(hrefFor('default'), null);
  assert.throws(() => hrefFor('neon-dreams'), (e) => {
    assert.match(e.message, /neon-dreams/);
    assert.match(e.message, /default/);
    return true;
  });
});

test('the skin preference key is its own device-local key, never forage.state', () => {
  assert.equal(SKIN_KEY, 'forage.skin');
});

test('declaredTokens parses the real token sheet (fonts and radii included)', () => {
  const tokens = declaredTokens(readFileSync(join(root, 'css/tokens.css'), 'utf8'));
  assert.ok(tokens.has('--bg'));
  assert.ok(tokens.has('--font-body'));
  assert.ok(tokens.has('--radius-card'));
  assert.ok(tokens.size > 50);
});

test('skinScan passes a well-behaved token-only skin', () => {
  const tokens = new Set(['--bg', '--text', '--font-body']);
  const r = skinScan(`/* era palette */
:root { --bg: #000; --text: #3f3; --font-body: ui-monospace, monospace; }
:root[data-theme="light"] { --bg: #111; }`, tokens);
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test('skinScan BITES: a component rule and an undeclared token both turn it red', () => {
  const tokens = new Set(['--bg']);
  const bad = skinScan(`:root { --bg: #000; } .card { display: none; }`, tokens);
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.some((v) => v.includes('display')), 'the smuggled component rule is named');
  const undeclared = skinScan(`:root { --sneaky-new-token: red; }`, new Set(['--bg']));
  assert.equal(undeclared.ok, false);
  assert.ok(undeclared.violations.some((v) => v.includes('--sneaky-new-token')));
});

test('every REGISTERED skin file passes the scan against the real tokens', () => {
  const tokens = declaredTokens(readFileSync(join(root, 'css/tokens.css'), 'utf8'));
  for (const [id, s] of Object.entries(SKINS)) {
    if (!s.file) continue;
    const r = skinScan(readFileSync(join(root, s.file), 'utf8'), tokens);
    assert.deepEqual(r.violations, [], `${id} must only assign declared tokens`);
  }
});

// ---------------------------------------------------------------------------
// Phase 1A (plan 2026-08-26-1) — skins subsume themes.
// One skin carries ONE palette. Light/dark stop being a second axis and become
// registry entries; the upper-right toggle swaps to a declared SIBLING and is
// disabled where none exists. These tests pin the registry metadata and the
// resolution order (stored -> transient -> OS preference) before any UI moves.
// ---------------------------------------------------------------------------

import { siblingOf, validatePairing, resolveDefault, prefersDark,
         activeSkin, setTransient, clearTransient } from '../js/skins.js';

test('1A: every registered skin declares which palette it IS', () => {
  for (const [id, s] of Object.entries(SKINS)) {
    assert.ok(['light', 'dark'].includes(s.palette),
      `${id} must declare palette light|dark (got ${JSON.stringify(s.palette)})`);
  }
});

test('1A: no sibling is LEGAL and reports as null — that is what disables the toggle', () => {
  const reg = { solo: { label: 'Solo', file: null, palette: 'light' } };
  assert.equal(siblingOf('solo', reg), null,
    'a single-palette skin reports no sibling rather than throwing');
});

test('1A: a declared sibling resolves in both directions', () => {
  const reg = {
    day:   { label: 'Day',   file: null,            palette: 'light', pairedWith: 'night' },
    night: { label: 'Night', file: 'skins/n.css',   palette: 'dark',  pairedWith: 'day' },
  };
  assert.equal(siblingOf('day', reg), 'night');
  assert.equal(siblingOf('night', reg), 'day');
});

test('1A: siblingOf names the skin it does not know, like hrefFor does', () => {
  assert.throws(() => siblingOf('neon-dreams', SKINS), (e) => {
    assert.match(e.message, /neon-dreams/);
    return true;
  });
});

test('1A: pairing must be SYMMETRIC — a one-sided pair fails loudly, naming both ids', () => {
  const oneSided = {
    day:   { label: 'Day',   file: null,          palette: 'light', pairedWith: 'night' },
    night: { label: 'Night', file: 'skins/n.css', palette: 'dark' }, // does not point back
  };
  assert.throws(() => validatePairing(oneSided), (e) => {
    assert.match(e.message, /day/);
    assert.match(e.message, /night/);
    return true;
  });
});

test('1A: a dangling pairedWith fails loudly, naming the missing id', () => {
  const dangling = {
    day: { label: 'Day', file: null, palette: 'light', pairedWith: 'nonesuch' },
  };
  assert.throws(() => validatePairing(dangling), (e) => {
    assert.match(e.message, /nonesuch/);
    assert.match(e.message, /day/);
    return true;
  });
});

test('1A: a skin may not be its own sibling, and SAYS so — not "same palette"', () => {
  const selfPaired = {
    day: { label: 'Day', file: null, palette: 'light', pairedWith: 'day' },
  };
  // A self-pair trivially shares its own palette, so the same-palette guard
  // would also throw here. Assert the DISTINGUISHING words, or this test passes
  // whether or not the self-pair check exists (found by mutation, 2026-08-26).
  assert.throws(() => validatePairing(selfPaired), (e) => {
    assert.match(e.message, /day/);
    assert.match(e.message, /itself/, 'the self-pair guard must be the one that fires');
    return true;
  });
});

test('1A: siblings must differ in palette — pairing two lights is a mistake', () => {
  const sameTone = {
    a: { label: 'A', file: null,          palette: 'light', pairedWith: 'b' },
    b: { label: 'B', file: 'skins/b.css', palette: 'light', pairedWith: 'a' },
  };
  assert.throws(() => validatePairing(sameTone), (e) => {
    assert.match(e.message, /palette/);
    return true;
  });
});

test('1A: the REAL registry passes pairing validation', () => {
  validatePairing(SKINS); // throws on any asymmetry, dangle, self-pair, or same-tone pair
});

test('1A: OS preference picks the default palette via the default skin\'s sibling', () => {
  // The MECHANISM, tested against fixtures so it stays true whatever the real
  // registry holds. (Until Phase 1C registered forage-dark, this also asserted
  // that the real registry's dark branch fell back to `default`; 1C changed
  // that by design, and test 1C covers the live registry now.)
  const noSibling = { default: { label: 'D', file: null, palette: 'light' } };
  assert.equal(resolveDefault(false, noSibling), 'default', 'light OS -> default');
  assert.equal(resolveDefault(true, noSibling), 'default',
    'dark OS with no sibling -> falls back to default rather than throwing');

  const withDark = {
    default:      { label: 'Forage', file: null,                    palette: 'light', pairedWith: 'forage-dark' },
    'forage-dark': { label: 'Forage dark', file: 'skins/forage-dark.css', palette: 'dark', pairedWith: 'default' },
  };
  assert.equal(resolveDefault(true, withDark), 'forage-dark', 'dark OS -> the sibling');
  assert.equal(resolveDefault(false, withDark), 'default', 'light OS -> still the light skin');
});

test('1A: prefersDark is safe where matchMedia does not exist', () => {
  const saved = globalThis.matchMedia;
  delete globalThis.matchMedia;
  assert.equal(prefersDark(), false, 'no matchMedia -> light, never a throw');
  globalThis.matchMedia = () => ({ matches: true });
  assert.equal(prefersDark(), true);
  globalThis.matchMedia = () => ({ matches: false });
  assert.equal(prefersDark(), false);
  if (saved === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = saved;
});

test('1A WIRING: activeSkin() resolves stored -> transient -> OS, in that order', () => {
  // The wiring test for Phase 1A: not that the helpers work in isolation, but
  // that the boot entry point actually reaches OS resolution. Stub the two
  // ambient inputs (storage, media query) plus the minimum DOM apply() touches.
  const saved = {
    ls: globalThis.localStorage, mm: globalThis.matchMedia, doc: globalThis.document,
  };
  const store = {};
  let osDark = false;
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  globalThis.matchMedia = () => ({ matches: osDark });
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ _a: {}, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k] ?? null; }, remove() {} }),
    head: { append() {} },
  };

  try {
    clearTransient();

    osDark = false;
    assert.equal(activeSkin(), 'default', 'nothing stored, OS light -> default');

    osDark = true;
    assert.equal(activeSkin(), 'forage-dark',
      'nothing stored, OS dark -> the default skin\'s registered dark sibling');

    setTransient('bbs');
    assert.equal(activeSkin(), 'bbs', 'a mode\'s transient dress beats the OS preference');

    store[SKIN_KEY] = 'usenet';
    assert.equal(activeSkin(), 'usenet', 'an explicit stored choice beats transient AND a dark OS');

    osDark = false;
    assert.equal(activeSkin(), 'usenet',
      'and beats a light OS too — the stored choice wins in BOTH directions');
  } finally {
    clearTransient();
    for (const [k, v] of [['localStorage', saved.ls], ['matchMedia', saved.mm], ['document', saved.doc]]) {
      if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
    }
  }
});

// ---------------------------------------------------------------------------
// Phase 1B — `color-scheme` becomes skinnable.
// `color-scheme` drives NATIVE chrome: scrollbars, form controls, the caret.
// It is a real CSS property, so skinScan REJECTS it — meaning no skin could
// control it, and a dark skin would render with light scrollbars. Route it
// through a token so app.css owns the property and skins own the value.
// ---------------------------------------------------------------------------

test('1B: --color-scheme is a declared token, so a skin is allowed to set it', () => {
  const tokens = declaredTokens(readFileSync(join(root, 'css/tokens.css'), 'utf8'));
  assert.ok(tokens.has('--color-scheme'),
    '--color-scheme must be declared in tokens.css or no skin can reach native chrome');

  const r = skinScan(':root { --color-scheme: dark; }', tokens);
  assert.deepEqual(r.violations, [], 'a skin assigning --color-scheme must pass the scan');
});

test('1B: app.css CONSUMES the token — declaring it alone would be inert', () => {
  const app = readFileSync(join(root, 'css/app.css'), 'utf8');
  assert.match(app, /color-scheme:\s*var\(--color-scheme\)/,
    'app.css must apply color-scheme from the token, or setting it in a skin does nothing');
});

test('1B: tokens.css no longer hard-sets color-scheme past the token', () => {
  // A leftover raw `color-scheme: dark` in a legacy block would out-specify the
  // token for skins, which is exactly the bug this phase exists to remove.
  const tokensCss = readFileSync(join(root, 'css/tokens.css'), 'utf8');
  const raw = [...tokensCss.matchAll(/(^|[;{]\s*)color-scheme\s*:\s*(?!var\()/g)];
  assert.equal(raw.length, 0,
    `tokens.css still sets color-scheme directly ${raw.length}x — route it through --color-scheme`);
});

// ---------------------------------------------------------------------------
// Phase 1C — forage-dark becomes a real skin, paired with the light default.
// ---------------------------------------------------------------------------

// Pull the token -> value map out of one CSS block, given a selector.
function blockTokens(css, selectorStartsWith) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = new Map();
  let depth = 0, buf = '', sel = '';
  for (const c of clean) {
    if (c === '{') { if (depth === 0) { sel = buf.trim(); buf = ''; } else buf += c; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        if (sel.replace(/\s+/g, ' ').startsWith(selectorStartsWith)) {
          for (const d of buf.split(';')) {
            const i = d.indexOf(':');
            if (i < 0) continue;
            const k = d.slice(0, i).trim();
            if (k.startsWith('--')) out.set(k, d.slice(i + 1).trim());
          }
        }
        buf = ''; sel = '';
      } else buf += c;
    } else buf += c;
  }
  return out;
}

test('1C: forage-dark is registered, dark, and paired with the light default', () => {
  assert.ok(SKINS['forage-dark'], 'forage-dark is registered');
  assert.equal(SKINS['forage-dark'].palette, 'dark');
  assert.equal(SKINS.default.palette, 'light');
  assert.equal(siblingOf('default'), 'forage-dark');
  assert.equal(siblingOf('forage-dark'), 'default');
  validatePairing(SKINS);
});

test('1C: the OS dark preference now resolves THROUGH the registry to forage-dark', () => {
  assert.equal(resolveDefault(true, SKINS), 'forage-dark');
  assert.equal(resolveDefault(false, SKINS), 'default');
});

// The 1C verbatim-identity test (forage-dark token-for-token against the legacy
// `[data-theme="dark"]` block) guarded the COPY. Phase 1F deletes that block, so
// there is nothing left to drift from and the guard has done its job. What
// replaces it is durable rather than migration-shaped: every dark skin must
// actually be readable on its own ground, forever, including skins not yet
// written.

// WCAG relative luminance / contrast ratio.
function contrastOf(fg, bg) {
  const rgb = (v) => {
    const h = String(v).trim().replace(/^#/, '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const lum = (c) => {
    const [r, g, b] = rgb(c).map((x) => {
      const v = x / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

test('1F: every DARK skin declares its own ground and ink, and passes AA on them', () => {
  // A dark skin that omits --bg or --text inherits the LIGHT default for it —
  // dark ink on dark ground, or light on light. That is invisible to a token
  // diff and obvious to a user, so it is asserted here.
  const darks = Object.entries(SKINS).filter(([, s]) => s.palette === 'dark' && s.file);
  assert.ok(darks.length > 0, 'there is at least one dark skin to check');
  for (const [id, s] of darks) {
    const t = blockTokens(readFileSync(join(root, s.file), 'utf8'), ':root');
    assert.ok(t.has('--bg'), `${id} must declare its own --bg, not inherit the light one`);
    assert.ok(t.has('--text'), `${id} must declare its own --text`);
    const ratio = contrastOf(t.get('--text'), t.get('--bg'));
    assert.ok(ratio >= 4.5,
      `${id}: body text ${t.get('--text')} on ${t.get('--bg')} is ${ratio.toFixed(2)}:1, below AA 4.5`);
  }
});

test('1F: tokens.css carries ONE palette — the light default and nothing else', () => {
  // Strip comments: the file DESCRIBES the retired axis in prose, and a test
  // that greps raw text would forbid explaining the change it is enforcing.
  const css = readFileSync(join(root, 'css/tokens.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /\[data-theme/,
    'the data-theme axis is retired — a palette is a skin now');
  assert.doesNotMatch(css, /prefers-color-scheme/,
    'OS preference resolves in js/skins.js; a duplicated CSS block is the drift this removed');
});

test('1C: the service-worker SHELL caches every skin file, exactly once', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  // Scope to the SHELL array. Scanning the whole file also catches
  // `caches.match('/')` in the fetch handler and reports a phantom duplicate.
  const arr = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(arr, 'found the SHELL array');
  const shell = [...arr[1].matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
  const dupes = shell.filter((u, i) => shell.indexOf(u) !== i);
  // f6012bf — this branch's ancestor — is a fix for duplicate SHELL urls
  // breaking service-worker install. Keep that from recurring.
  assert.deepEqual([...new Set(dupes)], [], 'duplicate SHELL urls break SW install');
  for (const [id, s] of Object.entries(SKINS)) {
    if (!s.file) continue;
    assert.ok(shell.includes(`/${s.file}`), `${id}: /${s.file} missing from the SW SHELL`);
  }
});

// ---------------------------------------------------------------------------
// Phase 1D — the pre-paint boot path.
// Under the old model the boot script set an ATTRIBUTE, which is synchronous.
// A skin is a <link>, which is not: leaving it to js/skins.js means every
// non-default skin paints the light palette first. The inline script must
// inject the sheet itself — and it cannot import the registry, so what it
// knows about skins has to be pinned here or it silently drifts.
// ---------------------------------------------------------------------------

import { LINK_ID } from '../js/skins.js';

const BOOT_PAGES = ['index.html', '404.html'];

test('1D: every skin file follows skins/<id>.css — what makes href-by-convention safe', () => {
  for (const [id, s] of Object.entries(SKINS)) {
    if (!s.file) continue;
    assert.equal(s.file, `skins/${id}.css`,
      `${id} breaks the convention the boot script derives hrefs from`);
  }
});

for (const page of BOOT_PAGES) {
  test(`1D: ${page} boots from forage.skin, not the retired forage.theme`, () => {
    const html = readFileSync(join(root, page), 'utf8');
    assert.match(html, /localStorage\.getItem\('forage\.skin'\)/,
      `${page} must read the skin key`);
    assert.doesNotMatch(html, /forage\.theme/,
      `${page} still reads the retired theme key`);
  });

  test(`1D: ${page} injects the sheet the module will adopt, not a second one`, () => {
    const html = readFileSync(join(root, page), 'utf8');
    assert.ok(html.includes(`'${LINK_ID}'`) || html.includes(`"${LINK_ID}"`),
      `${page} must use id ${LINK_ID} so apply() adopts it instead of adding a duplicate sheet`);
  });

  test(`1D: ${page}'s dark fallback matches the registry, not a stale literal`, () => {
    const html = readFileSync(join(root, page), 'utf8');
    const sibling = siblingOf('default');
    assert.ok(html.includes(`'${sibling}'`),
      `${page} hardcodes a dark default that must equal siblingOf('default') = ${sibling}`);
  });
}

test('1G: every SHELL url resolves to a file that exists', () => {
  // cache.addAll() is atomic: ONE missing url fails the whole install and the
  // app silently loses offline support. Deleting a module without pruning the
  // SHELL is the easy way to cause it — 1G deletes js/theme.js, so this is the
  // guard that makes such a deletion safe from here on.
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const arr = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(arr, 'found the SHELL array');
  const missing = [];
  for (const m of arr[1].matchAll(/'(\/[^']*)'/g)) {
    const url = m[1];
    if (url === '/') continue; // the app shell itself, served as index.html
    try { readFileSync(join(root, url.slice(1))); } catch { missing.push(url); }
  }
  assert.deepEqual(missing, [], 'SHELL urls with no file on disk break cache.addAll');
});

// ---------------------------------------------------------------------------
// Phase 2 — the forum-chrome vocabulary.
// The roles are named for what a FORUM has (band, rows, nav strip, panel),
// derived from the selectors real phpBB styles carry, so importing a theme is
// a near-identity mapping rather than a translation with judgement in it.
// Every default is a PASSTHROUGH to what the rule used before, so the default
// skin renders byte-identically and only a skin can change anything.
// ---------------------------------------------------------------------------

const CHROME_TOKENS = {
  // token            default (must reproduce today's rendering exactly)
  '--link-hover':   'var(--link)',      // today a:hover only underlines
  '--band-fill':    'var(--card)',      // the masthead is a card surface today
  '--band-ink':     'var(--text)',
  '--band-link':    'var(--link)',
  '--band-brand':   'var(--brand)',   // the wordmark sits ON the band
  '--nav-fill':     'transparent',      // .tabs has no fill today
  '--panel':        'var(--card)',
  '--row-odd':      'transparent',      // post rows are unstriped today
  '--row-even':     'transparent',
  '--row-head':     'transparent',
  '--card-shadow':  'none',             // bevels ride here; flat by default
  '--radius-sm':    '4px',
  '--radius-media': '8px',
  '--radius-round': '50%',
};

test('2: every forum-chrome token is declared in tokens.css', () => {
  const tokens = declaredTokens(readFileSync(join(root, 'css/tokens.css'), 'utf8'));
  for (const name of Object.keys(CHROME_TOKENS)) {
    assert.ok(tokens.has(name), `${name} must be declared or no skin can assign it`);
  }
});

test('2: every chrome default is a PASSTHROUGH — the default skin cannot shift', () => {
  const decls = blockTokens(readFileSync(join(root, 'css/tokens.css'), 'utf8'), ':root');
  for (const [name, expected] of Object.entries(CHROME_TOKENS)) {
    const actual = (decls.get(name) ?? '').replace(/\s*\/\*.*$/, '').trim();
    assert.equal(actual, expected,
      `${name} default is ${actual}, not ${expected} — a non-passthrough default changes today's look`);
  }
});

test('2: app.css CONSUMES every chrome token — a declared-but-unused token is a lie', () => {
  const app = readFileSync(join(root, 'css/app.css'), 'utf8');
  for (const name of Object.keys(CHROME_TOKENS)) {
    assert.match(app, new RegExp(`var\\(${name.replace(/-/g, '\\-')}\\)`),
      `${name} is declared but nothing reads it — a skin setting it would see no effect`);
  }
});

test('2: the hardcoded radii are tokenised, so a skin can square the UI', () => {
  const app = readFileSync(join(root, 'css/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const raw = [...app.matchAll(/border-radius:\s*(\d+px|50%)/g)].map((m) => m[1]);
  assert.deepEqual(raw, [],
    `app.css still hardcodes ${raw.length} radius value(s) — --radius-card:0 cannot square the UI while these remain`);
});

test('no skin may key off the retired data-theme axis', () => {
  // Regression guard. Skins predating the collapse were written as two blocks:
  //   :root, :root[data-theme="light"] { light }
  //   :root:not([data-theme="light"]) { dark }
  // With data-theme gone, that second selector matches ALWAYS and comes last —
  // so the skin silently renders its dark palette while the registry calls it
  // light. usenet shipped exactly that way (caught by axe, not by this suite,
  // because the 1F contrast invariant keys off the DECLARED palette and the
  // declaration was the thing that was wrong).
  for (const [id, s] of Object.entries(SKINS)) {
    if (!s.file) continue;
    const css = readFileSync(join(root, s.file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /\[data-theme/,
      `${id} keys off data-theme, which no longer exists — its block matches unconditionally`);
  }
});

test('a skin declares exactly ONE :root block, so its palette is unambiguous', () => {
  // One skin, one palette (ADR-003). Two :root blocks means the last one wins
  // and the first is dead weight at best, a wrong palette at worst.
  for (const [id, s] of Object.entries(SKINS)) {
    if (!s.file) continue;
    const css = readFileSync(join(root, s.file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = [...css.matchAll(/(^|\})\s*([^{}]*?):root[^{}]*\{/g)].length;
    assert.equal(blocks, 1, `${id} declares ${blocks} :root blocks; a skin carries one palette`);
  }
});

// Blend two hexes — the CSS `color-mix(in srgb, A t%, B)` the stylesheet uses.
function mixOf(a, b, t) {
  const rgb = (h) => {
    const s = String(h).trim().replace(/^#/, '');
    const full = s.length === 3 ? [...s].map((c) => c + c).join('') : s;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  };
  const A = rgb(a), B = rgb(b);
  return '#' + A.map((c, i) => Math.round(c * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

// The last declaration of a token wins, which is how a skin overrides a default.
function tokenValue(css, name) {
  const all = [...css.matchAll(new RegExp(`${name}\\s*:\\s*([^;]+);`, 'g'))].map((m) => m[1].trim());
  return all.length ? all[all.length - 1] : null;
}

test('the tag chip clears AA in every skin — the floor applies to the ROLE, not the page', () => {
  // `.tag` (css/app.css) paints --gold-strong on color-mix(--gold-500 18%, --card).
  // A COMPUTED background is still a background: no per-skin contrast note
  // records it, and no axe run sees it unless a surface happens to render a
  // tagged post — which the hermetic fixtures never do. So it is checked here,
  // where the arithmetic lives, rather than hoped for in a browser.
  //
  // Found by a peer's live audit (14 violations on /u/:handle) and confirmed by
  // computing it: default was 4.33 and usenet 4.02.
  const base = readFileSync(join(root, 'css/tokens.css'), 'utf8');
  const subjects = [['default', base]];
  for (const [id, s] of Object.entries(SKINS)) {
    if (!s.file) continue;
    subjects.push([id, base + '\n' + readFileSync(join(root, s.file), 'utf8')]);
  }

  const failures = [];
  for (const [id, css] of subjects) {
    const ink = tokenValue(css, '--gold-strong');
    const gold = tokenValue(css, '--gold-500');
    const card = tokenValue(css, '--card');
    if (![ink, gold, card].every((v) => v && v.startsWith('#'))) continue;
    const bg = mixOf(gold, card, 0.18);
    const ratio = contrastOf(ink, bg);
    if (ratio < 4.5) failures.push(`${id}: ${ink} on ${bg} = ${ratio.toFixed(2)}`);
  }
  assert.deepEqual(failures, [],
    `.tag fails AA in ${failures.length} skin(s):\n  ${failures.join('\n  ')}`);
});
