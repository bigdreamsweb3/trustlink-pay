import type { ReceiverWork } from "../models";

/** Expose only staged coordination metadata; owner-specific preparation remains behind Node authorization. */
export function publicFundingReadiness(work: ReceiverWork): Record<string, unknown> {
  if (work.kind !== "AUTHORIZED_FUNDING" || !work.fundingPhase) return {};
  return {
    fundingPhase: work.fundingPhase, stateVersion: work.stateVersion,
    authorizationPayloadCommitment: work.authorizationPayloadCommitment,
    fundingReady: work.status === "FUNDING_READY",
    fundingReadiness: work.fundingReadiness ? { expiresAt: work.fundingReadiness.expiresAt, authorizationPayloadCommitment: work.fundingReadiness.authorizationPayloadCommitment } : null,
  };
}
