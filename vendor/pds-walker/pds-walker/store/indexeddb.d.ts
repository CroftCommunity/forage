import type { Store } from './memory.js';
/** A `Store` over IndexedDB database `name`. Opened lazily on first use; `put` keeps the newer of two. */
export declare function indexedDbStore(name: string): Store;
