// 3f: the account's own moderation posture, mirrored (plan 2026-08-25-1).
// Piggy-back principle (D10): forage stores NO moderation state — the posture
// derives from getPreferences + the graph endpoints and applies IN THE SHAPE
// LAYER (policy in the substrate, never components). Fixture-driven, hermetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLens, shapeLensPost, shapeLensFeed, buildPosture, facetSegments,
} from '../js/substrates/lens.js';

const SRC = { fieldId: 'lens:x', fieldSlug: 'x', fieldTitle: 'X' };
const NOW = Date.parse('2026-08-25T12:00:00Z');

const mkPost = (over = {}) => ({
  uri: 'at://did:plc:auth/app.bsky.feed.post/p1', cid: 'c1',
  author: { did: 'did:plc:auth', handle: 'auth.test', ...over.author },
  record: { text: over.text ?? 'hello world', createdAt: '2026-08-25T10:00:00Z', ...(over.tags ? { tags: over.tags } : {}), ...(over.facets ? { facets: over.facets } : {}) },
  indexedAt: '2026-08-25T10:00:00Z', likeCount: 1, replyCount: 0,
  ...(over.labels ? { labels: over.labels } : {}),
  ...(over.verification ? { verification: undefined } : {}),
  ...over.post,
});

// ---- buildPosture: the D10 payloads → one posture object ----

test('buildPosture reads muted words, label prefs, adult toggle, mutes, blocks', () => {
  const p = buildPosture({
    preferences: [
      { $type: 'app.bsky.actor.defs#mutedWordsPref', items: [
        { value: 'spoiler', targets: ['content', 'tag'], actorTarget: 'all' },
        { value: 'expired', targets: ['content'], actorTarget: 'all', expiresAt: '2026-08-25T11:00:00Z' },
      ] },
      { $type: 'app.bsky.actor.defs#contentLabelPref', label: 'nudity', visibility: 'hide' },
      { $type: 'app.bsky.actor.defs#contentLabelPref', label: 'graphic-media', visibility: 'warn' },
      { $type: 'app.bsky.actor.defs#adultContentPref', enabled: false },
    ],
    mutes: [{ did: 'did:plc:mutedguy' }],
    blocks: [{ did: 'did:plc:blockedguy' }],
  }, NOW);
  assert.equal(p.mutedWords.length, 1, 'the expired word is already gone at build time');
  assert.equal(p.mutedWords[0].value, 'spoiler');
  assert.equal(p.labelPrefs.get('nudity'), 'hide');
  assert.equal(p.labelPrefs.get('graphic-media'), 'warn');
  assert.equal(p.adultEnabled, false);
  assert.ok(p.mutedDids.has('did:plc:mutedguy'));
  assert.ok(p.blockedDids.has('did:plc:blockedguy'));
});

// ---- muted words: targets, actorTarget, tags-vs-text ----

const posture = (over = {}) => ({
  mutedWords: [], labelPrefs: new Map(), adultEnabled: true,
  mutedDids: new Set(), blockedDids: new Set(), hideBadges: false, ...over,
});

test('a muted WORD in the text masks the post; the author survives as [muted content]', () => {
  const p = shapeLensPost(mkPost({ text: 'big spoiler ahead' }), SRC,
    posture({ mutedWords: [{ value: 'spoiler', targets: ['content', 'tag'], actorTarget: 'all' }] }));
  assert.equal(p.maskedRemoved, true);
  assert.match(p.title, /muted/i);
});

test('targets:[tag] masks a TAGGED post but NOT a plain text mention of the word', () => {
  const mw = [{ value: 'gardening', targets: ['tag'], actorTarget: 'all' }];
  const tagged = shapeLensPost(mkPost({ text: 'x', tags: ['gardening'] }), SRC, posture({ mutedWords: mw }));
  assert.equal(tagged.maskedRemoved, true);
  const plain = shapeLensPost(mkPost({ text: 'i love gardening' }), SRC, posture({ mutedWords: mw }));
  assert.equal(plain.maskedRemoved, undefined);
});

