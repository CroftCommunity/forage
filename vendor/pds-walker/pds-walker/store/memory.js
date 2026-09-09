const copy = (s) => ({ ...s, follows: [...s.follows] });
/** An in-memory store: tests, Node scripts, and the fallback when IndexedDB is denied. */
export function memoryStore() {
    const rows = new Map();
    return {
        get: (did) => Promise.resolve(rows.has(did) ? copy(rows.get(did)) : null),
        put: (snapshot) => {
            // "Keep the newer": an older snapshot must never overwrite what a later fetch stored;
            // an equal fetchedAt is newer information (a re-list at the same instant) and wins.
            const have = rows.get(snapshot.did);
            if (have === undefined || snapshot.fetchedAt >= have.fetchedAt)
                rows.set(snapshot.did, copy(snapshot));
            return Promise.resolve();
        },
        all: () => Promise.resolve([...rows.values()].map(copy)),
    };
}
