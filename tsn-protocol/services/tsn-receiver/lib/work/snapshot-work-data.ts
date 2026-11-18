/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
export function snapshotWorkData(doc: any) {
    return doc.data() as ReceiverWork;
}
