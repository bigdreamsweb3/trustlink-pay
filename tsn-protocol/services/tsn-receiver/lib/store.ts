import { createHash, randomInt } from "node:crypto";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { workCollection, db } from "./firebase";
import { assertExternalWorkKind, assertAuthorizedFundingIngress, compactAuthorizedFundingVerification, compactVerificationPayload, createReceivedWork, payloadCommitment, verifiedPayloadForWork, type ReceiverWork, type WorkKind, type WorkStatus } from "./work-contract";
import { decryptPayloadForNode, encryptPayloadForNode } from "./node-envelope";
import { assertNodeVerificationAttestation } from "./node-verification";
import { wakeTsnNode } from "./node-wake";
import { publishCrankerWake } from "./cranker-wake";
import { nativeWorkRetryPatch } from "./native-work-retry";
import { snapshotRetryPatch } from "./settlement-retry";

const now = () => new Date().toISOString();

function redactedPaymentPayload(payload: Record<string, unknown>) {
  // The complete ingress envelope is encrypted at receipt and is available
  // only through the authenticated Node projection. Once verification has
  // completed, Firebase retains only the queue reference needed to derive
  // settlement work. Recipient routing stays in the Node's separate, expiring binding.
  return {
    paymentId: String(payload.paymentId ?? ""),
    recipientHash: String(payload.recipientHash ?? ""),
  };
}

function paymentReceiptVerification(work: ReceiverWork) {
  const verified = verifiedPayloadForWork(work);
  if (!verified) return work.verification ?? {};
  const keep = ["paymentId", "tokenMintAddress", "amount"];
  return compactVerificationPayload(work.payload, {
    verificationType: work.verification?.verificationType ?? "TSN_AUTHORIZED_FUNDING",
    ...(work.verification?.nodeAttestation ? { nodeAttestation: work.verification.nodeAttestation } : {}),
    verifiedPayload: Object.fromEntries(
      keep.filter((key) => verified[key] !== undefined).map((key) => [key, verified[key]]),
    ),
  });
}

export async function receive(input: { id?: string; kind: WorkKind; payload: Record<string, unknown> }) {
  assertExternalWorkKind(input.kind);
  if (input.kind === "AUTHORIZED_FUNDING") assertAuthorizedFundingIngress(input.payload);
  const durablePayload = input.kind === "AUTHORIZED_FUNDING"
    ? {
        paymentId: String(input.payload.paymentId), recipientHash: String(input.payload.recipientHash),
        tokenMintAddress: input.payload.tokenMintAddress ?? null,
        amount: input.payload.amount ?? null,
        nodeEncryptedPayload: encryptPayloadForNode(input.payload),
      }
    : input.payload;
  const work = createReceivedWork({ ...input, payload: durablePayload, payloadCommitment: payloadCommitment(input.payload) });
  const ref = workCollection.doc(work.id);
  const settlementId = input.kind === "AUTHORIZED_FUNDING"
    ? `settlement-${createHash("sha256").update(`${work.id}:${work.payloadCommitment}`).digest("hex").slice(0, 32)}`
    : null;
  const settlementRef = settlementId ? workCollection.doc(settlementId) : null;
  const result = await db.runTransaction(async (transaction: any) => {
    const existing = await transaction.get(ref);
    const existingSettlement = settlementRef ? await transaction.get(settlementRef) : null;
    if (existing.exists) {
      const current = existing.data() as ReceiverWork;
      if (current.payloadCommitment !== work.payloadCommitment || current.kind !== work.kind) {
        throw new Error("IDEMPOTENCY_CONFLICT");
      }
      if (settlementRef && !existingSettlement?.exists) {
        transaction.create(settlementRef, createReceivedWork({
          id: settlementId!,
          kind: "SETTLEMENT",
          payload: { paymentId: current.payload.paymentId ?? current.id, intentId: current.id, source: "tsn-receiver-at-ingress" },
        }));
      }
      return { work: current, created: false };
    }
    transaction.create(ref, work);
    if (settlementRef) {
      // Pre-create the settlement record with only a funding-work reference.
      // It stays RECEIVED and therefore cannot be leased by a Cranker until
      // the Node verifies the confirmed funding transaction and marks it VERIFIED.
      transaction.create(settlementRef, createReceivedWork({
        id: settlementId!,
        kind: "SETTLEMENT",
        payload: { paymentId: work.payload.paymentId ?? work.id, intentId: work.id, source: "tsn-receiver-at-ingress" },
      }));
    }
    return { work, created: true };
  });
  // Notify only after the Firestore transaction is durable. The notification
  // contains no payload; the Node re-reads work through its authenticated API.
  if (result.created) {
    await wakeTsnNode(input.kind);
  }
  return result.work;
}

