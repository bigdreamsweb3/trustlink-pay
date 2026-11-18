import { verifiedPayloadForWork, type ReceiverWork } from "../../work-contract";
import { isObject } from "./is-object";
import type { Row } from "./types";
/** Use existing accounting-address fields only; pre-verification work stays unassigned. */
export function recordEpoch(row: Row): string | null {
  if (row.kind === "AUTHORIZED_FUNDING" || row.kind === "TIN_OPERATION") return null;
  const epochs = new Set<string>();
  const candidates: unknown[] = [row.payload?.accountingEpoch, row.authorization?.transition?.accountingEpoch];
  if (row.kind === "SETTLEMENT") {
    const verified = verifiedPayloadForWork(row as ReceiverWork);
    if (isObject(verified?.tcapCreditTransition)) candidates.push(verified!.tcapCreditTransition.accountingEpoch);
  }
  for (const candidate of candidates) if (typeof candidate === "string" && candidate.length > 0) epochs.add(candidate);
  if (epochs.size > 1) throw new Error("TSN_RECEIVER_LOCAL_EPOCH_CONFLICT");
  return epochs.size ? epochs.values().next().value! : null;
}
