const PAUSE_BELOW = 10;
/**
 * The library's default logger: the posture of `src/log.ts` without its browser switch —
 * `warn`/`error` reach the console tagged `[pds-walker]`, `debug`/`info` are silent. A
 * page passes its own `log` to get the `?debug=1` behaviour.
 */
export function defaultLogger() {
    const noop = () => undefined;
    return {
        debug: noop,
        info: noop,
        warn: (...args) => { console.warn('[pds-walker]', ...args); },
        error: (...args) => { console.error('[pds-walker]', ...args); },
    };
}
export function hostLimiter(opts = {}) {
    const perHost = opts.perHost ?? 4;
    const now = opts.now ?? Date.now;
    const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const log = opts.log ?? defaultLogger();
    const threshold = opts.threshold ?? PAUSE_BELOW;
    const hosts = new Map();
    const stateOf = (host) => {
        let s = hosts.get(host);
        if (s === undefined) {
            s = { inFlight: 0, pausedUntil: 0, waiters: [], pausedLogged: false };
            hosts.set(host, s);
        }
        return s;
    };
    const wake = (s) => { s.waiters.shift()?.(); };
    return {
        async run(host, fn) {
            const s = stateOf(host);
            while (s.inFlight >= perHost)
                await new Promise((resolve) => s.waiters.push(resolve));
            while (s.pausedUntil > now())
                await sleep(s.pausedUntil - now());
            if (s.pausedLogged) {
                s.pausedLogged = false;
                log.info('pds-walker: host resumed', host);
            }
            s.inFlight++;
            try {
                return await fn();
            }
            finally {
                s.inFlight--;
                wake(s);
            }
        },
        observe(host, res) {
            // Both headers, or nothing: `Number(null)` is 0, which would read a missing Remaining as
            // "budget spent" and a missing Reset as the epoch — the M2 test that caught it.
            const remainingRaw = res.headers.get('ratelimit-remaining');
            const resetRaw = res.headers.get('ratelimit-reset');
            if (remainingRaw === null || resetRaw === null)
                return;
            const remaining = Number(remainingRaw);
            const resetSeconds = Number(resetRaw);
            if (!Number.isFinite(remaining) || !Number.isFinite(resetSeconds))
                return;
            if (remaining >= threshold)
                return;
            const s = stateOf(host);
            const until = resetSeconds * 1000;
            if (until <= s.pausedUntil)
                return;
            s.pausedUntil = until;
            if (!s.pausedLogged) {
                s.pausedLogged = true;
                log.warn('pds-walker: host paused', host, remaining, Math.max(0, Math.round((until - now()) / 1000)));
            }
        },
    };
}
