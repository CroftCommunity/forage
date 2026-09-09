// The pure core of pds-walker: rings from repo snapshots (plan 2026-09-08 § Phase 2a).
// No I/O, no clock, no async — everything a ring needs is in the snapshots handed in, so
// this file is testable in isolation and portable to a worker or a Node script.
export const RING_IDS = Object.freeze(['me', 'mut', 'fol', 'hop', 'hop2']);
function index(snapshots) {
    return snapshots instanceof Map
        ? snapshots
        : new Map(snapshots.map((s) => [s.did, s]));
}
// A ring is a set of members plus the snapshots it was read from. "unknown is not empty":
// a source that is missing lowers `complete` and is left out of `asOf`; it never shrinks
// the membership below what the present sources say.
function ring(id, members, sources) {
    const present = sources.filter((s) => s !== undefined);
    const asOf = present.length === 0 ? 0 : present.reduce((min, s) => Math.min(min, s.fetchedAt), Infinity);
    return Object.freeze({ id, members, asOf, complete: present.length === sources.length });
}
/**
 * Compute all five rings for `me` from whatever snapshots are known. Each ring contains the
 * tighter ones by construction, so `me ⊂ mut ⊂ fol ⊂ hop ⊂ hop2` always holds.
 */
export function rings({ me, snapshots }) {
    const byDid = index(snapshots);
    const mine = byDid.get(me);
    const follows = mine?.follows ?? [];
    const followeeSnaps = follows.map((f) => byDid.get(f));
    // A mutual is a followee whose snapshot lists me — so every mutual HAS a snapshot, by
    // construction; resolving them here keeps the hop union free of an unreachable branch.
    const mutualSnaps = followeeSnaps.filter((s) => s !== undefined && s.follows.includes(me));
    const mutuals = mutualSnaps.map((s) => s.did);
    const meSet = new Set([me]);
    const mutSet = new Set([...meSet, ...mutuals]);
    const folSet = new Set([...mutSet, ...follows]);
    const hopSet = new Set([...folSet, ...mutualSnaps.flatMap((s) => s.follows)]);
    const hop2Set = new Set([...hopSet, ...follows.flatMap((f) => byDid.get(f)?.follows ?? [])]);
    const graph = [mine, ...followeeSnaps];
    return Object.freeze({
        me: ring('me', meSet, [mine]),
        mut: ring('mut', mutSet, graph),
        fol: ring('fol', folSet, [mine]),
        hop: ring('hop', hopSet, graph),
        hop2: ring('hop2', hop2Set, graph),
    });
}
