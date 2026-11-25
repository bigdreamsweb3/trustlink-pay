/** A phase-specific claim is restricted to the explicit funding-only Node pass. */
export function assertNodeFundingLeaseFilter(fundingPhase: unknown, supportedKinds: unknown): asserts fundingPhase is "AUTHORIZATION" | "SIGNED_DEPOSIT" | undefined {
  if (fundingPhase === undefined) return;
  if ((fundingPhase !== "SIGNED_DEPOSIT" && fundingPhase !== "AUTHORIZATION") || !Array.isArray(supportedKinds)
      || supportedKinds.length !== 1 || supportedKinds[0] !== "AUTHORIZED_FUNDING") {
    throw new Error("INVALID_NODE_FUNDING_FILTER");
  }
}