test('actorTarget exclude-following spares a FOLLOWED author, masks a stranger', () => {
  const mw = [{ value: 'spoiler', targets: ['content'], actorTarget: 'exclude-following' }];
  const followed = shapeLensPost(mkPost({ text: 'spoiler!', author: { viewer: { following: 'at://x' } } }), SRC, posture({ mutedWords: mw }));
  assert.equal(followed.maskedRemoved, undefined);
  const stranger = shapeLensPost(mkPost({ text: 'spoiler!' }), SRC, posture({ mutedWords: mw }));
  assert.equal(stranger.maskedRemoved, true);
});

// ---- labels: show / warn / hide + the adult master toggle ----

test('label prefs map to the masking states: hide drops from feeds, warn veils, show passes', () => {
  const pos = posture({ labelPrefs: new Map([['nudity', 'hide'], ['graphic-media', 'warn'], ['nice', 'show']]) });
  const hidden = shapeLensPost(mkPost({ labels: [{ val: 'nudity' }] }), SRC, pos);
  assert.equal(hidden.hidden, true, 'hide → the feed filter drops it');
  const warned = shapeLensPost(mkPost({ labels: [{ val: 'graphic-media' }] }), SRC, pos);
  assert.equal(warned.hidden, undefined);
  assert.deepEqual(warned.warnLabels, ['graphic-media'], 'warn → veiled with its label named');
  const shown = shapeLensPost(mkPost({ labels: [{ val: 'nice' }] }), SRC, pos);
  assert.equal(shown.warnLabels, undefined);
});

test('adult toggle OFF forces adult labels to hide regardless of per-label prefs', () => {
  const pos = posture({ adultEnabled: false, labelPrefs: new Map([['porn', 'show']]) });
  const p = shapeLensPost(mkPost({ labels: [{ val: 'porn' }] }), SRC, pos);
  assert.equal(p.hidden, true);
});

test('the feed shape FILTERS hidden and blocked posts; muted authors mask in place', () => {
  const pos = posture({
    blockedDids: new Set(['did:plc:blockedguy']),
    mutedDids: new Set(['did:plc:mutedguy']),
    labelPrefs: new Map([['nudity', 'hide']]),
  });
  const feed = { feed: [
    { post: mkPost({}) },
    { post: mkPost({ post: { uri: 'at://did:plc:blockedguy/app.bsky.feed.post/p2' }, author: { did: 'did:plc:blockedguy', handle: 'b.test' } }) },
    { post: mkPost({ post: { uri: 'at://did:plc:mutedguy/app.bsky.feed.post/p3' }, author: { did: 'did:plc:mutedguy', handle: 'm.test' } }) },
    { post: mkPost({ post: { uri: 'at://did:plc:auth/app.bsky.feed.post/p4' }, labels: [{ val: 'nudity' }] }) },
  ] };
  const shaped = shapeLensFeed(feed, SRC, {}, pos);
  const ids = shaped.posts.map((p) => p.id.split('/').pop());
  assert.deepEqual(ids, ['p1', 'p3'], 'blocked and hidden are GONE; muted stays masked');
  assert.equal(shaped.posts[1].maskedRemoved, true, 'the muted author masks in place');
});

// ---- facets: BYTE-indexed spans ----

test('facetSegments decodes byte offsets — the emoji boundary case', () => {
  // '🌲 #tag' — the emoji is 4 UTF-8 bytes; the tag facet starts at byte 5
  const text = '🌲 #tag';
  const segs = facetSegments(text, [
    { index: { byteStart: 5, byteEnd: 9 },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'tag' }] },
  ]);
  assert.deepEqual(segs, [
    { text: '🌲 ' },
    { text: '#tag', facet: { type: 'tag', value: 'tag' } },
  ]);
});

