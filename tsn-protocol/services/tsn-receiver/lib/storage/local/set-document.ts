import type { Ref } from "./ref";
import type { Database, Row } from "./types";
export function setDocument(reference: Ref, value: Row, data: Database): void { (data[reference.collectionPath] ??= Object.create(null))[reference.id] = value; }
