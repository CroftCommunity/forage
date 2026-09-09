const FOLLOW = 'app.bsky.graph.follow';
const PAGE = 100;
const hostOf = (pds) => { try {
    return new URL(pds).host;
}
catch {
    return pds;
} };
const fetchOf = (deps) => deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
async function getJson(url, host, deps) {
    const doFetch = async () => {
        const r = await fetchOf(deps)(url, { headers: { accept: 'application/json' } });
        deps.limiter?.observe(host, r);
        return r;
    };
    let res;
    try {
        res = deps.limiter === undefined ? await doFetch() : await deps.limiter.run(host, doFetch);
    }
    catch (e) {
        return { ok: false, reason: `${host}: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (!res.ok)
        return { ok: false, reason: `${host}: ${res.status}` };
    try {
        const parsed = await res.json();
        return { ok: true, body: parsed };
    }
    catch (e) {
        return { ok: false, reason: `${host}: bad JSON (${e instanceof Error ? e.message : String(e)})` };
    }
}
/** `com.atproto.sync.getLatestCommit` → the repo's current rev, or unknown. */
export async function latestRev(pds, did, deps = {}) {
    const url = `${pds}/xrpc/com.atproto.sync.getLatestCommit?did=${encodeURIComponent(did)}`;
    const r = await getJson(url, hostOf(pds), deps);
    if (!r.ok)
        return { unknown: `getLatestCommit ${r.reason}` };
    const body = r.body;
    const rev = typeof body === 'object' && body !== null && 'rev' in body ? body.rev : undefined;
    return typeof rev === 'string' && rev.length > 0 ? rev : { unknown: `getLatestCommit ${hostOf(pds)}: no rev in body` };
}
/**
 * `com.atproto.repo.listRecords` over `app.bsky.graph.follow`, 100 per page, following
 * `cursor` until a page has none. A last page of records still carries a cursor on the
 * reference PDS; the page after it is empty with no cursor (harvested 2026-09-08). An empty
 * cursor string is treated as absent.
 */
export async function listFollows(pds, did, deps = {}) {
    const subjects = [];
    let cursor;
    for (let page = 1;; page++) {
        const url = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${FOLLOW}&limit=${PAGE}` +
            (cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`);
        const r = await getJson(url, hostOf(pds), deps);
        if (!r.ok)
            return { unknown: `listRecords ${r.reason} at page ${page}` };
        const raw = r.body;
        const body = typeof raw === 'object' && raw !== null ? raw : {};
        const records = Array.isArray(body.records) ? body.records : [];
        for (const rec of records) {
            const subject = rec?.value?.subject;
            if (typeof subject === 'string' && subject.startsWith('did:'))
                subjects.push(subject);
        }
        const next = body.cursor;
        if (typeof next !== 'string' || next === '')
            return subjects;
        cursor = next;
    }
}
