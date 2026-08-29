// Validating a record against the lexicon that declares it.
//
// A LEXICON IS A CONVENTION, NOT AN ENFORCEMENT. Measured against a real PDS on
// 2026-08-29 (W17 P4, test/fixtures/atproto/tagsub-probe-summary.txt): a
// `fyi.forage.tagsub` carrying NEITHER of its required fields was accepted with
// a 200. `required` in a lexicon file binds the app that wrote the file and
// nobody else. So a malformed record is not an exotic failure — it is an
// ordinary thing to find in a repo you read, arriving by mistake, by an older
// client, or on purpose, and the READER is the only place it can be caught.
//
// Hence: validate on the way IN, at the trust boundary, against the schema file
// rather than a hand-written copy of it. A copy of a schema is a second schema.
//
// Deliberately NOT a general lexicon engine. It enforces exactly the constraints
// our own lexicons declare, and `test/lexicon-validate.test.js` asserts those two
// sets are identical — so a constraint added to a lexicon file cannot silently
// go unchecked. A validator that quietly ignores a rule is worse than none: it
// manufactures justified confidence.
import { graphemes, byteLength } from './compose.js';

// What this validator knows how to check. The test reads this and compares it
// against what the lexicon tree actually declares.
export const ENFORCED = Object.freeze({
  types: new Set(['string', 'integer', 'boolean', 'array', 'object', 'unknown']),
  formats: new Set(['datetime', 'did', 'at-uri', 'uri']),
  keywords: new Set(['type', 'required', 'properties', 'items', 'enum',
    'minLength', 'maxLength', 'maxGraphemes', 'format']),
  // Keywords that carry no constraint, named rather than skipped so the set
  // above stays honest about what it is silent on.
  ignored: new Set([
    'description', // prose for humans
    'default',     // a writer's convenience; a record without it is still valid
  ]),
});

const FORMAT = {
  // A datetime that is present but unparseable is worse than one that is
  // missing: every list we draw is ordered by createdAt, so it sorts
  // arbitrarily and produces a WRONG list rather than an empty one.
  datetime: (v) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/.test(v)
    && !Number.isNaN(Date.parse(v)),
  did: (v) => /^did:[a-z]+:[A-Za-z0-9._:%-]+$/.test(v),
  'at-uri': (v) => /^at:\/\/[^/\s]+(\/[^/\s]+){0,2}$/.test(v),
  uri: (v) => { try { new URL(v); return true; } catch { return false; } },
};

const typeName = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function checkValue(prop, value, field, errors) {
  const fail = (message) => errors.push({ field, message });
  if (prop.type === 'unknown') return;   // open by declaration: anything, null included

  switch (prop.type) {
    case 'string':
      if (typeof value !== 'string') return fail(`expected string, got ${typeName(value)}`);
      break;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return fail(`expected integer, got ${typeName(value)}`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return fail(`expected boolean, got ${typeName(value)}`);
      break;
    case 'array':
      if (!Array.isArray(value)) return fail(`expected array, got ${typeName(value)}`);
      if (prop.items) value.forEach((item, i) => checkValue(prop.items, item, `${field}[${i}]`, errors));
      break;
    case 'object':
      if (typeName(value) !== 'object') return fail(`expected object, got ${typeName(value)}`);
      if (prop.properties || prop.required) collect(prop, value, `${field}.`, errors);
      break;
    default:
      // Unreachable while the ENFORCED-vs-declared test passes, and loud rather
      // than silent if that test is ever weakened.
      return fail(`the validator does not know the type ${JSON.stringify(prop.type)}`);
  }

  if (prop.enum && !prop.enum.includes(value)) {
    return fail(`expected one of ${prop.enum.join(', ')}, got ${JSON.stringify(value)}`);
  }
  if (typeof value === 'string') {
    // maxLength is BYTES in the lexicon spec, not characters. Counting .length
    // would let through what the network refuses, one emoji at a time.
    if (prop.minLength !== undefined && byteLength(value) < prop.minLength) {
      return fail(`shorter than ${prop.minLength} bytes`);
    }
    if (prop.maxLength !== undefined && byteLength(value) > prop.maxLength) {
      return fail(`longer than ${prop.maxLength} bytes`);
    }
    if (prop.maxGraphemes !== undefined && graphemes(value) > prop.maxGraphemes) {
      return fail(`longer than ${prop.maxGraphemes} characters`);
    }
    if (prop.format && FORMAT[prop.format] && !FORMAT[prop.format](value)) {
      return fail(`not a valid ${prop.format}: ${JSON.stringify(value)}`);
    }
  }
}

function collect(def, value, prefix, errors) {
  for (const req of def.required || []) {
    if (value[req] === undefined) errors.push({ field: `${prefix}${req}`, message: 'required field is missing' });
  }
  for (const [name, prop] of Object.entries(def.properties || {})) {
    if (value[name] === undefined) continue;   // absent and not required: fine
    checkValue(prop, value[name], `${prefix}${name}`, errors);
  }
  // UNKNOWN FIELDS ARE IGNORED, not rejected. atproto records are open: a newer
  // client may add a field this schema has never heard of, and refusing it would
  // make every reader brittle against every future writer.
}

/**
 * Check a record against a lexicon's `defs.main.record` object.
 * Returns { ok: true } or { ok: false, errors: [{ field, message }] }.
 * Never throws — a malformed record is an expected input here, not a bug.
 */
export function validateRecord(recordDef, value) {
  if (typeName(value) !== 'object') {
    return { ok: false, errors: [{ field: '', message: `expected an object, got ${typeName(value)}` }] };
  }
  const errors = [];
  collect(recordDef || {}, value, '', errors);
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}
