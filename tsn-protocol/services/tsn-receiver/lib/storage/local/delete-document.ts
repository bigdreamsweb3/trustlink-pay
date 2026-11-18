import type { Ref } from "./ref";
import type { Database } from "./types";
export function deleteDocument(reference: Ref, data: Database): void { if (data[reference.collectionPath]) delete data[reference.collectionPath][reference.id]; }
