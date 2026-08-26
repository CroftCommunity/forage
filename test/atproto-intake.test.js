// 5d: scoped intake (pull) + the write path, hermetic over an injected
// transport. Intake = listRecords per roster DID per wire collection
// (unauth — probe-proven), decoded into one sorted event stream; the writer
// turns actions' events into createRecord/putRecord/deleteRecord calls whose
// bodies satisfy the lexicons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent } from '../js/schema.js';
import {
  WIRE_COLLECTIONS, fetchRoster, fetchScopedEvents, createScopedWriter,
} from '../js/substrates/atproto.js';

const SERVICE = 'https://pds.example';
const alice = 'did:plc:alice', bob = 'did:plc:bob';

// A canned two-member world: alice owns a feed + roster; bob posted in it.
const RECORDS = {
  [alice]: {
    'fyi.forage.feed': [{ rkey: 'f_g', value: { $type: 'fyi.forage.feed', slug: 'g', title: 'G', createdAt: '2026-08-25T00:00:00.000Z' } }],
    'fyi.forage.membership': [{ rkey: 'f_g', value: { $type: 'fyi.forage.membership', feed: `at://${alice}/fyi.forage.feed/f_g`, createdAt: '2026-08-25T00:00:01.000Z' } }],
  },
  [bob]: {
    'fyi.forage.membership': [{ rkey: 'f_g', value: { $type: 'fyi.forage.membership', feed: `at://${alice}/fyi.forage.feed/f_g`, createdAt: '2026-08-25T00:00:02.000Z' } }],
    // two pages, to prove cursor pagination
    'fyi.forage.post': [
      { rkey: 'p_1', value: { $type: 'fyi.forage.post', feed: `at://${alice}/fyi.forage.feed/f_g`, format: 'text', title: 'One', createdAt: '2026-08-25T00:01:00.000Z' } },
      { rkey: 'p_2', value: { $type: 'fyi.forage.post', feed: `at://${alice}/fyi.forage.feed/f_g`, format: 'text', title: 'Two', createdAt: '2026-08-25T00:02:00.000Z' } },
    ],
  },
};

// fetch-shaped fake: answers listRecords (one record per page, cursor) and
// getRecord for the roster.
const calls = [];
async function fakeTransport(url) {
  const u = new URL(url);
  calls.push(u.pathname + '?' + u.searchParams.toString());
  const json = (data) => ({ status: 200, ok: true, json: async () => data });
  if (u.pathname.endsWith('com.atproto.repo.getRecord')) {
    return json({ uri: `at://${alice}/fyi.forage.roster/self`, value: {
      $type: 'fyi.forage.roster', members: [alice, bob],
      feeds: [`at://${alice}/fyi.forage.feed/f_g`], updatedAt: '2026-08-25T00:00:00.000Z',
    } });
  }
  if (u.pathname.endsWith('com.atproto.repo.listRecords')) {
    const repo = u.searchParams.get('repo'), collection = u.searchParams.get('collection');
    const rows = (RECORDS[repo] || {})[collection] || [];
    const page = Number(u.searchParams.get('cursor') || 0);
    const rec = rows[page];
    return json({
      records: rec ? [{ uri: `at://${repo}/${collection}/${rec.rkey}`, value: rec.value }] : [],
      ...(rows[page + 1] ? { cursor: String(page + 1) } : {}),
    });
  }
  return { status: 404, ok: false, json: async () => ({}) };
}

test('WIRE_COLLECTIONS is the lexicon set minus the roster', () => {
  assert.ok(WIRE_COLLECTIONS.includes('fyi.forage.post'));
  assert.ok(!WIRE_COLLECTIONS.includes('fyi.forage.roster'));
  assert.equal(WIRE_COLLECTIONS.length, 8);
});

test('fetchRoster reads the self-keyed singleton from the founding DID', async () => {
  const roster = await fetchRoster({ service: SERVICE, rosterDid: alice, transport: fakeTransport });
  assert.deepStrictEqual(roster.members, [alice, bob]);
  assert.equal(roster.feeds.length, 1);
});

test('fetchScopedEvents pulls every member x collection, paginates, decodes, sorts', async () => {
  const events = await fetchScopedEvents({ service: SERVICE, dids: [alice, bob], transport: fakeTransport });
  for (const e of events) assert.equal(validateEvent(e), true);
  const types = events.map((e) => e.type);
  assert.deepStrictEqual(types, ['feed.created', 'feed.joined', 'feed.joined', 'post.created', 'post.created']);
  assert.ok(events.every((e, i) => i === 0 || events[i - 1].ts <= e.ts), 'sorted by ts');
  // pagination actually happened: bob's posts came one per page
  const decoded = calls.map(decodeURIComponent);
  const postPages = decoded.filter((c) => c.includes('fyi.forage.post') && c.includes(`repo=${bob}`));
  assert.ok(postPages.length >= 2, `expected 2+ paged calls, saw ${postPages.length}`);
  // the aperture: only roster DIDs were pulled
  assert.ok(decoded.every((c) => !c.includes('did:plc:mallory')));
});

test('the writer maps events to XRPC record ops whose bodies satisfy the lexicons', async () => {
  const ops = [];
  const writerTransport = async (url, init) => {
    ops.push({ path: new URL(url).pathname, body: JSON.parse(init.body) });
    return { status: 200, ok: true, json: async () => ({ uri: 'at://x/y/z' }) };
  };
  const writer = createScopedWriter({
    service: SERVICE, did: bob, accessJwt: 'jwt', transport: writerTransport,
    uriFor: (id) => ({ f_g: `at://${alice}/fyi.forage.feed/f_g`, p_1: `at://${bob}/fyi.forage.post/p_1` })[id],
  });
  await writer.write('post.created', { id: 'p_9', feedId: 'f_g', format: 'text', title: 'Hi' }, { ts: 1756080000000 });
  await writer.write('vote.set', { subjectType: 'post', subjectId: 'p_1', value: 1 }, { ts: 1756080001000 });
  await writer.write('vote.set', { subjectType: 'post', subjectId: 'p_1', value: 0 }, { ts: 1756080002000 });

  assert.equal(ops[0].path.endsWith('com.atproto.repo.createRecord'), true);
  assert.equal(ops[0].body.collection, 'fyi.forage.post');
  assert.equal(ops[0].body.rkey, 'p_9'); // outbound: local id IS the rkey
  for (const req of ['feed', 'format', 'title', 'createdAt']) {
    assert.ok(ops[0].body.record[req] !== undefined, `post record has ${req}`);
  }
  assert.equal(ops[1].body.collection, 'fyi.forage.vote');
  assert.equal(ops[2].path.endsWith('com.atproto.repo.deleteRecord'), true); // retraction deletes
  assert.equal(ops[2].body.rkey, ops[1].body.rkey);
});

test('the writer refuses local-only and unknown types with words', async () => {
  const writer = createScopedWriter({ service: SERVICE, did: bob, accessJwt: 'jwt', transport: async () => ({ ok: true, status: 200, json: async () => ({}) }), uriFor: () => null });
  await assert.rejects(() => writer.write('prefs.updated', { patch: {} }, {}), /local-only/);
  await assert.rejects(() => writer.write('nonsense.event', {}, {}), /nonsense/);
});
