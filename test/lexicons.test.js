// 5b: the fyi.forage.* lexicon tree. Each schema is well-formed lexicon JSON
// whose id matches its filename; the collection set is pinned (second copy,
// schema.test.js style) and mapped against the event vocabulary — every
// wire-borne mutation has a collection, every deliberate omission is named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The pinned collection set.
const COLLECTIONS = [
  'fyi.forage.post',       // post.created (+edited via editedAt; deletedByAuthor = record delete)
  'fyi.forage.comment',    // comment.created (+edited/deleted likewise)
  'fyi.forage.vote',       // vote.set 1 (boost only since 2026-08-27); retraction = record delete
  'fyi.forage.save',       // save.set true; unsave = record delete
  'fyi.forage.feed',      // feed.created (+settingsUpdated via putRecord)
  'fyi.forage.membership', // feed.joined; feed.left = record delete
  'fyi.forage.mod',        // the mod.* family, one action record in the steward's repo
  'fyi.forage.report',     // report.filed
  'fyi.forage.roster',     // the scoped tier's membership, in the founding DID's repo (key: self)
  // DECLARED, NOT YET WRITTEN (2026-08-28, owner). Hashtag subscriptions are
  // stored on the device today and this schema is what they are stored AS, so
  // the eventual move to a repo is a loop of createRecord rather than a
  // reshaping — "start local… and still make that changeover seamless". The
  // lexicon lands with the local implementation on purpose: a shape agreed
  // after people already hold records is a migration, and a shape agreed while
  // it lives in a browser is an edit. test/tagsubs.test.js reads THIS FILE to
  // assert the local store already satisfies it.
  'fyi.forage.tagsub',     // a subscribed hashtag; unsubscribe = record delete
];

// Event types that DELIBERATELY have no wire collection at this tier.
const LOCAL_ONLY = new Set([
  'account.registered',  // identity is the DID itself
  'account.suspended',   // site-admin concept; not a scoped-tier primitive (frontier)
  'prefs.updated',       // device-local
  'notification.read',   // device-local read-state
]);

test('every pinned collection has a lexicon file whose id matches', () => {
  for (const id of COLLECTIONS) {
    const file = join(root, 'lexicons', `${id}.json`);
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(doc.lexicon, 1, `${id}: lexicon version`);
    assert.equal(doc.id, id, `${id}: id matches filename`);
    assert.equal(doc.defs?.main?.type, 'record', `${id}: main def is a record`);
    assert.ok(doc.defs.main.key, `${id}: record key declared`);
    const rec = doc.defs.main.record;
    assert.equal(rec.type, 'object');
    assert.ok(Array.isArray(rec.required) && rec.required.length > 0, `${id}: required feeds`);
    for (const req of rec.required) assert.ok(rec.properties[req], `${id}: required ${req} is defined`);
  }
});

test('no stray lexicon files outside the pinned set', () => {
  const files = readdirSync(join(root, 'lexicons')).filter((f) => f.endsWith('.json'));
  assert.deepStrictEqual(files.sort(), COLLECTIONS.map((c) => `${c}.json`).sort());
});

test('every event type is either wire-mapped or a named local-only omission', async () => {
  const { EVENT_TYPES } = await import('../js/schema.js');
  // prefix -> collection coverage; mod.* all ride fyi.forage.mod
  const wire = {
    'post.created': 'fyi.forage.post', 'post.edited': 'fyi.forage.post', 'post.deletedByAuthor': 'fyi.forage.post',
    'comment.created': 'fyi.forage.comment', 'comment.edited': 'fyi.forage.comment', 'comment.deletedByAuthor': 'fyi.forage.comment',
    'vote.set': 'fyi.forage.vote', 'save.set': 'fyi.forage.save',
    'feed.created': 'fyi.forage.feed', 'feed.settingsUpdated': 'fyi.forage.feed',
    'feed.joined': 'fyi.forage.membership', 'feed.left': 'fyi.forage.membership',
    'report.filed': 'fyi.forage.report',
  };
  for (const type of Object.keys(EVENT_TYPES)) {
    if (type.startsWith('mod.')) continue; // the mod family maps as one collection
    assert.ok(wire[type] || LOCAL_ONLY.has(type), `${type} is neither wire-mapped nor a named omission`);
    if (wire[type]) assert.ok(COLLECTIONS.includes(wire[type]));
  }
});