export async function list(status: WorkStatus, limit = 50) {
  const snapshot = await workCollection.where("status", "==", status)
    .orderBy("receivedAt", "asc").limit(Math.min(Math.max(limit, 1), 100)).get();
  return snapshot.docs.map((doc: any) => doc.data() as ReceiverWork);
}

export async function listKind(kind: WorkKind) {
  const snapshot = await workCollection.where("kind", "==", kind).limit(200).get();
  return snapshot.docs
    .map((doc: any) => doc.data() as ReceiverWork)
    .sort((left: ReceiverWork, right: ReceiverWork) => left.receivedAt.localeCompare(right.receivedAt));
}

export async function listRecent(limit = 200) {
  const snapshot = await workCollection.orderBy("receivedAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 200)).get();
  return snapshot.docs.map((doc: any) => doc.data() as ReceiverWork);
}

export async function getWork(id: string) {
  const snapshot = await workCollection.doc(id).get();
  return snapshot.exists ? snapshot.data() as ReceiverWork : null;
}

export async function retrySettlementSnapshot(params: { id: string; expectedVersion: number; requestedBy: string }) {
  const ref = workCollection.doc(params.id);
  const result = await db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    const fundingId = String(current.payload.intentId ?? "");
    if (!fundingId) throw new Error("SETTLEMENT_FUNDING_REFERENCE_MISMATCH");
    const funding = await transaction.get(workCollection.doc(fundingId));
    if (!funding.exists) throw new Error("SETTLEMENT_FUNDING_NOT_CONFIRMED");
    const patch = snapshotRetryPatch(current, funding.data() as ReceiverWork, params.expectedVersion, params.requestedBy);
    // Funding, original payload/commitment and rejection history are preserved.
    // A new Node lease must independently verify chain funding and prove again.
    transaction.update(ref, patch);
    return { id: current.id, status: patch.status, stateVersion: patch.stateVersion };
  });
  await wakeTsnNode("SETTLEMENT_SNAPSHOT_RETRY");
  return result;
}

export async function retryLeasedSettlementFundingRoot(params: { id: string; expectedVersion: number; owner: string; requestedBy: string; reason?: string }) {
  const ref = workCollection.doc(params.id);
  const result = await db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    const fundingId = String(current.payload.intentId ?? "");
    const funding = fundingId ? await transaction.get(workCollection.doc(fundingId)) : null;
    const patch = nativeWorkRetryPatch(current, funding?.exists ? funding.data() as ReceiverWork : null,
      params.expectedVersion, params.owner, params.requestedBy, params.reason ?? "TCAP_FUNDING_ROOT_CHANGED_BEFORE_SETTLEMENT");
    // The original deposit envelope remains on its confirmed funding record.
    // A new Node lease reopens that same note and reconstructs fresh membership.
    transaction.update(ref, patch);
    return { id: current.id, status: patch.status, stateVersion: patch.stateVersion };
  });
  await wakeTsnNode("SETTLEMENT_FUNDED_ROOT_RETRY");
  return result;
}

export async function getWorkForNode(id: string) {
  const work = await getWork(id);
  if (!work) return work;
  if (work.kind === "SETTLEMENT") return work;
  if (work.kind !== "AUTHORIZED_FUNDING") return work;
  const envelope = work.payload.nodeEncryptedPayload;
  // VERIFIED/terminal payment records are deliberately redacted after Node
  // verification. They contain no envelope by design and are safe to return
  // to the authenticated Node for recovery-lineage checks.
  if (!envelope) return work;
  if (typeof envelope !== "object") throw new Error("NODE_PAYLOAD_ENVELOPE_INVALID");
  return { ...work, payload: decryptPayloadForNode(envelope as Parameters<typeof decryptPayloadForNode>[0]) } as ReceiverWork;
}

