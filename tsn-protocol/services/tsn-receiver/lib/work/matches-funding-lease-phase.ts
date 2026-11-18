/** Preserve ordinary selection; a fast pass includes only already attached signed funding. */
export function matchesFundingLeasePhase(work: { kind?: unknown; fundingPhase?: unknown }, fundingPhase?: "SIGNED_DEPOSIT"): boolean {
  return fundingPhase === undefined || work.kind === "AUTHORIZED_FUNDING" && work.fundingPhase === fundingPhase;
}
