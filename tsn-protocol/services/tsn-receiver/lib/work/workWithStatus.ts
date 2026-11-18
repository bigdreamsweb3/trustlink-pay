/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { ReceiverWork, WorkKind, WorkStatus } from "../work-contract";
import type { WorkDependencies } from "./dependencies";
export async function workWithStatus(dependencies: Pick<WorkDependencies, "workCollection">, status: string) {
    const docs = [];
    let after;
    while (true) {
        let query = dependencies.workCollection.where("status", "==", status).orderBy("__name__");
        if (after)
            query = query.startAfter(after);
        const page = await query.limit(200).get();
        docs.push(...page.docs);
        if (page.docs.length < 200)
            break;
        after = page.docs.at(-1);
    }
    return { docs };
}
