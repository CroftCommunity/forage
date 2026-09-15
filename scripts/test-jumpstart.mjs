// The live-proof jumpstart — the pure half (plan 2026-09-14-plan-jumpstart-follow-all,
// O1; owner 2026-09-14: "script is fine, go ahead"). A starter pack whose members are
// only our own test accounts, so `e2e/follow-all-live.workflow.mjs` can follow and
// unfollow everyone in it without notifying a stranger. Three record kinds, shapes per
// the official lexicons fetched from upstream main 2026-09-14: app.bsky.graph.list
// (required name, purpose, createdAt), app.bsky.graph.listitem (subject, list,
// createdAt), app.bsky.graph.starterpack (name, list, createdAt; feeds optional, ≤ 3).
// The runner that signs in and writes them is scripts/make-test-jumpstart.mjs.

export const NAME = 'Croft test accounts';
export const DESCRIPTION = 'The Croft workspace’s own test accounts, for proving Follow all in Forage. Nobody real is in here.';
export const LIST_COLLECTION = 'app.bsky.graph.list';
export const ITEM_COLLECTION = 'app.bsky.graph.listitem';
export const PACK_COLLECTION = 'app.bsky.graph.starterpack';
// defs#listPurpose: "used for only for reference purposes such as within a starter pack"
export const REFERENCE_LIST = 'app.bsky.graph.defs#referencelist';

const DID_RE = /^did:[a-z]+:[A-Za-z0-9._:%-]+$/;

export function listRecord({ now }) {
  return { $type: LIST_COLLECTION, purpose: REFERENCE_LIST, name: NAME, description: DESCRIPTION, createdAt: now };
}

/** One listitem per member did; the curator is dropped (a pack cannot usefully name its own author). */
export function itemRecords({ listUri, members, curatorDid, now }) {
  return members
    .map((did) => { if (!DID_RE.test(did)) throw new Error(`member is not a did: ${JSON.stringify(did)}`); return did; })
    .filter((did) => did !== curatorDid)
    .map((did) => ({ $type: ITEM_COLLECTION, subject: did, list: listUri, createdAt: now }));
}

export function packRecord({ listUri, now }) {
  return { $type: PACK_COLLECTION, name: NAME, description: DESCRIPTION, list: listUri, createdAt: now };
}
