// The data servers as a posts source for the people-scope reel (plan
// 2026-09-14-plan-clips, Phase 6). The sibling of js/substrates/pds-graph.js: where that
// one answers "who is in the ring" from the repos, this one answers "what did this member
// post" — `com.atproto.repo.listRecords` over `app.bsky.feed.post` on the member's own
// PDS, filtered like the AppView's author feed would filter, translated by
// js/pds-posts.js. Nothing here reads the AppView; the lens hydrates counts and labels
// from it afterwards, when it answers.
//
// The shape the lens's reel asks for: `({ did, filter, cursor, limit }) →
// { feed: [{ post }], cursor } | null`. `null` means "not this member" (a DID this path
// cannot resolve, an unsupported method) and the lens falls through to the AppView for
// that member alone. A PDS that fails is an ERROR, not null: the wave records it with
// words, as it does for the AppView.
//
// COST. One `listRecords` page is 100 posts; a member with no media in their last 100
// costs one page and yields nothing — the reel's wave planner then does not ask them
// again on that cursor. MAX_PAGES bounds a single ask so one prolific text poster cannot
// spend a wave's budget alone. Identity is cached per did for the session: a DID document
// and a profile record per member, once.
import { resolvePds, PLC_DIRECTORY } from '../../vendor/pds-walker/atproto/read.js';
import { recordToView, matchesFilter, handleFromDoc } from '../pds-posts.js';

const PAGE = 100;
const MAX_PAGES = 3;
const COLLECTION = 'app.bsky.feed.post';

export function createPdsPostsSource({ fetchImpl = (...a) => fetch(...a), plcDirectory = PLC_DIRECTORY } = {}) {
  const identity = new Map(); // did → Promise<{ pds, handle, displayName, avatarCid }>
  const getJson = async (url) => {
    const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`);
    return res.json();
  };
  const resolve = (did) => {
    if (!identity.has(did)) {
      identity.set(did, (async () => {
        const docUrl = did.startsWith('did:plc:') ? `${plcDirectory}/${did}` : null;
        const [pds, doc] = await Promise.all([
          resolvePds(did, { fetchImpl, plcDirectory }),
          docUrl ? getJson(docUrl).catch(() => null) : Promise.resolve(null),
        ]);
        // the profile is a nicety (a name, a picture); a repo without one is fine
        const profile = await getJson(`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=app.bsky.actor.profile&rkey=self`).catch(() => null);
        return { pds, handle: handleFromDoc(doc), displayName: profile?.value?.displayName?.trim() || null, avatarCid: profile?.value?.avatar?.ref?.$link || null };
      })().catch((e) => { identity.delete(did); throw e; }));
    }
    return identity.get(did);
  };

  return async function pdsPosts({ did, filter, cursor = null, limit = 25 }) {
    if (!did.startsWith('did:plc:') && !did.startsWith('did:web:')) return null;
    const who = await resolve(did);
    const out = [];
    let next = cursor;
    for (let page = 0; page < MAX_PAGES && out.length < limit; page++) {
      const url = `${who.pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${COLLECTION}&limit=${PAGE}` + (next ? `&cursor=${encodeURIComponent(next)}` : '');
      const body = await getJson(url);
      for (const rec of body.records || []) {
        if (!matchesFilter(rec.value, filter)) continue;
        const rkey = String(rec.uri || '').split('/').pop();
        out.push({ post: recordToView({ did, rkey, cid: rec.cid, record: rec.value, author: who }) });
      }
      next = typeof body.cursor === 'string' && body.cursor ? body.cursor : null;
      if (!next) break;
    }
    return { feed: out.slice(0, limit), cursor: next };
  };
}
