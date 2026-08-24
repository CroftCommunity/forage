// 6c: lens intake — transport-injected AppView readers (ADR-002). Guest mode
// reads public.api.bsky.app unauthenticated; a session routes through the PDS
// proxy with its bearer. Search and personal surfaces refuse without a
// session, with words (they render as frontier chips, never dead buttons).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLens } from '../js/substrates/lens.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (n) => JSON.parse(readFileSync(join(root, 'test/fixtures/atproto', `${n}.json`), 'utf8'));

const WHATS_HOT = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

function makeTransport(log) {
  return async (url, init = {}) => {
    const u = new URL(url);
    log.push({ host: u.host, path: u.pathname, params: u.searchParams, auth: init.headers?.authorization || null });
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (u.pathname.endsWith('getFeed') || u.pathname.endsWith('getAuthorFeed') || u.pathname.endsWith('getListFeed')) return json(fixture('wide-getFeed'));
    if (u.pathname.endsWith('getPostThread')) return json(fixture('wide-getPostThread'));
    if (u.pathname.endsWith('getPreferences')) return json({ preferences: [{
      $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
      items: [
        { type: 'feed', value: WHATS_HOT, pinned: true, id: '1' },
        { type: 'timeline', value: 'following', pinned: true, id: '2' },
      ] }] });
    if (u.pathname.endsWith('getFeedGenerators')) return json({ feeds: [
      { uri: WHATS_HOT, displayName: "What's Hot", likeCount: 12345 }] });
    if (u.pathname.endsWith('searchPosts')) return json({ posts: fixture('wide-getFeed').feed.map((i) => i.post) });
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test('guest: feed source reads public.api.bsky.app with no auth header', async () => {
  const log = [];
  const lens = createLens({ transport: makeTransport(log) });
  const f = await lens.feed({ kind: 'feed', uri: WHATS_HOT });
  assert.equal(f.posts.length, 3);
  assert.equal(f.fieldSlug, 'whats-hot');           // OQ1: slug = the feed rkey
  assert.equal(log[0].host, 'public.api.bsky.app');
  assert.equal(log[0].auth, null);
});

test('author and list sources dispatch to their own XRPC methods', async () => {
  const log = [];
  const lens = createLens({ transport: makeTransport(log) });
  await lens.feed({ kind: 'author', actor: 'bsky.app' });
  await lens.feed({ kind: 'list', uri: 'at://did:plc:x/app.bsky.graph.list/mylist' });
  assert.ok(log[0].path.endsWith('app.bsky.feed.getAuthorFeed'));
  assert.ok(log[1].path.endsWith('app.bsky.feed.getListFeed'));
});

test('a session routes through the PDS proxy with its bearer', async () => {
  const log = [];
  const lens = createLens({ session: { service: 'https://bsky.social', did: 'did:plc:me', accessJwt: 'JWT' }, transport: makeTransport(log) });
  await lens.feed({ kind: 'feed', uri: WHATS_HOT });
  assert.equal(log[0].host, 'bsky.social');
  assert.equal(log[0].auth, 'Bearer JWT');
});

test('thread reads shape through to the standing thread contract', async () => {
  const lens = createLens({ transport: makeTransport([]) });
  const t = await lens.thread(fixture('wide-getPostThread').thread.post.uri, { fieldSlug: 'whats-hot', fieldTitle: "What's Hot", fieldId: 'lens:whats-hot' });
  assert.ok(t.post.id.startsWith('at://'));
  assert.equal(t.perms.canComment, false);
});

test('fields (the lens Fields list) resolve from savedFeedsPref + generator views', async () => {
  const lens = createLens({ session: { service: 'https://bsky.social', did: 'did:plc:me', accessJwt: 'JWT' }, transport: makeTransport([]) });
  const fields = await lens.fields();
  const feedField = fields.find((f) => f.kind === 'feed');
  assert.equal(feedField.slug, 'whats-hot');
  assert.equal(feedField.title, "What's Hot");
  assert.equal(feedField.pinned, true);
  assert.ok(fields.some((f) => f.kind === 'timeline')); // Following, session-only
});

test('guest refusals carry words: fields and search need a session', async () => {
  const lens = createLens({ transport: makeTransport([]) });
  await assert.rejects(() => lens.fields(), /session/);
  await assert.rejects(() => lens.search('gardening'), /session/);
});

test('search with a session returns lens-shaped posts', async () => {
  const lens = createLens({ session: { service: 'https://bsky.social', did: 'did:plc:me', accessJwt: 'JWT' }, transport: makeTransport([]) });
  const res = await lens.search('gardening');
  assert.equal(res.posts.length, 3);
  assert.equal(res.posts[0].downs, 0);
});
