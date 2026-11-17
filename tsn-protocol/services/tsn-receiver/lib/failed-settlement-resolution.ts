import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { db, workCollection } from "./firebase";
import { crankerAuthorizationForWork, nonExecutionContextCommitment, payloadCommitment, type ReceiverWork } from "./work-contract";
import { wakeTsnNode } from "./node-wake";

const TCAP = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const [ROOT, ROOT_BUMP] = PublicKey.findProgramAddressSync([Buffer.from("tcap:commitment-root:v1")], TCAP);
const discriminator = createHash("sha256").update("account:TcapCommitmentRootStateV1").digest().subarray(0, 8);
const fail = (reason: string): never => { throw new Error(`SETTLEMENT_NONEXECUTION_${reason}`); };
const u64 = (value: unknown) => {
  if (!/^[1-9]\d*$/.test(String(value))) return fail("INVALID_CONTEXT");
  const parsed = BigInt(String(value));
  if (parsed > 0xffffffffffffffffn) return fail("INVALID_CONTEXT");
  return parsed;
};
const bankSlot = (value: unknown, minimum: number) => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) < 1) return fail("STALE_RPC_CONTEXT");
  return Number(value);
};

function assertEligible(work: ReceiverWork, funding: ReceiverWork | undefined, expectedVersion: number, signature: string) {
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
      || !Number.isFinite(Date.parse(String(auth.leaseExpiresAt))) || Date.parse(String(auth.leaseExpiresAt)) > Date.now()) fail("INVALID_AUTHORIZATION");
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

async function rpc(method: string, params: unknown[]) {
  const url = process.env.TSN_RPC_URL?.trim() || process.env.TSN_RPC_GATEWAY_URL?.trim() || "https://tsn-rpc-gateway.vercel.app";
  try {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) fail("RPC_UNAVAILABLE");
    const body = await response.json();
    if (body.error || !("result" in body)) fail("RPC_UNAVAILABLE");
    return body.result;
  } catch { return fail("RPC_UNAVAILABLE"); }
}

function assertUnchangedRoot(reply: any, t: Record<string, any>, minimum: number) {
  const slot = bankSlot(reply?.context?.slot, minimum);
  if (BigInt(slot) <= u64(t.expiresAtSlot)) fail("AUTHORIZATION_NOT_EXPIRED");
  const account = reply?.value;
  if (account?.owner !== TCAP.toBase58() || !Array.isArray(account.data) || account.data[1] !== "base64"
      || typeof account.data[0] !== "string") fail("INVALID_ROOT_ACCOUNT");
  const data = Buffer.from(account.data[0], "base64");
  if (data.length !== 124 || data.toString("base64") !== account.data[0] || !data.subarray(0, 8).equals(discriminator)
      || data.readUInt16LE(8) !== 1 || data.readUInt16LE(10) !== 1 || data[123] !== ROOT_BUMP) fail("INVALID_ROOT_ACCOUNT");
  const attempted = u64(t.tcapRootSequence), sequence = data.readBigUInt64LE(80);
  // This monotonic chain checkpoint, not RPC absence, establishes nonexecution.
  if (sequence !== attempted - 1n || !data.subarray(12, 44).equals(Buffer.from(t.previousTcapRoot, "hex"))) fail("ROOT_CHANGED");
  return { finalizedSlot: slot, rootSequence: String(sequence), attemptedSequence: String(attempted), commitmentRoot: ROOT.toBase58(), previousRoot: t.previousTcapRoot };
}