export async function attachCrankerAuthorization(params: {
  id: string;
  owner: string;
  expectedVersion: number;
  authorization: Record<string, unknown>;
}) {
  const ref = workCollection.doc(params.id);
  return db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    if (current.status !== "CRANKER_LEASED" || current.crankerLease?.owner !== params.owner) throw new Error("LEASE_INVALID");
    if (current.stateVersion !== params.expectedVersion) throw new Error("STALE_STATE_VERSION");
    const lease = current.crankerLease;
    if (!lease || Date.parse(lease.expiresAt) <= Date.now()) throw new Error("LEASE_EXPIRED");
    const authorizationLeaseId = String(params.authorization.leaseId ?? "");
    const authorizationLeaseVersion = Number(params.authorization.leaseVersion ?? 0);
    const authorizationLeaseExpiry = String(params.authorization.leaseExpiresAt ?? "");
    const authorizationExpiryTs = Number(params.authorization.expiresAtTs ?? 0);
    const leaseExpiryTs = Math.floor(Date.parse(lease.expiresAt) / 1000);
    if (authorizationLeaseId !== (lease.leaseId ?? current.id)
        || authorizationLeaseVersion !== Number(lease.version ?? current.stateVersion)
        || authorizationLeaseExpiry !== lease.expiresAt
        || !Number.isFinite(authorizationExpiryTs)
        || authorizationExpiryTs <= Math.floor(Date.now() / 1000)
        || authorizationExpiryTs > leaseExpiryTs) {
      throw new Error("LEASE_AUTHORIZATION_MISMATCH");
    }
    const patch = { authorization: params.authorization, stateVersion: current.stateVersion + 1, updatedAt: now() };
    transaction.update(ref, patch);
    return { ...current, ...patch } as ReceiverWork;
  });
}

async function workWithStatus(status: string) {
  const docs = [];
  let after;
  while (true) {
    let query=workCollection.where("status","==",status).orderBy("__name__");
    if(after) query=query.startAfter(after);
    const page=await query.limit(200).get();
    docs.push(...page.docs);
    if(page.docs.length<200)break;
    after=page.docs.at(-1);
  }
  return {docs};
}

