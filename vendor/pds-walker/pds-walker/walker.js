// The walker (plan 2026-09-08 § Phase 5): core + transport + store + clock wired into the
// public surface. Ring 1 (me, my follows) is awaited; the outer rings fill in the background
// as each followee's follows are listed, and `refresh()` is rev-gated — only repos whose rev
// moved are listed again. Two invariants hold throughout: unknown is not empty (a failing
// host marks itself and leaves the last answer standing), and the containment chain holds
// after every event (rings() guarantees it by construction).
import { rings as computeRings, RING_IDS } from './core/rings.js';
import { decide } from './core/revgate.js';
import { resolvePolicy, due as dueRepos, ring2Targets } from './core/cadence.js';
import { defaultLogger } from './transport/limiter.js';
const hostOf = (pds) => { try {
    return new URL(pds).host;
}
catch {
    return pds;
} };
const directoryOf = (did) => (did.startsWith('did:web:') ? did.slice('did:web:'.length).replace(/:.*/, '') : 'plc.directory');
const sameRing = (a, b) => a.complete === b.complete && a.asOf === b.asOf && a.members.size === b.members.size && [...a.members].every((d) => b.members.has(d));
export function createWalker(deps) {
    const { transport, store } = deps;
    const policy = resolvePolicy(deps.policy);
    const now = deps.now ?? Date.now;
    const log = deps.log ?? defaultLogger();
    const snaps = new Map();
    const hostStates = new Map();
    const listeners = { ring: new Set(), host: new Set(), progress: new Set() };
    let me;
    const emptyRings = () => Object.fromEntries(RING_IDS.map((id) => [id, Object.freeze({ id, members: new Set(), asOf: 0, complete: false })]));
    let current = emptyRings();
    let stopped = false;
    let background = Promise.resolve();
    const emit = (event, e) => { for (const fn of listeners[event])
        fn(e); };
    // Recompute from the in-memory mirror of the store; emit only the rings that changed, in
    // chain order — so for one listing a `hop` event always precedes the `hop2` event.
    const compute = (who) => {
        const next = computeRings({ me: who, snapshots: snaps });
        for (const id of RING_IDS) {
            const was = current[id];
            const is = next[id];
            if (sameRing(was, is))
                continue;
            if (was.complete !== is.complete)
                log.info('pds-walker: ring', id, is.members.size, is.asOf, is.complete);
            emit('ring', is);
        }
        current = next;
    };
    const markUnknown = (host, reason) => {
        const was = hostStates.get(host);
        if (was?.state === 'unknown')
            return; // once per host, not per call
        const state = { host, state: 'unknown', since: now(), reason };
        hostStates.set(host, state);
        log.warn('pds-walker: host unknown', host, reason);
        emit('host', state);
    };
    const markOk = (host) => {
        const was = hostStates.get(host);
        if (was?.state === 'ok')
            return;
        const state = { host, state: 'ok', since: now() };
        hostStates.set(host, state);
        if (was !== undefined)
            emit('host', state);
    };
    const remember = async (s) => { snaps.set(s.did, s); await store.put(s); };
    const checkRev = async (did) => {
        const resolved = await transport.resolve(did);
        if ('unknown' in resolved) {
            markUnknown(directoryOf(did), resolved.unknown);
            return { verdict: 'unknown' };
        }
        markOk(directoryOf(did));
        const host = hostOf(resolved.pds);
        const latest = await transport.latestRev(resolved.pds, did);
        // A rev we could not read is an unknown host whether or not a snapshot exists: the gate
        // would say "relist" for a repo never listed, but a listing needs the rev it is filed
        // under, so the honest answer is to mark the host and leave the ring incomplete.
        if (typeof latest !== 'string') {
            markUnknown(host, latest.unknown);
            return { verdict: 'unknown' };
        }
        markOk(host);
        const stored = snaps.get(did);
        const verdict = decide({ snapshot: stored, latestRev: latest });
        if (verdict === 'relist' && stored !== undefined)
            log.debug('pds-walker: rev moved', did, stored.rev, latest);
        return { verdict, pds: resolved.pds, rev: latest };
    };
    const listRepo = async (did, pds, rev) => {
        const follows = await transport.listFollows(pds, did);
        if ('unknown' in follows) {
            markUnknown(hostOf(pds), follows.unknown);
            return;
        }
        // (the host was marked ok by the rev check that always precedes a listing)
        await remember({ did, pds, rev, follows: [...follows], fetchedAt: now() });
    };
    // Check the rev and, if it moved (or the repo is new), list it — the unit of the walk.
    const syncRepo = async (did) => {
        const c = await checkRev(did);
        if (c.verdict === 'relist')
            await listRepo(did, c.pds, c.rev);
    };
    const parallel = async (items, n, fn) => {
        let i = 0;
        const worker = async () => { while (!stopped && i < items.length) {
            const d = items[i++];
            await fn(d);
        } };
        await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
    };
    // The background fill: list each followee, recompute after each, report progress.
    const fill = (who, followees) => {
        let done = 0;
        const job = parallel(followees, policy.ring2Parallel, async (f) => {
            await syncRepo(f);
            done++;
            compute(who);
            emit('progress', { done, total: followees.length });
        });
        background = background.then(() => job);
        return job;
    };
    const followeesOf = (who) => snaps.get(who)?.follows ?? [];
    return {
        ring: (id) => current[id],
        async load(who) {
            me = who;
            stopped = false;
            for (const s of await store.all())
                snaps.set(s.did, s);
            compute(who);
        },
        async walk(who) {
            await this.load(who);
            log.debug('pds-walker: walk', who);
            await syncRepo(who);
            compute(who);
            void fill(who, followeesOf(who));
        },
        async refresh() {
            if (me === undefined)
                return;
            const who = me;
            stopped = false;
            const mine = snaps.get(who);
            // A `me` with no snapshot yet (its directory or host was unknown at walk time) is always
            // due: refresh is how a transient failure at the root gets retried.
            const dueMe = mine === undefined ? [who] : dueRepos({ snapshots: [mine], now: now(), policy, ring: 'me' });
            const known = followeesOf(who).map((f) => snaps.get(f)).filter((s) => s !== undefined);
            const dueFollowees = dueRepos({ snapshots: known, now: now(), policy, ring: 'fol' });
            const dueList = [...dueMe, ...dueFollowees];
            const movers = [];
            let kept = 0, unknown = 0;
            await parallel(dueList, policy.ring2Parallel, async (d) => {
                const c = await checkRev(d);
                if (c.verdict === 'relist')
                    movers.push({ did: d, pds: c.pds, rev: c.rev });
                else if (c.verdict === 'keep')
                    kept++;
                else if (c.verdict === 'unknown')
                    unknown++;
            });
            const before = new Set(followeesOf(who));
            const byDid = new Map(movers.map((m) => [m.did, m]));
            // ring2Targets dedupes the movers; every target is a mover by construction.
            await parallel(ring2Targets({ moved: movers.map((m) => m.did) }), policy.ring2Parallel, async (d) => {
                const m = byDid.get(d);
                await listRepo(m.did, m.pds, m.rev);
            });
            compute(who);
            log.info('pds-walker: refresh', { due: dueList.length, moved: movers.length, kept, unknown });
            void fill(who, followeesOf(who).filter((f) => !before.has(f)));
        },
        idle: () => background,
        hosts: () => [...hostStates.values()],
        on(event, fn) { listeners[event].add(fn); return () => { listeners[event].delete(fn); }; },
        stop() { stopped = true; log.info('pds-walker: stopped'); },
    };
}
