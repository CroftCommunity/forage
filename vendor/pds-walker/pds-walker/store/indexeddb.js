const STORE = 'snapshots';
function open(name) {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'did' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
    });
}
function request(r) {
    return new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
    });
}
function done(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
}
/** A `Store` over IndexedDB database `name`. Opened lazily on first use; `put` keeps the newer of two. */
export function indexedDbStore(name) {
    let db;
    const database = () => (db ??= open(name));
    return {
        async get(did) {
            const tx = (await database()).transaction(STORE, 'readonly');
            const row = await request(tx.objectStore(STORE).get(did));
            return row ?? null;
        },
        async put(snapshot) {
            const tx = (await database()).transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            const have = await request(store.get(snapshot.did));
            if (have === undefined || snapshot.fetchedAt >= have.fetchedAt)
                store.put(snapshot);
            await done(tx);
        },
        async all() {
            const tx = (await database()).transaction(STORE, 'readonly');
            return request(tx.objectStore(STORE).getAll());
        },
    };
}
