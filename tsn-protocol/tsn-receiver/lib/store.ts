import { createHash } from "node:crypto";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { workCollection, db } from "./firebase";
import { assertExternalWorkKind, assertPaymentIntentIngress, createReceivedWork, payloadCommitment, type ReceiverWork, type WorkKind, type WorkStatus } from "./work-contract";
import { decryptPayloadForNode, encryptPayloadForNode } from "./node-envelope";
import { wakeTsnNode } from "./node-wake";
import { publishCrankerWake } from "./cranker-wake";

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

function paymentReceiptVerification(verification: Record<string, unknown> | null | undefined) {
  const payload = verification?.verifiedPayload;
  if (!payload || typeof payload !== "object") return verification ?? {};
  const verified = payload as Record<string, unknown>;
  const keep = [
    "paymentId",
    "tokenMintAddress",
    "amount",
    "privacyVersion",
    "transferId",
    "commitmentHash",
    "settlementEpoch",
    "recipientRouteCommitment",
    "recipientRouteVersion",
  ];
  return {
    verificationType: verification?.verificationType ?? "TSN_PAYMENT_INTENT",
    verifiedPayload: Object.fromEntries(
      keep.filter((key) => verified[key] !== undefined).map((key) => [key, verified[key]]),
    ),
  };
}

export async function receive(input: { id?: string; kind: WorkKind; payload: Record<string, unknown> }) {
  assertExternalWorkKind(input.kind);
  if (input.kind === "PAYMENT_INTENT") assertPaymentIntentIngress(input.payload);
  const durablePayload = input.kind === "PAYMENT_INTENT"
    ? {
        paymentId: String(input.payload.paymentId), recipientHash: String(input.payload.recipientHash),
        privacyVersion: input.payload.privacyVersion ?? null, tokenMintAddress: input.payload.tokenMintAddress ?? null,
        amount: input.payload.amount ?? null, recipientRouteCommitment: input.payload.recipientRouteCommitment ?? null,
        recipientRouteVersion: input.payload.recipientRouteVersion ?? null,
        nodeEncryptedPayload: encryptPayloadForNode(input.payload),
      }
    : input.payload;
  const work = createReceivedWork({ ...input, payload: durablePayload, payloadCommitment: payloadCommitment(input.payload) });
  const ref = workCollection.doc(work.id);
  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      const current = existing.data() as ReceiverWork;
      if (current.payloadCommitment !== work.payloadCommitment || current.kind !== work.kind) {
        throw new Error("IDEMPOTENCY_CONFLICT");
      }
      return { work: current, created: false };
    }
    transaction.create(ref, work);
    return { work, created: true };
  });
  // Notify only after the Firestore transaction is durable. The notification
  // contains no payload; the Node re-reads work through its authenticated API.
  if (result.created) {
    await Promise.all([wakeTsnNode(input.kind), publishCrankerWake(input.kind)]);
  }
  return result.work;
}

export async function list(status: WorkStatus, limit = 50) {
  const snapshot = await workCollection.where("status", "==", status)
    .orderBy("receivedAt", "asc").limit(Math.min(Math.max(limit, 1), 100)).get();
  return snapshot.docs.map((doc) => doc.data() as ReceiverWork);
}

export async function listKind(kind: WorkKind) {
  const snapshot = await workCollection.where("kind", "==", kind).limit(200).get();
  return snapshot.docs
    .map((doc) => doc.data() as ReceiverWork)
    .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
}

export async function listRecent(limit = 200) {
  const snapshot = await workCollection.orderBy("receivedAt", "desc")
    .limit(Math.min(Math.max(limit, 1), 200)).get();
  return snapshot.docs.map((doc) => doc.data() as ReceiverWork);
}

export async function getWork(id: string) {
  const snapshot = await workCollection.doc(id).get();
  return snapshot.exists ? snapshot.data() as ReceiverWork : null;
}

