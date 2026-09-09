/**
 * Branch order matters and is pinned by the tests: a repo we have never listed is relisted
 * no matter what the rev call said (there is nothing to keep), while a repo we HAVE listed
 * whose rev could not be read is `unknown` — the stored snapshot stands, never shrinks.
 * Revs compare for equality only; "moved or not" is the whole question.
 */
export function decide({ snapshot, latestRev }) {
    if (snapshot === undefined)
        return 'relist';
    if (typeof latestRev !== 'string')
        return 'unknown'; // undefined and { unknown } alike
    return latestRev === snapshot.rev ? 'keep' : 'relist';
}
