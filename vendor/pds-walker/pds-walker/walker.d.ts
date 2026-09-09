import type { Did, RingId, Ring, Logger } from './core/rings.js';
import type { PolicyOverrides } from './core/cadence.js';
import type { Store } from './store/memory.js';
/** What the walker needs from the network — three calls, each honest on failure. */
export type Transport = {
    resolve(did: string): Promise<{
        readonly pds: string;
    } | {
        readonly unknown: string;
    }>;
    latestRev(pds: string, did: string): Promise<string | {
        readonly unknown: string;
    }>;
    listFollows(pds: string, did: string): Promise<readonly Did[] | {
        readonly unknown: string;
    }>;
};
/** A host the walker has talked to: reachable, or unknown since a moment, with the reason. */
export type HostState = {
    readonly host: string;
    readonly state: 'ok' | 'unknown';
    readonly since: number;
    readonly reason?: string;
};
/** Background-fill progress: followees listed so far, out of how many. */
export type Progress = {
    readonly done: number;
    readonly total: number;
};
export type WalkerEvent = 'ring' | 'host' | 'progress';
export type Walker = {
    /** The current answer for a ring — never throws, never empty by accident. */
    ring(id: RingId): Ring;
    /** Read what the store already knows for `me`, with no network — the warm start. */
    load(me: Did): Promise<void>;
    /** Resolve and list ring 1 (awaited); fill the outer rings in the background. */
    walk(me: Did): Promise<void>;
    /** Rev-gated: ask the rev of due repos, re-list only the movers, walk any new followee. */
    refresh(): Promise<void>;
    /** Resolves when no background work is running. */
    idle(): Promise<void>;
    hosts(): HostState[];
    on(event: WalkerEvent, fn: (e: unknown) => void): () => void;
    /** Cancel background work; what has been learned stays. */
    stop(): void;
};
export type WalkerDeps = {
    readonly transport: Transport;
    readonly store: Store;
    readonly policy?: PolicyOverrides;
    readonly now?: () => number;
    readonly log?: Logger;
};
export declare function createWalker(deps: WalkerDeps): Walker;
