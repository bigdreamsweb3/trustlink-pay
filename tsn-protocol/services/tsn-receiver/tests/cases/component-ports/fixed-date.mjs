/** Construct the same Date values while retaining a fixed zero-argument clock for deterministic lease tests. */
export function fixedDate(now, value) { return new Date(value === undefined ? now : value); }
