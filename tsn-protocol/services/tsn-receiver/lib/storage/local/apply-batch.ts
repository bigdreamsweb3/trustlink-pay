import type { BatchWrite, Database } from "./types";
export function applyBatch(writes: BatchWrite[], data: Database): void {
  for (const write of writes) {
    const collection = data[write.reference.collectionPath] ??= Object.create(null);
    if (write.operation === "delete") delete collection[write.reference.id];
    else collection[write.reference.id] = write.merge ? { ...(collection[write.reference.id] ?? {}), ...write.value } : write.value;
  }
}