export async function getWorkForNode(id: string) {
  const work = await getWork(id);
  if (!work || work.kind !== "PAYMENT_INTENT") return work;
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
  return db.runTransaction(async (transaction) => {
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

async function lease(
  status: "RECEIVED" | "VERIFIED",
  next: "NODE_VERIFYING" | "CRANKER_LEASED",
  owner: string,
  supportedKinds?: WorkKind[],
) {
  // Requeue abandoned leases before selecting fresh work. This prevents a
  // Node authorization failure or Cranker crash from permanently stranding
  // settlement work in an intermediate state.
  const stale = await workCollection.where("status", "==", next).limit(50).get();
  for (const candidate of stale.docs) {
    const data = candidate.data() as ReceiverWork;
    const leaseValue = next === "NODE_VERIFYING" ? data.nodeLease : data.crankerLease;
    if (!leaseValue || Date.parse(leaseValue.expiresAt) > Date.now()) continue;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(candidate.ref);
      if (!snapshot.exists || snapshot.get("status") !== next) return;
      const current = snapshot.data() as ReceiverWork;
      const currentLease = next === "NODE_VERIFYING" ? current.nodeLease : current.crankerLease;
      if (currentLease && Date.parse(currentLease.expiresAt) > Date.now()) return;
      transaction.update(candidate.ref, {
        status: next === "NODE_VERIFYING" ? "RECEIVED" : "VERIFIED",
        stateVersion: current.stateVersion + 1,
        updatedAt: now(),
        nodeLease: null,
        crankerLease: null,
      });
    });
  }
  // Avoid requiring a composite Firestore index for the hot lease path. The
  // bounded result set is ordered locally and remains deterministic.
  const candidates = await workCollection.where("status", "==", status).limit(50).get();
  candidates.docs.sort((left, right) =>
    String(left.get("receivedAt") ?? "").localeCompare(String(right.get("receivedAt") ?? "")),
  );
  for (const candidate of candidates.docs) {
    if (supportedKinds?.length && !supportedKinds.includes(candidate.get("kind") as WorkKind)) continue;
    if (next === "CRANKER_LEASED") {
      const kind = candidate.get("kind") as WorkKind;
      const payload = candidate.get("payload") as Record<string, unknown>;
      const paymentId = kind === "SETTLEMENT" ? payload.intentId : null;
      if (paymentId) {
        const payment = await workCollection.doc(String(paymentId)).get();
        if (!payment.exists || payment.get("kind") !== "PAYMENT_INTENT" || payment.get("status") !== "CONFIRMED") continue;
      }
    }
    const leased = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(candidate.ref);
      if (!snapshot.exists || snapshot.get("status") !== status) return null;
      const current = snapshot.data() as ReceiverWork;
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
  if (!work || work.kind !== "PAYMENT_INTENT") return work;
  const envelope = work.payload.nodeEncryptedPayload;
  if (!envelope || typeof envelope !== "object") throw new Error("NODE_PAYLOAD_ENVELOPE_MISSING");
  return { ...work, payload: decryptPayloadForNode(envelope as Parameters<typeof decryptPayloadForNode>[0]) } as ReceiverWork;
};
export const leaseForCranker = (owner: string, supportedKinds?: WorkKind[]) =>
  lease("VERIFIED", "CRANKER_LEASED", owner, supportedKinds);

export async function transition(params: {
  id: string;
  actor: "node" | "cranker";
  owner: string;
  expectedVersion: number;
  status: WorkStatus;
  evidence?: Record<string, unknown>;
}) {
  const ref = workCollection.doc(params.id);
  const result = await db.runTransaction(async (transaction) => {
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
        return { work: current, settlementCreated: false };
      }
    }
    const lease = params.actor === "node" ? current.nodeLease : current.crankerLease;
    if (!lease || lease.owner !== params.owner || Date.parse(lease.expiresAt) <= Date.now()) {
      throw new Error("LEASE_INVALID");
    }
    if (current.stateVersion !== params.expectedVersion) throw new Error("STALE_STATE_VERSION");
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
            verification: params.evidence ?? {},
            nodeLease: null,
            ...(current.kind === "PAYMENT_INTENT"
              ? { payload: redactedPaymentPayload(current.payload) }
              : {}),
          }
        : {
            result: params.evidence ?? {},
            crankerLease: null,
            // The signed handoff transaction is needed only until funding has
            // confirmed. Keep a compact receipt context thereafter.
            ...(params.status === "CONFIRMED" && current.kind === "PAYMENT_INTENT"
              ? { verification: paymentReceiptVerification(current.verification) }
              : {}),
            // A payout authorization contains the recipient wallet and is
            // short-lived work material, not a permanent settlement record.
            ...(params.status === "CONFIRMED" && current.kind === "SETTLEMENT"
              ? { authorization: null }
              : {}),
          }),
    };
    // A SETTLEMENT is a consequence of a verified and funded payment; it is not an
    // ingress object that a sender or frontend may create. Create it in the
    // same Firestore transaction as the Cranker CONFIRMED transition so there
    // can never be a settlement without the payment's verified evidence and result.
    let settlementCreated = false;
    if (params.actor === "cranker" && current.kind === "PAYMENT_INTENT" && params.status === "CONFIRMED") {
      const verificationType = String(current.verification?.verificationType ?? "").trim();
      if (!verificationType) throw new Error("PAYMENT_INTENT_NOT_NODE_VERIFIED");
      const settlementId = `settlement-${createHash("sha256").update(`${current.id}:${current.payloadCommitment}`).digest("hex").slice(0, 32)}`;
      const settlementRef = workCollection.doc(settlementId);
      const settlementSnapshot = await transaction.get(settlementRef);
      if (!settlementSnapshot.exists) {
        const settlementPayload = {
          paymentId: current.payload.paymentId ?? current.id,
          intentId: current.id,
          recipientHash: String(current.payload.recipientHash ?? ""),
          source: "tsn-receiver-after-node-verification",
        };
        transaction.create(settlementRef, createReceivedWork({
          id: settlementId,
          kind: "SETTLEMENT",
          payload: settlementPayload,
        }));
        settlementCreated = true;
      } else {
        const existingSettlement = settlementSnapshot.data() as ReceiverWork;
        if (existingSettlement.kind !== "SETTLEMENT" || String(existingSettlement.payload.intentId ?? "") !== current.id) {
          throw new Error("SETTLEMENT_IDEMPOTENCY_CONFLICT");
        }
      }
    }
    transaction.update(ref, patch);
    return { work: { ...current, ...patch } as ReceiverWork, settlementCreated };
  });
  // Node verification is the point at which Cranker work becomes leaseable.
  // Publish a fresh control-only wake after the Firestore transition commits;
  // the first ingress wake may have arrived before verification completed.
  if (params.actor === "node" && params.status === "VERIFIED") {
    await publishCrankerWake("VERIFIED");
  }
  if (result.settlementCreated) {
    // The settlement is now durable and leaseable; the Node receives the control
    // wake first so it can verify/authorize the settlement before a Cranker
    // attempts to lease it.
    await Promise.all([wakeTsnNode("SETTLEMENT"), publishCrankerWake("SETTLEMENT")]);
  }
  return result.work;
}
