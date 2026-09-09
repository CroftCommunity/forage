import type { Did, RepoSnapshot, RingId } from './rings.js';
/** Refresh intervals per ring, the per-host in-flight cap, and ring-2 fan-out. */
export type Policy = {
    readonly refreshMs: Readonly<Record<RingId, number>>;
    /** The PDS rate limit is per host (3,000 / 5 min per IP), so the cap is per host too. */
    readonly perHostConcurrency: number;
    /** How many followees' listings run at once while the outer rings fill in the background. */
    readonly ring2Parallel: number;
};
/** Research § 4: me every minute, ring 1 every 10 minutes, the outer rings daily (hop2 on hop's clock — OQ6 c). */
export declare const defaultPolicy: Policy;
/** Partial overrides for `createWalker({ policy })`; `refreshMs` merges per key. */
export type PolicyOverrides = {
    readonly refreshMs?: Partial<Record<RingId, number>>;
    readonly perHostConcurrency?: number;
    readonly ring2Parallel?: number;
};
/** Merge overrides onto the defaults, key by key inside `refreshMs` (a shallow merge would drop the other rings). */
export declare function resolvePolicy(overrides: PolicyOverrides | undefined): Policy;
type SnapshotInput = ReadonlyMap<Did, RepoSnapshot> | readonly RepoSnapshot[];
/** The repos whose snapshot is at least `refreshMs[ring]` old — due for a rev check, in snapshot order. */
export declare function due({ snapshots, now, policy, ring }: {
    readonly snapshots: SnapshotInput;
    readonly now: number;
    readonly policy: Policy;
    readonly ring: RingId;
}): Did[];
/** The followees whose rev moved are the only ring-2 subtrees to re-walk (`hop` and `hop2` alike). */
export declare function ring2Targets({ moved }: {
    readonly moved: readonly Did[];
}): Did[];
export {};
