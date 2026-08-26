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

test('1C: forage-dark carries the legacy dark palette VERBATIM — no drift while copying', () => {
  const tokensCss = readFileSync(join(root, 'css/tokens.css'), 'utf8');
  const legacy = blockTokens(tokensCss, ':root[data-theme="dark"]');
  const skin = blockTokens(readFileSync(join(root, 'skins/forage-dark.css'), 'utf8'), ':root');

  assert.ok(legacy.size > 20, 'found the legacy dark block to compare against');
  for (const [k, v] of legacy) {
    assert.equal(skin.get(k), v, `${k} drifted: legacy ${v} vs skin ${skin.get(k)}`);
  }
  assert.equal(skin.size, legacy.size, 'the skin declares exactly the legacy dark tokens, no more');
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
