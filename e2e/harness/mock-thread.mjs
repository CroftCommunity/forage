// The thread a mock is judged against (CroftC/.claude/MOCKS.md — the surface's
// hermetic population, built to STRESS the surface, not to smoke it).
//
// Why this exists: post-and-thread v17 was drawn with five-character names
// ("briar", "sage") and captured against the memory seed ("Planting note #39",
// signed out, no quotes). Neither could show what forage.fyi showed the owner
// on 2026-08-30: a 27-character handle plus "⟳ quoted this" wrapping the
// byline to three lines at 390px, and no Reply on any comment. A drawing
// cannot fail under a load it never carries. This fixture carries it:
//
//   - handles at the lengths Bluesky actually hands us (up to 30 chars)
//   - a quote node (walled) with a reply under it
//   - a chain four deep, so the elbows and the phone's 14px indent are seen
//   - a zero-like leaf beside an eleven-like parent (the stack's two widths)
//   - a signed-in session, so the vote stack is a button and Reply is offered
//
// Shared by the mock-thread workflow (the claims) and scripts/mock-snaps.mjs
// (the pictures), so the picture the owner approves is of the tree the gate
// runs. Hermetic: every Bluesky host is fenced by the shim; misses fail.
import { img, images } from './mock-board.mjs';
const AV = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const WH = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

// feed-row v6: the names people chose — the head shows the root's; a long one on a
// comment keeps the byline's one-line claim honest
const NAMES = { 'quietcartographer.bsky.social': 'The Quiet Cartographer', 'averyveryverylonghandle.bsky.social': 'A Very, Very, Very Long Display Name Indeed' };
// `embed` is the RECORD's (what the author wrote — a quote's record marks it a
// quote); `view` is the hydrated embed on the post view (what the lens reads
// for media). feed-row v11: the root carries a picture so the head is judged
// under the owner's load — text, then something under it, then the controls.
const post = (rkey, did, handle, ts, text, { likes = 0, replies = 0, reposts = 0, embed = null, view = null } = {}) => ({
  uri: `at://${did}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`, ...(view ? { embed: view } : {}),
  author: { did, handle, avatar: AV, ...(NAMES[handle] ? { displayName: NAMES[handle] } : {}) },
  record: { text, createdAt: ts, ...(embed ? { embed } : {}) }, indexedAt: ts,
  replyCount: replies, repostCount: reposts, likeCount: likes,
});

export const ROOT = 'at://did:plc:root/app.bsky.feed.post/root';

const root = post('root', 'did:plc:root', 'quietcartographer.bsky.social', '2026-08-30T08:00:00Z',
  'If we invent the Pneumatic Pie Tube Network today it will still be 49 years too late to follow up on the good work of the original proposal. Might as well just use it for quiche at that point, I guess.',
  { likes: 11, replies: 4, reposts: 1, view: images(img('root', { width: 1600, height: 1000 })) });

// four deep: the elbows, the indent, and the phone's 14px step all show
const d4 = { post: post('d4', 'did:plc:d4', 'moss.bsky.social', '2026-08-30T08:41:00Z',
  'Every buzzer sounding and every answer landing.', { likes: 0 }), replies: [] };
const d3 = { post: post('d3', 'did:plc:d3', 'thefrostwarning.bsky.social', '2026-08-30T08:39:00Z',
  'You could buzz in right after "the network" and the odds would still be with you', { likes: 3, replies: 1 }), replies: [d4] };
const d2 = { post: post('d2', 'did:plc:d2', 'erislovesgardens.bsky.social', '2026-08-30T08:36:00Z',
  '*presses buzzer, leans in, lips on the microphone*\n\nQUICHE', { likes: 2, replies: 1 }), replies: [d3] };
const d1 = { post: post('d1', 'did:plc:d1', 'averyveryverylonghandle.bsky.social', '2026-08-30T08:35:00Z',
  'The way you know who this is with 800% accuracy from this sentence alone', { likes: 11, replies: 1 }), replies: [d2] };
// a zero-like leaf, direct under the post: no rail, no fold, the narrow stack
const leaf = { post: post('leaf', 'did:plc:leaf', 'joshandtheargonauts.bsky.social', '2026-08-30T09:12:00Z',
  "Don't stand in the way of progress!", { likes: 0 }), replies: [] };

// a quote-response: it arrives through getQuotes, walled, with a reply of its own
const quote = post('q1', 'did:plc:q1', 'misterhooperspecial.bsky.social', '2026-08-30T08:50:00Z',
  "I'm sorry, but the cheeseburger is the optimal treat unit for this delivery method.",
  { likes: 5, replies: 1, embed: { $type: 'app.bsky.embed.record', record: { uri: ROOT, cid: 'cid-root' } } });
const quoteReply = { post: post('q1r', 'did:plc:q1r', 'briarpatchradio.bsky.social', '2026-08-30T09:05:00Z',
  'Quiche is a treat unit if you are brave.', { likes: 1 }), replies: [] };

export const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getFeedGenerator?': { view: { uri: WH, displayName: 'Discover', description: 'trending',
    likeCount: 39382, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
  'getFeed?': { feed: [{ post: root }] },
  [`getPostThread?uri=${encodeURIComponent(quote.uri)}`]: { thread: { post: quote, replies: [quoteReply] } },
  'getPostThread': { thread: { post: root, replies: [d1, leaf] } },
  [`getQuotes?uri=${encodeURIComponent(quote.uri)}`]: { posts: [] },
  'getQuotes': { posts: [quote] },
  'describeRepo': { handle: 'me.test' },
  'getPreferences': { preferences: [] },
  // signed in, the posture loads: an empty one, so nothing in the tree is masked
  'getProfile?actor=did%3Aplc%3Ame': { did: 'did:plc:me', handle: 'me.test', avatar: AV },
  'getMutes': { mutes: [] }, 'getBlocks': { blocks: [] },
  'getListMutes': { lists: [] }, 'getListBlocks': { lists: [] },
  'com.atproto.repo.createRecord': { uri: 'at://did:plc:me/app.bsky.feed.post/3lk', cid: 'lc' },
  'com.atproto.repo.deleteRecord': {},
};

// The same fake session manager e2e/no-downvote uses: signed in as did:plc:me,
// every PDS call routed through the fenced shim.
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
})();`;

export const THREAD_PATH = `/p?uri=${encodeURIComponent(ROOT)}`;

// Every comment the fixture renders, by id — the workflow counts against this,
// never against ">= 1", so a node that silently drops is a failure.
export const NODE_IDS = [d1, d2, d3, d4, leaf, { post: quote }, quoteReply].map((n) => n.post.uri);
