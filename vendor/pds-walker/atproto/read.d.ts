export declare const PUBLIC_APPVIEW = "https://public.api.bsky.app";
export declare const PLC_DIRECTORY = "https://plc.directory";
export interface ReadDeps {
    readonly fetchImpl?: typeof fetch;
    readonly appView?: string;
    readonly plcDirectory?: string;
}
export interface DidService {
    readonly id: string;
    readonly type: string;
    readonly serviceEndpoint: string;
}
export interface DidDocument {
    readonly id: string;
    readonly service?: readonly DidService[];
}
export interface Identity {
    readonly did: string;
    readonly pds: string;
}
export interface Profile {
    readonly did: string;
    readonly handle: string;
    readonly displayName?: string;
    readonly description?: string;
}
export declare class AtprotoReadError extends Error {
    readonly status: number | undefined;
    constructor(message: string, status?: number);
}
/** Handle → DID via the public AppView (com.atproto.identity.resolveHandle). */
export declare function resolveHandle(handle: string, deps?: ReadDeps): Promise<string>;
/** Pull the atproto PDS endpoint out of a resolved DID document. */
export declare function pdsEndpointFromDoc(doc: DidDocument): string | null;
/** DID → PDS endpoint (did:plc via the directory, did:web via .well-known/did.json). */
export declare function resolvePds(did: string, deps?: ReadDeps): Promise<string>;
/** Resolve a handle or DID to its DID + PDS in one call. */
export declare function resolveIdentity(handleOrDid: string, deps?: ReadDeps): Promise<Identity>;
/** Public profile via the AppView. Open-world: only did+handle are required. */
export declare function getProfile(actor: string, deps?: ReadDeps): Promise<Profile>;
