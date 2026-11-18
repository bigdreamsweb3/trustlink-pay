import type { Ref } from "./ref";
import type { Tx } from "./tx";
import type { Row } from "./types";
export function txSet(this: Tx, reference: Ref, value: Row, options?: { merge?: boolean }) {
  const collection = this.data[reference.collectionPath] ??= Object.create(null);
  collection[reference.id] = options?.merge ? { ...(collection[reference.id] ?? {}), ...value } : value;
}
