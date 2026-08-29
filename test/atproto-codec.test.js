// 5c: the event <-> record codec, pure and hermetic. Encoding folds an event
// stream into a RECORD SET (create/put/delete on repos — atproto's shape);
// decoding derives events back from records. Deletion-as-absence folds to the
// same state presence-derivation gives; edits surface as editedAt; local-only
// events (identity, prefs, read-state) bypass the wire verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEvent } from '../js/schema.js';
import {
  encodeEvents, decodeRecords, recordToEvents, deriveEntityId, uriToId, looksLikeTid,
} from '../js/substrates/atproto.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (name) => JSON.parse(readFileSync(join(root, 'test/fixtures/atproto', `${name}.json`), 'utf8'));

let seq = 0;
const ev = (type, payload, actor, ts) => ({ id: `t_${seq++}`, type, actor, ts, payload });

// ---- id policy ----

test('id policy: TID rkeys derive <prefix>_<did>_<rkey>; local rkeys pass through', () => {
  assert.equal(looksLikeTid('3mtufm5bswr2t'), true);   // from the probe fixture
  assert.equal(looksLikeTid('p_a'), false);
  assert.equal(deriveEntityId('p', 'did:plc:xyz', '3mtufm5bswr2t'), 'p_did:plc:xyz_3mtufm5bswr2t');
  assert.equal(deriveEntityId('p', 'did:plc:xyz', 'p_a'), 'p_a');
  assert.equal(uriToId('at://did:plc:xyz/fyi.forage.post/3mtufm5bswr2t'), 'p_did:plc:xyz_3mtufm5bswr2t');
  assert.equal(uriToId('at://did:plc:xyz/fyi.forage.comment/c_tip'), 'c_tip');
});

// ---- decode: each collection to a valid event ----

const URI = (did, coll, rkey) => `at://${did}/${coll}/${rkey}`;

test('a lexicon-true post record decodes to a valid post.created (+edited when editedAt)', () => {
  const rec = {
    did: 'did:plc:alice', collection: 'fyi.forage.post', rkey: '3mtufm5bswr2t',
    value: { $type: 'fyi.forage.post', feed: URI('did:plc:alice', 'fyi.forage.feed', 'f_orchard'),
      format: 'text', title: 'Hello', bodyMd: 'Body', createdAt: '2026-08-25T00:00:00.000Z',
      editedAt: '2026-08-25T01:00:00.000Z' },
  };
  const events = recordToEvents(rec);
  assert.equal(events.length, 2);
  const [created, edited] = events;
  assert.equal(validateEvent(created), true);
  assert.equal(created.type, 'post.created');
  assert.equal(created.actor, 'did:plc:alice');
  assert.equal(created.ts, Date.parse('2026-08-25T00:00:00.000Z'));
  assert.equal(created.payload.id, 'p_did:plc:alice_3mtufm5bswr2t');
  assert.equal(created.payload.feedId, 'f_orchard');
  assert.equal(edited.type, 'post.edited');
  assert.equal(edited.ts, Date.parse('2026-08-25T01:00:00.000Z'));
  assert.equal(validateEvent(edited), true);
});

