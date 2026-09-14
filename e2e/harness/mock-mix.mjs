// The mixes population (plan 2026-09-08): a signed-in reader with a timeline,
// two saved feeds and one hashtag, every source answering with its own posts,
// so a journey can SEE the deal (whose posts come first, and how many per
// round), see a switched-off source stop being fetched, and see a failed
// source named on the board rather than sinking it. Deliberately small and
// distinct: each source's texts carry the source's name, so a count by text
// is a count by source.
const AV = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#5a7d5a"/></svg>');
const post = (rkey, did, handle, ts, text, likes = 0) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`,
  author: { did, handle, avatar: AV },
  record: { text, createdAt: ts }, indexedAt: ts,
  replyCount: 0, repostCount: 0, likeCount: likes,
});
// Stamped MINUTES before the run, not on a calendar date: the mix board opens
// Top on the "Today" window (lens-views.js boardTimeframe = 'day'), so a fixed
// 2026-09-08T10:xx stamp emptied the board — and the corpus — from
// 2026-09-09T10:59Z onward (test/mix-population.test.js pins this). Post 1 of
// every source is its newest; sources tie minute for minute, as before.
const T0 = Date.now() - Date.now() % 60_000;
const at = (i) => new Date(T0 - i * 60_000).toISOString();
const run = (name, did, handle, n, likes = (i) => i) => Array.from({ length: n }, (_, i) => ({ post: post(`${name}${i + 1}`, did, handle, at(i), `${name} post ${i + 1}`, likes(i)) }));

export const FUNNY = 'at://did:plc:funny/app.bsky.feed.generator/funny';
export const SCIENCE = 'at://did:plc:science/app.bsky.feed.generator/science';
export const TAG = 'harvest';

// Following: 6 posts, likes 3..8. Funny: 8 posts, likes in the hundreds.
// Science: 6 posts, likes 10 down to 5 — the small feed a weight is meant to
// lift. #harvest: 4 posts, likes 10..13. So under Top, unweighted, harvest
// post 4 (13) beats science post 1 (10); with Science at More (×2 → 20) the
// order flips. That is the whole of what a weight promises under a score.
export const RESPONSES = {
  'getPreferences': { preferences: [{
    $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
    items: [
      { id: 't', type: 'timeline', value: 'following', pinned: true },
      { id: 'f1', type: 'feed', value: FUNNY, pinned: true },
      { id: 'f2', type: 'feed', value: SCIENCE, pinned: false },
    ],
  }] },
  'getFeedGenerators': { feeds: [
    { uri: FUNNY, displayName: 'Funny', creator: { handle: 'funny.test' }, likeCount: 9000 },
    { uri: SCIENCE, displayName: 'Science', creator: { handle: 'science.test' }, likeCount: 12 },
  ] },
  'getFeedGenerator?': { view: { uri: FUNNY, displayName: 'Funny', creator: { handle: 'funny.test' } } },
  'getTimeline': { feed: run('following', 'did:plc:friend', 'friend.test', 6, (i) => 3 + i), cursor: 'tl2' },
  [`getFeed?feed=${encodeURIComponent(FUNNY)}`]: { feed: run('funny', 'did:plc:comic', 'comic.test', 8, (i) => 900 - i * 10), cursor: 'funny2' },
  [`getFeed?feed=${encodeURIComponent(SCIENCE)}`]: { feed: run('science', 'did:plc:lab', 'lab.test', 6, (i) => 10 - i) },
  // any OTHER feed (the curated Discover board a Current capture opens on main):
  // the funny run again, so the frame has rows. Declared AFTER the two named
  // feeds — routing is first-match by substring.
  'getFeed': { feed: run('discover', 'did:plc:comic', 'comic.test', 8, (i) => 900 - i * 10) },
  'searchPosts': { posts: run('harvest', 'did:plc:farm', 'farm.test', 4, (i) => 10 + i).map((e) => e.post) },
  'getTrendingTopics': { topics: [] },
  'describeRepo': { handle: 'me.test' },
  'getProfile?actor=did%3Aplc%3Ame': { did: 'did:plc:me', handle: 'me.test', avatar: AV },
  'listRecords': { records: [] },
  'getMutes': { mutes: [] }, 'getBlocks': { blocks: [] },
  'getListMutes': { lists: [] }, 'getListBlocks': { lists: [] },
  'getFollows': { follows: [] }, 'getFollowers': { followers: [] },
};

export const FAKE_SIGNED_IN = `(() => {
  const listeners = new Set(); let session = null; let state = 'unknown';
  window.__forageFakeSessionManager = {
    state: () => state, currentSession: () => session,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async restore() {
      session = { did: 'did:plc:me', signOut: async () => {},
        fetchHandler: (p, i) => window.fetch('https://bsky.social' + p, i) };
      state = 'signed-in'; for (const f of listeners) f(state); return session;
    },
    async signIn() {}, async signOut() {},
    fetch(p, i) { return session.fetchHandler(p, i); },
  };
  try { localStorage.setItem('forage.tagsubs', JSON.stringify([{ tag: '${TAG}', createdAt: '2026-09-01T00:00:00Z' }])); } catch {}
})();`;