async function lease(
  status: "RECEIVED" | "VERIFIED",
  next: "NODE_VERIFYING" | "CRANKER_LEASED",
  owner: string,
  supportedKinds?: WorkKind[],
) {
  // Requeue abandoned leases before selecting fresh work. This prevents a
  // Node authorization failure or Cranker crash from permanently stranding
  // settlement work in an intermediate state.
  const stale = await workWithStatus(next);
  for (const candidate of stale.docs) {
    const data = candidate.data() as ReceiverWork;
    const leaseValue = next === "NODE_VERIFYING" ? data.nodeLease : data.crankerLease;
    if (!leaseValue || Date.parse(leaseValue.expiresAt) > Date.now()) continue;
    await db.runTransaction(async (transaction: any) => {
      const snapshot = await transaction.get(candidate.ref);
      if (!snapshot.exists || snapshot.get("status") !== next) return;
      const current = snapshot.data() as ReceiverWork;
      const currentLease = next === "NODE_VERIFYING" ? current.nodeLease : current.crankerLease;
      if (currentLease && Date.parse(currentLease.expiresAt) > Date.now()) return;
      transaction.update(candidate.ref, {
        // Once a signed attempt is durable, never rebuild on lease expiry.
        // Its signature must be reconciled even if broadcast was interrupted.
        status: next === "NODE_VERIFYING" ? "RECEIVED"
          : current.result?.signature ? "FAILED" : ["SETTLEMENT","TCAP_FUNDING_POOL","TCAP_EPOCH_ACCOUNTING"].includes(current.kind) ? "RECEIVED" : "VERIFIED",
        stateVersion: current.stateVersion + 1,
        updatedAt: now(),
        nodeLease: null,
        crankerLease: null,
      });
    });
  }
  // Avoid requiring a composite Firestore index for the hot lease path. The
  // bounded result set is ordered locally and remains deterministic.
  const candidates = await workWithStatus(status);
  // Shared groups do not expose funding arrival order as settlement order.
  for (let i = candidates.docs.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [candidates.docs[i], candidates.docs[j]] = [candidates.docs[j], candidates.docs[i]];
  }
  // Pool capture/accounting frees dependent credits before selecting them.
  candidates.docs.sort((a: any, b: any) => Number(b.get("kind") === "TCAP_EPOCH_ACCOUNTING" || b.get("kind") === "TCAP_FUNDING_POOL") - Number(a.get("kind") === "TCAP_EPOCH_ACCOUNTING" || a.get("kind") === "TCAP_FUNDING_POOL"));
  for (const candidate of candidates.docs) {
    if (supportedKinds?.length && !supportedKinds.includes(candidate.get("kind") as WorkKind)) continue;
    if (Date.parse(String(candidate.get("deferredUntil") ?? "")) > Date.now()) continue;
    if (next === "CRANKER_LEASED") {
      const kind = candidate.get("kind") as WorkKind;
      const payload = candidate.get("payload") as Record<string, unknown>;
      const paymentId = kind === "SETTLEMENT" ? payload.intentId : null;
      if (paymentId) {
        const payment = await workCollection.doc(String(paymentId)).get();
        if (!payment.exists || payment.get("kind") !== "AUTHORIZED_FUNDING" || payment.get("status") !== "CONFIRMED") continue;
      }
    }
    if (next === "NODE_VERIFYING" && candidate.get("kind") === "SETTLEMENT") {
      const fundingId = String((candidate.get("payload") as Record<string, unknown>)?.intentId ?? "");
      const funding = fundingId ? await workCollection.doc(fundingId).get() : null;
      if (!funding?.exists || funding.get("kind") !== "AUTHORIZED_FUNDING" || funding.get("status") !== "CONFIRMED") continue;
    }
    const leased = await db.runTransaction(async (transaction: any) => {
      const snapshot = await transaction.get(candidate.ref);
      if (!snapshot.exists || snapshot.get("status") !== status) return null;
      const current = snapshot.data() as ReceiverWork;
      const serial = current.kind === "SETTLEMENT" || current.kind === "TCAP_EPOCH_ACCOUNTING";
      const lockRef = db.collection("tsn_private_credit_locks").doc("global-root");
      if (serial && next === "NODE_VERIFYING") {
        const lock = await transaction.get(lockRef);
        const holderId = lock.exists ? String(lock.get("workId") ?? "") : "";
        const holder = holderId && holderId !== current.id ? await transaction.get(workCollection.doc(holderId)) : null;
        if (holder?.exists) {
          const h = holder.data() as ReceiverWork;
          const active = h.status === "VERIFIED" || h.status === "CRANKER_LEASED" || h.status === "SUBMITTED"
            || (h.status === "FAILED" && Boolean(h.result?.signature))
            || (h.status === "NODE_VERIFYING" && Date.parse(h.nodeLease?.expiresAt ?? "") > Date.now());
          if (active) return null;
        }
        transaction.set(lockRef, { workId: current.id });
      }
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      const patch = {
        status: next,
        stateVersion: current.stateVersion + 1,
        updatedAt: now(),
        ...(next === "NODE_VERIFYING"
          ? { nodeLease: { owner, expiresAt, leaseId: candidate.id, version: current.stateVersion + 1 } }
          : { crankerLease: { owner, expiresAt, leaseId: candidate.id, version: current.stateVersion + 1 } }),
      };
      transaction.update(candidate.ref, patch);
      return { ...current, ...patch } as ReceiverWork;
    });
    if (leased) return leased;
  }
  return null;
}

export const leaseForNode = async (owner: string, supportedKinds?: WorkKind[]) => {
  const work = await lease("RECEIVED", "NODE_VERIFYING", owner, supportedKinds);
  if (!work) return work;
  if (work.kind === "SETTLEMENT") return await getWorkForNode(work.id);
  if (work.kind !== "AUTHORIZED_FUNDING") return work;
  const envelope = work.payload.nodeEncryptedPayload;
  if (!envelope || typeof envelope !== "object") throw new Error("NODE_PAYLOAD_ENVELOPE_MISSING");
  return { ...work, payload: decryptPayloadForNode(envelope as Parameters<typeof decryptPayloadForNode>[0]) } as ReceiverWork;
};
export const leaseForCranker = (owner: string, supportedKinds?: WorkKind[]) =>
  lease("VERIFIED", "CRANKER_LEASED", owner, supportedKinds);

