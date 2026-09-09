import type { Logger } from '../core/rings.js';
/** What `pds.ts` needs: run a call under the cap, and let the limiter read the response's headers. */
export type Limiter = {
    run<T>(host: string, fn: () => Promise<T>): Promise<T>;
    observe(host: string, res: Response): void;
};
export type LimiterOptions = {
    readonly perHost?: number;
    readonly now?: () => number;
    readonly sleep?: (ms: number) => Promise<void>;
    readonly log?: Logger;
    /** Pause when `RateLimit-Remaining` drops below this. */
    readonly threshold?: number;
};
/**
 * The library's default logger: the posture of `src/log.ts` without its browser switch —
 * `warn`/`error` reach the console tagged `[pds-walker]`, `debug`/`info` are silent. A
 * page passes its own `log` to get the `?debug=1` behaviour.
 */
export declare function defaultLogger(): Logger;
export declare function hostLimiter(opts?: LimiterOptions): Limiter;
