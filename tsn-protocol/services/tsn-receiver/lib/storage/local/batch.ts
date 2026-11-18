import { batchSet } from "./batch-set";
import { batchDelete } from "./batch-delete";
import { batchCommit } from "./batch-commit";
import type { BatchWrite, StorageContext } from "./types";
export class Batch {
  writes: BatchWrite[] = [];
  set = batchSet; delete = batchDelete; commit = batchCommit;
  constructor(public context: StorageContext) {}
}
