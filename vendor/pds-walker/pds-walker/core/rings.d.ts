/** An atproto DID. */
export type Did = `did:${string}`;
/** A repo revision as `com.atproto.sync.getLatestCommit` reports it (a TID string). */
export type Rev = string;
/** What the walker remembers about one repo: its host, its rev, its follows, and when. */
export type RepoSnapshot = {
    readonly did: Did;
    readonly pds: string;
    readonly rev: Rev;
    readonly follows: readonly Did[];
    readonly fetchedAt: number;
};
/**
 * The five rings, tightest first. `hop` is what forage ships (everyone my MUTUALS follow);
 * `hop2` is the research's ring 2 (everyone my FOLLOWS follow). Owner decision 2026-09-08
 * (OQ6): both, under two ids. The order of this array IS the containment chain.
 */
export type RingId = 'me' | 'mut' | 'fol' | 'hop' | 'hop2';
export declare const RING_IDS: readonly RingId[];
/** A ring as the walker answers it: who is in it, how stale, and whether every source was known. */
export type Ring = {
    readonly id: RingId;
    readonly members: ReadonlySet<Did>;
    /** The OLDEST `fetchedAt` among the snapshots this ring was computed from; 0 when none. */
    readonly asOf: number;
    /** True only when every snapshot the ring needs was present. Membership never depends on it. */
    readonly complete: boolean;
};
/** The shape of `src/log.ts`'s `log` — a type only, so the core stays I/O-free (Pass 3). */
export type Logger = {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
};
type SnapshotInput = ReadonlyMap<Did, RepoSnapshot> | readonly RepoSnapshot[];
/**
 * Compute all five rings for `me` from whatever snapshots are known. Each ring contains the
 * tighter ones by construction, so `me ⊂ mut ⊂ fol ⊂ hop ⊂ hop2` always holds.
 */
export declare function rings({ me, snapshots }: {
    readonly me: Did;
    readonly snapshots: SnapshotInput;
}): Record<RingId, Ring>;
export {};
