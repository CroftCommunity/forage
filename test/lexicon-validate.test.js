// Validating a record against the lexicon that declares it.
//
// WHY THIS EXISTS, measured rather than assumed (2026-08-29, W17 P4): a real PDS
// accepted a `fyi.forage.tagsub` carrying NEITHER of its required fields, with a
// 200. `required` in a lexicon file binds the app that wrote the file and nobody
// else. A lexicon is a CONVENTION, so a malformed record is not an exotic
// failure — it is an ordinary, expected thing to find in a repo you read, and
// the reader is the only place it can be caught.
//
// So validation belongs at the trust boundary, on the way IN, and it reads the
// lexicon file rather than restating it: a hand-written copy of a schema is a
// second schema that drifts from the first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRecord, ENFORCED } from '../js/lexicon.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lex = (id) => JSON.parse(readFileSync(join(root, 'lexicons', `${id}.json`), 'utf8'));
const TAGSUB = lex('fyi.forage.tagsub').defs.main.record;

test('the record W17 proved a PDS accepts is the record this rejects', () => {
  // Byte-for-byte the thing the live probe wrote and got a 200 for.
  const asServed = { $type: 'fyi.forage.tagsub' };
  const res = validateRecord(TAGSUB, asServed);
  assert.equal(res.ok, false);
  assert.deepEqual(res.errors.map((e) => e.field).sort(), ['createdAt', 'tag']);
  assert.match(res.errors[0].message, /required/i, 'and says what is wrong, not just that something is');
});

test('a well-formed record passes, and extra fields do not fail it', () => {
  const good = { $type: 'fyi.forage.tagsub', tag: 'harvest', createdAt: '2026-08-29T00:00:00.000Z' };
  assert.equal(validateRecord(TAGSUB, good).ok, true);
  // atproto records are OPEN: a newer client may add a field this schema has
  // never heard of, and refusing it would make every reader brittle against
  // every future writer. Unknown fields are ignored, not rejected.
  assert.equal(validateRecord(TAGSUB, { ...good, pinned: true, note: 'from my phone' }).ok, true);
});

test('a field of the wrong type is caught, named, and its actual type reported', () => {
  const res = validateRecord(TAGSUB, { tag: 42, createdAt: '2026-08-29T00:00:00.000Z' });
  assert.equal(res.ok, false);
  assert.equal(res.errors[0].field, 'tag');
  assert.match(res.errors[0].message, /string/);
  assert.match(res.errors[0].message, /number/, 'naming what arrived is what makes the error actionable');
});

test('datetime format is checked, because "createdAt exists" is not "createdAt sorts"', () => {
  // Every list we draw is ordered by createdAt. A string that is present but
  // unparseable sorts arbitrarily, which is a wrong list rather than a missing
  // one — the worse of the two failures.
  for (const bad of ['yesterday', '', '2026-13-45', 'null']) {
    const res = validateRecord(TAGSUB, { tag: 'harvest', createdAt: bad });
    assert.equal(res.ok, false, `${JSON.stringify(bad)} passed as a datetime`);
    assert.equal(res.errors[0].field, 'createdAt');
  }
  assert.equal(validateRecord(TAGSUB, { tag: 'harvest', createdAt: '2026-08-29T00:00:00Z' }).ok, true);
});

test('maxLength counts BYTES, which is what the lexicon spec means by it', () => {
  const def = { type: 'object', required: ['s'], properties: { s: { type: 'string', maxLength: 4 } } };
  assert.equal(validateRecord(def, { s: 'abcd' }).ok, true);
  assert.equal(validateRecord(def, { s: 'abcde' }).ok, false);
  // One emoji is four bytes and one character. A validator counting .length
  // would let this through and the network would not.
  assert.equal(validateRecord(def, { s: '\u{1F344}' }).ok, true, 'four bytes fits exactly');
  assert.equal(validateRecord(def, { s: '\u{1F344}a' }).ok, false, 'five bytes does not');
});

test('maxGraphemes counts what a person would call characters', () => {
  const def = { type: 'object', required: ['s'], properties: { s: { type: 'string', maxGraphemes: 2 } } };
  assert.equal(validateRecord(def, { s: 'ab' }).ok, true);
  assert.equal(validateRecord(def, { s: 'abc' }).ok, false);
  assert.equal(validateRecord(def, { s: '\u{1F344}\u{1F344}' }).ok, true, 'two emoji are two graphemes, not eight bytes');
});

