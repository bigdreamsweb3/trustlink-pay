import type { Dependencies } from "./dependencies";
import type { ReceiverWork } from "../../work-contract";
import type { WorkKind } from "../../work-contract";

/** coordinationInventory component. Inputs and results retain the original private-credit-coordination contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export async function coordinationInventory(dependencies: Pick<Dependencies, "workCollection" | "projectNodeWork">, after = "") {
  if (after.length > 200 || /[\/\x00-\x1f]/.test(after)) throw new Error("PRIVATE_CREDIT_CURSOR_INVALID");
  let query = dependencies.workCollection.orderBy("id");
  if (after) query = query.where("id", ">", after);
  const rows = await query.limit(200).get();
  const kinds: WorkKind[] = ["AUTHORIZED_FUNDING", "SETTLEMENT", "TCAP_EPOCH_ACCOUNTING"];
  const result: ReceiverWork[] = [];
  for (const row of rows.docs) {
    const stored = row.data() as ReceiverWork;
    if (!kinds.includes(stored.kind)) continue;
    const work = stored.kind === "AUTHORIZED_FUNDING" ? dependencies.projectNodeWork(stored) : stored;
    if (work) result.push(work);
  }
  return { work: result, nextCursor: rows.docs.length === 200 ? rows.docs[199].id : null };
}
