// 3c: invariants 1 and 4, mechanical. store.commit is callable ONLY from the
// memory substrate; the UI layer never commits and never imports a substrate —
// every mutation flows UI -> actions -> adapter -> routing -> substrate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function jsFilesUnder(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...jsFilesUnder(rel));
    else if (name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const ALL_JS = jsFilesUnder('js');

test('store.commit is called only from js/substrates/memory.js', () => {
  for (const file of ALL_JS) {
    if (file === 'js/store.js') continue;             // defines commit
    if (file === 'js/substrates/memory.js') continue; // the one legal caller
    const src = readFileSync(join(root, file), 'utf8');
    assert.ok(!/\bcommit\s*\(/.test(src), `${file} calls commit()`);
    assert.ok(!/import\s*{[^}]*\bcommit\b[^}]*}\s*from/.test(src), `${file} imports commit`);
  }
});

// The lens is the one named exception: a READ-ONLY shaping module with no
// commit path — the wide-tier analogue of views importing the store for
// reads (reads were never routed; invariants 1/4 govern WRITES and
// substrate selection). Anything else added here needs the same argument.
const UI_SUBSTRATE_EXCEPTIONS = new Set(['../substrates/lens.js']);

test('the UI layer never imports a substrate or the routing config (lens read-only excepted)', () => {
  for (const file of ALL_JS.filter((f) => f.startsWith('js/ui/'))) {
    const src = readFileSync(join(root, file), 'utf8');
    const substrateImports = [...src.matchAll(/from\s+'([^']*substrates\/[^']*)'/g)].map((m) => m[1]);
    const illegal = substrateImports.filter((s) => !UI_SUBSTRATE_EXCEPTIONS.has(s));
    assert.deepStrictEqual(illegal, [], `${file} imports substrates: ${illegal}`);
    assert.ok(!/config\/routing/.test(src), `${file} resolves substrates itself`);
  }
});

test('the lens exception holds: exactly TWO write paths, both named (DL-013 likes, 3j feed join)', () => {
  const src = readFileSync(join(root, 'js/substrates/lens.js'), 'utf8');
  assert.ok(!/\bcommit\s*\(/.test(src), 'lens.js never touches the memory fold');
  assert.ok(!/putRecord/.test(src), 'no putRecord — the lens edits no records');
  // the SECOND write (3j): preferences, not records — join/leave a feed.
  // Exactly one putPreferences call, under its marked section.
  assert.equal((src.match(/putPreferences/g) || []).length, 1, 'exactly one putPreferences (feed join/leave)');
  const prefMarker = src.indexOf('the SECOND lens write');
  assert.ok(prefMarker > 0, 'the preferences write carries its marker comment');
  assert.ok(src.indexOf('putPreferences') > prefMarker, 'it lives under that marker');
  // exactly ONE createRecord and ONE deleteRecord, both under the marked
  // write-pair section, both bound to the like collection constant
  assert.equal((src.match(/createRecord/g) || []).length, 1, 'exactly one createRecord (the like)');
  assert.equal((src.match(/deleteRecord/g) || []).length, 1, 'exactly one deleteRecord (the unlike)');
  const marker = src.indexOf('THE one write pair (DL-013)');
  assert.ok(marker > 0, 'the write pair carries its marker comment');
  assert.ok(src.indexOf('createRecord') > marker && src.indexOf('deleteRecord') > marker,
    'both writes live under the marked section');
  assert.match(src, /LIKE_COLLECTION = 'app\.bsky\.feed\.like'/, 'the collection is a named constant');
  assert.equal((src.match(/collection: LIKE_COLLECTION/g) || []).length, 2, 'both writes bind to it');
});

// ---- behavioral: the probation gate finally binds at write time ----

const boot = async () => {
  const store = await import('../js/store.js');
  const actions = await import('../js/actions.js');
  const { buildSeed } = await import('../data/seed.js');
  store.loadEvents(buildSeed());
  return { store, actions };
};

test('createField: probation seat refuses at write time; established seat succeeds', async () => {
  const { store, actions } = await boot();
  store.setPersona('u_moss'); // probation
  await assert.rejects(() => actions.createField({ slug: 'mossland', title: 'Mossland' }), /probation|cannot create/i);
  assert.equal(Object.values(store.getState().fields).some((f) => f.slug === 'mossland'), false);

  store.setPersona('u_fern'); // established member
  const ev = await actions.createField({ slug: 'ferns', title: 'Ferns', description: 'fronds' });
  const f = store.getState().fields[ev.payload.id];
  assert.equal(f.slug, 'ferns');
  assert.ok(f.members.has('u_fern')); // creator is a member via the reducer
});

test('createField: logged-out refuses', async () => {
  const { store, actions } = await boot();
  store.setPersona(null);
  await assert.rejects(() => actions.createField({ slug: 'x', title: 'X' }));
});

test('markNotificationsRead flows through the adapter and flips the badge', async () => {
  const { store, actions } = await boot();
  store.setPersona('u_fern');
  const sel = await import('../js/selectors.js');
  const before = sel.notifications(store.getState(), 'u_fern');
  assert.ok(before.unread > 0, 'seed gives fern unread notifications');
  await actions.markNotificationsRead(before.items.map((n) => n.id));
  assert.equal(sel.notifications(store.getState(), 'u_fern').unread, 0);
});