test('facetSegments handles links and mentions; no facets → one plain segment', () => {
  const text = 'see example.com by @who';
  const segs = facetSegments(text, [
    { index: { byteStart: 4, byteEnd: 15 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' }] },
    { index: { byteStart: 19, byteEnd: 23 }, features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:who' }] },
  ]);
  assert.equal(segs.length, 4);
  assert.deepEqual(segs[1].facet, { type: 'link', value: 'https://example.com' });
  assert.deepEqual(segs[3].facet, { type: 'mention', value: 'did:plc:who' });
  assert.deepEqual(facetSegments('plain', []), [{ text: 'plain' }]);
});

// ---- verification states ----

test('verification: valid → check, trusted verifier → distinct, none → null, hideBadges wins', () => {
  const v = (verification) => mkPost({ post: { author: { did: 'd', handle: 'h', verification } } });
  const valid = shapeLensPost(v({ verifiedStatus: 'valid', trustedVerifierStatus: 'none' }), SRC, posture());
  assert.equal(valid.verified, 'valid');
  const trusted = shapeLensPost(v({ verifiedStatus: 'none', trustedVerifierStatus: 'valid' }), SRC, posture());
  assert.equal(trusted.verified, 'trusted');
  const none = shapeLensPost(v({ verifiedStatus: 'none', trustedVerifierStatus: 'none' }), SRC, posture());
  assert.equal(none.verified, null);
  const hidden = shapeLensPost(v({ verifiedStatus: 'valid', trustedVerifierStatus: 'none' }), SRC, posture({ hideBadges: true }));
  assert.equal(hidden.verified, null);
});

// ---- the wiring: posture flows from the session fetch through the LIVE path ----

test('3f wiring: loadPosture() pulls the D10 surfaces and the board masks through the entry', async () => {
  const calls = [];
  const fetchHandler = async (path) => {
    calls.push(path);
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    if (path.includes('getPreferences')) return json({ preferences: [
      { $type: 'app.bsky.actor.defs#mutedWordsPref', items: [{ value: 'venom', targets: ['content'], actorTarget: 'all' }] }] });
    if (path.includes('getMutes')) return json({ mutes: [] });
    if (path.includes('getBlocks')) return json({ blocks: [{ did: 'did:plc:baddie' }] });
    if (path.includes('getListMutes') || path.includes('getListBlocks')) return json({ lists: [] });
    if (path.includes('getAuthorFeed')) return json({ feed: [
      { post: mkPost({ text: 'pure honey' }) },
      { post: mkPost({ text: 'venom inside', post: { uri: 'at://did:plc:auth/app.bsky.feed.post/masked' } }) },
      { post: mkPost({ post: { uri: 'at://did:plc:baddie/app.bsky.feed.post/never' }, author: { did: 'did:plc:baddie', handle: 'bad.test' } }) },
    ] });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const lens = createLens({ session: { did: 'did:plc:me', handle: 'me', fetchHandler } });
  await lens.loadPosture();
  const board = await lens.feed({ kind: 'author', actor: 'auth.test' });
  const ids = board.posts.map((p) => p.id.split('/').pop());
  assert.ok(!ids.includes('never'), 'the blocked author never renders');
  const masked = board.posts.find((p) => p.id.endsWith('masked'));
  assert.equal(masked.maskedRemoved, true, 'the muted word masks ON THE LIVE PATH');
  assert.ok(calls.some((c) => c.includes('getListMutes')), 'list subscriptions consulted');
});

// ---- Phase 1 live-proof finding (2026-08-26): the restore window ----
// During the real smoke run, clicking Reply on a freshly-loaded thread did
// nothing at all — no composer, no message. The session was still restoring,
// the view re-rendered underneath the click, and the click was lost. The dial
// already handles this window with words ("Still restoring your session"), and
// every session-gated control needs the same treatment: while auth state is
// unresolved, a control must not silently swallow a click.

test('phase-1 finding: sessionGateMessage distinguishes RESTORING from signed-out', async () => {
  const { sessionGateMessage } = await import('../js/substrates/lens.js');
  // still restoring — the answer is "wait", not "sign in", because the user
  // may well already be signed in and simply not know it yet
  assert.match(sessionGateMessage({ signedIn: false, authState: 'unknown' }, 'reply'), /restor/i);
  assert.match(sessionGateMessage({ signedIn: false, authState: 'pending' }, 'reply'), /restor/i);
  // genuinely signed out — now "sign in" is the honest instruction, and it
  // names what the action would write
  const out = sessionGateMessage({ signedIn: false, authState: 'signed-out' }, 'reply');
  assert.match(out, /sign in/i);
  assert.match(out, /reply/i, 'the message names the action the user attempted');
  // signed in — there is no gate
  assert.equal(sessionGateMessage({ signedIn: true, authState: 'signed-in' }, 'reply'), null);
});
