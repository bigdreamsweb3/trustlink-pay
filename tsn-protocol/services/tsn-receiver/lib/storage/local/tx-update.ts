import type { Ref } from "./ref";
import type { Tx } from "./tx";
import type { Row } from "./types";
export function txUpdate(this: Tx, reference: Ref, patch: Row) {
  const collection = this.data[reference.collectionPath] ??= Object.create(null);
  collection[reference.id] = { ...(collection[reference.id] ?? {}), ...patch };
}
