// The live-proof jumpstart (plan 2026-09-14-plan-jumpstart-follow-all, O1): a starter
// pack made only of our own test accounts, so a live Follow all follows nobody real.
// The pure half builds the three record kinds a jumpstart is; the runner
// (scripts/make-test-jumpstart.mjs) signs in and writes them. Required fields
// and the purpose value are the official lexicons' (app.bsky.graph.list,
// listitem, starterpack, defs#listPurpose — fetched from upstream main 2026-09-14).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listRecord, itemRecords, packRecord, NAME } from '../scripts/test-jumpstart.mjs';

const NOW = '2026-09-14T22:00:00.000Z';
const LIST = 'at://did:plc:curator/app.bsky.graph.list/3list';

test('the list is a referencelist (the purpose starter packs use), named, dated', () => {
  const r = listRecord({ now: NOW });
  assert.equal(r.$type, 'app.bsky.graph.list');
  assert.equal(r.purpose, 'app.bsky.graph.defs#referencelist');
  assert.equal(r.name, NAME);
  assert.equal(r.createdAt, NOW);
  for (const k of ['name', 'purpose', 'createdAt']) assert.ok(k in r, `required: ${k}`);
});

test('one listitem per member, each naming the list and the member by did — never the curator', () => {
  const items = itemRecords({ listUri: LIST, members: ['did:plc:a', 'did:plc:b'], curatorDid: 'did:plc:curator', now: NOW });
  assert.equal(items.length, 2);
  for (const [i, it] of items.entries()) {
    assert.equal(it.$type, 'app.bsky.graph.listitem');
    assert.equal(it.list, LIST);
    assert.equal(it.subject, ['did:plc:a', 'did:plc:b'][i]);
    assert.equal(it.createdAt, NOW);
  }
  // the curator in the member list is dropped, not written: a pack whose curator is
  // its own member makes the live proof follow the account that is running it
  assert.equal(itemRecords({ listUri: LIST, members: ['did:plc:curator', 'did:plc:a'], curatorDid: 'did:plc:curator', now: NOW }).length, 1);
  assert.throws(() => itemRecords({ listUri: LIST, members: ['not-a-did'], curatorDid: 'did:plc:curator', now: NOW }), /did/);
});

test('the starter pack names the list and carries no feeds — people only, for the proof', () => {
  const p = packRecord({ listUri: LIST, now: NOW });
  assert.equal(p.$type, 'app.bsky.graph.starterpack');
  assert.equal(p.name, NAME);
  assert.equal(p.list, LIST);
  assert.equal(p.createdAt, NOW);
  assert.ok(!('feeds' in p), 'no feeds');
  assert.match(p.description, /test accounts/i);
});
