import type { Did, Rev } from '../core/rings.js';
import type { Limiter } from './limiter.js';
/** Injectable fetch, and the per-host limiter every call runs under (3c). */
export type PdsDeps = {
    readonly fetchImpl?: typeof fetch;
    readonly limiter?: Limiter;
};
/** The failure shape shared by every transport call. */
export type Unknown = {
    readonly unknown: string;
};
/** `com.atproto.sync.getLatestCommit` → the repo's current rev, or unknown. */
export declare function latestRev(pds: string, did: string, deps?: PdsDeps): Promise<Rev | Unknown>;
/**
 * `com.atproto.repo.listRecords` over `app.bsky.graph.follow`, 100 per page, following
 * `cursor` until a page has none. A last page of records still carries a cursor on the
 * reference PDS; the page after it is empty with no cursor (harvested 2026-09-08). An empty
 * cursor string is treated as absent.
 */
export declare function listFollows(pds: string, did: string, deps?: PdsDeps): Promise<readonly Did[] | Unknown>;
