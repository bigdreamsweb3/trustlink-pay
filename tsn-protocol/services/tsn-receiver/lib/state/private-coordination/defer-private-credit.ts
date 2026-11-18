import type { Dependencies } from "./dependencies";
import { deferCoordinationWork } from "./defer-coordination-work";

/** deferPrivateCredit component. Inputs and results retain the original private-credit-coordination contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function deferPrivateCredit(dependencies: Pick<Dependencies, "workCollection" | "database" | "clock">, input: { id: string; owner: string; expectedVersion: number; seconds: number }) {
  if (!Number.isSafeInteger(input.seconds) || input.seconds < 1 || input.seconds > 60) throw new Error("INVALID_DEFERRAL");
  const ref = dependencies.workCollection.doc(input.id);
  return dependencies.database.runTransaction(deferCoordinationWork.bind(null, dependencies, { ref, input }));
}
