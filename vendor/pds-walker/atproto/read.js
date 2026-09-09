// Public, unauthenticated atproto reads — the PDA read path. "Read the records,
// not the pages": resolve a handle to a DID, a DID to its PDS, and read public
// profiles/records. Every fetch is injectable (fetchImpl) so the logic is
// unit-tested hermetically; the live path is exercised by the @live tier.
//
// Ported from skylite's network-verified src/atproto (repo.ts + oauth/resolve.ts).
// This module is read-only and needs no auth. OAuth (PKCE+PAR+DPoP), DPoP writes,
// and the sealed-box crypto are a separate, later phase — skylite is the
// reference for those until they land here.
export const PUBLIC_APPVIEW = 'https://public.api.bsky.app';
export const PLC_DIRECTORY = 'https://plc.directory';
export class AtprotoReadError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.name = 'AtprotoReadError';
        this.status = status;
    }
}
const fetchOf = (deps) => deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
async function getJson(res, what) {
    if (!res.ok)
        throw new AtprotoReadError(`${what} failed: ${res.status}`, res.status);
    return (await res.json());
}
/** Handle → DID via the public AppView (com.atproto.identity.resolveHandle). */
export async function resolveHandle(handle, deps = {}) {
    const url = new URL('/xrpc/com.atproto.identity.resolveHandle', deps.appView ?? PUBLIC_APPVIEW);
    url.searchParams.set('handle', handle.replace(/^@/, '').trim());
    const data = await getJson(await fetchOf(deps)(url, { headers: { accept: 'application/json' } }), 'resolveHandle');
    if (typeof data.did !== 'string')
        throw new AtprotoReadError('resolveHandle returned no DID');
    return data.did;
}
/** Pull the atproto PDS endpoint out of a resolved DID document. */
export function pdsEndpointFromDoc(doc) {
    const svc = (doc.service ?? []).find((s) => s.type === 'AtprotoPersonalDataServer' ||
        s.id === '#atproto_pds' ||
        s.id.endsWith('#atproto_pds'));
    return svc?.serviceEndpoint ?? null;
}
/** DID → PDS endpoint (did:plc via the directory, did:web via .well-known/did.json). */
export async function resolvePds(did, deps = {}) {
    let docUrl;
    if (did.startsWith('did:plc:')) {
        docUrl = `${deps.plcDirectory ?? PLC_DIRECTORY}/${did}`;
    }
    else if (did.startsWith('did:web:')) {
        const rest = did.slice('did:web:'.length);
        const parts = rest.split(':').map(decodeURIComponent);
        const host = parts[0];
        const path = parts.length > 1 ? parts.slice(1).join('/') + '/did.json' : '.well-known/did.json';
        docUrl = `https://${host}/${path}`;
    }
    else {
        throw new AtprotoReadError(`unsupported DID method: ${did}`);
    }
    const res = await fetchOf(deps)(docUrl, { headers: { accept: 'application/json' } });
    if (!res.ok)
        throw new AtprotoReadError(`DID resolution failed: ${res.status}`, res.status);
    const doc = (await res.json());
    const endpoint = pdsEndpointFromDoc(doc);
    if (!endpoint)
        throw new AtprotoReadError(`no PDS endpoint in DID document for ${did}`);
    return endpoint.replace(/\/+$/, '');
}
/** Resolve a handle or DID to its DID + PDS in one call. */
export async function resolveIdentity(handleOrDid, deps = {}) {
    const input = handleOrDid.replace(/^@/, '').trim();
    const did = input.startsWith('did:') ? input : await resolveHandle(input, deps);
    const pds = await resolvePds(did, deps);
    return { did, pds };
}
/** Public profile via the AppView. Open-world: only did+handle are required. */
export async function getProfile(actor, deps = {}) {
    const url = new URL('/xrpc/app.bsky.actor.getProfile', deps.appView ?? PUBLIC_APPVIEW);
    url.searchParams.set('actor', actor.replace(/^@/, '').trim());
    const data = await getJson(await fetchOf(deps)(url, { headers: { accept: 'application/json' } }), 'getProfile');
    if (typeof data.did !== 'string' || typeof data.handle !== 'string') {
        throw new AtprotoReadError('getProfile missing required did/handle');
    }
    return {
        did: data.did,
        handle: data.handle,
        ...(typeof data.displayName === 'string' ? { displayName: data.displayName } : {}),
        ...(typeof data.description === 'string' ? { description: data.description } : {}),
    };
}
