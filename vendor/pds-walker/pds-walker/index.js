/** pds-walker — the rev-gated ring walker. The library's own version clock (plan 2026-09-08, D3). */
export const VERSION = '0.1.0';
export { rings, RING_IDS } from './core/rings.js';
export { decide } from './core/revgate.js';
export { defaultPolicy, resolvePolicy, due, ring2Targets } from './core/cadence.js';
export { resolveDid } from './transport/resolve.js';
export { latestRev, listFollows } from './transport/pds.js';
export { memoryStore } from './store/memory.js';
export { indexedDbStore } from './store/indexeddb.js';
import { resolveDid as _resolveDid } from './transport/resolve.js';
import { latestRev as _latestRev, listFollows as _listFollows } from './transport/pds.js';
import { hostLimiter, defaultLogger } from './transport/limiter.js';
export { createWalker } from './walker.js';
/** The transport a consumer gets: identity resolution, the two PDS calls, and the per-host limiter, composed. */
export function createFetchTransport(opts = {}) {
    const log = opts.log ?? defaultLogger();
    const limiter = hostLimiter({
        ...(opts.perHost === undefined ? {} : { perHost: opts.perHost }),
        ...(opts.now === undefined ? {} : { now: opts.now }),
        ...(opts.sleep === undefined ? {} : { sleep: opts.sleep }),
        log,
    });
    const deps = { ...(opts.fetchImpl === undefined ? {} : { fetchImpl: opts.fetchImpl }), limiter };
    return {
        resolve: (did) => _resolveDid(did, opts.fetchImpl === undefined ? {} : { fetchImpl: opts.fetchImpl }),
        latestRev: (pds, did) => _latestRev(pds, did, deps),
        listFollows: (pds, did) => _listFollows(pds, did, deps),
    };
}
