// vendor-sync — copy the installed `croft-pwa/pds-walker` library into vendor/pds-walker/
// and write its manifest (plan 2026-09-08-plan-beta-pds-walker, P1a).
//
// Why a script and not a hand copy: SHARED-CODE.md rule 1 pins OUR code to a commit in
// package.json; forage runs the vendored copy (js/ is served unbundled and the gate job
// installs nothing), so the served copy must be derivable from the pin, never edited by
// hand. test/vendor.test.js checks every file's sha256 against the manifest and the
// manifest's source against the pin — drift in either direction fails the gate.
//
// Usage: npm install && npm run vendor:sync   (then commit vendor/pds-walker/**)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const source = pkg.devDependencies?.['croft-pwa'];
if (!/^github:CroftCommunity\/croft-pwa#[0-9a-f]{40}$/.test(source ?? '')) {
  throw new Error(`package.json devDependencies["croft-pwa"] must pin a full commit (github:CroftCommunity/croft-pwa#<sha>); got ${source}`);
}
const installed = join(root, 'node_modules', 'croft-pwa');
if (!existsSync(join(installed, 'lib', 'pds-walker', 'index.js'))) {
  throw new Error('node_modules/croft-pwa/lib is absent — run `npm install` first (its prepare step builds lib/)');
}
const installedPkg = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
const lib = join(installed, 'lib');
const out = join(root, 'vendor', 'pds-walker');

function walk(dir, base = dir) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p, base));
    else files.push(p.slice(base.length + 1));
  }
  return files;
}
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

rmSync(out, { recursive: true, force: true });
const files = {};
for (const rel of walk(lib)) {
  const dest = join(out, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(lib, rel), dest);
  files[rel] = sha256(dest);
}
// The tag is read from the library's own version clock, not guessed: VERSION in index.js.
const version = (readFileSync(join(lib, 'pds-walker', 'index.js'), 'utf8').match(/VERSION = '([0-9.]+)'/) ?? [])[1];
const manifest = {
  source,
  tag: `pds-walker-v${version}`,
  packageVersion: installedPkg.version,
  syncedAt: new Date().toISOString().slice(0, 10),
  files,
};
writeFileSync(join(out, 'VENDORED.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`vendored ${Object.keys(files).length} files from ${source} (${manifest.tag}) → vendor/pds-walker/`);
