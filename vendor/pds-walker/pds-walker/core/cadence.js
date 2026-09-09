const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Research § 4: me every minute, ring 1 every 10 minutes, the outer rings daily (hop2 on hop's clock — OQ6 c). */
export const defaultPolicy = Object.freeze({
    refreshMs: Object.freeze({ me: MINUTE, mut: 10 * MINUTE, fol: 10 * MINUTE, hop: DAY, hop2: DAY }),
    perHostConcurrency: 4,
    ring2Parallel: 10,
});
/** Merge overrides onto the defaults, key by key inside `refreshMs` (a shallow merge would drop the other rings). */
export function resolvePolicy(overrides) {
    if (overrides === undefined)
        return defaultPolicy;
    return Object.freeze({
        refreshMs: Object.freeze({ ...defaultPolicy.refreshMs, ...(overrides.refreshMs ?? {}) }),
        perHostConcurrency: overrides.perHostConcurrency ?? defaultPolicy.perHostConcurrency,
        ring2Parallel: overrides.ring2Parallel ?? defaultPolicy.ring2Parallel,
    });
}
/** The repos whose snapshot is at least `refreshMs[ring]` old — due for a rev check, in snapshot order. */
export function due({ snapshots, now, policy, ring }) {
    const list = snapshots instanceof Map ? [...snapshots.values()] : snapshots;
    const limit = policy.refreshMs[ring];
    return list.filter((s) => now - s.fetchedAt >= limit).map((s) => s.did);
}
/** The followees whose rev moved are the only ring-2 subtrees to re-walk (`hop` and `hop2` alike). */
export function ring2Targets({ moved }) {
    return [...new Set(moved)];
}
