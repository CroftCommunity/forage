// 6b: the wide lens' pure shapers — bsky AppView views into the SAME result
// shapes our selectors emit, so the standing UI renders them unchanged.
// Hermetic over the wide probe fixtures. The shape contract is derived from a
// real memory-world selector result: every key the memory tier emits must be
// present on the lens shape (values may diverge only where the ledger says so).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyState, reduce } from '../js/reducers.js';
import { feed, thread } from '../js/selectors.js';
import { shapeLensPost, shapeLensThread, shapeLensFeed, LENS_PERMS } from '../js/substrates/lens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (n) => JSON.parse(readFileSync(join(root, 'test/fixtures/atproto', `${n}.json`), 'utf8'));

// ---- the shape contract, derived from the memory world ----

function memoryShapes() {
  const log = [
    { id: 'e1', type: 'account.registered', actor: 'u_a', ts: 1000, payload: { handle: 'a' } },
    { id: 'e2', type: 'field.created', actor: 'u_a', ts: 2000, payload: { id: 'f1', slug: 'g', title: 'G' } },
    { id: 'e3', type: 'post.created', actor: 'u_a', ts: 3000, payload: { id: 'p1', fieldId: 'f1', format: 'text', title: 'T', bodyMd: 'B' } },
    { id: 'e4', type: 'comment.created', actor: 'u_a', ts: 4000, payload: { id: 'c1', postId: 'p1', bodyMd: 'C', quiet: true } },
  ];
  const s = log.reduce((st, e) => reduce(st, e), emptyState());
  return {
    post: feed(s, null, 'field:g', 'hot', 'all', 5).posts[0],
    node: thread(s, null, 'p1', 'best', 5).comments[0],
  };
}

const SRC = { fieldId: 'lens:whats-hot', fieldSlug: 'whats-hot', fieldTitle: "What's Hot" };

test('a lens post carries every key the memory post shape has', () => {
  const bskyPost = fixture('wide-getFeed').feed[0].post;
  const shaped = shapeLensPost(bskyPost, SRC);
  const missing = Object.keys(memoryShapes().post).filter((k) => !(k in shaped));
  assert.deepStrictEqual(missing, [], `lens post missing keys: ${missing}`);
  assert.equal(shaped.id, bskyPost.uri);            // the at-uri IS the lens id
  assert.equal(shaped.ups, bskyPost.likeCount);     // DL: scores are likes-only
  assert.equal(shaped.downs, 0);
  assert.equal(shaped.commentCount, bskyPost.replyCount);
  assert.equal(shaped.author, bskyPost.author.handle);
  assert.equal(shaped.fieldSlug, 'whats-hot');
  assert.equal(typeof shaped.createdSec, 'number');
});

test('a lens thread mirrors the comment-node shape with depth/children/deferred', () => {
  const t = shapeLensThread(fixture('wide-getPostThread'), SRC);
  const nodeKeys = Object.keys(memoryShapes().node).filter((k) => k !== 'children');
  assert.ok(t.post);
  assert.ok(Array.isArray(t.comments));
  assert.equal(t.perms.canModerate, false);
  if (t.comments.length) {
    const missing = nodeKeys.filter((k) => !(k in t.comments[0]));
    assert.deepStrictEqual(missing, [], `lens node missing keys: ${missing}`);
    assert.equal(t.comments[0].depth, 0);
    assert.ok(Array.isArray(t.comments[0].children));
  }
  assert.equal(typeof t.total, 'number');
});

test('a lens feed mirrors the feed result shape, guest perms locked down', () => {
  const f = shapeLensFeed(fixture('wide-getFeed'), SRC, { sort: 'lens' });
  assert.equal(f.posts.length, 3);
  assert.equal(f.scope, 'lens:whats-hot');
  for (const k of ['canPost', 'canComment', 'canVote', 'canModerate', 'canReport']) {
    assert.equal(f.perms[k], false, k);
  }
  assert.equal(f.perms.canView, true);
  assert.deepStrictEqual(LENS_PERMS.canCreateField, false);
});

test('a muted author masks through the SAME masked shape the memory tier uses', () => {
  const bskyPost = structuredClone(fixture('wide-getFeed').feed[0].post);
  bskyPost.author.viewer = { muted: true };
  const shaped = shapeLensPost(bskyPost, SRC);
  assert.equal(shaped.maskedRemoved, true);
  assert.equal(shaped.authorId, null);
  assert.notEqual(shaped.title, undefined);
});

test('every lens chip has its ledger entry: DL-010..015 present with the right kinds', async () => {
  const { LEDGER } = await import('../ledger/divergence.js');
  const byId = Object.fromEntries(LEDGER.map((e) => [e.id, e]));
  for (const [id, kind] of [['DL-010', 'tolerance'], ['DL-011', 'tolerance'], ['DL-012', 'tolerance'],
    ['DL-013', 'frontier'], ['DL-014', 'frontier'], ['DL-015', 'frontier']]) {
    assert.equal(byId[id]?.kind, kind, id);
    assert.equal(byId[id]?.tier, 'wide', id);
  }
  // and the chips actually reference them (invariant 7's two halves stay joined)
  const { readFileSync: rf } = await import('node:fs');
  const ui = rf(join(root, 'js/ui/lens-views.js'), 'utf8');
  for (const id of ['DL-010', 'DL-011', 'DL-013', 'DL-014', 'DL-015']) {
    assert.ok(ui.includes(id), `lens-views chips reference ${id}`);
  }
});

test('link embeds shape as link posts; plain text shapes as text', () => {
  const post = structuredClone(fixture('wide-getFeed').feed[0].post);
  post.embed = { $type: 'app.bsky.embed.external#view', external: { uri: 'https://example.com/x', title: 'Ext' } };
  const linkShaped = shapeLensPost(post, SRC);
  assert.equal(linkShaped.format, 'link');
  assert.equal(linkShaped.url, 'https://example.com/x');
  delete post.embed;
  assert.equal(shapeLensPost(post, SRC).format, 'text');
});
