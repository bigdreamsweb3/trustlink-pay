import { publicCoordinationPayload, type ReceiverWork } from "./work-contract";

const status = (work: ReceiverWork) => {
  if (["RECEIVED", "NODE_VERIFYING", "VERIFIED", "CRANKER_LEASED"].includes(work.status)) return "pending";
  if (work.status === "REJECTED") return "canceled";
  if (work.status === "CONFIRMED") return "executed";
  return work.status.toLowerCase();
};

export function publicIntent(work: ReceiverWork) {
  return { ...publicCoordinationPayload(work), id: work.id, status: status(work), postedAt: work.receivedAt, updatedAt: work.updatedAt, receiverStatus: work.status, receiverStateVersion: work.stateVersion, ...(work.result ?? {}) };
}
