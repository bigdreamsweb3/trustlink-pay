/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { snapshotWorkData } from "./snapshot-work-data";
import { compareWorkReceivedAt } from "./compare-work-received-at";
export async function listKind(dependencies: Pick<WorkDependencies, "workCollection">, kind: WorkKind) {
    const snapshot = await dependencies.workCollection.where("kind", "==", kind).limit(200).get();
    return snapshot.docs
        .map(snapshotWorkData)
        .sort(compareWorkReceivedAt);
}
