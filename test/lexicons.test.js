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
