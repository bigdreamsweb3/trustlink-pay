import type { Ref } from "./ref";
import type { Database, Row } from "./types";
export function createDocument(reference: Ref, value: Row, data: Database): void {
  const collection = data[reference.collectionPath] ??= Object.create(null);
  if (collection[reference.id]) throw new Error("ALREADY_EXISTS");
  collection[reference.id] = value;
}
