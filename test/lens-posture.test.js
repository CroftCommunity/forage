// 3f: the account's own moderation posture, mirrored (plan 2026-08-25-1).
// Piggy-back principle (D10): forage stores NO moderation state — the posture
// derives from getPreferences + the graph endpoints and applies IN THE SHAPE
// LAYER (policy in the substrate, never components). Fixture-driven, hermetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLens, shapeLensPost, shapeLensFeed, buildPosture, facetSegments,
  feedDisposition, EMPTY_POSTURE,
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

// ---- 4a: absent preference means adult content is OFF ----
// The official lexicon (app.bsky.actor.defs#adultContentPref, verified live
// 2026-08-26) declares `enabled` with DEFAULT FALSE. An account that never
// touched the setting has adult content off, and a guest — who has no
// preferences at all to mirror — must get the same answer. Owner direction
// 2026-08-26: "logged out/guests should see no adult content by default."
// There is no Forage-side toggle anywhere; the account's own setting is the
// only source of truth, and its absence is a real answer, not a gap.

test('4a: buildPosture with NO adultContentPref → adult OFF (the lexicon default)', () => {
  const p = buildPosture({ preferences: [] }, NOW);
  assert.equal(p.adultEnabled, false);
});

test('4a: buildPosture still honours an explicit enable', () => {
  const p = buildPosture({ preferences: [
    { $type: 'app.bsky.actor.defs#adultContentPref', enabled: true },
  ] }, NOW);
  assert.equal(p.adultEnabled, true);
});

test('4a: the GUEST posture is adult-off — no session, no preferences, no adult content', () => {
  assert.equal(EMPTY_POSTURE.adultEnabled, false);
});

// ---- OQ5: the logged-out floor (owner, 2026-08-26) ----
// A guest has no account to mirror, so instead of a permissive default they
// get the STRICTEST stance: a fixed floor of labels that hide unconditionally.
// Modelled on bluebird's label floor (CroftC/bluebird/src/feed/labels.ts) —
// same set, same three rules: hide rather than blur-with-reveal ("a tap to
// reveal control is a decoy door"), honour negated labels, and read the
// AUTHOR's labels as well as the post's.
//
// Signed in, the floor does NOT apply: the account's own settings govern, which
// is the piggy-back principle. A guest has nothing to piggy-back on.

test('OQ5: the guest floor hides mature labels the old adult switch let through', () => {
  for (const val of ['graphic-media', 'gore', 'self-harm', 'torture', 'corpse',
                     'porn', 'sexual', 'nudity', 'sexual-figurative',
                     '!hide', '!takedown', '!warn']) {
    const p = shapeLensPost(mkPost({ labels: [{ val }] }), SRC, EMPTY_POSTURE);
    assert.equal(p.hidden, true, `${val} must not reach a logged-out visitor`);
  }
});

test('OQ5: the guest floor HIDES — it never warns, because there is no reveal', () => {
  const p = shapeLensPost(mkPost({ labels: [{ val: 'gore' }] }), SRC, EMPTY_POSTURE);
  assert.equal(p.hidden, true);
  assert.equal(p.warnLabels, undefined, 'a veil with a reveal control is a decoy door');
});

test('OQ5: a NEGATED label is a retraction — it must not hide anything', () => {
  const p = shapeLensPost(mkPost({ labels: [{ val: 'porn', neg: true }] }), SRC, EMPTY_POSTURE);
  assert.equal(p.hidden, undefined, 'the labeller took it back; treating it as live is simply wrong');
});

test('OQ5: a labeled AUTHOR hides their unlabeled post', () => {
  const p = shapeLensPost(
    mkPost({ author: { labels: [{ val: 'porn' }] } }), SRC, EMPTY_POSTURE);
  assert.equal(p.hidden, true, 'the post carries no label of its own — the account does');
});

test('OQ5: an ordinary post is untouched by the floor', () => {
  const p = shapeLensPost(mkPost({}), SRC, EMPTY_POSTURE);
  assert.equal(p.hidden, undefined);
  assert.equal(p.warnLabels, undefined);
});

test('OQ5: SIGNED IN, the account governs — the floor does not override its choices', () => {
  // an account that has explicitly said "show me graphic-media"
  const signedIn = buildPosture({ preferences: [
    { $type: 'app.bsky.actor.defs#contentLabelPref', label: 'graphic-media', visibility: 'show' },
    { $type: 'app.bsky.actor.defs#adultContentPref', enabled: true },
  ] }, NOW);
  const p = shapeLensPost(mkPost({ labels: [{ val: 'graphic-media' }] }), SRC, signedIn);
  assert.equal(p.hidden, undefined, 'mirroring the account is the whole point (piggy-back)');
  const adult = shapeLensPost(mkPost({ labels: [{ val: 'porn' }] }), SRC, signedIn);
  assert.equal(adult.hidden, undefined, 'they turned adult content on; we do not second-guess it');
});

test('OQ5: signed in, a negated label is still a retraction', () => {
  const signedIn = buildPosture({ preferences: [
    { $type: 'app.bsky.actor.defs#contentLabelPref', label: 'spam', visibility: 'hide' },
  ] }, NOW);
  const p = shapeLensPost(mkPost({ labels: [{ val: 'spam', neg: true }] }), SRC, signedIn);
  assert.equal(p.hidden, undefined);
});

