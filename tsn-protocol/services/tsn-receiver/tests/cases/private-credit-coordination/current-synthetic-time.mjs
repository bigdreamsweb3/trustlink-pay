/** Freeze queue eligibility time in this isolated worker; filesystem throughput must not expire deferred records. */
export function currentSyntheticTime(timestamp) { return timestamp; }
