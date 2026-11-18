/** Authored work component; transaction boundaries, errors and return values retain the baseline contract. */
import type { WorkDependencies } from "./dependencies";
import { getWork } from "./getWork";
import { projectWorkForNode } from "./projectWorkForNode";
export async function getWorkForNode(dependencies: Pick<WorkDependencies, "decryptPayloadForNode" | "workCollection">, id: string) {
    const work = await getWork(dependencies, id);
    return projectWorkForNode(dependencies, work);
}