export async function renewNodeLease(params: {
  id: string; owner: string; expectedVersion: number; leaseId: string; leaseVersion: number;
}) {
  const ref = workCollection.doc(params.id);
  return db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    if (current.status !== "NODE_VERIFYING") throw new Error("NODE_LEASE_NOT_ACTIVE");
    if (current.stateVersion !== params.expectedVersion) throw new Error("STALE_STATE_VERSION");
    const lease = current.nodeLease;
    const renewedAt = Date.now();
    if (!lease || lease.owner !== params.owner
        || (lease.leaseId ?? current.id) !== params.leaseId
        || (lease.version ?? current.stateVersion) !== params.leaseVersion
        || !Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= renewedAt) {
      throw new Error("LEASE_INVALID");
    }
    const nodeLease = { ...lease, expiresAt: new Date(renewedAt + 60_000).toISOString() };
    // Renewal preserves the claim generation and signed decision context.
    // Expired, reassigned or completed claims cannot be revived here.
    transaction.update(ref, { nodeLease, updatedAt: new Date(renewedAt).toISOString() });
    return { id: current.id, stateVersion: current.stateVersion, nodeLease };
  });
}

export async function recordSettlementSubmission(params: {
  id: string; owner: string; expectedVersion: number; evidence: Record<string, unknown>;
}) {
  const evidence = params.evidence;
  if (!/^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(String(evidence.signature ?? ""))
      || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(evidence.blockhash ?? ""))
      || !/^\d+$/.test(String(evidence.lastValidBlockHeight ?? ""))
      || !/^[a-f0-9]{64}$/.test(String(evidence.wireSha256 ?? ""))
      || !Number.isSafeInteger(evidence.wireBytes) || Number(evidence.wireBytes) < 1 || Number(evidence.wireBytes) > 4096
      || !["TCAP_GPRU_MEMO_CREDIT_V2_SIGNED", "TCAP_FUNDING_POOL_V1_SIGNED", "TCAP_EPOCH_ACCOUNTING_V1_SIGNED"].includes(String(evidence.stage))) throw new Error("SETTLEMENT_SUBMISSION_INVALID");
  const ref = workCollection.doc(params.id);
  return db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    const stage = { SETTLEMENT:"TCAP_GPRU_MEMO_CREDIT_V2_SIGNED", TCAP_FUNDING_POOL:"TCAP_FUNDING_POOL_V1_SIGNED", TCAP_EPOCH_ACCOUNTING:"TCAP_EPOCH_ACCOUNTING_V1_SIGNED" } as Record<string,string>;
    if (!stage[current.kind] || evidence.stage !== stage[current.kind] || current.status !== "CRANKER_LEASED"
        || current.authorization?.kind !== (current.kind === "SETTLEMENT" ? "TSN_TCAP_GPRU_CREDIT_AUTHORIZATION_V3" : "TSN_TCAP_COORDINATION_AUTHORIZATION_V1")) throw new Error("SETTLEMENT_SUBMISSION_NOT_LEASED");
    if (current.stateVersion !== params.expectedVersion) throw new Error("STALE_STATE_VERSION");
    const lease = current.crankerLease;
    if (!lease || lease.owner !== params.owner || !Number.isFinite(Date.parse(lease.expiresAt))
        || Date.parse(lease.expiresAt) <= Date.now()) throw new Error("LEASE_INVALID");
    const result = Object.fromEntries(["signature", "blockhash", "lastValidBlockHeight", "wireSha256", "wireBytes", "stage"].map(key => [key, evidence[key]]));
    if (current.result && Object.keys(current.result).length) {
      if (payloadCommitment(current.result) !== payloadCommitment(result)) throw new Error("SETTLEMENT_SUBMISSION_ALREADY_RECORDED");
      return { id: current.id, stateVersion: current.stateVersion, signature: result.signature };
    }
    // Receipt checkpoint, not a new lease/authorization generation.
    transaction.update(ref, { result, updatedAt: now() });
    return { id: current.id, stateVersion: current.stateVersion, signature: result.signature };
  });
}

