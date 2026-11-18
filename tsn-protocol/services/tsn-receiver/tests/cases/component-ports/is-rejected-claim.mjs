/** Select failed transactional claims for the replay invariant. */
export function isRejectedClaim(claim) { return claim.status === "rejected"; }
