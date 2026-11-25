/** Preserve ordinary selection; each explicit funding phase selects only its own persisted work. */
export function matchesFundingLeasePhase(work: { kind?: unknown; fundingPhase?: unknown }, fundingPhase?: "AUTHORIZATION" | "SIGNED_DEPOSIT"): boolean {
  return fundingPhase === undefined || work.kind === "AUTHORIZED_FUNDING" && work.fundingPhase === fundingPhase;
}
