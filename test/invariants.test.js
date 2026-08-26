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

test('the lens exception holds: writes are records-none, likes-one-pair, preferences-only (DL-013, 3j, 3s)', () => {
  const src = readFileSync(join(root, 'js/substrates/lens.js'), 'utf8');
  assert.ok(!/\bcommit\s*\(/.test(src), 'lens.js never touches the memory fold');
  assert.ok(!/putRecord/.test(src), 'no putRecord — the lens edits no records');
  // the SECOND write (3j/3s): preferences, not records. Two callers now —
  // join/leave and favorite/unfavorite — because Bluesky models saved and
  // pinned separately and Forage must not conflate them. Both live under the
  // marker; the count is pinned so a third does not appear unnoticed.
  assert.equal((src.match(/putPreferences/g) || []).length, 2,
    'exactly two putPreferences callers: join/leave (3j) and favorite (3s)');
  const prefMarker = src.indexOf('the SECOND lens write');
  assert.ok(prefMarker > 0, 'the preferences write carries its marker comment');
  assert.ok(src.indexOf('putPreferences') > prefMarker, 'they live under that marker');
  // 3w: the lens now creates TWO kinds of record — its own likes, and its own
  // posts. That is a deliberate widening (a forum has to be able to write),
  // and the shape of the widening is what this pins:
  //   • two createRecord calls, one per collection constant, no more
  //   • ONE deleteRecord, still bound to the like collection — publishing
  //     gained no power to delete anything
  //   • still no putRecord: the lens creates and unlikes; it never edits
  assert.equal((src.match(/createRecord/g) || []).length, 2, 'exactly two createRecord (the like, the post)');
  // Phase 2 widens this to two deletes — unlike, and remove-your-own-post.
  // The count alone is weak, so every occurrence is inspected: the OLD version
  // of this check read src.indexOf('deleteRecord'), which with two deletes
  // would have silently examined only the first (caught in Pass 2 review).
  assert.equal((src.match(/deleteRecord/g) || []).length, 2, 'exactly two deleteRecord (the unlike, the post delete)');
  assert.match(src, /LIKE_COLLECTION = 'app\.bsky\.feed\.like'/, 'the like collection is a named constant');
  assert.match(src, /POST_COLLECTION = 'app\.bsky\.feed\.post'/, 'so is the post collection');
  assert.equal((src.match(/collection: LIKE_COLLECTION/g) || []).length, 2, 'the like pair binds to its constant');
  assert.equal((src.match(/collection: POST_COLLECTION/g) || []).length, 2, 'publish and delete bind to theirs');

  // every write names its repo, and every one of them names the SESSION's repo.
  // This is the assertion that actually matters: a write that can address
  // another repo is a different capability wearing this one's name.
  const repoArgs = [...src.matchAll(/repo:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  assert.ok(repoArgs.length >= 4, `expected every write to name a repo, found ${repoArgs.length}`);
  for (const arg of repoArgs) {
    assert.match(arg, /^session(\?)?\.did$/, `a write addresses ${arg} — every write must address session.did`);
  }
  // and the post delete is guarded by a parsed-uri ownership check, not by the
  // UI alone: the guard has to hold when deletePost is called directly
  assert.match(src, /parsed\.did !== session\.did/, 'deletePost refuses a uri outside the session repo');
  // the record itself is built by the PURE composer, never assembled inline —
  // that is where the lexicon limits and byte-indexed facets are enforced
  assert.match(src, /import \{ buildPost, withTag \} from '\.\.\/compose\.js'/,
    'publish delegates the record shape to the pure composer');
});

// 3n: clean paths mean relative asset URLs resolve against the ROUTE, so
// './icons/x.png' becomes '/f/icons/x.png' on a deep link. Every runtime asset
// reference must be absolute. (A journey caught exactly this; the scan keeps
// it caught.)
test('runtime asset references are absolute, never route-relative', () => {
  for (const file of ALL_JS) {
    const src = readFileSync(join(root, file), 'utf8');
    const bad = [...src.matchAll(/(src|href):\s*[`'"]\.\//g)].map((m) => m[0]);
    assert.deepStrictEqual(bad, [], `${file} has route-relative asset refs: ${bad}`);
  }
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(!/(src|href)="\.\//.test(html), 'index.html has route-relative asset refs');
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
