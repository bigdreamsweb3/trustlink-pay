/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
export async function getWork(dependencies: Pick<WorkDependencies, "workCollection">, id: string) {
    const snapshot = await dependencies.workCollection.doc(id).get();
    return snapshot.exists ? snapshot.data() as ReceiverWork : null;
}
