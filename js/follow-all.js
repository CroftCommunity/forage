// Follow all / Unfollow all on a jumpstart — the pure core.
// Plan: plans/2026-09-14-plan-jumpstart-follow-all.md (Phase 0).
//
// Three questions, no network: WHO to follow (planFollows — the official
// client's four skips plus posture, every skip counted with its reason, never
// silent), HOW MANY per applyWrites call (chunk — 50, the official client's
// batch), and WHAT is written (followRecord — the lexicon's four fields and
// nothing else, `via` naming the jumpstart it came from, D2).
//
// Members arrive already shaped by lens.listMembers(): viewer state folded
// into flags, posture already applied as `hidden`. That keeps this module
// free of the posture object — the lens is the authority on what Forage shows,
// and this module only reads its verdict.

export const FOLLOW_TYPE = 'app.bsky.graph.follow';
export const CHUNK_SIZE = 50;

// The skip reasons in the order they are tested. A member that is several at
// once is counted ONCE, under the first — the page's counts have to add up.
const SKIPS = [
  ['me', (m, myDid) => myDid !== null && m.did === myDid],
  ['following', (m) => !!m.followingUri],
  ['blocked', (m) => !!m.blocked],
  ['muted', (m) => !!m.muted],
  ['hidden', (m) => !!m.hidden],
];

const EMPTY_COUNTS = () => ({ follow: 0, me: 0, following: 0, blocked: 0, muted: 0, hidden: 0 });

export function planFollows(members, { myDid = null } = {}) {
  const skipReason = (m) => (SKIPS.find(([, test]) => test(m, myDid)) || [null])[0];
  const decided = members.map((m) => ({ member: m, reason: skipReason(m) }));
  const follow = decided.filter((d) => d.reason === null).map((d) => d.member);
  const skipped = decided.filter((d) => d.reason !== null);
  const counts = skipped.reduce((acc, s) => ({ ...acc, [s.reason]: acc[s.reason] + 1 }),
    { ...EMPTY_COUNTS(), follow: follow.length });
  return { follow, skipped, counts };
}

// D4: the mirror. The list is the unit — every member the viewer follows,
// whenever the follow was made; the uri comes from the list's viewer state.
export function planUnfollows(members) {
  const unfollow = members.filter((m) => !!m.followingUri);
  return { unfollow, counts: { unfollow: unfollow.length, notFollowed: members.length - unfollow.length } };
}

export function chunk(items, size = CHUNK_SIZE) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

export function followRecord({ did, via, now }) {
  if (typeof did !== 'string' || !did.startsWith('did:')) throw new Error(`follow-all: subject must be a did, got ${JSON.stringify(did)}`);
  if (!via || typeof via.uri !== 'string' || typeof via.cid !== 'string') {
    throw new Error('follow-all: via must be a strongRef { uri, cid } — the jumpstart the follow came through');
  }
  return { $type: FOLLOW_TYPE, subject: did, createdAt: now, via: { uri: via.uri, cid: via.cid } };
}
