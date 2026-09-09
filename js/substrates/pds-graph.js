// The pds-walker as a ring-graph source (plan 2026-09-08-plan-beta-pds-walker, P4).
// Walks the reader's rings direct from the data servers with the vendored library and maps
// the answer to the shape lens.js's ringGraph returns — `{ me, follows, followers,
// hopFollows }` — so rings.js's chain and every filter stay untouched.
//
// What the walk can and cannot know: it lists what each followee follows, so it knows who
// follows the reader BACK; it cannot list every follower (those records live in other
// repos). forage uses `followers` only to derive mutuals (follows ∩ followers), so
// `followers := those who follow back` gives the same mutuals — the equivalence row in
// test/lens-rings.test.js. `hop` here is the mutuals' follows, forage's own definition.
//
// Snapshots persist in IndexedDB (`forage.pds-walker`) so the next walk is rev-gated: a
// followee whose repo did not move is not listed again. Nothing here reads localStorage;
// the switch that turns this on is js/beta.js, consulted by the caller.
import { createWalker, createFetchTransport, indexedDbStore } from '../../vendor/pds-walker/pds-walker/index.js';

export const STORE_NAME = 'forage.pds-walker';

const minus = (set, did) => [...set].filter((d) => d !== did);

export function createPdsGraphSource({ transport = null, store = null, log = undefined } = {}) {
  const opts = log === undefined ? {} : { log };
  return async ({ did, needsHop }) => {
    const walker = createWalker({
      transport: transport ?? createFetchTransport(opts),
      store: store ?? indexedDbStore(STORE_NAME),
      ...opts,
    });
    await walker.walk(did);
    await walker.idle();
    const follows = minus(walker.ring('fol').members, did);
    const followers = minus(walker.ring('mut').members, did);
    const hopFollows = new Map();
    if (needsHop) {
      const s = store ?? indexedDbStore(STORE_NAME);
      for (const m of followers) {
        const snap = await s.get(m);
        if (snap) hopFollows.set(m, [...snap.follows]);
      }
    }
    return { me: did, follows, followers, hopFollows };
  };
}
