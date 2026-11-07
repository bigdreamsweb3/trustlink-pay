import { createHash, createPublicKey, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { db, workCollection } from "./firebase";
import { payloadCommitment, type ReceiverWork } from "./work-contract";
import { wakeTsnNode } from "./node-wake";

const TSNP = new PublicKey("TSN31jddtsmUg4D5aEdhY31nwB1e53VJJg9X8NoRP8V");
const TCAP = new PublicKey("tCaP5R8LZFL1ridm3JCAtiqFzNnZCQYj3Hb7kw42YZF");
const TIP = new PublicKey("TinseNnU588NkmRZBe4ADJbxqrqQma92678UFP6VuwT");
const GPRU = new PublicKey("6XsdcNRG7SkSceLduXmEvbrpCqgHfM6oj12Qx49o1hVR");
const pda = (seed: string, program: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from(seed)], program)[0];
const hash = (value: string) => createHash("sha256").update(value).digest();
const bytes = (value: unknown, length: number) => {
  if (typeof value !== "string" || !new RegExp(`^[a-fA-F0-9]{${length * 2}}$`).test(value)) throw new Error("SETTLEMENT_RECONCILIATION_INVALID_TRANSITION");
  return Buffer.from(value, "hex");
};
const integer = (value: unknown, length: number) => {
  if (!/^\d+$/.test(String(value))) throw new Error("SETTLEMENT_RECONCILIATION_INVALID_TRANSITION");
  const buffer = Buffer.alloc(length); let number = BigInt(String(value));
  for (let i = 0; i < length; i++) { buffer[i] = Number(number & 255n); number >>= 8n; }
  if (number) throw new Error("SETTLEMENT_RECONCILIATION_INVALID_TRANSITION");
  return buffer;
};

function assertEligible(work: ReceiverWork, funding: ReceiverWork | null, expectedVersion: number, reportOwner?: string) {
  const native = work.kind === "SETTLEMENT";
  const expectedKind = native ? "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3" : "TSN_TCAP_COORDINATION_AUTHORIZATION_V1";
  const expectedStage = {SETTLEMENT:"TCAP_GPRU_MEMO_CREDIT_V2_SIGNED",TCAP_FUNDING_POOL:"TCAP_FUNDING_POOL_V1_SIGNED",TCAP_EPOCH_ACCOUNTING:"TCAP_EPOCH_ACCOUNTING_V1_SIGNED"}[work.kind as "SETTLEMENT"|"TCAP_FUNDING_POOL"|"TCAP_EPOCH_ACCOUNTING"];
  if (!expectedStage) throw new Error("SETTLEMENT_RECONCILIATION_KIND_INVALID");
  if (reportOwner) {
    const auth = work.authorization;
    const expiry = Date.parse(String(auth?.leaseExpiresAt ?? ""));
    if (work.nodeLease || auth?.kind !== expectedKind
        || !Number.isSafeInteger(expectedVersion) || auth.workStateVersion !== expectedVersion - 1
        || auth.leaseVersion !== auth.workStateVersion || auth.leaseId !== work.id
        || !Number.isFinite(expiry) || expiry > Date.now()
        || work.result?.stage !== expectedStage || !work.result.signature) {
      throw new Error("SETTLEMENT_LATE_REPORT_NOT_ELIGIBLE");
    }
    if (work.status === "CRANKER_LEASED") {
      if (work.stateVersion !== expectedVersion || work.crankerLease?.owner !== reportOwner
          || work.crankerLease.expiresAt !== auth.leaseExpiresAt) throw new Error("SETTLEMENT_LATE_REPORT_NOT_ELIGIBLE");
    } else if (work.status !== "FAILED" || work.stateVersion !== expectedVersion + 1 || work.crankerLease) {
      throw new Error("SETTLEMENT_LATE_REPORT_NOT_ELIGIBLE");
    }
  } else {
    if (work.stateVersion !== expectedVersion) throw new Error("STALE_STATE_VERSION");
    if (work.status !== "FAILED" || work.nodeLease || work.crankerLease
        || work.authorization?.kind !== expectedKind) throw new Error("SETTLEMENT_RECONCILIATION_NOT_FAILED_NATIVE_CREDIT");
  }
  if (!native) { if (payloadCommitment(work.payload) !== work.payloadCommitment) throw new Error("PRIVATE_COORDINATION_PAYLOAD_MISMATCH"); return; }
  if (!funding || funding.kind !== "AUTHORIZED_FUNDING" || funding.status !== "CONFIRMED" || !funding.result?.signature) throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
  const id = `settlement-${hash(`${funding.id}:${funding.payloadCommitment}`).toString("hex").slice(0, 32)}`;
  if (work.id !== id || work.payload.intentId !== funding.id || payloadCommitment(work.payload) !== work.payloadCommitment) throw new Error("SETTLEMENT_FUNDING_REFERENCE_MISMATCH");
}

