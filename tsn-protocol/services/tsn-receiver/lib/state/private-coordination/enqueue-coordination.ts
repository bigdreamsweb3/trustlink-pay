import type { Dependencies } from "./dependencies";
import { createReceivedWork } from "../../work-contract";
import type { WorkKind } from "../../work-contract";
import { createCoordinationWork } from "./create-coordination-work";

/** enqueueCoordination component. Inputs and results retain the original private-credit-coordination contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function enqueueCoordination(dependencies: Pick<Dependencies, "workCollection" | "database">, input: { id: string; kind: WorkKind; payload: Record<string, unknown> }) {
  if (!["TCAP_EPOCH_ACCOUNTING"].includes(input.kind)
      || !/^tcap-epoch-[a-f0-9]{64}$/.test(input.id)) throw new Error("PRIVATE_COORDINATION_KIND_INVALID");
  const work = createReceivedWork(input);
  const ref = dependencies.workCollection.doc(work.id);
  return dependencies.database.runTransaction(createCoordinationWork.bind(null, { ref, work }));
}
