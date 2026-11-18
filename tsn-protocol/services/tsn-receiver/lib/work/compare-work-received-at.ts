/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
export function compareWorkReceivedAt(left: ReceiverWork, right: ReceiverWork) {
    return left.receivedAt.localeCompare(right.receivedAt);
}
