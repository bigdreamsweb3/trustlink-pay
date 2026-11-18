/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
export function compareAccountingPriority(a: any, b: any) {
    return Number(b.get("kind") === "TCAP_EPOCH_ACCOUNTING") - Number(a.get("kind") === "TCAP_EPOCH_ACCOUNTING");
}
