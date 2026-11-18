import type { BatchPort, SnapshotPort } from "../../storage/ports";

/** Stage one stale rate reference in the caller's batch without committing it. */
export function deleteStaleRateDocument(batch: BatchPort, document: Pick<SnapshotPort, "ref">) {
  batch.delete(document.ref);
}
