// Identity resolution for the walker (plan 2026-09-08 § Phase 3a): a DID to its PDS, or an
// honest `{ unknown: reason }`. A WRAPPER over `src/atproto/read.ts`'s `resolvePds`, which
// already does did:plc (plc.directory), did:web (.well-known, path form too), the
// `#atproto_pds` pick and the slash trim — SHARED-CODE.md rule 4 applies inside a repo too.
import { resolvePds } from '../../atproto/read.js';
// The reason must read on its own: the walker (Phase 5) logs it once per host, and the
// rings page shows it. A status when there is one, the cause when there is not.
function reasonOf(e) {
    if (e instanceof SyntaxError)
        return `bad JSON in DID document: ${e.message}`;
    if (e instanceof Error)
        return e.message; // AtprotoReadError included: its message already names status or cause
    return String(e);
}
/** Resolve `did` to its PDS endpoint (no trailing slash). Any failure is an `unknown` with a readable reason. */
export async function resolveDid(did, deps = {}) {
    try {
        const opts = deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl };
        return { pds: await resolvePds(did, opts) };
    }
    catch (e) {
        return { unknown: reasonOf(e) };
    }
}
