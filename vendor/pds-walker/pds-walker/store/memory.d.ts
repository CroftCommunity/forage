import type { Did, RepoSnapshot } from '../core/rings.js';
/** Where snapshots live between sessions. Every method returns copies; `put` keeps the newer of two. */
export type Store = {
    get(did: Did): Promise<RepoSnapshot | null>;
    put(snapshot: RepoSnapshot): Promise<void>;
    all(): Promise<RepoSnapshot[]>;
};
/** An in-memory store: tests, Node scripts, and the fallback when IndexedDB is denied. */
export declare function memoryStore(): Store;