test('enum, integer, boolean, array and unknown all behave as declared', () => {
  const def = { type: 'object', required: ['kind', 'n', 'flag', 'items', 'blob'],
    properties: {
      kind: { type: 'string', enum: ['a', 'b'] },
      n: { type: 'integer' },
      flag: { type: 'boolean' },
      items: { type: 'array', items: { type: 'string' } },
      blob: { type: 'unknown' },
    } };
  const base = { kind: 'a', n: 1, flag: false, items: ['x'], blob: { anything: true } };
  assert.equal(validateRecord(def, base).ok, true);
  assert.equal(validateRecord(def, { ...base, kind: 'c' }).ok, false, 'enum membership');
  assert.equal(validateRecord(def, { ...base, n: 1.5 }).ok, false, 'integer means integer');
  assert.equal(validateRecord(def, { ...base, flag: 'yes' }).ok, false);
  assert.equal(validateRecord(def, { ...base, items: 'x' }).ok, false, 'a string is not an array of one');
  assert.equal(validateRecord(def, { ...base, items: ['x', 2] }).ok, false, 'array items are typed too');
  assert.equal(validateRecord(def, { ...base, blob: null }).ok, true, 'unknown accepts anything, including null');
});

test('every record in our own lexicon tree validates its own example shape', () => {
  // A schema nobody can satisfy is a schema nobody noticed was wrong.
  for (const file of readdirSync(join(root, 'lexicons'))) {
    const doc = JSON.parse(readFileSync(join(root, 'lexicons', file), 'utf8'));
    const rec = doc.defs.main.record;
    const sample = {};
    for (const req of rec.required) sample[req] = exampleFor(rec.properties[req]);
    const res = validateRecord(rec, sample);
    assert.equal(res.ok, true, `${doc.id}: a minimal record built from its own schema fails it: ${JSON.stringify(res.errors)}`);
  }
});

function exampleFor(prop) {
  if (prop.enum) return prop.enum[0];
  switch (prop.type) {
    case 'string':
      if (prop.format === 'datetime') return '2026-08-29T00:00:00.000Z';
      if (prop.format === 'did') return 'did:plc:abc';
      if (prop.format === 'at-uri') return 'at://did:plc:abc/fyi.forage.post/3aaa';
      if (prop.format === 'uri') return 'https://example.test/x';
      return 'x';
    case 'integer': return 1;
    case 'boolean': return true;
    case 'array': return [];
    case 'object': return {};
    default: return {};
  }
}

// ── The check on the check ───────────────────────────────────────────────────
// A validator that silently ignores a constraint is worse than no validator: it
// produces justified confidence. So the constraints our own lexicons DECLARE and
// the constraints this validator ENFORCES are asserted to be the same set. Add
// `maxSize` to a lexicon tomorrow and this fails until the validator learns it.
test('the validator enforces every constraint our lexicons actually declare', () => {
  const declared = { keywords: new Set(), types: new Set(), formats: new Set() };
  // Walk SCHEMA nodes only. The keys under `properties` are field names chosen
  // by whoever wrote the lexicon (`subject`, `parent`, `bodyMd`), not lexicon
  // keywords — collecting them would demand the validator "enforce" a field
  // name, which is nonsense, and the test would then be satisfied by adding
  // every field name to an ignore list, i.e. by going blind.
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node.type === 'string') declared.types.add(node.type);
    if (typeof node.format === 'string') declared.formats.add(node.format);
    for (const [k, v] of Object.entries(node)) {
      declared.keywords.add(k);
      if (k === 'properties') { Object.values(v).forEach(walk); continue; }
      if (k === 'enum' || k === 'required' || k === 'default') continue; // values, not schemas
      walk(v);
    }
  };
  for (const file of readdirSync(join(root, 'lexicons'))) {
    walk(JSON.parse(readFileSync(join(root, 'lexicons', file), 'utf8')).defs.main.record);
  }
  const missed = (declaredSet, kind) => [...declaredSet]
    .filter((x) => !ENFORCED[kind].has(x) && !ENFORCED.ignored.has(x));
  assert.deepEqual(missed(declared.types, 'types'), [],
    'a lexicon declares a type the validator does not check');
  assert.deepEqual(missed(declared.formats, 'formats'), [],
    'a lexicon declares a format the validator does not check');
  assert.deepEqual(missed(declared.keywords, 'keywords'), [],
    'a lexicon declares a constraint the validator does not check — either enforce it or name it in ENFORCED.ignored with a reason');
});

test('minLength keeps an empty string out where the schema says it may not be empty', () => {
  // The rule lives in the schema rather than in a hand-rolled check beside the
  // reader, so one schema stays the only schema. fyi.forage.tagsub says a tag is
  // at least one byte, because an empty tag is not a tag.
  const res = validateRecord(TAGSUB, { tag: '', createdAt: '2026-08-29T00:00:00.000Z' });
  assert.equal(res.ok, false);
  assert.equal(res.errors[0].field, 'tag');
});
