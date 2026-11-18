import type { Dependencies } from "./dependencies";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { crankerAuthorizationForWork } from "../../work-contract";
import { payloadCommitment } from "../../work-contract";
import type { ReceiverWork } from "../../work-contract";
import { fail } from "./fail";
import { u64 } from "./u64";
import { ROOT } from "./configuration";

/** assertEligible component. Inputs and results retain the original failed-settlement-resolution contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function assertEligible(dependencies: Pick<Dependencies, "clock">, work: ReceiverWork, funding: ReceiverWork | undefined, expectedVersion: number, signature: string) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || expectedVersion >= Number.MAX_SAFE_INTEGER || work.stateVersion !== expectedVersion) throw new Error("STALE_STATE_VERSION");
  if (work.kind !== "SETTLEMENT" || work.status !== "FAILED" || work.nodeLease || work.crankerLease || work.nonExecutionResolution
      || work.authorization?.kind !== "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3"
      || work.verification?.verificationType !== "TSN_TCAP_GPRU_HIDDEN_HEAD_V1") fail("NOT_FAILED_NATIVE_CREDIT");
  const result = work.result;
  if (!result || result.signature !== signature || !/^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(signature)
      || result.stage !== "TCAP_GPRU_MEMO_CREDIT_V2_SIGNED" || !/^[a-f0-9]{64}$/.test(String(result.wireSha256))
      || !Number.isSafeInteger(result.wireBytes) || Number(result.wireBytes) < 170 || Number(result.wireBytes) > 4096) return fail("INVALID_CHECKPOINT");
  try {
    const blockhash = new PublicKey(String(result.blockhash));
    if (blockhash.toBase58() !== result.blockhash || blockhash.equals(PublicKey.default)) fail("INVALID_CHECKPOINT");
  } catch { fail("INVALID_CHECKPOINT"); }
  u64(result.lastValidBlockHeight);
  const auth = work.authorization!;
  if (!Number.isSafeInteger(auth.workStateVersion) || Number(auth.workStateVersion) < 1 || Number(auth.workStateVersion) >= expectedVersion
      || auth.leaseVersion !== auth.workStateVersion || auth.leaseId !== work.id
      || !Number.isFinite(dependencies.clock.parse(String(auth.leaseExpiresAt))) || dependencies.clock.parse(String(auth.leaseExpiresAt)) > dependencies.clock.now()) fail("INVALID_AUTHORIZATION");
  // Reuse the canonical public projection; never revive a historical executor.
  const t = crankerAuthorizationForWork(work, auth).transition as Record<string, any>;
  if (!t || t.commitmentRoot !== ROOT.toBase58() || !/^[a-f0-9]{64}$/.test(String(t.previousTcapRoot))
      || !Array.isArray(t.proof?.publicInputs) || t.proof.publicInputs.length !== 13
      || t.proof.publicInputs[0] !== t.previousTcapRoot || u64(t.expiresAtSlot) < u64(t.validAfterSlot)) fail("INVALID_AUTHORIZATION");
  u64(t.tcapRootSequence);
  if (!funding || funding.kind !== "AUTHORIZED_FUNDING" || funding.status !== "CONFIRMED" || !funding.result?.signature) return fail("FUNDING_NOT_CONFIRMED");
  const id = `settlement-${createHash("sha256").update(`${funding.id}:${funding.payloadCommitment}`).digest("hex").slice(0, 32)}`;
  if (work.id !== id || work.payload.intentId !== funding.id || work.payload.paymentId !== (funding.payload.paymentId ?? funding.id)
      || payloadCommitment(work.payload) !== work.payloadCommitment) fail("FUNDING_REFERENCE_MISMATCH");
  return t;
}
