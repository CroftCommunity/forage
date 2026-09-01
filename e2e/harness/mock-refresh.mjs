// The board a REFRESH mock is judged against: mock-board's load (MOCKS.md P2 —
// the 64-grapheme name, the four-digit counts, the portrait stage) plus the one
// thing that board cannot express — the feed CHANGING while the reader is in it.
//
// `getFeed?` is declared as a sequence: the first call is the board the reader
// is looking at, every call after it carries three posts that were not there.
// That is what the refresh control exists to notice, and a fixture that returns
// the same page twice can only ever capture the at-rest state.
import { RESPONSES as BOARD, BOARD_PATH } from './mock-board.mjs';

const AV = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const NEW_T = '2026-08-30T23:%M:00Z';
// Three arrivals, at the widths the live surface shows (P2): a chosen name at
// Bluesky's 64-grapheme cap, a handle-only author, and an emoji name.
const arrival = (rkey, handle, displayName, text, mins) => ({ post: {
  uri: `at://did:plc:new${rkey}/app.bsky.feed.post/${rkey}`, cid: `cid-${rkey}`,
  author: { did: `did:plc:new${rkey}`, handle, avatar: AV, ...(displayName ? { displayName } : {}) },
  record: { text, createdAt: NEW_T.replace('%M', String(mins).padStart(2, '0')), facets: [] },
  indexedAt: NEW_T.replace('%M', String(mins).padStart(2, '0')),
  replyCount: 4, repostCount: 2, likeCount: 31,
} });

export const ARRIVALS = [
  arrival('n1', 'quietcartographer.bsky.social', 'The Quiet Cartographer of the Northern Fenlands & Bog Society',
    'the fen is holding water again after three dry weeks, which is the whole point of the ditch work', 58),
  arrival('n2', 'briarpatchradio.bsky.social', null,
    'posted while you were reading something else', 55),
  arrival('n3', 'erislovesgardens.bsky.social', 'Eris 🌿🐸',
    'third one, so the count is not 1 and not a round ten', 52),
];

const firstPage = BOARD['getFeed?'];

export const RESPONSES = Object.freeze({
  ...BOARD,
  // The sequence: page one as it was, then page one as it became.
  'getFeed?': { __sequence: [firstPage, { ...firstPage, feed: [...ARRIVALS, ...firstPage.feed] }] },
});

export { BOARD_PATH };
