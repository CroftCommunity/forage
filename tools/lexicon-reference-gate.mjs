// The mirror, gated against the validator of record.
//
// `CroftC/.claude/LEXICONS.md` rule 4: `@atproto/lexicon` is the reference
// implementation, a hand-rolled validator is a MIRROR of it, and a mirror is
// legitimate only where the official one cannot go — which here is the browser
// runtime, since this app has no build step and ships no npm packages. What makes
// the mirror honest is not care; it is this file. Every divergence between
// js/lexicon.js and the reference on the same input is a test failure rather than a
// surprise at a repo we do not own.
//
// The pattern is not invented here — `discovery/alpha/experiments/lexicon-community/`
// runs `@atproto/lexicon` beside a Rust mirror and calls the official one "validator
// of record" in as many words.
//
// devDependency only. It never reaches the browser; js/lexicon.js is what ships.
//
// WHY THIS LIVES IN tools/ AND NOT test/. The `gate` CI job runs `npm test &&
// npm run conformance` with NO `npm ci` — deliberately, because that is what proves
// the shipped app has zero runtime dependencies and the unit suite is self-contained.
// This was the first check to need a package, and putting it in test/ broke that
// property silently: green locally, ERR_MODULE_NOT_FOUND in CI (2026-08-29). Moving
// the install into the gate would have traded a real property for one command, so the
// dependency-bearing check moved out instead. It has its own npm script and its own
// CI job, so a failure here is legible as "the mirror diverged" rather than "the
// suite broke".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lexicons } from '@atproto/lexicon';
import { validateRecord } from '../js/lexicon.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = readdirSync(join(root, 'lexicons'))
  .map((f) => JSON.parse(readFileSync(join(root, 'lexicons', f), 'utf8')));

const reference = new Lexicons();
for (const doc of DOCS) reference.add(doc);

const mirrorOk = (id, value) => validateRecord(
  DOCS.find((d) => d.id === id).defs.main.record, value).ok;
const referenceOk = (id, value) => reference.validate(id, { $type: id, ...value }).success;

// The corpus is built FROM the schemas rather than hand-listed, so a lexicon added
// tomorrow is covered without anyone remembering to extend this file. Each case is a
// real field of a real type, perturbed one way.
function corpus() {
  const cases = [];
  for (const doc of DOCS) {
    const rec = doc.defs.main.record;
    const good = {};
    for (const [name, prop] of Object.entries(rec.properties)) good[name] = sampleFor(prop);
    cases.push({ id: doc.id, why: 'every field present and well-formed', value: good });

    for (const req of rec.required) {
      const { [req]: _drop, ...without } = good;
      cases.push({ id: doc.id, why: `required ${req} missing`, value: without });
    }
    for (const [name, prop] of Object.entries(rec.properties)) {
      // A value of the wrong type, chosen so it is wrong for THIS field specifically.
      const wrong = prop.type === 'string' ? 42 : 'a string';
      cases.push({ id: doc.id, why: `${name} is the wrong type`, value: { ...good, [name]: wrong } });
      if (prop.format === 'datetime') {
        cases.push({ id: doc.id, why: `${name} is an unparseable datetime`, value: { ...good, [name]: 'whenever' } });
      }
      if (prop.enum) {
        cases.push({ id: doc.id, why: `${name} is outside its enum`, value: { ...good, [name]: 'not-in-the-enum' } });
      }
      if (prop.maxLength !== undefined) {
        cases.push({ id: doc.id, why: `${name} is over maxLength`, value: { ...good, [name]: 'x'.repeat(prop.maxLength + 1) } });
      }
      if (prop.minLength !== undefined) {
        cases.push({ id: doc.id, why: `${name} is under minLength`, value: { ...good, [name]: '' } });
      }
    }
    // atproto records are OPEN. Both validators must accept a field neither has heard
    // of, or a reader here breaks against every future writer.
    cases.push({ id: doc.id, why: 'an unknown field is present', value: { ...good, somethingNew: 'from a newer client' } });
  }
  return cases;
}

function sampleFor(prop) {
  if (prop.enum) return prop.enum[0];
  if (prop.knownValues) return prop.knownValues[0];
  switch (prop.type) {
    case 'string':
      if (prop.format === 'datetime') return '2026-08-29T00:00:00.000Z';
      if (prop.format === 'did') return 'did:plc:abc123';
      if (prop.format === 'at-uri') return 'at://did:plc:abc123/fyi.forage.post/3aaa';
      if (prop.format === 'uri') return 'https://example.test/x';
      return 'x';
    case 'integer': return 1;
    case 'boolean': return true;
    case 'array': return [];
    case 'object': return {};
    default: return {};
  }
}

test('the mirror and the reference agree on every case the schemas generate', () => {
  const cases = corpus();
  assert.ok(cases.length > 60, `the corpus collapsed to ${cases.length} cases — it is generated from the schemas, so this means the generator broke, not that there is little to test`);
  const disagreements = [];
  for (const { id, why, value } of cases) {
    const mine = mirrorOk(id, value);
    const theirs = referenceOk(id, value);
    if (mine !== theirs) disagreements.push(`${id}: ${why} — mirror says ${mine ? 'valid' : 'invalid'}, reference says ${theirs ? 'valid' : 'invalid'}`);
  }
  assert.deepEqual(disagreements, [],
    `${disagreements.length} of ${cases.length} cases diverge:\n      ${disagreements.join('\n      ')}`);
});

test('both validators accept every lexicon document itself as well-formed', async () => {
  // A schema the reference refuses to LOAD is one no other client can use, however
  // happily ours reads it. This is the half a record-level check cannot see.
  const { isValidLexiconDoc } = await import('@atproto/lexicon');
  for (const doc of DOCS) {
    assert.equal(isValidLexiconDoc(doc), true, `${doc.id} is not a valid lexicon document`);
  }
});