/** Match the immutable finalized V1 wire against the entire authorized credit and Memo. */
export function assertSettlementReceipt(work: ReceiverWork, signature: string, receipt: any, mother: any, root: any, reportOwner?: string) {
  const t = work.authorization?.transition as Record<string, any>;
  const coordination = work.kind === "TCAP_FUNDING_POOL" || work.kind === "TCAP_EPOCH_ACCOUNTING";
  if (!t || (!coordination && !t.proof) || receipt?.meta?.err !== null || receipt.version !== 1 || !Number.isSafeInteger(receipt.slot)
      || !Array.isArray(receipt.transaction) || receipt.transaction[1] !== "base64") throw new Error("SETTLEMENT_RECEIPT_NOT_SUCCESSFUL_V1");
  if (work.result?.signature && work.result.signature !== signature) throw new Error("SETTLEMENT_SUBMISSION_SIGNATURE_MISMATCH");
  const wire = Buffer.from(receipt.transaction[0], "base64");
  if (wire.length > 4096 || wire[0] !== 0x81 || wire[1] !== 2 || wire.length < 170) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
  const message = wire.subarray(0, -128);
  const mask = message.readUInt32LE(4), count = message[41];
  if (message[40] !== (coordination ? 1 : 2) || mask !== 12 || count < 2 || count > 96) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
  const keys = Array.from({ length: count }, (_, i) => new PublicKey(message.subarray(42 + i * 32, 74 + i * 32)));
  if ((reportOwner && keys[0].toBase58() !== reportOwner)
      || (work.result?.signature && (
      createHash("sha256").update(wire).digest("hex") !== work.result?.wireSha256
      || wire.length !== work.result?.wireBytes
      || new PublicKey(message.subarray(8, 40)).toBase58() !== work.result?.blockhash))) {
    throw new Error("SETTLEMENT_LATE_REPORT_SUBMISSION_MISMATCH");
  }
  let cursor = 42 + count * 32;
  if (message.readUInt32LE(cursor) !== 1_400_000 || message.readUInt32LE(cursor + 4) !== 64 * 1024 * 1024) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
  cursor += 8;
  const headers = Array.from({length: coordination ? 1 : 2}, () => 0).map(() => { const h = { program: message[cursor], count: message[cursor + 1], size: message.readUInt16LE(cursor + 2) }; cursor += 4; return h; });
  const instructions = headers.map(h => {
    const indexes = [...message.subarray(cursor, cursor + h.count)]; cursor += h.count;
    const data = message.subarray(cursor, cursor + h.size); cursor += h.size;
    if (h.program >= count || indexes.some(i => i >= count) || data.length !== h.size) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
    return { program: keys[h.program], keys: indexes.map(i => keys[i]), data };
  });
  if (cursor !== message.length) throw new Error("SETTLEMENT_RECEIPT_INVALID_WIRE");
  // Signatures follow the message in V1. The chain lookup is keyed by the payer signature.
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n; for (const character of signature) { const digit = alphabet.indexOf(character); if (digit < 0) throw new Error("SETTLEMENT_RECEIPT_INVALID_SIGNATURE"); number = number * 58n + BigInt(digit); }
  const sig = Buffer.alloc(64); for (let i = 63; i >= 0; i--) { sig[i] = Number(number & 255n); number >>= 8n; }
  if (number || !sig.equals(wire.subarray(-128, -64))) throw new Error("SETTLEMENT_RECEIPT_INVALID_SIGNATURE");
  for (let i = 0; i < 2; i++) {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), keys[i].toBuffer()]), format: "der", type: "spki" });
    if (!verify(null, message, key, wire.subarray(message.length + i * 64, message.length + (i + 1) * 64))) throw new Error("SETTLEMENT_RECEIPT_INVALID_SIGNATURE");
  }
  const motherData = Buffer.from(mother?.data?.[0] ?? "", "base64");
  if (mother?.owner !== TSNP.toBase58() || !motherData.subarray(0, 8).equals(hash("account:MotherEscrow").subarray(0, 8))) throw new Error("SETTLEMENT_RECEIPT_INVALID_MOTHER");
  const authority = new PublicKey(motherData.subarray(8, 40));
  if (coordination) {
    let expectedKeys: PublicKey[], expected: Buffer, stage: string;
    if (work.kind === "TCAP_FUNDING_POOL") {
      const [pool,poolBump] = PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),new PublicKey(t.assetEntry).toBuffer(),bytes(t.root,32)],TCAP);
      expectedKeys = [authority,pda("tsn_mother_escrow",TSNP),new PublicKey(t.tcapConfig),new PublicKey(t.assetEntry),pda("tcap:funding-root:v1",TCAP),pool,PublicKey.default];
      expected = Buffer.concat([hash("global:seal_private_funding_pool_v1").subarray(0,8),bytes(t.root,32),integer(t.eligibleNoteCount,8),integer(t.sourceWalletCount,2),integer(t.releaseSlot,8)]);
      const d = Buffer.from(root?.data?.[0] ?? "","base64");
      if (root?.owner !== TCAP.toBase58() || d.length !== 113 || !d.subarray(0,8).equals(hash("account:TcapSealedFundingPoolV1").subarray(0,8)) || d.readUInt16LE(8)!==1 || d[10]!==poolBump || !d.subarray(11,43).equals(new PublicKey(t.assetEntry).toBuffer())
          || !d.subarray(47,79).equals(bytes(t.root,32)) || !d.subarray(87,95).equals(integer(t.eligibleNoteCount,8))
          || !d.subarray(95,97).equals(integer(t.sourceWalletCount,2)) || !d.subarray(105,113).equals(integer(t.releaseSlot,8))
          || d.readUInt32LE(43)===0 || d.readBigUInt64LE(87)<2n || d.readUInt16LE(95)<2
          || BigInt(d.readUInt16LE(95))>d.readBigUInt64LE(87) || d.readBigUInt64LE(79)<d.readBigUInt64LE(87)
          || d.readBigUInt64LE(105)<d.readBigUInt64LE(97)) throw new Error("PRIVATE_POOL_RECEIPT_MISMATCH");
      stage = "TCAP_FUNDING_POOL_V1_CONFIRMED";
    } else {
      expectedKeys = [authority,pda("tsn_mother_escrow",TSNP),new PublicKey(t.tcapConfig),new PublicKey(t.assetEntry),new PublicKey(t.reserveState),new PublicKey(t.accountingEpoch),pda("gpru:tcap-epoch-verifier:v1",GPRU),GPRU];
      if (t.proof?.publicInputs?.length !== 5) throw new Error("TCAP_EPOCH_RECEIPT_PROOF_INVALID");
      expected = Buffer.concat([hash("global:account_credit_epoch_v1").subarray(0,8),integer(t.total,8),...t.proof.publicInputs.map((v:unknown)=>bytes(v,32)),bytes(t.proof.proofA,64),bytes(t.proof.proofB,128),bytes(t.proof.proofC,64)]);
      const d = Buffer.from(root?.data?.[0] ?? "","base64");
      if (root?.owner !== TCAP.toBase58() || d.length !== 136 || !d.subarray(0,8).equals(hash("account:TcapCreditEpochV1").subarray(0,8)) || d[135] !== 1 || d.readUInt16LE(8)!==1 || !d.subarray(11,43).equals(new PublicKey(t.assetEntry).toBuffer())
          || !d.subarray(55,87).equals(bytes(t.proof.publicInputs[0],32)) || !d.subarray(87,119).equals(bytes(t.proof.publicInputs[1],32))
          || !bytes(t.proof.publicInputs[2],32).equals(Buffer.concat([Buffer.alloc(24),Buffer.from(integer(t.total,8)).reverse()]))
          || !bytes(t.proof.publicInputs[3],32).equals(Buffer.concat([Buffer.alloc(24),Buffer.from(d.subarray(119,127)).reverse()]))
          || !bytes(t.proof.publicInputs[4],32).equals(Buffer.concat([Buffer.alloc(28),Buffer.from(d.subarray(51,55)).reverse()]))
          || d.readBigUInt64LE(119)<2n || d.readBigUInt64LE(119)>64n || d.readUInt32LE(51)===0) throw new Error("TCAP_EPOCH_RECEIPT_MISMATCH");
      const [epoch,epochBump]=PublicKey.findProgramAddressSync([Buffer.from("tcap:credit-epoch:v1"),new PublicKey(t.assetEntry).toBuffer(),d.subarray(43,51)],TCAP);
      if(epoch.toBase58()!==t.accountingEpoch || d[10]!==epochBump)throw new Error("TCAP_EPOCH_RECEIPT_MISMATCH");
      stage = "TCAP_EPOCH_ACCOUNTING_V1_CONFIRMED";
    }
    assertPermissions(keys, message, authority, expectedKeys, work.kind === "TCAP_FUNDING_POOL"
      ? [expectedKeys[5]] : [expectedKeys[4], expectedKeys[5]], TCAP);
    if (!instructions[0].program.equals(TCAP) || !instructions[0].data.equals(expected) || instructions[0].keys.length !== expectedKeys.length || !instructions[0].keys.every((k,i)=>k.equals(expectedKeys[i]))) throw new Error("PRIVATE_COORDINATION_RECEIPT_AUTHORIZATION_MISMATCH");
    return {signature,stage,slot:receipt.slot,confirmationStatus:"finalized"};
  }
  const expectedKeys = [authority, pda("tsn_mother_escrow", TSNP), TCAP, TSNP,
    pda("tcap:global-config:v1", TCAP), new PublicKey(t.assetEntry), pda("tcap:commitment-root:v1", TCAP), new PublicKey(t.reserveState),
    PublicKey.findProgramAddressSync([Buffer.from("tsn:tcap-authorization:v1"), bytes(t.authorizationDigest, 32)], TSNP)[0],
    pda("tip:route-merkle-root:v1", TIP), pda("gpru:hidden-head-verifier:v1", GPRU),
    new PublicKey("Sysvar1nstructions1111111111111111111111111"), GPRU,
    PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),new PublicKey(t.assetEntry).toBuffer(),bytes(t.proof.publicInputs[12],32)],TCAP)[0],
    new PublicKey(t.accountingEpoch), PublicKey.default];
  if (expectedKeys[6].toBase58() !== t.commitmentRoot || expectedKeys[4].toBase58() !== t.tcapConfig
      || expectedKeys[13].toBase58() !== t.fundingRootAccount) throw new Error("SETTLEMENT_RECEIPT_ACCOUNTS_MISMATCH");
  const proof = t.proof;
  if (!Array.isArray(proof.publicInputs) || proof.publicInputs.length !== 13) throw new Error("SETTLEMENT_RECONCILIATION_INVALID_TRANSITION");
  const expected = Buffer.concat([hash("global:tsn_register_tcap_credit_authorization_v3").subarray(0, 8), bytes(t.authorizationDigest, 32),
    integer(t.validAfterSlot, 8), integer(t.expiresAtSlot, 8), bytes(t.previousTcapRoot, 32), integer(t.tcapRootSequence, 8),
    integer(t.tokenId, 4), bytes(t.amountCommitment, 32), bytes(t.nullifier, 32), ...proof.publicInputs.map((x: unknown) => bytes(x, 32)),
    bytes(proof.proofA, 64), bytes(proof.proofB, 128), bytes(proof.proofC, 64), integer(proof.actionKind, 1), integer(proof.tokenId, 4),
    bytes(proof.amountCommitment, 32), bytes(proof.authorizationCommitment, 32)]);
  assertPermissions(keys, message, authority, expectedKeys, [expectedKeys[6],expectedKeys[14]], TSNP,
    new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"));
  if (!instructions[0].program.equals(TSNP) || !instructions[0].data.equals(expected)
      || instructions[0].keys.length !== expectedKeys.length || !instructions[0].keys.every((k, i) => k.equals(expectedKeys[i]))
      || !keys.slice(0, 2).some(k => k.equals(authority))) throw new Error("SETTLEMENT_RECEIPT_AUTHORIZATION_MISMATCH");
  if (!instructions[1].program.equals(new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"))
      || instructions[1].keys.length !== 1 || !instructions[1].keys[0].equals(keys[0])
      || !instructions[1].data.equals(Buffer.from(String(t.memoPayload), "utf8"))) throw new Error("SETTLEMENT_RECEIPT_MEMO_MISMATCH");
  const rootData = Buffer.from(root?.data?.[0] ?? "", "base64");
  if (root?.owner !== TCAP.toBase58() || rootData.length !== 124 || !rootData.subarray(0, 8).equals(hash("account:TcapCommitmentRootStateV1").subarray(0, 8))
      || rootData.readBigUInt64LE(80) < BigInt(t.tcapRootSequence)) throw new Error("SETTLEMENT_RECEIPT_ROOT_MISMATCH");
  if (rootData.readBigUInt64LE(80) === BigInt(t.tcapRootSequence)
      && (!rootData.subarray(12, 44).equals(bytes(proof.publicInputs[1], 32)) || !rootData.subarray(44, 76).equals(bytes(t.previousTcapRoot, 32)))) throw new Error("SETTLEMENT_RECEIPT_ROOT_MISMATCH");
  return { signature, stage: "TCAP_GPRU_MEMO_CREDIT_V2_CONFIRMED", sequence: String(t.tcapRootSequence),
    authorizationDigest: String(t.authorizationDigest), slot: receipt.slot, confirmationStatus: "finalized" };
}

function assertPermissions(keys: PublicKey[], message: Buffer, authority: PublicKey,
    accounts: PublicKey[], writable: PublicKey[], program: PublicKey, memo?: PublicKey) {
  const expected = new Set([keys[0],...accounts,program,...(memo ? [memo] : [])].map(k=>k.toBase58()));
  const names=keys.map(k=>k.toBase58()), n=keys.length-2-message[3];
  if (message[2] !== 0 || !keys[1].equals(authority) || new Set(names).size !== names.length
      || names.length !== expected.size || names.some(k=>!expected.has(k)) || n<0
      || n !== writable.length || keys.slice(2,2+n).some(k=>!writable.some(v=>v.equals(k)))) {
    throw new Error("SETTLEMENT_RECEIPT_ACCOUNT_PERMISSIONS_MISMATCH");
  }
}

async function rpc(method: string, params: unknown[]) {
  const url = process.env.TSN_RPC_URL?.trim() || process.env.TSN_RPC_GATEWAY_URL?.trim() || "https://tsn-rpc-gateway.vercel.app";
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("SETTLEMENT_RECONCILIATION_RPC_UNAVAILABLE");
  const data = await response.json();
  if (data.error || !data.result) throw new Error("SETTLEMENT_RECONCILIATION_RPC_RECEIPT_UNAVAILABLE");
  return data.result;
}

/** Receipt repair: wake dependent work only after the confirmed state is durable. */
async function reconcileReceipt(params: { id: string; expectedVersion: number; signature: string; execute: boolean }, reportOwner?: string) {
  const ref = workCollection.doc(params.id);
  const work = (await ref.get()).data() as ReceiverWork | undefined;
  if (!work) throw new Error("WORK_NOT_FOUND");
  const funding = work.kind === "SETTLEMENT" ? (await workCollection.doc(String(work.payload.intentId)).get()).data() as ReceiverWork : null;
  if (work.kind === "SETTLEMENT" && !funding) throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
  assertEligible(work, funding, params.expectedVersion, reportOwner);
  if (work.result?.signature && work.result.signature !== params.signature) throw new Error("SETTLEMENT_SUBMISSION_SIGNATURE_MISMATCH");
  const t = work.authorization!.transition as Record<string, any>;
  const [receipt, deposit, mother, root] = await Promise.all([
    rpc("getTransaction", [params.signature, { encoding: "base64", commitment: "finalized", maxSupportedTransactionVersion: 1 }]),
    funding ? rpc("getTransaction", [funding.result!.signature, { encoding: "base64", commitment: "finalized", maxSupportedTransactionVersion: 1 }]) : Promise.resolve(null),
    rpc("getAccountInfo", [pda("tsn_mother_escrow", TSNP).toBase58(), { encoding: "base64", commitment: "finalized" }]),
    rpc("getAccountInfo", [work.kind === "SETTLEMENT" ? t.commitmentRoot : work.kind === "TCAP_EPOCH_ACCOUNTING" ? t.accountingEpoch : PublicKey.findProgramAddressSync([Buffer.from("tcap:sealed-funding:v1"),new PublicKey(t.assetEntry).toBuffer(),bytes(t.root,32)],TCAP)[0].toBase58(), { encoding: "base64", commitment: "finalized" }]),
  ]);
  if (funding && deposit.meta?.err !== null) throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
  const evidence = assertSettlementReceipt(work, params.signature, receipt, mother.value, root.value, reportOwner);
  const preview = { id: work.id, status: work.status, stateVersion: work.stateVersion, receipt: evidence, executed: false };
  if (!params.execute) return preview;
  const repaired = await db.runTransaction(async (transaction: any) => {
    const fresh = (await transaction.get(ref)).data() as ReceiverWork;
    const freshFunding = funding ? (await transaction.get(workCollection.doc(funding.id))).data() as ReceiverWork : null;
    assertEligible(fresh, freshFunding, params.expectedVersion, reportOwner);
    if (receiptContextCommitment(fresh, Boolean(reportOwner)) !== receiptContextCommitment(work, Boolean(reportOwner)) || payloadCommitment(freshFunding) !== payloadCommitment(funding)) throw new Error("STALE_STATE_VERSION");
    const reconciledAt = new Date().toISOString();
    transaction.update(ref, { status: "CONFIRMED", stateVersion: fresh.stateVersion + 1, updatedAt: reconciledAt,
      result: { ...evidence, reconciledAt }, authorization: null, nodeLease: null, crankerLease: null,
      reconciliationHistory: [...((fresh as any).reconciliationHistory ?? []), { ...(reportOwner
        ? { reportedStateVersion: params.expectedVersion, previousStateVersion: fresh.stateVersion, previousStatus: fresh.status, reportedBy: reportOwner }
        : { failedStateVersion: fresh.stateVersion }),
        previousResult: fresh.result, authorizationCommitment: payloadCommitment(fresh.authorization!), reconciledAt, signature: params.signature }] });
    return { ...preview, status: "CONFIRMED", stateVersion: fresh.stateVersion + 1, executed: true };
  });
  await wakeTsnNode("PRIVATE_CREDIT_RECEIPT_RECONCILED");
  return repaired;
}

function receiptContextCommitment(work: ReceiverWork, lateReport: boolean) {
  if (!lateReport) return payloadCommitment(work);
  // Expiry reclamation may change only these coordination fields while RPC runs.
  // Authorization, signed wire identity, funding and all other context stay exact.
  const context = { ...work } as Record<string, unknown>;
  for (const key of ["status", "stateVersion", "updatedAt", "crankerLease"]) delete context[key];
  return payloadCommitment(context);
}

export async function reconcileSettlementReceipt(params: { id: string; expectedVersion: number; signature: string; execute: boolean }) {
  return reconcileReceipt(params);
}

/** Accept only a finalized receipt for the reporting payer's expired signed attempt. */
export async function reconcileExpiredCrankerConfirmation(params: { id: string; owner: string; expectedVersion: number; signature: string }) {
  if (!params.owner) throw new Error("SETTLEMENT_LATE_REPORT_NOT_ELIGIBLE");
  return reconcileReceipt({ ...params, execute: true }, params.owner);
}