test('OQ5: the floor reaches FEEDS too — a guest sees no mature feed in discovery', () => {
  assert.deepEqual(feedDisposition({ labels: [{ val: 'graphic-media' }] }, EMPTY_POSTURE), { mode: 'hide' });
  assert.deepEqual(feedDisposition({ labels: [{ val: 'gore' }] }, EMPTY_POSTURE), { mode: 'hide' });
  assert.equal(feedDisposition({ labels: [{ val: 'gore', neg: true }] }, EMPTY_POSTURE), null);
  // a feed whose CREATOR is labeled
  assert.deepEqual(
    feedDisposition({ labels: [], creator: { labels: [{ val: 'porn' }] } }, EMPTY_POSTURE),
    { mode: 'hide' });
});

// ---- 4a: feed generators go through the SAME label rules as posts ----
// A feed generator view carries `labels` exactly as a post does (3 of the top
// 100 popular feeds carry `porn`, 2 carry `sexual` — measured 2026-08-26), and
// discovery used to drop them on the floor.

test('4a: feedDisposition hides an adult-labelled feed when the account has adult off', () => {
  const view = { uri: 'at://did:plc:a/app.bsky.feed.generator/x', labels: [{ val: 'porn' }] };
  assert.deepEqual(feedDisposition(view, posture({ adultEnabled: false })), { mode: 'hide' });
});

test('4a: feedDisposition obeys per-label prefs, and passes a clean feed', () => {
  const warned = feedDisposition({ labels: [{ val: 'graphic-media' }] },
    posture({ labelPrefs: new Map([['graphic-media', 'warn']]) }));
  assert.deepEqual(warned, { mode: 'warn', labels: ['graphic-media'] });
  const hidden = feedDisposition({ labels: [{ val: 'spam' }] },
    posture({ labelPrefs: new Map([['spam', 'hide']]) }));
  assert.deepEqual(hidden, { mode: 'hide' });
  assert.equal(feedDisposition({ labels: [] }, posture()), null);
});

test('4a: a feed and a post with the same label reach the same verdict — ONE rule, not two', () => {
  const pos = posture({ adultEnabled: false });
  const post = shapeLensPost(mkPost({ labels: [{ val: 'sexual' }] }), SRC, pos);
  const feed = feedDisposition({ labels: [{ val: 'sexual' }] }, pos);
  assert.equal(post.hidden, true);
  assert.deepEqual(feed, { mode: 'hide' });
});

// ---- muted words: targets, actorTarget, tags-vs-text ----

const posture = (over = {}) => ({
  mutedWords: [], labelPrefs: new Map(), adultEnabled: true,
  mutedDids: new Set(), blockedDids: new Set(), hideBadges: false, ...over,
});

// OWNER, 2026-08-26: a muted word must make the post ABSENT, not present-with-a-
// label. Rendering "[muted — matches your muted words]" leaves the row in the
// feed AND announces what it is hiding, which defeats the mute twice over. A
// muted word is client-side rendering guidance — the account said "do not show
// me this" — so the honest rendering is nothing at all.
test('a muted WORD removes the post from the board entirely — no placeholder row', () => {
  const p = shapeLensPost(mkPost({ text: 'big spoiler ahead' }), SRC,
    posture({ mutedWords: [{ value: 'spoiler', targets: ['content', 'tag'], actorTarget: 'all' }] }));
  assert.equal(p.hidden, true, 'boards filter on hidden — this is what makes it absent');
});

test('a muted-word post never announces itself in a board', () => {
  const pos = posture({ mutedWords: [{ value: 'spoiler', targets: ['content'], actorTarget: 'all' }] });
  const feed = { feed: [{ post: mkPost({ text: 'big spoiler ahead' }) }, { post: mkPost({ text: 'ordinary' }) }] };
  const shaped = shapeLensFeed(feed, SRC, {}, pos);
  assert.equal(shaped.posts.length, 1, 'one post in, one post out — the muted one is gone');
  assert.equal(shaped.posts[0].body.includes('spoiler'), false);
  assert.equal(JSON.stringify(shaped).toLowerCase().includes('muted'), false,
    'the word "muted" appears nowhere — a label naming the mute is still a tell');
});

test('a MUTED ACCOUNT is absent from a board too, for the same reason', () => {
  const pos = posture({ mutedDids: new Set(['did:plc:mutedguy']) });
  const feed = { feed: [
    { post: mkPost({ post: { uri: 'at://did:plc:mutedguy/app.bsky.feed.post/p1' }, author: { did: 'did:plc:mutedguy', handle: 'm.test' } }) },
    { post: mkPost({}) },
  ] };
  const shaped = shapeLensFeed(feed, SRC, {}, pos);
  assert.equal(shaped.posts.length, 1);
  assert.equal(shaped.posts[0].authorId, 'did:plc:auth');
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

test('the feed shape filters EVERY masked kind — blocked, muted, and label-hidden alike', () => {
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
  // OWNER, 2026-08-26: muted no longer "masks in place". Blocked, muted and
  // label-hidden all resolve to the same thing on a board — absent.
  assert.deepEqual(ids, ['p1'], 'only the ordinary post survives');
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
  assert.ok(!ids.includes('masked'), 'the muted word makes it ABSENT on the live path too');
  assert.deepEqual(ids, ['p1'], 'what is left is the post that matched nothing');
  assert.ok(calls.some((c) => c.includes('getListMutes')), 'list subscriptions consulted');
});
