import type { Dependencies } from "./dependencies";
import type { ReceiverWork } from "../../work-contract";
import { fail } from "./fail";
import { assertEligible } from "./assert-eligible";
import { assertUnchangedRoot } from "./assert-unchanged-root";
import { rpc } from "./rpc";
import { bankSlot } from "./bank-slot";
import { u64 } from "./u64";
import { recordNonexecutionResolution } from "./record-nonexecution-resolution";
import { ROOT } from "./configuration";

/** resolveFailedSettlement component. Inputs and results retain the original failed-settlement-resolution contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function resolveFailedSettlement(dependencies: Pick<Dependencies, "workCollection" | "database" | "wakeNode" | "clock" | "environment" | "fetch">, params: { id: string; expectedVersion: number; signature: string; execute: boolean }) {
  if (typeof params.execute !== "boolean") fail("INVALID_REQUEST");
  const ref = dependencies.workCollection.doc(params.id);
  const work = (await ref.get()).data() as ReceiverWork | undefined;
  if (!work) throw new Error("WORK_NOT_FOUND");
  if (typeof work.payload?.intentId !== "string" || !work.payload.intentId.trim()) fail("FUNDING_REFERENCE_MISMATCH");
  const fundingRef = dependencies.workCollection.doc(String(work.payload.intentId));
  const funding = (await fundingRef.get()).data() as ReceiverWork | undefined;
  const t = assertEligible(dependencies, work, funding, params.expectedVersion, params.signature);
  const options = { encoding: "base64", commitment: "finalized" };
  let root = assertUnchangedRoot(await rpc(dependencies, "getAccountInfo", [ROOT.toBase58(), options]), t, 1);
  const receipt = await rpc(dependencies, "getTransaction", [params.signature, { ...options, maxSupportedTransactionVersion: 1 }]);
  if (receipt !== null) fail("RECEIPT_OBSERVED");
  const statuses = await rpc(dependencies, "getSignatureStatuses", [[params.signature], { searchTransactionHistory: true }]);
  const statusSlot = bankSlot(statuses?.context?.slot, root.finalizedSlot);
  if (!Array.isArray(statuses?.value) || statuses.value.length !== 1 || statuses.value[0] !== null) fail("SIGNATURE_OBSERVED");
  // Signature-status context may be a processed bank. Finalized reads pin to
  // the observed finalized root, rather than an ahead-of-finality status slot.
  const validity = await rpc(dependencies, "isBlockhashValid", [work.result!.blockhash, { commitment: "finalized", minContextSlot: root.finalizedSlot }]);
  const validitySlot = bankSlot(validity?.context?.slot, root.finalizedSlot);
  if (validity.value !== false) fail("BLOCKHASH_NOT_EXPIRED");
  const height = await rpc(dependencies, "getBlockHeight", [{ commitment: "finalized", minContextSlot: validitySlot }]);
  if (!Number.isSafeInteger(height) || Number(height) < 1 || BigInt(height) <= u64(work.result!.lastValidBlockHeight)) fail("BLOCKHASH_NOT_EXPIRED");
  root = assertUnchangedRoot(await rpc(dependencies, "getAccountInfo", [ROOT.toBase58(), { ...options, minContextSlot: validitySlot }]), t, validitySlot);
  const evidence = { kind: "EXPIRED_UNCHANGED_ROOT", signature: params.signature, ...root, finalizedBlockHeight: String(height),
    lastValidBlockHeight: String(work.result!.lastValidBlockHeight), authorizationExpiresAtSlot: String(t.expiresAtSlot), blockhash: work.result!.blockhash,
    signatureStatusContextSlot: statusSlot };
  const preview = { id: work.id, status: work.status, stateVersion: work.stateVersion, resolution: evidence, executed: false };
  if (!params.execute) return preview;
  const resolved = await dependencies.database.runTransaction(recordNonexecutionResolution.bind(null, dependencies, { ref, fundingRef, params, work, funding, evidence, preview }));
  await dependencies.wakeNode("PRIVATE_CREDIT_NONEXECUTION_RESOLVED");
  return resolved;
}
