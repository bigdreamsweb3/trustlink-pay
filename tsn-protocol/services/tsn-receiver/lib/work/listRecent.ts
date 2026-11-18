/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
import { snapshotWorkData } from "./snapshot-work-data";
export async function listRecent(dependencies: Pick<WorkDependencies, "workCollection">, limit = 200) {
    const snapshot = await dependencies.workCollection.orderBy("receivedAt", "desc")
        .limit(Math.min(Math.max(limit, 1), 200)).get();
    return snapshot.docs.map(snapshotWorkData);
}
