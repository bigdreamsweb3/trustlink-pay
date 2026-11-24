import type { WorkKind } from "../models";
import { allowlistedEntry } from "./allowlisted-entry";
import { assertSenderFundingBlockhashContext } from "../validation/assert-sender-funding-blockhash-context";
import { tinDebitTransition } from "./tin-debit-transition";

/**
 * Apply current work-specific and nested transition/proof allowlists to verified execution data.
 * Input: the explicit typed parameters below. Output: The existing privacy-filtered Cranker payload.
 * Dependencies: named imports; no service/database initialization.
 * Errors: Missing/invalid funding bank context fails closed; native object-entry errors propagate.
 * Verification: existing Receiver contract/coordination/recovery fixtures; individual branch coverage is unmeasured.
 */
export function crankerExecutionPayload(kind: WorkKind, payload: Record<string, unknown>): Record<string, unknown> {
  if (kind === "TIN_DEBIT") return { tcapTinDebitTransition: tinDebitTransition(payload.tcapTinDebitTransition) };
  if (kind === "AUTHORIZED_FUNDING") assertSenderFundingBlockhashContext(payload.senderFundingBlockhashContext);
  const allowed = kind === "AUTHORIZED_FUNDING"
    ? new Set(["senderSignedFundingTransaction", "senderFundingMode", "senderFundingBlockhashContext"])
    : kind === "TCAP_EPOCH_ACCOUNTING" ? new Set(["tcapEpochAccounting"])
    : kind === "SETTLEMENT"
      ? new Set(["tcapCreditTransition"])
      : kind === "TIN_OPERATION"
      ? new Set([
          "intentId", "intentType", "ownerPubkey", "ownerSignature", "ownerIntentHash", "ownerIntentMessage", "ownerSignatureMessageFormat", "expiry",
          "nonce", "lookupCommitment", "encryptedIdentityEnvelope", "encryptedTinRecovery", "encryptedMasterSeed", "encryptedMetadataHash",
          "routeVersion", "routeNonce", "tipRouteVersion",
          "gpruElgamalKeyVersion", "gpruElgamalPublicKey", "gpruElgamalKeyCommitment",
          "gpruBalanceScanKeyVersion", "gpruBalanceScanPublicKeyX", "gpruBalanceScanPublicKeyY",
          "policyCommitment",
        ])
      : new Set<string>();
  const filtered = Object.fromEntries(Object.entries(payload).filter(allowlistedEntry.bind(null, allowed)));
  if (kind === "SETTLEMENT" && filtered.tcapCreditTransition && typeof filtered.tcapCreditTransition === "object") {
    const transition = filtered.tcapCreditTransition as Record<string, unknown>;
    const allowed = new Set([
      "commitmentRoot", "fundingRootAccount", "previousTcapRoot", "tcapRootSequence", "tokenId", "amountCommitment", "accountingEpoch", "nullifier",
      "validAfterSlot", "expiresAtSlot", "authorizationDigest", "proof", "memoPayload", "memoBodyPayload", "memoLedgerSlots",
      "memoDocument", "memoCommitment", "successorBalancePoint", "assetEntry", "tcapConfig", "reserveState",
    ]);
    const publicTransition = Object.fromEntries(Object.entries(transition).filter(allowlistedEntry.bind(null, allowed)));
    if (publicTransition.proof && typeof publicTransition.proof === "object" && !Array.isArray(publicTransition.proof)) {
      const allowedProof = new Set(["publicInputs", "proofA", "proofB", "proofC", "actionKind", "tokenId", "amountCommitment", "authorizationCommitment"]);
      publicTransition.proof = Object.fromEntries(Object.entries(publicTransition.proof as Record<string, unknown>).filter(allowlistedEntry.bind(null, allowedProof)));
    }
    filtered.tcapCreditTransition = publicTransition;
  }
  for (const [coordinationKind,field] of [["TCAP_EPOCH_ACCOUNTING","tcapEpochAccounting"]]) {
    const value=filtered[field];
    if(kind!==coordinationKind || !value || typeof value!=="object" || Array.isArray(value))continue;
    const allowed=new Set(["assetEntry","reserveState","tcapConfig","accountingEpoch","total","proof"]);
    const projection=Object.fromEntries(Object.entries(value).filter(allowlistedEntry.bind(null, allowed)));
    if(projection.proof && typeof projection.proof==="object" && !Array.isArray(projection.proof)) {
      const fields=new Set(["publicInputs","proofA","proofB","proofC"]);
      projection.proof=Object.fromEntries(Object.entries(projection.proof).filter(allowlistedEntry.bind(null, fields)));
    }
    filtered[field]=projection;
  }
  return filtered;
}