/** Terminal disposition only: keep failed work and all original execution material. */
export async function resolveFailedSettlement(params: { id: string; expectedVersion: number; signature: string; execute: boolean }) {
  if (typeof params.execute !== "boolean") fail("INVALID_REQUEST");
  const ref = workCollection.doc(params.id);
  const work = (await ref.get()).data() as ReceiverWork | undefined;
  if (!work) throw new Error("WORK_NOT_FOUND");
  if (typeof work.payload?.intentId !== "string" || !work.payload.intentId.trim()) fail("FUNDING_REFERENCE_MISMATCH");
  const fundingRef = workCollection.doc(String(work.payload.intentId));
  const funding = (await fundingRef.get()).data() as ReceiverWork | undefined;
  const t = assertEligible(work, funding, params.expectedVersion, params.signature);
  const options = { encoding: "base64", commitment: "finalized" };
  let root = assertUnchangedRoot(await rpc("getAccountInfo", [ROOT.toBase58(), options]), t, 1);
  const receipt = await rpc("getTransaction", [params.signature, { ...options, maxSupportedTransactionVersion: 1 }]);
  if (receipt !== null) fail("RECEIPT_OBSERVED");
  const statuses = await rpc("getSignatureStatuses", [[params.signature], { searchTransactionHistory: true }]);
  const statusSlot = bankSlot(statuses?.context?.slot, root.finalizedSlot);
  if (!Array.isArray(statuses?.value) || statuses.value.length !== 1 || statuses.value[0] !== null) fail("SIGNATURE_OBSERVED");
  // Signature-status context may be a processed bank. Finalized reads pin to
  // the observed finalized root, rather than an ahead-of-finality status slot.
  const validity = await rpc("isBlockhashValid", [work.result!.blockhash, { commitment: "finalized", minContextSlot: root.finalizedSlot }]);
  const validitySlot = bankSlot(validity?.context?.slot, root.finalizedSlot);
  if (validity.value !== false) fail("BLOCKHASH_NOT_EXPIRED");
  const height = await rpc("getBlockHeight", [{ commitment: "finalized", minContextSlot: validitySlot }]);
  if (!Number.isSafeInteger(height) || Number(height) < 1 || BigInt(height) <= u64(work.result!.lastValidBlockHeight)) fail("BLOCKHASH_NOT_EXPIRED");
  root = assertUnchangedRoot(await rpc("getAccountInfo", [ROOT.toBase58(), { ...options, minContextSlot: validitySlot }]), t, validitySlot);
  const evidence = { kind: "EXPIRED_UNCHANGED_ROOT", signature: params.signature, ...root, finalizedBlockHeight: String(height),
    lastValidBlockHeight: String(work.result!.lastValidBlockHeight), authorizationExpiresAtSlot: String(t.expiresAtSlot), blockhash: work.result!.blockhash,
    signatureStatusContextSlot: statusSlot };
  const preview = { id: work.id, status: work.status, stateVersion: work.stateVersion, resolution: evidence, executed: false };
  if (!params.execute) return preview;
  const resolved = await db.runTransaction(async (transaction: any) => {
    const fresh = (await transaction.get(ref)).data() as ReceiverWork;
    const freshFunding = (await transaction.get(fundingRef)).data() as ReceiverWork | undefined;
    if (!fresh) throw new Error("WORK_NOT_FOUND");
    assertEligible(fresh, freshFunding, params.expectedVersion, params.signature);
    if (payloadCommitment(fresh) !== payloadCommitment(work) || payloadCommitment(freshFunding) !== payloadCommitment(funding)) throw new Error("STALE_STATE_VERSION");
    const resolvedAt = new Date().toISOString();
    const resolution = { ...evidence, resolvedAt, previousStateVersion: fresh.stateVersion, resolvedStateVersion: fresh.stateVersion + 1,
      contextCommitment: nonExecutionContextCommitment(fresh), checkpointCommitment: payloadCommitment(fresh.result),
      authorizationCommitment: payloadCommitment(fresh.authorization), verificationCommitment: payloadCommitment(fresh.verification), payloadCommitment: fresh.payloadCommitment,
      fundingWorkId: freshFunding!.id, fundingStateVersion: freshFunding!.stateVersion, fundingSignature: freshFunding!.result!.signature, fundingCommitment: payloadCommitment(freshFunding) };
    transaction.update(ref, { stateVersion: fresh.stateVersion + 1, updatedAt: resolvedAt, nonExecutionResolution: resolution,
      nonExecutionHistory: [...(fresh.nonExecutionHistory ?? []), resolution] });
    return { ...preview, stateVersion: fresh.stateVersion + 1, resolution, executed: true };
  });
  await wakeTsnNode("PRIVATE_CREDIT_NONEXECUTION_RESOLVED");
  return resolved;
}
