import { Ref } from "./ref";
import { Snap } from "./snap";
import type { Tx } from "./tx";
import type { Query } from "./query";
export async function txGet(this: Tx, reference: Ref | Query) { return reference instanceof Ref ? new Snap(reference.id, this.data[reference.collectionPath]?.[reference.id] ?? null) : reference.evaluateSnapshot(this.data); }
