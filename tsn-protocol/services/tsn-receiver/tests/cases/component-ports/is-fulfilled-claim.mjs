/** Select successful transactional claims without hiding an inline implementation in the test. */
export function isFulfilledClaim(claim) { return claim.status === "fulfilled"; }