test('vote/save/membership/mod/report/comment records decode to valid events', () => {
  const alice = 'did:plc:alice';
  const post = URI(alice, 'fyi.forage.post', 'p_a');
  const feedUri = URI(alice, 'fyi.forage.feed', 'f_orchard');
  const cases = [
    [{ did: alice, collection: 'fyi.forage.comment', rkey: 'c_1', value: { subject: post, bodyMd: 'hi', createdAt: '2026-08-25T00:00:01.000Z' } }, 'comment.created'],
    [{ did: alice, collection: 'fyi.forage.vote', rkey: 'v1', value: { subject: post, createdAt: '2026-08-25T00:00:02.000Z' } }, 'vote.set'],
    [{ did: alice, collection: 'fyi.forage.save', rkey: 's1', value: { subject: post, createdAt: '2026-08-25T00:00:03.000Z' } }, 'save.set'],
    [{ did: alice, collection: 'fyi.forage.feed', rkey: 'f_orchard', value: { slug: 'orchard', title: 'Orchard', createdAt: '2026-08-25T00:00:04.000Z' } }, 'feed.created'],
    [{ did: alice, collection: 'fyi.forage.membership', rkey: 'm1', value: { feed: feedUri, createdAt: '2026-08-25T00:00:05.000Z' } }, 'feed.joined'],
    [{ did: alice, collection: 'fyi.forage.mod', rkey: 'mod1', value: { action: 'removed', feed: feedUri, subject: post, reason: 'r', createdAt: '2026-08-25T00:00:06.000Z' } }, 'mod.removed'],
    [{ did: alice, collection: 'fyi.forage.mod', rkey: 'mod2', value: { action: 'banned', feed: feedUri, targetDid: 'did:plc:bob', createdAt: '2026-08-25T00:00:07.000Z' } }, 'mod.banned'],
    [{ did: alice, collection: 'fyi.forage.report', rkey: 'rep1', value: { subject: post, feed: feedUri, reason: 'spam', createdAt: '2026-08-25T00:00:08.000Z' } }, 'report.filed'],
  ];
  for (const [rec, type] of cases) {
    const [e] = recordToEvents(rec);
    assert.equal(e.type, type, rec.collection);
    assert.equal(validateEvent(e), true, `${type} validates`);
  }
});

test('the probe jetstream envelope yields did/collection/rkey the codec accepts', () => {
  const env = fixture('jetstream-commit-event');
  assert.equal(env.kind, 'commit');
  const rec = { did: env.did, collection: env.commit.collection, rkey: env.commit.rkey, value: env.commit.record };
  assert.ok(rec.did.startsWith('did:'));
  assert.ok(rec.collection.startsWith('fyi.forage.'));
  // the probe's record predates the lexicons (shape differs); the ENVELOPE is
  // what this pins — deriveEntityId works over its real TID rkey
  assert.ok(deriveEntityId('c', rec.did, rec.rkey).includes(rec.did));
});

// ---- encode: an event stream folds to a record set ----

function sampleEvents() {
  return [
    ev('account.registered', { handle: 'alice' }, 'did:plc:alice', 1000),
    ev('feed.created', { id: 'f_g', slug: 'g', title: 'G' }, 'did:plc:alice', 2000),
    ev('feed.joined', { feedId: 'f_g' }, 'did:plc:bob', 3000),
    ev('post.created', { id: 'p_1', feedId: 'f_g', format: 'text', title: 'T', bodyMd: 'B' }, 'did:plc:bob', 4000),
    ev('post.edited', { postId: 'p_1', patch: { title: 'T2' } }, 'did:plc:bob', 5000),
    ev('vote.set', { subjectType: 'post', subjectId: 'p_1', value: 1 }, 'did:plc:alice', 6000),
    ev('vote.set', { subjectType: 'post', subjectId: 'p_1', value: 0 }, 'did:plc:alice', 7000), // retraction
    ev('save.set', { subjectType: 'post', subjectId: 'p_1', saved: true }, 'did:plc:alice', 8000),
    ev('save.set', { subjectType: 'post', subjectId: 'p_1', saved: false }, 'did:plc:alice', 9000), // unsave
    ev('prefs.updated', { patch: { theme: 'dark' } }, 'did:plc:alice', 10000), // local-only
  ];
}

