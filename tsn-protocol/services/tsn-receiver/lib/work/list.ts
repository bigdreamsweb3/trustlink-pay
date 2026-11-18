/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { snapshotWorkData } from "./snapshot-work-data";
export async function list(dependencies: Pick<WorkDependencies, "workCollection">, status: WorkStatus, limit = 50) {
    const snapshot = await dependencies.workCollection.where("status", "==", status)
        .orderBy("receivedAt", "asc").limit(Math.min(Math.max(limit, 1), 100)).get();
    return snapshot.docs.map(snapshotWorkData);
}
