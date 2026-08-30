// Phase 0 (D1, D2) probe — plan 2026-08-29-plan-post-and-thread. NOT PRODUCTION:
// raw XRPC against the standing test account, promoted into
// e2e/lens-writes-live.workflow.mjs in Phase 4a-iv. Prints every raw response
// in full; the undo read-back is the last thing printed. Never prints creds.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDS = 'https://bsky.social';
const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';
// walk up to CroftC/.env — a worktree sits two levels deeper than forage/ does
const envPath = [join(root, '..', '.env'), join(root, '..', '..', '..', '.env')].find((p) => { try { readFileSync(p); return true; } catch { return false; } });
const env = Object.fromEntries(readFileSync(envPath, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const out = {};
const log = (k, v) => { out[k] = v; console.log(`\n== ${k}\n${JSON.stringify(v, null, 2)}`); };
const sess = await (await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: env.test_user1, password: env.test_pass1 }) })).json();
if (sess.did !== TEST_DID) throw new Error(`refusing: signed in as ${sess.did}`);
const call = async (path, { method = 'GET', body, query } = {}) => {
  const q = query ? '?' + new URLSearchParams(query) : '';
  const res = await fetch(`${PDS}/xrpc/${path}${q}`, { method, headers: { authorization: `Bearer ${sess.accessJwt}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
};
// subjects: one of the account's own posts (bookmark + muteThread), test_user2 (mute + block)
const other = await call('com.atproto.identity.resolveHandle', { query: { handle: 'bobzmudacroft.bsky.social' } }); log('subject-actor', other);
const did2 = other.body.did;
// neither test account holds a post; the subject is a public one (the
// wide-getPostThread fixture's root), re-read live so the cid is current
const live = await call('app.bsky.feed.getPosts', { query: { uris: 'at://did:plc:dvz3bhpjo4yrlqtoohbqa5bl/app.bsky.feed.post/3mttlbetsbc27' } });
const post = live.body.posts[0]; log('subject-post', { uri: post.uri, cid: post.cid });
// D1 bookmarks
log('bookmark.create', await call('app.bsky.bookmark.createBookmark', { method: 'POST', body: { uri: post.uri, cid: post.cid } }));
log('bookmark.list', await call('app.bsky.bookmark.getBookmarks', { query: { limit: 10 } }));
log('bookmark.delete', await call('app.bsky.bookmark.deleteBookmark', { method: 'POST', body: { uri: post.uri } }));
log('bookmark.list-after', await call('app.bsky.bookmark.getBookmarks', { query: { limit: 10 } }));
// D2 mutes (procedures)
log('muteActor', await call('app.bsky.graph.muteActor', { method: 'POST', body: { actor: did2 } }));
log('getMutes', await call('app.bsky.graph.getMutes', { query: { limit: 10 } }));
log('unmuteActor', await call('app.bsky.graph.unmuteActor', { method: 'POST', body: { actor: did2 } }));
log('getMutes-after', await call('app.bsky.graph.getMutes', { query: { limit: 10 } }));
log('muteThread', await call('app.bsky.graph.muteThread', { method: 'POST', body: { root: post.uri } }));
log('getPostThread-muted', (({ status, body }) => ({ status, viewerThreadMuted: body?.thread?.post?.viewer?.threadMuted, viewer: body?.thread?.post?.viewer }))(await call('app.bsky.feed.getPostThread', { query: { uri: post.uri, depth: 0 } })));
log('unmuteThread', await call('app.bsky.graph.unmuteThread', { method: 'POST', body: { root: post.uri } }));
// D2 block (record)
log('block.create', await call('com.atproto.repo.createRecord', { method: 'POST', body: { repo: TEST_DID, collection: 'app.bsky.graph.block', record: { $type: 'app.bsky.graph.block', subject: did2, createdAt: new Date().toISOString() } } }));
log('getBlocks', await call('app.bsky.graph.getBlocks', { query: { limit: 10 } }));
const rkey = out['block.create'].body.uri.split('/').pop();
log('block.delete', await call('com.atproto.repo.deleteRecord', { method: 'POST', body: { repo: TEST_DID, collection: 'app.bsky.graph.block', rkey } }));
log('getBlocks-after', await call('app.bsky.graph.getBlocks', { query: { limit: 10 } }));
log('getProfile-after', (({ status, body }) => ({ status, viewer: body.viewer }))(await call('app.bsky.actor.getProfile', { query: { actor: did2 } })));
writeFileSync(join(root, 'test/fixtures/atproto/bookmarks.json'), JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k]) => k.startsWith('bookmark') || k.startsWith('subject'))), null, 2) + '\n');
writeFileSync(join(root, 'test/fixtures/atproto/graph-writes.json'), JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k]) => !k.startsWith('bookmark'))), null, 2) + '\n');
console.log('\nfixtures written');
