/** Injectable fetch, so every test runs with no network. Declared here so the emitted `.d.ts` imports nothing from read.ts. */
export type ResolveDeps = {
    readonly fetchImpl?: typeof fetch;
};
/** A resolved host, or the reason it could not be resolved — never a throw. */
export type Resolved = {
    readonly pds: string;
} | {
    readonly unknown: string;
};
/** Resolve `did` to its PDS endpoint (no trailing slash). Any failure is an `unknown` with a readable reason. */
export declare function resolveDid(did: string, deps?: ResolveDeps): Promise<Resolved>;