test('encodeEvents: creates, applies edits in place, deletes retractions, keeps locals', () => {
  const { records, locals } = encodeEvents(sampleEvents());
  const byColl = (c) => records.filter((r) => r.collection === c);
  assert.equal(byColl('fyi.forage.feed').length, 1);
  assert.equal(byColl('fyi.forage.membership').length, 1);
  const [post] = byColl('fyi.forage.post');
  assert.equal(post.value.title, 'T2');            // edit applied in place
  assert.ok(post.value.editedAt);                  // and surfaced
  assert.equal(post.rkey, 'p_1');                  // local id IS the rkey outbound
  assert.equal(post.did, 'did:plc:bob');
  assert.equal(byColl('fyi.forage.vote').length, 0);  // retracted -> deleted
  assert.equal(byColl('fyi.forage.save').length, 0);  // unsaved -> deleted
  assert.deepStrictEqual(locals.map((e) => e.type), ['account.registered', 'prefs.updated']);
});

test('every encoded record satisfies its own lexicon required list', () => {
  const { records } = encodeEvents(sampleEvents());
  for (const r of records) {
    const lex = JSON.parse(readFileSync(join(root, 'lexicons', `${r.collection}.json`), 'utf8'));
    for (const req of lex.defs.main.record.required) {
      assert.ok(r.value[req] !== undefined, `${r.collection}/${r.rkey} missing required ${req}`);
    }
  }
});

test('decode(encode(events)) folds to the same observable state (spot check)', async () => {
  const { emptyState, reduce, tally } = await import('../js/reducers.js');
  const fold = (log) => log.reduce((s, e) => reduce(s, e), emptyState());
  const src = sampleEvents();
  const { records, locals } = encodeEvents(src);
  const roundTrip = decodeRecords(records, locals);
  for (const e of roundTrip) assert.equal(validateEvent(e), true);
  const a = fold(src);
  const b = fold(roundTrip);
  assert.deepStrictEqual(Object.keys(b.posts), Object.keys(a.posts));
  assert.equal(b.posts.p_1.title, 'T2');
  assert.equal(b.posts.p_1.edited, true);
  assert.deepStrictEqual(tally(b, 'post', 'p_1'), tally(a, 'post', 'p_1')); // retraction-as-absence == vote.set(0)
  assert.deepStrictEqual(b.users, a.users);           // locals pass through
  assert.ok(b.feeds.f_g.members.has('did:plc:bob'));
});

// The vote record carries no `value`, and the reason is the whole retraction model.
//
// At the EVENT layer `value` is load-bearing: 0 means retract, 1 means boost, and
// js/reducers.js branches on it. At the RECORD layer it never varies — a retraction
// is the record DELETED (this file's header says so, and the encoder does it), so a
// vote record that exists is a boost and a vote record with value 0 cannot occur.
// It was a required field whose only legal value was a constant, and the last thing
// that made it look meaningful — bury, value -1 — was removed 2026-08-27.
test('a vote record carries no value: presence IS the boost, absence IS the retraction', () => {
  const bob = 'did:plc:bob';
  const { records } = encodeEvents([
    ev('feed.created', { id: 'f_1', slug: 'orchard', title: 'Orchard' }, bob, 500),
    ev('post.created', { id: 'p_1', feedId: 'f_1', title: 'T', bodyMd: 'b' }, bob, 1000),
    ev('vote.set', { subjectType: 'post', subjectId: 'p_1', value: 1 }, bob, 2000),
  ]);
  const vote = records.find((r) => r.collection === 'fyi.forage.vote');
  assert.ok(vote, 'the vote was encoded');
  assert.deepStrictEqual(Object.keys(vote.value).sort(), ['$type', 'createdAt', 'subject'],
    'no `value` field — the record is the vote');
});

test('a vote record decodes to value 1, because only a boost can be written', () => {
  const alice = 'did:plc:alice';
  const [event] = recordToEvents({
    did: alice, collection: 'fyi.forage.vote', rkey: 'v1',
    value: { subject: URI(alice, 'fyi.forage.post', 'p_a'), createdAt: '2026-08-25T00:00:02.000Z' },
  });
  assert.equal(event.type, 'vote.set');
  assert.equal(event.payload.value, 1,
    'the event layer still needs a value; the record layer supplies the only one it can mean');
  assert.equal(validateEvent(event), true, 'and the derived event is valid');
});