export async function transition(params: {
  id: string;
  actor: "node" | "cranker";
  owner: string;
  expectedVersion: number;
  status: WorkStatus;
  evidence?: Record<string, unknown>;
}) {
  const ref = workCollection.doc(params.id);
  const result = await db.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("WORK_NOT_FOUND");
    const current = snapshot.data() as ReceiverWork;
    // A response can be lost after Firestore commits (for example when a
    // hosted function briefly loses its upstream connection).  Allow the
    // Cranker to safely replay the same terminal report instead of turning a
    // successful on-chain submission into a false failure.  The signature is
    // the idempotency key for on-chain work; it is never accepted for a
    // different terminal status.
    if (params.actor === "cranker" && current.status === params.status) {
      const currentSignature = String(current.result?.signature ?? "");
      const reportedSignature = String(params.evidence?.signature ?? "");
      if (currentSignature && reportedSignature && currentSignature === reportedSignature) {
        return { work: current, fundingConfirmed: false };
      }
    }
    const lease = params.actor === "node" ? current.nodeLease : current.crankerLease;
    if (!lease || lease.owner !== params.owner || Date.parse(lease.expiresAt) <= Date.now()) {
      throw new Error("LEASE_INVALID");
    }
    if (current.stateVersion !== params.expectedVersion) throw new Error("STALE_STATE_VERSION");
    if (params.actor === "cranker" && current.result?.signature
        && params.evidence?.signature !== current.result.signature) throw new Error("SETTLEMENT_SUBMISSION_SIGNATURE_MISMATCH");
    if (params.actor === "node" && (params.status === "VERIFIED" || params.status === "REJECTED")) {
      assertNodeVerificationAttestation({
        work: current,
        owner: params.owner,
        expectedVersion: params.expectedVersion,
        status: params.status,
        evidence: params.evidence,
      });
    }
    const allowed = params.actor === "node"
      ? ["VERIFIED", "REJECTED"]
      : ["SUBMITTED", "CONFIRMED", "FAILED"];
    if (!allowed.includes(params.status)) throw new Error("INVALID_TRANSITION");
    const patch = {
      status: params.status,
      stateVersion: current.stateVersion + 1,
      updatedAt: now(),
      ...(params.actor === "node"
        ? {
            verification: params.status === "VERIFIED" && params.evidence?.verifiedPayload
              ? current.kind === "AUTHORIZED_FUNDING"
                ? compactAuthorizedFundingVerification(redactedPaymentPayload(current.payload), params.evidence)
                : compactVerificationPayload(current.payload, params.evidence)
              : params.evidence ?? {},
            nodeLease: null,
            ...(current.kind === "AUTHORIZED_FUNDING"
              ? { payload: { ...redactedPaymentPayload(current.payload), ...(current.payload.nodeEncryptedPayload ? { nodeEncryptedPayload: current.payload.nodeEncryptedPayload } : {}) } }
              : {}),
          }
        : {
            result: params.evidence ?? {},
            crankerLease: null,
            // The signed handoff transaction is needed only until funding has
            // confirmed. Keep a compact receipt context thereafter.
            ...(params.status === "CONFIRMED" && current.kind === "AUTHORIZED_FUNDING"
              ? { verification: paymentReceiptVerification(current) }
              : {}),
            // A payout authorization contains the recipient wallet and is
            // short-lived work material, not a permanent settlement record.
            ...(params.status === "CONFIRMED" && current.kind === "SETTLEMENT"
              ? { authorization: null }
              : {}),
          }),
    };
    const fundingConfirmed = params.actor === "cranker"
      && current.kind === "AUTHORIZED_FUNDING"
      && params.status === "CONFIRMED";
    transaction.update(ref, patch);
    return { work: { ...current, ...patch } as ReceiverWork, fundingConfirmed };
  });
  // Node verification is the point at which Cranker work becomes leaseable.
  // Publish a fresh control-only wake after the Firestore transition commits;
  // the first ingress wake may have arrived before verification completed.
  if (params.actor === "node" && params.status === "VERIFIED") {
    await publishCrankerWake("VERIFIED");
  }
  if (result.fundingConfirmed || (params.actor === "cranker" && params.status === "CONFIRMED" && ["SETTLEMENT", "TCAP_FUNDING_POOL", "TCAP_EPOCH_ACCOUNTING"].includes(result.work.kind))) {
    // Funding confirmation is a trigger only. The Node independently checks
    // the chain transaction before it verifies the pre-created settlement.
    await wakeTsnNode("AUTHORIZED_FUNDING");
  }
  return result.work;
}
