import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { workCollection, db } from "./firebase";
import { createReceivedWork, type ReceiverWork, type WorkKind, type WorkStatus } from "./work-contract";
import { wakeTsnNode } from "./node-wake";
import { publishCrankerWake } from "./cranker-wake";

const now = () => new Date().toISOString();

export async function receive(input: { id?: string; kind: WorkKind; payload: Record<string, unknown> }) {
  const work = createReceivedWork(input);
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
  // claim/recovery work in an intermediate state.
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
      const paymentId = kind === "CLAIM" ? payload.intentId : kind === "RECOVERY" ? payload.paymentId : null;
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
          ? { nodeLease: { owner, expiresAt } }
          : { crankerLease: { owner, expiresAt } }),
      };
      transaction.update(candidate.ref, patch);
      return { ...current, ...patch } as ReceiverWork;
    });
    if (leased) return leased;
  }
  return null;
}

export const leaseForNode = (owner: string, supportedKinds?: WorkKind[]) =>
  lease("RECEIVED", "NODE_VERIFYING", owner, supportedKinds);
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
        ? { verification: params.evidence ?? {}, nodeLease: null }
        : { result: params.evidence ?? {}, crankerLease: null }),
    };
    transaction.update(ref, patch);
    return { ...current, ...patch } as ReceiverWork;
  });
  // Node verification is the point at which Cranker work becomes leaseable.
  // Publish a fresh control-only wake after the Firestore transition commits;
  // the first ingress wake may have arrived before verification completed.
  if (params.actor === "node" && params.status === "VERIFIED") {
    await publishCrankerWake("VERIFIED");
  }
  return result;
}