test('mod lexicon enumerates exactly the mod.* action suffixes', async () => {
  const { MOD_TYPES } = await import('../js/schema.js');
  const doc = JSON.parse(readFileSync(join(root, 'lexicons', 'fyi.forage.mod.json'), 'utf8'));
  const actions = doc.defs.main.record.properties.action.enum;
  assert.deepStrictEqual([...actions].sort(), [...MOD_TYPES].map((t) => t.slice(4)).sort());
});

test('roster is a self-keyed singleton', () => {
  const doc = JSON.parse(readFileSync(join(root, 'lexicons', 'fyi.forage.roster.json'), 'utf8'));
  assert.equal(doc.defs.main.key, 'literal:self');
});

// ── The register (P5, 2026-08-29) ────────────────────────────────────────────
// Owner: "let's keep it to a minimum and highlight every one created and
// defined for ourselves so we are intentional about it and so we can reflect on
// overlap with the ecosystem." So the permission to define our own types comes
// with an obligation, and an obligation with no check decays into prose. Every
// pinned collection needs an entry in docs/LEXICON-REGISTER.md that says what it
// holds, why it is ours, and WHAT WAS CHECKED IN THE ECOSYSTEM FIRST.
//
// Nine types predate the rule. Rather than back-fill nine ecosystem checks I
// have not actually done — which would make the register a fiction on the day it
// was created — they are listed here as owed. The list may only shrink; a new
// type may never join it.
const PRE_REGISTER = new Set([
  'fyi.forage.post', 'fyi.forage.comment', 'fyi.forage.vote', 'fyi.forage.save',
  'fyi.forage.feed', 'fyi.forage.membership', 'fyi.forage.mod', 'fyi.forage.report',
  'fyi.forage.roster',
]);

test('every fyi.forage.* type has a register entry saying what it holds and why it is ours', () => {
  const md = readFileSync(join(root, 'docs', 'LEXICON-REGISTER.md'), 'utf8');
  const sections = new Map();
  const parts = md.split(/^## /m).slice(1);
  for (const part of parts) sections.set(part.split('\n')[0].trim(), part);
  for (const id of COLLECTIONS) {
    const sec = sections.get(id);
    assert.ok(sec, `${id}: no "## ${id}" section in docs/LEXICON-REGISTER.md`);
    assert.match(sec, /\*\*Holds:\*\*\s*\S/, `${id}: register entry says nothing about what it holds`);
    assert.match(sec, /\*\*Why ours:\*\*\s*\S/, `${id}: register entry does not justify defining our own type`);
    assert.match(sec, /\*\*Ecosystem check[^*]*:\*\*\s*\S/, `${id}: register entry records no ecosystem check`);
  }
  assert.deepStrictEqual([...sections.keys()].sort(), [...COLLECTIONS].sort(),
    'the register and the pinned collection set are the same list');
});

test('an ecosystem check may only be owed by a type that predates the register', () => {
  const md = readFileSync(join(root, 'docs', 'LEXICON-REGISTER.md'), 'utf8');
  for (const part of md.split(/^## /m).slice(1)) {
    const id = part.split('\n')[0].trim();
    const check = part.match(/\*\*Ecosystem check[^*]*:\*\*(.*)/)?.[1] || '';
    if (/NOT DONE/.test(check)) {
      assert.ok(PRE_REGISTER.has(id),
        `${id} owes an ecosystem check, but only types predating the register (2026-08-29) may`);
    }
  }
  // fyi.forage.tagsub is the first type defined UNDER the rule, so it is the
  // one that proves the rule does something.
  assert.equal(PRE_REGISTER.has('fyi.forage.tagsub'), false);
});
